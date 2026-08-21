var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');
var syncQueue = require('../../utils/syncQueue');

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

var WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function safeDate(value) {
  var date = new Date(value);
  return isNaN(date.getTime()) ? new Date() : date;
}

function monthKey(value) {
  var date = safeDate(value);
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
}

// 按月分组，但月内只保留真的有梦的那天——空白天不占格子，避免看起来像加载出错。
// 一天多梦的格子把 dreams 数组整个交给 wxml，视觉上做成叠层（deck-shadow）。
function buildMonthGroups(records) {
  var counts = {};
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
    item.timelineTimestamp = timelineTimestamp(item.createdAt);
    item.themeClass = item.result && item.result.card_theme ? item.result.card_theme : 'mist';
  });

  var byMonth = {};
  records.forEach(function (item) {
    var date = safeDate(item.createdAt);
    var key = monthKey(item.createdAt);
    if (!byMonth[key]) {
      byMonth[key] = {
        key: key,
        year: date.getFullYear(),
        month: date.getMonth(),
        byDay: {}
      };
    }
    var dayId = pad2(date.getDate());
    if (!byMonth[key].byDay[dayId]) byMonth[key].byDay[dayId] = { date: date, dreams: [] };
    byMonth[key].byDay[dayId].dreams.push(item);
  });

  // 按时间正序（最旧的在前），和观察卡、刻度轴统一成同一个方向——三者
  // 共用一个下标，就不会出现「卡片往左滑、刻度往右移」这种方向打架。
  // 月内也按日期正序，保持日历的阅读顺序。
  return Object.keys(byMonth).map(function (key) { return byMonth[key]; })
    .sort(function (left, right) { return left.key.localeCompare(right.key); })
    .map(function (group) {
      var dayIds = Object.keys(group.byDay).sort();
      var total = 0;
      var cells = dayIds.map(function (dayId) {
        var bucket = group.byDay[dayId];
        var dreams = bucket.dreams.slice().sort(function (left, right) {
          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        });
        total += dreams.length;
        return {
          key: group.key + '-' + dayId,
          monthKey: group.key,
          day: bucket.date.getDate(),
          weekdayLabel: WEEKDAY_LABELS[bucket.date.getDay()],
          multi: dreams.length > 1,
          dreams: dreams
        };
      });
      return {
        key: group.key,
        label: group.year + ' 年 ' + (group.month + 1) + ' 月',
        stripLabel: (group.month + 1) + '月',
        dreamCount: total,
        cells: cells
      };
    });
}

// 顶部时间轴：把已有的月份分组倒过来排（左旧右新），左右两侧的淡色条就是
// 「前后还有多少个月」的实感。
//
// 刻度高度只表示「正在看哪个月」，不再跟梦的数量挂钩：一根刻度同时编码
// 「当前」和「数量」两件事时，用户读不出哪一根高是因为在看它、哪一根高是
// 因为那个月梦多。现在高度是纯粹的位置指示，数量交给卡片上的「N 个梦」。
function buildMonthStrip(groups, activeKey) {
  return groups.map(function (group) {
    return {
      key: group.key,
      label: group.stripLabel,
      active: group.key === activeKey
    };
  });
}

// ── 刻度轴的位置换算 ────────────────────────────────────────────
// 中心即选中，所以刻度的位置必须能被算出来，不能靠查 DOM：查询是异步的，
// 拖动过程中每帧都查一次既慢又会读到过期的矩形。
// 每根刻度定宽 TICK_PITCH_RPX、彼此不留间隙（间距做在刻度内部的 padding
// 里），于是「第几根」和「滚到哪」之间是一个纯算式。
var TICK_PITCH_RPX = 88;

function rpxToPx(rpx) {
  var width = 375;
  try {
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    if (info && info.windowWidth) width = info.windowWidth;
  } catch (error) {
    // 取不到就按 375 估算：这条轴只用来定位，差几个像素不影响选中判定。
  }
  return rpx * width / 750;
}

// 轴两端各留半屏内边距（CSS 里的 padding: 0 50%），最早/最新那个月也能被
// 送到正中。于是第 i 根刻度居中时：scrollLeft = i * pitch + pitch / 2。
function stripOffsetFor(index) {
  var pitch = rpxToPx(TICK_PITCH_RPX);
  return Math.max(0, index * pitch + pitch / 2);
}

function stripIndexFor(scrollLeft, total) {
  var pitch = rpxToPx(TICK_PITCH_RPX);
  var index = Math.round((scrollLeft - pitch / 2) / pitch);
  return Math.min(Math.max(index, 0), Math.max(0, total - 1));
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
    // 用户在每条呼应上的表态。云端记录在这里会盖回本地（远端更新时间更晚时
    // 远端胜出），漏掉这三个字段的后果不是「云端没有」而是「本地被抹掉」——
    // 逛一次归档回来，刚点过的「是这样」全部弹回未选中。
    connectionVerdicts: item && item.connectionVerdicts && typeof item.connectionVerdicts === 'object'
      ? item.connectionVerdicts
      : {},
    connectionToCorrect: String((item && item.connectionToCorrect) || ''),
    connectionCorrectionRaisedFor: String((item && item.connectionCorrectionRaisedFor) || ''),
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
    insights: dreamMemory.buildInsights([]),
    monthGroups: [],
    // 月度观察卡，一个月一张，和 monthGroups 同序（最近的月份在前），
    // 所以 activeMonthIndex 一个下标就能同时定位卡片和月份分组。
    monthlyCards: [],
    activeMonthIndex: 0,
    // 页面一次只渲染 activeMonthGroup 这一个月的牌组，切月份不滚页面。
    activeMonthGroup: null,
    // 顶部时间轴：monthStrip 是倒序（左旧右新）的月份刻度，中心那根即选中。
    // stripScrollLeft 是命令值（程序要它滚到哪），只在横向滚这条轴，不动页面；
    // stripAnimated 让首次定位不带动画（否则一进页面轴会自己滑一下）。
    monthStrip: [],
    activeMonthKey: '',
    stripScrollLeft: 0,
    stripAnimated: false,
    archiveLoadError: false,
    // 点某天梦卡 → 原地放大（expandedDayKey 非空时渲染浮层），多梦的天用
    // <swiper> 原生滑动切换（expandedDreamIndex 跟手势同步），再点一下放大
    // 的卡片进完整详情页（复用 openDream），点空白区域收回。
    expandedDayKey: '',
    expandedDreams: [],
    expandedDreamIndex: 0
  },

  onLoad: function (options) {
    this.options = options || {};
  },

  onShow: function () {
    var that = this;
    // switchTab 不能带查询串，筛选条件经 tabNav 暂存传入
    var tabParams = tabNav.takeParams('pages/archive/index');
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
    var monthGroups = buildMonthGroups(filteredArchive);
    // renderArchive 会被反复调用（云端合并回来、缩略图逐张下载完），所以默认
    // 月份必须沿用用户当前选的那个月——直接重置成最近月份的话，用户翻到七月
    // 慢慢看，某张图加载完就会被弹回八月。那个月要是已经不存在（换了筛选
    // 条件）才退回最近的月份。
    var previousKey = this.data.activeMonthKey;
    // 正序排列后最新的月份在末尾，默认停在那里。
    var activeIndex = Math.max(0, monthGroups.length - 1);
    monthGroups.forEach(function (group, position) {
      if (group.key === previousKey) activeIndex = position;
    });
    var activeKey = monthGroups.length ? monthGroups[activeIndex].key : '';
    var activeGroup = monthGroups[activeIndex];
    this.setData({
      archive: filteredArchive,
      archiveCount: filteredArchive.length,
      hasArchive: filteredArchive.length > 0,
      symbolFilter: symbolFilter,
      insights: insights,
      monthGroups: monthGroups,
      // 观察卡和月份分组同一份来源、同一个排序，下标一一对应。
      monthlyCards: insights.monthlyCards,
      activeMonthIndex: activeIndex,
      activeMonthGroup: activeGroup || null,
      monthStrip: buildMonthStrip(monthGroups, activeKey),
      activeMonthKey: activeKey,
      // 重新定位不带动画：这不是用户的操作，轴不该自己滑一下。
      stripScrollLeft: monthGroups.length ? stripOffsetFor(activeIndex) : 0,
      stripAnimated: false,
      // 档案一变，之前放大的那天可能已经不是同一批数据了，收回避免读到脏引用。
      expandedDayKey: '',
      expandedDreams: [],
      expandedDreamIndex: 0
    });
    this._stripCommandedAt = Date.now();
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

  // 点某天的缩略卡：原地放大成浮层。所有格子都对应真实存在的梦，不再需要
  // 判断空白格。
  expandDay: function (event) {
    var dayKey = event.currentTarget.dataset.dayKey;
    var monthKeyValue = event.currentTarget.dataset.monthKey;
    var group = this.data.monthGroups.filter(function (item) { return item.key === monthKeyValue; })[0];
    var cell = group && group.cells.filter(function (item) { return item.key === dayKey; })[0];
    if (!cell) return;
    analytics.trackEvent('archive_day_expand', { dreamCount: cell.dreams.length });
    this.setData({ expandedDayKey: dayKey, expandedDreams: cell.dreams, expandedDreamIndex: 0 });
  },

  // ── 切月份 ──────────────────────────────────────────────────
  // 页面一次只显示一个月，切换时画面完全不动，只有牌组换一批。
  //
  // 因此「当前是几月」只有 activeMonthIndex 这一个真相，两个入口（滑观察卡、
  // 点刻度）都只是往这里写。以前还有第三个入口——从页面滚动位置反推当前月
  // ——那才是需要 _scrollLock 去调停的根源：滑卡片会带动页面滚动，滚动又
  // 反过来重算当前月，动画中途经过别的月份就把刚选的覆盖掉（滑到七月又弹
  // 回八月）。现在页面根本不滚，这套调停连同 onPageScroll / pageScrollTo
  // 一起删掉了——不是修好了那个冲突，是让它没有发生的余地。
  // options.centerStrip：是否把刻度轴滚到让这个月居中。拖动刻度轴本身
  // 触发时不要再回头滚它——用户的手指正按在上面。
  setActiveMonth: function (index, options) {
    var settings = options || {};
    var groups = this.data.monthGroups;
    var group = groups[index];
    if (!group || group.key === this.data.activeMonthKey) return;
    var patch = {
      activeMonthIndex: index,
      activeMonthKey: group.key,
      activeMonthGroup: group,
      monthStrip: buildMonthStrip(groups, group.key)
    };
    if (settings.centerStrip) Object.assign(patch, this.stripCenterPatch(index));
    this.setData(patch);
  },

  // monthStrip 和 monthGroups 同序，下标直接通用。
  stripCenterPatch: function (index) {
    var target = stripOffsetFor(index);
    // scroll-left 只在值变化时才生效。目标值和当前值恰好相同时（比如连点
    // 同一根刻度）加半个像素强制刷新，否则轴会停在用户拖歪的位置上。
    if (target === this.data.stripScrollLeft) target += 0.5;
    this._stripCommandedAt = Date.now();
    return { stripScrollLeft: target, stripAnimated: true };
  },

  // 滑观察卡 → 带动刻度轴和牌组
  onObservationChange: function (event) {
    this.setActiveMonth(event.detail.current, { centerStrip: true });
  },

  // 点刻度 → 送进中心，带动观察卡和牌组
  jumpToMonth: function (event) {
    var key = event.currentTarget.dataset.key;
    var index = -1;
    this.data.monthGroups.forEach(function (group, position) {
      if (group.key === key) index = position;
    });
    if (index < 0) return;
    this.setActiveMonth(index, { centerStrip: true });
  },

  // 拖动刻度轴 → 谁被拖到中心谁就是当前月。
  //
  // 这里不做节流之外的调停：选中完全由 scrollLeft 算出，是个纯函数，
  // 中途多算几次也只会得到同一个答案。程序自己触发的滚动（滑卡片、点刻度）
  // 在 320ms 内跳过，避免动画途中经过的月份被当成用户的选择。
  onStripScroll: function (event) {
    var that = this;
    var scrollLeft = event.detail.scrollLeft;
    if (Date.now() - (this._stripCommandedAt || 0) < 320) return;
    this._stripScrollLeft = scrollLeft;
    if (this._stripPending) return;
    this._stripPending = true;
    setTimeout(function () {
      that._stripPending = false;
      var total = that.data.monthGroups.length;
      if (!total) return;
      // 拖的是轴本身，不要回头再滚它，否则会跟手指抢。
      that.setActiveMonth(stripIndexFor(that._stripScrollLeft, total), { centerStrip: false });
    }, 80);

    // 手指松开后轴可能停在两根刻度中间。停止滚动 180ms 后吸附到最近的一根，
    // 让「中心那根」永远是完整对齐的。
    clearTimeout(this._stripSettleTimer);
    this._stripSettleTimer = setTimeout(function () {
      var total = that.data.monthGroups.length;
      if (!total) return;
      var stripIndex = stripIndexFor(that._stripScrollLeft, total);
      var settled = stripOffsetFor(stripIndex);
      if (Math.abs(settled - that._stripScrollLeft) < 1) return;
      that._stripCommandedAt = Date.now();
      that.setData({ stripScrollLeft: settled, stripAnimated: true });
    }, 180);
  },

  collapseDay: function () {
    this.setData({ expandedDayKey: '', expandedDreams: [], expandedDreamIndex: 0 });
  },

  // 浮层内容区绑的 catchtap，只为挡住冒泡到背景层的 collapseDay。
  stopPropagation: function () {},

  onExpandSwiperChange: function (event) {
    this.setData({ expandedDreamIndex: event.detail.current });
  },

  newDream: function () {
    analytics.trackEvent('dream_start', { source: 'archive' });
    tabNav.switchTab('pages/home/index');
  }


});
