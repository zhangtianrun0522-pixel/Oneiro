var analytics = require('./utils/analytics');
var cloudBase = require('./utils/cloudBase');

App({
  onLaunch: function () {
    var that = this;

    analytics.trackEvent('app_start', { source: 'miniprogram' });
    cloudBase.initCloud(function (status) {
      that.globalData.cloudStatus = status;
      analytics.trackEvent('cloud_status', { mode: status.mode });
      cloudBase.getIdentity(function (identity) {
        that.globalData.identity = identity;
        analytics.trackEvent('login_ready', { source: identity.source });
        cloudBase.flushEvents(analytics.getEvents());
        that.flushPendingDreamDeletes();
      });
    });
  },

  flushPendingDreamDeletes: function () {
    var pending = wx.getStorageSync('oneiro:pendingCloudDeletes') || [];
    if (!Array.isArray(pending) || !pending.length) return;
    var remaining = pending.slice();
    pending.forEach(function (dreamId) {
      cloudBase.deleteDream(dreamId, function (result) {
        if (!result || !result.ok) return;
        remaining = remaining.filter(function (item) { return item !== dreamId; });
        wx.setStorageSync('oneiro:pendingCloudDeletes', remaining);
      });
    });
  },

  globalData: {
    cloudStatus: null,
    // switchTab 不能带查询串，跳 tab 的参数在这里中转（见 utils/tabNav.js）
    pendingTabParams: {},
    identity: null,
    currentDream: null,
    currentArtifact: null,
    lastProfile: {
      nickname: '',
      birthDate: '',
      birthTime: '',
      birthPlace: '',
      gender: ''
    }
  }
});
