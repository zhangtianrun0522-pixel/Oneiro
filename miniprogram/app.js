var analytics = require('./utils/analytics');
var cloudBase = require('./utils/cloudBase');
var syncQueue = require('./utils/syncQueue');

function applyPortraitSnapshot(snapshot, refreshKey) {
  var state = wx.getStorageSync('oneiro:profileMemory') || {};
  var current = snapshot ? Object.assign({}, snapshot, {
    clientId: String(snapshot._id || snapshot.id || snapshot.clientId || ''),
    status: 'confirmed',
    isCurrent: true
  }) : null;
  var currentId;
  if (!current) return;
  currentId = current.clientId;
  state.history = (Array.isArray(state.history) ? state.history : []).map(function (item) {
    return String(item && (item.clientId || item._id || item.id) || '') === currentId
      ? current
      : Object.assign({}, item, { isCurrent: false });
  });
  state.history = [current].concat(state.history.filter(function (item) {
    return String(item && (item.clientId || item._id || item.id) || '') !== currentId;
  })).slice(0, 30);
  state.current = current;
  state.lastPortraitRefreshKey = refreshKey || state.lastPortraitRefreshKey || '';
  wx.setStorageSync('oneiro:profileMemory', state);
}

App({
  onLaunch: function () {
    var that = this;

    analytics.trackEvent('app_start', { source: 'miniprogram' });
    cloudBase.initCloud(function (status) {
      that.globalData.cloudStatus = status;
      analytics.trackEvent('cloud_status', { mode: status.mode });
      cloudBase.getIdentity(function (identity) {
        that.globalData.identity = identity;
        analytics.trackEvent('login_ready', { source: identity.source });
        cloudBase.flushEvents(analytics.getEvents());
        that.flushPendingDreamDeletes();
        that.flushPendingSyncTasks();
      });
    });
  },

  flushPendingSyncTasks: function () {
    var that = this;
    var tasks = syncQueue.list();
    var index = 0;
    var replayedDreamSync = false;
    var replacedTask = false;
    var snapshotTaskIds = {};
    tasks.forEach(function (task) {
      if (task && task.key) snapshotTaskIds[task.key + ':' + String(task.instanceId || task.createdAt || '')] = true;
    });
    if (!tasks.length || this._syncFlushInFlight) return;
    this._syncFlushInFlight = true;

    function finishTask() {
      index += 1;
      if (index < tasks.length) {
        processTask(tasks[index]);
        return;
      }
      that._syncFlushInFlight = false;
      var hasNewTask = syncQueue.list().some(function (task) {
        if (!task || !task.key) return false;
        return !snapshotTaskIds[task.key + ':' + String(task.instanceId || task.createdAt || '')];
      });
      if (replayedDreamSync || replacedTask || hasNewTask) {
        if (replayedDreamSync && !syncQueue.has('portrait_refresh')) {
          syncQueue.enqueue('portrait_refresh', {
            refreshKey: 'dream-sync-replay',
            reason: '补写梦境后重新理解你'
          });
        }
        that.flushPendingSyncTasks();
      }
    }

    function processTask(task) {
      if (!task || task.type === 'portrait_refresh') {
        cloudBase.generateProfilePortrait(task && task.reason || '补偿刷新画像', function (result) {
          if (result && result.ok && result.snapshot) {
            if (!syncQueue.remove(task)) {
              replacedTask = true;
            } else {
              applyPortraitSnapshot(result.snapshot, task && task.refreshKey || '');
            }
          }
          finishTask();
        });
        return;
      }
      if (task.type === 'dream_sync') {
        cloudBase.saveDream(task.dream, function (result) {
          if (result && result.ok) {
            if (!syncQueue.remove(task)) {
              replacedTask = true;
            } else {
              if (task.refreshPortrait !== false) replayedDreamSync = true;
              var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
              wx.setStorageSync('oneiro:dreamArchive', archive.map(function (item) {
                return item.id === task.dream.id ? Object.assign({}, item, { cloudSynced: true }) : item;
              }));
            }
          }
          finishTask();
        });
        return;
      }
      if (task.type === 'life_note') {
        cloudBase.addLifeNote(task.dreamId, task.text, function (result) {
          if (!result || !result.ok) {
            finishTask();
            return;
          }
          if (!syncQueue.remove(task)) {
            replacedTask = true;
            finishTask();
            return;
          }
          cloudBase.generateProfilePortrait('补偿写入现实线索后重新理解你', function (portraitResult) {
            if (portraitResult && portraitResult.ok && portraitResult.snapshot) {
              applyPortraitSnapshot(portraitResult.snapshot, task.refreshKey || 'life-note:' + task.dreamId);
            } else {
              syncQueue.enqueue('portrait_refresh', {
                refreshKey: task.refreshKey || 'life-note:' + task.dreamId,
                reason: '补偿写入现实线索后重新理解你'
              });
            }
            finishTask();
          });
        });
        return;
      }
      finishTask();
    }

    processTask(tasks[0]);
  },

  flushPendingDreamDeletes: function () {
    var pending = wx.getStorageSync('oneiro:pendingCloudDeletes') || [];
    if (!Array.isArray(pending) || !pending.length) return;
    var remaining = pending.slice();
    pending.forEach(function (dreamId) {
      cloudBase.deleteDream(dreamId, function (result) {
        if (!result || !result.ok) return;
        remaining = remaining.filter(function (item) { return item !== dreamId; });
        wx.setStorageSync('oneiro:pendingCloudDeletes', remaining);
      });
    });
  },

  globalData: {
    cloudStatus: null,
    // switchTab 不能带查询串，跳 tab 的参数在这里中转（见 utils/tabNav.js）
    pendingTabParams: {},
    identity: null,
    currentDream: null,
    currentArtifact: null,
    lastProfile: {
      nickname: '',
      birthDate: '',
      birthTime: '',
      birthPlace: '',
      gender: ''
    }
  }
});
