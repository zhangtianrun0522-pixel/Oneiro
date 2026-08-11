const cloud = require('wx-server-sdk');
const crypto = require('crypto');

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

// ── 同一条事件只算一次 ──────────────────────────────────────────────────
//
// 客户端会把一条事件报两次以上：生成时立刻单条上传一次，之后每次冷启动、每记
// 一个梦，又会把本地那个「最新 120 条」的缓冲区整体重传一遍，而缓冲区从来不
// 清。以前这里是无条件 add()，于是一条事件在缓冲区里待过多少次上传就被记多少
// 次——后台看到的 2668 次生图尝试对应的其实只有 43 个梦。
//
// 重传本身是必要的（弱网下单条上传会丢），所以不能靠客户端少传，只能让写入幂
// 等：文档 id 由 openid + 客户端事件 id 决定，重传落在同一个 id 上，覆盖而不
// 是新增。openid 要一起进 id，否则两个用户撞上同一个本地 id 会互相覆盖。
function eventDocId(item) {
  return 'evt-' + crypto.createHash('sha256')
    .update([String(item.openid || ''), String(item.localId || '')].join('|'))
    .digest('hex')
    .slice(0, 32);
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
  let inserted = 0;
  let i;

  for (i = 0; i < validEvents.length; i += 1) {
    const item = validEvents[i];
    // 老客户端不带 localId 时退回原来的行为：宁可多记一条，也不要把一批没有
    // id 的事件全折叠成一条。
    if (!item.localId) {
      await db.collection('events').add({ data: item });
      inserted += 1;
      continue;
    }
    try {
      await db.collection('events').doc(eventDocId(item)).set({ data: item });
      inserted += 1;
    } catch (error) {
      // 幂等写入失败不该把整批拖掉：埋点丢一条是小事，丢一批是看不见问题。
    }
  }

  return {
    ok: true,
    inserted: inserted
  };
};
