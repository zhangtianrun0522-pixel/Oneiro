var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var tabNav = require('../../utils/tabNav');
var recorderManager = wx.getRecorderManager();
var recorderListenersBound = false;
var activeRecorderPage = null;

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

Page({
  data: {
    fromShare: false,
    recentDreams: [],
    dreamText: '',
    recording: false,
    recordingSeconds: 0,
    recognizing: false
  },

  onLoad: function (options) {
    // 从分享页进来时走的是 switchTab，参数经 tabNav 暂存，这里兼容两种入口
    var fromShare = !!(options && options.fromShare === '1');
    this.setData({ fromShare: fromShare });
    analytics.trackEvent(fromShare ? 'share_landing_view' : 'home_view', {});
    activeRecorderPage = this;

    if (!recorderListenersBound) {
      recorderManager.onStop(function (result) {
        if (activeRecorderPage) activeRecorderPage.onRecorderStop(result);
      });
      recorderManager.onError(function () {
        if (!activeRecorderPage) return;
        activeRecorderPage.stopRecordingTimer();
        activeRecorderPage.setData({ recording: false, recordingSeconds: 0 });
        analytics.trackEvent('voice_record_error', { source: 'home' });
        wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none', duration: 2500 });
      });
      recorderListenersBound = true;
    }
  },

  onUnload: function () {
    this.clearVoiceStartTimer();
    this.stopRecordingTimer();
    if (this.data.recording) {
      try { recorderManager.stop(); } catch (error) {}
    }
    if (activeRecorderPage === this) activeRecorderPage = null;
  },

  onShow: function () {
    var tabParams = tabNav.takeParams('pages/home/index');
    if (tabParams.fromShare) {
      this.setData({ fromShare: true });
      analytics.trackEvent('share_landing_view', {});
    }
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    this.setData({ recentDreams: archive.slice().sort(function (left, right) {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }).slice(0, 5).map(function (item) {
      return {
        id: item.id,
        title: item.result && item.result.title ? item.result.title : '一段未命名的梦',
        date: item.createdAt ? String(item.createdAt).slice(5, 10).replace('-', ' · ') : '',
        theme: item.result && item.result.card_theme ? item.result.card_theme : 'mist'
      };
    }) });

  },

  startDream: function () {
    analytics.trackEvent('dream_start', { source: 'home' });
    wx.navigateTo({ url: '/pages/new-dream/index' });
  },

  onDreamInput: function (event) {
    this.setData({ dreamText: event.detail.value });
  },

  startRecordingTimer: function () {
    var that = this;
    this.stopRecordingTimer();
    this.recordingTimer = setInterval(function () {
      that.setData({ recordingSeconds: Math.min(Math.floor((Date.now() - that.recordingStartedAt) / 1000), 60) });
    }, 500);
  },

  stopRecordingTimer: function () {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  },

  beginRecording: function (mode) {
    var that = this;
    if (this.data.recording || this.data.recognizing) return;
    this.voiceStartMode = mode || 'tap';
    wx.authorize({
      scope: 'scope.record',
      success: function () { that.startRecorder(); },
      fail: function () {
        wx.openSetting({
          success: function (setting) {
            if (setting.authSetting && setting.authSetting['scope.record']) that.startRecorder();
            else wx.showToast({ title: voiceFailureMessage({ reason: 'record_permission_denied' }), icon: 'none' });
          },
          fail: function () {
            wx.showToast({ title: voiceFailureMessage({ reason: 'record_permission_denied' }), icon: 'none' });
          }
        });
      }
    });
  },

  startRecorder: function () {
    var that = this;
    this.recordingStartedAt = Date.now();
    this.setData({ recording: true, recordingSeconds: 0 });
    this.startRecordingTimer();
    analytics.trackEvent('voice_record_start', { mode: this.voiceStartMode || 'tap', source: 'home' });
    if (this.voiceStopAfterAuthorization) {
      this.voiceStopAfterAuthorization = false;
      setTimeout(function () { that.stopRecorder(); }, 0);
    }
    try {
      recorderManager.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, duration: 60000 });
    } catch (error) {
      this.stopRecordingTimer();
      this.setData({ recording: false, recordingSeconds: 0 });
      wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none', duration: 2500 });
    }
  },

  stopRecorder: function () {
    if (!this.data.recording) return;
    this.stopRecordingTimer();
    analytics.trackEvent('voice_record_stop', { seconds: this.data.recordingSeconds, source: 'home' });
    try { recorderManager.stop(); } catch (error) { this.setData({ recording: false, recordingSeconds: 0 }); }
  },

  clearVoiceStartTimer: function () {
    if (this.voiceStartTimer) {
      clearTimeout(this.voiceStartTimer);
      this.voiceStartTimer = null;
    }
  },

  onVoiceTouchStart: function () {
    var that = this;
    if (this.data.recognizing) return;
    this.clearVoiceStartTimer();
    this.voiceTouching = true;
    this.voiceLongPressStarted = false;
    if (this.data.recording) return;
    this.voiceStartTimer = setTimeout(function () {
      that.voiceStartTimer = null;
      if (!that.voiceTouching || that.data.recording || that.data.recognizing) return;
      that.voiceLongPressStarted = true;
      that.beginRecording('long_press');
    }, 240);
  },

  onVoiceTouchEnd: function () {
    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    if (!this.voiceLongPressStarted && !this.data.recording) return;
    this.voiceSuppressTap = true;
    if (this.data.recording) this.stopRecorder();
    else this.voiceStopAfterAuthorization = true;
  },

  onVoiceTouchCancel: function () {
    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    if (this.voiceLongPressStarted && !this.data.recording) this.voiceStopAfterAuthorization = true;
    if (this.data.recording) this.stopRecorder();
    this.voiceLongPressStarted = false;
  },

  onVoiceTap: function () {
    if (this.voiceSuppressTap) {
      this.voiceSuppressTap = false;
      this.voiceLongPressStarted = false;
      return;
    }
    if (this.data.recording) this.stopRecorder();
    else this.beginRecording('tap');
  },

  onRecorderStop: function (result) {
    var that = this;
    var filePath = result && (result.tempFilePath || result.filePath);
    var duration = result && result.duration ? Math.min(Number(result.duration) / 1000, 60) : Math.min((Date.now() - this.recordingStartedAt) / 1000, 60);
    this.stopRecordingTimer();
    this.setData({ recording: false, recordingSeconds: 0 });
    if (!filePath) {
      wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none', duration: 2500 });
      return;
    }
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (readResult) {
        that.setData({ recognizing: true });
        cloudBase.speechRecognize(readResult.data, duration, function (recognizeResult) {
          that.setData({ recognizing: false });
          if (!recognizeResult || !recognizeResult.ok || !recognizeResult.text) {
            analytics.trackEvent('voice_recognize_failed', { reason: recognizeResult && recognizeResult.reason ? recognizeResult.reason : 'unknown', source: 'home' });
            wx.showToast({ title: voiceFailureMessage(recognizeResult), icon: 'none', duration: 2800 });
            return;
          }
          var text = String(recognizeResult.text).trim();
          that.setData({ dreamText: that.data.dreamText ? that.data.dreamText + '\n' + text : text });
          analytics.trackEvent('voice_recognize_success', { duration: duration, textLength: text.length, source: 'home' });
        });
      },
      fail: function () {
        that.setData({ recognizing: false });
        analytics.trackEvent('voice_recognize_failed', { reason: 'file_read_failed', source: 'home' });
        wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none', duration: 2500 });
      }
    });
  },

  generateDreamCard: function () {
    var dreamText = String(this.data.dreamText || '').trim();
    if (this.data.recording || this.data.recognizing) {
      wx.showToast({ title: this.data.recording ? '请先停止录音' : '语音正在识别', icon: 'none' });
      return;
    }
    if (!dreamText) {
      wx.showToast({ title: '先写下一点梦里的画面', icon: 'none' });
      return;
    }
    analytics.trackEvent('dream_start', { source: 'home' });
    wx.setStorageSync('oneiro:pendingDreamText', dreamText);
    wx.navigateTo({ url: '/pages/new-dream/index?autoSubmit=1' });
  },

  openArchive: function () {
    analytics.trackEvent('archive_open', { source: 'home' });
    tabNav.switchTab('pages/archive/index');
  },

  openProfile: function () {
    analytics.trackEvent('profile_open', { source: 'home' });
    tabNav.switchTab('pages/profile/index');
  },

  openRecentDream: function (event) {
    var id = event.currentTarget.dataset.id;
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var dream = archive.filter(function (item) { return item.id === id; })[0];
    if (!dream) return;
    getApp().globalData.currentDream = dream;
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(id) });
  }

});
