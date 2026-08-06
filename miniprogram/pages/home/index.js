var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var contentSafety = require('../../utils/contentSafety');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var recorderRouter = require('../../utils/recorderRouter');
var syncQueue = require('../../utils/syncQueue');
var ANALYSIS_STAGES = [
  { title: '先读梦里的画面', detail: '找出人物、场景、动作和真正发生的变化' },
  { title: '把梦中线索排好', detail: '保留你的原话，不替梦补上没有发生的情节' },
  { title: '对照你的长期记录', detail: '只在有具体呼应时，连接你曾经确认过的内容' },
  { title: '结合出生节律', detail: '从另一条线索看这场梦里的气质和行动节奏' },
  { title: '收束成完整解读', detail: '把梦境、个人关联和不同视角整理成一份结果' }
];

// 语音的完整状态机（这是唯一的权威描述，改动前先读完）：
//
//   按住圆环 240ms → 进入语音输入，圆环变黑，开始录音
//   之后手指往哪拖都保持录音，直到松手：
//     · 松手时在上方区域（越过 CANCEL 阈值）→ 取消，整段丢弃
//     · 松手时在下方区域（越过 SUBMIT 阈值）→ 转文字后直接进入解读
//     · 其余任何位置松手               → 只转成文字，留在输入区
//
// 关键点：拖拽绝不中断录音。之前有一个「越过 slop 就判定为划、撤掉长按」的
// 分支，结果是按下后马上开始拖的人根本录不上音——按住说话这件事在他手里
// 就是坏的。现在唯一决定录不录的是「按住有没有超过 240ms」，唯一决定拖拽
// 结果的是「松手那一刻手指在哪」。
//
// ATTEMPT_MIN 只用于视觉反馈（落点条提前亮起来告诉用户方向对了），不参与
// 任何业务判定。
//
// 阈值必须等于圆环的跟手上限。原来阈值 48px 而跟手只到 28px：手指走完
// 后 42% 的行程时圆环完全不动，手感上就是「拖不动了、没反应」，用户会以为
// 手势失效而松手——这是这个交互最主要的误会来源。
var DRAG_SUBMIT_THRESHOLD = 40;
var DRAG_CANCEL_THRESHOLD = 40;
var DRAG_ATTEMPT_MIN = 14;
// 超过这个位移就不再把这一下算作「原地轻触」，松手时不弹键盘。它只影响没有
// 起录音的那条快速滑动路径，不影响长按判定。
var DRAG_TAP_SLOP = 12;

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

// 一次录音要真的能被识别出内容，实际下限大约在 1 秒。低于这个值送到 ASR
// 只会拿回 empty_result，用户看到的是「没有听清」——听上去像识别不准，其实
// 是根本没录到东西。所以在客户端就拦下来，并说清楚是「太短」。
var MIN_RECORD_MS = 1000;
// 录音器 start 之后需要一点时间真正开始采集。长按 240ms 触发、用户紧接着
// 松手的场景下，start 和 stop 可能落在同一帧里，产出 0 字节文件或直接报错。
// 这时把 stop 推迟到这个下限之后再执行，用户说的那半句话才不会凭空消失。
var MIN_RECORD_LIFETIME_MS = 600;

function voiceFailureMessage(result) {
  var reason = result && result.reason ? String(result.reason) : '';
  if (reason === 'not_configured') return '语音服务未配置，请先用文字记录';
  if (reason === 'client_timeout' || reason === 'recognize_timeout') return '识别等待超时，请检查网络后重试';
  if (reason === 'cloud_unavailable' || reason === 'cloud_call_failed' || reason === 'cloud_result_expired') {
    return '语音服务暂不可用，请检查网络或先用文字记录';
  }
  if (reason === 'empty_result') return '没有听清，再试一次或直接输入文字';
  if (reason === 'too_short') return '说得太短了，按住多说一会儿';
  if (reason === 'too_long') return '这段语音太长，请控制在 60 秒内';
  if (reason === 'record_permission_denied') return '未获得麦克风权限，请在设置中开启';
  if (reason === 'invalid_audio') return '这段录音没保存成，再按住说一次';
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

// 云函数没返回 memoryEcho（旧版本云函数、或走了降级分支）时给出 0/0，
// 这样诊断页的分母只统计真正上报过这个信号的解读。
function normalizeMemoryEcho(value) {
  var echo = value && typeof value === 'object' ? value : {};
  var offered = Number(echo.offered);
  var used = Number(echo.used);
  return {
    offered: isFinite(offered) && offered > 0 ? offered : 0,
    used: isFinite(used) && used > 0 ? used : 0
  };
}

function normalizeInterpretationDiagnostics(response) {
  var value = response || {};
  var nested = value.diagnostics && typeof value.diagnostics === 'object' ? value.diagnostics : {};
  return {
    code: String(value.errorCode || value.error_code || value.providerErrorCode || nested.code || value.reason || '').slice(0, 80),
    provider: String(value.provider || nested.provider || '').slice(0, 80),
    model: String(value.model || nested.model || '').slice(0, 120),
    requestTimeoutMs: Number(value.requestTimeoutMs || nested.requestTimeoutMs || 0),
    elapsedMs: Number(value.elapsedMs || nested.elapsedMs || 0),
    providerError: String(value.provider_error || nested.providerError || '').slice(0, 240)
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
    voicePressed: false,
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
    this.pageActive = true;
    recorderRouter.register(this);

    this.setData({ fromShare: fromShare });
    analytics.trackEvent(fromShare ? 'share_landing_view' : 'home_view', {});

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
    this.pageActive = false;
    if (this.submitTimer) {
      clearTimeout(this.submitTimer);
      this.submitTimer = null;
    }
    this.submitting = false;
    this.stopAnalysisProgress();
    this.clearVoiceStartTimer();
    this.voiceTouching = false;
    this.stopRecorderForExit();
    recorderRouter.unregister(this);
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
        if (self.pageActive !== false) self.startRecorder();
      },
      fail: function () {
        wx.openSetting({
          success: function (setting) {
            if (setting.authSetting && setting.authSetting['scope.record'] && self.pageActive !== false) {
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

    // 手指已经离开了，才等到授权弹窗返回——第一次使用的用户几乎必然走到这里。
    // 原来的做法是照常 start 再立刻 stop，录到的是一个 0 长度的文件，用户看到
    // 的是「语音识别暂不可用」，把一次成功的授权读成了功能坏掉。现在不启动
    // 录音，只告诉他权限已经拿到、再按一次即可。
    if (this.voiceStopAfterAuthorization) {
      this.voiceStopAfterAuthorization = false;
      var cancelled = this.voiceCancelled;
      var wantedSubmit = this.voiceSubmitAfterRecognition;
      this.voiceCancelled = false;
      this.voiceSubmitAfterRecognition = false;
      analytics.trackEvent('voice_record_skipped_after_authorize', { cancelled: !!cancelled });
      if (cancelled) return;
      // 下滑提交的意图不能因为中间插了一次授权就丢掉：已经有草稿就照常提交。
      if (wantedSubmit && String(this.data.dreamText || '').trim()) {
        this.generateDreamCard();
        return;
      }
      wx.showToast({ title: '麦克风已开启，再按住圆环说一次', icon: 'none', duration: 2400 });
      return;
    }

    this.recordingStartedAt = Date.now();
    this.setData({
      recording: true,
      recordingSeconds: 0
    });
    this.startRecordingTimer();
    analytics.trackEvent('voice_record_start', { mode: this.voiceStartMode || 'tap' });

    try {
      recorderRouter.start({
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
    var self = this;
    var elapsed;

    if (!this.data.recording || this.stopScheduled) {
      return;
    }

    // 录音器刚 start 就 stop 会拿到 0 字节文件。把 stop 推迟到采集真正开始
    // 之后再执行，用户那半句话才录得进去；这段时间里 recording 仍为 true，
    // 波形继续动，用户不会以为按钮没反应。
    elapsed = Date.now() - (this.recordingStartedAt || 0);
    if (elapsed < MIN_RECORD_LIFETIME_MS) {
      this.stopScheduled = true;
      setTimeout(function () {
        self.stopScheduled = false;
        self.stopRecorder();
      }, MIN_RECORD_LIFETIME_MS - elapsed);
      return;
    }

    this.stopRecordingTimer();
    analytics.trackEvent('voice_record_stop', { seconds: this.data.recordingSeconds });
    try {
      recorderRouter.stop();
    } catch (error) {
      this.setData({
        recording: false,
        recordingSeconds: 0
      });
    }
  },

  stopRecorderForExit: function () {
    this.stopScheduled = false;
    if (!this.data.recording) return;
    this.stopRecordingTimer();
    this.setData({ recording: false, recordingSeconds: 0 });
    try { recorderRouter.stopForExit(this); } catch (error) {}
  },

  clearVoiceStartTimer: function () {
    if (this.voiceStartTimer) {
      clearTimeout(this.voiceStartTimer);
      this.voiceStartTimer = null;
    }
  },

  resetDragState: function () {
    this.setData({ dragDx: 0, dragDy: 0, dragZone: 'none', voicePressed: false });
  },

  enterEditingMode: function () {
    this.setData({ editingDream: true });
  },

  onDreamTextTap: function () {
    if (this.data.recording || this.data.recognizing) return;
    this.enterEditingMode();
  },

  // 圆环下方按钮的点击入口。和「按住下滑」走同一个 generateDreamCard，
  // 只是把提交这件事从一个需要被教会的手势，变成一个看得见的按钮。
  onSubmitTap: function () {
    if (this.data.recording || this.data.recognizing) return;
    if (!String(this.data.dreamText || '').trim()) {
      wx.showToast({ title: '还没有内容，按住圆环说一句', icon: 'none' });
      return;
    }
    analytics.trackEvent('dream_submit_gesture', { via: 'tap' });
    this.generateDreamCard();
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
    this.voiceMoved = false;
    this.resetDragState();
    // 按下的那一刻就要有反馈。长按判定需要等 240ms，这段时间里如果圆环一动
    // 不动，控件读起来是「死的」。
    this.setData({ voicePressed: true });

    // 正常流程下录音只在手指按住期间存在，所以走不到这里。真的走到了（录音器
    // 因为某种原因还挂着），这一次按下就作为兜底的停止控制：不再起新的长按
    // 计时器，松手时由下面的 wasRecording 分支收尾。
    if (this.data.recording) return;

    // 按住超过 240ms 就是「按住说」，此后拖拽只决定松手时怎么处理，不再影响
    // 录不录。低于 240ms 松手才算轻触。
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

    // 只用来区分「原地轻触」和「滑了一下」，决定松手时要不要弹键盘。绝不能
    // 用它去撤销长按计时器：按下就开始拖的人本来就是要说话的。
    if (Math.abs(dx) > DRAG_TAP_SLOP || Math.abs(dy) > DRAG_TAP_SLOP) {
      this.voiceMoved = true;
    }

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
      // 跟手上限与判定阈值严格相等：手指到达阈值的那一刻，圆环恰好走到落点
      // 条边缘。中间不存在「手指还在动、圆环已经不动」的死区。
      dragDx: Math.max(-DRAG_SUBMIT_THRESHOLD, Math.min(DRAG_SUBMIT_THRESHOLD, dx)),
      dragDy: Math.max(-DRAG_CANCEL_THRESHOLD, Math.min(DRAG_SUBMIT_THRESHOLD, dy)),
      dragZone: zone
    });
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
    var wasVoiceGesture = wasRecording || pendingRecording;
    var hadMoved = !!this.voiceMoved;

    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    this.lastDragZone = 'none';
    this.voiceDragZone = 'none';
    this.resetDragState();
    this.voiceLongPressStarted = false;
    this.voiceMoved = false;

    // ── 这一下是「按住说话」：录音一直在跑，松手的位置决定怎么收尾 ──
    if (wasVoiceGesture) {
      if (zone === 'cancel') {
        // 整段丢弃，不转文字、不提示——用户要的就是当它没发生过。
        this.voiceCancelled = true;
      } else if (zone === 'submit') {
        // 越过阈值松手的那一刻就给确认反馈，不等异步的识别和解读。
        triggerVibrate('medium');
        // 手势和按钮上报同一个事件、只区分 via，这样「有多少人真的学会了下滑」
        // 是一个可以直接查的数字，而不是靠猜。
        analytics.trackEvent('dream_submit_gesture', { via: 'swipe' });
        this.voiceSubmitAfterRecognition = true;
      }
      // 其余位置（含拖了但没到位）一律只转成文字。这里刻意不再弹「再往下滑
      // 一点」——录音已经正常收下并开始识别，此时提示「没划到位」会让人以为
      // 刚说的话丢了；而且现在圆环下面就有一个可以直接点的解读按钮。
      if (wasRecording) this.stopRecorder();
      else this.voiceStopAfterAuthorization = true;
      return;
    }

    // ── 这一下没到长按时长，不是语音 ──
    if (zone === 'submit' && this.data.dreamText.trim()) {
      triggerVibrate('medium');
      analytics.trackEvent('dream_submit_gesture', { via: 'swipe' });
      this.generateDreamCard();
      return;
    }
    // 滑了一下但没构成任何动作：安静收场。绝不能在这里弹键盘——用户刚做的是
    // 一个滑动手势，突然弹出输入法是完全无关的反馈。
    if (hadMoved || zone !== 'none') return;
    // 原地轻触圆环：打开文字输入。
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
    this.voiceMoved = false;

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

    this.voiceCancelled = false;
    this.voiceSubmitAfterRecognition = false;
    this.stopScheduled = false;

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

    // 太短的片段送到 ASR 只会拿回 empty_result，用户读到的是「没有听清」，
    // 会以为是识别不准而反复重试同样短的一下。直接说是「太短」，才指得出
    // 下一步该做什么。
    if (duration * 1000 < MIN_RECORD_MS) {
      analytics.trackEvent('voice_recognize_failed', { reason: 'too_short', durationMs: Math.round(duration * 1000) });
      wx.showToast({ title: voiceFailureMessage({ reason: 'too_short' }), icon: 'none', duration: 2400 });
      return;
    }

    // 读文件 / 内联还是上传 / 失败兜底都收在 cloudBase.recognizeSpeech 里：
    // 长音频不再把 base64 塞进 callFunction 的请求体（见那里的注释）。
    this.setData({ recognizing: true });
    cloudBase.recognizeSpeech(filePath, duration, function (recognizeResult) {
      var text;
      var nextText;

      self.setData({ recognizing: false });

      if (!recognizeResult || !recognizeResult.ok || !recognizeResult.text) {
        analytics.trackEvent('voice_recognize_failed', {
          reason: recognizeResult && recognizeResult.reason ? recognizeResult.reason : 'unknown',
          providerErrorCode: recognizeResult && recognizeResult.providerErrorCode ? recognizeResult.providerErrorCode : '',
          // 时长要和失败原因一起上报：「越长越容易失败」这类问题，只有把两者
          // 放在一张表里才看得出来。
          durationMs: Math.round(duration * 1000)
        });
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

  onShow: function () {
    var pendingDreamText = wx.getStorageSync('oneiro:pendingDreamText') || '';
    var tabParams = tabNav.takeParams('pages/home/index');
    this.pageActive = true;
    recorderRouter.register(this);

    if (tabParams.fromShare) {
      this.setData({ fromShare: true });
      analytics.trackEvent('share_landing_view', {});
    }
    if (pendingDreamText && pendingDreamText !== this.data.dreamText) {
      this.setData({ dreamText: pendingDreamText });
    }
    this.refreshHeroLabel();
  },

  onHide: function () {
    this.pageActive = false;
    this.stopRecorderForExit();
    recorderRouter.unregister(this);
  },

  onRecorderError: function (error) {
    this.stopRecordingTimer();
    this.stopScheduled = false;
    this.setData({ recording: false, recordingSeconds: 0 });
    // 原来这里只上报一个空事件，真机上录音失败的具体原因（被系统音频占用、
    // 机型不支持该编码等）全部丢掉了，无从排查「有些人失败」到底是哪些人。
    analytics.trackEvent('voice_record_error', {
      errMsg: String(error && (error.errMsg || error.errCode || error.message) || '').slice(0, 180)
    });
    wx.showToast({ title: '这次没录上，再按住说一次', icon: 'none', duration: 2500 });
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

    this.submitTimer = setTimeout(function () {
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
        interpretationError: '',
        interpretationErrorCode: '',
        interpretationDiagnostics: null,
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
      that.submitTimer = null;

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
          var blockedDiagnostics = normalizeInterpretationDiagnostics(cloudResult);
          pendingDream.status = 'blocked';
          pendingDream.interpretationError = cloudResult.reason || 'cloud_safety';
          pendingDream.interpretationErrorCode = blockedDiagnostics.code || pendingDream.interpretationError;
          pendingDream.interpretationDiagnostics = blockedDiagnostics;
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
          var diagnostics = normalizeInterpretationDiagnostics(cloudResult);
          pendingDream.status = 'pending';
          pendingDream.result = null;
          pendingDream.interpretationSource = 'cloud';
          pendingDream.interpretationProvider = cloudResult && cloudResult.provider
            ? cloudResult.provider
            : '';
          pendingDream.interpretationError = String(
            cloudResult && (cloudResult.reason || cloudResult.message) || 'ai_provider_error'
          ).slice(0, 300);
          pendingDream.interpretationErrorCode = diagnostics.code || 'ai_provider_error';
          pendingDream.interpretationDiagnostics = diagnostics;
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
        var memoryEcho = normalizeMemoryEcho(cloudResult && cloudResult.memoryEcho);
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
          interpretationErrorCode: '',
          interpretationDiagnostics: normalizeInterpretationDiagnostics(cloudResult),
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
          if (!dream.cloudSynced) {
            syncQueue.enqueue('dream_sync', { dream: dream });
          } else {
            syncQueue.removeByKey('dream:' + String(dream.id || ''));
            if (getApp && getApp().flushPendingSyncTasks) getApp().flushPendingSyncTasks();
            refreshPortraitAfterDream(dream);
          }
          if (wx.removeStorageSync) {
            wx.removeStorageSync('oneiro:pendingDreamText');
          }
          // 草稿已经变成一个真正的梦了。不清空的话，用户从结果页返回首页会
          // 看到上一个梦的全文还留在输入区，既像是没提交成功，也很容易被
          // 重复提交一次。
          that.setData({ dreamText: '', editingDream: false });
          that.stopAnalysisProgress();
          wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
          that.submitting = false;
        });
        analytics.trackEvent('interpretation_success', {
          dreamId: dream.id,
          symbolCount: result.symbols ? result.symbols.length : 0,
          cardTheme: result.card_theme || 'mist',
          source: source,
          provider: provider,
          // 系统给了几处已核实的历史呼应，解读里点名了几处。诊断页据此算命中率。
          memoryEchoOffered: memoryEcho.offered,
          memoryEchoUsed: memoryEcho.used
        });
        cloudBase.flushEvents(analytics.getEvents());
        });
      });
    }, 700);
  }
});
