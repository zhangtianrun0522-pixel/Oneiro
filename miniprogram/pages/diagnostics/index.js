var cloudBase = require('../../utils/cloudBase');

function emptyAiHealth() {
  return {
    ok: false,
    provider: 'unknown',
    providerConfigured: false,
    hasApiKey: false,
    requestedModel: '',
    model: '',
    baseUrlHost: '',
    requestTimeoutMs: 0,
    fallbackProvider: ''
  };
}

function emptyCloudHealth() {
  return {
    ok: false,
    env: '',
    appid: '',
    collections: [],
    storage: null
  };
}

function emptySmokeTest() {
  return {
    ok: false,
    provider: '',
    providerConfigured: false,
    reason: 'not_run',
    message: '',
    title: '',
    cardTheme: '',
    symbolCount: 0
  };
}

function emptyImageHealth() {
  return {
    ok: false,
    provider: 'unknown',
    providerConfigured: false,
    reason: '',
    message: '',
    functionName: '',
    hasApiKey: false,
    requestedModel: '',
    model: '',
    endpointHost: '',
    requestedSize: '',
    requestedAspectRatio: '',
    size: '',
    aspectRatio: '',
    quality: '',
    requestTimeoutMs: 0
  };
}

function emptyImageTest() {
  return {
    ok: false,
    provider: '',
    providerConfigured: false,
    reason: 'not_run',
    message: '',
    model: '',
    imageUrl: ''
  };
}

function normalizeAiHealth(health) {
  return Object.assign(emptyAiHealth(), health || {});
}

function normalizeCloudHealth(health) {
  return Object.assign(emptyCloudHealth(), health || {});
}

function normalizeSmokeTest(result) {
  return Object.assign(emptySmokeTest(), result || {});
}

function normalizeImageHealth(health) {
  return Object.assign(emptyImageHealth(), health || {});
}

function normalizeImageTest(result) {
  return Object.assign(emptyImageTest(), result || {});
}

function formatTime(date) {
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();

  return [
    hours < 10 ? '0' + hours : String(hours),
    minutes < 10 ? '0' + minutes : String(minutes),
    seconds < 10 ? '0' + seconds : String(seconds)
  ].join(':');
}

Page({
  data: {
    loading: true,
    updatedAt: '',
    cloudStatus: {
      mode: 'checking',
      cloudReady: false
    },
    aiHealth: emptyAiHealth(),
    imageHealth: emptyImageHealth(),
    cloudHealth: emptyCloudHealth(),
    smokeLoading: false,
    smokeTest: emptySmokeTest(),
    imageLoading: false,
    imageTest: emptyImageTest(),
    portraitLoading: false,
    portraitResult: { ok: false, reason: 'not_run' }
  },

  onLoad: function () {
    this.refresh();
  },

  refresh: function () {
    var that = this;
    var pending = 3;
    var cloudStatus = cloudBase.initCloud();

    this.setData({
      loading: true,
      cloudStatus: {
        mode: cloudStatus ? 'cloud_ready' : 'cloud_unavailable',
        cloudReady: !!cloudStatus
      },
      updatedAt: formatTime(new Date())
    });

    function finish() {
      pending -= 1;
      if (pending <= 0) {
        that.setData({
          loading: false,
          updatedAt: formatTime(new Date())
        });
      }
    }

    cloudBase.aiHealth(function (health) {
      that.setData({ aiHealth: normalizeAiHealth(health) });
      finish();
    });

    cloudBase.imageHealth(function (health) {
      that.setData({ imageHealth: normalizeImageHealth(health) });
      finish();
    });

    cloudBase.cloudHealth(function (health) {
      that.setData({ cloudHealth: normalizeCloudHealth(health) });
      finish();
    });
  },

  startSmokeTest: function () {
    var that = this;

    this.setData({
      smokeLoading: true,
      smokeTest: emptySmokeTest()
    });

    cloudBase.aiSmokeTest(function (result) {
      that.setData({
        smokeLoading: false,
        smokeTest: normalizeSmokeTest(result)
      });
    });
  },

  runSmokeTest: function () {
    var that = this;

    if (!this.data.aiHealth || !this.data.aiHealth.providerConfigured) {
      this.startSmokeTest();
      return;
    }

    wx.showModal({
      title: '确认测试 AI',
      content: '这会发送一次真实 AI 请求，用于验证云函数能返回梦卡结构。',
      confirmText: '开始',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          that.startSmokeTest();
        }
      }
    });
  },

  startImageTest: function () {
    var that = this;

    this.setData({
      imageLoading: true,
      imageTest: emptyImageTest()
    });

    cloudBase.imageSmokeTest(function (result) {
      that.setData({
        imageLoading: false,
        imageTest: normalizeImageTest(result)
      });
    });
  },

  runImageTest: function () {
    var that = this;

    if (!this.data.imageHealth || !this.data.imageHealth.providerConfigured) {
      this.startImageTest();
      return;
    }

    wx.showModal({
      title: '确认测试生图',
      content: '这会发送一次真实生图请求，用于验证云函数能生成梦卡画面。',
      confirmText: '开始',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          that.startImageTest();
        }
      }
    });
  },

  regeneratePortrait: function () {
    var that = this;
    if (this.data.portraitLoading) return;
    this.setData({ portraitLoading: true, portraitResult: { ok: false, reason: 'running' } });
    cloudBase.generateProfilePortrait('管理员诊断：基于修复后的云端数据重新生成', function (result) {
      that.setData({ portraitLoading: false, portraitResult: result || { ok: false, reason: 'empty_result' } });
    });
  }
});
