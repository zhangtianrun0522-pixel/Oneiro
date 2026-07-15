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
        createdAt: item && item.createdAt ? new Date(item.createdAt) : new Date()
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

  if (action === 'delete') {
    if (!requestedId) {
      return { ok: false, reason: 'missing_dream_id' };
    }

    const deleted = await db.collection('dream_entries')
      .where({ openid: wxContext.OPENID, localId: requestedId })
      .remove();
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
