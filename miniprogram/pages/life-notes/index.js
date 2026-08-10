var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var lifeNotes = require('../../utils/lifeNotes');

// ── 关于你的记录（详情） ────────────────────────────────────────────────
//
// 这一屏原来整个塞在资料页里：两组、每条的全文、来源梦、逐条操作，全部铺开。
// 资料页于是变成一份长清单，而它本来只需要回答一句「系统记着我什么」。现在
// 资料页只留一个入口，原话和来源都在这里。
//
// 这里只剩「删除」一个操作。
//
// 「标为重要」去掉了：让用户给自己的记录做整理，等于把系统该做的判断转嫁给
// 他，而且这道题本来就不该按「重不重要」分，该按「是一个状态还是一件当时的
// 事」分——那个判断在提取那一刻就做完了（life_notes.durable），用户什么都不
// 用做。整理靠说话完成：后来说了「回国了」，前面那条自己退休。
//
// 「编辑」也去掉了：这一格写着「你说的话原样存下来，没有改写」，却允许改写，
// 自相矛盾。提取抓错了的时候，删掉比改掉诚实。删除留着——那不是整理，那是他
// 对自己数据的正当控制。
Page({
  data: {
    loaded: false,
    loadFailed: false,
    notes: [],
    groups: [],
    expandedGroups: {}
  },

  onLoad: function () {
    analytics.trackEvent('life_notes_view', {});
    this.load();
  },

  onShow: function () {
    if (this.data.loaded) this.load();
  },

  load: function () {
    var that = this;
    cloudBase.getLifeNotes(function (result) {
      if (!result || !result.ok || !Array.isArray(result.notes)) {
        that.setData({ loaded: true, loadFailed: true });
        return;
      }
      var notes = result.notes.map(function (note) {
        return Object.assign({}, note, { localKey: note.id || String(note.createdAt || '') });
      });
      that.setData({ notes: notes, loaded: true, loadFailed: false });
      that.render();
    });
  },

  render: function () {
    this.setData({
      groups: lifeNotes.buildGroups(
        this.data.notes,
        wx.getStorageSync('oneiro:dreamArchive') || [],
        this.data.expandedGroups
      )
    });
  },

  toggleGroup: function (event) {
    var key = String(event.currentTarget.dataset.group || '');
    var next = Object.assign({}, this.data.expandedGroups);
    next[key] = !next[key];
    this.setData({ expandedGroups: next });
    this.render();
  },

  findNote: function (event) {
    var key = String(event.currentTarget.dataset.key || '');
    var matched = this.data.notes.filter(function (note) {
      return String(note.localKey || note.id || '') === key;
    });
    return matched[0] || null;
  },

  openNoteDream: function (event) {
    var dreamId = String(event.currentTarget.dataset.dreamId || '');
    if (!dreamId) return;
    analytics.trackEvent('life_note_open_dream', { dreamId: dreamId });
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dreamId) });
  },

  refreshPortrait: function (reason, refreshKey) {
    return dreamMemory.refreshPortraitInBackground({
      cloudBase: cloudBase,
      reason: reason,
      refreshKey: refreshKey,
      archive: wx.getStorageSync('oneiro:dreamArchive') || []
    });
  },

  deleteNote: function (event) {
    var that = this;
    var note = this.findNote(event);
    if (!note || !note.id) {
      wx.showToast({ title: '联网后可删除这条片段', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除这条现实片段？',
      content: '删除后，它不会再用于画像和后续梦境关联。',
      confirmText: '删除',
      confirmColor: '#b85c54',
      success: function (res) {
        if (!res.confirm) return;
        cloudBase.deleteLifeNote(note.id, function (result) {
          if (!result || !result.ok) {
            wx.showToast({ title: '删除失败，请稍后再试', icon: 'none' });
            return;
          }
          that.load();
          that.refreshPortrait('用户删除了现实片段', 'life-note-delete:' + note.id + ':' + String(Date.now()));
          wx.showToast({ title: '现实片段已删除', icon: 'success' });
        });
      }
    });
  }
});
