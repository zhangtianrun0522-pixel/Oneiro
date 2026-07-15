var analytics = require('../../utils/analytics');

Page({
  data: {
    fromShare: false
  },

  onLoad: function (options) {
    var fromShare = options && options.fromShare === '1';
    this.setData({ fromShare: fromShare });
    analytics.trackEvent(fromShare ? 'share_landing_view' : 'home_view', {});
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
