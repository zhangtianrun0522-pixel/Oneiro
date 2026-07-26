const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 16000;
const MAX_HISTORY = 30;
const SOURCE_PAGE_SIZE = 100;
const MAX_PROMPT_DREAMS = 18;
const MAX_PROMPT_NOTES = 10;
const MAX_PROMPT_DISCUSSIONS = 12;
const MAX_TEXT = 280;

function text(value, limit) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit || MAX_TEXT);
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function allowedStatus(value, fallback) {
  return ['draft', 'confirmed', 'rejected', 'superseded'].indexOf(value) >= 0 ? value : fallback;
}

function cleanStrings(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) { return text(item, maxLength); }).filter(Boolean).slice(0, maxItems);
}

function safeId(value) {
  return text(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
}

function sortByDate(items) {
  return items.sort(function (a, b) {
    return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
  });
}

function profileConfig() {
  const configuredProvider = text(process.env.PROFILE_MEMORY_PROVIDER || process.env.AI_PROVIDER || process.env.INTERPRET_PROVIDER, 40).toLowerCase();
  const apiKey = text(process.env.PROFILE_MEMORY_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY || process.env.AI_API_KEY, 400);
  const isOpenAi = configuredProvider === 'openai' || configuredProvider === 'openai-compatible';
  const baseUrl = isOpenAi
    ? (process.env.OPENAI_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1')
    : (process.env.PROFILE_MEMORY_BASE_URL || process.env.DEEPSEEK_BASE_URL || process.env.AI_BASE_URL || DEFAULT_BASE_URL);
  const model = isOpenAi
    ? (process.env.OPENAI_MODEL || process.env.OPENAI_COMPATIBLE_MODEL || process.env.AI_MODEL || 'gpt-4o-mini')
    : (process.env.PROFILE_MEMORY_MODEL || process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || DEFAULT_MODEL);
  return { apiKey: text(apiKey, 500), baseUrl: text(baseUrl, 300).replace(/\/+$/, ''), model: text(model, 120) };
}

function postJson(urlString, headers, payload, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let url;
    try { url = new URL(urlString); } catch (error) { reject(new Error('invalid_ai_url')); return; }
    const body = JSON.stringify(payload);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers || {}),
      timeout: timeoutMs
    }, function (response) {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { raw += chunk; if (raw.length > 120000) request.destroy(new Error('ai_response_too_large')); });
      response.on('end', function () { resolve({ statusCode: response.statusCode || 0, text: raw }); });
    });
    request.on('timeout', function () { request.destroy(new Error('ai_timeout')); });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function parseJsonObject(raw) {
  const source = text(raw, 50000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('ai_json_missing');
  const parsed = JSON.parse(source.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ai_json_invalid');
  return parsed;
}

function sourceRef(type, record) {
  return {
    sourceType: type,
    sourceId: text(record && (record._id || record.localId), 80),
    sourceLocalId: type === 'dream_entries' ? text(record && record.localId, 80) : '',
    createdAt: record && record.createdAt ? new Date(record.createdAt) : null
  };
}

function baseProfile(user) {
  user = user || {};
  return {
    nickname: text(user.nickname, 30),
    birthDate: text(user.birthDate, 20),
    birthTime: text(user.birthTime, 20),
    birthPlace: text(user.birthPlace, 60),
    gender: ['male', 'female'].indexOf(text(user.gender, 12).toLowerCase()) >= 0 ? text(user.gender, 12).toLowerCase() : ''
  };
}

function isUsefulDiscussionText(value) {
  const source = text(value, 220);
  if (source.length < 8) return false;
  if (/^(嗯|哦|好的|是的|不是|不知道|可能吧|哈哈|我觉得|感觉像)[，。,.！!？?、\s]*$/i.test(source)) return false;
  return /最近|这几天|今天|昨晚|工作|学习|学校|项目|同事|老板|家人|朋友|伴侣|父母|生活|压力|焦虑|难过|害怕|开心|生气|疲惫|失眠|关系|决定|搬|换|离开|面试|考试|加班|旅行|钱|计划|正在|发生|联系|争吵|失去|等待/.test(source);
}

function discussionTexts(dream) {
  const messages = Array.isArray(dream && dream.chatMessages) ? dream.chatMessages : [];
  const userMessages = messages.filter(function (message) {
    return message && message.role === 'user';
  }).map(function (message) {
    return text(message.content, 220);
  }).filter(Boolean).slice(-4);
  const revisitAnswer = text(dream && dream.revisitAnswer, 220);
  if (revisitAnswer && userMessages.indexOf(revisitAnswer) < 0) userMessages.push(revisitAnswer);
  return userMessages;
}

function profileFoundationSummary(profile) {
  const fields = [];
  if (profile.nickname) fields.push('称呼');
  if (profile.birthDate) fields.push('出生日期');
  if (profile.birthTime) fields.push('出生时间');
  if (profile.birthPlace) fields.push('出生地');
  if (profile.gender) fields.push('性别');
  return fields.length ? '你留下的' + fields.join('、') : '你刚刚开始留下自己的资料';
}

function longTermPatterns(sources) {
  const themeCounts = {};
  const emotionCounts = {};
  sources.dreams.forEach(function (dream) {
    dream.symbols.forEach(function (symbol) { themeCounts[symbol] = (themeCounts[symbol] || 0) + 1; });
    if (dream.emotion) emotionCounts[dream.emotion] = (emotionCounts[dream.emotion] || 0) + 1;
  });
  function top(counts, limit) {
    return Object.keys(counts).sort(function (left, right) {
      return counts[right] - counts[left] || left.localeCompare(right);
    }).slice(0, limit).map(function (label) { return { label: label, count: counts[label] }; });
  }
  return {
    dreamCount: sources.dreams.length,
    lifeNoteCount: sources.notes.length,
    recurringThemes: top(themeCounts, 5),
    recurringEmotions: top(emotionCounts, 3)
  };
}

function promptEvidence(sources) {
  let remainingDiscussions = MAX_PROMPT_DISCUSSIONS;
  const dreams = sources.dreams.slice(0, MAX_PROMPT_DREAMS).map(function (dream) {
    const discussion = dream.discussion.slice(0, remainingDiscussions).map(function (item) { return text(item, 120); });
    remainingDiscussions -= discussion.length;
    return {
      text: text(dream.text, 180),
      symbols: dream.symbols,
      emotion: dream.emotion,
      userDiscussion: discussion
    };
  });
  return {
    recentDreams: dreams,
    recentLifeNotes: sources.notes.slice(0, MAX_PROMPT_NOTES).map(function (note) { return text(note.text, 140); }),
    longTermPatterns: longTermPatterns(sources),
    omittedDreamCount: Math.max(0, sources.dreams.length - dreams.length),
    omittedLifeNoteCount: Math.max(0, sources.notes.length - MAX_PROMPT_NOTES)
  };
}

async function loadAllByOpenid(collectionName, openid) {
  return loadAllByOpenidFrom(db, collectionName, openid);
}

async function loadAllByOpenidFrom(database, collectionName, openid) {
  const items = [];
  let offset = 0;
  while (true) {
    const response = await database.collection(collectionName).where({ openid: openid })
      .orderBy('createdAt', 'desc').skip(offset).limit(SOURCE_PAGE_SIZE).get();
    const page = response && response.data ? response.data : [];
    items.push.apply(items, page);
    if (page.length < SOURCE_PAGE_SIZE) return items;
    offset += page.length;
  }
}

function sourceManifest(sources) {
  function dateKey(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : '';
  }
  return {
    profile: baseProfile(sources && sources.user),
    dreams: (sources && sources.dreams || []).map(function (dream) {
      return JSON.stringify({
        id: text(dream && dream.id, 80), localId: text(dream && dream.localId, 80),
        text: text(dream && dream.text, 360), symbols: cleanStrings(dream && dream.symbols, 5, 30),
        emotion: text(dream && dream.emotion, 100), discussion: cleanStrings(dream && dream.discussion, 4, 220),
        createdAt: dateKey(dream && dream.createdAt)
      });
    }).sort(),
    notes: (sources && sources.notes || []).map(function (note) {
      return JSON.stringify({ id: text(note && note.id, 80), text: text(note && note.text, 220), createdAt: dateKey(note && note.createdAt) });
    }).sort()
  };
}

function sameManifest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function sourcesStillCurrent(transaction, openid, expected) {
  const results = await Promise.all([
    transaction.collection('users').where({ openid: openid }).limit(1).get(),
    loadAllByOpenidFrom(transaction, 'dream_entries', openid),
    loadAllByOpenidFrom(transaction, 'life_notes', openid)
  ]);
  const user = results[0].data && results[0].data[0] ? results[0].data[0] : null;
  const dreams = results[1] || [];
  const notes = results[2] || [];
  const current = sourceManifest({
    user: user,
    dreams: dreams.map(function (dream) {
      const result = dream.result || {};
      return {
        id: text(dream._id || dream.localId, 80), localId: text(dream.localId, 80), text: text(dream.dreamText, 360),
        symbols: cleanStrings(dream.symbols || result.symbols, 5, 30), emotion: text(dream.emotionalWeather || result.emotional_weather, 100),
        discussion: discussionTexts(dream), createdAt: dream.createdAt || null
      };
    }),
    notes: notes.map(function (note) { return { id: text(note._id, 80), text: text(note.text, 220), createdAt: note.createdAt || null }; })
  });
  if (!sameManifest(expected, current) || dreams.some(function (dream) { return dream.deletionPending === true; })) return false;

  const sourceDreamIds = expected.dreams.map(function (entry) {
    try { return text(JSON.parse(entry).localId, 80); } catch (error) { return ''; }
  }).filter(Boolean);
  const deletionChecks = await Promise.all(sourceDreamIds.map(function (localId) {
    return transaction.collection('deletion_jobs').where({ openid: openid, sourceDreamId: localId }).limit(1).get();
  }));
  return !deletionChecks.some(function (result) { return result.data && result.data.length; });
}

async function loadSources(openid) {
  const results = await Promise.all([
    db.collection('users').where({ openid: openid }).limit(1).get().catch(function () { return { data: [] }; }),
    loadAllByOpenid('dream_entries', openid).catch(function () { return []; }),
    loadAllByOpenid('life_notes', openid).catch(function () { return []; }),
    db.collection('profile_snapshots').where({ openid: openid }).orderBy('updatedAt', 'desc').limit(8).get().catch(function () { return { data: [] }; })
  ]);
  const user = results[0].data && results[0].data[0] ? results[0].data[0] : null;
  const dreams = (results[1] || []).map(function (dream) {
    const result = dream.result || {};
    return {
      id: text(dream._id || dream.localId, 80),
      localId: text(dream.localId, 80),
      text: text(dream.dreamText, 360),
      symbols: cleanStrings(dream.symbols || result.symbols, 5, 30),
      emotion: text(dream.emotionalWeather || result.emotional_weather, 100),
      discussion: discussionTexts(dream),
      createdAt: dream.createdAt || null,
      ref: sourceRef('dream_entries', dream)
    };
  }).filter(function (item) { return item.id && item.text; });
  const notes = (results[2] || []).map(function (note) {
    return { id: text(note._id, 80), text: text(note.text, 220), createdAt: note.createdAt || null, ref: sourceRef('life_notes', note) };
  }).filter(function (item) { return item.id && item.text; });
  const userRef = user ? sourceRef('users', user) : null;
  const portraitHistory = results[3] && results[3].data ? results[3].data : [];
  const priorPortrait = portraitHistory.filter(function (item) { return item.status === 'draft' && item.stale !== true; })[0]
    || portraitHistory.filter(function (item) { return item.status === 'confirmed' && item.stale !== true; })[0]
    || null;
  return { user: user, userRef: userRef, dreams: dreams, notes: notes, priorPortrait: priorPortrait };
}

function deterministicDraft(sources) {
  const profile = baseProfile(sources.user);
  const patterns = longTermPatterns(sources);
  const themes = [];
  const traits = [];
  const contexts = [];
  const refs = [];
  if (sources.userRef) refs.push(sources.userRef);
  sources.dreams.forEach(function (dream) {
    refs.push(dream.ref);
    dream.symbols.forEach(function (symbol) { if (themes.indexOf(symbol) < 0) themes.push(symbol); });
    if (dream.emotion && contexts.indexOf('近期梦中出现：' + dream.emotion) < 0) contexts.push('近期梦中出现：' + dream.emotion);
    dream.discussion.filter(isUsefulDiscussionText).forEach(function (item) {
      contexts.push('梦后提到的现实线索：' + item);
    });
  });
  sources.notes.forEach(function (note) { refs.push(note.ref); contexts.push('生活记录提到：' + note.text); });
  contexts.unshift(profileFoundationSummary(profile) + '。');
  if (sources.dreams.length) traits.push('会留意并记录内在体验');
  if (sources.notes.length) traits.push('愿意把感受连接到现实生活');
  if (themes.length) traits.push('对反复出现的意象保持观察');
  if (!traits.length) traits.push('目前资料较少，等待更多用户主动提供的线索');
  const name = profile.nickname || '你';
  const recurringThemes = patterns.recurringThemes.map(function (item) { return '“' + item.label + '”'; }).join('、');
  const recentNote = sources.notes[0] ? text(sources.notes[0].text, 80) : '';
  const summaryParts = [name + '，你是一个对变化和细节很敏感、但不会轻易被它们推着走的人。'];
  if (recentNote) summaryParts.push('最近现实里你提到“' + recentNote + '”，你似乎正在一边靠近新的可能，一边确认它是否真的值得投入。');
  else if (recurringThemes) summaryParts.push('最近反复出现的' + recurringThemes + '，像是一条持续牵着你的线，让你不断回头确认自己真正想要什么。');
  else if (patterns.recurringEmotions[0]) summaryParts.push('最近的梦常带着“' + patterns.recurringEmotions[0].label + '”的情绪天气，像是有种感受还没有被真正放下。');
  if (sources.dreams.some(function (dream) { return dream.discussion.length; })) summaryParts.push('你没有急着给这些变化下结论，而是愿意在梦后继续把感受说清楚。');
  if (summaryParts.length === 1) summaryParts.push('你正在慢慢形成自己的判断：什么值得留下，什么只是因为熟悉才舍不得离开。');
  return {
    summary: text(summaryParts.join(''), 500),
    traits: cleanStrings(traits, 5, 80),
    themes: cleanStrings(themes, 6, 40),
    realLifeContext: cleanStrings(contexts, 5, 140),
    sourceRefs: refs.slice(0, 18),
    baseProfile: profile,
    sourceCounts: {
      dreamCount: sources.dreams.length,
      discussionCount: sources.dreams.reduce(function (count, dream) { return count + dream.discussion.length; }, 0),
      lifeNoteCount: sources.notes.length
    },
    changeReason: '根据当前可用的基础资料、已存档梦境、梦后回应和生活记录生成。'
  };
}

function isMetaSummary(value) {
  const source = text(value, 500);
  return !source || /这是一份|基于近期|供你确认|供你修改|阶段性观察|仅提炼当前|目前资料较少|等待你补充/.test(source);
}

function normalizeObservation(raw, fallback) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const traits = cleanStrings(raw.traits, 5, 80);
  const themes = cleanStrings(raw.themes, 6, 40);
  const contexts = cleanStrings(raw.realLifeContext, 5, 140);
  return {
    summary: isMetaSummary(raw.summary) ? fallback.summary : text(raw.summary, 500),
    traits: traits.length ? traits : fallback.traits,
    themes: themes.length ? themes : fallback.themes,
    realLifeContext: contexts.length ? contexts : fallback.realLifeContext,
    sourceRefs: fallback.sourceRefs,
    baseProfile: fallback.baseProfile,
    sourceCounts: fallback.sourceCounts,
    changeReason: text(raw.changeReason, 220) || fallback.changeReason
  };
}

function aiPrompt(sources) {
  const profile = baseProfile(sources.user);
  const evidence = promptEvidence(sources);
  const priorPortrait = sources.priorPortrait ? {
    version: Number(sources.priorPortrait.version || 0),
    summary: text(sources.priorPortrait.summary, 500),
    userEdited: !!sources.priorPortrait.userEdited
  } : null;
  return [
    '你为 Oneiro 创建一份会自动成为当前版本的“AI阶段画像”。只能基于提供资料作可修正的阶段性观察，绝不把推测写成事实。',
    '不得诊断人格、心理/医疗状况，不预测未来，不应包含敏感属性推断。资料不足时明确保持有限。',
    'summary 是核心：写成一段直接对“你”说的话，像熟悉用户的朋友。必须自然连起基础资料背景、近期变化、跨时间重复模式和当前张力；具体但不武断。基础资料只作理解背景，不据此下判断。',
    'summary 禁止出现“这是一份”“基于资料”“供你确认”等元话术；禁止逐个解释梦象、逐条复述梦或生活记录。',
    '必须自己判断哪些梦后聊天是有价值的现实线索：优先保留具体的近期事件、持续情绪、关系/工作/生活变化和反复出现的现实关注点；忽略寒暄、单纯梦中描述、对解读的附和和没有现实落点的猜测。',
    '不要要求用户确认，也不要把“用户没有点击确认”当成排除条件；这是系统的提取工作。信息不足时宁可返回空数组。',
    '上一版仅是可修正基线。若其中有用户编辑，优先延续其核心措辞，除非新证据明显需要调整。',
    '原始证据已按输入边界截取；长期模式覆盖全部已存档来源。不要声称看到了未提供的细节。',
    '只返回 JSON：{"summary":"<=500字，朋友式整体描述","traits":["<=80字，最多5项，选择性提炼"],"themes":["<=40字，最多6项，选择性提炼"],"realLifeContext":["<=140字，最多5项，仅补充必要现实背景"],"changeReason":"<=220字"}。',
    '基础用户资料：' + JSON.stringify(profile),
    '上一版阶段画像（只作为可修正的基线；如果用户编辑过，优先保留其核心措辞）：' + JSON.stringify(priorPortrait),
    '有边界的近期证据与全量长期模式：' + JSON.stringify(evidence)
  ].join('\n');
}

async function generateObservation(sources) {
  const fallback = deterministicDraft(sources);
  const config = profileConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) return { observation: fallback, provider: 'deterministic', fallback: true };
  try {
    const response = await postJson(config.baseUrl + '/chat/completions', { Authorization: 'Bearer ' + config.apiKey }, {
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: '只输出合法 JSON 对象。' }, { role: 'user', content: aiPrompt(sources) }],
      temperature: 0.35
    }, Number(process.env.PROFILE_MEMORY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('ai_http_' + response.statusCode);
    const data = JSON.parse(response.text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return { observation: normalizeObservation(parseJsonObject(content), fallback), provider: 'ai', model: config.model, fallback: false };
  } catch (error) {
    return { observation: fallback, provider: 'deterministic', fallback: true, error: text(error && error.message, 160) };
  }
}

function snapshotForClient(snapshot) {
  if (!snapshot) return null;
  const copy = Object.assign({}, snapshot);
  delete copy.openid;
  return copy;
}

async function sourceAvailability(openid, refs) {
  const list = Array.isArray(refs) ? refs.slice(0, 18) : [];
  return Promise.all(list.map(async function (ref) {
    const clean = Object.assign({}, ref);
    const id = safeId(ref && ref.sourceId);
    if (!id || ['users', 'dream_entries', 'life_notes'].indexOf(ref.sourceType) < 0) { clean.sourceState = 'invalid'; return clean; }
    try {
      const result = await db.collection(ref.sourceType).where({ _id: id, openid: openid }).limit(1).get();
      clean.sourceState = result.data && result.data.length ? 'available' : 'missing';
    } catch (error) { clean.sourceState = 'unknown'; }
    return clean;
  }));
}

async function decorateSnapshot(openid, snapshot) {
  const copy = snapshotForClient(snapshot);
  if (copy) copy.sourceRefs = await sourceAvailability(openid, copy.sourceRefs);
  return copy;
}

async function findOwned(openid, id) {
  const result = await db.collection('profile_snapshots').where({ _id: id, openid: openid }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function getState(openid) {
  const results = await Promise.all([
    db.collection('profile_snapshots').where({ openid: openid }).orderBy('updatedAt', 'desc').limit(MAX_HISTORY).get(),
    db.collection('profile_memory_state').where({ openid: openid }).limit(1).get().catch(function () { return { data: [] }; })
  ]);
  const result = results[0];
  const memoryState = results[1].data && results[1].data[0];
  const sortedHistory = sortByDate(result.data || []);
  const visible = function (item) {
    return item && item.stale !== true;
  };
  const usable = function (item) {
    return visible(item) && item.useInFutureReadings !== false;
  };
  const history = sortedHistory.map(function (item) {
    if (item.status === 'draft') {
      return Object.assign({}, item, {
        status: 'superseded',
        isCurrent: false
      });
    }
    return item;
  });
  const current = (memoryState && memoryState.currentSnapshotId
    ? history.filter(function (item) { return item._id === memoryState.currentSnapshotId && item.status === 'confirmed' && visible(item); })[0]
    : null) || history.filter(function (item) { return item.status === 'confirmed' && item.isCurrent !== false && visible(item); })[0] || null;
  return {
    ok: true,
    current: await decorateSnapshot(openid, current),
    latestDraft: null,
    history: await Promise.all(history.map(function (item) { return decorateSnapshot(openid, item); }))
  };
}

function editableSnapshot(input, base) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    summary: text(source.summary, 500) || base.summary,
    traits: Array.isArray(source.traits) ? cleanStrings(source.traits, 5, 80) : base.traits,
    themes: Array.isArray(source.themes) ? cleanStrings(source.themes, 6, 40) : base.themes,
    realLifeContext: Array.isArray(source.realLifeContext) ? cleanStrings(source.realLifeContext, 5, 140) : base.realLifeContext,
    changeReason: text(source.changeReason, 220) || base.changeReason
  };
}

async function runAtomic(work) {
  if (db && typeof db.runTransaction === 'function') {
    return db.runTransaction(work);
  }
  return work(db);
}

exports.main = async function (event) {
  const action = text(event && event.action, 30) || 'get';
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { ok: false, reason: 'missing_openid' };
  try {
    if (action === 'get' || action === 'list') return getState(openid);

    if (action === 'generate') {
      const sources = await loadSources(openid);
      const expectedSources = sourceManifest(sources);
      const generated = await generateObservation(sources);
      const now = new Date();
      const observation = generated.observation;
      const requestedReason = text(event && event.changeReason, 220);
      const created = await runAtomic(async function (transaction) {
        if (!await sourcesStillCurrent(transaction, openid, expectedSources)) {
          return { sourceChanged: true };
        }
        const states = await transaction.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
        const state = states.data && states.data[0];
        let version = state ? Number(state.nextVersion || 1) : 1;
        if (!state) {
          const prior = await transaction.collection('profile_snapshots').where({ openid: openid }).limit(MAX_HISTORY).get();
          version = (prior.data || []).reduce(function (max, item) {
            const value = Number(item && item.version);
            return Number.isFinite(value) && value >= max ? value + 1 : max;
          }, 1);
        }
        const priorDrafts = await transaction.collection('profile_snapshots')
          .where({ openid: openid, status: 'draft' }).limit(MAX_HISTORY).get();
        await Promise.all((priorDrafts.data || []).map(function (item) {
          return transaction.collection('profile_snapshots').doc(item._id).update({ data: {
            status: 'superseded', isCurrent: false, supersededAt: now,
            supersededByVersion: version, updatedAt: now
          } });
        }));
        const priorConfirmed = await transaction.collection('profile_snapshots')
          .where({ openid: openid, status: 'confirmed' }).limit(MAX_HISTORY).get();
        await Promise.all((priorConfirmed.data || []).map(function (item) {
          return transaction.collection('profile_snapshots').doc(item._id).update({ data: { isCurrent: false, updatedAt: now } });
        }));
        const snapshot = await transaction.collection('profile_snapshots').add({ data: {
          openid: openid, version: version, status: 'confirmed', isCurrent: true,
          summary: observation.summary, profileText: observation.summary, traits: observation.traits, themes: observation.themes,
          realLifeContext: observation.realLifeContext, recentContext: observation.realLifeContext, sourceRefs: observation.sourceRefs,
          baseProfile: observation.baseProfile, sourceCounts: observation.sourceCounts,
          changeReason: requestedReason || observation.changeReason, aiOriginal: Object.assign({}, observation, { provider: generated.provider, model: generated.model || '', fallback: generated.fallback }),
          userEdited: null, useInFutureReadings: true, createdAt: now, updatedAt: now, confirmedAt: now,
          autoPublished: true
        } });
        if (state) {
          await transaction.collection('profile_memory_state').doc(state._id).update({ data: {
            nextVersion: version + 1, currentSnapshotId: snapshot._id, updatedAt: now
          } });
        } else {
          await transaction.collection('profile_memory_state').add({ data: {
            openid: openid, nextVersion: version + 1, currentSnapshotId: snapshot._id, createdAt: now, updatedAt: now
          } });
        }
        return snapshot;
      });
      if (created && created.sourceChanged) {
        return { ok: false, reason: 'sources_changed', retryable: true };
      }
      const snapshot = await findOwned(openid, created._id);
      return { ok: true, snapshot: await decorateSnapshot(openid, snapshot), provider: generated.provider, fallback: generated.fallback, providerError: generated.error || '' };
    }

    const id = safeId(event && (event.snapshotId || event.id));
    if (!id) return { ok: false, reason: 'missing_snapshot_id' };
    const existing = await findOwned(openid, id);
    if (!existing) return { ok: false, reason: 'snapshot_not_found' };
    const now = new Date();

    if (action === 'save') {
      const edited = editableSnapshot(event && (event.snapshot || event.edits), existing);
      const created = await runAtomic(async function (transaction) {
        const states = await transaction.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
        const state = states.data && states.data[0];
        let version = state ? Number(state.nextVersion || 1) : Number(existing.version || 0) + 1;
        if (!state) {
          const prior = await transaction.collection('profile_snapshots').where({ openid: openid }).limit(MAX_HISTORY).get();
          version = (prior.data || []).reduce(function (max, item) {
            const value = Number(item && item.version);
            return Number.isFinite(value) && value >= max ? value + 1 : max;
          }, 1);
        }
        const confirmed = await transaction.collection('profile_snapshots').where({ openid: openid, status: 'confirmed' }).limit(MAX_HISTORY).get();
        await Promise.all((confirmed.data || []).map(function (item) {
          return transaction.collection('profile_snapshots').doc(item._id).update({ data: { isCurrent: false, updatedAt: now } });
        }));
        if (existing.status === 'draft') {
          await transaction.collection('profile_snapshots').doc(id).update({ data: { status: 'superseded', isCurrent: false, supersededAt: now, supersededByVersion: version, updatedAt: now } });
        }
        const snapshot = await transaction.collection('profile_snapshots').add({ data: Object.assign({}, edited, {
          openid: openid, version: version, status: 'confirmed', isCurrent: true,
          sourceRefs: existing.sourceRefs || [], baseProfile: existing.baseProfile || baseProfile(null), sourceCounts: existing.sourceCounts || {},
          profileText: edited.summary, recentContext: existing.recentContext || existing.realLifeContext || [],
          aiOriginal: existing.aiOriginal || null, userEdited: Object.assign({}, edited, { editedAt: now }),
          useInFutureReadings: existing.useInFutureReadings !== false, createdAt: now, updatedAt: now, confirmedAt: now,
          autoPublished: false, derivedFromSnapshotId: id
        }) });
        if (state) {
          await transaction.collection('profile_memory_state').doc(state._id).update({ data: { nextVersion: version + 1, currentSnapshotId: snapshot._id, updatedAt: now } });
        } else {
          await transaction.collection('profile_memory_state').add({ data: { openid: openid, nextVersion: version + 1, currentSnapshotId: snapshot._id, createdAt: now, updatedAt: now } });
        }
        return snapshot;
      });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, created._id)) };
    }

    if (action === 'confirm') {
      if (existing.status === 'confirmed' && existing.isCurrent === true) {
        return { ok: true, snapshot: await decorateSnapshot(openid, existing) };
      }
      if (existing.status !== 'draft') return { ok: false, reason: 'only_draft_confirmable' };
      await runAtomic(async function (transaction) {
        const owned = await transaction.collection('profile_snapshots').where({ _id: id, openid: openid }).limit(1).get();
        const target = owned.data && owned.data[0];
        if (!target || target.status !== 'draft') throw new Error('portrait_changed_before_confirm');
        const older = await transaction.collection('profile_snapshots').where({ openid: openid, status: 'confirmed' }).limit(MAX_HISTORY).get();
        await Promise.all((older.data || []).filter(function (item) { return item._id !== id; }).map(function (item) {
          return transaction.collection('profile_snapshots').doc(item._id).update({ data: { isCurrent: false, updatedAt: now } });
        }));
        await transaction.collection('profile_snapshots').doc(id).update({ data: { status: 'confirmed', isCurrent: true, confirmedAt: now, updatedAt: now } });
        const states = await transaction.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
        if (states.data && states.data[0]) {
          await transaction.collection('profile_memory_state').doc(states.data[0]._id).update({ data: { currentSnapshotId: id, updatedAt: now } });
        } else {
          await transaction.collection('profile_memory_state').add({ data: { openid: openid, nextVersion: Number(target.version || 0) + 1, currentSnapshotId: id, createdAt: now, updatedAt: now } });
        }
      });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, id)) };
    }

    if (action === 'reject') {
      await db.collection('profile_snapshots').doc(id).update({ data: { status: 'rejected', isCurrent: false, updatedAt: now } });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, id)) };
    }

    if (action === 'toggleUse') {
      const value = typeof event.useInFutureReadings === 'undefined' ? !existing.useInFutureReadings : bool(event.useInFutureReadings);
      await db.collection('profile_snapshots').doc(id).update({ data: { useInFutureReadings: value, updatedAt: now } });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, id)) };
    }

    if (action === 'restore') {
      if (existing.stale === true) return { ok: false, reason: 'snapshot_stale' };
      const restored = await runAtomic(async function (transaction) {
        const states = await transaction.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
        const state = states.data && states.data[0];
        let version = state ? Number(state.nextVersion || 1) : Number(existing.version || 0) + 1;
        if (!state) {
          const prior = await transaction.collection('profile_snapshots').where({ openid: openid }).limit(MAX_HISTORY).get();
          version = (prior.data || []).reduce(function (max, item) {
            const value = Number(item && item.version);
            return Number.isFinite(value) && value >= max ? value + 1 : max;
          }, 1);
        }
        const confirmed = await transaction.collection('profile_snapshots').where({ openid: openid, status: 'confirmed' }).limit(MAX_HISTORY).get();
        await Promise.all((confirmed.data || []).map(function (item) {
          return transaction.collection('profile_snapshots').doc(item._id).update({ data: { isCurrent: false, updatedAt: now } });
        }));
        const snapshot = await transaction.collection('profile_snapshots').add({ data: {
          openid: openid, version: version, status: 'confirmed', isCurrent: true,
          summary: existing.summary, profileText: existing.profileText || existing.summary,
          traits: existing.traits || [], themes: existing.themes || [],
          realLifeContext: existing.realLifeContext || [], recentContext: existing.recentContext || existing.realLifeContext || [],
          sourceRefs: existing.sourceRefs || [], baseProfile: existing.baseProfile || baseProfile(null), sourceCounts: existing.sourceCounts || {},
          changeReason: '从 V' + String(existing.version || '?') + ' 回溯',
          aiOriginal: existing.aiOriginal || null,
          userEdited: { restoredFromSnapshotId: id, restoredFromVersion: Number(existing.version || 0), restoredAt: now },
          useInFutureReadings: existing.useInFutureReadings !== false,
          createdAt: now, updatedAt: now, confirmedAt: now, autoPublished: false,
          derivedFromSnapshotId: id
        } });
        if (state) {
          await transaction.collection('profile_memory_state').doc(state._id).update({ data: { nextVersion: version + 1, currentSnapshotId: snapshot._id, updatedAt: now } });
        } else {
          await transaction.collection('profile_memory_state').add({ data: { openid: openid, nextVersion: version + 1, currentSnapshotId: snapshot._id, createdAt: now, updatedAt: now } });
        }
        return snapshot;
      });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, restored._id)) };
    }
    return { ok: false, reason: 'unsupported_action' };
  } catch (error) {
    return { ok: false, reason: 'profile_memory_error', message: text(error && error.message, 180) };
  }
};
