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
  copy.isCurrent = copy.isCurrent !== false;
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

// 阶段画像描述的是「当下」，所以近期的重复必须压过陈年的重复；否则半年前
// 的高频意象会一直占住画像，用户读到的是一个早已不是自己的描述。
function recencyWeight(createdAt) {
  const timestamp = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return 0.6;
  const daysAgo = Math.floor((Date.now() - timestamp) / 86400000);
  if (daysAgo <= 14) return 1;
  if (daysAgo <= 45) return 0.7;
  if (daysAgo <= 120) return 0.4;
  return 0.2;
}

function longTermPatterns(sources) {
  const themeCounts = {};
  const themeScores = {};
  const emotionCounts = {};
  const emotionScores = {};
  sources.dreams.forEach(function (dream) {
    const weight = recencyWeight(dream.createdAt);
    dream.symbols.forEach(function (symbol) {
      themeCounts[symbol] = (themeCounts[symbol] || 0) + 1;
      themeScores[symbol] = (themeScores[symbol] || 0) + weight;
    });
    // 只统计短情绪标签。整句天气文案永远不会重复，混进来会让「反复出现的情绪」
    // 退化成「最近一个梦的天气句」。
    (dream.emotionLabels || []).forEach(function (label) {
      emotionCounts[label] = (emotionCounts[label] || 0) + 1;
      emotionScores[label] = (emotionScores[label] || 0) + weight;
    });
  });
  function top(counts, limit, scores) {
    return Object.keys(counts).sort(function (left, right) {
      return (scores[right] - scores[left]) || (counts[right] - counts[left]) || left.localeCompare(right);
    }).slice(0, limit).map(function (label) { return { label: label, count: counts[label] }; });
  }
  return {
    dreamCount: sources.dreams.length,
    lifeNoteCount: sources.notes.length,
    recurringThemes: top(themeCounts, 5, themeScores),
    recurringEmotions: top(emotionCounts, 3, emotionScores)
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
  // 两类证据分开喂，因为它们的可信方式不一样：生活记录是用户自己讲的事，
  // 已确认的呼应是他对我们某个判断点的头。后者更该被相信——那是这条双向环
  // 里唯一一次用户主动说「对」——但它同时是我们自己写出来的句子，混进
  // recentLifeNotes 会让模型把自己上一轮的措辞当成用户的原话再抄一遍，画像
  // 就在自己的回声里越写越确信。分开之后，提示词才有地方说清这个区别。
  const confirmedConnections = sources.notes.filter(function (note) { return note.source === 'dream_connection'; });
  const plainNotes = sources.notes.filter(function (note) { return note.source !== 'dream_connection'; });
  return {
    recentDreams: dreams,
    recentLifeNotes: plainNotes.slice(0, MAX_PROMPT_NOTES).map(function (note) { return text(note.text, 140); }),
    userConfirmedConnections: confirmedConnections.slice(0, MAX_PROMPT_NOTES).map(function (note) { return text(note.text, 140); }),
    longTermPatterns: longTermPatterns(sources),
    omittedDreamCount: Math.max(0, sources.dreams.length - dreams.length),
    omittedLifeNoteCount: Math.max(0, plainNotes.length - MAX_PROMPT_NOTES),
    omittedConfirmedConnectionCount: Math.max(0, confirmedConnections.length - MAX_PROMPT_NOTES)
  };
}

async function loadAllByOpenid(collectionName, openid, sortField) {
  return loadAllByOpenidFrom(db, collectionName, openid, sortField);
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
      return JSON.stringify({
        id: text(note && note.id, 80),
        text: text(note && note.text, 220),
        source: text(note && note.source, 40),
        createdAt: dateKey(note && note.createdAt)
      });
    }).sort()
  };
}

function sameManifest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// ── 只在发生实质变化时才发新版本 ─────────────────────────────────────────
//
// 画像此前每记一个梦就重生成并发一版，于是 V2 和 V3 常常只是换了说法，版本号
// 一路通胀。代价不只是难看：历史版本时间轴（「三个月前你是这样」）和「画像更新
// 了」这条召回提示，价值全部建立在「版本变化 = 真的变了」这个前提上。前提一垮，
// 两个功能同时退化成噪音。
//
// 两道闸，顺序不能反：
//   ① 证据指纹（确定性）——喂给画像的东西（资料、梦、生活记录）一个字没变，
//      就不该有新版本，也不该再花一次供应商调用。这道闸覆盖绝大多数后台刷新。
//   ② 文本近似（兜底）——证据变了（比如多了一个梦），但模型写出来的画像几乎
//      是同一段话。阈值取得很保守：宁可多发一版，也不要把真正的变化吞掉——
//      漏掉一次真实变化，用户会觉得画像根本不长进，比多一个版本号严重得多。

// 指纹只覆盖「证据」，不含 portrait 那一段——后者每发一版都会变（版本号、
// 快照 id、updatedAt），带上它指纹就永远不会相等，这道闸等于没有。
function evidenceFingerprint(manifest) {
  const payload = JSON.stringify({
    profile: manifest && manifest.profile,
    dreams: manifest && manifest.dreams,
    notes: manifest && manifest.notes
  });
  // FNV-1a：够稳定、够短，且不引入依赖。这里只做「变没变」的判断，不用于安全。
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return String(hash) + '-' + String(payload.length);
}

function comparableText(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，。、；：！？…—～·「」『』“”‘’（）()《》,.!?;:~"']/g, '');
}

// 汉字没有空格分词，按字符二元组做 Dice 系数是最省事又足够准的近似度。
function textSimilarity(left, right) {
  const a = comparableText(left);
  const b = comparableText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const counts = Object.create(null);
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    counts[gram] = (counts[gram] || 0) + 1;
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    if (counts[gram] > 0) {
      counts[gram] -= 1;
      shared += 1;
    }
  }
  return (2 * shared) / ((a.length - 1) + (b.length - 1));
}

// 0.9 只用来抓「几乎逐字相同」，而且只在旧快照根本没有结构化断言时才用得上。
//
// 散文相似度不能单独作数，有两个方向都会出错：中文实测里，同一判断换一遍措辞
// 只有 0.33、完全不同的判断是 0.08——两者根本分不开；反过来，用户手改过画像
// 之后系统会原样保留他的文字，相似度恒为 1，可这时图景完全可能已经变了
// （比如梦里出现了一批新意象）。「文字没变」和「说的还是同一件事」是两回事。
const PORTRAIT_SAME_TEXT_SIMILARITY = 0.9;

// 结构化断言（traits / themes / realLifeContext）比散文稳得多，是判断「模型这次
// 说的还是不是同一件事」更可靠的信号：多一个梦但图景没变时三者完全相同，
// 出现新主题时立刻掉到 0.67，图景整体转向时归零。
//
// 这里只在完全相同（1.0）时才抑制，不设中间阈值。理由是失败代价不对称：多发
// 一个版本号只是难看，而把一次真实变化吞掉，用户会觉得画像根本不长进——那正好
// 摧毁了历史时间轴和「画像更新了」这两个功能的全部价值。判不准就发版。
function claimSet(observation) {
  return []
    .concat(observation && observation.traits || [])
    .concat(observation && observation.themes || [])
    .concat(observation && observation.realLifeContext || [])
    .map(comparableText)
    .filter(Boolean)
    .sort();
}

function sameClaims(left, right) {
  const a = claimSet(left);
  const b = claimSet(right);
  // 两边都没有结构化断言时不能算「相同」——那只说明这一版没产出它们，
  // 据此抑制会把所有兜底画像都冻在第一版。
  if (!a.length || !b.length) return false;
  return a.length === b.length && a.every(function (item, index) { return item === b[index]; });
}

// 判定「这次生成有没有说出新东西」。
//
// 主判据是结构化断言逐条相同：它是模型自己给出的、可比较的结论，比散文稳得多。
// 只有旧快照压根没有这些字段（很早的版本）时，才退回到字面相似度。
//
// 只在完全相同时才抑制，不设中间阈值：失败代价不对称——多发一个版本号只是难看，
// 而把一次真实变化吞掉，用户会觉得画像根本不长进，那正好摧毁了历史时间轴和
// 「画像更新了」这两个功能的全部价值。判不准就发版。
function portraitIsUnchanged(observation, prior) {
  if (!prior) return { unchanged: false, reason: '' };
  if (claimSet(prior).length) {
    return sameClaims(observation, prior)
      ? { unchanged: true, reason: 'claims_unchanged' }
      : { unchanged: false, reason: '' };
  }
  const similarity = textSimilarity(observation && observation.summary, prior.summary || prior.profileText);
  return similarity >= PORTRAIT_SAME_TEXT_SIMILARITY
    ? { unchanged: true, reason: 'text_unchanged' }
    : { unchanged: false, reason: '' };
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
    loadAllByOpenid('dream_entries', openid, 'createdAt').catch(function () { return []; }),
    loadAllByOpenid('life_notes', openid, 'createdAt').catch(function () { return []; }),
    db.collection('profile_snapshots').where({ openid: openid }).orderBy('updatedAt', 'desc').limit(MAX_HISTORY).get().catch(function () { return { data: [] }; }),
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
      // emotional_weather 是「一句话描述梦的情绪天气」——每个梦都是一句独一无二
      // 的散文。拿它做计数，任何一条的出现次数都只会是 1，于是「反复出现的情绪」
      // 实际上等于最近那个梦的天气句，却被当成这个人的情绪底色展示出来。
      // dream_facts.emotions 才是短标签（紧张、期待），能真正重复。
      emotionLabels: cleanStrings(
        (result.dream_facts && result.dream_facts.emotions) || dream.dreamFacts && dream.dreamFacts.emotions,
        3,
        12
      ),
      emotion: text(dream.emotionalWeather || result.emotional_weather, 100),
      discussion: discussionTexts(dream),
      createdAt: dream.createdAt || null,
      ref: sourceRef('dream_entries', dream)
    };
  }).filter(function (item) { return item.id && item.text; });
  const notes = (results[2] || []).map(function (note) {
    return {
      id: text(note._id, 80),
      text: text(note.text, 220),
      // 'dream_connection' = 用户在某条呼应上点过「是这样」；空 = 梦后对话里
      // 他自己讲出来的现实线索。两者的证据性质不同，见 promptEvidence。
      source: text(note.source, 40),
      createdAt: note.createdAt || null,
      ref: sourceRef('life_notes', note)
    };
  }).filter(function (item) { return item.id && item.text; });
  sortByDate(dreams);
  sortByDate(notes);
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
  const snapshotsResult = await db.collection('profile_snapshots').where({ openid: openid }).orderBy('updatedAt', 'desc').limit(MAX_HISTORY).get();
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
  });
  sources.notes.forEach(function (note) {
    refs.push(note.ref);
    contexts.push((note.source === 'dream_connection' ? '你确认过的呼应：' : '生活记录提到：') + note.text);
  });
  if (sources.dreams.length) traits.push('会留意并记录内在体验');
  if (sources.notes.length) traits.push('愿意把感受连接到现实生活');
  if (sources.notes.some(function (note) { return note.source === 'dream_connection'; })) {
    traits.push('会对别人给出的解释当场认下或否掉');
  }
  if (themes.length) traits.push('对反复出现的意象保持观察');
  if (!traits.length) traits.push('目前资料较少，等待更多用户主动提供的线索');
  const name = profile.nickname || '你';
  const recurringThemes = patterns.recurringThemes.filter(function (item) { return item.count >= 2; }).slice(0, 3).map(function (item) { return '“' + item.label + '”'; }).join('、');
  // 「你最近提到…」后面必须是用户自己说过的话。已确认的呼应是系统写的句子，
  // 引在这里就是把我们的措辞当成他的原话念回去，所以只从他自述的记录里取。
  const spokenNote = sources.notes.filter(function (note) { return note.source !== 'dream_connection'; })[0];
  const recentNote = spokenNote ? text(spokenNote.text, 80) : '';
  const emotion = patterns.recurringEmotions[0] ? patterns.recurringEmotions[0].label : '目前还无法判断';
  const priorUserEdit = snapshotUserEdit(sources.priorPortrait);
  // 阶段画像要回答的是「你是个怎样的人」，不是「你记了多少个梦」。
  //
  // 这里两次走错方向：最早说「素材不多」，记了三十个梦的用户当场就能证伪；
  // 改成「你已经记下 60 个梦」之后，假话没有了，但换成了一句数据播报——用户
  // 打开画像看到的是自己的使用统计，不是对自己的描述。梦的条数是系统的视角，
  // 不是这个人的样子。
  //
  // 兜底也必须是一段连续的话，不能是表单——分栏小标题正是把画像变成统计报告
  // 的那个东西。兜底做不到 AI 那样有风险的判断，但至少可以说一种倾向，而不是
  // 把统计念一遍。线上长期看到的若是这段文字，说明 profileMemory 没配到
  // provider 凭据，那才是要先修的地方。
  const openingState = recentNote
    ? '你最近提到“' + recentNote + '”，它还在你心里没有过去。'
    : recurringThemes
      ? '你反复回到同一批画面，它们对你还没有过去。'
      : sources.dreams.length >= 3
        ? '你的梦目前还各走各的，没有稳定重复的线索——没有模式，本身也是一种阶段状态。'
        : '你正在开始留下可供理解自己的线索。';
  // emotion 是短标签，但用户编辑过的旧数据仍可能带着句号结尾，直接往下拼会
  // 渲染成「…显影。；这只是…」。先剥掉结尾标点。
  const emotionLabel = String(emotion).replace(/[。．.；;，,]+$/, '');
  const emotionClause = patterns.recurringEmotions[0]
    ? '这些梦里最常留下来的感受是' + emotionLabel + '。'
    : '';
  const summary = priorUserEdit && priorUserEdit.summary
    ? String(priorUserEdit.summary).trim().slice(0, 500)
    : (name + '，' + openingState + emotionClause
      + '这只是当前资料里的有限观察，你可以修改或忽略它。').slice(0, 300);
  return {
    summary: summary,
    traits: cleanStrings(traits, 5, 80),
    themes: cleanStrings(themes, 3, 40),
    realLifeContext: cleanStrings(contexts, 5, 140),
    sourceRefs: sortByDate(refs).slice(0, 18),
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

// 阶段画像要回答「这个人是怎样的」，不是「系统统计到了什么」。
//
// 四个固定小标题把它变成了一张表单，而人不是表单：用户打开画像，读到的是
// 当下的状态/反复出现的主题/情绪的底色/正在变化的——一份分栏的统计报告。
// 现在只要一段连续的话。
const PORTRAIT_FORM_PATTERN = /当下的状态：|反复出现的主题：|情绪的底色：|正在变化的：/;
// 「你已经记下 60 个梦」是使用统计，不是这个人的样子。梦的条数是系统的视角。
const PORTRAIT_STATISTIC_PATTERN = /\d+\s*个梦|第\s*\d+\s*次|共\s*\d+/;

function portraitSummary(value, fallback) {
  const source = text(String(value == null ? '' : value).replace(/\s+/g, ' ').trim(), 400);
  if (!source) return fallback.summary;
  if (PORTRAIT_FORM_PATTERN.test(source)) return fallback.summary;
  if (PORTRAIT_STATISTIC_PATTERN.test(source)) return fallback.summary;
  return source;
}

function normalizeObservation(raw, fallback) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const traits = cleanStrings(raw.traits, 5, 80);
  const themes = cleanStrings(raw.themes, 3, 40);
  const contexts = cleanStrings(raw.realLifeContext, 5, 140);
  return {
    summary: isMetaSummary(raw.summary) ? fallback.summary : portraitSummary(raw.summary, fallback),
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
    'summary 是一段连续的话，最多 200 字，不分栏、不加小标题、不列清单。它要回答的是「这个人是怎样的」，不是「这个人最近梦见了什么」。整体替换旧画像，不能追加或逐条复述素材。',
    // 原来写的是「约150-200字」。下限就是填充引擎：材料只够两句锐利判断时，
    // 模型会用放之四海皆准的话把剩下的篇幅填满，于是画像的质量总是单调递减
    // ——前面是真观察，后面是车轱辘话。字数从来不是这份画像的目标。
    '字数是上限，不是目标。材料只够支撑两句判断，就只写两句；把篇幅填满而说了普适的话，比写得短严重得多。宁可短到像没写完，也不要用「大家都成立」的句子凑长度。',
    '梦境内容是你用来观察这个人的窗口，不是画像的正文。严禁转述、复述或改写任何一个梦的场景、角色或情节——不论是罗列式（「火球、青蛙、金币」）还是叙事式（「你梦见阳台上长出一棵树」）。用户已经知道自己梦见了什么；他打开画像是想看到关于自己这个人的判断。每一句话的主语应该是这个人的倾向、习惯、状态或处境，不是他的梦。',
    '判断标准只有一条：把这段话换到另一个用户身上，如果依然成立，就是没写好。罗列意象词永远不成立这条标准，因为任何做过同类梦的人都对得上。',
    '说倾向，不说清单：意象是原料不是结论，不得罗列意象词，不得复述梦境场景，不得出现梦的条数、次数或任何使用统计——那是系统的视角，不是这个人的样子。从梦境推断出来的倾向可以写，但只写推断结果，不铺垫原始场景作为佐证。把梦里的景物换成抽象说法再用回来，仍然是复述——它只是把画面换了层皮，读者依旧只读到梦，读不到自己。',
    '必须具体到可以被否定：提出一个用户可能会想反驳的判断。判断的依据是他的梦境和生活记录，但画像里只写结论，不写「因为你梦见了X所以你是Y」的推导过程。用户可以修改或忽略这份画像，所以宁可说错，不要说空。',
    // 「读完云里雾里」不是玄学，它有具体来源。上一版画像里「仿佛在等待某种内在
    // 的转变」「对自己的内在资源有一种模糊的熟悉感」这类句子，每一个限定词都在
    // 抽走一点具体性，抽到最后没有任何东西可以被指认——读者说不出它到底讲了
    // 自己什么。所以这里禁的是含糊，不是善意。
    '不许含糊。「似乎、仿佛、某种、一种、也许、可能」这类模糊限定词整段最多用一次；一句话里同时出现两个，这句话就是空的。',
    '不许用没有具体所指的抽象名词充当判断的核心：「内在资源」「潜意识」「某种转变」「未被记起的部分」「生命力」这类词，读者无法指认它们在自己生活里对应什么。要写的是他身上具体的倾向、反应和处境。',
    '不许用「在A与B之间」「既…又…」这类对偶排比来制造深度感。它读起来像结论，其实什么都没断言。',
    '至少有一处判断要落在他生活里具体的那件事上，并且用他自己会用的说法，不要升格成类别名词——他说的是「不想干只想躺着」，就不要写成「内在动力的停滞」。',
    '不要每句话都以「你」开头。整段句式雷同是这份画像读起来像机器写的主要原因之一。',
    '写完做一次检验：用户读完，能不能用他自己的话复述出「它说我是一个怎样的人」。复述不出来，说明这段话没有可指认的内容，重写。',
    '可以有温度——这份画像本来就该让人觉得被看见，被准确地说中本身就是情绪价值。要禁止的是含糊，不是善意：模糊的赞美给不了任何东西，具体的观察才给得了。',
    '严禁复用本提示中出现过的任何示例措辞或句式。本提示只描述标准，不提供可以照抄的句子；出现照抄即视为未完成。',
    '重点放在当前阶段：最近正在发生什么、和之前有什么不同，而不是全部历史的汇总。',
    '可以对用户的内心作出判断——那正是这份画像存在的意义——但必须是提出，不是宣告。判据只有一个：用户能不能当场说「不对」。从梦里具体细节推出来的判断可以被他否定，合格；以他自己无法核对的口吻宣布他内心真正在想什么（例如声称自己知道他的潜意识在传达什么），在结构上就无法被反驳，不合格。',
    '准确优先于舒适。不得为了让用户读着受用而挑更温和的说法，也不得把每一处观察都收束成正在变好。如果材料指向一个不好受的判断，就如实写出来；一份每句话都在肯定用户的画像，是另一种形式的空话。',
    '不预测未来，不断吉凶，不做医疗、创伤或人格障碍层面的诊断。',
    '以下是用户亲手修改过的自我描述，其含义必须完整保留并融入新画像，不得丢弃或反驳；它是最高权重输入。忽略寒暄和无现实落点的猜测。',
    // 用户点「是这样」的那些句子，是这套系统里唯一一次他主动说「对」，权重必须
    // 高。但它们又是我们上一轮自己写出来的话，照抄回画像等于把自己的措辞当成
    // 他的原话，画像会在自己的回声里越写越确信。所以：信它指向的那件事，不信
    // 它的句子。
    'userConfirmedConnections 是用户在解读中逐条点头确认过的呼应，可信度高于其他证据，因为那是他主动认下的。但这些句子是系统写的，不是用户的原话：只采信它们指向的那个状态，严禁整句复述或沿用其措辞和比喻；也不得因为用户确认过就把它当成已成定论，画像仍然是可被他否定的观察。',
    '只返回 JSON：{"summary":"一段连续的画像正文","traits":[],"themes":[],"realLifeContext":[],"changeReason":""}。',
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
  const list = sortByDate(Array.isArray(refs) ? refs.slice() : []).slice(0, 18);
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

// 游离的旧草稿必须归入历史，否则 getState 会一直把它当作待确认版本报出来。
// 这件事和「这次发不发新版本」无关：抑制版本时也要清，否则草稿会一直挂着。
// 刻意放在关键事务之外——它不参与当前版本的裁决，状态文档才是那把锁，而
// CloudBase 事务只允许 doc 操作。
async function supersedeOrphanDrafts(portraitHistory, supersededByVersion, now) {
  return Promise.all((portraitHistory || []).filter(function (item) {
    return item && item.status === 'draft';
  }).map(function (item) {
    return db.collection('profile_snapshots').doc(item._id).update({ data: {
      status: 'superseded', isCurrent: false, supersededAt: now,
      supersededByVersion: supersededByVersion, updatedAt: now
    } }).catch(function () { return null; });
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
      const fingerprint = evidenceFingerprint(expectedSources);
      // 用户在界面上主动点了「重新梳理」。他明确要一次新的解读，所以即使证据
      // 没变也照常调用供应商——模型不是确定性的，可能真的写出不一样的东西。
      // 但结果仍然要过闸②：跑一次不等于必须发一版。
      const forced = event && event.force === true;
      const prior = sources.priorPortrait;
      // 旧版本的模板文案（V7 及更早）必须被替换掉，这条路径不参与任何抑制。
      const priorIsLegacy = !!prior && isMetaSummary(prior.summary || prior.profileText);
      const priorFingerprint = text(prior && prior.sourceFingerprint, 80);

      // 闸①：喂给画像的东西一个字没变，就既不该发新版本，也不该再花一次
      // 供应商调用。这条路径覆盖绝大多数后台刷新（每记一个梦都会触发一次）。
      if (!forced && !priorIsLegacy && prior && priorFingerprint && priorFingerprint === fingerprint) {
        await supersedeOrphanDrafts(sources.portraitHistory, Number(prior.version || 0), new Date());
        return {
          ok: true,
          snapshot: await decorateSnapshot(openid, prior),
          unchanged: true,
          unchangedReason: 'evidence_unchanged'
        };
      }

      const generated = await generateObservation(sources);
      const now = new Date();
      const observation = generated.observation;
      const priorUserEdit = snapshotUserEdit(sources.priorPortrait);
      const requestedReason = text(event && event.changeReason, 220);
      const checkedSources = await sourcesStillCurrent(openid, expectedSources);
      if (!checkedSources) return { ok: false, reason: 'sources_changed', retryable: true };

      // 闸②：证据变了（比如多了一个梦），但这一版说的还是同一件事。就地把证据
      // 指纹和溯源刷新掉——后续解读要用最新的 sourceRefs——但不动版本号。
      const sameness = prior && !priorIsLegacy
        ? portraitIsUnchanged(observation, prior)
        : { unchanged: false, reason: '' };
      if (sameness.unchanged) {
        await supersedeOrphanDrafts(checkedSources.portraitHistory, Number(prior.version || 0), now);
        await db.collection('profile_snapshots').doc(prior._id).update({ data: {
          sourceRefs: observation.sourceRefs,
          sourceCounts: observation.sourceCounts,
          baseProfile: observation.baseProfile,
          sourceFingerprint: fingerprint,
          updatedAt: now
        } }).catch(function () { return null; });
        const refreshed = await findOwned(openid, prior._id);
        return {
          ok: true,
          snapshot: await decorateSnapshot(openid, refreshed || prior),
          unchanged: true,
          unchangedReason: sameness.reason,
          provider: generated.provider,
          fallback: generated.fallback
        };
      }

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
          // 下一次生成据此判断「证据变没变」。缺这个字段的旧快照会走正常生成，
          // 不会被误判成无变化。
          sourceFingerprint: fingerprint,
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
      await supersedeOrphanDrafts(checkedSources.portraitHistory, created.version, now);
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
