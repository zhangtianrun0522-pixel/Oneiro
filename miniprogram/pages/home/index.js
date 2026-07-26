var acceptance = require('../../utils/acceptanceDream');
var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var contentSafety = require('../../utils/contentSafety');
var dreamMemory = require('../../utils/dreamMemory');
var localDreamOracle = require('../../utils/localDreamOracle');
var tabNav = require('../../utils/tabNav');
var acceptanceDreamResult = acceptance.acceptanceDreamResult;
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

function createLocalResult(dreamText, profile, cardIndex) {
  var localResult = localDreamOracle.buildLocalDreamResult(acceptanceDreamResult, dreamText);
  localResult.card_no = 'NO. ' + String(cardIndex).padStart(3, '0');
  localResult.profile_summary = '本地解读';
  localResult.bazi_chart = {
    available: false,
    precision: 'cloud_unavailable',
    summary: '本次未生成出生节律参考。',
    basis: '背景计算暂时不可用，不使用语言模型猜测结果。'
  };
  localResult.metaphysical_resonance = '';
  localResult.metaphysical_basis = '';
  localResult.mirror = '一种可能是：' + localResult.mirror + '这也可能只是偶然的梦中组合，目前还不足以下结论。';
  localResult.possible_connections = [localResult.mirror].filter(Boolean);
  return localResult;
}

function normalizeFactList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(function (item) {
    return String(item || '').trim();
  }).filter(Boolean).slice(0, 6);
}

function normalizeDreamFacts(result, dreamText) {
  var facts = result && result.dream_facts ? result.dream_facts : {};
  var symbols = result && Array.isArray(result.symbols) ? result.symbols : [];
  var text = String(dreamText || '');
  var people = normalizeFactList(facts.people);
  var places = normalizeFactList(facts.places);
  var objects = normalizeFactList(facts.objects);
  var actions = normalizeFactList(facts.actions);
  var transitions = normalizeFactList(facts.transitions || facts.events);
  var emotions = normalizeFactList(facts.emotions);
  var timeSense = normalizeFactList(facts.time_sense || facts.timeSense);

  if (!places.length) {
    places = symbols.filter(function (symbol) {
      return /学校|家屋|图书馆|清水/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!objects.length) {
    objects = symbols.filter(function (symbol) {
      return /钥匙|门|月光|鸟/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!actions.length) {
    actions = symbols.filter(function (symbol) {
      return /追逐|坠落/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!people.length) {
    ['妈妈', '爸爸', '父亲', '母亲', '同学', '老师', '陌生人'].forEach(function (person) {
      if (text.indexOf(person) >= 0 && people.indexOf(person) < 0) people.push(person);
    });
  }
  if (!emotions.length) {
    ['害怕', '紧张', '焦虑', '难过', '安心', '平静', '孤独', '兴奋', '愤怒'].forEach(function (emotion) {
      if (text.indexOf(emotion) >= 0) emotions.push(emotion);
    });
  }
  if (!timeSense.length) {
    ['清晨', '白天', '黄昏', '夜晚', '深夜', '小时候'].forEach(function (time) {
      if (text.indexOf(time) >= 0) timeSense.push(time);
    });
  }

  return {
    people: people,
    places: places,
    objects: objects,
    actions: actions,
    transitions: transitions,
    emotions: emotions,
    time_sense: timeSense
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
    recentDreams: [],
    dreamText: '',
    recording: false,
    recordingSeconds: 0,
    recognizing: false,
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

    if (options && options.autoSubmit && pendingDreamText) {
      var that = this;
      setTimeout(function () { that.generateDreamCard(); }, 0);
    }
  },

  onUnload: function () {
    this.stopAnalysisProgress();
    this.clearVoiceStartTimer();
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

  toggleRecording: function () {
    if (this.data.recording) {
      this.stopRecorder();
    } else {
      this.beginRecording('tap');
    }
  },

  clearVoiceStartTimer: function () {
    if (this.voiceStartTimer) {
      clearTimeout(this.voiceStartTimer);
      this.voiceStartTimer = null;
    }
  },

  onVoiceTouchStart: function () {
    var self = this;

    if (this.data.recognizing) return;

    this.clearVoiceStartTimer();
    this.voiceTouching = true;
    this.voiceLongPressStarted = false;

    // A second tap while recording still acts as the explicit stop control.
    if (this.data.recording) return;

    // Delay the start very slightly so a normal tap can remain the compatible
    // start/stop interaction while a held press becomes the primary flow.
    this.voiceStartTimer = setTimeout(function () {
      self.voiceStartTimer = null;
      if (!self.voiceTouching || self.data.recording || self.data.recognizing) return;
      self.voiceLongPressStarted = true;
      self.beginRecording('long_press');
    }, 240);
  },

  onVoiceTouchEnd: function () {
    this.voiceTouching = false;
    this.clearVoiceStartTimer();

    if (this.voiceLongPressStarted || this.data.recording) {
      // touchend is followed by tap for a button. Suppress that tap because
      // this gesture already completed the recording action.
      this.voiceSuppressTap = true;
      if (this.data.recording) {
        this.stopRecorder();
      } else {
        // Permission dialogs can resolve after the finger has been released.
        this.voiceStopAfterAuthorization = true;
      }
    }
  },

  onVoiceTouchCancel: function () {
    this.voiceTouching = false;
    this.clearVoiceStartTimer();

    if (this.voiceLongPressStarted && !this.data.recording) {
      this.voiceStopAfterAuthorization = true;
    }
    if (this.data.recording) {
      this.stopRecorder();
    }
    this.voiceLongPressStarted = false;
  },

  onVoiceTap: function () {
    if (this.voiceSuppressTap) {
      this.voiceSuppressTap = false;
      this.voiceLongPressStarted = false;
      return;
    }

    this.toggleRecording();
  },

  onRecorderStop: function (result) {
    var self = this;
    var filePath = result && (result.tempFilePath || result.filePath);
    var duration = result && result.duration
      ? Math.min(Number(result.duration) / 1000, 60)
      : Math.min((Date.now() - this.recordingStartedAt) / 1000, 60);
    var fileSystemManager;

    this.stopRecordingTimer();
    this.setData({
      recording: false,
      recordingSeconds: 0
    });

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
    this.refreshRecentDreams();
  },

  refreshRecentDreams: function () {
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    this.setData({
      recentDreams: archive.slice().sort(function (left, right) {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }).slice(0, 5).map(function (item) {
        return {
          id: item.id,
          title: item.result && item.result.title ? item.result.title : '一段未命名的梦',
          date: item.createdAt ? String(item.createdAt).slice(5, 10).replace('-', ' · ') : '',
          theme: item.result && item.result.card_theme ? item.result.card_theme : 'mist'
        };
      })
    });
  },

  openRecentDream: function (event) {
    var id = event.currentTarget.dataset.id;
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var dream = archive.filter(function (item) { return item.id === id; })[0];
    if (!dream) return;
    getApp().globalData.currentDream = dream;
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(id) });
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
    var dreamText = this.data.dreamText.trim();
    var profile = readProfile();
    var safety = contentSafety.validateDreamText(dreamText);
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

      cloudBase.saveDream(pendingDream, function () {
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
          return;
        }

        var result = cloudResult && cloudResult.result
          ? cloudResult.result
          : createLocalResult(dreamText, profile, cardIndex);
        var source = cloudResult && cloudResult.result ? 'cloud' : 'local';
        var provider = cloudResult && cloudResult.provider ? cloudResult.provider : source;
        var dream;

        result.card_no = result.card_no || 'NO. ' + String(cardIndex).padStart(3, '0');
        result.profile_summary = result.profile_summary || '梦境记忆';

        dream = {
          id: dreamId,
          dreamText: dreamText,
          status: 'ready',
          result: result,
          dreamFacts: normalizeDreamFacts(result, dreamText),
          interpretationSource: source,
          interpretationProvider: provider,
          interpretationError: cloudResult && !cloudResult.result
            ? String(cloudResult.reason || cloudResult.message || '')
            : '',
          interpretationMeta: {
            schemaVersion: (cloudResult && cloudResult.schemaVersion) || 'dream-entry-v0.2',
            promptVersion: (cloudResult && cloudResult.promptVersion) || 'local-oracle-v1',
            model: (cloudResult && cloudResult.model) || ''
          },
          feedback: '',
          createdAt: createdAt,
          updatedAt: new Date().toISOString()
        };

        app.globalData.currentDream = dream;
        upsertLocalDream(dream);
        cloudBase.saveDream(dream, function () {
          refreshPortraitAfterDream(dream);
        });
        analytics.trackEvent('interpretation_success', {
          dreamId: dream.id,
          symbolCount: result.symbols ? result.symbols.length : 0,
          cardTheme: result.card_theme || 'mist',
          source: source,
          provider: provider
        });
        cloudBase.flushEvents(analytics.getEvents());
        if (wx.removeStorageSync) {
          wx.removeStorageSync('oneiro:pendingDreamText');
        }
        that.stopAnalysisProgress();
        wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
        });
      });
    }, 700);
  }
});
