var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var contentSafety = require('../../utils/contentSafety');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var recorderManager = wx.getRecorderManager();
var recorderListenersBound = false;
var activeRecorderPage = null;
var ANALYSIS_STAGES = [
  { title: '先读梦里的画面', detail: '找出人物、场景、动作和真正发生的变化' },
  { title: '把梦中线索排好', detail: '保留你的原话，不替梦补上没有发生的情节' },
  { title: '对照你的长期记录', detail: '只在有具体呼应时，连接你曾经确认过的内容' },
  { title: '结合出生节律', detail: '从另一条线索看这场梦里的气质和行动节奏' },
  { title: '收束成完整解读', detail: '把梦境、个人关联和不同视角整理成一份结果' }
];

// 拖拽阈值：下滑超过 SUBMIT 才判「提交」，上滑超过 CANCEL（绝对值）才判
// 「取消」。ATTEMPT_MIN 是「有效拖拽意图」的下界——低于它视为误触/静止，
// 不给任何反馈；介于 ATTEMPT_MIN 和 SUBMIT 之间视为「拖了但没到位」，
// 松手时要给用户一个明确的信号，而不是像 zone==='none' 一样悄无声息。
var DRAG_SUBMIT_THRESHOLD = 48;
var DRAG_CANCEL_THRESHOLD = 48;
var DRAG_ATTEMPT_MIN = 16;

// Keep this decision independent from Page#setData: touch events can arrive
// faster than rendering updates, while submission must follow the real finger
// position at the moment it is released.
function dragZoneForDelta(dx, dy) {
  if (dy >= DRAG_SUBMIT_THRESHOLD && dy > Math.abs(dx)) return 'submit';
  if (dy <= -DRAG_CANCEL_THRESHOLD && Math.abs(dy) > Math.abs(dx)) return 'cancel';
  if (dy > DRAG_ATTEMPT_MIN && dy > Math.abs(dx)) return 'attempt';
  return 'none';
}

// 震动是锦上添花，绝不能成为依赖：部分机型/基础库版本没有振动能力，或
// 用户拒绝了权限，都会直接走 fail。fail 回调兜底之外再包一层 try/catch，
// 双重保险，任何情况都不能打断录音/拖拽这条主流程。
function triggerVibrate(type) {
  try {
    if (typeof wx === 'undefined' || typeof wx.vibrateShort !== 'function') return;
    var options = { fail: function () {} };
    var supportsType = true;
    if (typeof wx.canIUse === 'function') {
      try {
        supportsType = wx.canIUse('vibrateShort.object.type');
      } catch (probeError) {
        supportsType = false;
      }
    }
    if (type && supportsType) {
      options.type = type;
    }
    wx.vibrateShort(options);
  } catch (error) {
    // 忽略——见上方注释。
  }
}

function voiceFailureMessage(result) {
  var reason = result && result.reason ? String(result.reason) : '';
  if (reason === 'not_configured') return '语音服务未配置，请先用文字记录';
  if (reason === 'cloud_unavailable' || reason === 'cloud_call_failed' || reason === 'cloud_result_expired') {
    return '语音服务暂不可用，请检查网络或先用文字记录';
  }
  if (reason === 'empty_result') return '没有听清，再试一次或直接输入文字';
  if (reason === 'too_long') return '这段语音太长，请控制在 60 秒内';
  if (reason === 'record_permission_denied') return '未获得麦克风权限，请在设置中开启';
  return '语音识别暂不可用，请先用文字记录';
}

function analysisStageForElapsed(elapsedMs) {
  if (elapsedMs < 3200) return 0;
  if (elapsedMs < 8200) return 1;
  if (elapsedMs < 14500) return 2;
  if (elapsedMs < 22500) return 3;
  return 4;
}

function normalizeFactList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(function (item) {
    return String(item || '').trim();
  }).filter(Boolean).slice(0, 6);
}

function normalizeDreamFacts(result) {
  var facts = result && result.dream_facts ? result.dream_facts : {};

  return {
    people: normalizeFactList(facts.people),
    places: normalizeFactList(facts.places),
    objects: normalizeFactList(facts.objects),
    actions: normalizeFactList(facts.actions),
    transitions: normalizeFactList(facts.transitions || facts.events),
    emotions: normalizeFactList(facts.emotions),
    time_sense: normalizeFactList(facts.time_sense || facts.timeSense)
  };
}

function upsertLocalDream(dream) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var next = archive.filter(function (item) {
    return item.id !== dream.id;
  });

  next.unshift(dream);
  wx.setStorageSync('oneiro:dreamArchive', next.slice(0, 30));
}

function nextCardIndex(archive) {
  var storedNext = Number(wx.getStorageSync('oneiro:nextCardNumber') || 1);
  var maxExisting = (Array.isArray(archive) ? archive : []).reduce(function (max, item) {
    var cardNo = item && item.result ? String(item.result.card_no || '') : '';
    var matched = cardNo.match(/(\d+)/);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  var next = Math.max(storedNext, maxExisting + 1, 1);
  wx.setStorageSync('oneiro:nextCardNumber', next + 1);
  return next;
}

// Same lookup as nextCardIndex but read-only, for the "NO. XXX" preview label
// shown above the capture area. Must never consume/advance the counter —
// only the real submission (nextCardIndex, inside generateDreamCard) does.
function peekNextCardIndex(archive) {
  var storedNext = Number(wx.getStorageSync('oneiro:nextCardNumber') || 1);
  var maxExisting = (Array.isArray(archive) ? archive : []).reduce(function (max, item) {
    var cardNo = item && item.result ? String(item.result.card_no || '') : '';
    var matched = cardNo.match(/(\d+)/);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return Math.max(storedNext, maxExisting + 1, 1);
}

function readProfile() {
  var app = getApp();
  var stored = wx.getStorageSync('oneiro:lastProfile') || {};
  var globalProfile = app && app.globalData ? app.globalData.lastProfile || {} : {};

  return {
    nickname: String(stored.nickname || globalProfile.nickname || '').trim(),
    birthDate: String(stored.birthDate || globalProfile.birthDate || '').trim(),
    birthTime: String(stored.birthTime || globalProfile.birthTime || '').trim(),
    birthPlace: String(stored.birthPlace || globalProfile.birthPlace || '').trim(),
    gender: String(stored.gender || globalProfile.gender || '').trim().toLowerCase()
  };
}

function refreshPortraitAfterDream(dream) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  if (!dream || !dream.id) return;
  dreamMemory.refreshPortraitInBackground({
    cloudBase: cloudBase,
    reason: '新增梦境后重新理解你',
    refreshKey: 'dream:' + String(dream.id),
    archive: archive,
    onComplete: function (result) {
      if (result && result.ok) {
        analytics.trackEvent('profile_portrait_auto_draft', { dreamId: dream.id });
      }
    }
  });
}

Page({
  data: {
    fromShare: false,
    dreamText: '',
    recording: false,
    recordingSeconds: 0,
    recognizing: false,
    editingDream: false,
    dragDx: 0,
    dragDy: 0,
    dragZone: 'none',
    dragBounce: false,
    heroCardNo: '',
    heroDate: '',
    analysisActive: false,
    analysisPreview: '',
    analysisStageIndex: 0,
    analysisStageTitle: '',
    analysisStageDetail: '',
    analysisElapsedSeconds: 0,
    analysisStages: ANALYSIS_STAGES
  },

  onLoad: function (options) {
    var pendingDreamText = wx.getStorageSync('oneiro:pendingDreamText') || '';
    var fromShare = !!(options && options.fromShare === '1');
    activeRecorderPage = this;

    this.setData({ fromShare: fromShare });
    analytics.trackEvent(fromShare ? 'share_landing_view' : 'home_view', {});

    if (!recorderListenersBound) {
      recorderManager.onStop(function (result) {
        if (activeRecorderPage) activeRecorderPage.onRecorderStop(result);
      });
      recorderManager.onError(function () {
        if (!activeRecorderPage) return;
        activeRecorderPage.stopRecordingTimer();
        activeRecorderPage.setData({ recording: false, recordingSeconds: 0 });
        analytics.trackEvent('voice_record_error', {});
        wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none', duration: 2500 });
      });
      recorderListenersBound = true;
    }

    if (pendingDreamText) {
      this.setData({ dreamText: pendingDreamText });
    }

    this.refreshHeroLabel();

    if (options && options.autoSubmit && pendingDreamText) {
      var that = this;
      setTimeout(function () { that.generateDreamCard(); }, 0);
    }
  },

  refreshHeroLabel: function () {
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var cardIndex = peekNextCardIndex(archive);
    var now = new Date();
    this.setData({
      heroCardNo: 'NO. ' + String(cardIndex).padStart(3, '0'),
      heroDate: (now.getMonth() + 1) + '月' + now.getDate() + '日'
    });
  },

  onUnload: function () {
    this.submitting = false;
    this.stopAnalysisProgress();
    this.clearVoiceStartTimer();
    if (this.dragBounceTimer) {
      clearTimeout(this.dragBounceTimer);
      this.dragBounceTimer = null;
    }
    this.voiceTouching = false;
    this.stopRecordingTimer();
    if (this.data.recording) {
      try { recorderManager.stop(); } catch (error) {}
    }
    if (activeRecorderPage === this) activeRecorderPage = null;
  },

  startAnalysisProgress: function (dreamText) {
    var that = this;

    this.stopAnalysisProgress();
    this.analysisStartedAt = Date.now();
    this.setData({
      analysisActive: true,
      analysisPreview: String(dreamText || '').trim().slice(0, 72),
      analysisStageIndex: 0,
      analysisStageTitle: ANALYSIS_STAGES[0].title,
      analysisStageDetail: ANALYSIS_STAGES[0].detail,
      analysisElapsedSeconds: 0
    });
    // The mini-program runtime provides setInterval. The lightweight release
    // contract harness does not, so the initial visible stage remains enough
    // for that synchronous test path.
    if (typeof setInterval !== 'function') return;
    this.analysisProgressTimer = setInterval(function () {
      var elapsedMs = Date.now() - that.analysisStartedAt;
      var index = analysisStageForElapsed(elapsedMs);
      var stage = ANALYSIS_STAGES[index];
      that.setData({
        analysisStageIndex: index,
        analysisStageTitle: stage.title,
        analysisStageDetail: stage.detail,
        analysisElapsedSeconds: Math.floor(elapsedMs / 1000)
      });
    }, 700);
  },

  stopAnalysisProgress: function () {
    if (this.analysisProgressTimer && typeof clearInterval === 'function') {
      clearInterval(this.analysisProgressTimer);
      this.analysisProgressTimer = null;
    }
    if (this.data && this.data.analysisActive) {
      this.setData({ analysisActive: false });
    }
  },

  startRecordingTimer: function () {
    var self = this;
    this.stopRecordingTimer();
    this.recordingTimer = setInterval(function () {
      var seconds = Math.floor((Date.now() - self.recordingStartedAt) / 1000);
      self.setData({
        recordingSeconds: Math.min(seconds, 60)
      });
    }, 500);
  },

  stopRecordingTimer: function () {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  },

  beginRecording: function (mode) {
    if (this.data.recording || this.data.recognizing) {
      return;
    }

    var self = this;
    this.voiceStartMode = mode || 'tap';
    wx.authorize({
      scope: 'scope.record',
      success: function () {
        self.startRecorder();
      },
      fail: function () {
        wx.openSetting({
          success: function (setting) {
            if (setting.authSetting && setting.authSetting['scope.record']) {
              self.startRecorder();
            } else wx.showToast({ title: voiceFailureMessage({ reason: 'record_permission_denied' }), icon: 'none' });
          },
          fail: function () {
            wx.showToast({ title: voiceFailureMessage({ reason: 'record_permission_denied' }), icon: 'none' });
          }
        });
      }
    });
  },

  startRecorder: function () {
    var self = this;
    this.recordingStartedAt = Date.now();
    this.setData({
      recording: true,
      recordingSeconds: 0
    });
    this.startRecordingTimer();
    analytics.trackEvent('voice_record_start', { mode: this.voiceStartMode || 'tap' });

    if (this.voiceStopAfterAuthorization) {
      this.voiceStopAfterAuthorization = false;
      setTimeout(function () {
        self.stopRecorder();
      }, 0);
    }

    try {
      recorderManager.start({
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        duration: 60000
      });
    } catch (error) {
      this.stopRecordingTimer();
      this.setData({
        recording: false,
        recordingSeconds: 0
      });
      wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none', duration: 2500 });
    }
  },

  stopRecorder: function () {
    if (!this.data.recording) {
      return;
    }

    this.stopRecordingTimer();
    analytics.trackEvent('voice_record_stop', { seconds: this.data.recordingSeconds });
    try {
      recorderManager.stop();
    } catch (error) {
      this.setData({
        recording: false,
        recordingSeconds: 0
      });
    }
  },

  clearVoiceStartTimer: function () {
    if (this.voiceStartTimer) {
      clearTimeout(this.voiceStartTimer);
      this.voiceStartTimer = null;
    }
  },

  resetDragState: function () {
    this.setData({ dragDx: 0, dragDy: 0, dragZone: 'none', dragBounce: false });
  },

  enterEditingMode: function () {
    this.setData({ editingDream: true });
  },

  onDreamTextTap: function () {
    if (this.data.recording || this.data.recognizing) return;
    this.enterEditingMode();
  },

  onDreamTextBlur: function () {
    // Losing focus only collapses back to the static display — content is
    // preserved, matching the "轻触圆环外收起" hint.
    this.setData({ editingDream: false });
  },

  onVoiceTouchStart: function (event) {
    var self = this;
    var touch = event && event.touches && event.touches[0];

    if (this.data.recognizing) return;

    this.clearVoiceStartTimer();
    this.voiceTouching = true;
    this.voiceLongPressStarted = false;
    this.voiceCancelled = false;
    this.voiceSubmitAfterRecognition = false;
    this.voiceStartX = touch ? touch.clientX : 0;
    this.voiceStartY = touch ? touch.clientY : 0;
    this.lastDragZone = 'none';
    this.voiceDragZone = 'none';
    if (this.dragBounceTimer) {
      clearTimeout(this.dragBounceTimer);
      this.dragBounceTimer = null;
    }
    this.resetDragState();

    // A second touch while recording still acts as the explicit stop control.
    if (this.data.recording) return;

    // Delay the start very slightly so a quick tap can still mean "edit the
    // text" while a held press becomes the primary voice-capture flow.
    this.voiceStartTimer = setTimeout(function () {
      self.voiceStartTimer = null;
      if (!self.voiceTouching || self.data.recording || self.data.recognizing) return;
      self.voiceLongPressStarted = true;
      self.beginRecording('long_press');
    }, 240);
  },

  onVoiceTouchMove: function (event) {
    var touch = event && event.touches && event.touches[0];
    if (!this.voiceTouching || !touch) return;

    var dx = touch.clientX - this.voiceStartX;
    var dy = touch.clientY - this.voiceStartY;
    var zone = dragZoneForDelta(dx, dy);

    // Haptics fire once per edge crossing, never on every touchmove tick —
    // that would turn into a continuous buzz. lastDragZone is the previous
    // frame's zone so we can detect entering/leaving 'submit' and entering
    // 'cancel'.
    var previousZone = this.lastDragZone || 'none';
    if (zone !== previousZone && (zone === 'submit' || previousZone === 'submit' || zone === 'cancel')) {
      triggerVibrate('light');
    }
    this.lastDragZone = zone;
    // This is the synchronous business state. dragZone in data is presentation
    // state only and must not decide what touchend does.
    this.voiceDragZone = zone;

    this.setData({
      // 向下跟手距离压到 28px：圆环下方的确认条只隔 36px，原来放到 56px
      // 会让圆环压到确认条上，两者又都是深墨填充，视觉上糊成一个团块。
      dragDx: Math.max(-36, Math.min(36, dx)),
      dragDy: Math.max(-36, Math.min(28, dy)),
      dragZone: zone
    });
  },

  // Called only when the user dragged down past ATTEMPT_MIN but let go
  // before reaching SUBMIT_THRESHOLD — an "almost" release must never be
  // silent like a plain tap-release is.
  showDragAttemptFeedback: function () {
    wx.showToast({ title: '再往下滑一点，进入解读', icon: 'none', duration: 1400 });
    this.setData({ dragBounce: true });
    var self = this;
    if (this.dragBounceTimer) {
      clearTimeout(this.dragBounceTimer);
    }
    this.dragBounceTimer = setTimeout(function () {
      self.dragBounceTimer = null;
      self.setData({ dragBounce: false });
    }, 320);
  },

  onVoiceTouchEnd: function (event) {
    var touch = event && event.changedTouches && event.changedTouches[0];
    // The final point can differ from the last touchmove (especially on a
    // slow release), so always recalculate from changedTouches when present.
    var zone = touch
      ? dragZoneForDelta(touch.clientX - this.voiceStartX, touch.clientY - this.voiceStartY)
      : (this.voiceDragZone || 'none');
    var wasRecording = this.data.recording;
    // Long-press fired but recorder hasn't actually started yet — the
    // authorize() dialog can still be resolving asynchronously.
    var pendingRecording = this.voiceLongPressStarted && !wasRecording;

    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    this.lastDragZone = 'none';
    this.voiceDragZone = 'none';
    this.resetDragState();
    this.voiceLongPressStarted = false;

    if (zone === 'cancel') {
      if (wasRecording) {
        // True cancel: discard the clip, no toast, no text appended.
        this.voiceCancelled = true;
        this.stopRecorder();
      } else if (pendingRecording) {
        this.voiceCancelled = true;
        this.voiceStopAfterAuthorization = true;
      }
      return;
    }

    if (zone === 'submit') {
      // Instant confirmation right when the threshold-crossing release
      // happens — do not wait on async recognition/interpretation for it.
      triggerVibrate('medium');
      if (wasRecording) {
        this.voiceSubmitAfterRecognition = true;
        this.stopRecorder();
      } else if (pendingRecording) {
        this.voiceSubmitAfterRecognition = true;
        this.voiceStopAfterAuthorization = true;
      } else if (this.data.dreamText.trim()) {
        // Already had a draft and swiped down before the long-press
        // threshold even fired: submit the existing draft directly.
        this.generateDreamCard();
      }
      return;
    }

    if (zone === 'attempt') {
      this.showDragAttemptFeedback();
    }

    // zone === 'none', or a short-of-threshold 'attempt': an ordinary
    // release, no submission — the recording/recognition flow below is
    // unchanged either way.
    if (wasRecording) {
      this.stopRecorder();
      return;
    }
    if (pendingRecording) {
      this.voiceStopAfterAuthorization = true;
      return;
    }
    // Quick tap on the circle (never entered recording): open text editing.
    this.enterEditingMode();
  },

  onVoiceTouchCancel: function () {
    var wasRecording = this.data.recording;
    var pendingRecording = this.voiceLongPressStarted && !wasRecording;

    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    this.lastDragZone = 'none';
    this.voiceDragZone = 'none';
    this.resetDragState();
    this.voiceLongPressStarted = false;

    // A system interruption (incoming call, notification shade, etc.) is
    // treated the same as an explicit cancel — never leave a recording
    // running unattended.
    if (wasRecording) {
      this.voiceCancelled = true;
      this.stopRecorder();
    } else if (pendingRecording) {
      this.voiceCancelled = true;
      this.voiceStopAfterAuthorization = true;
    }
  },

  onRecorderStop: function (result) {
    var self = this;
    var wasCancelled = !!this.voiceCancelled;
    var shouldAutoSubmit = !!this.voiceSubmitAfterRecognition;
    var filePath = result && (result.tempFilePath || result.filePath);
    var duration = result && result.duration
      ? Math.min(Number(result.duration) / 1000, 60)
      : Math.min((Date.now() - this.recordingStartedAt) / 1000, 60);
    var fileSystemManager;

    this.voiceCancelled = false;
    this.voiceSubmitAfterRecognition = false;

    this.stopRecordingTimer();
    this.setData({
      recording: false,
      recordingSeconds: 0
    });

    if (wasCancelled) {
      // Up-swipe cancel: drop the clip entirely, no toast, no leftover text.
      analytics.trackEvent('voice_record_cancelled', {});
      return;
    }

    if (!filePath) {
      wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none', duration: 2500 });
      return;
    }

    fileSystemManager = wx.getFileSystemManager();
    fileSystemManager.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (readResult) {
        self.setData({ recognizing: true });
        cloudBase.speechRecognize(readResult.data, duration, function (recognizeResult) {
          var text;
          var nextText;

          self.setData({ recognizing: false });

          if (!recognizeResult || !recognizeResult.ok || !recognizeResult.text) {
            analytics.trackEvent('voice_recognize_failed', { reason: recognizeResult && recognizeResult.reason ? recognizeResult.reason : 'unknown' });
            wx.showToast({ title: voiceFailureMessage(recognizeResult), icon: 'none', duration: 2800 });
            return;
          }

          text = String(recognizeResult.text).trim();
          nextText = self.data.dreamText
            ? self.data.dreamText + '\n' + text
            : text;
          self.setData({ dreamText: nextText });
          analytics.trackEvent('voice_recognize_success', {
            duration: duration,
            textLength: text.length
          });

          if (shouldAutoSubmit) {
            // Down-swipe submit: recognition succeeded, go straight to
            // interpretation without waiting on any further tap.
            self.generateDreamCard();
          }
        });
      },
      fail: function () {
        self.setData({ recognizing: false });
        analytics.trackEvent('voice_recognize_failed', { reason: 'file_read_failed' });
        wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none', duration: 2500 });
      }
    });
  },

  onShow: function () {
    var pendingDreamText = wx.getStorageSync('oneiro:pendingDreamText') || '';
    var tabParams = tabNav.takeParams('pages/home/index');

    if (tabParams.fromShare) {
      this.setData({ fromShare: true });
      analytics.trackEvent('share_landing_view', {});
    }
    if (pendingDreamText && pendingDreamText !== this.data.dreamText) {
      this.setData({ dreamText: pendingDreamText });
    }
    this.refreshHeroLabel();
  },

  onDreamInput: function (event) {
    this.setData({ dreamText: event.detail.value });
  },

  generateDreamCard: function () {
    var that = this;
    if (this.data.recording || this.data.recognizing) {
      wx.showToast({ title: this.data.recording ? '请先停止录音' : '语音正在识别', icon: 'none' });
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    var dreamText = this.data.dreamText.trim();
    var profile = readProfile();
    var safety = contentSafety.validateDreamText(dreamText);
    // 合并前首页点「保存并解读」发 dream_start、new-dream 自动提交发
    // dream_submit，两者是同一次用户动作。合并后在同一处补齐，保持漏斗口径不变。
    analytics.trackEvent('dream_start', { source: 'home' });
    analytics.trackEvent('dream_submit', {
      length: dreamText.length
    });

    if (!safety.safe) {
      analytics.trackEvent('dream_submit_blocked', {
        reason: safety.message
      });
      if (safety.message.length > 12) {
        wx.showModal({
          title: '暂不生成梦卡',
          content: safety.message,
          confirmText: '知道了',
          showCancel: false
        });
      } else {
        wx.showToast({ title: safety.message, icon: 'none' });
      }
      this.submitting = false;
      return;
    }

    this.startAnalysisProgress(dreamText);

    setTimeout(function () {
      var app = getApp();
      var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
      var cardIndex = nextCardIndex(archive);
      var createdAt = new Date().toISOString();
      var dreamId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      var pendingDream = {
        id: dreamId,
        dreamText: dreamText,
        status: 'pending',
        result: null,
        dreamFacts: {
          people: [], places: [], objects: [], actions: [], transitions: [], emotions: [], time_sense: []
        },
        interpretationSource: '',
        interpretationProvider: '',
        cloudSynced: false,
        interpretationRevision: 1,
        interpretationMeta: {
          schemaVersion: 'dream-entry-v0.2',
          promptVersion: '',
          model: ''
        },
        feedback: '',
        createdAt: createdAt,
        updatedAt: createdAt
      };

      app.globalData.currentDream = pendingDream;
      upsertLocalDream(pendingDream);
      analytics.trackEvent('dream_saved_before_interpretation', {
        dreamId: dreamId,
        length: dreamText.length
      });

      cloudBase.saveDream(pendingDream, function (saveResult) {
        pendingDream.cloudSynced = !!(saveResult && saveResult.ok);
        upsertLocalDream(pendingDream);
        cloudBase.interpretDream(dreamText, profile, cardIndex, function (cloudResult) {
        if (cloudResult && cloudResult.blocked) {
          pendingDream.status = 'blocked';
          pendingDream.interpretationError = cloudResult.reason || 'cloud_safety';
          pendingDream.updatedAt = new Date().toISOString();
          upsertLocalDream(pendingDream);
          cloudBase.saveDream(pendingDream);
          analytics.trackEvent('dream_submit_blocked', {
            reason: cloudResult.reason || 'cloud_safety'
          });
          that.stopAnalysisProgress();
          wx.showModal({
            title: '暂不生成梦卡',
            content: cloudResult.message || '这个梦暂不适合生成分享梦卡。',
            confirmText: '知道了',
            showCancel: false
          });
          that.submitting = false;
          return;
        }

        if (!cloudResult || !cloudResult.ok || !cloudResult.result) {
          pendingDream.status = 'pending';
          pendingDream.result = null;
          pendingDream.interpretationSource = 'cloud';
          pendingDream.interpretationProvider = cloudResult && cloudResult.provider
            ? cloudResult.provider
            : '';
          pendingDream.interpretationError = String(
            cloudResult && (cloudResult.reason || cloudResult.message) || 'ai_provider_error'
          ).slice(0, 300);
          pendingDream.updatedAt = new Date().toISOString();
          app.globalData.currentDream = pendingDream;
          upsertLocalDream(pendingDream);
          cloudBase.saveDream(pendingDream);
          analytics.trackEvent('interpretation_failed', {
            dreamId: dreamId,
            reason: pendingDream.interpretationError,
            retryable: cloudResult ? cloudResult.retryable !== false : true
          });
          cloudBase.flushEvents(analytics.getEvents());
          that.stopAnalysisProgress();
          wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dreamId) });
          that.submitting = false;
          return;
        }

        var result = cloudResult.result;
        var source = 'cloud';
        var provider = cloudResult.provider || 'cloud';
        var dream;

        result.card_no = result.card_no || 'NO. ' + String(cardIndex).padStart(3, '0');
        result.profile_summary = result.profile_summary || '梦境记忆';

        dream = {
          id: dreamId,
          dreamText: dreamText,
          status: 'ready',
          result: result,
          dreamFacts: normalizeDreamFacts(result),
          interpretationSource: source,
          interpretationProvider: provider,
          // The ready payload differs from the earlier pending save, so it
          // must be persisted again before downstream image generation.
          cloudSynced: false,
          interpretationRevision: pendingDream.interpretationRevision,
          interpretationError: cloudResult && !cloudResult.result
            ? String(cloudResult.reason || cloudResult.message || '')
            : '',
          interpretationMeta: {
            schemaVersion: (cloudResult && cloudResult.schemaVersion) || 'dream-entry-v0.2',
            promptVersion: cloudResult.promptVersion || '',
            model: cloudResult.model || '',
            memoryUnavailable: !!cloudResult.memoryUnavailable
          },
          feedback: '',
          createdAt: createdAt,
          updatedAt: new Date().toISOString()
        };

        app.globalData.currentDream = dream;
        upsertLocalDream(dream);
        cloudBase.saveDream(dream, function (saveResult) {
          dream.cloudSynced = !!(saveResult && saveResult.ok);
          upsertLocalDream(dream);
          refreshPortraitAfterDream(dream);
          if (wx.removeStorageSync) {
            wx.removeStorageSync('oneiro:pendingDreamText');
          }
          that.stopAnalysisProgress();
          wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
          that.submitting = false;
        });
        analytics.trackEvent('interpretation_success', {
          dreamId: dream.id,
          symbolCount: result.symbols ? result.symbols.length : 0,
          cardTheme: result.card_theme || 'mist',
          source: source,
          provider: provider
        });
        cloudBase.flushEvents(analytics.getEvents());
        });
      });
    }, 700);
  }
});
