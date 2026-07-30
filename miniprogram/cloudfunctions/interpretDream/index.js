const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const locationResolver = require('./locationResolver');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
// Full grounded readings include the birth-rhythm context and a larger JSON
// response. The previous 18s deadline regularly cut off otherwise healthy
// requests before the model response could be validated.
const DEFAULT_TIMEOUT_MS = 30000;
const PROMPT_VERSION = 'oneiro-grounded-reading-v0.9.0';
const SCHEMA_VERSION = 'dream-entry-v0.2';

function effectiveTimeoutMs() {
  const configured = Number(process.env.INTERPRET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  // Keep an accidentally stale 18s environment value from overriding the
  // safer full-reading budget. CloudBase's function budget remains 60s.
  return Number.isFinite(configured) && configured > DEFAULT_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

const STEM_ELEMENT = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水'
};
const STEM_POLARITY = {
  '甲': '阳', '乙': '阴', '丙': '阳', '丁': '阴', '戊': '阳',
  '己': '阴', '庚': '阳', '辛': '阴', '壬': '阳', '癸': '阴'
};
const HIDDEN_STEMS_BY_BRANCH = {
  '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'],
  '卯': ['乙'], '辰': ['戊', '乙', '癸'], '巳': ['丙', '戊', '庚'],
  '午': ['丁', '己'], '未': ['己', '丁', '乙'], '申': ['庚', '壬', '戊'],
  '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
};
const GENERATING_ELEMENT = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' };
const PRODUCED_ELEMENT = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLLED_ELEMENT = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
const BRANCH_RELATION_PAIRS = {
  '六合': ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'],
  '六冲': ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'],
  '六害': ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'],
  '六破': ['子酉', '丑辰', '寅亥', '卯午', '巳申', '未戌']
};

const DREAM_CHAT_SYSTEM_PROMPT = [
  '你是 Oneiro，正在和用户只围绕当前这个梦继续对话。',
  '对话目标不是给出更多玄学结论，而是把梦里的画面、醒来后的感受与用户愿意确认的现实线索连接起来。',
  '必须具体回应用户刚说的内容和梦里已知细节，不要转成泛用陪聊。',
  '按这个顺序灵活推进：先追问一个可观察的梦中细节，再问醒来时的身体或情绪感受，最后才邀请用户联系最近现实中的一件具体小事。',
  '每次只问一个容易回答的问题，优先问“发生了什么、你感到什么、最近有没有类似场景”，不要连续追问“为什么”。',
  '可以提出一种可能理解，但必须标注为可能性，区分梦中事实、用户感受和待确认的现实关联，不得虚构用户的现实经历或历史记忆。',
  '不要把任何聊天内容自动写成长期记忆；只有用户明确点击确认后，才可视为已确认的现实线索。',
  '不做医疗、创伤、人格、关系或职业诊断，不预测命运。',
  '回复 2-4 句话，先复述一个具体线索，再给出一层克制的可能理解，最后最多只问一个容易回答的问题。',
  '只返回纯文本，不要 markdown。'
].join('\n');

const DREAM_REFINE_SYSTEM_PROMPT = [
  '你是 Oneiro。用户已经看过一版梦境解读，并回答了一个与梦相关的问题。',
  '请只根据原梦、初版摘要和用户回答，把梦卡收束成一版更贴近用户的最终成果。',
  '不得把用户没有确认的推测写成事实，不预测命运，不做诊断。',
  '只返回合法 JSON：{"final_card_insight":"不超过120字","personal_connection":"不超过220字","final_title":"2-4字"}。'
].join('\n');

const SYSTEM_PROMPT = [
  '你是 Oneiro，一个敏锐、有边界的梦境观察者。',
  '先从原文提取可核对的梦中事实，不得把象征解释写成事实，也不得改写用户的原梦。',
  '解读必须具体引用当次梦里的人物、场景、物件、行动或情绪，提出 2-3 个可被用户否定的现实关联假设。',
  '使用有画面感、具体且有辨识度的语言，让每个判断都能在当次梦的细节中找到落点。',
  '不得虚构用户未提供的个人经历、历史记忆或背景信息，不预测命运，不做医疗、创伤、关系、职业或人格诊断。',
  '禁止在任何输出字段中出现以下词语：四柱、八字、日主、五行、排盘、命盘、命理、命格、运势、吉凶、注定、必然。',
  '只问一个与当次梦直接相关、容易回答的问题。',
  '视觉规划必须做减法：只选1个主事件、最多1个异常规则、2-4个关键元素和最多1个隐藏象征，复杂梦境总共不超过7个可识别元素。',
  '视觉元素优先级：主事件 > 异常规则 > 情绪相关元素 > 用户反复提及元素 > 普通环境细节；不得为了神秘感添加原梦中没有的月亮、钥匙、花藤、眼睛或神秘符号。',
  '构图必须偏置、不对称，并明确35%-50%呼吸空间；不要默认人物居中，不要默认蓝色，不要把所有名词逐项画出。',
  '只返回合法 JSON 对象，不要 markdown，不要代码块。',
  'JSON 字段必须包含：',
  '{',
  '  "title": "2-4字诗意梦卡标题",',
  '  "card_theme": "shadow|falling|tide|hearth|archive|threshold|moon|mist 之一，由模型根据本梦选择",',
  '  "card_theme_label": "直接取自梦境原文的一个主题短词",',
  '  "dream_facts": { "people": [], "places": [], "objects": [], "actions": [], "transitions": [], "emotions": [], "time_sense": [] },',
  '  "symbols": ["3-5个梦中核心象征短词"],',
  '  "emotional_weather": "一句话描述梦的情绪天气",',
  '  "oracle": "一句克制的可能性提醒，不预测、不诊断",',
  '  "card_insight": "一句收藏卡摘要，必须引用一个梦中细节",',
  '  "dream_translation": "2-3句话复述梦中发生的事和情绪，不加推测",',
  '  "reading_hook": "一条有张力的观察：同时引用两个具体梦中细节，指出它们之间的矛盾或转折，禁止只写“压力很大”这类泛化句子",',
  '  "cultural_symbolism": "2-3句话，只从传统梦文化、东方象征或神话意象提供集体文化层面的解释，必须同时落在当次梦的具体符号及其变化关系上；不要分析用户本人，不要写近期压力或现实经历，不预测吉凶",',
  '  "metaphysical_resonance": "按当前模板规则输出",',
  '  "metaphysical_basis": "按当前模板规则输出",',
  '  "metaphysical_reading": { "temperament": "这次梦被调动的内在底色（不要重复固定命盘摘要）", "dream_echo": "出生节律与本梦具体意象的呼应", "tension": "出生节律与梦中行动之间的拉扯或转化", "rhythm": "基于本梦的当下行动节奏建议", "basis": "内部计算记录，不写进用户正文" },',
  '  "underneath": "3-4句话展开这一次梦的个人心理线索：必须先引用两个梦中具体细节，再说明它们如何彼此呼应、拉扯或转折，最后给出一个带不确定性的现实关联假设（要落到工作、关系、项目、等待、选择、边界或承担等可识别议题）；不要使用传统梦文化、民俗、神话或‘某象征通常代表’的字典式表达，也不要只写‘值得观察’。",',
  '  "possible_connections": ["2-3个现实关联假设：每条都要同时包含梦中证据、一个具体生活议题和可被用户否定的条件，不得只写‘压力、选择、安全感’等抽象词"],',
  '  "mirror": "对 possible_connections 的简短总结",',
  '  "alternative_reading": "一种不把梦当成固定自我特征的理解角度",',
  '  "integration_question": "一个围绕当次梦的可回答问题",',
  '  "one_small_act": "今天可做的一个小行动，不超过20字",',
  '  "image": "1-2句话描述梦卡画面",',
  '  "image_prompt": "英文视觉摘要，不超过60词；只描述梦中主事件与关键元素，不写固定画风",',
  '  "visual_plan": {',
  '    "main_event": "梦里最重要且可被画出的一个事件",',
  '    "emotion": ["1-3个主情绪"],',
  '    "emotion_intensity": 0.8,',
  '    "setting": "一个主要场景",',
  '    "characters": [{"role":"主体","description":"只写梦中明确出现的人物及动作","importance":1.0}],',
  '    "objects": [{"name":"梦中物体","importance":0.8,"visualizable":true}],',
  '    "anomalies": ["只保留一个最重要的现实规则破坏"],',
  '    "symbols": ["只来自梦境或用户已确认记忆的象征"],',
  '    "memory_elements": ["只写用户明确提供或确认的个人历史元素"],',
  '    "preserve_elements": ["筛选后必须进入画面的2-4个关键元素"],',
  '    "hidden_symbol": "一个只出现一次的隐藏象征；没有则为空",',
  '    "composition": {',
  '      "template": "off_center_diagonal|threshold_depth|cropped_closeup|split_distance|low_horizon|vertical_drift",',
  '      "subject_position": "主体偏置与裁切方式",',
  '      "visual_flow": "一条主视觉动线",',
  '      "spatial_layers": "前景、中景、远景疏密安排",',
  '      "negative_space": "35%-50%的呼吸空间安排"',
  '    }',
  '  },',
  '  "echo": "一句醒后余韵",',
  '  "omens": {',
  '    "lucky_color_name": "颜色中文名",',
  '    "reason": "一句解释"',
  '  }',
  '}',
  '如果原文写的是“雨”或“暴雨”，必须保留原词，不得改写成“清水”“水面”或其他原文没有的水体；如果梦里只有一个事件或一个明确细节，不要为了凑两个细节而发明人物、物件或动作。'
].join('\n');

function buildInterpretationSystemPrompt(baziChart) {
  if (baziChart && baziChart.available) {
    return SYSTEM_PROMPT + '\n' + [
      '当前采用含出生节律的解读模板。',
      '整体篇幅可参考：梦境叙事与现实关联约 65%、文化梦象约 20%、出生节律约 15%；不必机械控制字数，要让出生节律部分成为完整、有诚意的解读段落。',
      '出生节律段落只能依据用户上下文中已提供的参考，以“出生节律”“内在气质底色”“象征元素”“东方文化视角”等文化表达书写。',
      'metaphysical_resonance 要直接对用户说话，使用有镜头感的比喻和具体意象，至少引用当次梦里的两个细节，并分别说明它们如何承接、拉扯或转化用户的内在气质底色；避免“留意感受变化”“关注内心”这类可套用在任何梦上的空泛句子。',
      'metaphysical_basis 要简洁说明参考来源、时间精度与解读范围，并点明这些线索具体照亮了梦里的哪种情绪纹理或行动节奏。',
      'metaphysical_reading 必须分别填写 temperament、dream_echo、tension、rhythm、basis；dream_echo 和 tension 必须引用当次梦的具体细节，并解释它们与你可能的现实应对方式有什么关系；rhythm 必须给出带时间、数量或边界的当下动作，不得只写“留意感受”，也不得预测未来。',
      'temperament 不要重复固定的命盘摘要、干支、藏干或元素清单；只写这次梦调动了出生节律中的哪一面，并引用当次梦的具体变化。basis 是内部计算记录，不要把排盘依据写成用户正文。',
      '文化象征与心理视角必须明显区分：文化象征写共同文化语境，心理视角写这次梦里具体细节之间的个人张力；两段不得互相改写。遇到“环境 + 天气变化 + 生长/出现”的梦，文化象征要解释三者合在一起的传统意象，心理视角要解释变化发生时梦者如何承接它。',
      '梦中事实必须逐字受原文约束：原文只有“雨/暴雨”时不得输出“清水”；原文没有的人物、物件、第二个细节、积水或水体不得补写。若原文只有一个清晰细节，宁可承认信息有限，也不要套用“另一处保持不动的场景”。',
      '不得使用禁用词，不得预测命运或具体未来事件，不得虚构用户经历，也不得把文化象征写成已经证实的事实。'
    ].join('\n');
  }

  return SYSTEM_PROMPT + '\n' + [
    '当前采用基础梦境解读模板，不得引入任何未提供的个人资料或背景推断。',
    'metaphysical_resonance 必须输出空字符串。',
    'metaphysical_basis 必须输出空字符串。'
  ].join('\n');
}

const allowedThemes = ['shadow', 'falling', 'tide', 'hearth', 'archive', 'threshold', 'moon', 'mist'];

const db = cloud.database ? cloud.database() : null;

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

function normalizeGroundedSymbols(value, dreamText) {
  const source = String(dreamText || '');
  const items = Array.isArray(value) ? value.filter(function (item) {
    const candidate = String(item || '').trim();
    if (!candidate) return false;
    return source.indexOf(candidate) !== -1;
  }) : [];
  return asStringArray(items, [], 5, 32);
}

function repairDreamTerms(value, dreamText) {
  const source = String(dreamText || '');
  let text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';

  if (!source.includes('另一个人')) {
    text = text.replace(/另一个人|第二个人|另一个细节/g, '这处梦中细节');
  }
  return text;
}

function groundedFactArray(value, dreamText, maxItems, maxLength) {
  const source = String(dreamText || '');
  const candidates = asStringArray(value, [], maxItems || 6, maxLength || 50).map(function (item) {
    return repairDreamTerms(item, source);
  });
  const grounded = candidates.filter(function (item) {
    if (!item) return false;
    if (source.indexOf(item) !== -1) return true;
    const compact = item.replace(/[“”"'‘’]/g, '');
    return source.indexOf(compact) !== -1 || compact.split(/[，。！？、；：s]+/).some(function (part) {
      return part.length >= 2 && source.indexOf(part) !== -1;
    });
  });
  return grounded;
}

function normalizeDreamFacts(rawFacts, dreamText) {
  const raw = rawFacts && typeof rawFacts === 'object' ? rawFacts : {};
  const text = String(dreamText || '');
  return {
    people: groundedFactArray(raw.people, text, 6, 30),
    places: groundedFactArray(raw.places, text, 6, 40),
    objects: groundedFactArray(raw.objects, text, 6, 40),
    actions: groundedFactArray(raw.actions, text, 6, 50),
    transitions: groundedFactArray(raw.transitions || raw.events, text, 3, 120),
    emotions: asStringArray(raw.emotions, [], 6, 30),
    time_sense: asStringArray(raw.time_sense || raw.timeSense, [], 6, 30)
  };
}

function normalizeTheme(value, fallback) {
  return allowedThemes.indexOf(value) >= 0 ? value : fallback;
}

const visualCompositionIds = [
  'off_center_diagonal',
  'threshold_depth',
  'cropped_closeup',
  'split_distance',
  'low_horizon',
  'vertical_drift'
];

function asWeightedCharacters(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    if (typeof item === 'string') {
      return { role: '人物', description: asString(item, '', 80), importance: 0.7 };
    }
    return {
      role: asString(item && item.role, '人物', 24),
      description: asString(item && item.description, '', 100),
      importance: Math.min(1, Math.max(0, Number(item && item.importance) || 0.7))
    };
  }).filter(function (item) {
    return item.description;
  }).sort(function (a, b) {
    return b.importance - a.importance;
  }).slice(0, 4);
}

function asWeightedObjects(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    if (typeof item === 'string') {
      return { name: asString(item, '', 60), importance: 0.6, visualizable: true };
    }
    return {
      name: asString(item && item.name, '', 60),
      importance: Math.min(1, Math.max(0, Number(item && item.importance) || 0.6)),
      visualizable: item && item.visualizable !== false
    };
  }).filter(function (item) {
    return item.name;
  }).sort(function (a, b) {
    return b.importance - a.importance;
  }).slice(0, 8);
}

function uniqueVisualElements(value, maxItems) {
  const seen = {};
  return (Array.isArray(value) ? value : []).map(function (item) {
    return asString(item, '', 80);
  }).filter(function (item) {
    const key = item.toLowerCase();
    if (!item || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, maxItems);
}

function normalizeVisualPlan(rawPlan, dreamText, dreamFacts, symbols) {
  const raw = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
  const facts = dreamFacts || {};
  const characters = asWeightedCharacters(raw.characters);
  const objects = asWeightedObjects(raw.objects);
  const emotions = asStringArray(raw.emotion || raw.emotions, facts.emotions || [], 3, 30);
  const anomalies = asStringArray(raw.anomalies || [raw.anomaly], [], 1, 120);
  const rawComposition = raw.composition && typeof raw.composition === 'object' ? raw.composition : {};
  const requestedComposition = asString(rawComposition.template || rawComposition.id, '', 40);
  const compositionId = visualCompositionIds.indexOf(requestedComposition) >= 0
    ? requestedComposition
    : 'off_center_diagonal';
  const candidates = [];

  asStringArray(raw.preserve_elements || raw.visual_elements, [], 4, 80).forEach(function (item) {
    candidates.push(item);
  });
  characters.forEach(function (item) { candidates.push(item.description); });
  objects.filter(function (item) { return item.visualizable; }).forEach(function (item) { candidates.push(item.name); });
  ['people', 'objects', 'places'].forEach(function (key) {
    (Array.isArray(facts[key]) ? facts[key] : []).forEach(function (item) { candidates.push(item); });
  });
  (Array.isArray(symbols) ? symbols : []).forEach(function (item) { candidates.push(item); });

  const preserveElements = uniqueVisualElements(candidates, 4);
  const visualSymbols = uniqueVisualElements(raw.symbols || symbols, 5);
  const hiddenSymbol = asString(raw.hidden_symbol, '', 80);
  const actions = Array.isArray(facts.actions) ? facts.actions : [];
  const transitions = Array.isArray(facts.transitions) ? facts.transitions : [];
  const places = Array.isArray(facts.places) ? facts.places : [];
  const normalizedCharacters = characters.length ? characters : (facts.people || []).slice(0, 3).map(function (item, index) {
    return { role: index === 0 ? '主体' : '人物', description: item, importance: index === 0 ? 1 : 0.7 };
  });
  const normalizedObjects = objects.length ? objects : (facts.objects || []).slice(0, 4).map(function (item, index) {
    return { name: item, importance: Math.max(0.55, 0.9 - index * 0.1), visualizable: true };
  });

  return {
    version: 'oneiro-visual-plan-v1',
    raw_text: String(dreamText || '').slice(0, 1200),
    main_event: asString(raw.main_event || raw.mainEvent, transitions[0] || actions[0] || '', 180),
    emotion: emotions,
    emotion_intensity: Math.min(1, Math.max(0, Number(raw.emotion_intensity || raw.emotionIntensity) || 0.65)),
    setting: asString(raw.setting, places[0] || '', 100),
    characters: normalizedCharacters,
    objects: normalizedObjects,
    anomalies: anomalies,
    symbols: visualSymbols,
    memory_elements: asStringArray(raw.memory_elements, [], 3, 80),
    preserve_elements: preserveElements,
    hidden_symbol: hiddenSymbol,
    composition: {
      template: compositionId,
      subject_position: asString(rawComposition.subject_position, '', 160),
      visual_flow: asString(rawComposition.visual_flow, '', 180),
      spatial_layers: asString(rawComposition.spatial_layers, '', 180),
      negative_space: asString(rawComposition.negative_space, '保留约40%低密度呼吸空间', 120)
    }
  };
}

function callEightChar(eightChar, methodName, fallback) {
  try {
    return eightChar && typeof eightChar[methodName] === 'function'
      ? eightChar[methodName]()
      : fallback;
  } catch (error) {
    return fallback;
  }
}

function callMethod(target, methodName, args, fallback) {
  try {
    return target && typeof target[methodName] === 'function'
      ? target[methodName].apply(target, Array.isArray(args) ? args : [])
      : fallback;
  } catch (error) {
    return fallback;
  }
}

function normalizeBirthGender(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm' || normalized === '男' || normalized === '1') return 'male';
  if (normalized === 'female' || normalized === 'f' || normalized === '女' || normalized === '0') return 'female';
  return '';
}

function solarYmd(value) {
  if (!value) return '';
  return String(callMethod(value, 'toYmd', [], '') || callMethod(value, 'toYmdHms', [], '') || '');
}

function buildLuckCycles(eightChar, gender) {
  const normalizedGender = normalizeBirthGender(gender);
  if (!normalizedGender) {
    return { available: false, reason: 'gender_missing', cycles: [] };
  }

  // lunar-javascript uses 1 for male and 0 for female in getYun(gender, sect).
  const genderCode = normalizedGender === 'male' ? 1 : 0;
  const yun = callMethod(eightChar, 'getYun', [genderCode, 2], null);
  if (!yun) {
    return { available: false, reason: 'engine_method_unavailable', gender: normalizedGender, cycles: [] };
  }

  const startSolar = callMethod(yun, 'getStartSolar', [], null);
  const rawCycles = callMethod(yun, 'getDaYun', [8], []);
  const cycles = (Array.isArray(rawCycles) ? rawCycles : []).slice(0, 8).map(function (item, index) {
    return {
      index: Number(callMethod(item, 'getIndex', [], index) || index),
      ganZhi: String(callMethod(item, 'getGanZhi', [], '') || ''),
      startAge: Number(callMethod(item, 'getStartAge', [], 0) || 0),
      endAge: Number(callMethod(item, 'getEndAge', [], 0) || 0),
      startYear: Number(callMethod(item, 'getStartYear', [], 0) || 0),
      endYear: Number(callMethod(item, 'getEndYear', [], 0) || 0),
      xunKong: String(callMethod(item, 'getXunKong', [], '') || '')
    };
  }).filter(function (item) {
    return item.ganZhi || item.startYear || item.startAge;
  });

  return {
    available: true,
    gender: normalizedGender,
    genderCode: genderCode,
    direction: callMethod(yun, 'isForward', [], null),
    start: {
      years: Number(callMethod(yun, 'getStartYear', [], 0) || 0),
      months: Number(callMethod(yun, 'getStartMonth', [], 0) || 0),
      days: Number(callMethod(yun, 'getStartDay', [], 0) || 0),
      hours: Number(callMethod(yun, 'getStartHour', [], 0) || 0),
      solarDate: solarYmd(startSolar)
    },
    cycles: cycles
  };
}

function normalizeChartArray(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[、,\s]+/).map(function (item) { return item.trim(); }).filter(Boolean);
  }
  return [];
}

function normalizeHiddenStemArray(value, fallback) {
  const stems = Array.isArray(value) ? value : String(value || '').split('');
  const normalized = stems.map(function (item) {
    return String(item || '').trim();
  }).filter(function (item) {
    return !!STEM_ELEMENT[item];
  });
  return normalized.length ? normalized : (Array.isArray(fallback) ? fallback.slice() : []);
}

function buildBranchRelations(pillars) {
  const order = ['year', 'month', 'day', 'time'];
  const branches = order.map(function (key) {
    const pillar = String(pillars[key] || '');
    return { key: key, branch: pillar.slice(-1) };
  });
  const relations = [];
  Object.keys(BRANCH_RELATION_PAIRS).forEach(function (type) {
    BRANCH_RELATION_PAIRS[type].forEach(function (pair) {
      const first = pair.slice(0, 1);
      const second = pair.slice(1, 2);
      const hits = branches.filter(function (item) { return item.branch === first || item.branch === second; });
      if (hits.length >= 2) {
        relations.push({ type: type, branches: [first, second], pillars: hits.map(function (item) { return item.key; }) });
      }
    });
  });
  return relations;
}

function buildStemRelations(pillars) {
  const order = ['year', 'month', 'day', 'time'];
  const stems = order.map(function (key) {
    return { key: key, stem: String(pillars[key] || '').slice(0, 1) };
  });
  const combinations = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
  const clashes = ['甲庚', '乙辛', '丙壬', '丁癸'];
  const result = [];
  combinations.forEach(function (pair) {
    const hits = stems.filter(function (item) { return pair.indexOf(item.stem) >= 0; });
    if (hits.length >= 2) result.push({ type: '天干五合', stems: pair.split(''), pillars: hits.map(function (item) { return item.key; }) });
  });
  clashes.forEach(function (pair) {
    const hits = stems.filter(function (item) { return pair.indexOf(item.stem) >= 0; });
    if (hits.length >= 2) result.push({ type: '天干相冲', stems: pair.split(''), pillars: hits.map(function (item) { return item.key; }) });
  });
  return result;
}

function buildChartProfile(pillars, fiveElements, tenGods, dayMaster, extras) {
  const extra = extras || {};
  const elementCounts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const hiddenElementCounts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const pillarOrder = ['year', 'month', 'day', 'time'];
  const pillarLabels = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };
  const hiddenStems = {};

  pillarOrder.forEach(function (key) {
    String(fiveElements[key] || '').split('').forEach(function (char) {
      if (Object.prototype.hasOwnProperty.call(elementCounts, char)) elementCounts[char] += 1;
    });
    const pillar = String(pillars[key] || '');
    const branch = pillar.slice(-1);
    hiddenStems[key] = normalizeHiddenStemArray((extra.hiddenStems && extra.hiddenStems[key]), HIDDEN_STEMS_BY_BRANCH[branch] || []);
    hiddenStems[key].forEach(function (stem) {
      const element = STEM_ELEMENT[stem];
      if (element) hiddenElementCounts[element] += 1;
    });
  });

  const totalElementCounts = Object.keys(elementCounts).reduce(function (result, element) {
    result[element] = elementCounts[element] + hiddenElementCounts[element];
    return result;
  }, {});
  const rankedElements = Object.keys(totalElementCounts).sort(function (a, b) {
    return totalElementCounts[b] - totalElementCounts[a] || ['木', '火', '土', '金', '水'].indexOf(a) - ['木', '火', '土', '金', '水'].indexOf(b);
  });
  const maxCount = totalElementCounts[rankedElements[0]] || 0;
  const minCount = totalElementCounts[rankedElements[rankedElements.length - 1]] || 0;
  const presentElements = rankedElements.filter(function (element) {
    return totalElementCounts[element] > 0;
  });
  const missingElements = rankedElements.filter(function (element) {
    return totalElementCounts[element] === 0;
  });
  const balanceLabel = maxCount - minCount <= 1
    ? '分布较均衡'
    : maxCount - minCount === 2
      ? '有明显偏重'
      : '偏重较明显';

  const dayMasterElement = STEM_ELEMENT[dayMaster] || '';
  const supportElement = GENERATING_ELEMENT[dayMasterElement] || '';
  const producedElement = PRODUCED_ELEMENT[dayMasterElement] || '';
  const controlledElement = CONTROLLED_ELEMENT[dayMasterElement] || '';
  const supportCount = (totalElementCounts[dayMasterElement] || 0) + (totalElementCounts[supportElement] || 0);
  const drainCount = (totalElementCounts[producedElement] || 0) + (totalElementCounts[controlledElement] || 0);
  const strengthSignal = supportCount - drainCount > 1 ? '扶助偏多' : supportCount - drainCount < -1 ? '消耗偏多' : '扶助与消耗接近';

  return {
    dayMasterElement: dayMasterElement,
    dayMasterPolarity: STEM_POLARITY[dayMaster] || '',
    elementCounts: elementCounts,
    hiddenElementCounts: hiddenElementCounts,
    totalElementCounts: totalElementCounts,
    dominantElements: presentElements.slice(0, 2),
    missingElements: missingElements,
    balanceLabel: balanceLabel,
    hiddenStems: hiddenStems,
    hiddenStemTenGods: extra.hiddenStemTenGods || {},
    branchTenGods: extra.branchTenGods || {},
    strengthEvidence: {
      supportElements: [dayMasterElement, supportElement].filter(Boolean),
      drainElements: [producedElement, controlledElement].filter(Boolean),
      supportCount: supportCount,
      drainCount: drainCount,
      signal: strengthSignal,
      rule: '以日主同类与生扶元素，对照泄耗与克制元素；未纳入大运流年，仅作静态结构证据。'
    },
    relations: {
      branches: buildBranchRelations(pillars),
      stems: buildStemRelations(pillars)
    },
    pillarDetails: pillarOrder.map(function (key) {
      const pillar = String(pillars[key] || '');
      return {
        key: key,
        label: pillarLabels[key],
        pillar: pillar,
        gan: pillar.slice(0, 1),
        zhi: pillar.slice(-1),
        element: String(fiveElements[key] || ''),
        tenGod: String(tenGods[key] || ''),
        hiddenStems: hiddenStems[key],
        hiddenTenGods: normalizeChartArray(extra.hiddenStemTenGods && extra.hiddenStemTenGods[key]),
        branchTenGod: String(extra.branchTenGods && extra.branchTenGods[key] || ''),
        naYin: String(extra.naYin && extra.naYin[key] || ''),
        diShi: String(extra.diShi && extra.diShi[key] || ''),
        xunKong: String(extra.xunKong && extra.xunKong[key] || '')
      };
    })
  };
}

function buildBaziChart(profile) {
  const safeProfile = profile || {};
  const birthGender = normalizeBirthGender(safeProfile.gender);
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
    const luckCycles = buildLuckCycles(eightChar, birthGender);
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
    const pillarKeys = ['year', 'month', 'day', 'time'];
    const hiddenStems = {};
    const hiddenStemTenGods = {};
    const branchTenGods = {};
    const naYin = {};
    const diShi = {};
    const xunKong = {};
    const methodSuffix = { year: 'Year', month: 'Month', day: 'Day', time: 'Time' };

    pillarKeys.forEach(function (key) {
      const suffix = methodSuffix[key];
      const pillar = String(pillars[key] || '');
      const branch = pillar.slice(-1);
      hiddenStems[key] = normalizeHiddenStemArray(
        callEightChar(eightChar, 'get' + suffix + 'HideGan', ''),
        HIDDEN_STEMS_BY_BRANCH[branch] || []
      );
      hiddenStemTenGods[key] = normalizeChartArray(callEightChar(eightChar, 'get' + suffix + 'ShiShenZhi', []));
      branchTenGods[key] = String(callEightChar(eightChar, 'get' + suffix + 'ShiShenZhi', '') || '');
      naYin[key] = String(callEightChar(eightChar, 'get' + suffix + 'NaYin', '') || '');
      diShi[key] = String(callEightChar(eightChar, 'get' + suffix + 'DiShi', '') || '');
      xunKong[key] = String(callEightChar(eightChar, 'get' + suffix + 'XunKong', '') || '');
    });

    return {
      available: true,
      precision: 'true_solar_time',
      calculationVersion: 'bazi-v0.6-engine',
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
      birthGender: birthGender,
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
      chartDetails: {
        hiddenStems: hiddenStems,
        hiddenStemTenGods: hiddenStemTenGods,
        branchTenGods: branchTenGods,
        naYin: naYin,
        diShi: diShi,
        xunKong: xunKong,
        luckCycles: luckCycles,
        lifePalaces: {
          taiYuan: String(callEightChar(eightChar, 'getTaiYuan', '') || ''),
          taiXi: String(callEightChar(eightChar, 'getTaiXi', '') || ''),
          mingGong: String(callEightChar(eightChar, 'getMingGong', '') || ''),
          shenGong: String(callEightChar(eightChar, 'getShenGong', '') || '')
        }
      },
      chartProfile: buildChartProfile(
        pillars,
        fiveElements,
        {
          year: eightChar.getYearShiShenGan(),
          month: eightChar.getMonthShiShenGan(),
          day: eightChar.getDayShiShenGan(),
          time: eightChar.getTimeShiShenGan()
        },
        eightChar.getDayGan(),
        {
          hiddenStems: hiddenStems,
          hiddenStemTenGods: hiddenStemTenGods,
          branchTenGods: branchTenGods,
          naYin: naYin,
          diShi: diShi,
          xunKong: xunKong
        }
      ),
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

async function loadLifeNote(openid, dreamText) {
  if (!db || !openid) return null;

  try {
    var response = await db.collection('life_notes')
      .where({ openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();
    var notes = response && response.data ? response.data : [];
    var note = notes.map(function (item) {
      return {
        text: String(item.text || '').trim(),
        sourceDreamId: item.sourceDreamId,
        createdAt: item.createdAt
      };
    }).find(function (item) {
      return isLifeNoteRelevant(item, dreamText, []);
    });

    if (!note) return null;
    return note;
  } catch (error) {
    return null;
  }
}

async function loadConfirmedPortrait(openid) {
  if (!db || !openid) return null;
  try {
    var stateResponse = await db.collection('profile_memory_state')
      .where({ openid: openid })
      .limit(1)
      .get()
      .catch(function () { return { data: [] }; });
    var memoryState = stateResponse && stateResponse.data && stateResponse.data[0];
    var portrait = null;
    if (memoryState && memoryState.currentSnapshotId) {
      var pointed = await db.collection('profile_snapshots')
        .where({ openid: openid, _id: memoryState.currentSnapshotId, status: 'confirmed' })
        .limit(1)
        .get();
      portrait = pointed && pointed.data && pointed.data[0];
    }
    if (!portrait) {
      var response = await db.collection('profile_snapshots')
        .where({ openid: openid, status: 'confirmed', isCurrent: true })
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get();
      portrait = response && response.data && response.data[0];
    }
    if (!portrait || portrait.stale === true || portrait.useInFutureReadings === false) return null;
    return {
      version: Number(portrait.version || 0),
      summary: asString(portrait.summary, '', 500),
      useInFutureReadings: true
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

function collectDreamDetails(dreamFacts, labels) {
  const facts = dreamFacts || {};
  const details = [];
  ['actions', 'places', 'objects', 'people', 'transitions'].forEach(function (key) {
    (Array.isArray(facts[key]) ? facts[key] : []).forEach(function (item) {
      const value = String(item || '').trim();
      if (value && details.indexOf(value) < 0) details.push(value);
    });
  });
  (Array.isArray(labels) ? labels : []).forEach(function (item) {
    const value = String(item || '').trim();
    if (value && details.indexOf(value) < 0) details.push(value);
  });
  return details.slice(0, 6);
}

const REAL_LIFE_CONNECTION_TERMS = ['工作', '项目', '关系', '家人', '伴侣', '创作', '学习', '等待', '选择', '决定', '边界', '资源', '承担', '任务', '消息', '压力'];

function hasDreamEvidence(text, dreamFacts, labels, minimum) {
  const content = String(text || '');
  const details = collectDreamDetails(dreamFacts, labels);
  const hits = details.filter(function (detail) {
    return detail && content.indexOf(detail) >= 0;
  });
  return hits.length >= (minimum || 2);
}

function hasRealLifeConnection(text) {
  const content = String(text || '');
  return REAL_LIFE_CONNECTION_TERMS.some(function (term) {
    return content.indexOf(term) >= 0;
  });
}

function groundedAnalysisText(value, dreamFacts, labels, options) {
  const config = options || {};
  const candidate = repairDreamTerms(value, config.dreamText || '');
  const evidenceOk = hasDreamEvidence(candidate, dreamFacts, labels, config.minimumEvidence || 2);
  const connectionOk = config.requireConnection === false || hasRealLifeConnection(candidate);
  const uncertaintyOk = config.requireUncertainty === false || /可能|也许|如果|是否|未必|不一定/.test(candidate);
  return candidate && evidenceOk && connectionOk && uncertaintyOk ? candidate : '';
}

function groundedChartText(value, baziChart) {
  const candidate = repairDreamTerms(value, '');
  if (!candidate || !baziChart) return '';
  const profile = baziChart.chartProfile || {};
  const traceableTerms = [baziChart.dayMaster, profile.dayMasterElement]
    .concat(Array.isArray(profile.dominantElements) ? profile.dominantElements : [])
    .filter(Boolean);
  return traceableTerms.some(function (term) { return candidate.indexOf(term) >= 0; }) ? candidate : '';
}

function requireCompleteModelResult(result, chartAvailable) {
  const requiredStrings = [
    'title',
    'card_theme',
    'card_theme_label',
    'emotional_weather',
    'oracle',
    'card_insight',
    'dream_translation',
    'reading_hook',
    'cultural_symbolism',
    'underneath',
    'mirror',
    'alternative_reading',
    'integration_question',
    'one_small_act',
    'image',
    'image_prompt',
    'echo'
  ];
  const missing = requiredStrings.filter(function (field) {
    return !String(result && result[field] || '').trim();
  });
  const facts = result && result.dream_facts ? result.dream_facts : {};
  const factCount = ['people', 'places', 'objects', 'actions', 'transitions', 'emotions', 'time_sense']
    .reduce(function (total, field) {
      return total + (Array.isArray(facts[field]) ? facts[field].length : 0);
    }, 0);

  if (missing.length) {
    throw new Error('AI provider normalized result missing semantic fields: ' + missing.join(','));
  }
  if (allowedThemes.indexOf(result.card_theme) < 0) {
    throw new Error('AI provider normalized result lost model-selected card theme');
  }
  if (!Array.isArray(result.symbols) || !result.symbols.length || !factCount) {
    throw new Error('AI provider normalized result lost source-grounded dream facts');
  }
  if (!Array.isArray(result.possible_connections) || result.possible_connections.length < 2) {
    throw new Error('AI provider normalized result lost grounded possible connections');
  }
  if (
    !result.visual_plan ||
    !String(result.visual_plan.main_event || '').trim() ||
    !String(result.visual_plan.setting || '').trim() ||
    !Array.isArray(result.visual_plan.preserve_elements) ||
    !result.visual_plan.preserve_elements.length
  ) {
    throw new Error('AI provider normalized result lost visual planning fields');
  }
  if (
    !result.omens ||
    !String(result.omens.lucky_color_name || '').trim() ||
    !String(result.omens.reason || '').trim()
  ) {
    throw new Error('AI provider normalized result lost color guidance');
  }
  if (chartAvailable) {
    const reading = result.metaphysical_reading || {};
    if (
      !result.metaphysical_resonance ||
      !result.metaphysical_basis ||
      ['temperament', 'dream_echo', 'tension', 'rhythm', 'basis'].some(function (field) {
        return !String(reading[field] || '').trim();
      })
    ) {
      throw new Error('AI provider normalized result lost birth-rhythm reading');
    }
  }

  return result;
}

function normalizeAiResult(raw, dreamText, profile, cardIndex, sourceLabel, memory, baziChart, lifeNote) {
  const nickname = String(profile.nickname || '你');
  const rawOmens = raw && raw.omens ? raw.omens : {};
  const symbols = normalizeGroundedSymbols(raw && raw.symbols, dreamText);
  const labels = symbols;
  const cardThemeLabel = asString(raw && raw.card_theme_label, '', 24);
  const dreamFacts = normalizeDreamFacts(raw && raw.dream_facts, dreamText);
  const visualPlan = normalizeVisualPlan(raw && raw.visual_plan, dreamText, dreamFacts, symbols);
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
  const rawMetaphysicalReading = raw && raw.metaphysical_reading && typeof raw.metaphysical_reading === 'object'
    ? raw.metaphysical_reading
    : {};
  const memoryFallback = dreamMemory.dreamCount
    ? '这是你的第' + String(dreamMemory.dreamCount + 1) + '次梦境记录。' +
      (dreamMemory.recurringSymbols.length
        ? '过去反复出现的梦象包括' + dreamMemory.recurringSymbols.slice(0, 3).map(function (item) { return item.symbol; }).join('、') + '；本次需要继续观察它们是否发生了变化。'
        : '目前还没有足够稳定的重复符号，Oneiro 会继续积累你的梦境脉络。')
    : '这是梦境记忆的起点。记录满三次后，Oneiro 会开始识别反复出现的符号、情绪和现实主题。';

  const normalized = {
    title: asString(raw && raw.title, '', 24),
    card_no: 'NO. ' + String(cardIndex).padStart(3, '0'),
    card_theme: normalizeTheme(raw && raw.card_theme, ''),
    card_theme_label: cardThemeLabel,
    dream_facts: dreamFacts,
    visual_plan: visualPlan,
    bazi_chart: baziChart || { available: false, precision: 'missing' },
    profile_summary: nickname + ' · ' + (sourceLabel || '梦境记忆'),
    symbols: symbols,
    symbol_milestones: symbolMilestones,
    referenced_life_note: relevantLifeNote ? {
      text: relevantLifeNote.text,
      sourceDreamId: String(relevantLifeNote.sourceDreamId || ''),
      sourceDate: relevantLifeNote.createdAt ? new Date(relevantLifeNote.createdAt).toISOString().slice(0, 10) : ''
    } : null,
    emotional_weather: repairDreamTerms(asString(
      raw && raw.emotional_weather,
      '',
      180
    ), dreamText),
    oracle: repairDreamTerms(asString(
      raw && raw.oracle,
      '',
      360
    ), dreamText),
    card_insight: repairDreamTerms(asString(
      raw && raw.card_insight,
      '',
      360
    ), dreamText),
    dream_translation: repairDreamTerms(asString(
      raw && raw.dream_translation,
      '',
      700
    ), dreamText),
    reading_hook: repairDreamTerms(asString(
      raw && raw.reading_hook,
      '',
      560
    ), dreamText),
    metaphysical_resonance: chartAvailable
      ? sanitizeMetaphysicalText(
          groundedAnalysisText(
            raw && raw.metaphysical_resonance,
            dreamFacts,
            labels,
            { dreamText: dreamText, minimumEvidence: 2, requireConnection: false, requireUncertainty: false }
          ),
          '',
          700
        )
      : '',
    metaphysical_basis: chartAvailable
      ? sanitizeMetaphysicalText(
          repairDreamTerms(raw && raw.metaphysical_basis, dreamText),
          '',
          360
      )
      : '',
    metaphysical_reading: chartAvailable
      ? {
          temperament: repairDreamTerms(sanitizeMetaphysicalText(groundedChartText(rawMetaphysicalReading.temperament, baziChart), '', 520), dreamText),
          dream_echo: groundedAnalysisText(
            rawMetaphysicalReading.dream_echo,
            dreamFacts,
            labels,
            { dreamText: dreamText, minimumEvidence: 2, requireConnection: false, requireUncertainty: false }
          ),
          tension: groundedAnalysisText(
            rawMetaphysicalReading.tension,
            dreamFacts,
            labels,
            { dreamText: dreamText, minimumEvidence: 2, requireConnection: false, requireUncertainty: false }
          ),
          rhythm: groundedAnalysisText(
            rawMetaphysicalReading.rhythm,
            dreamFacts,
            labels,
            { dreamText: dreamText, minimumEvidence: 1, requireConnection: true, requireUncertainty: false }
          ),
          basis: repairDreamTerms(sanitizeMetaphysicalText(rawMetaphysicalReading.basis, '', 360), dreamText)
        }
      : { temperament: '', dream_echo: '', tension: '', rhythm: '', basis: '' },
    underneath: groundedAnalysisText(
      raw && raw.underneath,
      dreamFacts,
      labels,
      { dreamText: dreamText, minimumEvidence: 2, requireConnection: true, requireUncertainty: true }
    ),
    cultural_symbolism: groundedAnalysisText(
      raw && raw.cultural_symbolism,
      dreamFacts,
      labels,
      { dreamText: dreamText, minimumEvidence: 2, requireConnection: false, requireUncertainty: false }
    ),
    mirror: repairDreamTerms(asString(
      raw && raw.mirror,
      '',
      700
    ), dreamText),
    possible_connections: (function () {
      const candidateConnections = asStringArray(raw && raw.possible_connections, [], 3, 260).map(function (item) {
        return repairDreamTerms(item, dreamText);
      });
      const validConnections = candidateConnections.filter(function (item) {
        return hasDreamEvidence(item, dreamFacts, labels, 1) && hasRealLifeConnection(item);
      });
      return validConnections;
    }()),
    alternative_reading: repairDreamTerms(asString(
      raw && raw.alternative_reading,
      '',
      360
    ), dreamText),
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
    integration_question: repairDreamTerms(asString(
      raw && raw.integration_question,
      '',
      160
    ), dreamText),
    one_small_act: repairDreamTerms(asString(
      raw && raw.one_small_act,
      '',
      80
    ), dreamText),
    image: repairDreamTerms(asString(
      raw && raw.image,
      '',
      420
    ), dreamText),
    image_prompt: repairDreamTerms(asString(
      raw && raw.image_prompt,
      '',
      360
    ), dreamText),
    echo: repairDreamTerms(asString(raw && raw.echo, '', 220), dreamText),
    omens: {
      lucky_color_name: asString(rawOmens.lucky_color_name, '', 24),
      reason: repairDreamTerms(asString(rawOmens.reason, '', 220), dreamText)
    }
  };

  return requireCompleteModelResult(normalized, chartAvailable);
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
  if (profile.confirmedPortrait && profile.confirmedPortrait.useInFutureReadings !== false) {
    parts.push('用户已查看并确认的阶段画像（只能作为可被修正的背景，不得覆盖本次梦境事实）：' + JSON.stringify({
      version: profile.confirmedPortrait.version,
      summary: asString(profile.confirmedPortrait.summary, '', 500)
    }));
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

function repairUnescapedJsonControlCharacters(jsonText) {
  let repaired = '';
  let inString = false;
  let escaping = false;
  let index;

  for (index = 0; index < jsonText.length; index += 1) {
    const character = jsonText.charAt(index);
    const code = jsonText.charCodeAt(index);

    if (!inString) {
      if (character === '"') inString = true;
      repaired += character;
      continue;
    }

    if (escaping) {
      escaping = false;
      repaired += character;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      repaired += character;
      continue;
    }

    if (character === '"') {
      inString = false;
      repaired += character;
      continue;
    }

    // JSON forbids literal U+0000-U+001F in strings, although models sometimes emit them.
    repaired += code <= 0x1f
      ? '\\u' + code.toString(16).padStart(4, '0')
      : character;
  }

  return repaired;
}

function isJsonObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function parseJsonResponse(text) {
  const cleaned = stripJsonFence(text);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;
  const parsed = JSON.parse(repairUnescapedJsonControlCharacters(jsonText));

  if (!isJsonObject(parsed)) {
    throw new Error('AI provider response must be a JSON object');
  }

  return parsed;
}

function validateAiSemanticPayload(raw, dreamText, baziChart) {
  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  const requiredStrings = [
    'title',
    'card_theme',
    'card_theme_label',
    'emotional_weather',
    'oracle',
    'card_insight',
    'dream_translation',
    'reading_hook',
    'cultural_symbolism',
    'underneath',
    'mirror',
    'alternative_reading',
    'integration_question',
    'one_small_act',
    'image',
    'image_prompt',
    'echo'
  ];
  const missingStrings = requiredStrings.filter(function (field) {
    return !String(raw && raw[field] || '').trim();
  });
  const groundedSymbols = normalizeGroundedSymbols(raw && raw.symbols, dreamText);
  const rawFacts = raw && raw.dream_facts;
  const factFields = ['people', 'places', 'objects', 'actions', 'transitions', 'emotions', 'time_sense'];
  const rawFactCount = isRecord(rawFacts)
    ? factFields.reduce(function (total, field) {
      return total + (Array.isArray(rawFacts[field]) ? rawFacts[field].filter(Boolean).length : 0);
    }, 0)
    : 0;
  const visualPlan = raw && raw.visual_plan;
  const possibleConnections = raw && raw.possible_connections;
  const omens = raw && raw.omens;

  if (missingStrings.length) {
    throw new Error('AI provider response missing semantic fields: ' + missingStrings.join(','));
  }
  if (!groundedSymbols.length) {
    throw new Error('AI provider response did not include a source-grounded symbol');
  }
  if (
    allowedThemes.indexOf(String(raw && raw.card_theme || '')) < 0 ||
    String(dreamText || '').indexOf(String(raw && raw.card_theme_label || '').trim()) < 0
  ) {
    throw new Error('AI provider response did not include a source-grounded card theme');
  }
  if (!rawFactCount) {
    throw new Error('AI provider response did not include dream facts');
  }
  if (
    !isRecord(visualPlan) ||
    !String(visualPlan.main_event || '').trim() ||
    !String(visualPlan.setting || '').trim()
  ) {
    throw new Error('AI provider response did not include a complete visual plan');
  }
  if (!Array.isArray(possibleConnections) || possibleConnections.filter(function (item) {
    return String(item || '').trim();
  }).length < 2) {
    throw new Error('AI provider response did not include two possible connections');
  }
  if (
    !isRecord(omens) ||
    !String(omens.lucky_color_name || '').trim() ||
    !String(omens.reason || '').trim()
  ) {
    throw new Error('AI provider response did not include complete color guidance');
  }
  if (baziChart && baziChart.available) {
    const metaphysical = raw && raw.metaphysical_reading;
    if (
      !String(raw.metaphysical_resonance || '').trim() ||
      !String(raw.metaphysical_basis || '').trim() ||
      !isRecord(metaphysical) ||
      ['temperament', 'dream_echo', 'tension', 'rhythm', 'basis'].some(function (field) {
        return !String(metaphysical[field] || '').trim();
      })
    ) {
      throw new Error('AI provider response did not include complete birth-rhythm reading');
    }
  }
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
  const timeoutMs = effectiveTimeoutMs();
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
    supported: !config.unsupported,
    fallbackProvider: 'none'
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
  const timeoutMs = effectiveTimeoutMs();
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
    throw new Error('AI provider is not configured');
  }

  if (config.unsupported) {
    throw new Error('Unsupported INTERPRET_PROVIDER: ' + config.provider);
  }

  if (!config.apiKey) {
    throw new Error('Missing API key for INTERPRET_PROVIDER=' + config.provider);
  }

  const raw = await callOpenAiCompatible(config, profile, dreamText, memory, baziChart, lifeNote);
  validateAiSemanticPayload(raw, dreamText, baziChart);

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

async function runDreamChat(event) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const userMessage = asString(event && event.userMessage, '', 500);
  const history = normalizeChatHistory(event && event.messages);
  const summary = chatResultSummary(event && event.dreamResult);
  const timeoutMs = effectiveTimeoutMs();
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
    return {
      ok: false,
      reason: 'ai_provider_unavailable',
      retryable: true,
      message: 'AI 对话暂时不可用，请稍后再试。'
    };
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
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider_error: error && error.message ? error.message.slice(0, 180) : 'unknown_error',
      message: 'AI 对话暂时不可用，请稍后再试。'
    };
  }
}

async function runDreamRefinement(event) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const answer = asString(event && event.answer, '', 500);
  const summary = chatResultSummary(event && event.dreamResult);
  const timeoutMs = effectiveTimeoutMs();
  let i;

  if (!dreamText || !answer) {
    return { ok: false, reason: 'missing_refine_context', message: '先写下你的回答。' };
  }
  for (i = 0; i < highRiskPatterns.length; i += 1) {
    if (highRiskPatterns[i].pattern.test(answer)) {
      return { ok: false, blocked: true, reason: highRiskPatterns[i].reason, message: highRiskPatterns[i].message };
    }
  }
  if (config.provider === 'static' || config.unsupported || !config.apiKey) {
    return {
      ok: false,
      reason: 'ai_provider_unavailable',
      retryable: true,
      message: 'AI 精修暂时不可用，请稍后再试。'
    };
  }
  try {
    const response = await postJson(config.baseUrl + '/chat/completions', {
      Authorization: 'Bearer ' + config.apiKey
    }, {
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DREAM_REFINE_SYSTEM_PROMPT },
        { role: 'user', content: '原梦：' + dreamText + '\n初版摘要：' + JSON.stringify(summary) + '\n用户回答：' + answer }
      ],
      temperature: 0.48
    }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('Dream refinement provider failed');
    const data = JSON.parse(response.text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const parsed = parseJsonResponse(content);
    const finalTitle = asString(parsed.final_title, '', 16);
    const finalInsight = asString(parsed.final_card_insight, '', 240);
    const personalConnection = asString(parsed.personal_connection, '', 360);
    if (!finalTitle || !finalInsight || !personalConnection) {
      throw new Error('Dream refinement response was incomplete');
    }
    return {
      ok: true,
      provider: config.provider,
      model: config.model || '',
      fallback: false,
      final_title: finalTitle,
      final_card_insight: finalInsight,
      personal_connection: personalConnection
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider_error: error && error.message ? error.message.slice(0, 180) : 'unknown_error'
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
  const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};
  const baziChart = buildBaziChart(profile);
  let memory;
  let safety;
  let profileContext = profile;

  if (event && event.healthCheck) {
    return publicProviderHealth();
  }

  if (event && event.smokeTest) {
    return runAiSmokeTest(event);
  }

  if (event && event.chatAboutDream) {
    return runDreamChat(event);
  }

  if (event && event.refineDream) {
    return runDreamRefinement(event);
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
  var lifeNote = await loadLifeNote(wxContext && wxContext.OPENID ? wxContext.OPENID : '', dreamText);
  var confirmedPortrait = await loadConfirmedPortrait(wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  if (confirmedPortrait) {
    profileContext = Object.assign({}, profile, { confirmedPortrait: confirmedPortrait });
  }

  try {
    const interpreted = await interpretWithAi(profileContext, dreamText, cardIndex, memory, baziChart, lifeNote);

    return {
      ok: true,
      provider: interpreted.provider,
      model: interpreted.model || '',
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      result: interpreted.result
    };
  } catch (error) {
    return {
      ok: false,
      blocked: false,
      reason: 'ai_provider_error',
      retryable: true,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      provider_error: error && error.message ? error.message.slice(0, 180) : 'unknown_error',
      message: 'AI 解读暂时不可用，请稍后再试。'
    };
  }
};
