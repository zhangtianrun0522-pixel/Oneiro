var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');

var MAX_USER_TURNS = 6;

function findDream(id) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var target = decodeURIComponent(id || '');
  var i;
  for (i = 0; i < archive.length; i += 1) {
    if (archive[i].id === target) return archive[i];
  }
  return null;
}

function persistDream(dream) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var next = archive.map(function (item) { return item.id === dream.id ? dream : item; });
  wx.setStorageSync('oneiro:dreamArchive', next);
  cloudBase.saveDream(dream);
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
    turnCount: 0,
    maxTurns: MAX_USER_TURNS,
    scrollTarget: ''
  },

  onLoad: function (options) {
    var dream = findDream(options && options.id);
    var messages;

    if (!dream || !dream.result) {
      wx.showToast({ title: '暂时找不到这个梦', icon: 'none' });
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
    analytics.trackEvent('dream_chat_view', { dreamId: dream.id, existingMessages: messages.length });
  },

  onInput: function (event) {
    this.setData({ inputValue: event.detail.value });
  },

  confirmLifeNote: function (event) {
    var that = this;
    var index = event.currentTarget.dataset.index;
    var messages = this.data.messages.slice();
    var message = messages[index];
    var dream = this.data.dream;
    if (!message || message.confirmed || !dream || !dream.id) return;
    cloudBase.addLifeNote(dream.id, message.content, function (result) {
      if (!result || !result.ok) {
        wx.showToast({ title: '暂时无法确认，请稍后再试', icon: 'none' });
        return;
      }
      message.confirmed = true;
      messages[index] = message;
      dream.chatMessages = messages.slice(-12);
      dream.updatedAt = new Date().toISOString();
      persistDream(dream);
      that.setData({ dream: dream, messages: messages });
      wx.showToast({ title: '已记住，会在合适的时候引用', icon: 'none' });
    });
  },

  sendMessage: function () {
    var that = this;
    var dream = this.data.dream;
    var content = String(this.data.inputValue || '').trim();
    var messages = this.data.messages.slice();
    var requestHistory;
    var userMessage;

    if (!dream || this.data.sending) return;
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
      persistDream(dream);
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
