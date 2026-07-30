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

// 旧版本未写开关时，默认继续用于后续解读。
function normalizedSnapshot(snapshot) {
  const copy = Object.assign({}, snapshot || {});
  // Some pre-summary snapshots only persisted profileText. Normalize on the
  // way out so clients can render them and decide whether a migration is due.
  copy.summary = text(copy.summary || copy.profileText, 500);
  copy.profileText = text(copy.profileText || copy.summary, 500);
  copy.status = allowedStatus(copy.status, 'confirmed');
  copy.useInFutureReadings = copy.useInFutureReadings !== false;
  return copy;
}

// 编辑原文不截断，用于保存和下一次生成时的高权重参考。
function editableOriginal(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    summary: typeof source.summary === 'string' ? source.summary : '',
    traits: Array.isArray(source.traits) ? source.traits.slice() : [],
    themes: Array.isArray(source.themes) ? source.themes.slice() : [],
    realLifeContext: Array.isArray(source.realLifeContext) ? source.realLifeContext.slice() : [],
    changeReason: typeof source.changeReason === 'string' ? source.changeReason : ''
  };
}

function snapshotUserEdit(snapshot) {
  if (snapshot && snapshot.userEditedOriginal) return snapshot.userEditedOriginal;
  if (snapshot && snapshot.userEdited && typeof snapshot.userEdited === 'object') return snapshot.userEdited;
  return null;
}

function cleanStrings(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) { return text(item, maxLength); }).filter(Boolean).slice(0, maxItems);
}

function safeId(value) {
  return text(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
}

function newSnapshotId() {
  return safeId('portrait-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
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

async function loadAllByOpenidFrom(database, collectionName, openid, sortField) {
  const items = [];
  let offset = 0;
  while (true) {
    let query = database.collection(collectionName).where({ openid: openid });
    if (sortField) query = query.orderBy(sortField, 'desc');
    const response = await query.skip(offset).limit(SOURCE_PAGE_SIZE).get();
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
    portrait: {
      stateId: text(sources && sources.memoryState && sources.memoryState._id, 80),
      generationRevision: Number(sources && sources.memoryState && sources.memoryState.generationRevision || 0),
      nextVersion: Number(sources && sources.memoryState && sources.memoryState.nextVersion || 1),
      currentSnapshotId: text(sources && sources.currentSnapshotId, 80),
      priorSnapshotId: text(sources && sources.priorPortrait && sources.priorPortrait._id, 80),
      priorUpdatedAt: dateKey(sources && sources.priorPortrait && sources.priorPortrait.updatedAt)
    },
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

async function sourcesStillCurrent(openid, expected) {
  // All collection queries run outside the transaction. CloudBase only allows
  // doc operations in a transaction; the state-document revision below is the
  // transactional optimistic lock for the gap between this check and commit.
  const currentSources = await loadSources(openid);
  if (!sameManifest(expected, sourceManifest(currentSources))) return null;
  if (currentSources.rawDreams.some(function (dream) { return dream.deletionPending === true; })) return null;
  const deletionJobs = await loadAllByOpenid('deletion_jobs', openid);
  const sourceDreamIds = expected.dreams.map(function (entry) {
    try { return text(JSON.parse(entry).localId, 80); } catch (error) { return ''; }
  }).filter(Boolean);
  if (deletionJobs.some(function (job) {
    return sourceDreamIds.indexOf(text(job && job.sourceDreamId, 80)) >= 0;
  })) return null;
  return currentSources;
}

async function loadSources(openid) {
  const results = await Promise.all([
    db.collection('users').where({ openid: openid }).limit(1).get().catch(function () { return { data: [] }; }),
    loadAllByOpenid('dream_entries', openid).catch(function () { return []; }),
    loadAllByOpenid('life_notes', openid).catch(function () { return []; }),
    db.collection('profile_snapshots').where({ openid: openid }).limit(MAX_HISTORY).get().catch(function () { return { data: [] }; }),
    db.collection('profile_memory_state').where({ openid: openid }).limit(1).get().catch(function () { return { data: [] }; })
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
  const portraitHistory = sortByDate((results[3] && results[3].data ? results[3].data : []).map(normalizedSnapshot));
  const priorPortrait = portraitHistory.filter(function (item) { return item.status === 'confirmed' && item.isCurrent !== false && item.stale !== true; })[0]
    || portraitHistory.filter(function (item) { return item.status === 'confirmed' && item.stale !== true; })[0]
    || portraitHistory.filter(function (item) { return item.status === 'draft' && item.stale !== true; })[0]
    || null;
  const memoryState = results[4].data && results[4].data[0] ? results[4].data[0] : null;
  return {
    user: user,
    userRef: userRef,
    dreams: dreams,
    notes: notes,
    priorPortrait: priorPortrait,
    currentSnapshotId: memoryState && memoryState.currentSnapshotId,
    memoryState: memoryState || null,
    portraitHistory: portraitHistory,
    rawDreams: results[1] || []
  };
}

async function ensureMemoryState(openid) {
  const existing = await db.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
  if (existing.data && existing.data[0]) return existing.data[0];
  const snapshotsResult = await db.collection('profile_snapshots').where({ openid: openid }).limit(MAX_HISTORY).get();
  const snapshots = sortByDate((snapshotsResult.data || []).map(normalizedSnapshot));
  const current = snapshots.filter(function (item) { return item.status === 'confirmed' && item.isCurrent !== false && item.stale !== true; })[0]
    || snapshots.filter(function (item) { return item.status === 'confirmed' && item.stale !== true; })[0]
    || null;
  const nextVersion = snapshots.reduce(function (next, item) {
    const version = Number(item && item.version);
    return Number.isFinite(version) ? Math.max(next, version + 1) : next;
  }, 1);
  // First generation has no state doc to lock yet. A stable id gives all
  // concurrent opens one document, and the doc-only transaction prevents a
  // late initializer from resetting a state that another request committed.
  let hash = 2166136261;
  for (let index = 0; index < openid.length; index += 1) {
    hash ^= openid.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const id = 'profile-memory-' + (hash >>> 0).toString(36);
  const now = new Date();
  return runAtomic(async function (transaction) {
    const stateDoc = transaction.collection('profile_memory_state').doc(id);
    let state = null;
    try {
      state = (await stateDoc.get()).data || null;
    } catch (error) {}
    if (state) return state;
    const initialData = {
      openid: openid, nextVersion: nextVersion,
      currentSnapshotId: current ? current._id : '', generationRevision: 0,
      createdAt: now, updatedAt: now
    };
    const initialState = Object.assign({ _id: id }, initialData);
    await stateDoc.set({ data: initialData });
    return (await stateDoc.get()).data || initialState;
  });
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
  const recurringThemes = patterns.recurringThemes.filter(function (item) { return item.count >= 2; }).slice(0, 3).map(function (item) { return '“' + item.label + '”'; }).join('、');
  const recentNote = sources.notes[0] ? text(sources.notes[0].text, 80) : '';
  const emotion = patterns.recurringEmotions[0] ? patterns.recurringEmotions[0].label : '目前还无法判断';
  const priorUserEdit = snapshotUserEdit(sources.priorPortrait);
  const summaryParts = ['当下的状态：' + name + '，' + (recentNote ? '你最近提到“' + recentNote + '”。' : '现有素材不多，你正在留下可供理解自己的线索。')];
  if (priorUserEdit && priorUserEdit.summary) summaryParts[0] = '当下的状态：' + text(priorUserEdit.summary, 55);
  if (recurringThemes) summaryParts.push('反复出现的主题：' + recurringThemes + '。');
  summaryParts.push('情绪的底色：' + emotion + '；这只是当前资料中的有限观察。');
  if (sources.priorPortrait) summaryParts.push('正在变化的：新的记录会继续校正这份阶段性理解。');
  const summary = priorUserEdit && priorUserEdit.summary
    ? String(priorUserEdit.summary).trim().slice(0, 500)
    : summaryParts.join('\n').slice(0, 200);
  return {
    summary: summary,
    traits: cleanStrings(traits, 5, 80),
    themes: cleanStrings(themes, 3, 40),
    realLifeContext: cleanStrings(contexts, 5, 140),
    sourceRefs: refs.slice(0, 18),
    baseProfile: profile,
    sourceCounts: {
      dreamCount: sources.dreams.length,
      discussionCount: sources.dreams.reduce(function (count, dream) { return count + dream.discussion.length; }, 0),
      lifeNoteCount: sources.notes.length
    },
    changeReason: '根据当前可用的基础资料、已存档梦境、梦后回应和生活记录生成。',
    hasPriorPortrait: !!sources.priorPortrait
  };
}

function isMetaSummary(value) {
  const source = text(value, 500);
  return !source || /这是一份|基于近期|供你确认|供你修改|阶段性观察|仅提炼当前|目前资料较少|等待你补充/.test(source);
}

// 画像正文固定为四个板块，首次生成不展示“正在变化的”。
function fixedSummary(value, fallback, includeChanging) {
  const headings = includeChanging
    ? ['当下的状态：', '反复出现的主题：', '情绪的底色：', '正在变化的：']
    : ['当下的状态：', '反复出现的主题：', '情绪的底色：'];
  const sectionLimit = includeChanging ? 42 : 55;
  const source = String(value == null ? '' : value).replace(/\r/g, '').trim();
  const lines = headings.map(function (heading, index) {
    const start = source.indexOf(heading);
    const next = index + 1 < headings.length ? source.indexOf(headings[index + 1], start + heading.length) : source.length;
    if (start < 0 || next < start) return '';
    return heading + text(source.slice(start + heading.length, next), sectionLimit);
  });
  return lines.every(Boolean) ? lines.join('\n') : fallback.summary;
}

function normalizeObservation(raw, fallback) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const traits = cleanStrings(raw.traits, 5, 80);
  const themes = cleanStrings(raw.themes, 3, 40);
  const contexts = cleanStrings(raw.realLifeContext, 5, 140);
  return {
    summary: isMetaSummary(raw.summary) ? fallback.summary : fixedSummary(raw.summary, fallback, fallback.hasPriorPortrait),
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
  const priorPortrait = sources.priorPortrait ? normalizedSnapshot(sources.priorPortrait) : null;
  const priorUserEdit = snapshotUserEdit(priorPortrait);
  const priorPortraitForPrompt = priorPortrait ? {
    version: Number(sources.priorPortrait.version || 0),
    summary: text(sources.priorPortrait.summary, 500),
    userEdited: priorPortrait.userEdited === true || !!priorUserEdit,
    userEditedOriginal: priorUserEdit
  } : null;
  return [
    '为 Oneiro 生成自动生效的阶段画像，只能据证据做可修正观察，不编造、不诊断、不预测。',
    'summary 固定约200字、四行：当下的状态、反复出现的主题、情绪的底色、正在变化的；没有上一版时省略“正在变化的”。资料少也写基础画像，并明确观察有限。整体替换旧画像，不能追加或逐条复述素材。',
    '以下是用户亲手修改过的自我描述，其含义必须完整保留并融入新画像，不得丢弃或反驳；它是最高权重输入。忽略寒暄和无现实落点的猜测。',
    '只返回 JSON：{"summary":"固定结构画像","traits":[],"themes":[],"realLifeContext":[],"changeReason":""}。',
    '基础用户资料：' + JSON.stringify(profile),
    '上一版阶段画像：' + JSON.stringify(priorPortraitForPrompt),
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
  const copy = normalizedSnapshot(snapshot);
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
  const sortedHistory = sortByDate((result.data || []).map(normalizedSnapshot));
  const visible = function (item) {
    return item && item.stale !== true;
  };
  const history = sortedHistory;
  const current = (memoryState && memoryState.currentSnapshotId
    ? history.filter(function (item) { return item._id === memoryState.currentSnapshotId && item.status === 'confirmed' && item.isCurrent !== false && visible(item); })[0]
    : null) || history.filter(function (item) { return item.status === 'confirmed' && item.isCurrent !== false && visible(item); })[0] || null;
  return {
    ok: true,
    current: await decorateSnapshot(openid, current),
    latestDraft: await decorateSnapshot(openid, history.filter(function (item) { return item.status === 'draft' && visible(item); })[0] || null),
    history: await Promise.all(history.map(function (item) { return decorateSnapshot(openid, item); }))
  };
}

function editableSnapshot(input, base) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    summary: text(source.summary, 500) || base.summary,
    traits: Array.isArray(source.traits) ? cleanStrings(source.traits, 5, 80) : base.traits,
    themes: Array.isArray(source.themes) ? cleanStrings(source.themes, 3, 40) : base.themes,
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
      await ensureMemoryState(openid);
      const sources = await loadSources(openid);
      const expectedSources = sourceManifest(sources);
      const generated = await generateObservation(sources);
      const now = new Date();
      const observation = generated.observation;
      const priorUserEdit = snapshotUserEdit(sources.priorPortrait);
      const requestedReason = text(event && event.changeReason, 220);
      const checkedSources = await sourcesStillCurrent(openid, expectedSources);
      if (!checkedSources) return { ok: false, reason: 'sources_changed', retryable: true };
      const snapshotId = newSnapshotId();
      const created = await runAtomic(async function (transaction) {
        const expectedState = checkedSources.memoryState;
        if (!expectedState || !expectedState._id) return { sourceChanged: true };
        let state;
        try {
          state = (await transaction.collection('profile_memory_state').doc(expectedState._id).get()).data;
        } catch (error) {
          return { sourceChanged: true };
        }
        if (!state || Number(state.generationRevision || 0) !== Number(expectedState.generationRevision || 0) ||
          Number(state.nextVersion || 1) !== Number(expectedState.nextVersion || 1) ||
          text(state.currentSnapshotId, 80) !== text(expectedState.currentSnapshotId, 80)) return { sourceChanged: true };
        const version = Number(state.nextVersion || 1);
        const currentSnapshotId = text(state.currentSnapshotId, 80);
        if (currentSnapshotId) {
          try {
            const currentSnapshot = (await transaction.collection('profile_snapshots').doc(currentSnapshotId).get()).data;
            const currentUpdatedAt = new Date(currentSnapshot && currentSnapshot.updatedAt || 0).toISOString();
            if (!currentSnapshot || currentSnapshot.openid !== openid ||
              text(expectedSources.portrait.priorSnapshotId, 80) !== currentSnapshotId ||
              text(expectedSources.portrait.priorUpdatedAt, 80) !== currentUpdatedAt) return { sourceChanged: true };
            await transaction.collection('profile_snapshots').doc(currentSnapshotId).update({ data: { isCurrent: false, updatedAt: now } });
          } catch (error) {
            return { sourceChanged: true };
          }
        }
        await transaction.collection('profile_snapshots').doc(snapshotId).set({ data: {
          openid: openid, version: version, status: 'confirmed', isCurrent: true,
          summary: observation.summary, profileText: observation.summary, traits: observation.traits, themes: observation.themes,
          realLifeContext: observation.realLifeContext, recentContext: observation.realLifeContext, sourceRefs: observation.sourceRefs,
          baseProfile: observation.baseProfile, sourceCounts: observation.sourceCounts,
          changeReason: requestedReason || observation.changeReason, aiOriginal: Object.assign({}, observation, { provider: generated.provider, model: generated.model || '', fallback: generated.fallback }),
          // 延续编辑原文，保证后续生成仍以用户表达为高权重输入。
          userEdited: priorUserEdit ? true : null, userEditedOriginal: priorUserEdit,
          useInFutureReadings: sources.priorPortrait && sources.priorPortrait.useInFutureReadings === false ? false : true,
          createdAt: now, updatedAt: now, confirmedAt: now,
          autoPublished: true
        } });
        await transaction.collection('profile_memory_state').doc(expectedState._id).update({ data: {
          nextVersion: version + 1, currentSnapshotId: snapshotId,
          generationRevision: Number(state.generationRevision || 0) + 1, updatedAt: now
        } });
        return { _id: snapshotId, version: version };
      });
      if (created && created.sourceChanged) {
        return { ok: false, reason: 'sources_changed', retryable: true };
      }
      // Draft cleanup is deliberately outside the critical transaction: it
      // does not decide the current version and CloudBase transactions only
      // permit doc operations. The state document above remains the lock.
      await Promise.all(checkedSources.portraitHistory.filter(function (item) {
        return item.status === 'draft';
      }).map(function (item) {
        return db.collection('profile_snapshots').doc(item._id).update({ data: {
          status: 'superseded', isCurrent: false, supersededAt: now,
          supersededByVersion: created.version, updatedAt: now
        } }).catch(function () { return null; });
      }));
      const snapshot = await findOwned(openid, created._id);
      return { ok: true, snapshot: await decorateSnapshot(openid, snapshot), provider: generated.provider, fallback: generated.fallback, providerError: generated.error || '' };
    }

    const id = safeId(event && (event.snapshotId || event.id));
    if (!id) return { ok: false, reason: 'missing_snapshot_id' };
    const existing = await findOwned(openid, id);
    if (!existing) return { ok: false, reason: 'snapshot_not_found' };
    const now = new Date();

    if (action === 'save') {
      const editInput = event && (event.snapshot || event.edits);
      const edited = editableSnapshot(editInput, existing);
      const original = editableOriginal(editInput);
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
          aiOriginal: existing.aiOriginal || null, userEdited: true,
          userEditedOriginal: Object.assign({}, original, { editedAt: now }),
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

    if (action === 'confirm' || action === 'confirmed') {
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
      await runAtomic(async function (transaction) {
        await transaction.collection('profile_snapshots').doc(id).update({ data: { status: 'rejected', isCurrent: false, updatedAt: now } });
        const states = await transaction.collection('profile_memory_state').where({ openid: openid }).limit(1).get();
        const state = states.data && states.data[0];
        if (state && state.currentSnapshotId === id) {
          await transaction.collection('profile_memory_state').doc(state._id).update({ data: { currentSnapshotId: '', updatedAt: now } });
        }
      });
      return { ok: true, snapshot: await decorateSnapshot(openid, await findOwned(openid, id)) };
    }

    if (action === 'toggleUse') {
      const value = typeof event.useInFutureReadings === 'undefined' ? existing.useInFutureReadings === false : bool(event.useInFutureReadings);
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
          userEdited: existing.userEdited === true,
          userEditedOriginal: existing.userEditedOriginal || null,
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
