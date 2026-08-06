var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var recorderRouter = require('../../utils/recorderRouter');
var syncQueue = require('../../utils/syncQueue');
var tabNav = require('../../utils/tabNav');

var MAX_USER_TURNS = 6;
// 与首页同一套录音下限，见 pages/home/index.js 的注释：低于 MIN_RECORD_MS
// 的片段送到 ASR 必然是 empty_result；start 之后 MIN_RECORD_LIFETIME_MS 内
// stop 会拿到 0 字节文件。
var MIN_RECORD_MS = 1000;
var MIN_RECORD_LIFETIME_MS = 600;
var FEEDBACK_OPENINGS = {
  too_generic: "你标了'有点泛'。梦里哪个画面你觉得最被忽略了？我们从它开始",
  too_mystical: '你觉得太玄了。我们抛开象征，只说梦里实际发生了什么',
  not_grounded: '你觉得不贴合。说说醒来后你想到的第一件现实里的事？'
};

function voiceFailureMessage(result) {
  var reason = result && result.reason ? String(result.reason) : '';
  if (reason === 'not_configured') return '语音服务未配置，请先用文字输入';
  if (reason === 'cloud_unavailable' || reason === 'cloud_call_failed' || reason === 'cloud_result_expired') {
    return '语音服务暂不可用，请检查网络或改用文字输入';
  }
  if (reason === 'client_timeout' || reason === 'recognize_timeout') return '识别等待超时，请检查网络后重试';
  if (reason === 'empty_result') return '没有听清，再试一次或直接输入文字';
  if (reason === 'too_short') return '说得太短了，按住多说一会儿';
  if (reason === 'too_long') return '这段语音太长，请控制在 60 秒内';
  if (reason === 'record_permission_denied') return '未获得麦克风权限，请在设置中开启';
  if (reason === 'invalid_audio') return '这段录音没保存成，再按住说一次';
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
  cloudBase.saveDream(dream, function (result) {
    dream.cloudSynced = !!(result && result.ok);
    if (dream.cloudSynced) syncQueue.removeByKey('dream:' + String(dream.id));
    var latest = wx.getStorageSync('oneiro:dreamArchive') || [];
    wx.setStorageSync('oneiro:dreamArchive', latest.map(function (item) {
      return item.id === dream.id ? dream : item;
    }));
    if (dream.cloudSynced && getApp && getApp().flushPendingSyncTasks) {
      getApp().flushPendingSyncTasks();
    }
    if (callback) callback(result);
  });
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
    var feedback = String(options && options.feedback || (dream && dream.feedback) || '');
    var feedbackKey = 'oneiro:feedbackOpening:' + String(dream && dream.id || '');

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
        content: FEEDBACK_OPENINGS[feedback] && !wx.getStorageSync(feedbackKey)
          ? FEEDBACK_OPENINGS[feedback]
          : dream.result.integration_question || '你最想从这个梦的哪个画面开始聊？',
        createdAt: new Date().toISOString()
      }];
      if (FEEDBACK_OPENINGS[feedback] && !wx.getStorageSync(feedbackKey)) {
        wx.setStorageSync(feedbackKey, true);
      }
    }
    this.setData({
      dream: dream,
      messages: messages,
      turnCount: userTurnCount(messages),
      feedbackType: feedback,
      cloudSyncPending: dream.cloudSynced === false,
      scrollTarget: 'message-' + String(messages.length - 1)
    });
    this.pageActive = true;
    recorderRouter.register(this);
    analytics.trackEvent('dream_chat_view', { dreamId: dream.id, existingMessages: messages.length });
  },

  onUnload: function () {
    this.pageActive = false;
    this.clearVoiceStartTimer();
    this.stopRecorderForExit();
    recorderRouter.unregister(this);
  },

  onShow: function () {
    this.pageActive = true;
    recorderRouter.register(this);
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
    analytics.trackEvent('dream_chat_voice_error', {
      dreamId: this.data.dream && this.data.dream.id || '',
      errMsg: String(error && (error.errMsg || error.errCode || error.message) || '').slice(0, 180)
    });
    wx.showToast({ title: '这次没录上，再按住说一次', icon: 'none' });
  },

  onInput: function (event) {
    this.setData({ inputValue: event.detail.value });
  },

  // 轮次用尽后的两个出口。没有出口的结束态和卡死没有区别。
  backToReading: function () {
    analytics.trackEvent('dream_chat_ended_exit', { dreamId: this.data.dream && this.data.dream.id || '', to: 'result' });
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: '/pages/result/index?id=' + encodeURIComponent(this.data.dream && this.data.dream.id || '') });
  },

  startNewDream: function () {
    analytics.trackEvent('dream_chat_ended_exit', { dreamId: this.data.dream && this.data.dream.id || '', to: 'home' });
    tabNav.switchTab('pages/home/index');
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
      success: function () { if (that.pageActive !== false) that.startRecorder(); },
      fail: function () {
        wx.openSetting({
          success: function (setting) {
            if (setting.authSetting && setting.authSetting['scope.record'] && that.pageActive !== false) that.startRecorder();
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
    // 手指已经离开了才等到授权弹窗返回（第一次使用必然如此）。照常 start 再
    // 立刻 stop 录到的是 0 长度文件，用户读到的是「语音识别暂不可用」——一次
    // 成功的授权被显示成功能坏掉。这里不启动录音，只说清权限已拿到。
    if (this.voiceStopAfterAuthorization) {
      this.voiceStopAfterAuthorization = false;
      analytics.trackEvent('dream_chat_voice_skipped_after_authorize', { dreamId: this.data.dream.id });
      wx.showToast({ title: '麦克风已开启，再按住「说」一次', icon: 'none', duration: 2400 });
      return;
    }
    this.recordingStartedAt = Date.now();
    this.setData({ recording: true, recordingSeconds: 0 });
    this.startRecordingTimer();
    analytics.trackEvent('dream_chat_voice_start', { dreamId: this.data.dream.id, mode: this.voiceStartMode || 'tap' });
    try {
      recorderRouter.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, duration: 60000 });
    } catch (error) {
      this.stopRecordingTimer();
      this.setData({ recording: false, recordingSeconds: 0 });
      wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none' });
    }
  },

  stopRecorder: function () {
    var that = this;
    var elapsed;

    if (!this.data.recording || this.stopScheduled) return;
    // 录音器刚 start 就 stop 会拿到 0 字节文件；把 stop 推迟到采集真正开始
    // 之后再执行。
    elapsed = Date.now() - (this.recordingStartedAt || 0);
    if (elapsed < MIN_RECORD_LIFETIME_MS) {
      this.stopScheduled = true;
      setTimeout(function () {
        that.stopScheduled = false;
        that.stopRecorder();
      }, MIN_RECORD_LIFETIME_MS - elapsed);
      return;
    }
    this.stopRecordingTimer();
    analytics.trackEvent('dream_chat_voice_stop', { dreamId: this.data.dream.id, seconds: this.data.recordingSeconds });
    try { recorderRouter.stop(); } catch (error) { this.setData({ recording: false, recordingSeconds: 0 }); }
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
    this.stopScheduled = false;
    this.setData({ recording: false, recordingSeconds: 0 });
    if (!filePath) {
      wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none' });
      return;
    }
    // 太短的片段送到 ASR 只会拿回 empty_result，用户读到的是「没有听清」，
    // 会以为是识别不准而反复重试同样短的一下。
    if (duration * 1000 < MIN_RECORD_MS) {
      analytics.trackEvent('dream_chat_voice_failed', { dreamId: this.data.dream.id, reason: 'too_short' });
      wx.showToast({ title: voiceFailureMessage({ reason: 'too_short' }), icon: 'none', duration: 2400 });
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
      wx.showToast({ title: '这个梦这次已经聊满 ' + MAX_USER_TURNS + ' 轮', icon: 'none' });
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
      if (!result || !result.reply || result.ok === false) {
        var reason = result && result.reason ? String(result.reason) : 'missing_reply';
        that.setData({
          // 失败只移除本次刚加入的 user 消息，保留此前已存在的聊天记录。
          messages: messages.slice(0, -1),
          inputValue: content,
          sending: false,
          turnCount: Math.max(0, that.data.turnCount - 1),
          scrollTarget: 'message-' + String(Math.max(0, messages.length - 2))
        });
        analytics.trackEvent('dream_chat_reply_failed', {
          dreamId: dream.id,
          reason: reason
        });
        // 「没发出去」三个字对所有失败一视同仁，用户既不知道是网络还是服务，
        // 也不知道再点一次有没有用。至少要分出「重试就能好」和「先换文字/
        // 稍后再来」这两类。
        wx.showToast({
          title: /timeout|cloud_call_failed|cloud_result_expired|cloud_unavailable/.test(reason)
            ? '网络没接上，内容已放回输入框，可重试'
            : '这次没回上来，内容已放回输入框',
          icon: 'none',
          duration: 2600
        });
        return;
      }
      var current = that.data.messages.slice();
      current.push({ role: 'assistant', content: String(result.reply), createdAt: new Date().toISOString() });
      dream.chatMessages = current.slice(-12);
      dream.updatedAt = new Date().toISOString();
      persistDream(dream, function (saveResult) {
        that.setData({ cloudSyncPending: !(saveResult && saveResult.ok) });
        var realityClue = result && result.ok ? String(result.realityClue || '').trim() : '';
        var refreshPortrait = function (reason, refreshKey) {
          dreamMemory.refreshPortraitInBackground({
            cloudBase: cloudBase,
            reason: reason,
            refreshKey: refreshKey,
            archive: wx.getStorageSync('oneiro:dreamArchive') || []
          });
        };

        if (!saveResult || !saveResult.ok) {
          syncQueue.enqueue('dream_sync', { dream: dream });
          // 聊天已在本地保留；没有待写入的现实线索时，单独排队画像刷新。
          // 有现实线索则由 life_note 队列在补写成功后触发画像刷新。
          if (!realityClue) {
            syncQueue.enqueue('portrait_refresh', {
              refreshKey: 'discussion:' + String(dream.id) + ':' + String(current.length),
              reason: '梦后讨论有了新内容'
            });
          }
        }

        if (realityClue && saveResult && saveResult.ok) {
          cloudBase.addLifeNote(dream.id, realityClue, function (noteResult) {
            if (noteResult && noteResult.ok) {
              refreshPortrait(
                '梦后对话提取了新的现实线索',
                'life-note:' + String(noteResult.id || dream.id + ':' + current.length)
              );
              analytics.trackEvent('dream_chat_life_note_extracted', {
                dreamId: dream.id,
                deduplicated: !!noteResult.deduplicated
              });
              return;
            }
            analytics.trackEvent('dream_chat_life_note_failed', {
              dreamId: dream.id,
              reason: noteResult && noteResult.reason ? noteResult.reason : 'unknown'
            });
            syncQueue.enqueue('life_note', {
              dreamId: dream.id,
              text: realityClue,
              refreshKey: 'life-note:' + String(dream.id) + ':' + String(current.length)
            });
          });
          return;
        }
        if (saveResult && saveResult.ok) {
          refreshPortrait(
            '梦后讨论有了新内容',
            'discussion:' + String(dream.id) + ':' + String(current.length)
          );
        } else if (realityClue) {
          syncQueue.enqueue('life_note', {
            dreamId: dream.id,
            text: realityClue,
            refreshKey: 'life-note:' + String(dream.id) + ':' + String(current.length)
          });
        }
      });
      that.setData({
        dream: dream,
        messages: current,
        sending: false,
        cloudSyncPending: dream.cloudSynced !== true,
        scrollTarget: 'message-' + String(current.length - 1)
      });
      analytics.trackEvent('dream_chat_reply', {
        dreamId: dream.id,
        provider: result && result.provider ? result.provider : 'unavailable',
        fallback: !!(result && result.fallback)
      });
    }, this.data.feedbackType || '');
  }
});
