Component({
  data: {
    visible: false
  },

  lifetimes: {
    attached: function () {
      var self = this;

      // 低版本基础库上这个 API 不存在。让它直接抛出去会把整个页面打挂——
      // 而隐私弹窗弹不出来的后果，只是隐私接口调不动，不该连累打字记梦。
      if (!wx.onNeedPrivacyAuthorization) return;

      wx.onNeedPrivacyAuthorization(function (resolve) {
        self.resolvePrivacyAuthorization = resolve;
        self.setData({ visible: true });
      });
    }
  },

  methods: {
    handleAgree: function () {
      if (this.resolvePrivacyAuthorization) {
        this.resolvePrivacyAuthorization({ event: 'agree', buttonId: 'agree-btn' });
        this.resolvePrivacyAuthorization = null;
      }
      this.setData({ visible: false });
    },

    handleDisagree: function () {
      // 拒绝不该把人卡住。这个产品的主干——打字记梦、读解读、翻梦册——一个隐私
      // 接口都不需要，只有语音输入和存图要。所以这里就是个平等的选项。
      if (this.resolvePrivacyAuthorization) {
        this.resolvePrivacyAuthorization({ event: 'disagree' });
        this.resolvePrivacyAuthorization = null;
      }
      this.setData({ visible: false });
    },

    handleOpenContract: function () {
      if (!wx.openPrivacyContract) return;
      wx.openPrivacyContract({
        fail: function () {
          wx.showToast({ title: '指引暂时打不开，稍后再试', icon: 'none' });
        }
      });
    },

    // 隐私授权必须显式选择，点遮罩不关闭。
    noop: function () {}
  }
});
