const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 与 pages/dream-chat 的 MAX_STORED_MESSAGES 对齐。
const MAX_STORED_CHAT_MESSAGES = 60;

function safeDream(dream) {
  const status = ['pending', 'ready', 'blocked'].indexOf(dream && dream.status) >= 0
    ? dream.status
    : 'ready';
  const result = status === 'ready' && dream && dream.result && typeof dream.result === 'object'
    ? dream.result
    : null;
  const resultFields = result || {};
  const facts = dream && dream.dreamFacts ? dream.dreamFacts : {};
  const feedbackOptions = ['inspiring', 'too_generic', 'too_mystical', 'not_grounded'];
  const feedback = feedbackOptions.indexOf(dream && dream.feedback) >= 0 ? dream.feedback : '';

  function stringList(value, limit) {
    return Array.isArray(value)
      ? value.map(function (item) { return String(item || '').trim(); }).filter(Boolean).slice(0, limit)
      : [];
  }

  function chatMessages(value) {
    // 对话轮数不再设上限，云端保留的条数要跟着客户端一起放宽，否则用户换台
    // 设备回来时，一段长对话会被砍成最后 12 条。
    return Array.isArray(value) ? value.slice(-MAX_STORED_CHAT_MESSAGES).map(function (item) {
      return {
        role: item && item.role === 'assistant' ? 'assistant' : 'user',
        content: String((item && item.content) || '').trim().slice(0, 800),
        createdAt: item && item.createdAt ? new Date(item.createdAt) : new Date(),
        confirmed: !!(item && item.confirmed)
      };
    }).filter(function (item) { return item.content; }) : [];
  }

  // 键是呼应原文本身，不是数组下标：重新解读后条目顺序会变，但用户当时点过
  // 「是这样」的那句话不会变，用文本才不会把表态错配到另一条呼应上。上限跟着
  // 模型能给出的呼应条数（3 条）走，多出来的是客户端异常，不收。
  function connectionVerdicts(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const cleaned = {};
    Object.keys(source).slice(0, 3).forEach(function (key) {
      const record = source[key];
      const verdict = record && record.verdict;
      if (verdict !== 'confirmed' && verdict !== 'rejected') return;
      cleaned[String(key).slice(0, 260)] = {
        verdict: verdict,
        text: String((record && record.text) || key).slice(0, 260),
        at: record && record.at ? new Date(record.at) : new Date()
      };
    });
    return cleaned;
  }

  return {
    localId: String((dream && dream.id) || ''),
    dreamText: String((dream && dream.dreamText) || ''),
    status: status,
    result: result,
    dreamFacts: {
      people: stringList(facts.people, 6),
      places: stringList(facts.places, 6),
      objects: stringList(facts.objects, 6),
      actions: stringList(facts.actions, 6),
      emotions: stringList(facts.emotions, 6),
      timeSense: stringList(facts.time_sense || facts.timeSense, 6)
    },
    symbols: Array.isArray(resultFields.symbols) ? resultFields.symbols : [],
    emotionalWeather: String(resultFields.emotional_weather || ''),
    cardTheme: String(resultFields.card_theme || 'mist'),
    interpretationSource: String((dream && dream.interpretationSource) || ''),
    interpretationProvider: String((dream && dream.interpretationProvider) || ''),
    interpretationError: String((dream && dream.interpretationError) || '').slice(0, 300),
    interpretationRevision: Math.max(0, Math.floor(Number(dream && dream.interpretationRevision) || 0)),
    interpretationMeta: {
      schemaVersion: String((dream && dream.interpretationMeta && dream.interpretationMeta.schemaVersion) || 'dream-entry-v0.2'),
      promptVersion: String((dream && dream.interpretationMeta && dream.interpretationMeta.promptVersion) || ''),
      model: String((dream && dream.interpretationMeta && dream.interpretationMeta.model) || ''),
      memoryUnavailable: !!(dream && dream.interpretationMeta && dream.interpretationMeta.memoryUnavailable)
    },
    chatMessages: chatMessages(dream && dream.chatMessages),
    // 用户在「与你有关」每条呼应上的表态。这个白名单是严格的——没列进来的字段
    // 会被静默丢掉，而云端记录在归档页会盖回本地（同一条记录云端更新时间更晚，
    // 远端胜出），于是表态在下一次进归档时就会被抹掉，按钮全部弹回未选中。
    // 「是这样」上行出去的证据活在 life_notes 里不受影响，但用户看到的是自己
    // 刚做过的判断凭空消失，那比没有这个功能更糟。
    connectionVerdicts: connectionVerdicts(dream && dream.connectionVerdicts),
    connectionToCorrect: String((dream && dream.connectionToCorrect) || '').slice(0, 260),
    connectionCorrectionRaisedFor: String((dream && dream.connectionCorrectionRaisedFor) || '').slice(0, 260),
    feedback: feedback,
    feedbackAt: feedback && dream.feedbackAt ? new Date(dream.feedbackAt) : null,
    createdAt: dream && dream.createdAt ? new Date(dream.createdAt) : new Date(),
    updatedAt: new Date()
  };
}

async function revokeDreamShares(openid, localDreamId) {
  const queries = [
    { openid: openid, sourceDreamId: localDreamId },
    // Support share cards created before sourceDreamId became a server-side field.
    { openid: openid, 'payload.localDreamId': localDreamId }
  ];
  const seen = {};
  let index;

  for (index = 0; index < queries.length; index += 1) {
    const matches = await db.collection('share_pages').where(queries[index]).get();
    const pages = matches && matches.data ? matches.data : [];
    let pageIndex;

    for (pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      if (!page || !page._id || seen[page._id]) {
        continue;
      }
      seen[page._id] = true;
      await db.collection('share_pages').doc(page._id).update({
        data: { revokedAt: new Date(), revoked: true }
      });
    }
  }
}

async function removeDreamAssets(openid, localDreamId) {
  const matches = await db.collection('generated_assets')
    .where({ openid: openid, sourceDreamId: localDreamId })
    .get();
  const assets = matches && matches.data ? matches.data : [];
  const fileIds = assets.map(function (asset) {
    return String((asset && (asset.fileId || asset.file_id)) || '').trim();
  }).filter(Boolean);

  if (fileIds.length) {
    await cloud.deleteFile({ fileList: fileIds });
  }

  await db.collection('generated_assets')
    .where({ openid: openid, sourceDreamId: localDreamId })
    .remove();
}

function dreamImageFileId(result) {
  const value = result || {};
  return String(value.image_file_id || value.imageFileId || value.fileID || value.fileId || '').trim();
}

function assetFileId(asset) {
  if (!asset) return '';
  const type = String(asset.type || asset.assetType || '').toLowerCase();
  // Share-card assets use the legacy camel-case fileId field. Dream artwork
  // assets use file_id and carry image-generation metadata. Avoid attaching a
  // share-card image to the private dream's front card during recovery.
  if (type === 'share_card' || type === 'share-card') return '';
  const fileId = String(asset.file_id || '').trim();
  if (fileId) return fileId;
  if (!asset.fileId || (!asset.image_format && !asset.imageFormat && !asset.style_preset && !asset.generation_prompt)) return '';
  return String(asset.fileId).trim();
}

function assetTimestamp(asset) {
  const value = asset && (asset.created_at || asset.createdAt || asset.updated_at || asset.updatedAt);
  const time = value instanceof Date ? value.getTime() : new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function enrichDreamImages(openid, dreams) {
  const entries = Array.isArray(dreams) ? dreams : [];
  if (!entries.length) return entries;

  let assets = [];
  try {
    const response = await db.collection('generated_assets')
      .where({ openid: openid })
      .limit(100)
      .get();
    assets = response && Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    // Image recovery is best-effort; the archive itself must remain readable.
    return entries;
  }

  const latestByDream = {};
  assets.forEach(function (asset) {
    const sourceDreamId = String((asset && (asset.sourceDreamId || asset.sourceLocalId)) || '').trim();
    const fileId = assetFileId(asset);
    if (!sourceDreamId || !fileId) return;
    const current = latestByDream[sourceDreamId];
    if (!current || assetTimestamp(asset) >= assetTimestamp(current)) {
      latestByDream[sourceDreamId] = asset;
    }
  });

  const fileIds = [];
  const fileIdSet = {};
  entries.forEach(function (dream) {
    const result = dream && dream.result ? dream.result : {};
    const existingFileId = dreamImageFileId(result);
    const asset = latestByDream[String((dream && (dream.localId || dream.id)) || '')];
    const recoveredFileId = assetFileId(asset);
    const fileId = existingFileId || recoveredFileId;
    if (fileId && !fileIdSet[fileId]) {
      fileIdSet[fileId] = true;
      fileIds.push(fileId);
    }
  });

  const tempUrls = {};
  if (fileIds.length && typeof cloud.getTempFileURL === 'function') {
    try {
      const urlResponse = await cloud.getTempFileURL({ fileList: fileIds });
      const urlEntries = urlResponse && Array.isArray(urlResponse.fileList) ? urlResponse.fileList : [];
      urlEntries.forEach(function (entry) {
        const fileId = String((entry && (entry.fileID || entry.fileId)) || '').trim();
        const url = String((entry && (entry.tempFileURL || entry.tempFileUrl)) || '').trim();
        if (fileId && url) tempUrls[fileId] = url;
      });
    } catch (error) {
      // Existing temporary URLs remain usable until expiry; do not fail archive loading.
    }
  }

  return entries.map(function (dream) {
    const result = dream && dream.result && typeof dream.result === 'object'
      ? Object.assign({}, dream.result)
      : {};
    const sourceDreamId = String((dream && (dream.localId || dream.id)) || '');
    const asset = latestByDream[sourceDreamId];
    const fileId = dreamImageFileId(result) || assetFileId(asset);
    const freshUrl = fileId && tempUrls[fileId] ? tempUrls[fileId] : '';
    if (!fileId && !result.imageUrl) return dream;
    if (fileId) result.image_file_id = fileId;
    if (freshUrl) result.imageUrl = freshUrl;
    return Object.assign({}, dream, { result: result });
  });
}

async function cancelDreamImageQualityJobs(openid, localDreamId) {
  try {
    const matches = await db.collection('image_generation_jobs')
      .where({ openid: openid, sourceDreamId: localDreamId })
      .get();
    const jobs = matches && matches.data ? matches.data : [];
    for (const job of jobs) {
      if (!job || !job._id || job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') continue;
      await db.collection('image_generation_jobs').doc(job._id).update({ data: {
        status: 'cancelled',
        cancel_requested: true,
        provider_image_url: '',
        updated_at: new Date(),
        finished_at: new Date()
      } });
    }
  } catch (error) {
    // Older environments may not have the optional quality collection yet.
  }
}

async function findDeletionJob(openid, localDreamId) {
  const response = await db.collection('deletion_jobs')
    .where({ openid: openid, sourceDreamId: localDreamId })
    .limit(1)
    .get();
  return response && response.data && response.data[0] ? response.data[0] : null;
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

async function ensureDeletionJob(openid, localDreamId, existing) {
  if (existing) return existing;
  const jobId = deletionJobId(openid, localDreamId);
  const data = {
    openid: openid,
    sourceDreamId: localDreamId,
    resourceType: 'dream',
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection('deletion_jobs').doc(jobId).set({
    data: data
  });
  return Object.assign({ _id: jobId }, data);
}

async function markDreamDeleting(openid, dreamRecord, existingJob) {
  const localDreamId = String(dreamRecord.localId || '');
  const jobId = existingJob && existingJob._id
    ? existingJob._id
    : deletionJobId(openid, localDreamId);
  const now = new Date();

  if (typeof db.runTransaction !== 'function') {
    const job = await ensureDeletionJob(openid, localDreamId, existingJob);
    await db.collection('dream_entries').doc(dreamRecord._id).update({ data: {
      deletionPending: true,
      deletionRequestedAt: now,
      updatedAt: now
    } });
    return job;
  }

  return db.runTransaction(async function (transaction) {
    const jobs = transaction.collection('deletion_jobs');
    const current = await getDocument(jobs, jobId);
    const attempts = Number((current || existingJob || {}).attempts || 0) + 1;
    const jobData = {
      openid: openid,
      sourceDreamId: localDreamId,
      resourceType: 'dream',
      status: 'pending',
      attempts: attempts,
      lastError: '',
      createdAt: (current || existingJob || {}).createdAt || now,
      updatedAt: now
    };
    await jobs.doc(jobId).set({ data: jobData });
    await transaction.collection('dream_entries').doc(dreamRecord._id).update({ data: {
      deletionPending: true,
      deletionRequestedAt: now,
      updatedAt: now
    } });
    return Object.assign({ _id: jobId }, jobData);
  });
}

function isStaleInterpretationWrite(current, incoming) {
  const currentRevision = Math.max(0, Math.floor(Number(current && current.interpretationRevision) || 0));
  const incomingRevision = Math.max(0, Math.floor(Number(incoming && incoming.interpretationRevision) || 0));
  const currentStatus = String((current && current.status) || '');
  const incomingStatus = String((incoming && incoming.status) || '');
  const currentResult = current && current.result && typeof current.result === 'object' ? current.result : {};
  const incomingResult = incoming && incoming.result && typeof incoming.result === 'object' ? incoming.result : {};
  const currentHasImage = !!(currentResult.image_file_id || currentResult.imageUrl);
  const incomingHasImage = !!(incomingResult.image_file_id || incomingResult.imageUrl);
  const currentUpdatedAt = new Date(current && current.updatedAt || 0).getTime();
  const incomingUpdatedAt = new Date(incoming && incoming.updatedAt || 0).getTime();

  if (incomingRevision < currentRevision) return true;
  if (incomingRevision === currentRevision && currentStatus === 'ready' && incomingStatus === 'ready') {
    if (currentHasImage && !incomingHasImage) return true;
    if (
      Number.isFinite(currentUpdatedAt) &&
      Number.isFinite(incomingUpdatedAt) &&
      currentUpdatedAt > incomingUpdatedAt
    ) return true;
  }
  return incomingRevision === currentRevision &&
    (currentStatus === 'ready' || currentStatus === 'blocked') &&
    incomingStatus !== currentStatus;
}

function isConcurrentReadyWrite(current, incoming) {
  const currentRevision = Math.max(0, Math.floor(Number(current && current.interpretationRevision) || 0));
  const incomingRevision = Math.max(0, Math.floor(Number(incoming && incoming.interpretationRevision) || 0));
  return currentRevision === incomingRevision &&
    String((current && current.status) || '') === 'ready' &&
    String((incoming && incoming.status) || '') === 'ready';
}

function mergedChatMessages(currentMessages, incomingMessages) {
  const merged = [];
  const seen = {};
  (Array.isArray(currentMessages) ? currentMessages : []).concat(
    Array.isArray(incomingMessages) ? incomingMessages : []
  ).forEach(function (message) {
    const key = [
      String(message && message.role || ''),
      String(message && message.content || ''),
      new Date(message && message.createdAt || 0).getTime()
    ].join('|');
    if (!message || !message.content || seen[key]) return;
    seen[key] = true;
    merged.push(message);
  });
  merged.sort(function (left, right) {
    return new Date(left && left.createdAt || 0).getTime() - new Date(right && right.createdAt || 0).getTime();
  });
  return merged.slice(-MAX_STORED_CHAT_MESSAGES);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function imageQualityStatusRank(status) {
  const ranks = { idle: 0, queued: 1, polling: 2, ready: 3 };
  const normalized = String(status || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ranks, normalized) ? ranks[normalized] : -1;
}

function imageVersionToken(value) {
  const token = nonEmptyString(value);
  // Tokens are generated for a request, not inferred from arbitrary image
  // URLs. The sortable base-36 millisecond portion lets the server reject an
  // old manual refresh snapshot after a newer one has reached the cloud.
  const match = /^(?:refresh|image)-([0-9a-z]+)-[a-z0-9_-]{4,64}$/i.exec(token);
  if (!match) return null;
  const timestamp = parseInt(match[1], 36);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  return { value: token, timestamp: timestamp };
}

function imageContentRank(result) {
  const value = result || {};
  const status = imageQualityStatusRank(value.image_quality_status);
  const quality = nonEmptyString(value.image_quality).toLowerCase();
  if (quality === 'high' && status === 3) return 40;
  if (status === 3) return 30;
  if (quality === 'high') return 20;
  return Math.max(0, status);
}

function hasImageContent(result) {
  const value = result || {};
  return !!(nonEmptyString(value.image_file_id) || nonEmptyString(value.imageUrl));
}

function copyImageBundle(source, target) {
  ['image_file_id', 'imageUrl', 'image_provider', 'image_model',
    'image_style_version', 'image_cache_hit', 'image_format', 'image_bytes',
    'image_visual_plan', 'image_quality_check', 'image_quality',
    'image_quality_job_id', 'image_quality_status',
    'image_generation_token', 'image_refresh_token']
    .forEach(function (field) {
      if (source[field] !== undefined) target[field] = source[field];
    });
}

function mergeImageFields(currentResult, incomingResult, result) {
  const currentHasImage = hasImageContent(currentResult);
  const incomingHasImage = hasImageContent(incomingResult);
  const currentRefresh = imageVersionToken(currentResult.image_refresh_token);
  const incomingRefresh = imageVersionToken(incomingResult.image_refresh_token);
  const currentGeneration = imageVersionToken(currentResult.image_generation_token);
  const incomingGeneration = imageVersionToken(incomingResult.image_generation_token);
  const sameGeneration = currentGeneration && incomingGeneration &&
    currentGeneration.value === incomingGeneration.value;
  const incomingNewerRefresh = incomingRefresh &&
    (!currentRefresh || incomingRefresh.timestamp > currentRefresh.timestamp ||
      (incomingRefresh.timestamp === currentRefresh.timestamp && incomingRefresh.value > currentRefresh.value));
  const incomingOlderRefresh = currentRefresh && (!incomingRefresh ||
    incomingRefresh.timestamp < currentRefresh.timestamp ||
    (incomingRefresh.timestamp === currentRefresh.timestamp && incomingRefresh.value < currentRefresh.value));

  if (incomingHasImage && !currentHasImage) {
    // The first resolved image is safe to accept even for an older client.
    copyImageBundle(incomingResult, result);
    return;
  }

  if (incomingHasImage && incomingNewerRefresh) {
    // A successfully completed manual refresh is a new requested version.
    copyImageBundle(incomingResult, result);
    return;
  }

  if (incomingHasImage && !incomingOlderRefresh && sameGeneration &&
    imageContentRank(incomingResult) > imageContentRank(currentResult)) {
    // The high-quality image belongs to the same generation and atomically
    // replaces every image field instead of producing a mixed fast/high card.
    copyImageBundle(incomingResult, result);
    return;
  }

  if (!incomingHasImage && sameGeneration && !incomingOlderRefresh &&
    imageContentRank(currentResult) < 40 &&
    imageQualityStatusRank(incomingResult.image_quality_status) > imageQualityStatusRank(currentResult.image_quality_status)) {
    // A quality task progresses after the fast image was saved. Advance only
    // its job state for this generation; a completed high image cannot be
    // moved back to queued/polling by a delayed snapshot.
    ['image_quality_job_id', 'image_quality_status']
      .forEach(function (field) {
        if (incomingResult[field] !== undefined) result[field] = incomingResult[field];
      });
    return;
  }

  if (!currentHasImage && !incomingHasImage) {
    // Job progress is useful before the first image, but cannot overwrite a
    // ready image above because that path deliberately falls through.
    ['image_quality_job_id', 'image_quality_status', 'image_generation_token', 'image_refresh_token']
      .forEach(function (field) {
        if (incomingResult[field] !== undefined) result[field] = incomingResult[field];
      });
  }
}

function mergeConcurrentReadyWrite(current, incoming) {
  const currentResult = current && current.result && typeof current.result === 'object' ? current.result : {};
  const incomingResult = incoming && incoming.result && typeof incoming.result === 'object' ? incoming.result : {};
  // A same-revision client write is commonly an old page snapshot finishing
  // after a server image/quality update. Start from current so it can never
  // replace the latest interpreted card or any cloud-derived image fields.
  const result = Object.assign({}, currentResult);
  const incomingReflection = nonEmptyString(incomingResult.reflection_answer);
  const currentReflection = nonEmptyString(currentResult.reflection_answer);

  mergeImageFields(currentResult, incomingResult, result);

  // A non-empty incoming reflection is a new refinement only until one has
  // reached the cloud record. Once present, current owns the entire
  // refinement bundle so an older client snapshot cannot roll it back.
  if (incomingReflection && !currentReflection) {
    ['reflection_answer', 'public_title', 'title', 'card_insight',
      'personal_connection', 'finalized_at', 'refinement_provider']
      .forEach(function (field) {
        if (incomingResult[field] !== undefined && incomingResult[field] !== null && incomingResult[field] !== '') {
          result[field] = incomingResult[field];
        }
      });
  }

  // 两份 ready 解读撞车时，呼应本身已经被换掉了，指着旧呼应的表态不该跟着
  // 新解读一起留下来。以 incoming 为准（它带着这一次的解读），current 的旧表态
  // 让位——靠原文匹配的裁决表失配是无害的，但待纠偏项会一直指着一条页面上
  // 已经不存在的呼应。
  const incomingVerdicts = incoming && incoming.connectionVerdicts;
  return Object.assign({}, current, {
    result: result,
    connectionVerdicts: incomingVerdicts && Object.keys(incomingVerdicts).length
      ? incomingVerdicts
      : (current && current.connectionVerdicts) || {},
    connectionToCorrect: (incoming && incoming.connectionToCorrect) || '',
    connectionCorrectionRaisedFor: (incoming && incoming.connectionCorrectionRaisedFor) || '',
    chatMessages: mergedChatMessages(current && current.chatMessages, incoming && incoming.chatMessages),
    feedback: incoming && incoming.feedback || current && current.feedback || '',
    feedbackAt: incoming && incoming.feedback
      ? incoming.feedbackAt
      : current && current.feedbackAt || null,
    createdAt: current && current.createdAt || incoming && incoming.createdAt || new Date(),
    updatedAt: new Date()
  });
}

function mergedDreamWrite(record) {
  return {
    ok: true,
    id: record && record._id || '',
    updated: true,
    merged: true,
    status: 'ready',
    interpretationRevision: Math.max(0, Math.floor(Number(record && record.interpretationRevision) || 0))
  };
}

function atomicDreamObjectWrites(record) {
  const data = Object.assign({}, record);
  // 合并写入是从数据库读出来的那份记录长出来的（Object.assign({}, current, …)），
  // 所以它带着 _id 和 _openid。这两个字段是数据库自己的，出现在 update 的 data
  // 里会让整次更新被拒绝、云函数抛异常，客户端收到的就是 cloud_call_failed。
  //
  // 触发条件是「同一条已解读的梦再存一次」，也就是生图完成、点裁决、选解读评价
  // 的每一次保存——第一次写入走的是 add，不经过这里，所以现象是「梦能记下来，
  // 之后对它做的任何事都同步不上」。
  delete data._id;
  delete data._openid;
  // CloudBase expands a plain object passed to update() into nested paths.
  // Legacy records can have any structured field stored as null (not only
  // result), so replace every top-level plain object atomically.
  Object.keys(data).forEach(function (key) {
    const value = data[key];
    if (key === 'result' || Object.prototype.toString.call(value) === '[object Object]') {
      data[key] = db.command.set(value);
    }
  });
  return data;
}

async function writeDreamUnlessDeleted(openid, dream, existingRecord) {
  const jobId = deletionJobId(openid, dream.localId);
  const legacyJob = await findDeletionJob(openid, dream.localId);
  if (legacyJob) return { ok: false, reason: 'dream_deleted' };

  if (typeof db.runTransaction !== 'function') {
    if (existingRecord) {
      if (existingRecord.deletionPending) return { ok: false, reason: 'dream_deleted' };
      if (isConcurrentReadyWrite(existingRecord, dream)) {
        const merged = mergeConcurrentReadyWrite(existingRecord, dream);
        await db.collection('dream_entries').doc(existingRecord._id).update({ data: atomicDreamObjectWrites(merged) });
        return mergedDreamWrite(existingRecord);
      }
      if (isStaleInterpretationWrite(existingRecord, dream)) {
        return { ok: false, reason: 'stale_interpretation_write' };
      }
      await db.collection('dream_entries').doc(existingRecord._id).update({ data: atomicDreamObjectWrites(dream) });
      return { ok: true, id: existingRecord._id, updated: true };
    }
    const created = await db.collection('dream_entries').add({ data: dream });
    return { ok: true, id: created._id, updated: false };
  }

  return db.runTransaction(async function (transaction) {
    const tombstone = await getDocument(transaction.collection('deletion_jobs'), jobId);
    if (tombstone) return { ok: false, reason: 'dream_deleted' };

    if (existingRecord) {
      const current = await getDocument(transaction.collection('dream_entries'), existingRecord._id);
      if (!current || current.deletionPending) return { ok: false, reason: 'dream_deleted' };
      if (isConcurrentReadyWrite(current, dream)) {
        const merged = mergeConcurrentReadyWrite(current, dream);
        await transaction.collection('dream_entries').doc(existingRecord._id).update({ data: atomicDreamObjectWrites(merged) });
        return mergedDreamWrite(current);
      }
      if (isStaleInterpretationWrite(current, dream)) {
        return { ok: false, reason: 'stale_interpretation_write' };
      }
      await transaction.collection('dream_entries').doc(existingRecord._id).update({ data: atomicDreamObjectWrites(dream) });
      return { ok: true, id: existingRecord._id, updated: true };
    }

    const created = await transaction.collection('dream_entries').add({ data: dream });
    return { ok: true, id: created._id, updated: false };
  });
}

// 生活记录现在有两个来源：梦后对话提取的现实线索（source 空，历史行为），和
// 用户在「与你有关」某条呼应上点的「是这样」（source='dream_connection'）。两者
// 对画像的用法不同——后者是他对我们某个假设的核实，前者是他自己讲出来的事——
// 所以来源要跟着记录一起存下去，不能只在写入那一刻区分。
const LIFE_NOTE_SOURCES = ['dream_connection'];

async function addLifeNoteUnlessDeleted(openid, localDreamId, noteText, noteSource, noteGist, noteDurable) {
  const legacyJob = await findDeletionJob(openid, localDreamId);
  if (legacyJob) return null;

  const owned = await db.collection('dream_entries')
    .where({ openid: openid, localId: localDreamId })
    .limit(1)
    .get();
  const dreamRecord = owned && owned.data && owned.data[0];
  if (!dreamRecord || dreamRecord.deletionPending) return null;

  const normalizedText = String(noteText || '').replace(/\s+/g, ' ').trim();
  const noteId = 'life-' + crypto.createHash('sha256')
    .update([openid, localDreamId, normalizedText.toLowerCase()].join('|'))
    .digest('hex')
    .slice(0, 32);
  const noteData = {
    openid: openid,
    text: normalizedText,
    // 列表上的一行标签，不是记录。原话永远以 text 为准，画像也只读 text——
    // 概括写歪了最多是目录上的一行不准，动不了记录本身。
    gist: String(noteGist || '').replace(/\s+/g, '').slice(0, 14),
    // 「是一个状态」还是「一件当时的事」。这一格原来是用户手点的「标为重要」，
    // 那是把系统该做的判断转嫁给他；现在由提取那一刻判定，用户什么都不用做。
    durable: noteDurable === true,
    source: LIFE_NOTE_SOURCES.indexOf(String(noteSource || '')) >= 0 ? String(noteSource) : '',
    sourceDreamId: localDreamId,
    createdAt: new Date()
  };
  const matchingNotes = await db.collection('life_notes')
    .where({ openid: openid, sourceDreamId: localDreamId, text: normalizedText })
    .limit(1)
    .get();
  const matchingNote = matchingNotes && matchingNotes.data && matchingNotes.data[0];

  if (typeof db.runTransaction !== 'function') {
    const latestJob = await findDeletionJob(openid, localDreamId);
    const latestDream = await getDocument(db.collection('dream_entries'), dreamRecord._id);
    if (latestJob || !latestDream || latestDream.deletionPending) return null;
    if (matchingNote) return { _id: matchingNote._id, deduplicated: true };
    const existingNote = await getDocument(db.collection('life_notes'), noteId);
    if (existingNote) return { _id: noteId, deduplicated: true };
    await db.collection('life_notes').doc(noteId).set({ data: noteData });
    return { _id: noteId, deduplicated: false };
  }

  return db.runTransaction(async function (transaction) {
    const tombstone = await getDocument(
      transaction.collection('deletion_jobs'),
      deletionJobId(openid, localDreamId)
    );
    const currentDream = await getDocument(
      transaction.collection('dream_entries'),
      dreamRecord._id
    );
    if (tombstone || !currentDream || currentDream.deletionPending) return null;
    if (matchingNote) return { _id: matchingNote._id, deduplicated: true };
    const existingNote = await getDocument(transaction.collection('life_notes'), noteId);
    if (existingNote) return { _id: noteId, deduplicated: true };
    await transaction.collection('life_notes').doc(noteId).set({ data: noteData });
    return { _id: noteId, deduplicated: false };
  });
}

async function invalidateProfileSnapshots(openid, sourceType, sourceId, reason) {
  const response = await db.collection('profile_snapshots')
    .where({ openid: openid })
    .limit(100)
    .get();
  const snapshots = response && response.data ? response.data : [];

  const affected = snapshots.filter(function (snapshot) {
    const refs = Array.isArray(snapshot && snapshot.sourceRefs) ? snapshot.sourceRefs : [];
    return refs.some(function (ref) {
      if (!ref || ref.sourceType !== sourceType) return false;
      if (sourceType === 'dream_entries') {
        return String(ref.sourceLocalId || ref.sourceId || '') === sourceId;
      }
      return String(ref.sourceId || '') === sourceId;
    });
  });

  await Promise.all(affected.map(function (snapshot) {
    const remainingRefs = (Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : []).filter(function (ref) {
      if (!ref || ref.sourceType !== sourceType) return true;
      if (sourceType === 'dream_entries') {
        return String(ref.sourceLocalId || ref.sourceId || '') !== sourceId;
      }
      return String(ref.sourceId || '') !== sourceId;
    });
    return db.collection('profile_snapshots').doc(snapshot._id).update({
      data: {
        stale: true,
        staleReason: reason,
        isCurrent: false,
        useInFutureReadings: false,
        summary: '画像来源已发生变化，请根据当前资料重新生成。',
        traits: [],
        themes: [],
        realLifeContext: [],
        sourceRefs: remainingRefs,
        aiOriginal: null,
        updatedAt: new Date()
      }
    });
  }));

  try {
    const stateResponse = await db.collection('profile_memory_state')
      .where({ openid: openid })
      .limit(1)
      .get();
    const state = stateResponse && stateResponse.data && stateResponse.data[0];
    const affectedIds = affected.map(function (snapshot) { return snapshot._id; });
    if (state && affectedIds.indexOf(state.currentSnapshotId) >= 0) {
      await db.collection('profile_memory_state').doc(state._id).update({ data: {
        currentSnapshotId: '',
        updatedAt: new Date()
      } });
    }
  } catch (pointerError) {
    // Snapshot invalidation remains authoritative even if pointer cleanup is unavailable.
  }
}

// ── 内测观测面板 ────────────────────────────────────────────────────────
//
// 这些 action 读的是全体用户的数据，因此只对 ADMIN_OPENIDS 环境变量里显式
// 列出的 openid 开放。没配置这个变量时谁都拿不到——默认关闭，而不是默认可读。

const FEEDBACK_VALUES = ['inspiring', 'too_generic', 'too_mystical', 'not_grounded'];

function configuredAdminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '').split(',').map(function (item) {
    return item.trim();
  }).filter(Boolean);
}

function isConfiguredAdmin(openid) {
  const admins = configuredAdminOpenids();
  const current = String(openid || '').trim();
  return !!current && admins.indexOf(current) >= 0;
}

// 梦境原文是产品里最私密的一类内容。内测期看反馈类型、时间和 promptVersion
// 就够定位问题了，原文摘要必须再单独开一道开关才会返回。
function excerptsEnabled() {
  return String(process.env.ADMIN_FEEDBACK_EXCERPTS || '') === 'true';
}

function isoDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? '' : date.toISOString();
  } catch (error) {
    return '';
  }
}

function ratio(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

async function feedbackStats() {
  try {
    const _ = db.command;
    const rows = [];
    const pageSize = 100;
    let offset = 0;
    let page;

    do {
      page = await db.collection('dream_entries')
        .where({ feedback: _.in(FEEDBACK_VALUES) })
        .orderBy('feedbackAt', 'desc')
        .skip(offset)
        .limit(pageSize)
        .get();
      const pageRows = page && page.data ? page.data : [];
      rows.push.apply(rows, pageRows);
      offset += pageRows.length;
      if (pageRows.length < pageSize) break;
    } while (offset < 5000);

    const counts = { inspiring: 0, too_generic: 0, too_mystical: 0, not_grounded: 0 };
    const showExcerpts = excerptsEnabled();
    const recent = rows.sort(function (left, right) {
      return new Date(right.feedbackAt || 0).getTime() - new Date(left.feedbackAt || 0).getTime();
    }).map(function (dream) {
      const feedback = String(dream.feedback || '');
      counts[feedback] += 1;
      return {
        feedback: feedback,
        feedbackAt: isoDate(dream.feedbackAt),
        promptVersion: String(
          (dream.interpretationMeta && dream.interpretationMeta.promptVersion) ||
          (dream.result && dream.result.interpretationMeta && dream.result.interpretationMeta.promptVersion) ||
          ''
        ),
        dreamExcerpt: showExcerpts ? String(dream.dreamText || '').slice(0, 40) : '',
        createdAt: isoDate(dream.createdAt)
      };
    });

    return {
      ok: true,
      total: counts.inspiring + counts.too_generic + counts.too_mystical + counts.not_grounded,
      counts: counts,
      excerptsEnabled: showExcerpts,
      recent: recent.slice(0, 20)
    };
  } catch (error) {
    return { ok: false, reason: 'feedback_stats_failed' };
  }
}

// 记忆呼应命中率：系统交给模型的「已核实历史呼应」里，最终有多少被写进了
// 解读。分母只算 offered > 0 的解读——今晚的梦与历史无重合时的沉默是正确
// 行为，混进分母只会把这个指标稀释成噪声。
async function memoryEchoStats() {
  try {
    const _ = db.command;
    const $ = db.command.aggregate;
    const result = await db.collection('events')
      .aggregate()
      .match({
        eventName: _.in(['interpretation_success', 'interpretation_retry_success']),
        'metadata.memoryEchoOffered': _.gt(0)
      })
      .group({
        _id: null,
        offeredReadings: $.sum(1),
        hitReadings: $.sum($.cond({ if: $.gt(['$metadata.memoryEchoUsed', 0]), then: 1, else: 0 })),
        offeredEchoes: $.sum('$metadata.memoryEchoOffered'),
        usedEchoes: $.sum('$metadata.memoryEchoUsed')
      })
      .end();
    const row = (result && result.list && result.list[0]) || {};
    const offeredReadings = Number(row.offeredReadings || 0);

    return {
      ok: true,
      offeredReadings: offeredReadings,
      hitReadings: Number(row.hitReadings || 0),
      offeredEchoes: Number(row.offeredEchoes || 0),
      usedEchoes: Number(row.usedEchoes || 0),
      hitRate: ratio(Number(row.hitReadings || 0), offeredReadings),
      echoUseRate: ratio(Number(row.usedEchoes || 0), Number(row.offeredEchoes || 0))
    };
  } catch (error) {
    return { ok: false, reason: 'memory_echo_stats_failed' };
  }
}

// 留存漏斗：内测真正要回答的问题不是「有多少人来过」，而是「有多少人记到了
// 第 3、第 5 个梦」——跨梦线索要到第 3 个梦才开始出现，第 5 个才谈得上习惯。
async function retentionFunnel() {
  try {
    const $ = db.command.aggregate;
    const result = await db.collection('dream_entries')
      .aggregate()
      .match({ status: 'ready' })
      .group({ _id: '$openid', dreams: $.sum(1) })
      .group({
        _id: null,
        atLeast1: $.sum(1),
        atLeast3: $.sum($.cond({ if: $.gte(['$dreams', 3]), then: 1, else: 0 })),
        atLeast5: $.sum($.cond({ if: $.gte(['$dreams', 5]), then: 1, else: 0 })),
        totalDreams: $.sum('$dreams')
      })
      .end();
    const row = (result && result.list && result.list[0]) || {};
    const atLeast1 = Number(row.atLeast1 || 0);

    return {
      ok: true,
      atLeast1: atLeast1,
      atLeast3: Number(row.atLeast3 || 0),
      atLeast5: Number(row.atLeast5 || 0),
      totalDreams: Number(row.totalDreams || 0),
      rate3: ratio(Number(row.atLeast3 || 0), atLeast1),
      rate5: ratio(Number(row.atLeast5 || 0), atLeast1),
      dreamsPerUser: atLeast1 > 0 ? Math.round((Number(row.totalDreams || 0) / atLeast1) * 10) / 10 : null
    };
  } catch (error) {
    return { ok: false, reason: 'retention_funnel_failed' };
  }
}

async function countEvents(names) {
  const _ = db.command;
  const response = await db.collection('events').where({ eventName: _.in(names) }).count();
  return Number((response && response.total) || 0);
}

// 失败率按「尝试」而不是「用户」计：一次解读或一次生图请求就是一次尝试。
// 重试成功仍然记一次失败，否则会把「第一次总是超时」这类问题洗白。
async function pipelineFailureStats() {
  try {
    const interpretSuccess = await countEvents(['interpretation_success', 'interpretation_retry_success']);
    const interpretFail = await countEvents(['interpretation_failed', 'interpretation_retry_failed']);
    const imageSuccess = await countEvents(['generated_image_success']);
    const imageFail = await countEvents(['generated_image_fail']);

    return {
      ok: true,
      interpretation: {
        success: interpretSuccess,
        failed: interpretFail,
        attempts: interpretSuccess + interpretFail,
        failureRate: ratio(interpretFail, interpretSuccess + interpretFail)
      },
      image: {
        success: imageSuccess,
        failed: imageFail,
        attempts: imageSuccess + imageFail,
        failureRate: ratio(imageFail, imageSuccess + imageFail)
      }
    };
  } catch (error) {
    return { ok: false, reason: 'pipeline_failure_stats_failed' };
  }
}

async function distinctDreamCount(eventName) {
  const $ = db.command.aggregate;
  const result = await db.collection('events')
    .aggregate()
    .match({ eventName: eventName })
    .group({ _id: '$metadata.dreamId' })
    .group({ _id: null, total: $.sum(1) })
    .end();
  const row = (result && result.list && result.list[0]) || {};
  return Number(row.total || 0);
}

// ── 生图为什么失败 ──────────────────────────────────────────────────────
//
// 失败事件一直带着原因（provider 超时、额度、内容策略、梦还没同步、图下不
// 下来……），但统计那头只做了 count()，从来没人问过它。于是后台只能显示一个
// 百分比，看不出那 70% 里到底是什么——修哪儿全靠猜。
async function imageFailureBreakdown() {
  const $ = db.command.aggregate;
  const result = await db.collection('events')
    .aggregate()
    .match({ eventName: 'generated_image_fail' })
    // 同一次失败同时带 reason 和 failureType：后者用来把「梦压根没同步上云、
    // 生图从没开始」这一类挑出来——它记在生图失败里，但它不是生图的问题。
    .group({ _id: { reason: '$metadata.reason', failureType: '$metadata.failureType' }, total: $.sum(1) })
    .end();
  const rows = (result && result.list) || [];
  const buckets = {};
  let total = 0;
  let syncTotal = 0;
  rows.forEach(function (row) {
    const key = String((row && row._id && row._id.reason) || 'unknown');
    const count = Number((row && row.total) || 0);
    const isSync = String((row && row._id && row._id.failureType) || '') === 'sync';
    buckets[key] = (buckets[key] || 0) + count;
    total += count;
    if (isSync) syncTotal += count;
  });
  return {
    ok: true,
    total: total,
    syncTotal: syncTotal,
    reasons: Object.keys(buckets).map(function (reason) {
      return { reason: reason, count: buckets[reason] };
    }).sort(function (left, right) { return right.count - left.count; }).slice(0, 8)
  };
}

// ── 到底有多少条梦没有画面 ──────────────────────────────────────────────
//
// 上面那个失败率数的是「事件」，而事件的计法是偏的：一条成功的梦一辈子只记
// 一次成功（有图之后结果页直接短路，不再发事件），一条坏掉的梦每打开一次就
// 再记一次失败，还要被自动重试翻一倍。分子会一直涨，分母不会。
//
// 这里换成数梦本身，读的是 dream_entries 而不是事件流——它不会被反复打开刷
// 高，也是用户真正关心的那个问题：我的梦卡有没有画面。
async function imageOutcomeByDream() {
  const $ = db.command.aggregate;
  const result = await db.collection('dream_entries')
    .aggregate()
    .match({ status: 'ready' })
    // 供应商可能只给回 URL 而没有云存储 id，两个字段都要看，缺一个不算没图。
    .group({ _id: { fileId: '$result.image_file_id', imageUrl: '$result.imageUrl' }, total: $.sum(1) })
    .end();
  const rows = (result && result.list) || [];
  let total = 0;
  let withImage = 0;
  rows.forEach(function (row) {
    const key = (row && row._id) || {};
    const count = Number((row && row.total) || 0);
    total += count;
    if (String(key.fileId || '') || String(key.imageUrl || '')) withImage += count;
  });
  return {
    ok: true,
    total: total,
    missing: total - withImage,
    missingRate: ratio(total - withImage, total)
  };
}

// 展开率按「被展开过的梦」而不是事件条数计：一个人反复展开收起会刷出多条
// result_full_reading_expand，按条数算能超过 100%。
//
// 这个数要反着读。折叠区改造后展开率「下降」才是成功——因为「与你有关」和
// 「你之前提到过」已经搬到折叠外，用户不必展开就能读到正片。真正的危险信号
// 是展开率高：那说明外面留的东西不够，用户还得自己去翻。
async function readingDepthStats() {
  try {
    const viewedDreams = await distinctDreamCount('result_view');
    const expandedDreams = await distinctDreamCount('result_full_reading_expand');

    return {
      ok: true,
      viewedDreams: viewedDreams,
      expandedDreams: expandedDreams,
      expandRate: ratio(expandedDreams, viewedDreams)
    };
  } catch (error) {
    return { ok: false, reason: 'reading_depth_stats_failed' };
  }
}

async function internalStats() {
  const memoryEcho = await memoryEchoStats();
  const readingDepth = await readingDepthStats();
  const retention = await retentionFunnel();
  const pipeline = await pipelineFailureStats();
  // 这两块各自会挂：聚合语法在旧环境上可能不被支持。一块查不出来不该把整页
  // 统计带塌，所以各自兜住，界面按 ok 决定显不显示。
  let imageReasons;
  let imageDreams;
  try {
    imageReasons = await imageFailureBreakdown();
  } catch (error) {
    imageReasons = { ok: false, reason: 'image_failure_breakdown_failed' };
  }
  try {
    imageDreams = await imageOutcomeByDream();
  } catch (error) {
    imageDreams = { ok: false, reason: 'image_outcome_by_dream_failed' };
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    memoryEcho: memoryEcho,
    readingDepth: readingDepth,
    retention: retention,
    pipeline: pipeline,
    imageReasons: imageReasons,
    imageDreams: imageDreams
  };
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const action = String((event && event.action) || 'upsert');
  const requestedId = String((event && event.dreamId) || '');

  if (action === 'feedbackStats' || action === 'internalStats') {
    if (!isConfiguredAdmin(wxContext && wxContext.OPENID)) {
      return { ok: false, reason: 'not_admin' };
    }
    return action === 'feedbackStats' ? feedbackStats() : internalStats();
  }

  if (action === 'list') {
    try {
      const response = await db.collection('dream_entries')
        .where({ openid: wxContext.OPENID })
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();
      const rawDreams = (response && response.data ? response.data : []).map(function (item) {
        const copy = Object.assign({}, item);
        delete copy.openid;
        return copy;
      });
      const dreams = await enrichDreamImages(wxContext.OPENID, rawDreams);
      return { ok: true, dreams: dreams };
    } catch (error) {
      return { ok: false, reason: 'archive_load_failed' };
    }
  }

  if (action === 'listLifeNotes') {
    try {
      // 上限从 30 提到 200。30 条那会儿超出的记录仍然存在、仍然可能影响画像，
      // 却在界面上看不见——用户没有任何办法清理他看不到的东西。
      const response = await db.collection('life_notes')
        .where({ openid: wxContext.OPENID })
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      return {
        ok: true,
        notes: (response && response.data ? response.data : []).map(function (note) {
          return {
            id: note._id,
            text: String(note.text || ''),
            // 目录页显示 gist，详情页显示 text。没有 gist（旧记录、用户认下的
            // 呼应、回访回答）时界面自己截断，不在这里编一个。
            gist: String(note.gist || ''),
            // 三种来源的可信方式完全不同，此前这个字段被丢掉，界面于是把它们
            // 混成一堆叫「系统提取的现实线索」——其中 dream_connection 那些
            // 根本是我们自己写的句子，用户只是点头认下过。把我们的措辞标成
            // 「从你话里提取的」，用户读到的是一句自己从没说过的话。
            source: String(note.source || ''),
            sourceDreamId: String(note.sourceDreamId || ''),
            // 这三个字段决定界面把它放在「正在影响」还是「更早的」里。
            // inUseAt 由 profileMemory 在每次生成时写，所以界面显示的就是上一版
            // 画像真正喂进去的那些，不是界面自己再猜一遍。
            inUseAt: note.inUseAt || null,
            retiredAt: note.retiredAt || null,
            // 时间冲不掉的那类。界面据此说明一条旧记录为什么还在影响画像——
            // 这是一句解释，不是一个开关，用户不必也无法整理它。
            durable: note.durable === true,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt || note.createdAt
          };
        })
      };
    } catch (error) {
      return { ok: false, reason: 'life_notes_load_failed' };
    }
  }

  if (action === 'getRevisit') {
    try {
      var revisitResponse = await db.collection('dream_entries')
        .where({ openid: wxContext.OPENID })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      var revisitRecords = revisitResponse && revisitResponse.data ? revisitResponse.data : [];
      var nowTimestamp = Date.now();
      var timezoneOffset = 8 * 3600 * 1000;
      var dayMilliseconds = 24 * 3600 * 1000;
      // 回访窗口原本只匹配「昨天」这一整天：隔一天不打开小程序，这个梦的回访
      // 就永久错过了。回访是产品里唯一主动采集现实线索的通道，窗口过窄直接
      // 导致「系统提取的现实线索」长期为 0。改成「已过一夜、且不超过 7 天」，
      // 仍然保留「第二天再回头看」的本意，但不再因为漏开一次就作废。
      var revisitMinAgeMs = 12 * 3600 * 1000;
      var revisitMaxAgeMs = 7 * dayMilliseconds;
      var beijingToday = new Date(nowTimestamp + timezoneOffset).toISOString().slice(0, 10);
      var revisitDream = null;
      var revisitIndex;

      for (revisitIndex = 0; revisitIndex < revisitRecords.length; revisitIndex += 1) {
        var revisitRecord = revisitRecords[revisitIndex];
        var revisitResult = revisitRecord && revisitRecord.result ? revisitRecord.result : {};
        var createdTimestamp = revisitRecord && revisitRecord.createdAt
          ? new Date(revisitRecord.createdAt).getTime()
          : 0;
        var createdBeijingDate = createdTimestamp
          ? new Date(createdTimestamp + timezoneOffset).toISOString().slice(0, 10)
          : '';
        var revisitAgeMs = createdTimestamp ? nowTimestamp - createdTimestamp : -1;

        if (
          revisitRecord.status === 'ready' &&
          revisitResult.integration_question &&
          revisitRecord.revisitSkipped !== true &&
          !revisitRecord.revisitedAt &&
          createdBeijingDate &&
          createdBeijingDate !== beijingToday &&
          revisitAgeMs >= revisitMinAgeMs &&
          revisitAgeMs <= revisitMaxAgeMs
        ) {
          revisitDream = {
            localId: revisitRecord.localId,
            title: revisitResult.title || '',
            question: revisitResult.integration_question,
            createdAt: revisitRecord.createdAt
          };
          break;
        }
      }

      return { ok: true, dream: revisitDream };
    } catch (revisitError) {
      return { ok: true, dream: null };
    }
  }

  if (action === 'answerRevisit') {
    var answerDreamId = String((event && event.dreamId) || '').trim();
    var revisitAnswer = String((event && event.answer) || '').trim().slice(0, 300);

    if (!answerDreamId || !revisitAnswer) {
      return { ok: false, reason: 'invalid_answer' };
    }

    var answerQuery = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: answerDreamId })
      .limit(1)
      .get();

    if (!answerQuery.data || !answerQuery.data.length) {
      return { ok: false, reason: 'dream_not_found' };
    }

    var revisitNote;
    try {
      revisitNote = await addLifeNoteUnlessDeleted(wxContext.OPENID, answerDreamId, revisitAnswer);
    } catch (lifeNoteError) {
      return { ok: false, reason: 'life_note_save_failed' };
    }
    if (!revisitNote) return { ok: false, reason: 'dream_deleted' };

    await db.collection('dream_entries').doc(answerQuery.data[0]._id).update({
      data: {
        revisitedAt: new Date(),
        revisitAnswer: revisitAnswer,
        revisitLifeNoteId: revisitNote && revisitNote._id ? revisitNote._id : ''
      }
    });

    return { ok: true };
  }

  if (action === 'skipRevisit') {
    var skipDreamId = String((event && event.dreamId) || '').trim();

    if (!skipDreamId) {
      return { ok: true };
    }

    var skipQuery = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: skipDreamId })
      .limit(1)
      .get();

    if (skipQuery.data && skipQuery.data.length) {
      await db.collection('dream_entries').doc(skipQuery.data[0]._id).update({
        data: {
          revisitSkipped: true
        }
      });
    }

    return { ok: true };
  }

  if (action === 'addLifeNote') {
    var noteDreamId = String((event && event.dreamId) || '').trim();
    var noteText = String((event && event.text) || '').trim().slice(0, 300);

    if (!noteDreamId || !noteText) {
      return { ok: false, reason: 'invalid_note' };
    }

    var noteSource = String((event && event.source) || '').trim();
    var noteGist = String((event && event.gist) || '').trim().slice(0, 14);
    var noteDurable = event && event.durable === true;
    var addedNote = await addLifeNoteUnlessDeleted(wxContext.OPENID, noteDreamId, noteText, noteSource, noteGist, noteDurable);
    if (!addedNote) return { ok: false, reason: 'dream_deleted' };

    return { ok: true, id: addedNote._id, deduplicated: addedNote.deduplicated === true };
  }

  if (action === 'deleteLifeNote') {
    var noteId = String((event && event.noteId) || '').trim();

    if (!noteId) {
      return { ok: false, reason: 'invalid_note_id' };
    }

    var deleteNoteQuery = await db.collection('life_notes')
      .where({ openid: wxContext.OPENID, _id: noteId })
      .limit(1)
      .get();
    if (!deleteNoteQuery.data || !deleteNoteQuery.data.length) {
      return { ok: true, alreadyDeleted: true };
    }
    try {
      await invalidateProfileSnapshots(wxContext.OPENID, 'life_notes', noteId, 'source_life_note_deleted');
    } catch (profileInvalidationError) {
      return { ok: false, reason: 'life_note_deletion_pending', retryable: true };
    }

    await db.collection('life_notes')
      .where({ openid: wxContext.OPENID, _id: noteId })
      .remove();

    return { ok: true };
  }

  if (action === 'editLifeNote') {
    var editNoteId = String((event && event.noteId) || '').trim();
    var editNoteText = String((event && event.text) || '').trim().slice(0, 300);
    if (!editNoteId || !editNoteText) {
      return { ok: false, reason: 'invalid_note' };
    }
    var ownedNote = await db.collection('life_notes')
      .where({ openid: wxContext.OPENID, _id: editNoteId })
      .limit(1)
      .get();
    if (!ownedNote.data || !ownedNote.data.length) {
      return { ok: false, reason: 'note_not_found' };
    }
    try {
      await invalidateProfileSnapshots(wxContext.OPENID, 'life_notes', editNoteId, 'source_life_note_edited');
    } catch (profileInvalidationError) {
      return { ok: false, reason: 'life_note_update_pending', retryable: true };
    }
    await db.collection('life_notes').doc(editNoteId).update({ data: {
      text: editNoteText,
      updatedAt: new Date()
    } });
    return { ok: true, note: { id: editNoteId, text: editNoteText } };
  }

  // 「一直重要」。哪些记录还算数，本该由用户说了算，而不是我们拿一个时间窗
  // 替他决定——钉住的记录不参与排队，永远占一个名额。
  if (action === 'editSymbol') {
    var symbolDreamId = String((event && event.dreamId) || '').trim();
    var oldSymbol = String((event && event.oldSymbol) || '').trim();
    var newSymbol = String((event && event.newSymbol) || '').trim().slice(0, 32);

    if (!symbolDreamId || !oldSymbol || !newSymbol) {
      return { ok: false, reason: 'invalid_symbol' };
    }

    var symbolQuery = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: symbolDreamId })
      .limit(1)
      .get();

    if (!symbolQuery.data || !symbolQuery.data.length) {
      return { ok: false, reason: 'dream_not_found' };
    }

    var symbolRecord = symbolQuery.data[0];
    var entrySymbols = Array.isArray(symbolRecord.symbols) ? symbolRecord.symbols : [];
    var resultSymbols = symbolRecord.result && Array.isArray(symbolRecord.result.symbols)
      ? symbolRecord.result.symbols
      : [];
    var updatedEntrySymbols = entrySymbols.map(function (symbol) {
      return String(symbol || '').trim() === oldSymbol ? newSymbol : symbol;
    });
    var updatedResultSymbols = resultSymbols.map(function (symbol) {
      return String(symbol || '').trim() === oldSymbol ? newSymbol : symbol;
    });

    var symbolUpdate = { symbols: updatedEntrySymbols };
    if (symbolRecord.result && typeof symbolRecord.result === 'object') {
      // Keep the card's result coherent without using result.symbols, which
      // fails when historical records have result:null.
      symbolUpdate.result = db.command.set(Object.assign({}, symbolRecord.result, {
        symbols: updatedResultSymbols
      }));
    }
    await db.collection('dream_entries').doc(symbolRecord._id).update({ data: symbolUpdate });

    try {
      await invalidateProfileSnapshots(wxContext.OPENID, 'dream_entries', symbolDreamId, 'source_dream_corrected');
    } catch (profileInvalidationError) {
      // Keep the symbol correction successful even when the derived snapshot update is delayed.
    }

    return { ok: true };
  }

  if (action === 'delete') {
    if (!requestedId) {
      return { ok: false, reason: 'missing_dream_id' };
    }

    const ownedDream = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: requestedId })
      .limit(1)
      .get();
    let deletionJob = await findDeletionJob(wxContext.OPENID, requestedId);
    if ((!ownedDream.data || !ownedDream.data.length) && !deletionJob) {
      return { ok: false, reason: 'dream_not_found' };
    }
    if (deletionJob && deletionJob.status === 'completed' && (!ownedDream.data || !ownedDream.data.length)) {
      return { ok: true, deleted: 0, alreadyDeleted: true };
    }
    if (ownedDream.data && ownedDream.data.length) {
      deletionJob = await markDreamDeleting(wxContext.OPENID, ownedDream.data[0], deletionJob);
    } else {
      await db.collection('deletion_jobs').doc(deletionJob._id).update({ data: {
        status: 'pending',
        attempts: Number(deletionJob.attempts || 0) + 1,
        lastError: '',
        updatedAt: new Date()
      } });
    }

    let sourceLifeNotes;
    try {
      const sourceLifeNoteResponse = await db.collection('life_notes')
        .where({ openid: wxContext.OPENID, sourceDreamId: requestedId })
        .get();
      sourceLifeNotes = sourceLifeNoteResponse && sourceLifeNoteResponse.data
        ? sourceLifeNoteResponse.data
        : [];
    } catch (cascadeError) {
      await db.collection('deletion_jobs').doc(deletionJob._id).update({ data: {
        status: 'pending', lastError: 'life_note_lookup_failed', updatedAt: new Date()
      } });
      return { ok: false, reason: 'deletion_pending', retryable: true };
    }

    try {
      await revokeDreamShares(wxContext.OPENID, requestedId);
      await cancelDreamImageQualityJobs(wxContext.OPENID, requestedId);
      await removeDreamAssets(wxContext.OPENID, requestedId);
      await invalidateProfileSnapshots(wxContext.OPENID, 'dream_entries', requestedId, 'source_dream_deleted');
      for (const sourceLifeNote of sourceLifeNotes) {
        if (sourceLifeNote && sourceLifeNote._id) {
          await invalidateProfileSnapshots(
            wxContext.OPENID,
            'life_notes',
            String(sourceLifeNote._id),
            'source_dream_life_note_deleted'
          );
        }
      }
    } catch (cascadeError) {
      await db.collection('deletion_jobs').doc(deletionJob._id).update({ data: {
        status: 'pending', lastError: String(cascadeError && cascadeError.message || 'derived_cleanup_failed').slice(0, 180), updatedAt: new Date()
      } });
      return { ok: false, reason: 'deletion_pending', retryable: true };
    }

    try {
      await db.collection('life_notes')
        .where({ openid: wxContext.OPENID, sourceDreamId: requestedId })
        .remove();
    } catch (cascadeError) {
      await db.collection('deletion_jobs').doc(deletionJob._id).update({ data: {
        status: 'pending', lastError: 'life_note_cleanup_failed', updatedAt: new Date()
      } });
      return { ok: false, reason: 'deletion_pending', retryable: true };
    }

    const deleted = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: requestedId })
      .remove();
    await db.collection('deletion_jobs').doc(deletionJob._id).update({ data: {
      status: 'completed', completedAt: new Date(), updatedAt: new Date()
    } });
    return { ok: true, deleted: deleted && deleted.stats ? deleted.stats.removed : 0 };
  }

  const dream = safeDream(event && event.dream ? event.dream : {});
  const localId = dream.localId;

  if (!localId || !dream.dreamText) {
    return { ok: false, reason: 'invalid_dream' };
  }
  const query = await db.collection('dream_entries')
    .where({ openid: wxContext.OPENID, localId: localId })
    .limit(1)
    .get();

  dream.openid = wxContext.OPENID;
  return writeDreamUnlessDeleted(wxContext.OPENID, dream, query.data && query.data[0]);
};
