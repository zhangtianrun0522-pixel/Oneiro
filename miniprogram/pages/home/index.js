var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');

Page({
  data: {
    fromShare: false,
    revisit: null,
    revisitAnswering: false,
    revisitAnswerText: ''
  },

  onLoad: function (options) {
    var fromShare = options && options.fromShare === '1';
    this.setData({ fromShare: fromShare });
    analytics.trackEvent(fromShare ? 'share_landing_view' : 'home_view', {});
  },

  onShow: function () {
    var that = this;

    if (wx.getStorageSync('oneiro:revisitDisabled')) return;

    cloudBase.getRevisit(function (result) {
      if (result && result.ok && result.dream) {
        that.setData({ revisit: result.dream });
      }
    });
  },

  startAnswerRevisit: function () {
    this.setData({ revisitAnswering: true });
  },

  onRevisitAnswerInput: function (event) {
    this.setData({ revisitAnswerText: event.detail.value });
  },

  submitRevisitAnswer: function () {
    var that = this;
    var text = String(this.data.revisitAnswerText || '').trim();

    if (!text) {
      wx.showToast({ title: '写一句就好', icon: 'none' });
      return;
    }

    cloudBase.answerRevisit(this.data.revisit.localId, text, function (result) {
      if (result && result.ok) {
        that.setData({
          revisit: null,
          revisitAnswering: false,
          revisitAnswerText: ''
        });
        wx.showToast({ title: '谢谢你的分享，我会记得这一点', icon: 'none' });
      }
    });
  },

  skipRevisitPrompt: function () {
    cloudBase.skipRevisit(this.data.revisit.localId);
    this.setData({ revisit: null });
  },

  disableRevisitPrompts: function () {
    wx.setStorageSync('oneiro:revisitDisabled', true);
    cloudBase.skipRevisit(this.data.revisit.localId);
    this.setData({ revisit: null });
    wx.showToast({ title: '已关闭，之后不会再提醒', icon: 'none' });
  },

  startDream: function () {
    analytics.trackEvent('dream_start', { source: 'home' });
    wx.navigateTo({ url: '/pages/new-dream/index' });
  },

  openArchive: function () {
    analytics.trackEvent('archive_open', { source: 'home' });
    wx.navigateTo({ url: '/pages/archive/index' });
  },

  openProfile: function () {
    analytics.trackEvent('profile_open', { source: 'home' });
    wx.navigateTo({ url: '/pages/profile/index' });
  }
});
