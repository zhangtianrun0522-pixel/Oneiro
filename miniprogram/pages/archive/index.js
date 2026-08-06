var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamArtifacts = require('../../utils/dreamArtifacts');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var syncQueue = require('../../utils/syncQueue');
var stagePortrait = require('../../utils/stagePortrait');

function dateLabel(value) {
  var date = new Date(value);
  var now;
  var month = date.getMonth() + 1;
  var day = date.getDate();

  if (isNaN(date.getTime())) {
    now = new Date();
    month = now.getMonth() + 1;
    day = now.getDate();
  }

  month = month < 10 ? '0' + month : String(month);
  day = day < 10 ? '0' + day : String(day);
  return month + '.' + day;
}

function timelineTimestamp(value) {
  var date = new Date(value);
  var pad = function (number) { return number < 10 ? '0' + number : String(number); };
  if (isNaN(date.getTime())) date = new Date();
  return date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate()) + '  ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function monthKey(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function monthLabel(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) date = new Date();
  return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月';
}

function buildTimelineGroups(records) {
  var counts = {};
  var groups = [];
  var groupByKey = {};
  var chronological = records.slice().sort(function (left, right) {
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

  chronological.forEach(function (item) {
    var symbols = item.result && Array.isArray(item.result.symbols) ? item.result.symbols : [];
    var primary = String(symbols[0] || '');
    item.primarySymbol = primary;
    if (primary) {
      counts[primary] = Number(counts[primary] || 0) + 1;
      item.symbolOccurrence = counts[primary];
    } else {
      item.symbolOccurrence = 0;
    }
    item.repeatLabel = item.symbolOccurrence > 1 ? '“' + primary + '”第 ' + item.symbolOccurrence + ' 次' : '';
    item.isKeyMoment = item.symbolOccurrence >= 3 || !!(item.result && item.result.symbol_milestones && item.result.symbol_milestones[0]);
  });

  records.slice().sort(function (left, right) {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  }).forEach(function (item) {
    var key = monthKey(item.createdAt);
    if (!groupByKey[key]) {
      groupByKey[key] = { key: key, label: monthLabel(item.createdAt), dreams: [] };
      groups.push(groupByKey[key]);
    }
    item.timelineTimestamp = timelineTimestamp(item.createdAt);
    item.themeClass = item.result && item.result.card_theme ? item.result.card_theme : 'mist';
    groupByKey[key].dreams.push(item);
  });
  return groups;
}

function normalizeCloudDream(item) {
  var facts = item && item.dreamFacts ? item.dreamFacts : {};
  var status = String((item && item.status) || 'ready');
  var result = status === 'ready' &&
    item &&
    item.result &&
    typeof item.result === 'object' &&
    Object.keys(item.result).length
    ? item.result
    : null;
  return {
    id: String((item && (item.localId || item.id)) || ''),
    dreamText: String((item && item.dreamText) || ''),
    status: status,
    result: result,
    thumbnailPath: String((item && item.thumbnailPath) || ''),
    dreamFacts: {
      people: facts.people || [],
      places: facts.places || [],
      objects: facts.objects || [],
      actions: facts.actions || [],
      emotions: facts.emotions || [],
      time_sense: facts.timeSense || facts.time_sense || []
    },
    chatMessages: item && Array.isArray(item.chatMessages) ? item.chatMessages : [],
    interpretationSource: String((item && item.interpretationSource) || ''),
    interpretationProvider: String((item && item.interpretationProvider) || ''),
    interpretationRevision: Math.max(0, Number(item && item.interpretationRevision) || 0),
    interpretationMeta: item && item.interpretationMeta ? item.interpretationMeta : {},
    feedback: String((item && item.feedback) || ''),
    feedbackAt: item && item.feedbackAt ? item.feedbackAt : null,
    cloudSynced: status === 'ready' && !!result,
    createdAt: item && item.createdAt ? item.createdAt : new Date().toISOString(),
    updatedAt: item && item.updatedAt ? item.updatedAt : item && item.createdAt
  };
}

Page({
  data: {
    archive: [],
    archiveCount: 0,
    hasArchive: false,
    archetypeEligible: false,
    archetype: null,
    insights: dreamMemory.buildInsights([]),
    timelineGroups: [],
    archiveLoadError: false,
    // ── 阶段画像（原来在「我」页第三屏）──
    // 「我」是一页表单（出生日期、性别、保存资料、隐私说明）。把产品里最有
    // 辨识度的产出摆在表单上方，它会被读成一个用户自己填的字段，而不是系统
    // 产出的东西——内测反馈说的「违反操作直觉」正是这个。而「梦册」已经有
    // 本月观察、重复线索、阶段原型三个同类物件，画像是其中最强的一个，拆在
    // 两个 tab 里等于两边都讲不完整。
    memoryLoaded: false,
    memoryState: stagePortrait.emptyMemoryState(),
    portraitLoadError: false,
    portraitGenerateFailed: false,
    portraitMigrationState: '',
    portraitLoading: false,
    portraitAutoGenerateTriggered: false,
    portraitSaving: false,
    portraitEditing: false,
    portraitEditSummary: '',
    portraitVersionLabel: '',
    portraitStatusLabel: '',
    portraitUpdatedLabel: '',
    portraitChangeReason: '',
    portraitSources: [],
    portraitHistory: [],
    portraitHasUpdate: false,
    portraitPaused: false,
    showPortraitSources: false,
    showPortraitHistory: false
  },

  onLoad: function (options) {
    this.options = options || {};
    this.ensurePortraitController().hydrateFromCache();
  },

  // onShow 也要能独立成立：retryArchiveLoad 直接调 onShow，而 onLoad 只在页面
  // 首次创建时跑一次。控制器缺席时静默炸掉整页，代价远大于这一行懒创建。
  ensurePortraitController: function () {
    if (!this.portrait) {
      this.portrait = stagePortrait.createController(this, { cloudBase: cloudBase });
    }
    return this.portrait;
  },

  onShow: function () {
    var that = this;
    // switchTab 不能带查询串，筛选条件经 tabNav 暂存传入
    var tabParams = tabNav.takeParams('pages/archive/index');
    this.ensurePortraitController().load();
    if (tabParams.symbolFilter) {
      this.options = Object.assign({}, this.options, {
        symbolFilter: encodeURIComponent(tabParams.symbolFilter)
      });
    }
    this._archiveLoadToken = (this._archiveLoadToken || 0) + 1;
    var loadToken = this._archiveLoadToken;
    var savedArchive = wx.getStorageSync('oneiro:dreamArchive') || [];
    this.setData({ archiveLoadError: false });
    var archive = savedArchive.map(function (item, index) {
      if (!item.id) {
        item.id = String(item.createdAt || Date.now()) + '-' + index;
      }
      if (!item.createdAt) {
        item.createdAt = new Date().toISOString();
      }
      item.dateLabel = dateLabel(item.createdAt);
      return item;
    });
    wx.setStorageSync('oneiro:dreamArchive', archive);
    this.renderArchive(archive);
    this.hydrateArchiveImages(archive, loadToken);
    cloudBase.getDreamArchive(function (result) {
      if (!result || !result.ok || !Array.isArray(result.dreams)) {
        if (!archive.length) that.setData({ archiveLoadError: true, hasArchive: false });
        return;
      }
      var pendingDeletes = wx.getStorageSync('oneiro:pendingCloudDeletes') || [];
      var remote = result.dreams.map(normalizeCloudDream).filter(function (item) {
        return item.id && item.dreamText && pendingDeletes.indexOf(item.id) < 0;
      });
      var localById = {};
      archive.forEach(function (item) {
        if (item && item.id) localById[item.id] = item;
      });
      // Cloud records intentionally do not store local temporary paths. Keep a
      // thumbnail already downloaded in this device while refreshing the
      // record's interpretation and persistent image file id from the cloud.
      remote = remote.map(function (item) {
        var local = localById[item.id];
        var localUpdatedAt = local ? new Date(local.updatedAt || 0).getTime() : 0;
        var remoteUpdatedAt = new Date(item.updatedAt || 0).getTime();
        if (
          local &&
          local.status === 'ready' &&
          (item.status !== 'ready' || localUpdatedAt > remoteUpdatedAt)
        ) {
          return Object.assign({}, local, { cloudSynced: false });
        }
        if (!local || item.thumbnailPath) return item;
        return Object.assign({}, item, { thumbnailPath: local.thumbnailPath || '' });
      });
      var remoteIds = {};
      remote.forEach(function (item) { remoteIds[item.id] = true; });
      var localOnly = archive.filter(function (item) {
        return !remoteIds[item.id] && ['pending', 'ready', 'blocked'].indexOf(item.status) >= 0;
      }).map(function (item) {
        return item && item.status === 'ready' && item.result
          ? Object.assign({}, item, { cloudSynced: false })
          : item;
      });
      var merged = remote.concat(localOnly).sort(function (left, right) {
        return new Date(right.updatedAt || right.createdAt || 0).getTime() -
          new Date(left.updatedAt || left.createdAt || 0).getTime();
      }).slice(0, 30);
      wx.setStorageSync('oneiro:dreamArchive', merged);
      that.renderArchive(merged);
      that.hydrateArchiveImages(merged, loadToken);
      that.repairStaleCloudDreams(merged);
      analytics.trackEvent('archive_cloud_synced', { archiveCount: merged.length });
    });
  },

  repairStaleCloudDreams: function (archive) {
    var that = this;
    this._repairingDreamIds = this._repairingDreamIds || {};
    (Array.isArray(archive) ? archive : []).forEach(function (dream) {
      if (!dream || dream.status !== 'ready' || dream.cloudSynced === true || !dream.result || that._repairingDreamIds[dream.id]) return;
      that._repairingDreamIds[dream.id] = true;
      cloudBase.saveDream(dream, function (saveResult) {
        that._repairingDreamIds[dream.id] = false;
        var current = wx.getStorageSync('oneiro:dreamArchive') || [];
        if (!saveResult || !saveResult.ok) {
          syncQueue.enqueue('dream_sync', { dream: dream, refreshPortrait: false });
          wx.setStorageSync('oneiro:dreamArchive', current.map(function (item) {
            return item.id === dream.id ? Object.assign({}, item, { cloudSynced: false }) : item;
          }));
          return;
        }
        wx.setStorageSync('oneiro:dreamArchive', current.map(function (item) {
          return item.id === dream.id ? Object.assign({}, item, { cloudSynced: true }) : item;
        }));
        that.renderArchive(wx.getStorageSync('oneiro:dreamArchive') || []);
      });
    });
  },

  retryArchiveLoad: function () {
    this.onShow();
  },

  renderArchive: function (archive) {
    archive = (Array.isArray(archive) ? archive : []).map(function (item, index) {
      if (!item.id) item.id = String(item.createdAt || Date.now()) + '-' + index;
      if (!item.createdAt) item.createdAt = new Date().toISOString();
      item.dateLabel = dateLabel(item.createdAt);
      item.hasThumbnail = !!item.thumbnailPath;
      return item;
    });
    var archetypeResult = dreamArtifacts.computeArchetype(archive);
    var insights = dreamMemory.buildInsights(archive);
    var symbolFilter = this.options && this.options.symbolFilter ? decodeURIComponent(this.options.symbolFilter) : '';
    var filteredArchive = symbolFilter
      ? archive.filter(function (item) {
        var symbols = item.result && Array.isArray(item.result.symbols) ? item.result.symbols : [];
        return symbols.indexOf(symbolFilter) >= 0;
      })
      : archive;
    filteredArchive.forEach(function (item, index) {
      item.archiveIndex = index;
    });
    var timelineGroups = buildTimelineGroups(filteredArchive);
    this.setData({
      archive: filteredArchive,
      archiveCount: filteredArchive.length,
      hasArchive: filteredArchive.length > 0,
      symbolFilter: symbolFilter,
      archetypeEligible: archetypeResult.eligible,
      archetype: archetypeResult.archetype || null,
      insights: insights,
      timelineGroups: timelineGroups
    });
    // 画像的「这段来自哪几个梦」要把 sourceRefs 映射回本地档案才拿得到标题，
    // 所以档案一变就要重算一次视图模型。
    if (this.portrait) this.portrait.rerender();
    analytics.trackEvent('archive_view', {
      archiveCount: filteredArchive.length
    });
  },

  hydrateArchiveImages: function (archive, loadToken) {
    var that = this;
    (Array.isArray(archive) ? archive : []).forEach(function (item) {
      var result = item && item.result ? item.result : {};
      var imageUrl = String(result.imageUrl || '');
      var fileId = String(result.image_file_id || result.imageFileId || result.fileID || result.fileId || '');
      if (!item || !item.id || (!imageUrl && !fileId) || item.thumbnailPath) return;
      cloudBase.resolveCloudImage(fileId, imageUrl, function (localPath) {
        if (!localPath || loadToken !== that._archiveLoadToken) return;
        var current = wx.getStorageSync('oneiro:dreamArchive') || [];
        var changed = false;
        current = current.map(function (entry) {
          if (!entry || entry.id !== item.id) return entry;
          changed = true;
          return Object.assign({}, entry, { thumbnailPath: localPath });
        });
        if (!changed) return;
        wx.setStorageSync('oneiro:dreamArchive', current);
        that.renderArchive(current);
      });
    });
  },

  clearFilter: function () {
    this.options = Object.assign({}, this.options, { symbolFilter: '' });
    this.onShow();
  },

  openDream: function (event) {
    var index = event.currentTarget.dataset.index;
    var dream = this.data.archive[index];
    var app = getApp();
    app.globalData.currentDream = dream;
    analytics.trackEvent('archive_revisit', {
      dreamId: dream.id || '',
      cardTheme: dream.result && dream.result.card_theme ? dream.result.card_theme : 'mist'
    });
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dream.id) });
  },

  openArchetypeCard: function () {
    var app = getApp();
    if (!this.data.archetypeEligible) return;
    app.globalData.currentArtifact = {
      type: 'archetype',
      archetype: this.data.archetype
    };
    wx.navigateTo({ url: '/pages/artifact/index?type=archetype' });
  },

  // ── 阶段画像 ──
  retryPortrait: function () { this.portrait.retry(); },
  refreshPortrait: function () { this.portrait.refresh(); },
  startPortraitEdit: function () { this.portrait.startEdit(); },
  cancelPortraitEdit: function () { this.portrait.cancelEdit(); },
  savePortraitEdit: function () { this.portrait.saveEdit(); },
  onPortraitSummaryInput: function (event) { this.portrait.onSummaryInput(event); },
  togglePortraitUse: function () { this.portrait.toggleUse(); },

  // 「这段来自哪几个梦」。sourceRefs 每一版都存了最多 18 条，此前一条都没
  // 渲染过——prompt 要求画像的判断「能指回具体是哪个梦的哪一处」，界面却不
  // 给核对入口。一个无法核对的判断会退化成星座运势。
  togglePortraitSources: function () {
    var next = !this.data.showPortraitSources;
    this.setData({ showPortraitSources: next });
    if (next) {
      analytics.trackEvent('portrait_sources_open', {
        dreamId: '',
        sourceCount: this.data.portraitSources.length
      });
    }
  },

  openPortraitSource: function (event) {
    var dreamId = String(event.currentTarget.dataset.dreamId || '');
    if (!dreamId) return;
    analytics.trackEvent('portrait_source_open', { dreamId: dreamId });
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(dreamId) });
  },

  // 「三个月前你是这样，现在你是这样」是画像唯一能做、而单次解读永远做不到的
  // 事，数据早就在 profile_snapshots 里，此前只显示当前这一版。
  togglePortraitHistory: function () {
    var next = !this.data.showPortraitHistory;
    this.setData({ showPortraitHistory: next });
    if (next) {
      analytics.trackEvent('portrait_history_open', { versionCount: this.data.portraitHistory.length });
      this.portrait.markSeen();
    }
  },

  dismissPortraitUpdate: function () {
    this.portrait.markSeen();
  },

  newDream: function () {
    analytics.trackEvent('dream_start', { source: 'archive' });
    tabNav.switchTab('pages/home/index');
  }


});
