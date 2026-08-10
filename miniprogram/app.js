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

// 告诉栈里任何一个关心这条梦的页面：它已经同步好了。页面自己决定要不要更新，
// 没实现这个钩子的页面不受影响。
function notifyDreamSynced(dreamId) {
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  var index;
  if (!dreamId) return;
  for (index = 0; index < pages.length; index += 1) {
    if (pages[index] && typeof pages[index].onDreamSynced === 'function') {
      pages[index].onDreamSynced(dreamId);
    }
  }
}

App({
  onLaunch: function () {
    var that = this;

    // 基础库把任何未处理的 Promise 拒绝都报成一条没有归属的错误（线上见过
    // 光秃秃的 "Error: timeout"，四帧堆栈全在 WAServiceMainContext 内部，
    // 完全看不出是谁抛的）。这里把 reason 原样打出来，好判断它究竟来自本
    // 小程序的代码，还是开发者工具/基础库自身的内部请求。
    if (typeof wx !== 'undefined' && typeof wx.onUnhandledRejection === 'function') {
      wx.onUnhandledRejection(function (res) {
        var reason = res && res.reason;
        console.warn('[unhandled-rejection]',
          reason && reason.errMsg ? reason.errMsg : (reason && reason.message ? reason.message : reason),
          reason && reason.stack ? reason.stack : '');
      });
    }

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

  // 补写队列此前只在冷启动那一次被消费：onLaunch 拿到身份后 flush 一次，其余
  // 调用点都写成「本次保存已经成功才 flush」，也就是只在没什么可补的时候才跑。
  // 于是一次失败的保存会把任务留在队列里，页面上那条「未同步／高清图待同步」
  // 一整个会话都不会消失，用户只能一直按「重试同步」。回到前台时补一次。
  onShow: function () {
    // 冷启动时 onShow 排在拿到身份之前，这时补写只会白白失败一次并耗掉重试。
    if (!this.globalData.identity) return;
    this.flushPendingDreamDeletes();
    this.flushPendingSyncTasks();
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
              // 补写成功只改了 storage，正在看的那一页仍然拿着 cloudSynced:false
              // 的那份记录，于是它继续显示「未同步」——同步其实已经完成了。
              notifyDreamSynced(task.dream.id);
            }
          }
          finishTask();
        });
        return;
      }
      if (task.type === 'life_note') {
        // source 区分「梦后对话提取的现实线索」和「用户在一条呼应上点的头」。
        // 补写路径必须把它带上，否则离线时确认的呼应重放回云端就退化成一条
        // 普通生活记录，画像那头再也分不出它当初是被用户核实过的。
        cloudBase.addLifeNote(task.dreamId, task.text, task.source || '', task.gist || '', function (result) {
          if (!result || !result.ok) {
            finishTask();
            return;
          }
          if (!syncQueue.remove(task)) {
            replacedTask = true;
            finishTask();
            return;
          }
          var noteReason = task.source === 'dream_connection'
            ? '补写你确认过的一条呼应后重新理解你'
            : '补偿写入现实线索后重新理解你';
          cloudBase.generateProfilePortrait(noteReason, function (portraitResult) {
            if (portraitResult && portraitResult.ok && portraitResult.snapshot) {
              applyPortraitSnapshot(portraitResult.snapshot, task.refreshKey || 'life-note:' + task.dreamId);
            } else {
              syncQueue.enqueue('portrait_refresh', {
                refreshKey: task.refreshKey || 'life-note:' + task.dreamId,
                reason: noteReason
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
