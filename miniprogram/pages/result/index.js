const { acceptanceDreamResult, acceptanceDreamText } = require('../../utils/acceptanceDream');

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

Page({
  data: {
    displayDate: formatDate(new Date()),
    dream: {
      dreamText: acceptanceDreamText,
      result: acceptanceDreamResult
    }
  },

  onLoad() {
    const app = getApp();
    const dream = app.globalData.currentDream || this.data.dream;
    this.setData({ dream });
  },

  onShareAppMessage() {
    return {
      title: `我刚抽到一张梦卡：${this.data.dream.result.title}`,
      path: '/pages/home/index',
      imageUrl: ''
    };
  },

  saveCard() {
    wx.showToast({
      title: 'Canvas 导出将在下一阶段接入',
      icon: 'none'
    });
  }
});
