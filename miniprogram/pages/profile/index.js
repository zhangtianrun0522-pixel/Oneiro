var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');

function emptyProfile() {
  return { nickname: '', birthDate: '', birthTime: '', birthPlace: '' };
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

Page({
  data: {
    profile: emptyProfile(),
    saving: false
  },

  onLoad: function () {
    var app = getApp();
    var saved = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile || emptyProfile();
    this.setData({ profile: Object.assign(emptyProfile(), saved) });
    analytics.trackEvent('profile_view', { hasBirthDate: !!saved.birthDate });
  },

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

  clearBirthDate: function () {
    var profile = Object.assign({}, this.data.profile, { birthDate: '' });
    this.setData({ profile: profile });
  },

  saveProfile: function () {
    var that = this;
    var app = getApp();
    var profile = {
      nickname: String(this.data.profile.nickname || '').trim().slice(0, 30),
      birthDate: String(this.data.profile.birthDate || '').trim(),
      birthTime: String(this.data.profile.birthTime || '').trim(),
      birthPlace: String(this.data.profile.birthPlace || '').trim().slice(0, 60)
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
        cloudSaved: !!(result && result.ok)
      });
      wx.showToast({
        title: profile.nickname || profile.birthDate || profile.birthTime || profile.birthPlace
          ? '资料已保存'
          : '资料已清空',
        icon: 'success'
      });
      if (wx.getStorageSync('oneiro:pendingDreamText')) {
        if (wx.navigateBack) {
          wx.navigateBack({ delta: 1 });
        } else {
          wx.navigateTo({ url: '/pages/new-dream/index' });
        }
      }
    });
  }
});
