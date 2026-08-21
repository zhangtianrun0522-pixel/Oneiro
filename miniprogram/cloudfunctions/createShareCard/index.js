const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const contentSecurity = require('./contentSecurity');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function publicText(value, limit) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[已隐藏]')
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, '[已隐藏]')
    .replace(/\b\d{15,18}[0-9Xx]?\b/g, '[已隐藏]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, limit || 240);
}

function publicDreamPayload(dream) {
  const result = dream && dream.result ? dream.result : {};
  const publicInsight = result.reflection_answer
    ? result.one_small_act || result.emotional_weather || ''
    : result.card_insight || result.one_small_act || '';

  return {
    title: publicText(result.reflection_answer ? (result.public_title || '梦卡') : (result.title || '梦卡'), 24),
    cardNo: publicText(result.card_no || 'NO. 001', 20),
    cardTheme: publicText(result.card_theme || 'mist', 24),
    profileSummary: 'ONEIRO · 梦境记录',
    emotionalWeather: publicText(result.emotional_weather || '', 180),
    symbols: Array.isArray(result.symbols) ? result.symbols.map(function (item) {
      return publicText(item, 32);
    }).filter(Boolean).slice(0, 5) : [],
    cardInsight: publicText(publicInsight, 240)
  };
}

function deletionJobId(openid, localDreamId) {
  return 'dream-' + crypto.createHash('sha256')
    .update(String(openid || '') + ':' + String(localDreamId || ''))
    .digest('hex')
    .slice(0, 48);
}

async function getDocument(collection, id) {
  try {
    const response = await collection.doc(id).get();
    return response && response.data ? response.data : null;
  } catch (error) {
    return null;
  }
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const requestedDream = event && event.dream ? event.dream : {};
  const localDreamId = String((requestedDream && requestedDream.id) || '').trim();
  if (!localDreamId) return { ok: false, reason: 'missing_dream_id' };
  const owned = await db.collection('dream_entries')
    .where({ openid: wxContext.OPENID, localId: localDreamId })
    .limit(1)
    .get();
  const dream = owned && owned.data && owned.data[0];
  if (!dream || dream.deletionPending) return { ok: false, reason: 'dream_not_found' };
  const existingDeletion = await db.collection('deletion_jobs')
    .where({ openid: wxContext.OPENID, sourceDreamId: localDreamId })
    .limit(1)
    .get();
  if (existingDeletion.data && existingDeletion.data.length) {
    return { ok: false, reason: 'dream_not_found' };
  }
  const payload = publicDreamPayload(dream);

  // 这里是唯一会把内容送出这个用户之外的地方，所以是全项目唯一 strict 的一处：
  // 检测接口挂了就不发卡。私密梦境放行的那套理由（不能因为接口抖动让产品瘫痪）
  // 在这里不成立——分享出去就撤不回来了。
  const shareSecurity = await contentSecurity.checkTexts(cloud, {
    contents: [payload.title, payload.emotionalWeather, payload.cardInsight].concat(payload.symbols || []),
    openid: wxContext.OPENID,
    scene: contentSecurity.SCENE.FORUM,
    strict: true,
    budgetMs: 8000
  });

  if (!shareSecurity.pass) {
    return {
      ok: false,
      blocked: true,
      reason: 'content_security_' + shareSecurity.reason,
      message: shareSecurity.degraded
        ? '分享暂时不可用，稍后再试。'
        : '这张卡没办法分享出去。'
    };
  }

  const slug = 'card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const shareData = {
    openid: wxContext.OPENID,
    slug: slug,
    visibility: 'card_only',
    sourceDreamId: localDreamId,
    payload: payload,
    createdAt: new Date(),
    revokedAt: null
  };
  let created;

  if (typeof db.runTransaction === 'function') {
    created = await db.runTransaction(async function (transaction) {
      const tombstone = await getDocument(
        transaction.collection('deletion_jobs'),
        deletionJobId(wxContext.OPENID, localDreamId)
      );
      const currentDream = await getDocument(transaction.collection('dream_entries'), dream._id);
      if (tombstone || !currentDream || currentDream.deletionPending) return null;
      return transaction.collection('share_pages').add({ data: shareData });
    });
  } else {
    created = await db.collection('share_pages').add({ data: shareData });
  }

  if (!created || !created._id) return { ok: false, reason: 'dream_not_found' };

  return {
    ok: true,
    id: created._id,
    shareId: slug,
    path: '/pages/share/index?id=' + encodeURIComponent(slug),
    payload: payload
  };
};
