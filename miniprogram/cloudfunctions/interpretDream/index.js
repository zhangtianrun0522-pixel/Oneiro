const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const locationResolver = require('./locationResolver');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 18000;
const PROMPT_VERSION = 'oneiro-grounded-reading-v0.3.0';
const SCHEMA_VERSION = 'dream-entry-v0.2';

const DREAM_CHAT_SYSTEM_PROMPT = [
  '你是 Oneiro，正在和用户只围绕当前这个梦继续对话。',
  '必须具体回应用户刚说的内容和梦里已知细节，不要转成泛用陪聊。',
  '可以提出一种可能理解，但必须保留不确定性，不得虚构用户的现实经历或历史记忆。',
  '不做医疗、创伤、人格、关系或职业诊断，不预测命运。',
  '回复 2-4 句话，最后最多只问一个容易回答的问题。',
  '只返回纯文本，不要 markdown。'
].join('\n');

const SYSTEM_PROMPT = [
  '你是 Oneiro，一个谨慎、有边界的梦境观察者。',
  '先从原文提取可核对的梦中事实，不得把象征解释写成事实，也不得改写用户的原梦。',
  '解读必须具体引用当次梦里的人物、场景、物件、行动或情绪，提出 2-3 个可被用户否定的现实关联假设。',
  '证据弱时要明确说“可能”、“也可能只是偶然”或“目前还不足以下结论”。',
  '不得虚构用户未提供的个人经历、历史记忆或背景信息，不预测命运，不做医疗、创伤、关系、职业或人格诊断。',
  '禁止在任何输出字段中出现以下词语：四柱、八字、日主、五行、排盘、命盘、命理、命格、运势、吉凶、注定、必然。',
  '只问一个与当次梦直接相关、容易回答的问题。',
  '只返回合法 JSON 对象，不要 markdown，不要代码块。',
  'JSON 字段必须包含：',
  '{',
  '  "title": "2-4字诗意梦卡标题",',
  '  "dream_facts": { "people": [], "places": [], "objects": [], "actions": [], "emotions": [], "time_sense": [] },',
  '  "symbols": ["3-5个梦中核心象征短词"],',
  '  "emotional_weather": "一句话描述梦的情绪天气",',
  '  "card_insight": "一句收藏卡摘要，必须引用一个梦中细节",',
  '  "dream_translation": "2-3句话复述梦中发生的事和情绪，不加推测",',
  '  "reading_hook": "一条有张力的观察：同时引用两个具体梦中细节，指出它们之间的矛盾或转折，禁止只写“压力很大”这类泛化句子",',
  '  "metaphysical_resonance": "按当前模板规则输出",',
  '  "metaphysical_basis": "按当前模板规则输出",',
  '  "underneath": "2-3句话解释可能的心理线索，至少引用两个梦中意象并保留不确定性",',
  '  "possible_connections": ["2-3个带不确定性、有梦中根据的现实关联假设"],',
  '  "mirror": "对 possible_connections 的简短总结",',
  '  "alternative_reading": "一种不把梦当成稳定特征的替代解释",',
  '  "integration_question": "一个围绕当次梦的可回答问题",',
  '  "one_small_act": "今天可做的一个小行动，不超过20字",',
  '  "image": "1-2句话描述梦卡画面",',
  '  "image_prompt": "英文视觉提示词，不超过60词；只描述竖版3:4内层塔罗插画，不要文字、边框、完整卡牌或海报",',
  '  "echo": "一句醒后余韵",',
  '  "omens": {',
  '    "lucky_color_name": "颜色中文名",',
  '    "reason": "一句解释"',
  '  }',
  '}'
].join('\n');

function buildInterpretationSystemPrompt(baziChart) {
  if (baziChart && baziChart.available) {
    return SYSTEM_PROMPT + '\n' + [
      '当前采用含出生节律的解读模板。',
      '整体篇幅分配约为：梦境叙事与现实关联 70%、文化梦象 20%、出生节律 10%。',
      '出生节律段落只能依据用户上下文中提供的确定性参考，以“出生节律”“内在气质底色”“象征元素”“东方文化视角”等文化表达书写，并与当次梦的两个具体细节建立谨慎呼应。',
      'metaphysical_resonance 输出出生节律与梦中细节的文化性呼应；metaphysical_basis 说明参考来源、精度和限制。两者都不得预测或下确定性结论。'
    ].join('\n');
  }

  return SYSTEM_PROMPT + '\n' + [
    '当前采用基础梦境解读模板，不得引入任何未提供的个人资料或背景推断。',
    'metaphysical_resonance 必须输出空字符串。',
    'metaphysical_basis 必须输出空字符串。'
  ].join('\n');
}

const symbolRules = [
  { label: '清水', titleWord: '潮', theme: 'tide', keywords: ['水', '海', '河', '湖', '雨'], meaning: '水代表正在浮上来的情绪、直觉和记忆。' },
  { label: '门', titleWord: '门', theme: 'threshold', keywords: ['门', '入口', '出口', '房间', '走廊'], meaning: '门代表阶段转换，也代表你对未知选择的试探。' },
  { label: '钥匙', titleWord: '钥', theme: 'threshold', keywords: ['钥匙', '锁', '打开', '密码'], meaning: '钥匙象征解决问题的线索，或你已经拥有但尚未使用的能力。' },
  { label: '追逐', titleWord: '影', theme: 'shadow', keywords: ['追', '跑', '逃', '躲', '怪物'], meaning: '追逐常把压力、未处理的责任或被压住的愿望具象化。' },
  { label: '坠落', titleWord: '坠', theme: 'falling', keywords: ['掉下', '坠落', '摔', '悬崖', '失重'], meaning: '坠落代表失控感，也可能是从旧支撑里脱落出来。' },
  { label: '学校', titleWord: '课', theme: 'archive', keywords: ['学校', '考试', '老师', '同学', '作业'], meaning: '学校让评价感、表现压力和旧身份重新浮现。' },
  { label: '家屋', titleWord: '屋', theme: 'hearth', keywords: ['家', '房子', '卧室', '厨房', '老家'], meaning: '家屋对应内在安全感、亲密关系和自我边界。' },
  { label: '月光', titleWord: '月', theme: 'moon', keywords: ['月', '月亮', '月光', '夜晚', '星星'], meaning: '月光代表直觉、梦性和那些尚未被白天语言解释的感受。' },
  { label: '鸟', titleWord: '羽', theme: 'moon', keywords: ['鸟', '飞', '翅膀', '羽毛'], meaning: '鸟象征表达、离开和更高视角。' },
  { label: '图书馆', titleWord: '书', theme: 'archive', keywords: ['书', '图书馆', '书架', '文字'], meaning: '书与图书馆代表记忆、知识系统和正在被整理的答案。' }
];

const themePriority = {
  shadow: 1,
  falling: 2,
  tide: 3,
  hearth: 4,
  archive: 5,
  threshold: 6,
  moon: 7,
  mist: 8
};

const allowedThemes = Object.keys(themePriority);

const db = cloud.database ? cloud.database() : null;

const zodiacs = [
  ['摩羯', '01-20'],
  ['水瓶', '02-19'],
  ['双鱼', '03-21'],
  ['白羊', '04-20'],
  ['金牛', '05-21'],
  ['双子', '06-22'],
  ['巨蟹', '07-23'],
  ['狮子', '08-23'],
  ['处女', '09-23'],
  ['天秤', '10-24'],
  ['天蝎', '11-23'],
  ['射手', '12-22'],
  ['摩羯', '12-32']
];

const highRiskPatterns = [
  {
    pattern: /自杀|轻生|不想活|结束生命|自残|伤害自己/,
    reason: 'self_harm',
    message: '这个梦里有很重的痛感。请先联系身边可信任的人，或当地紧急支持；Oneiro 暂不解读这类内容。'
  },
  {
    pattern: /杀人|杀了|伤害别人|报复|血腥/,
    reason: 'harm',
    message: '这个梦可能涉及高风险伤害内容。为了安全，Oneiro 暂不生成分享梦卡。'
  },
  {
    pattern: /诊断|得病|癌症|抑郁症|焦虑症|处方|吃药/,
    reason: 'medical',
    message: 'Oneiro 不能提供医疗或诊断判断。你可以改写成梦里的画面和感受，再抽取梦卡。'
  }
];

function compactText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function validateDreamText(value) {
  const text = compactText(value);
  let i;

  if (!text) {
    return { safe: false, reason: 'empty', message: '先写下一点梦' };
  }

  if (text.length < 6) {
    return { safe: false, reason: 'too_short', message: '再多写一点梦里的画面' };
  }

  if (text.length > 1200) {
    return { safe: false, reason: 'too_long', message: '梦太长了，先保留最重要的 1200 字以内' };
  }

  for (i = 0; i < highRiskPatterns.length; i += 1) {
    if (highRiskPatterns[i].pattern.test(text)) {
      return {
        safe: false,
        reason: highRiskPatterns[i].reason,
        message: highRiskPatterns[i].message
      };
    }
  }

  return { safe: true, reason: '', message: '' };
}

function containsAny(text, keywords) {
  return keywords.some(function (keyword) {
    return text.indexOf(keyword) !== -1;
  });
}

function pickSymbols(text) {
  const matches = symbolRules.filter(function (rule) {
    return containsAny(text, rule.keywords);
  });

  if (!matches.length) {
    matches.push({
      label: '未命名场景',
      titleWord: '梦',
      theme: 'mist',
      meaning: '这个梦的重点不在具体物件，而在它留下的整体感受。'
    });
  }

  return matches.slice(0, 5);
}

function pickThemeSymbol(symbols) {
  return symbols.slice().sort(function (a, b) {
    return (themePriority[a.theme] || themePriority.mist) - (themePriority[b.theme] || themePriority.mist);
  })[0];
}

function zodiacFor(birthDate) {
  const parts = String(birthDate || '').split('-');
  const monthDay = parts.length >= 3 ? parts[1] + '-' + parts[2] : '01-01';
  let i;

  for (i = 0; i < zodiacs.length; i += 1) {
    if (monthDay < zodiacs[i][1]) {
      return zodiacs[i][0];
    }
  }

  return '摩羯';
}

function titleFor(symbols) {
  return symbols.length >= 2 ? symbols[0].titleWord + symbols[1].titleWord : symbols[0].titleWord + '牌';
}

function compactDream(text) {
  const cleaned = String(text || '').replace(/\s+/g, '');
  return cleaned.length > 42 ? cleaned.slice(0, 42) + '...' : cleaned;
}

function asString(value, fallback, maxLength) {
  const limit = maxLength || 700;
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, limit);
}

function sanitizeMetaphysicalText(value, fallback, maxLength) {
  const limit = maxLength || 700;
  const text = typeof value === 'string' ? value.trim() : '';

  if (/四柱|八字|日主|五行|排盘|命盘|命理|命格|运势|吉凶|注定|必然/.test(text)) {
    return '';
  }

  return (text || fallback || '').slice(0, limit);
}

function asStringArray(value, fallback, maxItems, maxLength) {
  const limit = maxLength || 80;
  const items = Array.isArray(value)
    ? value.filter(function (item) {
        return typeof item === 'string' && item.trim();
      }).map(function (item) {
        return item.trim().slice(0, limit);
      }).slice(0, maxItems)
    : [];

  return items.length ? items : fallback.slice(0, maxItems);
}

function normalizeDreamFacts(rawFacts, dreamText, symbols) {
  const raw = rawFacts && typeof rawFacts === 'object' ? rawFacts : {};
  const text = String(dreamText || '');
  const labels = Array.isArray(symbols) ? symbols : [];
  const facts = {
    people: asStringArray(raw.people, [], 6, 30),
    places: asStringArray(raw.places, [], 6, 40),
    objects: asStringArray(raw.objects, [], 6, 40),
    actions: asStringArray(raw.actions, [], 6, 50),
    emotions: asStringArray(raw.emotions, [], 6, 30),
    time_sense: asStringArray(raw.time_sense || raw.timeSense, [], 6, 30)
  };

  if (!facts.places.length) facts.places = labels.filter(function (item) { return /学校|家屋|图书馆|清水/.test(item); });
  if (!facts.objects.length) facts.objects = labels.filter(function (item) { return /钥匙|门|月光|鸟/.test(item); });
  if (!facts.actions.length) facts.actions = labels.filter(function (item) { return /追逐|坠落/.test(item); });
  ['妈妈', '爸爸', '父亲', '母亲', '同学', '老师', '陌生人'].forEach(function (item) {
    if (text.indexOf(item) >= 0 && facts.people.indexOf(item) < 0 && facts.people.length < 6) facts.people.push(item);
  });
  ['害怕', '紧张', '焦虑', '难过', '安心', '平静', '孤独', '兴奋', '愤怒'].forEach(function (item) {
    if (text.indexOf(item) >= 0 && facts.emotions.indexOf(item) < 0 && facts.emotions.length < 6) facts.emotions.push(item);
  });
  ['清晨', '白天', '黄昏', '夜晚', '深夜', '小时候'].forEach(function (item) {
    if (text.indexOf(item) >= 0 && facts.time_sense.indexOf(item) < 0 && facts.time_sense.length < 6) facts.time_sense.push(item);
  });

  return facts;
}

function normalizeTheme(value, fallback) {
  return allowedThemes.indexOf(value) >= 0 ? value : fallback;
}

function buildBaziChart(profile) {
  const safeProfile = profile || {};
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(safeProfile.birthDate || ''));
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(safeProfile.birthTime || ''));
  const location = locationResolver.resolveBirthPlace(safeProfile.birthPlace);

  if (!dateMatch || !timeMatch || !location) {
    return {
      available: false,
      precision: !dateMatch || !timeMatch ? 'insufficient_input' : 'location_unresolved',
      summary: !dateMatch || !timeMatch
        ? '出生日期或时间不完整，本次不生成出生节律参考。'
        : '出生城市无法识别，本次不生成出生节律参考。',
      basis: !dateMatch || !timeMatch
        ? '可填写公历出生年月日、时间和出生城市，用于生成出生节律参考。'
        : '可填写可识别的出生城市，例如“青岛”或“山东青岛”；不使用模型猜测坐标。'
    };
  }

  try {
    const Solar = require('lunar-javascript').Solar;
    const corrected = locationResolver.correctToTrueSolarTime(
      safeProfile.birthDate,
      safeProfile.birthTime,
      location
    );

    if (!corrected.ok) {
      return {
        available: false,
        precision: 'correction_error',
        summary: '背景计算暂时失败，本次不生成出生节律参考。',
        basis: '出生时间或地点计算失败，不使用语言模型猜测结果。'
      };
    }

    const solar = Solar.fromYmdHms(
      Number(corrected.date.slice(0, 4)),
      Number(corrected.date.slice(5, 7)),
      Number(corrected.date.slice(8, 10)),
      Number(corrected.time.slice(0, 2)),
      Number(corrected.time.slice(3, 5)),
      0
    );
    const lunar = solar.getLunar();
    const eightChar = lunar.getEightChar();
    eightChar.setSect(2);
    const pillars = {
      year: eightChar.getYear(),
      month: eightChar.getMonth(),
      day: eightChar.getDay(),
      time: eightChar.getTime()
    };
    const fiveElements = {
      year: eightChar.getYearWuXing(),
      month: eightChar.getMonthWuXing(),
      day: eightChar.getDayWuXing(),
      time: eightChar.getTimeWuXing()
    };

    return {
      available: true,
      precision: 'true_solar_time',
      calculationVersion: 'bazi-v0.3-true-solar',
      calendar: 'solar',
      timezone: location.timezone,
      timezoneRule: location.timezoneRule,
      location: {
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        input: location.input
      },
      sourceCivilTime: {
        date: safeProfile.birthDate,
        time: safeProfile.birthTime
      },
      correctedSolarTime: {
        date: corrected.date,
        time: corrected.time,
        equationOfTimeMinutes: corrected.equationOfTimeMinutes,
        longitudeCorrectionMinutes: corrected.longitudeCorrectionMinutes,
        totalCorrectionMinutes: corrected.totalCorrectionMinutes
      },
      pillars: pillars,
      dayMaster: eightChar.getDayGan(),
      fiveElements: fiveElements,
      tenGods: {
        year: eightChar.getYearShiShenGan(),
        month: eightChar.getMonthShiShenGan(),
        day: eightChar.getDayShiShenGan(),
        time: eightChar.getTimeShiShenGan()
      },
      summary: '出生节律参考已生成',
      basis: '依据公历出生日期、时间和出生城市完成背景计算 · 仅作东方文化参考',
      birthPlace: String(safeProfile.birthPlace || '')
    };
  } catch (error) {
    return {
      available: false,
      precision: 'calculation_error',
      summary: '出生节律参考暂时不可用。',
      basis: '背景计算暂时失败，不使用语言模型猜测结果。'
    };
  }
}

function buildDreamMemory(records) {
  const entries = Array.isArray(records) ? records.slice() : [];
  const symbolCounts = {};
  const themeCounts = {};
  const recent = [];

  entries.sort(function (a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  entries.slice(0, 30).forEach(function (entry) {
    const result = entry && entry.result ? entry.result : {};
    const symbols = Array.isArray(entry.symbols) && entry.symbols.length ? entry.symbols : result.symbols || [];
    const theme = String(entry.cardTheme || result.card_theme || '');

    var uniqueSymbols = new Set();
    symbols.slice(0, 8).forEach(function (symbol) {
      var key = String(symbol || '').trim();
      if (key) uniqueSymbols.add(key);
    });
    uniqueSymbols.forEach(function (symbol) {
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
    });
    if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1;
  });

  entries.slice(0, 5).forEach(function (entry) {
    const result = entry && entry.result ? entry.result : {};
    recent.push({
      date: entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : '',
      title: String(result.title || ''),
      symbols: (Array.isArray(entry.symbols) && entry.symbols.length ? entry.symbols : result.symbols || []).slice(0, 5),
      emotionalWeather: String(entry.emotionalWeather || result.emotional_weather || '').slice(0, 160),
      translation: String(result.dream_translation || '').slice(0, 180)
    });
  });

  const recurringSymbols = Object.keys(symbolCounts)
    .filter(function (key) { return symbolCounts[key] >= 2; })
    .sort(function (a, b) { return symbolCounts[b] - symbolCounts[a]; })
    .slice(0, 8)
    .map(function (symbol) { return { symbol: symbol, count: symbolCounts[symbol] }; });
  const recurringThemes = Object.keys(themeCounts)
    .sort(function (a, b) { return themeCounts[b] - themeCounts[a]; })
    .slice(0, 4)
    .map(function (theme) { return { theme: theme, count: themeCounts[theme] }; });

  return {
    dreamCount: entries.length,
    symbolCounts: symbolCounts,
    recurringSymbols: recurringSymbols,
    recurringThemes: recurringThemes,
    recent: recent,
    hasPattern: entries.length >= 3 && recurringSymbols.length > 0
  };
}

async function loadDreamMemory(openid) {
  if (!db || !openid) return buildDreamMemory([]);

  try {
    const response = await db.collection('dream_entries').where({ openid: openid }).limit(30).get();
    return buildDreamMemory(response && response.data ? response.data : []);
  } catch (error) {
    return buildDreamMemory([]);
  }
}

async function loadLifeNote(openid) {
  if (!db || !openid) return null;

  try {
    var response = await db.collection('life_notes')
      .where({ openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    var note = response && response.data && response.data.length ? response.data[0] : null;

    if (!note) return null;

    return {
      text: String(note.text || '').trim(),
      sourceDreamId: note.sourceDreamId,
      createdAt: note.createdAt
    };
  } catch (error) {
    return null;
  }
}

function isLifeNoteRelevant(lifeNote, dreamText, symbols) {
  if (!lifeNote) return false;

  var noteText = String(lifeNote.text || '').trim();
  var currentDreamText = String(dreamText || '').trim();
  var phrases = noteText.split(/[，。！？、；：\s]+/).map(function (item) {
    return String(item || '').trim();
  }).filter(function (item) {
    return item.length >= 2;
  });
  var symbolList = Array.isArray(symbols) ? symbols : [];
  var phraseMatched = phrases.some(function (phrase) {
    return currentDreamText.indexOf(phrase) !== -1;
  });
  var symbolMatched = symbolList.some(function (symbol) {
    var key = String(symbol || '').trim();
    return !!key && noteText.indexOf(key) !== -1;
  });

  return phraseMatched || symbolMatched;
}

function normalizeAiResult(raw, dreamText, profile, cardIndex, sourceLabel, memory, baziChart, lifeNote) {
  const dreamSymbols = pickSymbols(dreamText);
  const labels = dreamSymbols.map(function (symbol) {
    return symbol.label;
  });
  const themeSymbol = pickThemeSymbol(dreamSymbols);
  const nickname = String(profile.nickname || '你');
  const primary = dreamSymbols[0];
  const secondary = dreamSymbols[1] || dreamSymbols[0];
  const rawOmens = raw && raw.omens ? raw.omens : {};
  const symbols = asStringArray(raw && raw.symbols, labels, 5, 32);
  const dreamFacts = normalizeDreamFacts(raw && raw.dream_facts, dreamText, symbols);
  const dreamPreview = compactDream(dreamText);
  const dreamMemory = memory || buildDreamMemory([]);
  var symbolMilestones = [];
  var milestoneSymbols = new Set();
  var relevantLifeNote;

  symbols.forEach(function (symbol) {
    var key = String(symbol || '').trim();
    if (key) milestoneSymbols.add(key);
  });
  milestoneSymbols.forEach(function (symbol) {
    var historicalCount = dreamMemory.symbolCounts && dreamMemory.symbolCounts[symbol]
      ? Number(dreamMemory.symbolCounts[symbol])
      : 0;
    var totalCount = historicalCount + 1;

    if (totalCount >= 2) {
      symbolMilestones.push({ symbol: symbol, count: totalCount });
    }
  });
  symbolMilestones.sort(function (a, b) {
    return b.count - a.count;
  });
  symbolMilestones = symbolMilestones.slice(0, 1);
  relevantLifeNote = isLifeNoteRelevant(lifeNote, dreamText, symbols) ? lifeNote : null;
  const chartAvailable = !!(baziChart && baziChart.available);
  const chartElements = chartAvailable && baziChart.fiveElements
    ? Object.keys(baziChart.fiveElements).map(function (key) {
      return baziChart.fiveElements[key];
    }).filter(Boolean).join('、')
    : '';
  const mirrorFallback = '这个梦可能与近期的压力、选择或安全感有关，也可能只是偶然的梦中组合；目前还不足以下结论。';
  const metaphysicalBasisFallback = chartAvailable
    ? '出生节律 · ' + baziChart.summary + ' · ' + baziChart.basis + ' · 仅作东方文化观察，不作预测。'
    : '';
  const metaphysicalResonanceFallback = chartAvailable
    ? '从“' + baziChart.dayMaster + '”所映照的内在气质底色与' + chartElements + '等象征元素看，梦里的“' + labels.slice(0, 2).join('”与“') + '”像是在提醒你留意当下的感受变化；这只是一个东方文化视角，也可能只是梦中细节的偶然组合。'
    : '';
  const memoryFallback = dreamMemory.dreamCount
    ? '这是你的第' + String(dreamMemory.dreamCount + 1) + '次梦境记录。' +
      (dreamMemory.recurringSymbols.length
        ? '过去反复出现的梦象包括' + dreamMemory.recurringSymbols.slice(0, 3).map(function (item) { return item.symbol; }).join('、') + '；本次需要继续观察它们是否发生了变化。'
        : '目前还没有足够稳定的重复符号，Oneiro 会继续积累你的梦境脉络。')
    : '这是梦境记忆的起点。记录满三次后，Oneiro 会开始识别反复出现的符号、情绪和现实主题。';

  return {
    title: asString(raw && raw.title, titleFor(dreamSymbols), 24),
    card_no: 'NO. ' + String(cardIndex).padStart(3, '0'),
    card_theme: normalizeTheme(raw && raw.card_theme, themeSymbol.theme || 'mist'),
    card_theme_label: asString(raw && raw.card_theme_label, themeSymbol.label, 24),
    dream_facts: dreamFacts,
    bazi_chart: baziChart || { available: false, precision: 'missing' },
    profile_summary: nickname + ' · ' + (sourceLabel || '梦境记忆'),
    symbols: symbols,
    symbol_milestones: symbolMilestones,
    referenced_life_note: relevantLifeNote ? {
      text: relevantLifeNote.text,
      sourceDreamId: String(relevantLifeNote.sourceDreamId || ''),
      sourceDate: relevantLifeNote.createdAt ? new Date(relevantLifeNote.createdAt).toISOString().slice(0, 10) : ''
    } : null,
    emotional_weather: asString(
      raw && raw.emotional_weather,
      '这组梦象像一层刚亮起的晨雾，正在把你的压力、直觉和选择感慢慢显影。',
      180
    ),
    oracle: asString(
      raw && raw.oracle,
      '这次解读只是对当次梦的一种可能理解，你可以保留、修正或否定它。',
      360
    ),
    card_insight: asString(
      raw && raw.card_insight,
      '这张牌提醒你先看见“' + primary.label + '”背后的真实需要，再决定今天要回应什么。',
      360
    ),
    dream_translation: asString(
      raw && raw.dream_translation,
      '你写下的梦像是这样一组画面：“' + dreamPreview + '”。其中' + labels.join('、') + '构成了主要梦象。',
      700
    ),
    reading_hook: asString(
      raw && raw.reading_hook,
      '这个梦最有张力的地方，是“' + labels.slice(0, 2).join('”和“') + '”同时出现：你似乎一边在靠近什么，一边又在保留退路。这个矛盾值得继续观察。',
      560
    ),
    metaphysical_resonance: chartAvailable
      ? sanitizeMetaphysicalText(
          raw && raw.metaphysical_resonance,
          metaphysicalResonanceFallback,
          700
        )
      : '',
    metaphysical_basis: chartAvailable
      ? sanitizeMetaphysicalText(
          raw && raw.metaphysical_basis,
          metaphysicalBasisFallback,
          360
        )
      : '',
    underneath: asString(
      raw && raw.underneath,
      dreamSymbols.map(function (symbol) {
        return symbol.meaning;
      }).join(' ') + '这些符号合在一起，说明梦正在把模糊感受变得可辨认。',
      900
    ),
    mirror: asString(
      raw && raw.mirror,
      mirrorFallback,
      700
    ),
    possible_connections: asStringArray(
      raw && raw.possible_connections,
      [asString(raw && raw.mirror, mirrorFallback, 700)],
      3,
      260
    ),
    alternative_reading: asString(
      raw && raw.alternative_reading,
      '也可能这只是几个梦中细节的偶然组合，不一定需要被理解成稳定的人格特征。',
      360
    ),
    memory_reflection: asString(raw && raw.memory_reflection, memoryFallback, 760),
    memory_evidence: asStringArray(
      raw && raw.memory_evidence,
      dreamMemory.recurringSymbols.slice(0, 3).map(function (item) {
        return item.symbol + '已出现' + item.count + '次';
      }),
      3,
      90
    ),
    memory_profile: dreamMemory,
    integration_question: asString(
      raw && raw.integration_question,
      '如果梦里的“' + primary.label + '”会替你说一句真话，它最想提醒你什么？',
      160
    ),
    one_small_act: asString(
      raw && raw.one_small_act,
      '今天从“' + secondary.label + '”这个符号开始，写下一句你想对自己承认的话。',
      48
    ),
    image: asString(
      raw && raw.image,
      '梦卡画面以' + labels.join('、') + '为核心，把梦里最强烈的情绪凝成一张可以收藏的象征图。',
      420
    ),
    image_prompt: asString(
      raw && raw.image_prompt,
      'surreal symbolic dream card, ' + labels.join(', ') + ', emotional atmosphere, vertical collectible oracle card',
      360
    ),
    echo: asString(raw && raw.echo, '今天适合给梦里的感觉一个现实中的小出口。', 220),
    omens: {
      lucky_color_name: asString(rawOmens.lucky_color_name, '云雾色', 24),
      reason: asString(rawOmens.reason, '这组梦象适合被轻轻辨认，而不是立刻下结论。', 220)
    }
  };
}

function buildStaticResult(dreamText, profile, cardIndex, memory, baziChart, lifeNote) {
  return normalizeAiResult({}, dreamText, profile, cardIndex, '云端梦卡', memory, baziChart, lifeNote);
}

function buildUserContext(profile, dreamText, memory, baziChart, lifeNote) {
  const parts = [];
  const dreamMemory = memory || buildDreamMemory([]);
  const boundedMemory = {
    dreamCount: dreamMemory.dreamCount,
    recurringSymbols: dreamMemory.recurringSymbols.slice(0, 3),
    recent: dreamMemory.recent.slice(0, 3)
  };

  if (profile.nickname) parts.push('用户称呼：' + profile.nickname);
  parts.push('今日日期：' + new Date().toISOString().slice(0, 10));
  parts.push('最多 3 条历史观察（只有具体重复时才可谨慎参考）：' + JSON.stringify(boundedMemory));
  if (baziChart && baziChart.available) {
    parts.push('出生节律参考（只能解释，不得自行补算或预测）：' + JSON.stringify(baziChart));
  }
  if (lifeNote) {
    parts.push('用户曾经明确确认过的真实情况（只能在明显相关时自然提及，不得判断对错，不得预测）：' + lifeNote.text);
  }
  parts.push('梦境原文：' + dreamText);

  return parts.join('\n');
}

function stripJsonFence(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseJsonResponse(text) {
  const cleaned = stripJsonFence(text);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;

  return JSON.parse(jsonText);
}

function providerConfig() {
  const provider = String(process.env.INTERPRET_PROVIDER || 'static').trim().toLowerCase();

  if (!provider || provider === 'static' || provider === 'cloudbase-static') {
    return { provider: 'static' };
  }

  if (provider === 'deepseek') {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: (process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, ''),
      model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
    };
  }

  if (provider === 'openai' || provider === 'openai-compatible') {
    return {
      provider: provider,
      apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY || process.env.AI_API_KEY || '',
      baseUrl: (process.env.OPENAI_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.AI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
      model: process.env.OPENAI_MODEL || process.env.OPENAI_COMPATIBLE_MODEL || process.env.AI_MODEL || DEFAULT_OPENAI_MODEL
    };
  }

  return { provider: provider, unsupported: true };
}

function publicProviderHealth() {
  const config = providerConfig();
  const timeoutMs = Number(process.env.INTERPRET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const strictAi = String(process.env.INTERPRET_STRICT_AI || '').trim() === '1';
  let hostname = '';

  if (config.baseUrl) {
    try {
      hostname = new URL(config.baseUrl).hostname;
    } catch (error) {
      hostname = 'invalid_base_url';
    }
  }

  return {
    ok: true,
    type: 'interpretDream.aiHealth',
    provider: config.provider === 'static' ? 'cloudbase-static' : config.provider,
    providerConfigured: config.provider !== 'static' && !config.unsupported && !!config.apiKey,
    hasApiKey: !!config.apiKey,
    model: config.model || '',
    baseUrlHost: hostname,
    requestTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
    strictAi: strictAi,
    supported: !config.unsupported,
    fallbackProvider: 'cloudbase-static-fallback'
  };
}

function postJson(urlString, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const url = new URL(urlString);
    const payload = JSON.stringify(body);
    const client = url.protocol === 'http:' ? http : https;
    const request = client.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }),
      timeout: timeoutMs
    }, function (response) {
      const chunks = [];

      response.on('data', function (chunk) {
        chunks.push(chunk);
      });

      response.on('end', function () {
        resolve({
          statusCode: response.statusCode || 0,
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('timeout', function () {
      request.destroy(new Error('AI provider request timed out'));
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function callOpenAiCompatible(config, profile, dreamText, memory, baziChart, lifeNote) {
  const timeoutMs = Number(process.env.INTERPRET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const response = await postJson(config.baseUrl + '/chat/completions', {
    Authorization: 'Bearer ' + config.apiKey
  }, {
    model: config.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildInterpretationSystemPrompt(baziChart) },
      { role: 'user', content: buildUserContext(profile, dreamText, memory, baziChart, lifeNote) }
    ],
    temperature: 0.78
  }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('AI provider HTTP ' + response.statusCode + ': ' + response.text.slice(0, 180));
  }

  const data = JSON.parse(response.text);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';

  if (!content) {
    throw new Error('AI provider response did not include message content');
  }

  return parseJsonResponse(content);
}

async function interpretWithAi(profile, dreamText, cardIndex, memory, baziChart, lifeNote) {
  const config = providerConfig();

  if (config.provider === 'static') {
    return {
      provider: 'cloudbase-static',
      model: 'deterministic-local',
      result: buildStaticResult(dreamText, profile, cardIndex, memory, baziChart, lifeNote)
    };
  }

  if (config.unsupported) {
    throw new Error('Unsupported INTERPRET_PROVIDER: ' + config.provider);
  }

  if (!config.apiKey) {
    throw new Error('Missing API key for INTERPRET_PROVIDER=' + config.provider);
  }

  const raw = await callOpenAiCompatible(config, profile, dreamText, memory, baziChart, lifeNote);

  return {
    provider: config.provider,
    model: config.model || '',
    result: normalizeAiResult(raw, dreamText, profile, cardIndex, 'AI 梦卡', memory, baziChart, lifeNote)
  };
}

function normalizeChatHistory(value) {
  return Array.isArray(value) ? value.slice(-12).map(function (item) {
    return {
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: asString(item && item.content, '', 800)
    };
  }).filter(function (item) { return item.content; }) : [];
}

function chatResultSummary(value) {
  const result = value && typeof value === 'object' ? value : {};
  return {
    title: asString(result.title, '', 30),
    symbols: asStringArray(result.symbols, [], 5, 30),
    dreamTranslation: asString(result.dream_translation, '', 700),
    possibleConnections: asStringArray(result.possible_connections, [], 3, 260),
    openingQuestion: asString(result.integration_question, '', 180)
  };
}

function staticChatReply(event) {
  const summary = chatResultSummary(event && event.dreamResult);
  const symbol = summary.symbols[0] || '这个画面';
  const message = asString(event && event.userMessage, '', 500);
  return '我先沿着你刚才说的“' + message.slice(0, 40) + '”往下看。' +
    '这可能让梦里的“' + symbol + '”多了一层现实感，也可能只是你醒后正在赋予它意义。' +
    '如果再回到那个画面，你最想停在哪一刻？';
}

async function runDreamChat(event) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const userMessage = asString(event && event.userMessage, '', 500);
  const history = normalizeChatHistory(event && event.messages);
  const summary = chatResultSummary(event && event.dreamResult);
  const timeoutMs = Number(process.env.INTERPRET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  let i;

  if (!dreamText || !userMessage) {
    return { ok: false, reason: 'missing_chat_context', message: '先写下你想说的内容。' };
  }
  for (i = 0; i < highRiskPatterns.length; i += 1) {
    if (highRiskPatterns[i].pattern.test(userMessage)) {
      return { ok: false, blocked: true, reason: highRiskPatterns[i].reason, message: highRiskPatterns[i].message };
    }
  }

  if (config.provider === 'static' || config.unsupported || !config.apiKey) {
    return { ok: true, provider: 'cloudbase-static', fallback: true, reply: staticChatReply(event) };
  }

  try {
    const response = await postJson(config.baseUrl + '/chat/completions', {
      Authorization: 'Bearer ' + config.apiKey
    }, {
      model: config.model,
      messages: [
        { role: 'system', content: DREAM_CHAT_SYSTEM_PROMPT },
        { role: 'system', content: '当前梦境原文：' + dreamText + '\n当前解读摘要：' + JSON.stringify(summary) }
      ].concat(history).concat([{ role: 'user', content: userMessage }]),
      temperature: 0.62
    }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    const data = JSON.parse(response.text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? asString(data.choices[0].message.content, '', 1200)
      : '';

    if (response.statusCode < 200 || response.statusCode >= 300 || !content) {
      throw new Error('Dream chat provider failed');
    }
    return { ok: true, provider: config.provider, model: config.model || '', fallback: false, reply: content };
  } catch (error) {
    return {
      ok: true,
      provider: 'cloudbase-static-fallback',
      fallback: true,
      provider_error: error && error.message ? error.message.slice(0, 180) : 'unknown_error',
      reply: staticChatReply(event)
    };
  }
}

async function runAiSmokeTest(event) {
  const config = providerConfig();
  const dreamText = String((event && event.dreamText) || '我梦见在月光下的图书馆找到一把银色钥匙').trim();
  const profile = event && event.profile
    ? event.profile
    : { nickname: 'Oneiro', birthDate: '1998-01-01' };
  const cardIndex = Number((event && event.cardIndex) || 1);
  const safety = validateDreamText(dreamText);
  let raw;
  let result;

  if (!safety.safe) {
    return {
      ok: false,
      type: 'interpretDream.aiSmokeTest',
      blocked: true,
      reason: safety.reason,
      message: safety.message
    };
  }

  if (config.provider === 'static') {
    return {
      ok: false,
      type: 'interpretDream.aiSmokeTest',
      provider: 'cloudbase-static',
      providerConfigured: false,
      reason: 'static_provider',
      message: 'AI provider is not configured.'
    };
  }

  if (config.unsupported) {
    return {
      ok: false,
      type: 'interpretDream.aiSmokeTest',
      provider: config.provider,
      providerConfigured: false,
      reason: 'unsupported_provider',
      message: 'Unsupported INTERPRET_PROVIDER.'
    };
  }

  if (!config.apiKey) {
    return {
      ok: false,
      type: 'interpretDream.aiSmokeTest',
      provider: config.provider,
      providerConfigured: false,
      reason: 'missing_api_key',
      message: 'Missing API key for configured provider.'
    };
  }

  try {
    const baziChart = null;
    const memory = buildDreamMemory([]);
    raw = await callOpenAiCompatible(config, profile, dreamText, memory, baziChart);
    result = normalizeAiResult(raw, dreamText, profile, cardIndex, 'AI 梦卡', memory, baziChart);

    return {
      ok: true,
      type: 'interpretDream.aiSmokeTest',
      provider: config.provider,
      providerConfigured: true,
      title: result.title,
      cardTheme: result.card_theme,
      symbolCount: result.symbols.length,
      cardNo: result.card_no,
      fallback: false
    };
  } catch (error) {
    return {
      ok: false,
      type: 'interpretDream.aiSmokeTest',
      provider: config.provider,
      providerConfigured: true,
      reason: 'provider_error',
      message: error && error.message ? error.message.slice(0, 180) : 'unknown_error'
    };
  }
}

exports.main = async function (event) {
  const dreamText = String((event && event.dreamText) || '').trim();
  const profile = event && event.profile ? event.profile : {};
  const cardIndex = Number((event && event.cardIndex) || 1);
  const strictAi = String(process.env.INTERPRET_STRICT_AI || '').trim() === '1';
  const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};
  const baziChart = buildBaziChart(profile);
  let memory;
  let safety;

  if (event && event.healthCheck) {
    return publicProviderHealth();
  }

  if (event && event.smokeTest) {
    return runAiSmokeTest(event);
  }

  if (event && event.chatAboutDream) {
    return runDreamChat(event);
  }

  safety = validateDreamText(dreamText);

  if (!safety.safe) {
    return {
      ok: false,
      blocked: true,
      reason: safety.reason,
      message: safety.message
    };
  }

  memory = await loadDreamMemory(wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  var lifeNote = await loadLifeNote(wxContext && wxContext.OPENID ? wxContext.OPENID : '');

  try {
    const interpreted = await interpretWithAi(profile, dreamText, cardIndex, memory, baziChart, lifeNote);

    return {
      ok: true,
      provider: interpreted.provider,
      model: interpreted.model || '',
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      result: interpreted.result
    };
  } catch (error) {
    if (strictAi) {
      return {
        ok: false,
        blocked: false,
        reason: 'ai_provider_error',
        message: 'AI 解读暂时不可用，请稍后再试。'
      };
    }

    return {
      ok: true,
      provider: 'cloudbase-static-fallback',
      model: 'deterministic-local',
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      provider_error: error && error.message ? error.message.slice(0, 180) : 'unknown_error',
      result: buildStaticResult(dreamText, profile, cardIndex, memory, baziChart, lifeNote)
    };
  }
};
