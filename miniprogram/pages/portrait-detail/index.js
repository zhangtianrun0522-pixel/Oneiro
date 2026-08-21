var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var stagePortrait = require('../../utils/stagePortrait');
var lifeNotes = require('../../utils/lifeNotes');

// 画像详情二级页：核对这段判断需要的所有材料。
// 「我的」首屏只放画像正文本身，溯源 / 历史版本 / 修正入口 / 两块养料
// 全部收到这里——首屏是「读一段关于你的话」，这一页是「查这段话的账」。
//
// 画像的读取/生成/编辑仍旧全部走共享控制器（utils/stagePortrait），和
// 「我的」共用同一份状态；各页自己实现会立刻分叉——同一个快照在两处
// 显示出不同的版本号或状态。
Page({
  data: {
    memoryLoaded: false,
    memoryState: stagePortrait.emptyMemoryState(),
    portraitVersionLabel: '',
    portraitVersionText: '',
    portraitVersion: 0,
    portraitDeckLevel: 0,
    portraitStatusLabel: '',
    portraitUpdatedLabel: '',
    portraitHasUpdate: false,
    portraitPaused: false,
    portraitLoading: false,
    portraitLoadError: false,
    portraitGenerateFailed: false,
    portraitMigrationState: '',
    // stagePortrait 的控制器会读写这个标志来防止重复触发生成，
    // 页面必须声明它（见 utils/stagePortrait.js 的 ensureGenerated）。
    portraitAutoGenerateTriggered: false,
    portraitSources: [],
    portraitHistory: [],
    showPortraitSources: false,
    showPortraitHistory: false,
    lifeNotes: [],
    lifeNoteSummary: { total: 0, activeCount: 0, unknownUsage: false, labelLine: '' },
    insights: dreamMemory.buildInsights([])
  },

  onLoad: function () {
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    this.portrait = stagePortrait.createController(this, { cloudBase: cloudBase });
    this.setData({
      insights: dreamMemory.buildInsights(archive),
      lifeNotes: dreamMemory.autoExtractedRealLifeContext(archive).map(function (text, index) {
        return { id: '', localKey: 'local-' + index, text: text, localOnly: true, source: '' };
      })
    });
    this.renderLifeNotes();
    this.portrait.hydrateFromCache();
    analytics.trackEvent('portrait_detail_view', {});
    this.portrait.load();
    this.loadLifeNotes();
  },

  // 从生活记录二级页返回时条数可能已经变了，重新对齐。
  onShow: function () {
    this.loadLifeNotes();
  },

  retryPortrait: function () { this.portrait.retry(); },
  refreshPortrait: function () { this.portrait.refresh(); },
  togglePortraitUse: function () { this.portrait.toggleUse(); },

  openPortraitChat: function () {
    var current = this.data.memoryState && this.data.memoryState.current;
    if (!current || !(current.summary || current.profileText)) return;
    analytics.trackEvent('portrait_chat_open', { version: Number(current.version || 0) });
    wx.navigateTo({ url: '/pages/dream-chat/index?portrait=1' });
  },

  togglePortraitSources: function () {
    var next = !this.data.showPortraitSources;
    this.setData({ showPortraitSources: next });
    if (next) {
      analytics.trackEvent('portrait_sources_open', {
        dreamId: '',
        sourceCount: this.data.portraitSources.length
      });
    }
  },

  openPortraitSource: function (event) {
    var dreamId = String(event.currentTarget.dataset.dreamId || '');
    if (!dreamId) return;
    analytics.trackEvent('portrait_source_open', { dreamId: dreamId });
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dreamId) });
  },

  togglePortraitHistory: function () {
    var next = !this.data.showPortraitHistory;
    this.setData({ showPortraitHistory: next });
    if (next) {
      analytics.trackEvent('portrait_history_open', { versionCount: this.data.portraitHistory.length });
      this.portrait.markSeen();
    }
  },

  loadLifeNotes: function () {
    var that = this;
    cloudBase.getLifeNotes(function (result) {
      if (!result || !result.ok || !Array.isArray(result.notes)) return;
      var notes = result.notes.map(function (note) {
        return Object.assign({}, note, { localKey: note.id || String(note.createdAt || '') });
      });
      that.setData({ lifeNotes: notes });
      that.renderLifeNotes();
    });
  },

  renderLifeNotes: function () {
    var summary = lifeNotes.buildSummary(
      this.data.lifeNotes,
      wx.getStorageSync('oneiro:dreamArchive') || []
    );
    this.setData({
      lifeNoteSummary: Object.assign({}, summary, { labelLine: summary.labels.join(' · ') })
    });
  },

  openLifeNotes: function () {
    analytics.trackEvent('life_notes_open', { total: this.data.lifeNoteSummary.total });
    wx.navigateTo({ url: '/pages/life-notes/index' });
  }
});
