var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var recorderRouter = require('../../utils/recorderRouter');
var stagePortrait = require('../../utils/stagePortrait');
var syncQueue = require('../../utils/syncQueue');

// 画像纠偏走同一个页面，不另开一个。
//
// 「聊聊」是这套系统里唯一的更正通道：梦的解读不对，在梦那里聊；对你这个人的
// 判断不对，在画像这里聊。同一个入口、同一个口吻。复制一份只有 sendMessage
// 不同的聊天页，等于把录音那两百行也复制一份，两边迟早会漂。
var PORTRAIT_CHAT_KEY = 'oneiro:portraitChat';
// 入口按钮写的就是这句异议本身，所以点进来时第一句已经替用户说完了——他要
// 付出的和点一个「不像」按钮一样多，但落在一个可以继续说下去的地方。
var PORTRAIT_OPENING = '你说这段不像你。是哪一句最不对？或者直接说件最近的事，我照着改。';

// 每条梦保留的对话条数。轮数不再设上限，但发给模型的历史仍然只取最近 12 条
// （见 sendMessage），这里保留的是用户回来时还能读到的那份记录。
var MAX_STORED_MESSAGES = 60;
// 与首页同一套录音下限，见 pages/home/index.js 的注释：低于 MIN_RECORD_MS
// 的片段送到 ASR 必然是 empty_result；start 之后 MIN_RECORD_LIFETIME_MS 内
// stop 会拿到 0 字节文件。
var MIN_RECORD_MS = 1000;
var MIN_RECORD_LIFETIME_MS = 600;
// 与首页同源：60 秒是腾讯云「一句话识别」接口自身的上限，不是产品定的。
var MAX_RECORD_SECONDS = 60;
var RECORD_WARN_SECONDS = 15;
var FEEDBACK_OPENINGS = {
  too_generic: "你标了'有点泛'。梦里哪个画面你觉得最被忽略了？我们从它开始",
  too_mystical: '你觉得太玄了。我们抛开象征，只说梦里实际发生了什么',
  not_grounded: '你觉得不贴合。说说醒来后你想到的第一件现实里的事？'
};

// 「不太像」的下行出口，和 FEEDBACK_OPENINGS 同一个机制：用户在结果页做的一次
// 表态，在这里变成对话的第一句。区别是它必须先把被否定的那句原样念回来——上面
// 三条针对整份解读，这条针对一条具体的呼应，不引出来用户就不知道我们在纠正哪
// 一条；而且这句话本来就是我们说的，不认领它就没有纠偏可言。
function connectionCorrectionOpening(text) {
  return '刚才这条你说不太像："' + String(text || '').trim() + '"。那实际是怎么回事？说说你最近真实的处境，我重新理解';
}

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

function readPortraitMessages() {
  var stored = wx.getStorageSync(PORTRAIT_CHAT_KEY);
  return Array.isArray(stored) ? stored : [];
}

function writePortraitMessages(messages) {
  wx.setStorageSync(PORTRAIT_CHAT_KEY, messages.slice(-MAX_STORED_MESSAGES));
}

function currentPortraitSummary() {
  var state = stagePortrait.readCachedState();
  var current = state && state.current;
  return String((current && (current.summary || current.profileText)) || '').trim();
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
    portraitMode: false,
    portraitSummary: '',
    messages: [],
    inputValue: '',
    sending: false,
    recording: false,
    recordingSeconds: 0,
    // 只在最后 RECORD_WARN_SECONDS 秒内是正数，其余时间为 0（= 不提示）。
    recordingCountdown: 0,
    recognizing: false,
    turnCount: 0,
    scrollTarget: ''
  },

  onLoad: function (options) {
    if (options && options.portrait === '1') return this.loadPortraitMode();
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

    // 待纠偏的呼应压过解读评价：前者指向用户刚刚亲手划掉的一句具体的话，后者
    // 只是对整份解读的粗评。raisedFor 保证同一条只开一次场——否则每次进来都要
    // 重问一遍已经聊过的事。
    var correction = String(dream.connectionToCorrect || '').trim();
    var correctionPending = !!correction && String(dream.connectionCorrectionRaisedFor || '') !== correction;

    if (!messages.length) {
      messages = [{
        role: 'assistant',
        content: correctionPending
          ? connectionCorrectionOpening(correction)
          : FEEDBACK_OPENINGS[feedback] && !wx.getStorageSync(feedbackKey)
            ? FEEDBACK_OPENINGS[feedback]
            : dream.result.integration_question || '你最想从这个梦的哪个画面开始聊？',
        createdAt: new Date().toISOString()
      }];
      if (!correctionPending && FEEDBACK_OPENINGS[feedback] && !wx.getStorageSync(feedbackKey)) {
        wx.setStorageSync(feedbackKey, true);
      }
    } else if (correctionPending) {
      // 已经聊过的梦又被否定了一条呼应。开场白的位置已经过去了，所以把它作为
      // 新的一句接在后面——这条否定是刚刚发生的，不能因为对话开过头就被吞掉。
      // 这一句必须落盘：空对话时的开场白会在用户回第一句时被一起带上，而接在
      // 已有对话后面的这句没人带，不存就会在下次进来时凭空消失。
      messages = messages.concat([{
        role: 'assistant',
        content: connectionCorrectionOpening(correction),
        createdAt: new Date().toISOString()
      }]);
      dream.chatMessages = messages.slice(-MAX_STORED_MESSAGES);
    }

    if (correctionPending) {
      dream.connectionCorrectionRaisedFor = correction;
      dream.updatedAt = new Date().toISOString();
      persistDream(dream, function (saveResult) {
        if (!saveResult || !saveResult.ok) syncQueue.enqueue('dream_sync', { dream: dream });
      });
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
    analytics.trackEvent('dream_chat_view', {
      dreamId: dream.id,
      existingMessages: messages.length,
      correctingConnection: correctionPending
    });
  },

  // 埋点里的 dreamId 在画像模式下没有梦可指。给一个固定标识，好让两种对话的
  // 录音漏斗仍然落在同一组事件里，而不是各自散成两份。
  currentContextId: function () {
    if (this.data.portraitMode) return 'portrait';
    return (this.data.dream && this.data.dream.id) || '';
  },

  loadPortraitMode: function () {
    var summary = currentPortraitSummary();
    if (!summary) {
      wx.showToast({ title: '还没有可以聊的画像', icon: 'none' });
      setTimeout(function () {
        if (getCurrentPages().length > 1) wx.navigateBack();
        else wx.reLaunch({ url: '/pages/home/index' });
      }, 1200);
      return;
    }
    var messages = readPortraitMessages();
    if (!messages.length) {
      messages = [{ role: 'assistant', content: PORTRAIT_OPENING, createdAt: new Date().toISOString() }];
      writePortraitMessages(messages);
    }
    wx.setNavigationBarTitle({ title: '聊聊这份画像' });
    this.setData({
      portraitMode: true,
      portraitSummary: summary,
      messages: messages,
      turnCount: userTurnCount(messages),
      scrollTarget: 'message-' + String(messages.length - 1)
    });
    this.pageActive = true;
    recorderRouter.register(this);
    analytics.trackEvent('portrait_chat_view', { existingMessages: messages.length });
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
    this.setData({ recording: false, recordingSeconds: 0, recordingCountdown: 0 });
    analytics.trackEvent('dream_chat_voice_error', {
      dreamId: this.currentContextId(),
      errMsg: String(error && (error.errMsg || error.errCode || error.message) || '').slice(0, 180)
    });
    wx.showToast({ title: '这次没录上，再按住说一次', icon: 'none' });
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
      var seconds = Math.min(Math.floor((Date.now() - that.recordingStartedAt) / 1000), MAX_RECORD_SECONDS);
      var remaining = MAX_RECORD_SECONDS - seconds;
      that.setData({
        recordingSeconds: seconds,
        recordingCountdown: remaining <= RECORD_WARN_SECONDS ? remaining : 0
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
      analytics.trackEvent('dream_chat_voice_skipped_after_authorize', { dreamId: this.currentContextId() });
      wx.showToast({ title: '麦克风已开启，再按住「说」一次', icon: 'none', duration: 2400 });
      return;
    }
    this.recordingStartedAt = Date.now();
    this.userStoppedRecorder = false;
    this.voiceAutoStopped = false;
    this.setData({ recording: true, recordingSeconds: 0, recordingCountdown: 0 });
    this.startRecordingTimer();
    analytics.trackEvent('dream_chat_voice_start', { dreamId: this.currentContextId(), mode: this.voiceStartMode || 'tap' });
    try {
      recorderRouter.start({ format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, duration: MAX_RECORD_SECONDS * 1000 });
    } catch (error) {
      this.stopRecordingTimer();
      this.setData({ recording: false, recordingSeconds: 0, recordingCountdown: 0 });
      wx.showToast({ title: voiceFailureMessage({ reason: 'recognize_failed' }), icon: 'none' });
    }
  },

  stopRecorder: function () {
    var that = this;
    var elapsed;

    if (!this.data.recording || this.stopScheduled) return;
    // 标记「这次停止是我们要求的」，好在 onRecorderStop 里把它和录音器自己
    // 走到 60 秒上限那一次区分开。见首页同名注释。
    this.userStoppedRecorder = true;
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
    analytics.trackEvent('dream_chat_voice_stop', { dreamId: this.currentContextId(), seconds: this.data.recordingSeconds });
    try { recorderRouter.stop(); } catch (error) { this.setData({ recording: false, recordingSeconds: 0, recordingCountdown: 0 }); }
  },

  stopRecorderForExit: function () {
    this.stopScheduled = false;
    if (!this.data.recording) return;
    this.stopRecordingTimer();
    this.setData({ recording: false, recordingSeconds: 0, recordingCountdown: 0 });
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
    this.voiceAutoStopped = false;
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
    // 录音已经因为撞到 60 秒上限自己停了，那一段也在转文字的路上。这次松手只是
    // 「把手拿开」：再往下走会把 voiceStopAfterAuthorization 置位，让下一次按住
    // 变成空按。同时吃掉紧随其后的 tap，避免它把录音又开起来。
    if (this.voiceAutoStopped) {
      this.voiceAutoStopped = false;
      this.voiceLongPressStarted = false;
      this.voiceSuppressTap = true;
      return;
    }
    if (!this.voiceLongPressStarted && !this.data.recording) return;
    this.voiceSuppressTap = true;
    if (this.data.recording) this.stopRecorder();
    else this.voiceStopAfterAuthorization = true;
  },

  onVoiceTouchCancel: function () {
    this.voiceTouching = false;
    this.clearVoiceStartTimer();
    if (this.voiceAutoStopped) {
      this.voiceAutoStopped = false;
      this.voiceLongPressStarted = false;
      this.voiceSuppressTap = true;
      return;
    }
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
    // 我们没要求停，录音器却停了——只可能是它自己走到了 60 秒上限。
    var hitLimit = !this.userStoppedRecorder;
    var filePath = result && (result.tempFilePath || result.filePath);
    var duration = result && result.duration
      ? Math.min(Number(result.duration) / 1000, MAX_RECORD_SECONDS)
      : Math.min((Date.now() - this.recordingStartedAt) / 1000, MAX_RECORD_SECONDS);
    this.stopRecordingTimer();
    this.stopScheduled = false;
    this.setData({ recording: false, recordingSeconds: 0, recordingCountdown: 0 });
    if (hitLimit) {
      // 这一段照常往下转文字：已经说出口的 60 秒不能因为撞到上限就整段丢掉。
      this.voiceAutoStopped = true;
      this.voiceLongPressStarted = false;
      analytics.trackEvent('dream_chat_voice_limit_reached', {
        dreamId: this.currentContextId(),
        durationMs: Math.round(duration * 1000)
      });
      wx.showToast({ title: '已到 60 秒上限，这段收下了 · 可以接着按住说', icon: 'none', duration: 3200 });
    }
    if (!filePath) {
      wx.showToast({ title: voiceFailureMessage({ reason: 'invalid_audio' }), icon: 'none' });
      return;
    }
    // 太短的片段送到 ASR 只会拿回 empty_result，用户读到的是「没有听清」，
    // 会以为是识别不准而反复重试同样短的一下。
    if (duration * 1000 < MIN_RECORD_MS) {
      analytics.trackEvent('dream_chat_voice_failed', { dreamId: this.currentContextId(), reason: 'too_short' });
      wx.showToast({ title: voiceFailureMessage({ reason: 'too_short' }), icon: 'none', duration: 2400 });
      return;
    }
    // 与首页同一条链路：长音频改走云存储，不把 base64 塞进 callFunction 请求体。
    this.setData({ recognizing: true });
    cloudBase.recognizeSpeech(filePath, duration, function (recognizeResult) {
      that.setData({ recognizing: false });
      if (!recognizeResult || !recognizeResult.ok || !recognizeResult.text) {
        analytics.trackEvent('dream_chat_voice_failed', {
          dreamId: that.currentContextId(),
          reason: recognizeResult && recognizeResult.reason ? recognizeResult.reason : 'unknown',
          providerErrorCode: recognizeResult && recognizeResult.providerErrorCode ? recognizeResult.providerErrorCode : '',
          durationMs: Math.round(duration * 1000)
        });
        wx.showToast({ title: voiceFailureMessage(recognizeResult), icon: 'none' });
        return;
      }
      var text = String(recognizeResult.text).trim();
      that.setData({ inputValue: that.data.inputValue ? that.data.inputValue + '\n' + text : text });
      analytics.trackEvent('dream_chat_voice_success', { dreamId: that.currentContextId(), duration: duration, textLength: text.length });
    });
  },

  // 画像纠偏的发送路径。和梦后对话的区别只有三处：不带梦上下文、对话存在本机
  // 而不是挂在某个梦上、说完之后要立刻重新梳理画像——用户来这里就是为了改它，
  // 改完还得他自己去点一下「重新梳理」，这件事就白做了。
  //
  // 云端会把他的原话按 portrait_correction 存进 life_notes，所以这里不需要
  // 上行任何额外的东西：下一版画像自己会读到。
  sendPortraitMessage: function (content, messages) {
    var that = this;
    var requestHistory = messages.slice(-12).map(function (item) {
      return { role: item.role, content: item.content };
    });
    var userMessage = { role: 'user', content: content.slice(0, 500), createdAt: new Date().toISOString() };
    var pending = messages.concat([userMessage]);

    this.setData({
      messages: pending,
      inputValue: '',
      sending: true,
      turnCount: this.data.turnCount + 1,
      scrollTarget: 'message-' + String(pending.length - 1)
    });

    cloudBase.chatAboutPortrait(requestHistory, userMessage.content, function (result) {
      if (!result || !result.reply || result.ok === false) {
        var reason = result && result.reason ? String(result.reason) : 'missing_reply';
        that.setData({
          messages: pending.slice(0, -1),
          inputValue: content,
          sending: false,
          turnCount: Math.max(0, that.data.turnCount - 1),
          scrollTarget: 'message-' + String(Math.max(0, pending.length - 2))
        });
        analytics.trackEvent('portrait_chat_reply_failed', { reason: reason });
        if (result && result.blocked) {
          wx.showModal({
            title: '这段先不由我来接',
            content: String(result.message || '这类内容 Oneiro 暂不解读，请先联系身边可信任的人或当地的支持资源。'),
            confirmText: '知道了',
            showCancel: false
          });
          return;
        }
        wx.showToast({
          title: /timeout|cloud_call_failed|cloud_result_expired|cloud_unavailable/.test(reason)
            ? '网络没接上，内容已放回输入框，可重试'
            : '这次没回上来（' + reason + '），内容已放回输入框',
          icon: 'none',
          duration: 3000
        });
        return;
      }
      var current = that.data.messages.slice();
      current.push({ role: 'assistant', content: String(result.reply), createdAt: new Date().toISOString() });
      writePortraitMessages(current);
      that.setData({
        messages: current,
        sending: false,
        scrollTarget: 'message-' + String(current.length - 1)
      });
      analytics.trackEvent('portrait_chat_reply', { recorded: !!(result && result.recorded) });
      // 他刚说的话已经落进 life_notes，现在让画像去读它。后台跑，不打断对话。
      if (result && result.recorded) {
        dreamMemory.refreshPortraitInBackground({
          cloudBase: cloudBase,
          reason: 'portrait_correction',
          refreshKey: 'portrait-correction-' + String(current.length)
        });
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

    if ((!dream && !this.data.portraitMode) || this.data.sending || this.data.recording || this.data.recognizing) return;
    if (!content) {
      wx.showToast({ title: '先写下你想说的内容', icon: 'none' });
      return;
    }
    if (this.data.portraitMode) return this.sendPortraitMessage(content, messages);
    // 只有发给模型的历史保持 12 条：再长既贵又会让它开始泛泛而谈。存下来的
    // 那份更长，用户回来时读到的仍是完整的对话。
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
        // 内容被安全规则拦下时，云端返回的是一句为这种处境写好的话。它原来和
        // 别的失败一样被这条 toast 盖掉，用户只看到「这次没回上来」——一个刚
        // 说出很重的事的人，收到的是一句系统故障。这类回应必须原样送到，而且
        // 不能说成「可重试」。
        if (result && result.blocked) {
          wx.showModal({
            title: '这段先不由我来接',
            content: String(result.message || '这类内容 Oneiro 暂不解读，请先联系身边可信任的人或当地的支持资源。'),
            confirmText: '知道了',
            showCancel: false
          });
          return;
        }
        // 「没发出去」三个字对所有失败一视同仁，用户既不知道是网络还是服务，
        // 也不知道再点一次有没有用。至少要分出「重试就能好」和「先换文字/
        // 稍后再来」这两类，并且带上原因码——上一轮同步问题就是靠它一次定位的。
        wx.showToast({
          title: /timeout|cloud_call_failed|cloud_result_expired|cloud_unavailable/.test(reason)
            ? '网络没接上，内容已放回输入框，可重试'
            : '这次没回上来（' + reason + '），内容已放回输入框',
          icon: 'none',
          duration: 3000
        });
        return;
      }
      var current = that.data.messages.slice();
      current.push({ role: 'assistant', content: String(result.reply), createdAt: new Date().toISOString() });
      dream.chatMessages = current.slice(-MAX_STORED_MESSAGES);
      dream.updatedAt = new Date().toISOString();
      persistDream(dream, function (saveResult) {
        that.setData({ cloudSyncPending: !(saveResult && saveResult.ok) });
        // 一条消息里常常同时讲了好几件事。云端现在会把它们全部挑出来；只取
        // 第一条的旧写法，剩下的会直接蒸发，用户看到的就是「提取得不全」。
        // gist 和 durable 与 clue 同序等长：一个是列表上的标签，一个说明这条
        // 讲的是持续状态还是当时的一件事（决定它会不会随时间衰减）。缺席
        // （旧云函数、模型没给）时按空、按 false，两边都退回原来的行为。
        var clueGists = Array.isArray(result && result.realityClueGists) ? result.realityClueGists : [];
        var clueDurable = Array.isArray(result && result.realityClueDurable) ? result.realityClueDurable : [];
        var realityClues = (result && result.ok && Array.isArray(result.realityClues)
          ? result.realityClues
          : [result && result.realityClue]
        ).map(function (item, index) {
          return {
            text: String(item || '').trim(),
            gist: String(clueGists[index] || '').trim(),
            durable: clueDurable[index] === true
          };
        }).filter(function (item) { return !!item.text; });
        var realityClue = (realityClues[0] && realityClues[0].text) || '';
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

        if (realityClues.length && saveResult && saveResult.ok) {
          // 每条各写各的：一条失败不该把其他几条一起拖掉，所以失败是逐条排队
          // 补写的。画像只在最后一条回来之后刷新一次。
          var remaining = realityClues.length;
          realityClues.forEach(function (clue, clueIndex) {
            cloudBase.addLifeNote(dream.id, clue.text, '', clue.gist, clue.durable, function (noteResult) {
              remaining -= 1;
              if (noteResult && noteResult.ok) {
                analytics.trackEvent('dream_chat_life_note_extracted', {
                  dreamId: dream.id,
                  deduplicated: !!noteResult.deduplicated,
                  batchSize: realityClues.length
                });
              } else {
                analytics.trackEvent('dream_chat_life_note_failed', {
                  dreamId: dream.id,
                  reason: noteResult && noteResult.reason ? noteResult.reason : 'unknown'
                });
                syncQueue.enqueue('life_note', {
                  dreamId: dream.id,
                  text: clue.text,
                  gist: clue.gist,
                  durable: clue.durable,
                  refreshKey: 'life-note:' + String(dream.id) + ':' + String(current.length) + ':' + String(clueIndex)
                });
              }
              if (remaining <= 0) {
                refreshPortrait(
                  '梦后对话提取了新的现实线索',
                  'life-note:' + String(dream.id) + ':' + String(current.length)
                );
              }
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
