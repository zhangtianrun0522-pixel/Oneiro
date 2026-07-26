const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const profile = event && event.profile ? event.profile : {};
  const now = new Date();
  const user = {
    openid: wxContext.OPENID,
    nickname: String(profile.nickname || ''),
    birthDate: String(profile.birthDate || ''),
    birthTime: String(profile.birthTime || ''),
    birthPlace: String(profile.birthPlace || ''),
    gender: ['male', 'female'].indexOf(String(profile.gender || '').trim().toLowerCase()) >= 0
      ? String(profile.gender).trim().toLowerCase()
      : '',
    updatedAt: now
  };
  const existing = await db.collection('users').where({ openid: wxContext.OPENID }).limit(1).get();

  if (existing.data && existing.data.length) {
    await db.collection('users').doc(existing.data[0]._id).update({
      data: user
    });
    return { ok: true, id: existing.data[0]._id, updated: true };
  }

  const created = await db.collection('users').add({
    data: Object.assign({}, user, { createdAt: now })
  });

  return { ok: true, id: created._id, updated: false };
};
