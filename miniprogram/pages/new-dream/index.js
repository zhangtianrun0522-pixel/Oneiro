var acceptance = require('../../utils/acceptanceDream');
var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var contentSafety = require('../../utils/contentSafety');
var localDreamOracle = require('../../utils/localDreamOracle');
var acceptanceDreamText = acceptance.acceptanceDreamText;
var acceptanceDreamResult = acceptance.acceptanceDreamResult;

function createLocalResult(dreamText, profile, cardIndex) {
  var localResult = localDreamOracle.buildLocalDreamResult(acceptanceDreamResult, dreamText);
  localResult.card_no = 'NO. ' + String(cardIndex).padStart(3, '0');
  localResult.profile_summary = '本地解读';
  localResult.bazi_chart = {
    available: false,
    precision: 'cloud_unavailable',
    summary: '本次未生成出生节律参考。',
    basis: '背景计算暂时不可用，不使用语言模型猜测结果。'
  };
  localResult.metaphysical_resonance = '';
  localResult.metaphysical_basis = '';
  localResult.mirror = '一种可能是：' + localResult.mirror + '这也可能只是偶然的梦中组合，目前还不足以下结论。';
  localResult.possible_connections = [localResult.mirror].filter(Boolean);
  return localResult;
}

function normalizeFactList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(function (item) {
    return String(item || '').trim();
  }).filter(Boolean).slice(0, 6);
}

function normalizeDreamFacts(result, dreamText) {
  var facts = result && result.dream_facts ? result.dream_facts : {};
  var symbols = result && Array.isArray(result.symbols) ? result.symbols : [];
  var text = String(dreamText || '');
  var people = normalizeFactList(facts.people);
  var places = normalizeFactList(facts.places);
  var objects = normalizeFactList(facts.objects);
  var actions = normalizeFactList(facts.actions);
  var emotions = normalizeFactList(facts.emotions);
  var timeSense = normalizeFactList(facts.time_sense || facts.timeSense);

  if (!places.length) {
    places = symbols.filter(function (symbol) {
      return /学校|家屋|图书馆|清水/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!objects.length) {
    objects = symbols.filter(function (symbol) {
      return /钥匙|门|月光|鸟/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!actions.length) {
    actions = symbols.filter(function (symbol) {
      return /追逐|坠落/.test(String(symbol));
    }).slice(0, 4);
  }
  if (!people.length) {
    ['妈妈', '爸爸', '父亲', '母亲', '同学', '老师', '陌生人'].forEach(function (person) {
      if (text.indexOf(person) >= 0 && people.indexOf(person) < 0) people.push(person);
    });
  }
  if (!emotions.length) {
    ['害怕', '紧张', '焦虑', '难过', '安心', '平静', '孤独', '兴奋', '愤怒'].forEach(function (emotion) {
      if (text.indexOf(emotion) >= 0) emotions.push(emotion);
    });
  }
  if (!timeSense.length) {
    ['清晨', '白天', '黄昏', '夜晚', '深夜', '小时候'].forEach(function (time) {
      if (text.indexOf(time) >= 0) timeSense.push(time);
    });
  }

  return {
    people: people,
    places: places,
    objects: objects,
    actions: actions,
    emotions: emotions,
    time_sense: timeSense
  };
}

function upsertLocalDream(dream) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var next = archive.filter(function (item) {
    return item.id !== dream.id;
  });

  next.unshift(dream);
  wx.setStorageSync('oneiro:dreamArchive', next.slice(0, 30));
}

function readProfile() {
  var app = getApp();
  var stored = wx.getStorageSync('oneiro:lastProfile') || {};
  var globalProfile = app && app.globalData ? app.globalData.lastProfile || {} : {};

  return {
    nickname: String(stored.nickname || globalProfile.nickname || '').trim(),
    birthDate: String(stored.birthDate || globalProfile.birthDate || '').trim(),
    birthTime: String(stored.birthTime || globalProfile.birthTime || '').trim(),
    birthPlace: String(stored.birthPlace || globalProfile.birthPlace || '').trim()
  };
}

Page({
  data: {
    dreamText: ''
  },

  onLoad: function () {
    var pendingDreamText = wx.getStorageSync('oneiro:pendingDreamText') || '';
    if (pendingDreamText) {
      this.setData({ dreamText: pendingDreamText });
    }
  },

  onShow: function () {
    var pendingDreamText = wx.getStorageSync('oneiro:pendingDreamText') || '';
    if (pendingDreamText && pendingDreamText !== this.data.dreamText) {
      this.setData({ dreamText: pendingDreamText });
    }
  },

  onDreamInput: function (event) {
    this.setData({ dreamText: event.detail.value });
  },

  useSample: function () {
    this.setData({ dreamText: acceptanceDreamText });
    analytics.trackEvent('sample_dream_used', {});
  },

  generateDreamCard: function () {
    var dreamText = this.data.dreamText.trim();
    var profile = readProfile();
    var safety = contentSafety.validateDreamText(dreamText);
    analytics.trackEvent('dream_submit', {
      length: dreamText.length
    });

    if (!safety.safe) {
      analytics.trackEvent('dream_submit_blocked', {
        reason: safety.message
      });
      if (safety.message.length > 12) {
        wx.showModal({
          title: '暂不生成梦卡',
          content: safety.message,
          confirmText: '知道了',
          showCancel: false
        });
      } else {
        wx.showToast({ title: safety.message, icon: 'none' });
      }
      return;
    }

    wx.showLoading({ title: '记下这个梦' });

    setTimeout(function () {
      var app = getApp();
      var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
      var cardIndex = archive.length + 1;
      var createdAt = new Date().toISOString();
      var dreamId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      var pendingDream = {
        id: dreamId,
        dreamText: dreamText,
        status: 'pending',
        result: null,
        dreamFacts: {
          people: [], places: [], objects: [], actions: [], emotions: [], time_sense: []
        },
        interpretationSource: '',
        interpretationProvider: '',
        interpretationMeta: {
          schemaVersion: 'dream-entry-v0.2',
          promptVersion: '',
          model: ''
        },
        feedback: '',
        createdAt: createdAt,
        updatedAt: createdAt
      };

      app.globalData.currentDream = pendingDream;
      upsertLocalDream(pendingDream);
      analytics.trackEvent('dream_saved_before_interpretation', {
        dreamId: dreamId,
        length: dreamText.length
      });

      cloudBase.saveDream(pendingDream, function () {
        cloudBase.interpretDream(dreamText, profile, cardIndex, function (cloudResult) {
        if (cloudResult && cloudResult.blocked) {
          pendingDream.status = 'blocked';
          pendingDream.interpretationError = cloudResult.reason || 'cloud_safety';
          pendingDream.updatedAt = new Date().toISOString();
          upsertLocalDream(pendingDream);
          cloudBase.saveDream(pendingDream);
          analytics.trackEvent('dream_submit_blocked', {
            reason: cloudResult.reason || 'cloud_safety'
          });
          wx.hideLoading();
          wx.showModal({
            title: '暂不生成梦卡',
            content: cloudResult.message || '这个梦暂不适合生成分享梦卡。',
            confirmText: '知道了',
            showCancel: false
          });
          return;
        }

        var result = cloudResult && cloudResult.result
          ? cloudResult.result
          : createLocalResult(dreamText, profile, cardIndex);
        var source = cloudResult && cloudResult.result ? 'cloud' : 'local';
        var provider = cloudResult && cloudResult.provider ? cloudResult.provider : source;
        var dream;

        result.card_no = result.card_no || 'NO. ' + String(cardIndex).padStart(3, '0');
        result.profile_summary = result.profile_summary || '梦境记忆';

        dream = {
          id: dreamId,
          dreamText: dreamText,
          status: 'ready',
          result: result,
          dreamFacts: normalizeDreamFacts(result, dreamText),
          interpretationSource: source,
          interpretationProvider: provider,
          interpretationError: cloudResult && !cloudResult.result
            ? String(cloudResult.reason || cloudResult.message || '')
            : '',
          interpretationMeta: {
            schemaVersion: (cloudResult && cloudResult.schemaVersion) || 'dream-entry-v0.2',
            promptVersion: (cloudResult && cloudResult.promptVersion) || 'local-oracle-v1',
            model: (cloudResult && cloudResult.model) || ''
          },
          feedback: '',
          createdAt: createdAt,
          updatedAt: new Date().toISOString()
        };

        app.globalData.currentDream = dream;
        upsertLocalDream(dream);
        cloudBase.saveDream(dream);
        analytics.trackEvent('interpretation_success', {
          dreamId: dream.id,
          symbolCount: result.symbols ? result.symbols.length : 0,
          cardTheme: result.card_theme || 'mist',
          source: source,
          provider: provider
        });
        cloudBase.flushEvents(analytics.getEvents());
        if (wx.removeStorageSync) {
          wx.removeStorageSync('oneiro:pendingDreamText');
        }
        wx.hideLoading();
        wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
        });
      });
    }, 700);
  }
});
