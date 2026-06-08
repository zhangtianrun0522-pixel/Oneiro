Page({
  data: {
    profile: {
      nickname: 'Runtu',
      birthDate: '1998-01-01',
      birthTime: '08:30',
      birthPlace: 'Shanghai'
    }
  },

  onLoad() {
    const app = getApp();
    const savedProfile = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile;
    this.setData({ profile: savedProfile });
  },

  onProfileInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      profile: {
        ...this.data.profile,
        [key]: event.detail.value
      }
    });
  },

  startDream() {
    const { profile } = this.data;

    if (!profile.nickname || !profile.birthDate) {
      wx.showToast({ title: '先留下称呼和生日', icon: 'none' });
      return;
    }

    const app = getApp();
    app.globalData.lastProfile = profile;
    wx.setStorageSync('oneiro:lastProfile', profile);
    wx.navigateTo({ url: '/pages/new-dream/index' });
  },

  openArchive() {
    wx.navigateTo({ url: '/pages/archive/index' });
  }
});
