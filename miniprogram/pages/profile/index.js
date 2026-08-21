 var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var stagePortrait = require('../../utils/stagePortrait');

function emptyProfile() {
  return { nickname: '', birthDate: '', birthTime: '', birthPlace: '', gender: '' };
}

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
    showProfileEdit: false,
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
    memoryState: stagePortrait.emptyMemoryState(),
    // 这一页只渲染画像正文本身。溯源 / 历史版本 / 修正入口连同它们的数据
    // 都在 pages/portrait-detail，所以这里不再持有 portraitSources /
    // portraitHistory / lifeNotes。insights 不渲染但要留着：控制器自动生成
    // 画像时会读 insights.dreamCount 上报（见 stagePortrait.ensureGenerated），
    // 拿不到就会把梦数记成 0。
    // portraitDeckLevel 决定正文背后垫几层纸（版本越多越厚）。
    portraitVersionLabel: '',
    portraitVersionText: '',
    portraitVersion: 0,
    portraitDeckLevel: 0,
    portraitStatusLabel: '',
    portraitUpdatedLabel: '',
    portraitHasUpdate: false,
    portraitPaused: false,
    insights: dreamMemory.buildInsights([])
  },

  onLoad: function () {
    var app = getApp();
    var saved = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile || emptyProfile();
    this.portrait = stagePortrait.createController(this, { cloudBase: cloudBase });
    this.skipNextProfileShowRefresh = true;
    this.setData({
      profile: Object.assign(emptyProfile(), saved),
      genderIndex: genderIndexFor(saved.gender),
      insights: dreamMemory.buildInsights(wx.getStorageSync('oneiro:dreamArchive') || [])
    });
    this.portrait.hydrateFromCache();
    analytics.trackEvent('profile_view', { hasBirthDate: !!saved.birthDate });
    this.loadProfileMemory();
  },

  // 从画像详情页返回时那边可能刚「重新梳理」过，回来要对齐版本。
  onShow: function () {
    this.loadRevisit();
    if (this.skipNextProfileShowRefresh) {
      this.skipNextProfileShowRefresh = false;
      return;
    }
    this.loadProfileMemory();
  },

  // 溯源 / 历史版本 / 修正入口 / 两块养料全部在这个二级页，本页只留画像
  // 正文本身。两页共用 utils/stagePortrait 的同一份状态。
  openPortraitDetail: function () {
    analytics.trackEvent('portrait_entry_open', { from: 'profile' });
    wx.navigateTo({ url: '/pages/portrait-detail/index' });
  },

  toggleProfileEdit: function () {
    this.setData({ showProfileEdit: !this.data.showProfileEdit });
  },

  // ── 阶段画像：编辑/重新梳理/溯源，原来在「梦册」顶部 ──
  retryPortrait: function () { this.portrait.retry(); },





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
      // 这条回答会进 life_notes，但生活记录的读取现在归画像详情页——它下次
      // 进入时自己拉。这里只要把画像本身重新梳理一遍。
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
      // 这里原本有一段「存在未提交草稿就自动返回记梦页」。它是两页合并前的
      // 遗留：那时资料页是从写梦流程里 navigateTo 进来的，返回有意义。现在
      // 「我的」是 tabBar 页，既没有可返回的页面栈，用户也是自己点 tab 进来
      // 的——保存完资料就把他弹走，是替他做了他没要求的决定。
    });
  },



});
