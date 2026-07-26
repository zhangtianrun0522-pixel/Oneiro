var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamArtifacts = require('../../utils/dreamArtifacts');
var dreamMemory = require('../../utils/dreamMemory');

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
  return {
    id: String((item && (item.localId || item.id)) || ''),
    dreamText: String((item && item.dreamText) || ''),
    status: String((item && item.status) || 'ready'),
    result: item && item.result ? item.result : null,
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
    interpretationMeta: item && item.interpretationMeta ? item.interpretationMeta : {},
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
    timelineGroups: []
  },

  onLoad: function (options) {
    this.options = options || {};
  },

  onShow: function () {
    var that = this;
    this._archiveLoadToken = (this._archiveLoadToken || 0) + 1;
    var loadToken = this._archiveLoadToken;
    var savedArchive = wx.getStorageSync('oneiro:dreamArchive') || [];
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
      if (!result || !result.ok || !Array.isArray(result.dreams)) return;
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
        if (!local || item.thumbnailPath) return item;
        return Object.assign({}, item, { thumbnailPath: local.thumbnailPath || '' });
      });
      var remoteIds = {};
      remote.forEach(function (item) { remoteIds[item.id] = true; });
      var localOnly = archive.filter(function (item) {
        return !remoteIds[item.id] && item.status === 'pending';
      });
      var merged = remote.concat(localOnly).slice(0, 30);
      wx.setStorageSync('oneiro:dreamArchive', merged);
      that.renderArchive(merged);
      that.hydrateArchiveImages(merged, loadToken);
      analytics.trackEvent('archive_cloud_synced', { archiveCount: merged.length });
    });
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

  newDream: function () {
    analytics.trackEvent('dream_start', { source: 'archive' });
    wx.navigateTo({ url: '/pages/new-dream/index' });
  },

  goHome: function () {
    wx.reLaunch({ url: '/pages/home/index' });
  },

  openProfile: function () {
    wx.navigateTo({ url: '/pages/profile/index' });
  }
});
