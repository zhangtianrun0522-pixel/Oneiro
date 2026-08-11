var cloudBase = require('./cloudBase');
var STORAGE_KEY = 'oneiro:events';
var MAX_EVENTS = 120;

function hasStorage() {
  return typeof wx !== 'undefined' && wx && wx.getStorageSync && wx.setStorageSync;
}

function readEvents() {
  if (!hasStorage()) {
    return [];
  }

  var events = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(events) ? events : [];
}

function cleanMetadata(metadata) {
  var source = metadata || {};
  var cleaned = {};
  var key;

  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (
        typeof source[key] === 'string' ||
        typeof source[key] === 'number' ||
        typeof source[key] === 'boolean'
      ) {
        cleaned[key] = source[key];
      }
    }
  }

  return cleaned;
}

function trackEvent(eventName, metadata) {
  var name = String(eventName || '').trim();
  var events;
  var event;

  if (!name || !hasStorage()) {
    return null;
  }

  events = readEvents();
  event = {
    // 这个 id 是云端幂等写入的键：同一条事件被重传多少次都只算一次。缓冲区
    // 满了之后 events.length 恒为 120，只剩毫秒数区分，同一毫秒内的两条事件
    // 会撞成同一个 id、在云端互相覆盖——补一段随机后缀，让它真的唯一。
    id: String(Date.now()) + '-' + events.length + '-' + Math.random().toString(36).slice(2, 8),
    name: name,
    metadata: cleanMetadata(metadata),
    createdAt: new Date().toISOString()
  };

  events.unshift(event);
  wx.setStorageSync(STORAGE_KEY, events.slice(0, MAX_EVENTS));
  cloudBase.trackEvent(event);

  return event;
}

function getEvents() {
  return readEvents();
}

function clearEvents() {
  if (hasStorage()) {
    wx.setStorageSync(STORAGE_KEY, []);
  }
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  trackEvent: trackEvent,
  getEvents: getEvents,
  clearEvents: clearEvents
};
