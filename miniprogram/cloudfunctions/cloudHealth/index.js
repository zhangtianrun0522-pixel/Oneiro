const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const REQUIRED_COLLECTIONS = [
  'users',
  'dream_entries',
  'events',
  'share_pages',
  'generated_assets'
];

function errorSummary(error) {
  return {
    code: error && (error.errCode || error.code || error.name) ? String(error.errCode || error.code || error.name) : '',
    message: error && error.message ? String(error.message) : String(error || '')
  };
}

function isAlreadyExists(error) {
  const summary = errorSummary(error);
  const text = (summary.code + ' ' + summary.message).toLowerCase();

  return text.indexOf('exist') >= 0 || text.indexOf('already') >= 0 || text.indexOf('collection') >= 0 && text.indexOf('duplicate') >= 0;
}

async function ensureCollection(name) {
  const result = {
    name: name,
    ok: false,
    created: false,
    readable: false,
    error: null
  };

  try {
    await db.createCollection(name);
    result.created = true;
  } catch (error) {
    if (!isAlreadyExists(error)) {
      result.error = errorSummary(error);
      return result;
    }
  }

  try {
    await db.collection(name).limit(1).get();
    result.ok = true;
    result.readable = true;
  } catch (error) {
    result.error = errorSummary(error);
  }

  return result;
}

async function writeHealthEvent(openid, runId) {
  const created = await db.collection('events').add({
    data: {
      openid: openid,
      eventName: 'cloud_health_check',
      metadata: {
        runId: runId,
        source: 'cloudHealth'
      },
      createdAt: new Date()
    }
  });

  return created._id;
}

async function uploadHealthAsset(openid, runId) {
  const cloudPath = 'share-cards/healthcheck-' + runId + '.txt';
  const uploaded = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: Buffer.from('oneiro cloud health ' + runId)
  });
  const created = await db.collection('generated_assets').add({
    data: {
      openid: openid,
      type: 'healthcheck',
      runId: runId,
      cloudPath: cloudPath,
      fileId: uploaded.fileID,
      createdAt: new Date()
    }
  });

  return {
    cloudPath: cloudPath,
    fileId: uploaded.fileID,
    assetId: created._id
  };
}

exports.main = async function () {
  const wxContext = cloud.getWXContext();
  const runId = String(Date.now());
  const collections = [];
  let i;
  let eventId = '';
  let storage = null;
  let writeError = null;
  let storageError = null;

  for (i = 0; i < REQUIRED_COLLECTIONS.length; i += 1) {
    collections.push(await ensureCollection(REQUIRED_COLLECTIONS[i]));
  }

  if (collections.every(function (item) { return item.ok; })) {
    try {
      eventId = await writeHealthEvent(wxContext.OPENID, runId);
    } catch (error) {
      writeError = errorSummary(error);
    }

    try {
      storage = await uploadHealthAsset(wxContext.OPENID, runId);
    } catch (error) {
      storageError = errorSummary(error);
    }
  }

  return {
    ok: collections.every(function (item) { return item.ok; }) && !writeError && !storageError,
    env: wxContext.ENV,
    appid: wxContext.APPID,
    openidPresent: Boolean(wxContext.OPENID),
    runId: runId,
    collections: collections,
    eventId: eventId,
    storage: storage,
    writeError: writeError,
    storageError: storageError
  };
};
