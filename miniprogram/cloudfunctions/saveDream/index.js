const cloud = require('wx-server-sdk');

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

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const action = String((event && event.action) || 'upsert');
  const requestedId = String((event && event.dreamId) || '');

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

    await db.collection('dream_entries').doc(answerQuery.data[0]._id).update({
      data: {
        revisitedAt: new Date(),
        revisitAnswer: revisitAnswer
      }
    });

    try {
      await db.collection('life_notes').add({
        data: {
          openid: wxContext.OPENID,
          text: revisitAnswer,
          sourceDreamId: answerDreamId,
          createdAt: new Date()
        }
      });
    } catch (lifeNoteError) {
      // 忽略，不影响主流程
    }

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

    var addedNote = await db.collection('life_notes').add({
      data: {
        openid: wxContext.OPENID,
        text: noteText,
        sourceDreamId: noteDreamId,
        createdAt: new Date()
      }
    });

    return { ok: true, id: addedNote._id };
  }

  if (action === 'deleteLifeNote') {
    var noteId = String((event && event.noteId) || '').trim();

    if (!noteId) {
      return { ok: false, reason: 'invalid_note_id' };
    }

    await db.collection('life_notes')
      .where({ openid: wxContext.OPENID, _id: noteId })
      .remove();

    return { ok: true };
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

    return { ok: true };
  }

  if (action === 'delete') {
    if (!requestedId) {
      return { ok: false, reason: 'missing_dream_id' };
    }

    const deleted = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: requestedId })
      .remove();

    try {
      await db.collection('life_notes')
        .where({ openid: wxContext.OPENID, sourceDreamId: requestedId })
        .remove();
    } catch (cascadeError) {
      // 忽略，不影响主删除结果
    }

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

  if (query.data && query.data.length) {
    await db.collection('dream_entries').doc(query.data[0]._id).update({
      data: dream
    });
    return { ok: true, id: query.data[0]._id, updated: true };
  }

  const created = await db.collection('dream_entries').add({
    data: dream
  });

  return { ok: true, id: created._id, updated: false };
};
