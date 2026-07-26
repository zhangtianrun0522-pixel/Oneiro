var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var recorderManager = wx.getRecorderManager();
var recorderListenersBound = false;
var activeRecorderPage = null;

var MAX_USER_TURNS = 6;

function voiceFailureMessage(result) {
  var reason = result && result.reason ? String(result.reason) : '';
  if (reason === 'not_configured') return '语音服务未配置，请先用文字输入';
  if (reason === 'cloud_unavailable' || reason === 'cloud_call_failed' || reason === 'cloud_result_expired') {
    return '语音服务暂不可用，请检查网络或改用文字输入';
  }
  if (reason === 'empty_result') return '没有听清，再试一次或直接输入文字';
  if (reason === 'record_permission_denied') return '未获得麦克风权限，请在设置中开启';
  return '语音识别暂不可用，请改用文字输入';
}

function findDream(id) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var target = decodeURIComponent(id || '');
  var i;
  for (i = 0; i < archive.length; i += 1) {
    if (archive[i].id === target) return archive[i];
  }
  return null;
}

function persistDream(dream, callback) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var next = archive.map(function (item) { return item.id === dream.id ? dream : item; });
  wx.setStorageSync('oneiro:dreamArchive', next);
  cloudBase.saveDream(dream, callback);
}

function userTurnCount(messages) {
  return messages.filter(function (item) { return item.role === 'user'; }).length;
}

Page({
  data: {
    dream: null,
    messages: [],
    inputValue: '',
    sending: false,
    recording: false,
    recordingSeconds: 0,
    recognizing: false,
    turnCount: 0,
    maxTurns: MAX_USER_TURNS,
    scrollTarget: ''
  },

  onLoad: function (options) {
    var dream = findDream(options && options.id);
    var messages;

    // 与 result 页保持一致：拿不到梦就退回去，不要把用户留在一个
    // 看起来能用、实际没有任何上下文的对话界面上。
    if (!dream || !dream.result) {
      wx.showToast({ title: '暂时找不到这个梦', icon: 'none' });
      setTimeout(function () {
        if (getCurrentPages().length > 1) wx.navigateBack();
        else wx.reLaunch({ url: '/pages/home/index' });
      }, 1200);
      return;
    }
    messages = Array.isArray(dream.chatMessages) ? dream.chatMessages : [];
    if (!messages.length) {
      messages = [{
        role: 'assistant',
        content: dream.result.integration_question || '你最想从这个梦的哪个画面开始聊？',
        createdAt: new Date().toISOString()
      }];
    }
    this.setData({
      dream: dream,
      messages: messages,
      turnCount: userTurnCount(messages),
      scrollTarget: 'message-' + String(messages.length - 1)
    });
    activeRecorderPage = this;
    if (!recorderListenersBound) {
      recorderManager.onStop(function (result) {
        if (activeRecorderPage) activeRecorderPage.onRecorderStop(result);
      });
      recorderManager.onError(function () {
        if (!activeRecorderPage) return;
        activeRecorderPage.stopRecordingTimer();
        activeRecorderPage.setData({ recording: false, recordingSeconds: 0 });
        analytics.trackEvent('dream_chat_voice_error', { dreamId: activeRecorderPage.data.dream.id });
        wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none' });
      });
      recorderListenersBound = true;
    }
    analytics.trackEvent('dream_chat_view', { dreamId: dream.id, existingMessages: messages.length });
  },

  onUnload: function () {
    this.clearVoiceStartTimer();
    this.stopRecordingTimer();
    if (this.data.recording) {
      try { recorderManager.stop(); } catch (error) {}
    }
    if (activeRecorderPage === this) activeRecorderPage = null;
  },

  onInput: function (event) {
    this.setData({ inputValue: event.detail.value });
  },

  useGuide: function (event) {
    var prompt = String(event.currentTarget.dataset.prompt || '').trim();
    if (!prompt || this.data.sending || this.data.recording || this.data.recognizing) return;
    this.setData({ inputValue: this.data.inputValue ? this.data.inputValue + '\n' + prompt : prompt });
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
    if (this.data.recording || this.data.recognizing || this.data.sending) return;
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
    analytics.trackEvent('dream_chat_voice_start', { dreamId: this.data.dream.id, mode: this.voiceStartMode || 'tap' });
    if (this.voiceStopAfterAuthorization) {
      this.voiceStopAfterAuthorization = false;
      setTimeout(function () { that.stopRecorder(); }, 0);
    }
    try {
      recorderManager.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, duration: 60000 });
    } catch (error) {
      this.stopRecordingTimer();
      this.setData({ recording: false, recordingSeconds: 0 });
      wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none' });
    }
  },

  stopRecorder: function () {
    if (!this.data.recording) return;
    this.stopRecordingTimer();
    analytics.trackEvent('dream_chat_voice_stop', { dreamId: this.data.dream.id, seconds: this.data.recordingSeconds });
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
    if (this.data.recognizing || this.data.sending) return;
    this.clearVoiceStartTimer();
    this.voiceTouching = true;
    this.voiceLongPressStarted = false;
    if (this.data.recording) return;
    this.voiceStartTimer = setTimeout(function () {
      that.voiceStartTimer = null;
      if (!that.voiceTouching || that.data.recording || that.data.recognizing || that.data.sending) return;
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
      wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none' });
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
            analytics.trackEvent('dream_chat_voice_failed', { dreamId: that.data.dream.id, reason: recognizeResult && recognizeResult.reason ? recognizeResult.reason : 'unknown' });
            wx.showToast({ title: voiceFailureMessage(recognizeResult), icon: 'none' });
            return;
          }
          var text = String(recognizeResult.text).trim();
          that.setData({ inputValue: that.data.inputValue ? that.data.inputValue + '\n' + text : text });
          analytics.trackEvent('dream_chat_voice_success', { dreamId: that.data.dream.id, duration: duration, textLength: text.length });
        });
      },
      fail: function () {
        that.setData({ recognizing: false });
        analytics.trackEvent('dream_chat_voice_failed', { dreamId: that.data.dream.id, reason: 'file_read_failed' });
        wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none' });
      }
    });
  },

  sendMessage: function () {
    var that = this;
    var dream = this.data.dream;
    var content = String(this.data.inputValue || '').trim();
    var messages = this.data.messages.slice();
    var requestHistory;
    var userMessage;

    if (!dream || this.data.sending || this.data.recording || this.data.recognizing) return;
    if (!content) {
      wx.showToast({ title: '先写下你想说的内容', icon: 'none' });
      return;
    }
    if (this.data.turnCount >= MAX_USER_TURNS) {
      wx.showToast({ title: '这次先聊到这里', icon: 'none' });
      return;
    }

    requestHistory = messages.slice(-12).map(function (item) {
      return { role: item.role, content: item.content };
    });
    userMessage = { role: 'user', content: content.slice(0, 500), createdAt: new Date().toISOString() };
    messages.push(userMessage);
    this.setData({
      messages: messages,
      inputValue: '',
      sending: true,
      turnCount: this.data.turnCount + 1,
      scrollTarget: 'message-' + String(messages.length - 1)
    });

    cloudBase.chatAboutDream(dream.dreamText, dream.result, requestHistory, userMessage.content, function (result) {
      var current = that.data.messages.slice();
      var reply = result && result.reply
        ? result.reply
        : '这次我没有接住这句话。你可以换一个梦里的画面再说说。';
      current.push({ role: 'assistant', content: reply, createdAt: new Date().toISOString() });
      dream.chatMessages = current.slice(-12);
      dream.updatedAt = new Date().toISOString();
      persistDream(dream, function () {
        dreamMemory.refreshPortraitInBackground({
          cloudBase: cloudBase,
          reason: '梦后讨论有了新内容',
          refreshKey: 'discussion:' + String(dream.id) + ':' + String(current.length),
          archive: wx.getStorageSync('oneiro:dreamArchive') || []
        });
      });
      that.setData({
        dream: dream,
        messages: current,
        sending: false,
        scrollTarget: 'message-' + String(current.length - 1)
      });
      analytics.trackEvent('dream_chat_reply', {
        dreamId: dream.id,
        provider: result && result.provider ? result.provider : 'unavailable',
        fallback: !!(result && result.fallback)
      });
    });
  }
});
