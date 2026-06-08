const { acceptanceDreamText, acceptanceDreamResult } = require('../../utils/acceptanceDream');

Page({
  data: {
    dreamText: acceptanceDreamText
  },

  onDreamInput(event) {
    this.setData({ dreamText: event.detail.value });
  },

  useSample() {
    this.setData({ dreamText: acceptanceDreamText });
  },

  generateDreamCard() {
    const dreamText = this.data.dreamText.trim();

    if (!dreamText) {
      wx.showToast({ title: '先写下一点梦', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '梦境显影中' });

    setTimeout(() => {
      const app = getApp();
      const dream = {
        id: `${Date.now()}`,
        dreamText,
        result: acceptanceDreamResult,
        createdAt: new Date().toISOString()
      };
      const archive = wx.getStorageSync('oneiro:dreamArchive') || [];

      app.globalData.currentDream = dream;
      wx.setStorageSync('oneiro:dreamArchive', [dream, ...archive].slice(0, 5));
      wx.hideLoading();
      wx.navigateTo({ url: '/pages/result/index' });
    }, 700);
  }
});
