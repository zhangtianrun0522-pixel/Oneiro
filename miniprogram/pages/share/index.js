var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var tabNav = require('../../utils/tabNav');

function fallbackPayload() {
  return {
    title: '梦卡',
    cardNo: 'NO. 001',
    cardTheme: 'mist',
    profileSummary: 'ONEIRO',
    emotionalWeather: '一张梦卡正在路上。',
    symbols: ['梦'],
    cardInsight: '写下你的梦，也可以抽出属于自己的牌。',
  };
}

Page({
  data: {
    loading: true,
    shareId: '',
    payload: fallbackPayload()
  },

  onLoad: function (options) {
    var shareId = options && options.id ? decodeURIComponent(options.id) : '';
    var that = this;

    this.setData({ shareId: shareId });
    analytics.trackEvent('share_card_open', { hasShareId: !!shareId });

    cloudBase.getShareCard(shareId, function (res) {
      if (res && res.ok && res.payload) {
        that.setData({ loading: false, payload: res.payload });
        analytics.trackEvent('share_card_loaded', {
          cardTheme: res.payload.cardTheme || 'mist'
        });
        return;
      }

      that.setData({ loading: false, payload: fallbackPayload() });
      analytics.trackEvent('share_card_load_failed', {
        reason: res && res.reason ? res.reason : 'local_fallback'
      });
    });
  },

  startDream: function () {
    analytics.trackEvent('dream_start', { source: 'share_card' });
    tabNav.switchTab('pages/home/index', { fromShare: true });
  }
});
