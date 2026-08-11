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

function emptyFeedbackStats() {
  return {
    ok: false,
    total: 0,
    excerptsEnabled: false,
    counts: {
      inspiring: 0,
      too_generic: 0,
      too_mystical: 0,
      not_grounded: 0
    },
    recent: []
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

function feedbackLabel(value) {
  return {
    inspiring: '有感觉',
    too_generic: '有点泛',
    too_mystical: '太玄了',
    not_grounded: '不贴合'
  }[value] || value || '-';
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function feedbackTime(value) {
  if (!value) return '-';
  try {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  } catch (error) {
    return '-';
  }
}

function normalizeFeedbackStats(result) {
  var stats = Object.assign(emptyFeedbackStats(), result || {});
  stats.counts = Object.assign(emptyFeedbackStats().counts, (result && result.counts) || {});
  stats.recent = (Array.isArray(result && result.recent) ? result.recent : []).map(function (item) {
    return Object.assign({}, item, {
      feedbackLabel: feedbackLabel(item && item.feedback),
      feedbackTime: feedbackTime(item && item.feedbackAt)
    });
  });
  return stats;
}

// 样本量太小的时候一个百分比会撒谎：3 次里失败 1 次显示 33.3%，读起来像
// 系统在崩，其实只是还没有数据。所以每个比率都带上分母一起显示。
function percentText(value, sampleSize) {
  if (value === null || value === undefined || !sampleSize) return '样本不足';
  return String(value) + '%';
}

// 云端算过的比例直接用，这里只负责把「某个原因占全部失败的几成」算出来。
function ratioOf(part, total) {
  if (!total) return null;
  return Math.round((Number(part || 0) / Number(total)) * 1000) / 10;
}

function normalizeInternalStats(result) {
  if (!result || !result.ok) return null;

  var echo = (result.memoryEcho && result.memoryEcho.ok) ? result.memoryEcho : null;
  var depth = (result.readingDepth && result.readingDepth.ok) ? result.readingDepth : null;
  var retention = (result.retention && result.retention.ok) ? result.retention : null;
  var pipeline = (result.pipeline && result.pipeline.ok) ? result.pipeline : null;
  var interpretation = pipeline ? pipeline.interpretation : null;
  var image = pipeline ? pipeline.image : null;
  var imageDreams = (result.imageDreams && result.imageDreams.ok) ? result.imageDreams : null;
  var imageReasons = (result.imageReasons && result.imageReasons.ok) ? result.imageReasons : null;

  return {
    generatedAt: feedbackTime(result.generatedAt),
    memoryEcho: echo ? {
      hitRateText: percentText(echo.hitRate, echo.offeredReadings),
      // 「12 / 18 次带呼应的解读点名了记忆」——分子分母都摆出来，比一个孤零零
      // 的百分比更容易判断这轮内测的样本够不够。
      detail: String(echo.hitReadings) + ' / ' + String(echo.offeredReadings) + ' 次带呼应的解读',
      echoUseRateText: percentText(echo.echoUseRate, echo.offeredEchoes),
      echoDetail: String(echo.usedEchoes) + ' / ' + String(echo.offeredEchoes) + ' 处呼应被写进解读'
    } : null,
    readingDepth: depth ? {
      expandRateText: percentText(depth.expandRate, depth.viewedDreams),
      detail: String(depth.expandedDreams) + ' / ' + String(depth.viewedDreams) + ' 个梦的折叠区被展开过'
    } : null,
    retention: retention ? {
      atLeast1: retention.atLeast1,
      atLeast3: retention.atLeast3,
      atLeast5: retention.atLeast5,
      rate3Text: percentText(retention.rate3, retention.atLeast1),
      rate5Text: percentText(retention.rate5, retention.atLeast1),
      dreamsPerUser: retention.dreamsPerUser === null ? '-' : String(retention.dreamsPerUser),
      totalDreams: retention.totalDreams
    } : null,
    interpretation: interpretation ? {
      failureRateText: percentText(interpretation.failureRate, interpretation.attempts),
      detail: String(interpretation.failed) + ' / ' + String(interpretation.attempts) + ' 次解读尝试失败'
    } : null,
    image: image ? {
      failureRateText: percentText(image.failureRate, image.attempts),
      detail: String(image.failed) + ' / ' + String(image.attempts) + ' 次生图尝试失败'
    } : null,
    // 这个才是要看的那个数：多少条梦最终没有画面。上面那个失败率数的是事件，
    // 而事件的计法是偏的——成功的梦只记一次，坏掉的梦每打开一次再记一次。
    imageDreams: imageDreams ? {
      missingRateText: percentText(imageDreams.missingRate, imageDreams.total),
      detail: String(imageDreams.missing) + ' / ' + String(imageDreams.total) + ' 条已解读的梦没有画面'
    } : null,
    // 失败原因一直存在事件里，只是从来没人问过它。
    imageReasons: imageReasons ? {
      total: imageReasons.total,
      syncTotal: imageReasons.syncTotal,
      rows: (imageReasons.reasons || []).map(function (row) {
        return {
          reason: row.reason,
          count: row.count,
          shareText: percentText(ratioOf(row.count, imageReasons.total), imageReasons.total)
        };
      })
    } : null
  };
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
    identity: { openid: '', source: '' },
    feedbackStats: null,
    internalStats: null,
    statsLoading: false,
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
    var pending = 6;
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

    cloudBase.getIdentity(function (identity) {
      that.setData({ identity: identity || { openid: '', source: '' } });
      finish();
    });

    cloudBase.getFeedbackStats(function (stats) {
      that.setData({ feedbackStats: stats && stats.ok ? normalizeFeedbackStats(stats) : null });
      finish();
    });

    cloudBase.getInternalStats(function (stats) {
      that.setData({ internalStats: normalizeInternalStats(stats) });
      finish();
    });
  },

  // 内测期间这几个数会随着测试者用而变，单独给一个刷新按钮，免得为了看一眼
  // 反馈就把 AI/生图健康检查整套重跑一遍。
  refreshStats: function () {
    var that = this;
    if (this.data.statsLoading) return;
    this.setData({ statsLoading: true });

    var pending = 2;
    function finish() {
      pending -= 1;
      if (pending <= 0) that.setData({ statsLoading: false });
    }

    cloudBase.getFeedbackStats(function (stats) {
      that.setData({ feedbackStats: stats && stats.ok ? normalizeFeedbackStats(stats) : null });
      finish();
    });

    cloudBase.getInternalStats(function (stats) {
      that.setData({ internalStats: normalizeInternalStats(stats) });
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
