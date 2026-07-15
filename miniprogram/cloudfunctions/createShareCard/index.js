const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function publicDreamPayload(dream, imageFileId) {
  const result = dream && dream.result ? dream.result : {};

  return {
    localDreamId: String((dream && dream.id) || ''),
    title: String(result.title || '梦卡'),
    cardNo: String(result.card_no || 'NO. 001'),
    cardTheme: String(result.card_theme || 'mist'),
    profileSummary: 'ONEIRO · 梦境记录',
    emotionalWeather: String(result.emotional_weather || ''),
    symbols: Array.isArray(result.symbols) ? result.symbols.slice(0, 5) : [],
    cardInsight: String(result.card_insight || result.one_small_act || ''),
    imageFileId: String(imageFileId || ''),
    createdAt: new Date()
  };
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const dream = event && event.dream ? event.dream : {};
  const payload = publicDreamPayload(dream, event && event.imageFileId);
  const slug = 'card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const created = await db.collection('share_pages').add({
    data: {
      openid: wxContext.OPENID,
      slug: slug,
      visibility: 'card_only',
      payload: payload,
      createdAt: new Date(),
      revokedAt: null
    }
  });

  return {
    ok: true,
    id: created._id,
    shareId: slug,
    path: '/pages/share/index?id=' + encodeURIComponent(slug),
    payload: payload
  };
};
