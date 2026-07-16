var analytics = require('../../utils/analytics');

function dateLabel(value) {
  var date = new Date(value);
  var now;
  var month = date.getMonth() + 1;
  var day = date.getDate();

  if (isNaN(date.getTime())) {
    now = new Date();
    month = now.getMonth() + 1;
    day = now.getDate();
  }

  month = month < 10 ? '0' + month : String(month);
  day = day < 10 ? '0' + day : String(day);
  return month + '.' + day;
}

Page({
  data: {
    archive: [],
    archiveCount: 0,
    hasArchive: false
  },

  onLoad: function (options) {
    this.options = options || {};
  },

  onShow: function () {
    var savedArchive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var archive = savedArchive.map(function (item, index) {
      if (!item.id) {
        item.id = String(item.createdAt || Date.now()) + '-' + index;
      }
      if (!item.createdAt) {
        item.createdAt = new Date().toISOString();
      }
      item.dateLabel = dateLabel(item.createdAt);
      return item;
    });
    wx.setStorageSync('oneiro:dreamArchive', archive);
    var symbolFilter = this.options && this.options.symbolFilter ? decodeURIComponent(this.options.symbolFilter) : '';
    var filteredArchive = symbolFilter
      ? archive.filter(function (item) {
        var symbols = item.result && Array.isArray(item.result.symbols) ? item.result.symbols : [];
        return symbols.indexOf(symbolFilter) >= 0;
      })
      : archive;
    this.setData({
      archive: filteredArchive,
      archiveCount: filteredArchive.length,
      hasArchive: filteredArchive.length > 0,
      symbolFilter: symbolFilter
    });
    analytics.trackEvent('archive_view', {
      archiveCount: filteredArchive.length
    });
  },

  clearFilter: function () {
    this.options = Object.assign({}, this.options, { symbolFilter: '' });
    this.onShow();
  },

  openDream: function (event) {
    var index = event.currentTarget.dataset.index;
    var dream = this.data.archive[index];
    var app = getApp();
    app.globalData.currentDream = dream;
    analytics.trackEvent('archive_revisit', {
      dreamId: dream.id || '',
      cardTheme: dream.result && dream.result.card_theme ? dream.result.card_theme : 'mist'
    });
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
  },

  newDream: function () {
    analytics.trackEvent('dream_start', { source: 'archive' });
    wx.navigateTo({ url: '/pages/new-dream/index' });
  }
});
