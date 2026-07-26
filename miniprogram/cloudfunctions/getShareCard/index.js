const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async function (event) {
  const shareId = String((event && event.shareId) || '');

  if (!shareId) {
    return { ok: false, reason: 'missing_share_id' };
  }

  const result = await db.collection('share_pages')
    .where({ slug: shareId })
    .limit(1)
    .get();

  const sharePage = result.data && result.data[0];
  if (!sharePage || sharePage.revokedAt || sharePage.revoked === true) {
    return { ok: false, reason: 'not_found' };
  }

  return {
    ok: true,
    shareId: shareId,
    payload: sharePage.payload
  };
};
