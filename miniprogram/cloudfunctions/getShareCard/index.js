const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async function (event) {
  const shareId = String((event && event.shareId) || '');

  if (!shareId) {
    return { ok: false, reason: 'missing_share_id' };
  }

  const result = await db.collection('share_pages')
    .where({ slug: shareId, revokedAt: null })
    .limit(1)
    .get();

  if (!result.data || !result.data.length) {
    return { ok: false, reason: 'not_found' };
  }

  return {
    ok: true,
    shareId: shareId,
    payload: result.data[0].payload
  };
};
