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
      });
    });
  },

  globalData: {
    cloudStatus: null,
    identity: null,
    currentDream: null,
    currentArtifact: null,
    lastProfile: {
      nickname: '',
      birthDate: '',
      birthTime: '',
      birthPlace: ''
    }
  }
});
