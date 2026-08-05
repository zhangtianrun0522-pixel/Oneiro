var STORAGE_KEY = 'oneiro:pendingSyncTasks';
var MAX_TASKS = 40;
var instanceSequence = 0;

function readTasks() {
  var tasks = wx.getStorageSync(STORAGE_KEY) || [];
  return Array.isArray(tasks) ? tasks : [];
}

function writeTasks(tasks) {
  wx.setStorageSync(STORAGE_KEY, (Array.isArray(tasks) ? tasks : []).slice(-MAX_TASKS));
}

function taskKey(type, payload) {
  var value = payload || {};
  if (type === 'portrait_refresh') return 'portrait:' + String(value.refreshKey || 'latest');
  if (type === 'life_note') return 'life:' + String(value.dreamId || '') + ':' + String(value.text || '');
  if (type === 'dream_sync') return 'dream:' + String(value.dream && value.dream.id || value.dreamId || '');
  return String(type || '') + ':' + String(value.key || '');
}

function enqueue(type, payload) {
  var key = taskKey(type, payload);
  var existing = readTasks().filter(function (item) { return item && item.key === key; });
  var revision = existing.reduce(function (max, item) {
    return Math.max(max, Number(item.revision) || 0);
  }, 0) + 1;
  instanceSequence += 1;
  var task = Object.assign({
    type: type,
    key: key,
    createdAt: new Date().toISOString(),
    revision: revision,
    instanceId: String(Date.now()) + '-' + String(instanceSequence) + '-' + Math.random().toString(36).slice(2, 8)
  }, payload || {});
  var tasks = readTasks().filter(function (item) { return item && item.key !== task.key; });
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

function remove(task) {
  if (!task) return false;
  var tasks = readTasks();
  var removed = false;
  var remaining = tasks.filter(function (item) {
    if (!item || item.key !== task.key) return true;
    // A callback may belong to an older payload that was replaced while it
    // was in flight. Never remove the newer task in that case.
    var sameInstance = task.instanceId && item.instanceId
      ? task.instanceId === item.instanceId
      : !task.instanceId && !item.instanceId && task.createdAt === item.createdAt;
    if (sameInstance) {
      removed = true;
      return false;
    }
    return true;
  });
  if (removed) writeTasks(remaining);
  return removed;
}

function removeByKey(key) {
  var targetKey = String(key || '');
  var tasks = readTasks();
  var removed = false;
  var remaining = tasks.filter(function (item) {
    if (!removed && item && item.key === targetKey) {
      removed = true;
      return false;
    }
    return true;
  });
  if (removed) writeTasks(remaining);
  return removed;
}

function has(type, key) {
  return readTasks().some(function (item) {
    return item && item.type === type && (!key || item.refreshKey === key || item.key === key);
  });
}

function list() {
  return readTasks();
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  enqueue: enqueue,
  remove: remove,
  removeByKey: removeByKey,
  has: has,
  list: list
};
