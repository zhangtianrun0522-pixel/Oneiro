var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var lifeNotes = require('../../utils/lifeNotes');

// ── 关于你的记录（详情） ────────────────────────────────────────────────
//
// 这一屏原来整个塞在资料页里：两组、每条的全文、来源梦、标为重要/编辑/删除，
// 全部铺开。资料页于是变成一份长清单，而它本来只需要回答一句「系统记着我什么」。
// 现在资料页只留一个入口，原话、来源和所有操作都在这里——要改要删的人愿意多点
// 一下，只想扫一眼的人不必先滚过十几条原话。
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

  // 「一直重要」：钉住的记录不参与排队，永远占一个名额。哪些还算数由用户说了
  // 算，不是我们拿一个时间窗替他决定。
  togglePin: function (event) {
    var that = this;
    var note = this.findNote(event);
    if (!note || !note.id) {
      wx.showToast({ title: '联网后可标记这条', icon: 'none' });
      return;
    }
    var nextPinned = !note.pinnedAt;
    cloudBase.pinLifeNote(note.id, nextPinned, function (result) {
      if (!result || !result.ok) {
        wx.showToast({ title: '暂时没成功，请稍后再试', icon: 'none' });
        return;
      }
      that.load();
      that.refreshPortrait(
        nextPinned ? '用户标记了一条一直重要的记录' : '用户取消了一条记录的标记',
        'life-note-pin:' + note.id + ':' + String(Date.now())
      );
      wx.showToast({ title: nextPinned ? '已标记为一直重要' : '已取消标记', icon: 'none' });
    });
  },

  editNote: function (event) {
    var that = this;
    var note = this.findNote(event);
    if (!note || !note.id) {
      wx.showToast({ title: '联网后可修改这条片段', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改现实片段',
      editable: true,
      content: note.text,
      placeholderText: note.text,
      success: function (res) {
        var text = String(res.content || '').trim();
        if (!res.confirm || !text || text === note.text) return;
        cloudBase.editLifeNote(note.id, text, function (result) {
          if (!result || !result.ok) {
            wx.showToast({ title: '修改失败，请稍后再试', icon: 'none' });
            return;
          }
          that.load();
          that.refreshPortrait('用户修改了现实片段', 'life-note-edit:' + note.id + ':' + String(Date.now()));
          wx.showToast({ title: '现实片段已修改', icon: 'success' });
        });
      }
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
