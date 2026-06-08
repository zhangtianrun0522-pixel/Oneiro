function dateLabel(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}.${day}`;
}

Page({
  data: {
    archive: [],
    hasArchive: false
  },

  onShow() {
    const archive = (wx.getStorageSync('oneiro:dreamArchive') || []).map((item) => ({
      ...item,
      dateLabel: dateLabel(item.createdAt)
    }));
    this.setData({ archive, hasArchive: archive.length > 0 });
  },

  openDream(event) {
    const index = event.currentTarget.dataset.index;
    const dream = this.data.archive[index];
    const app = getApp();
    app.globalData.currentDream = dream;
    wx.navigateTo({ url: '/pages/result/index' });
  },

  newDream() {
    wx.navigateTo({ url: '/pages/new-dream/index' });
  }
});
