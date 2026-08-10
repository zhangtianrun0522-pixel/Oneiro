 var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var stagePortrait = require('../../utils/stagePortrait');
var lifeNotes = require('../../utils/lifeNotes');

function emptyProfile() {
  return { nickname: '', birthDate: '', birthTime: '', birthPlace: '', gender: '' };
}

// 「关于你的记录」在这一页只是一个入口：几条、在用几条、大致关于什么。原话、
// 来源梦和标为重要/编辑/删除全部在二级页。分组和标签的算法两页共用一份
// （utils/lifeNotes），各写一份会立刻分叉——同一批记录在两页显示出不同的条数。
function genderIndexFor(value) {
  var normalized = String(value || '').trim().toLowerCase();
  return normalized === 'male' ? 1 : normalized === 'female' ? 2 : 0;
}

function isValidDate(value) {
  var text = String(value || '');
  var parts;
  var date;

  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  parts = text.split('-').map(Number);
  date = new Date(parts[0], parts[1] - 1, parts[2]);
  return parts[0] >= 1900 && parts[0] <= new Date().getFullYear() &&
    date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}

function sameProfile(left, right) {
  return ['nickname', 'birthDate', 'birthTime', 'birthPlace', 'gender'].every(function (key) {
    return String((left && left[key]) || '') === String((right && right[key]) || '');
  });
}

Page({
  data: {
    profile: emptyProfile(),
    genderOptions: ['不填写', '男', '女'],
    genderIndex: 0,
    saving: false,
    // `memoryLoaded` 决定入口显示「正在读取」还是「还在为你梳理」：它从 false
    // 开始，第一次渲染是读取态，而不是先闪一下「还没有画像」。
    memoryLoaded: false,
    portraitLoadError: false,
    portraitGenerateFailed: false,
    portraitMigrationState: '',
    portraitLoading: false,
    portraitAutoGenerateTriggered: false,
    revisit: null,
    revisitAnswering: false,
    revisitAnswerText: '',
    revisitSubmitting: false,
    revisitDisabled: false,
    lifeNotes: [],
    lifeNoteSummary: { total: 0, activeCount: 0, unknownUsage: false, labelLine: '' },
    memoryState: stagePortrait.emptyMemoryState(),
    // 画像在这一页是只读入口，编辑/重新梳理/溯源都在「梦册」顶部。这些键仍然
    // 存在是因为共享控制器（utils/stagePortrait）向它们写状态。
    portraitVersionLabel: '',
    portraitStatusLabel: '',
    portraitHasUpdate: false,
    portraitPaused: false,
    portraitSources: [],
    portraitHistory: [],
    insights: dreamMemory.buildInsights([])
  },

  onLoad: function () {
    var app = getApp();
    var saved = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile || emptyProfile();
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var insights = dreamMemory.buildInsights(archive);
    this.portrait = stagePortrait.createController(this, { cloudBase: cloudBase });
    this.skipNextProfileShowRefresh = true;
    this.setData({
      profile: Object.assign(emptyProfile(), saved),
      genderIndex: genderIndexFor(saved.gender),
      insights: insights,
      lifeNotes: dreamMemory.autoExtractedRealLifeContext(archive).map(function (text, index) {
        return { id: '', localKey: 'local-' + index, text: text, localOnly: true, source: '' };
      })
    });
    this.renderLifeNotes();
    this.portrait.hydrateFromCache();
    analytics.trackEvent('profile_view', { hasBirthDate: !!saved.birthDate });
    this.loadProfileMemory();
    this.loadLifeNotes();
  },

  onShow: function () {
    this.loadRevisit();
    if (this.skipNextProfileShowRefresh) {
      this.skipNextProfileShowRefresh = false;
      return;
    }
    this.loadLifeNotes();
    this.loadProfileMemory();
  },

  // 入口点进去就是梦册顶部的完整面板。
  openPortrait: function () {
    analytics.trackEvent('portrait_entry_open', { from: 'profile' });
    tabNav.switchTab('pages/archive/index');
  },

  loadRevisit: function () {
    var that = this;
    var disabled = !!wx.getStorageSync('oneiro:revisitDisabled');
    this.setData({ revisitDisabled: disabled });
    if (disabled) {
      this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
      return;
    }
    cloudBase.getRevisit(function (result) {
      that.setData({ revisit: result && result.ok && result.dream ? result.dream : null });
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
    var revisit = this.data.revisit;
    var text = String(this.data.revisitAnswerText || '').trim();
    if (!revisit || !revisit.localId || this.data.revisitSubmitting) return;
    if (!text) {
      wx.showToast({ title: '写一句就好', icon: 'none' });
      return;
    }
    this.setData({ revisitSubmitting: true });
    cloudBase.answerRevisit(revisit.localId, text, function (result) {
      that.setData({ revisitSubmitting: false });
      if (!result || !result.ok) {
        wx.showToast({ title: '暂时没有保存成功，请稍后再试', icon: 'none' });
        return;
      }
      that.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
      that.loadLifeNotes();
      that.refreshPortraitInBackground('回访回答后重新理解你', 'revisit:' + String(revisit.localId));
      wx.showToast({ title: '谢谢你的分享，我会记得这一点', icon: 'none' });
    });
  },

  skipRevisitPrompt: function () {
    var revisit = this.data.revisit;
    if (revisit && revisit.localId) cloudBase.skipRevisit(revisit.localId);
    this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
  },

  disableRevisitPrompts: function () {
    var revisit = this.data.revisit;
    wx.setStorageSync('oneiro:revisitDisabled', true);
    if (revisit && revisit.localId) cloudBase.skipRevisit(revisit.localId);
    this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '', revisitDisabled: true });
    wx.showToast({ title: '已关闭，之后不会再提醒', icon: 'none' });
  },

  // Recovers from the one-way `oneiro:revisitDisabled` flag: previously
  // nothing in the app could clear it once a user tapped "关闭提醒", so the
  // revisit feature was permanently gone for them. This gives it back.
  enableRevisitPrompts: function () {
    wx.removeStorageSync('oneiro:revisitDisabled');
    this.setData({ revisitDisabled: false });
    this.loadRevisit();
    wx.showToast({ title: '已恢复回访提醒', icon: 'none' });
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
  },

  refreshPortraitInBackground: function (reason, refreshKey) {
    var that = this;
    return dreamMemory.refreshPortraitInBackground({
      cloudBase: cloudBase,
      reason: reason,
      refreshKey: refreshKey,
      archive: wx.getStorageSync('oneiro:dreamArchive') || [],
      onUpdated: function (state) {
        that.setData(Object.assign(
          { memoryState: stagePortrait.normalizeMemoryState(state) },
          stagePortrait.buildView(state, wx.getStorageSync('oneiro:dreamArchive') || [], {
            memoryLoaded: true
          })
        ));
      }
    });
  },

  // 画像的读取/生成/编辑全部由共享控制器负责（utils/stagePortrait），
  // 梦册顶部渲染完整面板，这一页只渲染入口。两页各自实现会立刻分叉——
  // 同一个快照在两处显示出不同的版本号或状态。
  loadProfileMemory: function () { this.portrait.load(); },

  onInput: function (event) {
    var profile = Object.assign({}, this.data.profile);
    profile[event.currentTarget.dataset.key] = event.detail.value;
    this.setData({ profile: profile });
  },

  onBirthDateChange: function (event) {
    var profile = Object.assign({}, this.data.profile, { birthDate: event.detail.value });
    this.setData({ profile: profile });
  },

  onBirthTimeChange: function (event) {
    var profile = Object.assign({}, this.data.profile, { birthTime: event.detail.value });
    this.setData({ profile: profile });
  },

  onGenderChange: function (event) {
    var index = Number(event.detail.value || 0);
    var profile = Object.assign({}, this.data.profile, {
      gender: index === 1 ? 'male' : index === 2 ? 'female' : ''
    });
    this.setData({ profile: profile, genderIndex: index });
  },

  clearBirthDate: function () {
    var profile = Object.assign({}, this.data.profile, { birthDate: '' });
    this.setData({ profile: profile });
  },

  clearBirthTime: function () {
    var profile = Object.assign({}, this.data.profile, { birthTime: '' });
    this.setData({ profile: profile });
  },

  saveProfile: function () {
    var that = this;
    var app = getApp();
    var previousProfile = wx.getStorageSync('oneiro:lastProfile') || emptyProfile();
    var profile = {
      nickname: String(this.data.profile.nickname || '').trim().slice(0, 30),
      birthDate: String(this.data.profile.birthDate || '').trim(),
      birthTime: String(this.data.profile.birthTime || '').trim(),
      birthPlace: String(this.data.profile.birthPlace || '').trim().slice(0, 60),
      gender: ['male', 'female'].indexOf(String(this.data.profile.gender || '').trim().toLowerCase()) >= 0
        ? String(this.data.profile.gender).trim().toLowerCase()
        : ''
    };

    if (!isValidDate(profile.birthDate)) {
      wx.showToast({ title: '出生日期无效', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    app.globalData.lastProfile = profile;
    wx.setStorageSync('oneiro:lastProfile', profile);
    cloudBase.saveProfile(profile, function (result) {
      that.setData({ saving: false });
      analytics.trackEvent('profile_saved', {
        hasNickname: !!profile.nickname,
        hasBirthDate: !!profile.birthDate,
        hasBirthTime: !!profile.birthTime,
        hasGender: !!profile.gender,
        cloudSaved: !!(result && result.ok)
      });
      wx.showToast({
        title: result && result.ok
          ? (profile.nickname || profile.birthDate || profile.birthTime || profile.birthPlace || profile.gender ? '资料已保存' : '资料已清空')
          : '已保存在本机，云端稍后同步',
        icon: result && result.ok ? 'success' : 'none'
      });
      if (!sameProfile(previousProfile, profile)) {
        that.refreshPortraitInBackground('基础资料更新后重新理解你', 'profile:' + String(Date.now()));
      }
      if (wx.getStorageSync('oneiro:pendingDreamText')) {
        if (wx.navigateBack) {
          wx.navigateBack({ delta: 1 });
        } else {
          tabNav.switchTab('pages/home/index');
        }
      }
    });
  },


  newDream: function () {
    tabNav.switchTab('pages/home/index');
  }

});
