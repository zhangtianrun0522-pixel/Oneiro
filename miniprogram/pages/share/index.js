var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var tabNav = require('../../utils/tabNav');

function isInvalidShareReason(reason) {
  return /share_not_found|not_found|expired|revoked/.test(String(reason || '').toLowerCase());
}

Page({
  data: {
    loading: true,
    shareId: '',
    payload: {},
    errorState: ''
  },

  onLoad: function (options) {
    var shareId = '';

    try {
      shareId = options && options.id ? decodeURIComponent(options.id) : '';
    } catch (error) {
      shareId = '';
    }

    this.setData({ shareId: shareId });
    analytics.trackEvent('share_card_open', { hasShareId: !!shareId });

    this.loadShareCard();
  },

  loadShareCard: function () {
    var that = this;
    var shareId = this.data.shareId;

    this.setData({ loading: true, errorState: '' });

    cloudBase.getShareCard(shareId, function (res) {
      if (res && res.ok && res.payload) {
        that.setData({ loading: false, payload: res.payload, errorState: '' });
        analytics.trackEvent('share_card_loaded', {
          cardTheme: res.payload.cardTheme || 'mist'
        });
        return;
      }

      var reason = res && res.reason ? String(res.reason) : 'share_card_load_failed';
      var errorState = isInvalidShareReason(reason) ? 'not_found' : 'unavailable';
      that.setData({ loading: false, payload: {}, errorState: errorState });
      analytics.trackEvent('share_card_load_failed', {
        reason: reason
      });
    });
  },

  startDream: function () {
    analytics.trackEvent('dream_start', { source: 'share_card' });
    tabNav.switchTab('pages/home/index', { fromShare: true });
  }
});
