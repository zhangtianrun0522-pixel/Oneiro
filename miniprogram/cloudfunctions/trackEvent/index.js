const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeEvent(event, openid) {
  return {
    openid: openid,
    localId: String((event && event.id) || ''),
    eventName: String((event && event.name) || ''),
    metadata: (event && event.metadata) || {},
    localCreatedAt: String((event && event.createdAt) || ''),
    createdAt: new Date()
  };
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const events = Array.isArray(event && event.events)
    ? event.events
    : event && event.event
      ? [event.event]
      : [];
  const validEvents = events
    .map(function (item) {
      return normalizeEvent(item, wxContext.OPENID);
    })
    .filter(function (item) {
      return item.eventName;
    });
  let i;

  for (i = 0; i < validEvents.length; i += 1) {
    await db.collection('events').add({
      data: validEvents[i]
    });
  }

  return {
    ok: true,
    inserted: validEvents.length
  };
};
