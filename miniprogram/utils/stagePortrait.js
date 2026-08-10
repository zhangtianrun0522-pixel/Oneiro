/**
 * 阶段画像的状态与编排。
 *
 * 这段逻辑原来整个长在 pages/profile 里。画像搬到「梦册」顶部之后，两页都要
 * 读它——梦册渲染完整面板，「我」只渲染一行入口——所以归一化、缓存、云端编排
 * 必须只有一份实现，否则两边迟早会对同一个快照给出不同的版本号或状态。
 *
 * 页面通过 createController(page) 拿到一个控制器；控制器只往 page.setData 写
 * 这些约定好的键（memoryState / portraitLoading / portraitStatusLabel / …），
 * 页面负责渲染。
 */

var analytics = require('./analytics');
var syncQueue = require('./syncQueue');

var PROFILE_MEMORY_KEY = 'oneiro:profileMemory';
// 用户上次看到的画像版本号。新版本出现时梦册顶部会打一个「已更新」，这是画像
// 唯一的召回信号——后台每记一个梦就刷新一次画像，却从来没有人被告知过。
var SEEN_VERSION_KEY = 'oneiro:portraitSeenVersion';

function emptyMemoryState() {
  return { current: null, history: [], pastHistory: [], lastGeneratedDreamCount: 0 };
}

function snapshotId(snapshot) {
  return snapshot ? String(snapshot._id || snapshot.id || '') : '';
}

function withClientId(snapshot) {
  if (!snapshot) return null;
  var summary = String(snapshot.summary || snapshot.profileText || '').trim();
  return Object.assign({}, snapshot, {
    summary: summary,
    profileText: snapshot.profileText || summary,
    status: ['draft', 'confirmed', 'rejected', 'superseded'].indexOf(snapshot.status) >= 0 ? snapshot.status : 'confirmed',
    isCurrent: snapshot.isCurrent !== false,
    useInFutureReadings: snapshot.useInFutureReadings !== false,
    clientId: snapshotId(snapshot)
  });
}

// V7 and earlier stored page instructions as the portrait itself. Treat those
// snapshots as a migration candidate, while keeping them visible until V8 is
// successfully generated.
function needsPortraitMigration(snapshot) {
  var summary = String(snapshot && (snapshot.summary || snapshot.profileText) || '').trim();
  var wasUserEdited = snapshot && (
    snapshot.userEdited === true ||
    (snapshot.userEdited && typeof snapshot.userEdited === 'object') ||
    (snapshot.userEditedOriginal && typeof snapshot.userEditedOriginal === 'object')
  );
  if (wasUserEdited) return false;
  return !summary || /这是一份|基于近期|供你确认|供你修改|供你拒绝|阶段性观察|仅提炼当前|目前资料较少|等待你补充/.test(summary);
}

function normalizeMemoryState(value) {
  var source = value && typeof value === 'object' ? value : {};
  // 旧草稿只保留在云端历史中，不能在客户端伪装成已经生效的当前画像。
  var current = withClientId(source.current);
  var history = (Array.isArray(source.history) ? source.history : []).map(withClientId);
  var currentId = snapshotId(current);
  return {
    current: current,
    history: history,
    pastHistory: history.filter(function (item) {
      return snapshotId(item) !== currentId;
    }),
    lastGeneratedDreamCount: Number(source.lastGeneratedDreamCount || 0),
    lastPortraitRefreshKey: String(source.lastPortraitRefreshKey || '')
  };
}

function persistMemoryState(state) {
  var normalized = normalizeMemoryState(state);
  Object.keys(state).forEach(function (key) { delete state[key]; });
  Object.assign(state, normalized);
  wx.setStorageSync(PROFILE_MEMORY_KEY, state);
}

function readCachedState() {
  return normalizeMemoryState(wx.getStorageSync(PROFILE_MEMORY_KEY));
}

function dayLabel(value) {
  var date = new Date(value);
  if (!value || isNaN(date.getTime())) return '';
  return (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

// ── 视图模型 ────────────────────────────────────────────────────────────
//
// 下面这三样在库里存了很久却一次都没渲染过，它们是画像从「好看」变成「可信」
// 的全部差别：
//   · sourceRefs —— 这段判断是从哪几个梦长出来的。prompt 明确要求画像「能指
//     回具体是哪个梦的哪一处」，界面却不给核对入口；一个无法核对的判断会退化
//     成星座运势，正是那份 prompt 一直在对抗的失败模式。
//   · 历史版本 —— 「三个月前你是这样，现在你是这样」是画像唯一能做、而单次
//     解读永远做不到的事，数据早就在 profile_snapshots 里。
//   · changeReason —— 这一版为什么和上一版不同。

function buildSourceList(snapshot, archive) {
  var refs = snapshot && Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : [];
  var byId = {};
  (Array.isArray(archive) ? archive : []).forEach(function (dream) {
    if (dream && dream.id) byId[String(dream.id)] = dream;
  });

  return refs.filter(function (ref) {
    // 只展示能点开核对的梦。用户资料和生活记录也在 sourceRefs 里，但它们没有
    // 可跳转的落点，列出来只是让这一行变长。
    return ref && ref.sourceType === 'dream_entries' && ref.sourceState !== 'missing' && ref.sourceState !== 'invalid';
  }).map(function (ref) {
    var localId = String(ref.sourceLocalId || ref.sourceId || '');
    var dream = byId[localId];
    return {
      dreamId: localId,
      title: dream && dream.result && dream.result.title ? dream.result.title : '一个已归档的梦',
      dateLabel: dayLabel(ref.createdAt || (dream && dream.createdAt)),
      openable: !!dream
    };
  }).slice(0, 6);
}

function buildHistoryList(state) {
  return (state.pastHistory || []).filter(function (item) {
    return item && String(item.summary || '').trim();
  }).map(function (item) {
    return {
      clientId: item.clientId,
      version: Number(item.version || 0),
      versionLabel: item.version ? 'V' + String(item.version) : '早期版本',
      dateLabel: dayLabel(item.updatedAt || item.createdAt),
      summary: String(item.summary || '').trim(),
      changeReason: String(item.changeReason || '').trim()
    };
  }).sort(function (left, right) {
    return right.version - left.version;
  }).slice(0, 10);
}

function statusLabel(state, flags) {
  var options = flags || {};
  if (options.migrationState === 'migrating') return '画像迁移中';
  if (options.migrationState === 'failed') return '画像迁移失败';
  if (state.current) {
    return state.current.useInFutureReadings === false ? '已暂停解读' : '用于解读中';
  }
  if (!options.memoryLoaded) return '读取中';
  if (options.loading) return '正在梳理';
  if (options.loadError || options.generateFailed) return '暂时不可用';
  return '等待形成';
}

function buildView(state, archive, flags) {
  var normalized = normalizeMemoryState(state);
  var current = normalized.current;
  var version = Number(current && current.version || 0);
  var seenVersion = Number(wx.getStorageSync(SEEN_VERSION_KEY) || 0);

  return {
    portraitVersionLabel: version ? 'V' + String(version) : '',
    portraitStatusLabel: statusLabel(normalized, flags),
    portraitUpdatedLabel: current ? dayLabel(current.updatedAt || current.createdAt) : '',
    portraitSources: buildSourceList(current, archive),
    portraitHistory: buildHistoryList(normalized),
    // 「已更新」只在真的换了版本、且用户还没看过时出现。它不是徽章装饰，是
    // 这个产品唯一一个「有新东西可看」的信号。
    portraitHasUpdate: !!(version && version > seenVersion && seenVersion > 0),
    portraitPaused: !!(current && current.useInFutureReadings === false)
  };
}

// 用户看过当前版本后就不再提示。第一次使用（seenVersion 为 0）只记录不提示，
// 否则每个新用户一进来就会看到一个「已更新」——他还没有旧版本可对比。
function markVersionSeen(state) {
  var normalized = normalizeMemoryState(state);
  var version = Number(normalized.current && normalized.current.version || 0);
  if (!version) return;
  wx.setStorageSync(SEEN_VERSION_KEY, version);
}

// ── 控制器 ──────────────────────────────────────────────────────────────

function createController(page, options) {
  var settings = options || {};
  var cloudBase = settings.cloudBase;

  function archiveRecords() {
    return wx.getStorageSync('oneiro:dreamArchive') || [];
  }

  function commit(state, extra) {
    var next = normalizeMemoryState(state);
    var flags = Object.assign({
      memoryLoaded: page.data.memoryLoaded,
      loading: page.data.portraitLoading,
      loadError: page.data.portraitLoadError,
      generateFailed: page.data.portraitGenerateFailed,
      migrationState: page.data.portraitMigrationState
    }, extra || {});
    page.setData(Object.assign(
      { memoryState: next },
      extra || {},
      buildView(next, archiveRecords(), flags)
    ));
    return next;
  }

  var controller = {
    PROFILE_MEMORY_KEY: PROFILE_MEMORY_KEY,

    // 冷启动：先渲染本机缓存，再去云端对齐。缓存里已经有画像时不进加载态，
    // 否则每次切到这个 tab 都会先闪一下骨架屏。
    hydrateFromCache: function () {
      var state = readCachedState();
      commit(state, { memoryLoaded: !!state.current });
      return state;
    },

    load: function () {
      page.setData({ memoryLoaded: false, portraitLoadError: false });
      cloudBase.getProfileMemory(function (result) {
        if (!result || !result.ok) {
          // 拉取本身失败。只有在还没有任何内容可显示时才把它呈现为「读取失败」
          // ——已经显示着一版画像时，一次后台拉取失败不该打扰它。
          commit(page.data.memoryState, {
            memoryLoaded: true,
            portraitLoadError: !page.data.memoryState.current
          });
          return;
        }
        var remote = normalizeMemoryState(result);
        var local = normalizeMemoryState(page.data.memoryState);
        if (!remote.current && !remote.latestDraft && !remote.history.length && (local.current || local.history.length)) {
          commit(local, { memoryLoaded: true, portraitLoadError: false });
          if (needsPortraitMigration(local.current)) {
            page.setData({ portraitMigrationState: 'migrating' });
            controller.ensureGenerated(true, '旧版本画像升级');
          }
          return;
        }
        persistMemoryState(remote);
        commit(remote, { memoryLoaded: true, portraitLoadError: false });
        if (!remote.current) controller.ensureGenerated();
        else if (needsPortraitMigration(remote.current)) {
          page.setData({ portraitMigrationState: 'migrating' });
          controller.ensureGenerated(true, '旧版本画像升级');
        }
      });
    },

    retry: function () {
      page.setData({
        memoryLoaded: false,
        portraitLoadError: false,
        portraitGenerateFailed: false,
        portraitAutoGenerateTriggered: false
      });
      controller.load();
    },

    refresh: function () {
      // 自动迁移刻意只在每次进页面时跑一次；用户主动点的「重新梳理」是另一个
      // 动作，必须始终可用。force 让云端知道这是用户明确要的一次新解读，即使
      // 证据没变也要真的跑一次生成。
      page.setData({ portraitAutoGenerateTriggered: false, portraitGenerateFailed: false });
      controller.ensureGenerated(true, '手动重新梳理', { force: true });
    },

    ensureGenerated: function (allowExisting, reason, options) {
      var state = normalizeMemoryState(page.data.memoryState);
      if ((!allowExisting && state.current) || page.data.portraitLoading || page.data.portraitAutoGenerateTriggered) return;
      var dreamCount = page.data.insights ? page.data.insights.dreamCount : 0;
      page.setData({ portraitLoading: true, portraitAutoGenerateTriggered: true, portraitGenerateFailed: false });
      analytics.trackEvent(allowExisting ? 'profile_portrait_refresh' : 'profile_portrait_auto_generate', { dreamCount: dreamCount });
      var requestReason = reason || '首次打开画像时自动梳理';
      var retryDelays = [2000, 5000, 10000];

      function requestPortrait(attempt) {
        cloudBase.generateProfilePortrait(requestReason, function (result) {
          if (result && result.ok && result.unchanged) {
            // 云端判定这次没有实质变化，没有发新版本。这是正常结果，不是失败：
            // 界面保持当前画像不动，也不该出现「已更新」。用户主动点了「重新
            // 梳理」却什么都不说的话，按钮转一圈回来像是坏了，所以只在他明确
            // 要求时给一句回执。
            var unchangedState = normalizeMemoryState(page.data.memoryState);
            var returned = result.snapshot ? withClientId(result.snapshot) : null;
            // unchanged 的语义是「当前这一版原样返回」，云端只刷新了它的溯源。
            // 只有 id 对得上才就地替换：换成一个 id 不同的快照会把旧的那条挤进
            // 历史，凭空多出一版——正是这条闸要消灭的东西。
            if (returned && snapshotId(returned) === snapshotId(unchangedState.current)) {
              unchangedState.current = returned;
              unchangedState.history = unchangedState.history.map(function (item) {
                return snapshotId(item) === snapshotId(returned) ? returned : item;
              });
              persistMemoryState(unchangedState);
            }
            commit(unchangedState, {
              memoryLoaded: true,
              portraitLoading: false,
              portraitGenerateFailed: false,
              portraitMigrationState: ''
            });
            analytics.trackEvent('profile_portrait_unchanged', {
              reason: String(result.unchangedReason || ''),
              forced: !!(options && options.force)
            });
            if (options && options.force) {
              wx.showToast({ title: '这一版和上一版没有实质变化', icon: 'none', duration: 2400 });
            }
            return;
          }
          if (!result || !result.ok || !result.snapshot) {
            if (result && result.reason === 'sources_changed' && attempt < 3) {
              setTimeout(function () { requestPortrait(attempt + 1); }, retryDelays[attempt]);
              return;
            }
            // 生成失败不丢任务；下次保存梦或应用启动时静默补偿。
            syncQueue.enqueue('portrait_refresh', {
              refreshKey: 'profile:' + String(dreamCount),
              reason: requestReason
            });
            commit(page.data.memoryState, { portraitLoading: false, portraitGenerateFailed: true });
            if (page.data.portraitMigrationState === 'migrating') page.setData({ portraitMigrationState: 'failed' });
            return;
          }
          var nextState = normalizeMemoryState(page.data.memoryState);
          var snapshot = Object.assign({}, withClientId(result.snapshot), { status: 'confirmed', isCurrent: true });
          nextState.current = snapshot;
          nextState.history = [snapshot].concat(nextState.history.filter(function (item) {
            return snapshotId(item) !== snapshotId(snapshot);
          }).map(function (item) {
            return Object.assign({}, item, { isCurrent: false });
          })).slice(0, 30);
          nextState.lastGeneratedDreamCount = dreamCount;
          persistMemoryState(nextState);
          commit(nextState, {
            memoryLoaded: true,
            portraitLoading: false,
            portraitGenerateFailed: false,
            portraitMigrationState: ''
          });
        }, options || {});
      }
      requestPortrait(0);
    },

    // 先本地翻转让界面立刻响应，云端失败再回滚并说明，不留下和云端不一致的
    // 状态。
    toggleUse: function () {
      var state = normalizeMemoryState(page.data.memoryState);
      var portrait = state.current;
      if (!portrait || page.data.portraitLoading) return;

      var nextUse = portrait.useInFutureReadings === false;
      var targetId = snapshotId(portrait);

      function applyUse(useInFutureReadings) {
        var next = normalizeMemoryState(page.data.memoryState);
        if (!next.current) return;
        next.current = Object.assign({}, next.current, { useInFutureReadings: useInFutureReadings });
        next.history = next.history.map(function (item) {
          return snapshotId(item) === targetId
            ? Object.assign({}, item, { useInFutureReadings: useInFutureReadings })
            : item;
        });
        persistMemoryState(next);
        commit(next);
      }

      applyUse(nextUse);
      analytics.trackEvent('profile_portrait_toggle_use', { useInFutureReadings: nextUse });

      // 纯本机草稿还没有云端快照 id，本地翻转即是全部状态
      if (!targetId || targetId.indexOf('local-') === 0) {
        wx.showToast({ title: nextUse ? '已恢复用于解读' : '已暂停用于解读', icon: 'none' });
        return;
      }

      cloudBase.toggleProfilePortrait(targetId, nextUse, function (result) {
        if (!result || !result.ok) {
          applyUse(!nextUse);
          wx.showToast({ title: '暂时没有改成功，请稍后再试', icon: 'none' });
          return;
        }
        wx.showToast({ title: nextUse ? '已恢复用于解读' : '已暂停用于解读', icon: 'none' });
      });
    },

    markSeen: function () {
      markVersionSeen(page.data.memoryState);
      if (page.data.portraitHasUpdate) page.setData({ portraitHasUpdate: false });
    },

    rerender: function () {
      commit(page.data.memoryState);
    }
  };

  return controller;
}

module.exports = {
  PROFILE_MEMORY_KEY: PROFILE_MEMORY_KEY,
  SEEN_VERSION_KEY: SEEN_VERSION_KEY,
  emptyMemoryState: emptyMemoryState,
  snapshotId: snapshotId,
  withClientId: withClientId,
  needsPortraitMigration: needsPortraitMigration,
  normalizeMemoryState: normalizeMemoryState,
  persistMemoryState: persistMemoryState,
  readCachedState: readCachedState,
  buildView: buildView,
  markVersionSeen: markVersionSeen,
  createController: createController
};
