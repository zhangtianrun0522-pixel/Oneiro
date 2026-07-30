const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function safeDream(dream) {
  const result = dream && dream.result ? dream.result : {};
  const facts = dream && dream.dreamFacts ? dream.dreamFacts : {};
  const feedbackOptions = ['inspiring', 'too_generic', 'too_mystical', 'not_grounded'];
  const feedback = feedbackOptions.indexOf(dream && dream.feedback) >= 0 ? dream.feedback : '';

  function stringList(value, limit) {
    return Array.isArray(value)
      ? value.map(function (item) { return String(item || '').trim(); }).filter(Boolean).slice(0, limit)
      : [];
  }

  function chatMessages(value) {
    return Array.isArray(value) ? value.slice(-12).map(function (item) {
      return {
        role: item && item.role === 'assistant' ? 'assistant' : 'user',
        content: String((item && item.content) || '').trim().slice(0, 800),
        createdAt: item && item.createdAt ? new Date(item.createdAt) : new Date(),
        confirmed: !!(item && item.confirmed)
      };
    }).filter(function (item) { return item.content; }) : [];
  }

  return {
    localId: String((dream && dream.id) || ''),
    dreamText: String((dream && dream.dreamText) || ''),
    status: ['pending', 'ready', 'blocked'].indexOf(dream && dream.status) >= 0 ? dream.status : 'ready',
    result: result,
    dreamFacts: {
      people: stringList(facts.people, 6),
      places: stringList(facts.places, 6),
      objects: stringList(facts.objects, 6),
      actions: stringList(facts.actions, 6),
      emotions: stringList(facts.emotions, 6),
      timeSense: stringList(facts.time_sense || facts.timeSense, 6)
    },
    symbols: Array.isArray(result.symbols) ? result.symbols : [],
    emotionalWeather: String(result.emotional_weather || ''),
    cardTheme: String(result.card_theme || 'mist'),
    interpretationSource: String((dream && dream.interpretationSource) || ''),
    interpretationProvider: String((dream && dream.interpretationProvider) || ''),
    interpretationError: String((dream && dream.interpretationError) || '').slice(0, 300),
    interpretationMeta: {
      schemaVersion: String((dream && dream.interpretationMeta && dream.interpretationMeta.schemaVersion) || 'dream-entry-v0.2'),
      promptVersion: String((dream && dream.interpretationMeta && dream.interpretationMeta.promptVersion) || ''),
      model: String((dream && dream.interpretationMeta && dream.interpretationMeta.model) || '')
    },
    chatMessages: chatMessages(dream && dream.chatMessages),
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

async function writeDreamUnlessDeleted(openid, dream, existingRecord) {
  const jobId = deletionJobId(openid, dream.localId);
  const legacyJob = await findDeletionJob(openid, dream.localId);
  if (legacyJob) return { ok: false, reason: 'dream_deleted' };

  if (typeof db.runTransaction !== 'function') {
    if (existingRecord) {
      if (existingRecord.deletionPending) return { ok: false, reason: 'dream_deleted' };
      await db.collection('dream_entries').doc(existingRecord._id).update({ data: dream });
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
      await transaction.collection('dream_entries').doc(existingRecord._id).update({ data: dream });
      return { ok: true, id: existingRecord._id, updated: true };
    }

    const created = await transaction.collection('dream_entries').add({ data: dream });
    return { ok: true, id: created._id, updated: false };
  });
}

async function addLifeNoteUnlessDeleted(openid, localDreamId, noteText) {
  const legacyJob = await findDeletionJob(openid, localDreamId);
  if (legacyJob) return null;

  const owned = await db.collection('dream_entries')
    .where({ openid: openid, localId: localDreamId })
    .limit(1)
    .get();
  const dreamRecord = owned && owned.data && owned.data[0];
  if (!dreamRecord || dreamRecord.deletionPending) return null;

  const noteData = {
    openid: openid,
    text: noteText,
    sourceDreamId: localDreamId,
    createdAt: new Date()
  };

  if (typeof db.runTransaction !== 'function') {
    return db.collection('life_notes').add({ data: noteData });
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
    return transaction.collection('life_notes').add({ data: noteData });
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

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const action = String((event && event.action) || 'upsert');
  const requestedId = String((event && event.dreamId) || '');

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
      const response = await db.collection('life_notes')
        .where({ openid: wxContext.OPENID })
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();
      return {
        ok: true,
        notes: (response && response.data ? response.data : []).map(function (note) {
          return {
            id: note._id,
            text: String(note.text || ''),
            sourceDreamId: String(note.sourceDreamId || ''),
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
      var beijingToday = new Date(nowTimestamp + timezoneOffset).toISOString().slice(0, 10);
      var beijingYesterday = new Date(nowTimestamp - dayMilliseconds + timezoneOffset).toISOString().slice(0, 10);
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

        if (
          revisitRecord.status === 'ready' &&
          revisitResult.integration_question &&
          revisitRecord.revisitSkipped !== true &&
          !revisitRecord.revisitedAt &&
          createdBeijingDate === beijingYesterday
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

    var addedNote = await addLifeNoteUnlessDeleted(wxContext.OPENID, noteDreamId, noteText);
    if (!addedNote) return { ok: false, reason: 'dream_deleted' };

    return { ok: true, id: addedNote._id };
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

    await db.collection('dream_entries').doc(symbolRecord._id).update({
      data: {
        symbols: updatedEntrySymbols,
        'result.symbols': updatedResultSymbols
      }
    });

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
