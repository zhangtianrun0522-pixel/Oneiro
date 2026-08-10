const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const locationResolver = require('./locationResolver');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
// CloudBase gives this function 60 seconds. Keep the provider request below
// that ceiling so the function still has time to normalize and persist its
// response before the platform deadline.
const DEFAULT_TIMEOUT_MS = 45000;
const MIN_TIMEOUT_MS = 45000;
const MAX_TIMEOUT_MS = 50000;
// 思考型模型（如 deepseek-v4-flash）的推理与正文共用同一份输出预算。不显式
// 声明上限时，供应商默认值会被推理吃掉，正文返回空字符串。
const MAX_OUTPUT_TOKENS = Number(process.env.INTERPRET_MAX_TOKENS || 8192);
const PROMPT_VERSION = 'oneiro-freeform-reading-v0.7-grounded-modules';
const SCHEMA_VERSION = 'dream-entry-v0.2';

// 供应商返回 200 但正文为空时，必须区分「推理占满预算被截断」和「真的没内容」，
// 否则两者都会退化成同一个笼统的 provider_error，线上无法定位。
function extractMessageContent(data) {
  const choice = data && data.choices && data.choices[0];
  const message = choice && choice.message;
  const content = message ? String(message.content || '').trim() : '';
  // 思考型模型把正文写进 reasoning_content 时，内容本身仍然可用。
  const reasoning = message ? String(message.reasoning_content || '').trim() : '';

  return {
    content: content || reasoning,
    usedReasoningFallback: !content && !!reasoning,
    truncated: String(choice && choice.finishReason || choice && choice.finish_reason || '') === 'length'
  };
}

function emptyContentError(extracted) {
  const error = new Error(extracted && extracted.truncated
    ? 'AI provider response was truncated before message content (finish_reason=length)'
    : 'AI provider response did not include message content');
  error.errorCode = extracted && extracted.truncated ? 'provider_output_truncated' : 'provider_empty_content';
  error.code = 'AI_PROVIDER_EMPTY_CONTENT';
  return error;
}

function effectiveTimeoutMs() {
  const configured = Number(process.env.INTERPRET_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  // Clamp stale or overly aggressive environment values to the range that
  // leaves CloudBase's 60-second function budget room for cleanup.
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured));
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
  '你是 Oneiro，正在和用户围绕当前这个梦继续对话。',
  '核心意图：把梦里的画面、醒来后的感受与用户愿意确认的现实线索连接起来，帮助用户继续观察，而不是补写一套更大的象征解释。',
  '全局红线：只引用梦中真实出现的内容；没有现实证据就提问而不是断言；不确定就明说不确定。',
  '必须具体回应用户刚说的内容和当前解读中的已知细节，不要转成泛用陪聊。',
  // 原来这里写的是一条固定三步阶梯（先问梦中细节、再问醒来感受、最后问现实），
  // 并且要求「每次都以一个问题收尾」。两条加在一起，模型每一轮都长成同一个
  // 形状：复述—可能性—提问。用户读到的是一台按流程走的机器在依次执行步骤，
  // 而不是一个在听他说话的人。方向仍然是从梦走向现实，但不能是刻度。
  '推进方向是从梦里走向现实：早期多停留在梦中的具体画面和醒来时的感受，聊开之后再邀请用户连接现实中一件具体的小事。这是方向，不是必须逐格走完的流程。',
  '每一轮的形状必须不同。不要每条都用「复述—可能理解—提问」这一个句式，也不要每条都以问题收尾：有时候一句确认、一个观察、或者把用户刚说的话往前推一步就够了。连着两轮问同类问题（尤其是连续追问「为什么」）是失败。',
  '要提问时只问一个容易回答的问题，优先问「发生了什么、你感到什么、最近有没有类似场景」。',
  // 这段是「聊一聊」和画像之间的接缝。以前这里什么长期信息都拿不到，于是它
  // 每次都从零认识用户一遍——同一个人聊了三个月，第一句和第一天没有区别。
  '上下文里可能给出这个人的长期背景：阶段画像、他确认过的现实线索、反复出现的梦境意象。你已经认识他，说话要像认识他的人：当背景里的某一条和他此刻说的话或这个梦里的某处细节具体对上时，自然地说出来（例：「你上次说到那阵子一直在替别人兜底，这次梦里你还是没松手」）。',
  '但严禁把背景当成谈资：没有具体呼应时一个字都不要提，不得罗列意象或主题词，不得说「根据你的画像」「你的关键词是」这类元话语，不得把长期背景复述成对他的定义。用户可以随时否定这些背景，它们是线索不是结论。',
  '聊到后段（大约五六轮之后），从提问转向收束：把这次对话里他确认过的东西说回给他一句，让对话有个可以停下来的地方，而不是无限追问下去。他想继续时再继续。',
  '可以提出一种可能理解，但必须标注为可能性，区分梦中事实、用户感受和待确认的现实关联，不得虚构用户的现实经历或历史记忆。',
  // 这条边界原来划错了地方。它写的是「已经发生、正在发生或已经决定」，于是
  // 「我在考虑出国」被判成猜测丢掉——可那是这个人现实处境里最要紧的一件事。
  // 该拦的从来不是「还没发生」，而是「不是他说的」：模型自己的推断不能记，
  // 他自己讲出来的打算、想法、正在纠结的事都该记。
  '同时从用户本条消息里挑出可以记进他资料的现实线索。标准是「这句话是不是他自己在讲他现实里的事」：已经发生的、正在发生的、已经决定的、正在打算或考虑的、想做还没做的、以及他对自己处境的自述，全都 eligible=true。',
  '还没发生不是排除理由——计划、打算、正在犹豫的选择，都是他真实处境的一部分，往往比已经发生的事更能说明他现在在哪。',
  '必须 eligible=false 的只有这几类：你自己的推断和解释、梦里发生的事、对未来的预言、他在问你的问题、他否认的事，以及没有任何现实落点的纯情绪词（「我很难过」单独出现时不算线索，「我最近一直睡不着」算）。',
  // 一条消息里常常同时有好几件事（「我最近很颓废，而且在考虑出国」）。以前
  // 只收一条，剩下的直接蒸发，用户看到的就是「提取得不全」。
  '用户一条消息里可能同时讲了好几件事，全都挑出来，最多三条，各自独立。没有就给空数组。',
  '每条 quote 必须逐字复制用户本条消息中的一个连续原文片段，不得改写、补全或概括。宁可多带几个字，也不要为了简洁而重新组织措辞——这些话之后会原样呈现给他看，改写过的句子他认不出是自己说的。',
  // gist 是列表上的标签，不是记录本身。原话照存不动，gist 只负责让他在一屏
  // 十几条里认出「这条是关于哪件事的」。截断原话做不到这件事：「我最近其实
  // 很颓废，我啥都不想干只想躺着，事实上我…」既不是概括也不是原话。
  '每条再给一条 gist：不超过 12 个字，用来在列表里指认这条记录讲的是哪件事，例如「在考虑出国」「不想上班」「和父亲吵架」。只能是这句话本身说到的事，不得加入解释、评价、推断或情绪修饰；不确定就把 quote 里最关键的名词短语拿出来。',
  '不做医疗、创伤、人格、关系或职业诊断，不预测命运。',
  '回复 2-4 句话。',
  '只返回合法 JSON，不要 markdown：{"reply":"回复正文","memory_candidates":[{"eligible":true,"quote":"用户原文连续片段","gist":"不超过12字的标签"}]}。'
].join('\n');

const DREAM_REFINE_SYSTEM_PROMPT = [
  '你是 Oneiro。用户已经看过一版梦境解读，并回答了一个与梦相关的问题。',
  '核心意图：只根据原梦、初版解读上下文和用户回答，把梦卡收束成一版更贴近用户的最终成果。',
  '全局红线：只引用梦中真实出现的内容；没有现实证据就提问而不是断言；不确定就明说不确定。',
  '不得把用户没有确认的推测写成事实，不预测命运，不做诊断。',
  '只返回合法 JSON：{"final_card_insight":"不超过120字","personal_connection":"不超过220字","final_title":"2-4字"}。'
].join('\n');

const SYSTEM_PROMPT = [
  '你是 Oneiro，一个敏锐、有边界的梦境观察者。',
  '核心意图：先把原梦中真正发生的事说清楚，再让每个模块提供一条有辨识度、可被用户修正的观察。',
  '模块核心意图：dream_translation 只复述场景与感受；reading_hook 找到一个具体转折；cultural_symbolism 给出中国传统解梦对本梦意象的说法；underneath 观察梦中细节之间的个人张力；possible_connections 只在有具体呼应时提出现实假设；integration_question 留一个容易回答的问题；one_small_act 给一个轻量行动。',
  '模块核心意图：历史记忆只有在历史观察、生活片段或画像与本梦有具体呼应时才使用，并显式说出来源与时间感；没有具体呼应时禁止假装记得。',
  // 画像和「与你有关」是一件事的两半，但接缝绝不能露出来。用户明确反感把主题
  // 当标签贴——`「承接压力」` 这种带括号、单独框起来指认的写法读起来是机械分类，
  // 不是理解。关联必须织进一句完整自然语句里，且必须由梦中一处具体细节接住，
  // 不能只凭画像本身成立。
  '模块核心意图：当前阶段画像只是可修正的长期背景。只有当本梦中一处具体细节（某个动作、位置、结局）恰好呼应了画像所指的长期状态时，才在 possible_connections 里写这条关联，并且必须写成一句完整自然的话：把梦里那处细节和那个长期状态连起来说（例：「梦里水一直漫上来、你却一点也不慌，和你最近一直在默默接住很多事是同一种姿态」）。严禁把画像主题当标签贴出：不得出现用「」『』括起、单独框起来指认的主题词，不得出现“主题：”“标签：”“对应画像 X”这类元话语，也不得罗列画像里的词。读起来必须像一句观察，不像给这个梦标注分类。画像与本梦没有具体呼应时，宁可完全不提画像，possible_connections 为空。',
  // 旧版要求「写清是哪个意象、上一次什么时候出现、那次和这次有什么不同」，
  // 模型只做了前两件（查数据，容易），跳过了第三件（说出差别，难），于是输出
  // 变成「这是你第 12 次梦见沙漠」这类报表。次数是真的，但它不产生任何理解——
  // 用户早就知道自己老梦见沙漠，他想知道的是这次和那 11 次有什么不一样。
  '模块核心意图：上下文若给出「已核实的历史呼应」，那是系统比对过的确凿重复。点出其中一处时，重点必须落在「这次和上次有什么不同」：同一个意象这次出现在什么位置、你在梦里做了什么、结局是否变了。严禁只播报统计——「这是你第 N 次梦见 X」「与 M 天前的梦共享 Y 元素」这类句子本身不构成理解，单独出现视为未完成。说不出这次与上次的差别时，宁可完全不提这处呼应。次数与时间只能作为背景，不得据此推断现实生活中发生了什么。',
  // 「沙漠象征匮乏，石榴象征丰饶，两者形成反差」——这是把两个词典义拼起来，
  // 再加一句「或许映射着」。它没有用到梦里任何一个具体动作，所以对任何一个
  // 做了同类梦的人都成立。
  '模块核心意图：underneath 必须引用本梦里至少一个具体动作、位置或变化（谁在做什么、什么在动、什么本该发生却没有发生），再说出它与另一处细节之间的张力。禁止把两个意象的词典义拼成对比句式（「A 象征匮乏、B 象征丰饶，形成反差」属于查词典，不是观察）。',
  '模块核心意图：cultural_symbolism 给出中国传统解梦（周公解梦一脉）对本梦具体意象的传统说法，并写清那是传统里的讲法、不是对用户的判断。可以引用传统释义的原意，但不得输出吉凶、运势、宜忌、预兆、主何事或任何对未来的断言。传统说法与本梦情节不符时如实指出不符，或者留空。',
  // 梦见石榴 → 今天去尝一颗石榴。这是把象征当购物清单，也是模块化 prompt
  // 最容易退化成的形态：拿梦里的名词，映射成现实里的一个动作。
  '模块核心意图：one_small_act 必须连向梦所指向的现实处境，不得把梦里的物件搬进现实当道具（梦见石榴就去吃石榴、梦见钥匙就去配一把钥匙，都属于错误）。没有可连的现实处境时，给一个关于留意或记录的行动，或者留空。',
  // 禁了「梦见石榴→去吃石榴」之后，模型换了条路：把传统释义里的「丰收」翻译成
  // 「留意这周突然出现的惊喜」。物件是不搬了，但它开始暗示未来会发生什么——
  // 这是从后门溜回来的预测，比原来的错误更难发现。
  '模块核心意图：one_small_act 不得暗示未来会发生什么，也不得让用户去等待、期待或留意某类尚未发生的事件（「留意这周出现的惊喜」「注意即将到来的机会」都属于预测）。只能指向已经存在的现实处境，或对已发生之事的记录与回看。',
  '模块核心意图：visual_plan 只把原梦中最重要的事件、场景和少量元素交给生图，短梦就画短梦，不补齐缺失世界。',
  '全局红线一：只引用梦里真实出现的内容，不把象征解释写成事实，也不得改写用户的原梦。',
  '全局红线二：没有现实证据就提问而不是断言，现实关联可以为零；不确定就明说不确定。',
  '全局红线三：不得虚构用户未提供的个人经历、历史记忆或背景信息，不预测命运，不做医疗、创伤、关系、职业或人格诊断。',
  '宽松表达骨架：下面字段必须存在，但表达长度、句数和数组条数由梦的材料决定；表达字段允许为空，possible_connections 可以是空数组。不要为了填满字段而重复、扩写或发明内容。',
  '不得虚构用户未提供的个人经历、历史记忆或背景信息，不预测命运，不做医疗、创伤、关系、职业或人格诊断。',
  '四柱、八字、日主、五行、十神、排盘、命盘、命理、命格等技术术语只允许出现在 metaphysical_resonance、metaphysical_basis 与 metaphysical_reading 内；其他字段不得出现。任何字段均不得出现运势、吉凶、凶吉、注定、必然或命运，也不得作预测。',
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
  '  "symbols": ["梦中核心象征短词；只保留有材料支持的内容，没有就为空"],',
  '  "emotional_weather": "一句话描述梦的情绪天气",',
  '  "oracle": "一句克制的可能性提醒，不预测、不诊断",',
  '  "card_insight": "一句收藏卡摘要，必须引用一个梦中细节",',
  '  "dream_translation": "2-3句话复述梦中发生的事和情绪，不加推测",',
  '  "reading_hook": "一句有材料支持的核心观察；梦中细节少时可以更短，不要补第二个细节",',
  '  "cultural_symbolism": "中国传统解梦对本梦意象的说法，写明这是传统讲法；不得出现吉凶、运势、宜忌、预兆或未来断言；与本梦不符或无传统说法时留空",',
  '  "metaphysical_resonance": "按当前模板规则输出",',
  '  "metaphysical_basis": "按当前模板规则输出",',
  '  "metaphysical_reading": { "temperament": "这次梦被调动的内在底色；无具体呼应可为空", "dream_echo": "出生节律与本梦具体意象的呼应；无具体呼应可为空", "tension": "出生节律与梦中行动的拉扯；无具体呼应可为空", "rhythm": "基于本梦的当下行动节奏；无具体依据可为空", "basis": "内部计算记录，可为空" },',
  '  "underneath": "引用梦里至少一个具体动作或变化，说出它与另一处细节之间的张力；禁止把两个意象的词典义拼成反差句；有材料才写，可以为空",',
  '  "possible_connections": ["只有梦中细节与用户上下文（含阶段画像）有具体呼应时才写；每条是一句完整自然语句，不出现括起来的主题标签，0条完全可以"],',
  '  "mirror": "对 possible_connections 的简短总结",',
  '  "integration_question": "一个围绕当次梦的可回答问题",',
  '  "one_small_act": "连向梦所指向的现实处境的一个小行动，不超过20字；不得把梦里的物件搬成现实道具；无可连处境时留空",',
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

const METAPHYSICAL_PROMPT_RULES = [
  '核心意图：用出生节律参考照亮这次梦的情绪纹理或行动节奏；材料不足时如实说明只看见了梦中这一处呼应。',
  'metaphysical_resonance、metaphysical_basis 和 metaphysical_reading 的 temperament、dream_echo、tension、rhythm、basis 必须全部非空。metaphysical_resonance 必须引用本梦的具体人物、物件、动作或场景；temperament、dream_echo、tension、rhythm 中至少两项也要有这种可核对的梦中呼应。',
  'metaphysical_basis 与 metaphysical_reading.basis 必须使用确定性计算得出的一个技术锚点：四柱、日主、五行或十神之一；basis 不必重复梦境原文，不得推出未来、吉凶或命运。',
  '出生节律段落只能依据已提供的确定性盘面，不重复固定资料；技术术语只写在命理字段内。',
  '短梦只有一个清晰细节时，承认材料有限，不发明第二个细节、人物、物件、积水或水体；原文只有“雨/暴雨”时保留原词。',
  '不得预测吉凶命运，不得把命理视角写成事实判断；只提供可被用户保留、修正或否定的观察。'
].join('\n');

const METAPHYSICAL_READING_SYSTEM_PROMPT = [
  '你是 Oneiro，为用户提供一个主动请求的出生节律第二视角。产品是私人梦境记忆，不是算命。',
  '只返回合法 JSON 对象，不要 markdown，不要代码块，不要生成主解读的其他字段。',
  '只允许返回以下结构：{"metaphysical_resonance":"","metaphysical_basis":"","metaphysical_reading":{"temperament":"","dream_echo":"","tension":"","rhythm":"","basis":""}}。',
  '命理技术术语只能出现在上述命理字段中；不得出现运势、吉凶、凶吉、注定、必然或命运，不得进行任何未来预测。',
  METAPHYSICAL_PROMPT_RULES
].join('\n');

function buildInterpretationSystemPrompt() {
  return SYSTEM_PROMPT + '\n' + [
    '当前采用基础梦境解读模板，不得引入出生资料或命理背景推断。出生节律不是本次主解读的必需步骤。',
    'metaphysical_resonance、metaphysical_basis，以及 metaphysical_reading 的 temperament、dream_echo、tension、rhythm、basis 必须全部输出空字符串。'
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

const PREDICTIVE_METAPHYSICAL_PATTERN = /运势|吉凶|凶吉|注定|必然|命运/;
// 传统解梦文本天然带占卜口吻（「梦见水主财」「主口舌」「大凶」「此乃预兆」）。
// 引用传统说法是产品选择，输出吉凶判断不是——后者撞的是这个产品自己的红线：
// 不预测、不断吉凶。所以传统释义只作为文化材料保留，凡是把它写成对用户未来
// 的断言，整段丢弃。
const FORTUNE_CLAIM_PATTERN = /主[吉凶财病灾祸难]|大吉|大凶|不祥|预兆|征兆|宜忌|主何|应验/;
const METAPHYSICAL_TECHNICAL_PATTERN = /四柱|八字|日主|五行|十神|排盘|命盘|命理|命格/;

function hasPredictiveMetaphysicalLanguage(value) {
  return PREDICTIVE_METAPHYSICAL_PATTERN.test(String(value || ''));
}

// 传统解梦说法可以引用，但一旦写成吉凶断言就整段留空。宁可没有这一块，也
// 不能让产品输出「主口舌」「大凶」这种对未来的判决。
function sanitizeFortuneClaims(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return FORTUNE_CLAIM_PATTERN.test(text) ? '' : text;
}

// 把画像主题当标签贴出来的两种写法。「承接压力」这样单独框起来指认一个主题，
// 和「主题：承接压力」这样的元话语，读起来都是在给这个梦做分类归档，而不是在
// 说一句观察——用户明确反感这一点，所以「与你有关」只能是自然语句。
//
// 提示词里已经禁了，但那是靠模型自觉，而这条禁令是产品的硬边界，不能只有一道
// 靠说服的闸。这里做确定性兜底，且分两种力度：元话语整段删掉（它没有信息，
// 只有分类动作）；引号只拆掉括号本身、留下里面的话（那句话往往是句子的主干，
// 连带删掉会把整条呼应打碎，而拆掉括号后它自然融回句子）。
// 冒号后面那截只在「短到只可能是个主题词」时才一起删（≤8 字）。这道限制是必须
// 的：「主题：承接压力。梦里水漫上来…」冒号后是标签值，该删；而「对应画像 2：
// 梦里水漫上来你却不慌」冒号后就是那句观察本身，删掉整条呼应就没了。长度是这
// 两种写法之间唯一稳定可判的差别。
const CONNECTION_LABEL_META_PATTERN = /(?:^|[，,。；;、])\s*(?:对应)?(?:阶段)?(?:画像)?(?:主题|标签|关键词|分类|对应画像)\s*[0-9０-９]*\s*[：:]\s*(?:[^，,。；;]{1,8}(?=[，,。；;]|$))?/g;

function stripConnectionLabels(value) {
  const original = String(value || '').trim();
  const cleaned = original
    .replace(CONNECTION_LABEL_META_PATTERN, '')
    .replace(/[「」『』]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s，,、。；;：:]+/, '')
    .trim();
  // 没动过的原样返回。长度下限只对被清理过的内容生效——干净的短句是合法输出，
  // 不该被这道闸误伤；而清完只剩残句的，说明它本来就只是个标签，不是观察，
  // 宁可这次没有关联，也不要在「与你有关」下面挂一句读不通的话。
  if (cleaned === original) return original;
  return cleaned.length >= 8 ? cleaned : '';
}

function sanitizeMetaphysicalText(value, fallback, maxLength) {
  const limit = maxLength || 700;
  const text = typeof value === 'string' ? value.trim() : '';

  if (hasPredictiveMetaphysicalLanguage(text)) {
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

function normalizeSymbols(value) {
  return asStringArray(value, [], 5, 32);
}

function repairDreamTerms(value) {
  const fallback = arguments.length > 1 ? arguments[1] : '';
  const text = typeof value === 'string' ? value.trim() : '';
  const fallbackText = typeof fallback === 'string' ? fallback.trim() : '';

  // Technical chart language belongs exclusively to the dedicated
  // metaphysical fields. A malformed model field must not make the full
  // reading fail or let that vocabulary bleed into the ordinary reading.
  if (text && !METAPHYSICAL_TECHNICAL_PATTERN.test(text) && !hasPredictiveMetaphysicalLanguage(text)) {
    return text;
  }
  if (fallbackText && !METAPHYSICAL_TECHNICAL_PATTERN.test(fallbackText) && !hasPredictiveMetaphysicalLanguage(fallbackText)) {
    return fallbackText;
  }
  return '';
}

// 兜底文案不得预设梦里有什么。旧版本一律预设梦里有人说过话，一旦在「沙漠里
// 下暴雨」这类梦上触发，就是对用户自己的梦说了假话。别的泛还能忍，说错我的梦
// 我立刻知道你在编，这是最伤信任的一类错，也直接违反红线一（只引用梦里真实
// 出现的内容）。兜底的正确形式是留白或如实说明，不是补一句对谁都成立的话。
function safeBaseFallback(field) {
  const fallbacks = {
    emotional_weather: '这个梦留下了一点需要慢慢辨认的感受。',
    oracle: '先停在画面与感受上，不急着为它下结论。',
    card_insight: '这个梦留下了一个还没被命名的画面。',
    dream_translation: '这次没能生成复述，你记下的原梦完整保留在上方。',
    reading_hook: '这个梦还需要你自己先看一遍，再决定它像什么。',
    // mirror 不是必填字段：留空后「与你有关」会如实显示「这次没有找到」，
    // 而不是拿一句总结去顶替不存在的关联。
    mirror: '',
    alternative_reading: '也可以先不急着给这个梦一个解释。',
    integration_question: '这个梦里，你最想再看一眼的是哪一处？',
    one_small_act: '记下这个梦留下的感受',
    image: '一个安静的梦中场景。',
    image_prompt: 'A quiet, minimal dream scene with soft light and open space.',
    echo: '先把这个梦放着，不急着收拢它。',
    visual_text: '梦中一个安静的片段',
    visual_event: '梦中一个停留的画面',
    visual_setting: '梦中场景'
  };
  return fallbacks[field] || '';
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
    return source.indexOf(compact) !== -1;
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
    emotions: asStringArray(raw.emotions, [], 6, 30).map(function (item) { return repairDreamTerms(item, ''); }).filter(Boolean),
    time_sense: asStringArray(raw.time_sense || raw.timeSense, [], 6, 30).map(function (item) { return repairDreamTerms(item, ''); }).filter(Boolean)
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
      return { role: '人物', description: repairDreamTerms(asString(item, '', 80), ''), importance: 0.7 };
    }
    return {
      role: asString(item && item.role, '人物', 24),
      description: repairDreamTerms(asString(item && item.description, '', 100), ''),
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
      return { name: repairDreamTerms(asString(item, '', 60), ''), importance: 0.6, visualizable: true };
    }
    return {
      name: repairDreamTerms(asString(item && item.name, '', 60), ''),
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
    return repairDreamTerms(asString(item, '', 80), '');
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
  const emotions = asStringArray(raw.emotion || raw.emotions, facts.emotions || [], 3, 30).map(function (item) { return repairDreamTerms(item, ''); }).filter(Boolean);
  const anomalies = asStringArray(raw.anomalies || [raw.anomaly], [], 1, 120).map(function (item) { return repairDreamTerms(item, ''); }).filter(Boolean);
  const rawComposition = raw.composition && typeof raw.composition === 'object' ? raw.composition : {};
  const requestedComposition = asString(rawComposition.template || rawComposition.id, '', 40);
  const compositionId = visualCompositionIds.indexOf(requestedComposition) >= 0
    ? requestedComposition
    : 'off_center_diagonal';
  const candidates = [];

  asStringArray(raw.preserve_elements || raw.visual_elements, [], 4, 80).forEach(function (item) {
    if (groundedFactArray([item], dreamText, 1, 80).length) candidates.push(item);
  });
  characters.forEach(function (item) { candidates.push(item.description); });
  objects.filter(function (item) { return item.visualizable; }).forEach(function (item) { candidates.push(item.name); });
  ['people', 'objects', 'places'].forEach(function (key) {
    (Array.isArray(facts[key]) ? facts[key] : []).forEach(function (item) { candidates.push(item); });
  });
  (Array.isArray(symbols) ? symbols : []).forEach(function (item) { candidates.push(item); });

  const preserveElements = uniqueVisualElements(candidates, 4);
  const visualSymbols = uniqueVisualElements(symbols, 5);
  const hiddenSymbol = repairDreamTerms(asString(raw.hidden_symbol, '', 80), '');
  const actions = Array.isArray(facts.actions) ? facts.actions : [];
  const transitions = Array.isArray(facts.transitions) ? facts.transitions : [];
  const places = Array.isArray(facts.places) ? facts.places : [];
  const normalizedCharacters = characters.length ? characters : (facts.people || []).slice(0, 3).map(function (item, index) {
    return { role: index === 0 ? '主体' : '人物', description: item, importance: index === 0 ? 1 : 0.7 };
  });
  const normalizedObjects = objects.length ? objects : (facts.objects || []).slice(0, 4).map(function (item, index) {
    return { name: item, importance: Math.max(0.55, 0.9 - index * 0.1), visualizable: true };
  });
  const rawMainEvent = asString(raw.main_event || raw.mainEvent, '', 180);
  const groundedMainEvent = groundedFactArray([rawMainEvent], dreamText, 1, 180)[0] || '';
  const mainEvent = repairDreamTerms(
    groundedMainEvent || transitions[0] || actions[0] || String(dreamText || '').slice(0, 180),
    safeBaseFallback('visual_event')
  );
  const setting = repairDreamTerms(asString(raw.setting, places[0] || safeBaseFallback('visual_setting'), 100), safeBaseFallback('visual_setting'));
  if (!preserveElements.length && mainEvent) preserveElements.push(mainEvent);

  return {
    version: 'oneiro-visual-plan-v1',
    raw_text: repairDreamTerms(String(dreamText || '').slice(0, 1200), safeBaseFallback('visual_text')),
    main_event: mainEvent,
    emotion: emotions,
    emotion_intensity: Math.min(1, Math.max(0, Number(raw.emotion_intensity || raw.emotionIntensity) || 0.65)),
    setting: setting,
    characters: normalizedCharacters,
    objects: normalizedObjects,
    anomalies: anomalies,
    symbols: visualSymbols,
    memory_elements: asStringArray(raw.memory_elements, [], 3, 80).map(function (item) { return repairDreamTerms(item, ''); }).filter(Boolean),
    preserve_elements: preserveElements,
    hidden_symbol: hiddenSymbol,
    composition: {
      template: compositionId,
      subject_position: repairDreamTerms(asString(rawComposition.subject_position, '', 160), ''),
      visual_flow: repairDreamTerms(asString(rawComposition.visual_flow, '', 180), ''),
      spatial_layers: repairDreamTerms(asString(rawComposition.spatial_layers, '', 180), ''),
      negative_space: repairDreamTerms(asString(rawComposition.negative_space, '保留约40%低密度呼吸空间', 120), '保留约40%低密度呼吸空间')
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
    // 提示必须点名到底缺哪一样。笼统地说「补充出生日期、时间和城市」，会让
    // 已经填了日期和城市、只差出生时间的用户反复确认自己已经填过——他确实
    // 填过了，只是资料页把「出生时间」标成了可选，而这个功能非它不可。
    const missing = [];
    if (!dateMatch) missing.push('出生日期');
    if (!timeMatch) missing.push('出生时间');
    if (!location) missing.push('出生城市');

    return {
      available: false,
      precision: !dateMatch || !timeMatch ? 'insufficient_input' : 'location_unresolved',
      missingFields: missing,
      summary: '缺少' + missing.join('、') + '，本次不生成出生节律参考。',
      basis: !location && dateMatch && timeMatch
        ? '出生城市“' + String(safeProfile.birthPlace || '').slice(0, 20) + '”无法识别。可填写市级或省级地名，例如“青岛”或“山东”；不使用模型猜测坐标。'
        : '出生节律需要' + missing.join('和') + '。' + (missing.indexOf('出生时间') >= 0 ? '出生时间决定时柱，缺它就无法排出完整四柱。' : '')
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

// 近期的重复比陈年的重复更能说明「此刻」。没有这个衰减，一个半年前密集
// 出现过的意象会永远压住这个月真正在重复的意象。
function memoryRecencyWeight(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo < 0) return 0.6;
  if (daysAgo <= 14) return 1;
  if (daysAgo <= 45) return 0.7;
  if (daysAgo <= 120) return 0.4;
  return 0.2;
}

function daysBetween(fromTimestamp, toTimestamp) {
  if (!fromTimestamp) return NaN;
  return Math.floor((toTimestamp - fromTimestamp) / 86400000);
}

function relativeDayPhrase(daysAgo) {
  if (!Number.isFinite(daysAgo) || daysAgo < 0) return '之前';
  if (daysAgo === 0) return '今天';
  if (daysAgo === 1) return '昨天';
  if (daysAgo <= 6) return daysAgo + '天前';
  if (daysAgo <= 10) return '大约一周前';
  if (daysAgo <= 27) return '大约' + Math.round(daysAgo / 7) + '周前';
  if (daysAgo <= 45) return '大约一个月前';
  if (daysAgo <= 300) return '大约' + Math.round(daysAgo / 30) + '个月前';
  return '半年多以前';
}

function buildDreamMemory(records, memoryUnavailable) {
  const entries = Array.isArray(records) ? records.slice() : [];
  const symbolCounts = {};
  const symbolScores = {};
  const symbolOccurrences = {};
  const themeCounts = {};
  const recent = [];
  const now = Date.now();

  entries.sort(function (a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  entries.slice(0, 30).forEach(function (entry) {
    const result = entry && entry.result ? entry.result : {};
    const symbols = Array.isArray(entry.symbols) && entry.symbols.length ? entry.symbols : result.symbols || [];
    const theme = String(entry.cardTheme || result.card_theme || '');
    const createdAt = entry && entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
    const daysAgo = daysBetween(createdAt, now);
    const weight = memoryRecencyWeight(daysAgo);

    var uniqueSymbols = new Set();
    symbols.slice(0, 8).forEach(function (symbol) {
      var key = String(symbol || '').trim();
      if (key) uniqueSymbols.add(key);
    });
    uniqueSymbols.forEach(function (symbol) {
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
      symbolScores[symbol] = (symbolScores[symbol] || 0) + weight;
      // 保留每个意象最近三次的落点，这样解读才说得出「三周前那次你在剪枝」，
      // 而不是只知道它出现过 N 次。
      if (!symbolOccurrences[symbol]) symbolOccurrences[symbol] = [];
      if (symbolOccurrences[symbol].length < 3) {
        symbolOccurrences[symbol].push({
          date: createdAt ? new Date(createdAt).toISOString().slice(0, 10) : '',
          daysAgo: Number.isFinite(daysAgo) ? daysAgo : null,
          when: relativeDayPhrase(daysAgo),
          title: String(result.title || ''),
          detail: String(result.dream_translation || '').slice(0, 80)
        });
      }
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
    .sort(function (a, b) {
      return (symbolScores[b] - symbolScores[a]) || (symbolCounts[b] - symbolCounts[a]);
    })
    .slice(0, 8)
    .map(function (symbol) { return { symbol: symbol, count: symbolCounts[symbol] }; });
  const recurringThemes = Object.keys(themeCounts)
    .sort(function (a, b) { return themeCounts[b] - themeCounts[a]; })
    .slice(0, 4)
    .map(function (theme) { return { theme: theme, count: themeCounts[theme] }; });

  return {
    dreamCount: entries.length,
    symbolCounts: symbolCounts,
    symbolOccurrences: symbolOccurrences,
    recurringSymbols: recurringSymbols,
    recurringThemes: recurringThemes,
    recent: recent,
    hasPattern: entries.length >= 3 && recurringSymbols.length > 0,
    memoryUnavailable: !!memoryUnavailable
  };
}

// 记忆之所以读起来像「她记得我」，靠的不是把最高频的三个意象塞进 prompt，
// 而是拿今晚这个梦去历史里找确凿的重合。前者对每个梦都是同一份背景板，
// 模型按红线（没有具体呼应就不许假装记得）只能选择闭嘴；后者才是可以被
// 说出口、可以被用户当场核对的呼应。
function buildMemoryEchoes(memory, dreamText) {
  const source = String(dreamText || '');
  const occurrences = (memory && memory.symbolOccurrences) || {};
  const counts = (memory && memory.symbolCounts) || {};

  if (!source) return [];

  return Object.keys(counts)
    .filter(function (symbol) {
      return symbol.length >= 1 && source.indexOf(symbol) >= 0;
    })
    .map(function (symbol) {
      const seen = occurrences[symbol] || [];
      const latestDaysAgo = seen.length && Number.isFinite(seen[0].daysAgo) ? seen[0].daysAgo : 999;
      return {
        symbol: symbol,
        count: counts[symbol],
        lastSeen: seen[0] ? seen[0].when : '',
        occurrences: seen.slice(0, 2),
        // 重复次数越多、上次出现越近，越值得在解读里点名。
        score: counts[symbol] * memoryRecencyWeight(latestDaysAgo)
      };
    })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3)
    .map(function (item) {
      return {
        symbol: item.symbol,
        pastDreamCount: item.count,
        lastSeen: item.lastSeen,
        occurrences: item.occurrences
      };
    });
}

// 呼应命中率是「记忆有没有真的被说出口」唯一可核对的信号：系统交给模型 N 处
// 已核实的重复，解读里最终点名了几处。offered 为 0 的解读不计入命中率——那不
// 是模型在沉默，是今晚这个梦确实和历史没有重合。
function evaluateMemoryEcho(memory, dreamText, result) {
  const echoes = buildMemoryEchoes(memory, dreamText);

  if (!echoes.length) return { offered: 0, used: 0, symbols: [] };

  // 只统计面向用户的叙述字段。visual_plan / image_prompt 里出现意象说明的是
  // 生图在画它，不代表解读点出了这处重复。
  const spoken = ['reading_hook', 'underneath', 'possible_connections', 'mirror', 'integration_question']
    .map(function (field) {
      const value = result && result[field];
      return Array.isArray(value) ? value.join('\n') : String(value || '');
    })
    .join('\n');

  const used = echoes.filter(function (echo) {
    return echo.symbol && spoken.indexOf(echo.symbol) >= 0;
  });

  return {
    offered: echoes.length,
    used: used.length,
    symbols: used.map(function (echo) { return echo.symbol; })
  };
}

// 每天放行的解读次数。限的是解读，不是记录——梦在醒来几分钟内就会忘，所以
// 超额时客户端照常把原梦存下来，第二天可以补解读。只有真正产出了结果的梦
// （status: 'ready'）才计数：一次失败的调用不该吃掉用户当天的额度。
const DAILY_INTERPRETATION_LIMIT = Math.max(1, Number(process.env.INTERPRET_DAILY_LIMIT || 3));

// 云函数按 UTC 运行，用户过的是北京时间的一天。不做这个偏移，凌晨记的梦会被
// 算进前一天的额度里，而那正是最容易记梦的时间段。
function startOfDayInChina(now) {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 8 * 3600 * 1000);
}

async function readInterpretationQuota(openid) {
  const limit = DAILY_INTERPRETATION_LIMIT;

  // 没有 openid（登录降级成本地 id）时无法按人计数。这里放行：把认不出来的人
  // 挡在门外，代价是他的梦永远解不了，比多花几次调用严重得多。
  if (!db || !openid) return { limited: false, used: 0, limit: limit };

  try {
    const counted = await db.collection('dream_entries').where({
      openid: openid,
      status: 'ready',
      createdAt: db.command.gte(startOfDayInChina(new Date()))
    }).count();
    const used = counted && Number.isFinite(Number(counted.total)) ? Number(counted.total) : 0;
    return { limited: used >= limit, used: used, limit: limit };
  } catch (error) {
    // 计数本身失败时同样放行，理由同上：宁可多花一次调用。
    return { limited: false, used: 0, limit: limit };
  }
}

async function loadDreamMemory(openid) {
  if (!db || !openid) return buildDreamMemory([], true);

  try {
    const response = await db.collection('dream_entries').where({ openid: openid }).orderBy('createdAt', 'desc').limit(30).get();
    return buildDreamMemory(response && response.data ? response.data : []);
  } catch (error) {
    return buildDreamMemory([], true);
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

async function loadCurrentPortrait(openid) {
  if (!db || !openid) return null;
  try {
    var stateResponse;
    try {
      stateResponse = await db.collection('profile_memory_state')
        .where({ openid: openid })
        .limit(1)
        .get();
    } catch (stateError) {
      return null;
    }
    var stateDocs = stateResponse && Array.isArray(stateResponse.data) ? stateResponse.data : [];
    var hasStateDocument = stateDocs.length > 0;
    var memoryState = hasStateDocument ? stateDocs[0] : null;
    var portrait = null;

    function normalizeUsablePortrait(value, strict) {
      if (!value) return null;
      if (value.paused === true || value.status === 'paused') return null;
      var copy = Object.assign({}, value);
      copy.summary = asString(copy.summary || copy.profileText, '', 500);
      copy.profileText = asString(copy.profileText || copy.summary, '', 500);
      copy.status = ['draft', 'confirmed', 'rejected', 'superseded'].indexOf(copy.status) >= 0 ? copy.status : 'confirmed';
      copy.isCurrent = copy.isCurrent !== false;
      copy.useInFutureReadings = copy.useInFutureReadings !== false;
      if (
        !copy.summary ||
        copy.status !== 'confirmed' ||
        copy.isCurrent !== true ||
        copy.stale === true ||
        copy.useInFutureReadings !== true ||
        copy.paused === true
      ) return null;
      if (strict && value.status !== 'confirmed') return null;
      return copy;
    }

    if (
      hasStateDocument &&
      (memoryState.paused === true || memoryState.status === 'paused' ||
        memoryState.useInFutureReadings === false || memoryState.stale === true)
    ) return null;
    if (hasStateDocument && !memoryState.currentSnapshotId) return null;

    if (hasStateDocument) {
      var pointed = await db.collection('profile_snapshots')
        .where({ openid: openid, _id: memoryState.currentSnapshotId })
        .limit(1)
        .get();
      portrait = pointed && pointed.data && pointed.data[0];
      portrait = normalizeUsablePortrait(portrait, true);
    } else {
      var response = await db.collection('profile_snapshots')
        .where({ openid: openid })
        .orderBy('updatedAt', 'desc')
        .limit(30)
        .get();
      portrait = (response && response.data ? response.data : []).map(function (item) {
        return normalizeUsablePortrait(item, false);
      }).filter(Boolean)[0] || null;
    }
    if (!portrait) return null;
    return {
      version: Number(portrait.version || 0),
      summary: asString(portrait.summary || portrait.profileText, '', 500),
      themes: Array.isArray(portrait.themes) ? portrait.themes.slice(0, 3) : [],
      emotionalTone: asString(portrait.emotionalTone || portrait.emotionTone, '', 100),
      changing: asString(portrait.changing || portrait.change, '', 120),
      userEdited: portrait.userEdited || null,
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

function sanitizeProfileInput(value) {
  var source = value && typeof value === 'object' ? value : {};
  var copy = Object.assign({}, source);
  delete copy.currentPortrait;
  delete copy.confirmedPortrait;
  return copy;
}

function freeformText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength || 700) : '';
}

function dreamAnchorFragments(dreamText) {
  const compact = String(dreamText || '').replace(/[\s，。！？、；：“”‘’（）()《》【】,.!?:;\-]/g, '');
  const fragments = [];
  let index;
  let length;

  for (index = 0; index < compact.length - 1; index += 1) {
    for (length = 2; length <= 6 && index + length <= compact.length; length += 1) {
      const fragment = compact.slice(index, index + length);
      if (!/^(我梦|梦见|了一|一个|里面|然后)/.test(fragment)) fragments.push(fragment);
    }
  }

  return fragments;
}

function isGroundedMetaphysicalText(value, dreamText) {
  const text = String(value || '').trim();
  return !!text && dreamAnchorFragments(dreamText).some(function (fragment) {
    return text.indexOf(fragment) !== -1;
  });
}

function metaphysicalReadingFields(reading) {
  return ['temperament', 'dream_echo', 'tension', 'rhythm', 'basis'].map(function (field) {
    return { field: field, value: reading && reading[field] };
  });
}

function validateMetaphysicalContract(payload, dreamText, metaphysicalRequired, errorPrefix) {
  const reading = payload && payload.metaphysical_reading;
  const allFields = [
    { field: 'metaphysical_resonance', value: payload && payload.metaphysical_resonance },
    { field: 'metaphysical_basis', value: payload && payload.metaphysical_basis }
  ].concat(metaphysicalReadingFields(reading));
  const nonEmpty = allFields.filter(function (item) { return String(item.value || '').trim(); });

  if (!metaphysicalRequired) {
    if (nonEmpty.length) throw new Error(errorPrefix + ' must keep metaphysical fields empty without a birth chart');
    return;
  }
  if (!reading || typeof reading !== 'object') throw new Error(errorPrefix + ' did not include birth-rhythm structure');
  if (nonEmpty.length !== allFields.length) {
    throw new Error(errorPrefix + ' has incomplete metaphysical fields: ' + allFields.filter(function (item) {
      return !String(item.value || '').trim();
    }).map(function (item) { return item.field; }).join(','));
  }
  if (nonEmpty.some(function (item) { return hasPredictiveMetaphysicalLanguage(item.value); })) {
    throw new Error(errorPrefix + ' contains predictive metaphysical language');
  }
  if (!METAPHYSICAL_TECHNICAL_PATTERN.test(String(payload.metaphysical_basis || '')) ||
      !METAPHYSICAL_TECHNICAL_PATTERN.test(String(reading.basis || ''))) {
    throw new Error(errorPrefix + ' is missing deterministic chart anchors');
  }
  if (!isGroundedMetaphysicalText(payload.metaphysical_resonance, dreamText)) {
    throw new Error(errorPrefix + ' must ground metaphysical resonance in a dream fact');
  }
  const groundedReadingAspects = ['temperament', 'dream_echo', 'tension', 'rhythm'].filter(function (field) {
    return isGroundedMetaphysicalText(reading[field], dreamText);
  });
  if (groundedReadingAspects.length < 2) {
    throw new Error(errorPrefix + ' must ground at least two metaphysical reading aspects in dream facts');
  }
}

function validateNoMetaphysicalTechnicalLeak(payload, errorPrefix) {
  const nonMetaphysical = Object.assign({}, payload || {});
  delete nonMetaphysical.metaphysical_resonance;
  delete nonMetaphysical.metaphysical_basis;
  delete nonMetaphysical.metaphysical_reading;

  if (METAPHYSICAL_TECHNICAL_PATTERN.test(JSON.stringify(nonMetaphysical))) {
    throw new Error(errorPrefix + ' contains metaphysical technical terms outside metaphysical fields');
  }
}

function metaphysicalDreamAnchor(dreamFacts, dreamText) {
  const facts = dreamFacts || {};
  const candidates = []
    .concat(facts.actions || [])
    .concat(facts.transitions || [])
    .concat(facts.objects || [])
    .concat(facts.places || [])
    .concat(facts.people || [])
    .map(function (item) { return String(item || '').trim(); })
    .filter(Boolean);
  if (candidates.length) {
    const candidate = candidates[0].slice(0, 24);
    // A single-character extracted fact (for example, "猫") cannot satisfy
    // the two-character grounding contract by itself. Keep grounding strict
    // everywhere else; only expand this deterministic fallback anchor with
    // the smallest surrounding phrase from the actual dream text.
    if (candidate.length === 1) {
      const compact = String(dreamText || '').replace(/[\s，。！？、；：“”‘’（）()《》【】,.!?:;\-]/g, '');
      const index = compact.indexOf(candidate);
      if (index >= 0) {
        return compact.slice(Math.max(0, index - 2), Math.min(compact.length, index + 2)) || candidate;
      }
    }
    return candidate;
  }
  return String(dreamText || '')
    .replace(/^[\s\S]{0,3}?梦见/, '')
    .replace(/运势|吉凶|凶吉|注定|必然|命运|四柱|八字|日主|五行|十神|排盘|命盘|命理|命格/g, '')
    .replace(/[，。！？、；：“”‘’（）()《》【】,.!?:;\-\s]+/g, '')
    .slice(0, 12) || '这个梦';
}

function buildMetaphysicalFallback(baziChart, dreamFacts, dreamText) {
  const chart = baziChart || {};
  const profile = chart.chartProfile || {};
  const dayMaster = String(chart.dayMaster || '').trim() || '未知';
  const dayElement = String(profile.dayMasterElement || '').trim();
  const dominant = Array.isArray(profile.dominantElements) && profile.dominantElements.length
    ? String(profile.dominantElements[0])
    : dayElement;
  const elementLabel = dominant || dayElement || '未突出';
  const anchor = metaphysicalDreamAnchor(dreamFacts, dreamText);
  const pillarText = chart.pillars
    ? [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time].filter(Boolean).join('、')
    : '';
  const basis = '依据真太阳时校正后的四柱' + (pillarText ? '（' + pillarText + '）' : '') +
    '，以' + dayMaster + '日主和' + elementLabel + '五行结构作本次文化参照；不用于预测。';

  return {
    resonance: '从四柱中的' + dayMaster + '日主与' + elementLabel + '五行结构看，梦里的“' + anchor +
      '”可被理解为这次被调动的行动方式；这只是命理视角下的有限呼应。',
    basis: basis,
    reading: {
      temperament: '梦里的“' + anchor + '”调动了' + dayMaster + '日主所代表的内在应对底色。',
      dream_echo: '“' + anchor + '”与' + elementLabel + '五行的结构意象形成一处有限呼应。',
      tension: '把“' + anchor + '”放回四柱结构里看，更值得留意的是当下的拉扯，而不是推断结果。',
      rhythm: '围绕“' + anchor + '”，先记录一个今天能观察到的变化；不据此预测后续。',
      basis: basis
    }
  };
}

function modelMetaphysicalText(value, fallback, options) {
  const settings = options || {};
  const text = sanitizeMetaphysicalText(freeformText(value, settings.maxLength || 700), '', settings.maxLength || 700);
  if (!text) return fallback;
  if (settings.requireTechnical && !METAPHYSICAL_TECHNICAL_PATTERN.test(text)) return fallback;
  if (settings.requireGrounded && !isGroundedMetaphysicalText(text, settings.dreamText)) return fallback;
  return text;
}

function requireCompleteModelResult(result, metaphysicalRequired) {
  const requiredStrings = [
    'title',
    'card_theme',
    'card_theme_label',
    'dream_translation',
    'reading_hook',
    'integration_question',
    'image',
    'image_prompt'
  ];
  const missing = requiredStrings.filter(function (field) {
    return !String(result && result[field] || '').trim();
  });
  const facts = result && result.dream_facts ? result.dream_facts : {};

  if (missing.length) {
    throw new Error('AI provider normalized result missing semantic fields: ' + missing.join(','));
  }
  if (allowedThemes.indexOf(result.card_theme) < 0) {
    throw new Error('AI provider normalized result lost model-selected card theme');
  }
  if (!Array.isArray(result.symbols) || !facts || typeof facts !== 'object') {
    throw new Error('AI provider normalized result lost dream fact structure');
  }
  if (!Array.isArray(result.possible_connections)) {
    throw new Error('AI provider normalized result lost possible connection structure');
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
  if (!result.omens || typeof result.omens !== 'object') throw new Error('AI provider normalized result lost color guidance');
  return result;
}

function normalizeAiResult(raw, dreamText, profile, cardIndex, sourceLabel, memory, baziChart, lifeNote) {
  const nickname = String(profile.nickname || '你');
  const rawOmens = raw && raw.omens ? raw.omens : {};
  const modelSymbols = normalizeSymbols(raw && raw.symbols);
  const symbols = groundedFactArray(modelSymbols, dreamText, 5, 32);
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
  const metaphysicalFallback = { resonance: '', basis: '', reading: { temperament: '', dream_echo: '', tension: '', rhythm: '', basis: '' } };
  const normalized = {
    title: repairDreamTerms(asString(raw && raw.title, '', 24), '梦境记录'),
    card_no: 'NO. ' + String(cardIndex).padStart(3, '0'),
    card_theme: normalizeTheme(raw && raw.card_theme, ''),
    card_theme_label: repairDreamTerms(cardThemeLabel, '梦中线索'),
    dream_facts: dreamFacts,
    visual_plan: visualPlan,
    bazi_chart: baziChart || { available: false, precision: 'missing' },
    metaphysicalAvailable: !!(baziChart && baziChart.available),
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
    ), safeBaseFallback('emotional_weather')),
    oracle: repairDreamTerms(asString(
      raw && raw.oracle,
      '',
      360
    ), safeBaseFallback('oracle')),
    card_insight: repairDreamTerms(asString(
      raw && raw.card_insight,
      '',
      360
    ), safeBaseFallback('card_insight')),
    dream_translation: repairDreamTerms(asString(
      raw && raw.dream_translation,
      '',
      700
    ), safeBaseFallback('dream_translation')),
    reading_hook: repairDreamTerms(asString(
      raw && raw.reading_hook,
      '',
      560
    ), safeBaseFallback('reading_hook')),
    metaphysical_resonance: metaphysicalFallback.resonance,
    metaphysical_basis: metaphysicalFallback.basis,
    metaphysical_reading: metaphysicalFallback.reading,
    underneath: repairDreamTerms(freeformText(raw && raw.underneath, 700), ''),
    cultural_symbolism: sanitizeFortuneClaims(repairDreamTerms(freeformText(raw && raw.cultural_symbolism, 700), '')),
    // mirror 同样要过一遍：它是对 possible_connections 的总结，而且在一条呼应
    // 都没有时会被结果页当成「与你有关」的正文顶上去。
    mirror: stripConnectionLabels(repairDreamTerms(asString(
      raw && raw.mirror,
      '',
      700
    ), safeBaseFallback('mirror'))),
    possible_connections: (function () {
      const candidateConnections = asStringArray(raw && raw.possible_connections, [], 3, 260).map(function (item) {
        return stripConnectionLabels(repairDreamTerms(item, ''));
      }).filter(Boolean);
      return candidateConnections;
    }()),
    // 已下线的模块。它本意是防止解读硬化成人格判决，实际输出却变成「这也许
    // 只是大脑随机拼接」——读完前面三段再被告知这可能是噪音，等于自己拆自己
    // 的台。字段保留只为让老梦卡的数据不丢，不再向模型索取、也不再渲染。
    alternative_reading: repairDreamTerms(asString(raw && raw.alternative_reading, '', 360), ''),
    memory_profile: dreamMemory,
    integration_question: repairDreamTerms(asString(
      raw && raw.integration_question,
      '',
      160
    ), safeBaseFallback('integration_question')),
    one_small_act: repairDreamTerms(asString(
      raw && raw.one_small_act,
      '',
      80
    ), safeBaseFallback('one_small_act')),
    image: repairDreamTerms(asString(
      raw && raw.image,
      '',
      420
    ), safeBaseFallback('image')),
    image_prompt: repairDreamTerms(asString(
      raw && raw.image_prompt,
      '',
      360
    ), safeBaseFallback('image_prompt')),
    echo: repairDreamTerms(asString(raw && raw.echo, '', 220), safeBaseFallback('echo')),
    omens: {
      lucky_color_name: asString(rawOmens.lucky_color_name, '', 24),
      reason: repairDreamTerms(asString(rawOmens.reason, '', 220), '')
    }
  };

  validateMetaphysicalContract(normalized, dreamText, false, 'AI provider normalized result');
  return requireCompleteModelResult(normalized, false);
}

function buildUserContext(profile, dreamText, memory, lifeNote) {
  var parts = [];
  var dreamMemory = memory || buildDreamMemory([]);
  var boundedMemory = {
    dreamCount: dreamMemory.dreamCount,
    recurringSymbols: dreamMemory.recurringSymbols.slice(0, 3),
    recent: dreamMemory.recent.slice(0, 3)
  };
  var portrait = profile && (profile.currentPortrait || profile.confirmedPortrait);
  var portraitSummary;
  var echoes = buildMemoryEchoes(dreamMemory, dreamText);

  if (profile.nickname) parts.push('用户称呼：' + profile.nickname);
  parts.push('今日日期：' + new Date().toISOString().slice(0, 10));
  if (echoes.length) {
    // 这一段是已经核对过的事实：这些意象既在今晚的梦里，也在过去的梦里。
    parts.push('已核实的历史呼应（这些意象在今晚的梦和过去的梦里同时出现，是可以直接说出口的重复，'
      + '至少在 possible_connections 或 underneath 中点出其中最有分量的一处，并带上时间感；'
      + '不得改写次数与时间，也不得据此断言现实生活中发生了什么）：'
      + JSON.stringify(echoes));
  }
  parts.push('最多 3 条历史观察（背景参考，没有具体呼应时不得提及）：' + JSON.stringify(boundedMemory));
  if (lifeNote) {
    parts.push('用户曾经明确确认过的真实情况（只能在明显相关时自然提及，不得判断对错，不得预测）：' + lifeNote.text);
  }
  if (portrait && portrait.useInFutureReadings !== false) {
    portraitSummary = {
      version: portrait.version,
      summary: asString(portrait.summary, '', 500),
      themes: Array.isArray(portrait.themes) ? portrait.themes.slice(0, 3) : [],
      emotionalTone: asString(portrait.emotionalTone || portrait.emotionTone, '', 100),
      changing: asString(portrait.changing || portrait.change, '', 120)
    };
    parts.push('当前阶段画像（默认用于理解，可被用户暂停；只能作为不超过500字的可修正背景，不得覆盖本次梦境事实）：'
      + asString(JSON.stringify(portraitSummary), '', 500));
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
  const requiredFields = [
    'title',
    'card_theme',
    'card_theme_label',
    'dream_facts',
    'symbols',
    'emotional_weather',
    'oracle',
    'card_insight',
    'dream_translation',
    'reading_hook',
    'cultural_symbolism',
    'underneath',
    'possible_connections',
    'mirror',
    'integration_question',
    'one_small_act',
    'image',
    'image_prompt',
    'visual_plan',
    'echo',
    'omens'
  ];
  const requiredStrings = [
    'title',
    'card_theme',
    'card_theme_label',
    'dream_translation',
    'reading_hook',
    'image',
    'image_prompt',
    'integration_question'
  ];
  const missingFields = requiredFields.filter(function (field) {
    return !Object.prototype.hasOwnProperty.call(raw || {}, field);
  });
  const missingStrings = requiredStrings.filter(function (field) {
    return !String(raw && raw[field] || '').trim();
  });
  const rawFacts = raw && raw.dream_facts;
  const visualPlan = raw && raw.visual_plan;
  const possibleConnections = raw && raw.possible_connections;
  const omens = raw && raw.omens;

  if (missingFields.length) {
    throw new Error('AI provider response missing semantic fields: ' + missingFields.join(','));
  }
  if (missingStrings.length) {
    throw new Error('AI provider response missing semantic fields: ' + missingStrings.join(','));
  }
  if (allowedThemes.indexOf(String(raw && raw.card_theme || '')) < 0) throw new Error('AI provider response did not include a valid card theme');
  if (!isRecord(rawFacts) || !Array.isArray(raw.symbols) || !Array.isArray(possibleConnections)) {
    throw new Error('AI provider response did not include renderable dream structures');
  }
  if (
    !isRecord(visualPlan) ||
    !Object.prototype.hasOwnProperty.call(visualPlan, 'main_event') ||
    !Object.prototype.hasOwnProperty.call(visualPlan, 'setting') ||
    !Object.prototype.hasOwnProperty.call(visualPlan, 'preserve_elements') ||
    !Array.isArray(visualPlan.preserve_elements)
  ) {
    throw new Error('AI provider response did not include a visual plan structure');
  }
  if (!isRecord(omens)) throw new Error('AI provider response did not include color guidance');
  // 主解读的命理字段由归一化固定为空；完整命理契约只在按需请求中校验。
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
    timeoutBudget: {
      minMs: MIN_TIMEOUT_MS,
      maxMs: MAX_TIMEOUT_MS,
      cloudFunctionMs: 60000
    },
    supported: !config.unsupported,
    fallbackProvider: 'none'
  };
}

function providerTimeoutError() {
  const error = new Error('AI provider request timed out');
  // Keep the code stable for clients and logs; the human-readable message is
  // intentionally still available as provider_error for support diagnostics.
  error.errorCode = 'provider_timeout';
  error.code = 'AI_PROVIDER_TIMEOUT';
  error.reason = 'provider_timeout';
  return error;
}

function decorateProviderError(error, config, startedAt) {
  const value = error || new Error('unknown_error');
  const timedOut = value.errorCode === 'provider_timeout' || value.code === 'AI_PROVIDER_TIMEOUT' || /timed out|timeout/i.test(value.message || '');
  const timeoutMs = effectiveTimeoutMs();
  value.errorCode = timedOut ? 'provider_timeout' : (value.errorCode || 'provider_error');
  value.code = timedOut ? 'AI_PROVIDER_TIMEOUT' : (value.code || 'AI_PROVIDER_ERROR');
  value.provider = config && config.provider ? config.provider : '';
  value.model = config && config.model ? config.model : '';
  value.requestTimeoutMs = timeoutMs;
  value.elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  return value;
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
      request.destroy(providerTimeoutError());
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
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: buildInterpretationSystemPrompt() },
      { role: 'user', content: buildUserContext(profile, dreamText, memory, lifeNote) }
    ],
    temperature: 0.78
  }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('AI provider HTTP ' + response.statusCode + ': ' + response.text.slice(0, 180));
  }

  const data = JSON.parse(response.text);
  const extracted = extractMessageContent(data);

  if (!extracted.content) {
    throw emptyContentError(extracted);
  }

  return parseJsonResponse(extracted.content);
}

async function interpretWithAi(profile, dreamText, cardIndex, memory, baziChart, lifeNote) {
  const config = providerConfig();
  const startedAt = Date.now();

  if (config.provider === 'static') {
    throw new Error('AI provider is not configured');
  }

  if (config.unsupported) {
    throw new Error('Unsupported INTERPRET_PROVIDER: ' + config.provider);
  }

  if (!config.apiKey) {
    throw new Error('Missing API key for INTERPRET_PROVIDER=' + config.provider);
  }

  let raw;
  try {
    raw = await callOpenAiCompatible(config, profile, dreamText, memory, baziChart, lifeNote);
    validateAiSemanticPayload(raw, dreamText, baziChart);
  } catch (error) {
    throw decorateProviderError(error, config, startedAt);
  }

  return {
    provider: config.provider,
    model: config.model || '',
    result: normalizeAiResult(raw, dreamText, profile, cardIndex, 'AI 梦卡', memory, baziChart, lifeNote)
  };
}

function compactMetaphysicalBaseResult(value) {
  const result = value && typeof value === 'object' ? value : {};
  return {
    title: asString(result.title, '', 80),
    symbols: asStringArray(result.symbols, [], 5, 32),
    dream_translation: asString(result.dream_translation, '', 700),
    underneath: asString(result.underneath, '', 500)
  };
}

function compactMetaphysicalChart(value) {
  const chart = value && typeof value === 'object' ? value : {};
  return {
    precision: chart.precision || '',
    calculationVersion: chart.calculationVersion || '',
    pillars: chart.pillars || {},
    dayMaster: chart.dayMaster || '',
    fiveElements: chart.fiveElements || {},
    tenGods: chart.tenGods || {}
  };
}

function normalizeMetaphysicalOnlyResult(raw, dreamText) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawReading = source.metaphysical_reading && typeof source.metaphysical_reading === 'object'
    ? source.metaphysical_reading
    : {};
  const result = {
    metaphysical_resonance: asString(source.metaphysical_resonance, '', 700),
    metaphysical_basis: asString(source.metaphysical_basis, '', 360),
    metaphysical_reading: {
      temperament: asString(rawReading.temperament, '', 520),
      dream_echo: asString(rawReading.dream_echo, '', 520),
      tension: asString(rawReading.tension, '', 520),
      rhythm: asString(rawReading.rhythm, '', 520),
      basis: asString(rawReading.basis, '', 360)
    }
  };

  validateMetaphysicalContract(result, dreamText, true, 'Metaphysical reading');
  return result;
}

async function runMetaphysicalReading(event, profile, baziChart) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const baseResult = compactMetaphysicalBaseResult(event && event.baseResult);
  const timeoutMs = effectiveTimeoutMs();
  const startedAt = Date.now();
  const safety = validateDreamText(dreamText);

  if (!safety.safe) {
    return { ok: false, blocked: true, reason: safety.reason, message: safety.message };
  }
  if (!baziChart || !baziChart.available) {
    // buildBaziChart 已经分清了「日期或时间没填」和「城市认不出来」，还准备好了
    // 对应的提示语。旧实现把这些全丢掉，一律回 birth_profile_missing，于是三样
    // 都填过的用户被要求「先补充出生日期、时间和城市」——他填了，只是写的城市
    // 不在识别表里。报错必须说出真正的原因，否则用户无从修起。
    const unresolvedPlace = baziChart && baziChart.precision === 'location_unresolved';
    return {
      ok: false,
      reason: unresolvedPlace ? 'birth_place_unresolved' : 'birth_profile_missing',
      precision: (baziChart && baziChart.precision) || 'missing',
      message: (baziChart && (baziChart.basis || baziChart.summary)) || '请先补充出生日期、时间和城市。'
    };
  }
  if (config.provider === 'static' || config.unsupported || !config.apiKey) {
    const diagnostic = decorateProviderError(
      new Error(config.provider === 'static' ? 'AI provider is not configured' : 'Missing API key for configured provider'),
      config,
      startedAt
    );
    return {
      ok: false,
      reason: 'ai_provider_unavailable',
      retryable: true,
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error',
      message: '出生节律暂时不可用，请稍后再试。'
    };
  }

  try {
    const response = await postJson(config.baseUrl + '/chat/completions', {
      Authorization: 'Bearer ' + config.apiKey
    }, {
      model: config.model,
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: METAPHYSICAL_READING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: '确定性出生盘面：' + JSON.stringify(compactMetaphysicalChart(baziChart)) +
            '\n主解读摘要：' + JSON.stringify(baseResult) +
            '\n梦境原文：' + dreamText
        }
      ],
      temperature: 0.58
    }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error('AI provider HTTP ' + response.statusCode + ': ' + response.text.slice(0, 180));
    }
    const data = JSON.parse(response.text);
    const extracted = extractMessageContent(data);
    if (!extracted.content) throw emptyContentError(extracted);
    const result = normalizeMetaphysicalOnlyResult(parseJsonResponse(extracted.content), dreamText);

    return {
      ok: true,
      metaphysical_resonance: result.metaphysical_resonance,
      metaphysical_basis: result.metaphysical_basis,
      metaphysical_reading: result.metaphysical_reading,
      provider: config.provider,
      model: config.model || '',
      promptVersion: PROMPT_VERSION,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    };
  } catch (error) {
    const diagnostic = decorateProviderError(error, config, startedAt);
    return {
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error',
      message: '出生节律暂时不可用，请稍后再试。'
    };
  }
}

async function loadRecentLifeNotes(openid, limit) {
  if (!db || !openid) return [];
  try {
    const response = await db.collection('life_notes')
      .where({ openid: openid })
      .orderBy('createdAt', 'desc')
      .limit(Math.max(1, Number(limit) || 6))
      .get();
    return (response && Array.isArray(response.data) ? response.data : [])
      .map(function (item) { return asString(item && item.text, '', 160); })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

// 「聊一聊」此前是整个系统里唯一读不到长期记忆的地方：解梦能看到画像、现实线索
// 和反复出现的意象，对话却每次都从零认识这个人一遍。同一个用户聊了三个月，
// 对话的第一句和第一天没有区别——割裂感就是从这里来的。
//
// 拿不到就返回 null，让对话照常进行：认不出这个人是遗憾，聊不了才是故障。
async function loadChatBackground(openid, dreamText) {
  if (!openid) return null;

  let portrait = null;
  let notes = [];
  let memory = null;

  try {
    const loaded = await Promise.all([
      loadCurrentPortrait(openid),
      loadRecentLifeNotes(openid, 6),
      loadDreamMemory(openid)
    ]);
    portrait = loaded[0];
    notes = loaded[1];
    memory = loaded[2];
  } catch (error) {
    return null;
  }

  // 反复出现的意象只取这次这个梦里真的出现了的那几个。全量塞进去，对每个梦
  // 都是同一份背景板，模型要么闭嘴要么硬提——两种都不是「记得」。
  const echoes = buildMemoryEchoes(memory, dreamText)
    .slice(0, 3)
    .map(function (echo) {
      return {
        symbol: asString(echo && echo.symbol, '', 30),
        count: Math.max(0, Number(echo && echo.count) || 0)
      };
    })
    .filter(function (echo) { return echo.symbol; });

  const portraitSummary = portrait ? asString(portrait.summary || portrait.profileText, '', 500) : '';
  if (!portraitSummary && !notes.length && !echoes.length) return null;

  return {
    stagePortrait: portraitSummary,
    confirmedLifeNotes: notes,
    recurringSymbolsAlsoInThisDream: echoes
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
    openingQuestion: asString(result.integration_question, '', 180),
    readingHook: asString(result.reading_hook, '', 560),
    underneath: asString(result.underneath, '', 700),
    culturalSymbolism: asString(result.cultural_symbolism, '', 700),
    alternativeReading: asString(result.alternative_reading, '', 360),
    profileSummary: asString(result.profile_summary, '', 500),
    metaphysicalResonance: asString(result.metaphysical_resonance, '', 700),
    metaphysicalReading: result.metaphysical_reading && typeof result.metaphysical_reading === 'object'
      ? result.metaphysical_reading
      : null,
    baziChart: result.bazi_chart && typeof result.bazi_chart === 'object' ? result.bazi_chart : null
  };
}

// 逐字校验是防止模型把自己的话记成用户的话，这条不能松。但「逐字」不该被
// 标点和空格卡住：模型经常把句中的逗号补成句号、或者顺手删掉一个空格，原本
// 完全合格的引用就这样被静默丢掉，表现出来就是「提取得不全」，而且没有任何
// 日志说明发生过什么。所以比对时两边都剥掉标点和空白，取回的仍然是用户原文
// 里的那一段。
function comparableQuote(value) {
  return String(value || '').replace(/[\s，。、；：！？…—～·「」『』“”‘’（）()《》,.!?;:~"']/g, '');
}

function validatedRealityClue(value, userMessage, eligible) {
  // The model makes the semantic decision. The server only proves that its
  // candidate is a contiguous quote from this exact user message.
  const clue = asString(value, '', 300);
  const source = asString(userMessage, '', 500);
  if (eligible !== true || !clue) return '';
  if (source.indexOf(clue) >= 0) return clue;
  const strippedSource = comparableQuote(source);
  const strippedClue = comparableQuote(clue);
  if (!strippedClue || strippedSource.indexOf(strippedClue) < 0) return '';
  return clue;
}

// 标签只是标签：超长就砍掉，砍完是空的就让界面回去截原话。它永远不会替代
// 原话被存下来，也不会进画像的输入——模型概括错了，最多是列表上的一行标题
// 不准，掀不动记录本身。
function validatedClueGist(value, clue) {
  const gist = asString(value, '', 40).replace(/\s+/g, '').replace(/[。！？…]+$/, '');
  if (!gist || gist.length > 14) return '';
  // 概括和原话一样长就不是概括，不如让界面自己截。
  if (gist.length >= asString(clue, '', 300).length) return '';
  return gist;
}

// 一条消息里往往同时有好几件事。老契约只收一条，剩下的直接蒸发。
// 仍然认旧的单条字段：线上可能有正在返回旧格式的调用，也可能有缓存的响应。
function collectRealityClues(parsed, userMessage) {
  const raw = Array.isArray(parsed && parsed.memory_candidates)
    ? parsed.memory_candidates
    : [parsed && parsed.memory_candidate];
  const clues = [];
  raw.slice(0, 3).forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const clue = validatedRealityClue(item.quote, userMessage, item.eligible);
    if (!clue) return;
    // 同一条消息里模型偶尔会把同一句话拆两遍报上来。
    if (clues.some(function (existing) { return existing.text === clue; })) return;
    clues.push({ text: clue, gist: validatedClueGist(item.gist, clue) });
  });
  return clues;
}

function parseDreamChatContent(content, userMessage) {
  let parsed;
  let reply;

  try {
    parsed = parseJsonResponse(content);
  } catch (error) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { reply: asString(content, '', 1200), realityClue: '', realityClues: [], realityClueGists: [] };
  }
  reply = asString(parsed.reply, '', 1200);
  const clues = collectRealityClues(parsed, userMessage);
  return {
    reply: reply,
    // realityClue 保留给还没更新的客户端；新客户端读 realityClues。
    realityClue: (clues[0] && clues[0].text) || '',
    // realityClues 必须继续是字符串数组：线上还有旧客户端在 String() 它的每一
    // 项，换成对象那边会存下一串 [object Object]。标签走并行数组，同序等长，
    // 旧客户端看不见也不受影响。
    realityClues: clues.map(function (clue) { return clue.text; }),
    realityClueGists: clues.map(function (clue) { return clue.gist; })
  };
}

// ── 画像纠偏对话 ────────────────────────────────────────────────────────
//
// 画像下面原来挂着两个东西：一个「不像」按钮和一个让用户自己重写的输入框。
// 按钮只能传达「错了」，传达不了「哪里错」——系统拿到一个 bit，不够生成任何
// 新东西。输入框信息量够了，却把写作负担丢给用户，而且他写的那句话会被当成
// 最高权重原文照抄回画像，等于让用户自己给自己下判断，这份画像就没有存在的
// 意义了。
//
// 两个都换成对话。开口成本低到一句「不对，我不是那样的」，而系统可以追问到
// 具体；用户说出来的每一句都按原话存进 life_notes，下一版画像直接用它。
const PORTRAIT_CHAT_SYSTEM_PROMPT = [
  '你是 Oneiro。用户刚读完你为他写的那份阶段画像，觉得哪里不对，来跟你说。',
  '你的目标只有一个：搞清楚哪一句不对、实际是什么样。不是安抚他，也不是为画像辩护。',
  '他说不对，就是不对——画像是我们写的，他是当事人。不要解释我们为什么那样写，不要说「这可能是因为」，更不要试图把他的反驳解释成画像的另一种正确。',
  '追问要落到具体的事上：问他最近实际发生的一件事、他当时怎么做的、和画像里说的差在哪。抽象的追问（「你觉得自己是个怎样的人」）拿不到任何可用的东西。',
  '每一轮的形状不要一样，不要每条都以问题收尾。有时候把他刚说的话确认一遍、往前推一句就够了。',
  '严禁复述整段画像，也不要逐句念给他听。要指认就只引用你正在谈的那一句。',
  '严禁提及出生资料、生辰、八字、星座、五行或任何命理概念，即使画像里提过。用户问起画像是怎么来的，就说它来自他记录的东西和你们聊过的内容，还很粗糙，正在跟着他的反馈改。',
  '不做医疗、创伤、人格障碍层面的诊断，不预测未来，不断吉凶。',
  '回复 2-4 句话，说人话，不要小标题不要列点。',
  '只返回合法 JSON，不要 markdown：{"reply":"回复正文"}。'
].join('\n');

async function loadPortraitChatBackground(openid) {
  if (!openid) return null;
  try {
    const loaded = await Promise.all([
      loadCurrentPortrait(openid),
      loadRecentLifeNotes(openid, 6)
    ]);
    const portrait = loaded[0];
    const notes = loaded[1] || [];
    const summary = portrait ? asString(portrait.summary || portrait.profileText, '', 500) : '';
    if (!summary && !notes.length) return null;
    return { stagePortrait: summary, knownLifeNotes: notes };
  } catch (error) {
    return null;
  }
}

// 用户在这里说的话是专程来纠正画像的，指向性比梦后闲聊强得多，所以原样存下来，
// 不做抽取也不做改写——一改写就又变成我们的措辞了。写失败不影响这次对话：
// 记不住是遗憾，回不上话才是故障。
async function recordPortraitCorrection(openid, userMessage) {
  if (!db || !openid) return false;
  const normalized = asString(userMessage, '', 220);
  if (!normalized) return false;
  try {
    const existing = await db.collection('life_notes')
      .where({ openid: openid, source: 'portrait_correction', text: normalized })
      .limit(1)
      .get();
    if (existing && existing.data && existing.data[0]) return true;
    await db.collection('life_notes').add({ data: {
      openid: openid,
      text: normalized,
      source: 'portrait_correction',
      sourceDreamId: '',
      createdAt: new Date()
    } });
    return true;
  } catch (error) {
    return false;
  }
}

async function runPortraitChat(event, openid) {
  const config = providerConfig();
  const userMessage = asString(event && event.userMessage, '', 500);
  const history = normalizeChatHistory(event && event.messages);
  const timeoutMs = effectiveTimeoutMs();
  const startedAt = Date.now();
  let i;

  if (!userMessage) {
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

  const background = await loadPortraitChatBackground(openid);
  const systemMessages = [{ role: 'system', content: PORTRAIT_CHAT_SYSTEM_PROMPT }];
  if (background) {
    systemMessages.push({
      role: 'system',
      content: '这个人当前的阶段画像与已知现实线索：' + JSON.stringify(background)
    });
  }

  async function requestChat(useJsonFormat) {
    const payload = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: systemMessages.concat(history).concat([{ role: 'user', content: userMessage }]),
      temperature: 0.62
    };
    if (useJsonFormat) payload.response_format = { type: 'json_object' };
    const response = await postJson(config.baseUrl + '/chat/completions', {
      Authorization: 'Bearer ' + config.apiKey
    }, payload, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error('Portrait chat provider failed');
    }
    return extractMessageContent(JSON.parse(response.text));
  }

  try {
    let extracted = await requestChat(true);
    let content = asString(extracted.content, '', 1200);
    if (!content) {
      extracted = await requestChat(false);
      content = asString(extracted.content, '', 1200);
    }
    if (!content) throw emptyContentError(extracted);
    const chatContent = parseDreamChatContent(content, userMessage);
    const recorded = await recordPortraitCorrection(openid, userMessage);
    return {
      ok: true,
      provider: config.provider,
      model: config.model || '',
      fallback: false,
      reply: chatContent.reply,
      recorded: recorded
    };
  } catch (error) {
    const diagnostic = decorateProviderError(error, config, startedAt);
    return {
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error',
      message: 'AI 对话暂时不可用，请稍后再试。'
    };
  }
}

async function runDreamChat(event, openid) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const userMessage = asString(event && event.userMessage, '', 500);
  const history = normalizeChatHistory(event && event.messages);
  const summary = chatResultSummary(event && event.dreamResult);
  const timeoutMs = effectiveTimeoutMs();
  const startedAt = Date.now();
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

  const background = await loadChatBackground(openid, dreamText);
  const systemMessages = [
    { role: 'system', content: DREAM_CHAT_SYSTEM_PROMPT },
    { role: 'system', content: '当前梦境原文：' + dreamText + '\n当前解读上下文：' + JSON.stringify(summary) }
  ];
  if (background) {
    systemMessages.push({
      role: 'system',
      content: '这个人的长期背景（只在与他此刻说的话或这个梦有具体呼应时才提起）：' + JSON.stringify(background)
    });
  }

  async function requestChat(useJsonFormat) {
    const payload = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: systemMessages.concat(history).concat([{ role: 'user', content: userMessage }]),
      temperature: 0.62
    };
    if (useJsonFormat) payload.response_format = { type: 'json_object' };
    const response = await postJson(config.baseUrl + '/chat/completions', {
      Authorization: 'Bearer ' + config.apiKey
    }, payload, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error('Dream chat provider failed');
    }
    return extractMessageContent(JSON.parse(response.text));
  }

  try {
    let extracted = await requestChat(true);
    let content = asString(extracted.content, '', 1200);

    // JSON 模式偶尔会回一具空壳（思考型模型尤其容易：推理吃掉输出预算，正文
    // 返回空串）。那本来只让 memory_candidate 落空，却把整条回复也一起废掉——
    // 用户看到的是「这次没回上来」。回复是必需品，JSON 只是为了顺带取一条现实
    // 线索，不该由可选项决定必需项的成败：空了就退回纯文本再要一次。
    if (!content) {
      extracted = await requestChat(false);
      content = asString(extracted.content, '', 1200);
    }
    if (!content) {
      throw emptyContentError(extracted);
    }
    const chatContent = parseDreamChatContent(content, userMessage);
    return {
      ok: true,
      provider: config.provider,
      model: config.model || '',
      fallback: false,
      reply: chatContent.reply,
      realityClue: chatContent.realityClue,
      realityClues: chatContent.realityClues || [],
      realityClueGists: chatContent.realityClueGists || []
    };
  } catch (error) {
    const diagnostic = decorateProviderError(error, config, startedAt);
    return {
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error',
      message: 'AI 对话暂时不可用，请稍后再试。'
    };
  }
}

async function runDreamRefinement(event) {
  const config = providerConfig();
  const dreamText = asString(event && event.dreamText, '', 1200);
  const answer = asString(event && event.answer, '', 500);
  const summary = chatResultSummary(event && event.dreamResult);
  const profile = event && event.profile && typeof event.profile === 'object' ? event.profile : {};
  const timeoutMs = effectiveTimeoutMs();
  const startedAt = Date.now();
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
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: DREAM_REFINE_SYSTEM_PROMPT },
        { role: 'user', content: '原梦：' + dreamText + '\n初版解读与上下文：' + JSON.stringify(summary) + '\n画像摘要：' + JSON.stringify(profile.confirmedPortrait || profile.profileSummary || summary.profileSummary || '') + '\n用户原始回答：' + answer }
      ],
      temperature: 0.48
    }, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('Dream refinement provider failed');
    const data = JSON.parse(response.text);
    const extracted = extractMessageContent(data);
    if (!extracted.content) {
      throw emptyContentError(extracted);
    }
    const parsed = parseJsonResponse(extracted.content);
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
    const diagnostic = decorateProviderError(error, config, startedAt);
    return {
      ok: false,
      reason: 'ai_provider_error',
      retryable: true,
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error'
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
  const profile = sanitizeProfileInput(event && event.profile);
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
    return runDreamChat(event, wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  }

  if (event && event.chatAboutPortrait) {
    return runPortraitChat(event, wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  }

  if (event && event.refineDream) {
    return runDreamRefinement(event);
  }

  if (event && event.metaphysicalReading === true) {
    return runMetaphysicalReading(event, profile, baziChart);
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

  const quota = await readInterpretationQuota(wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  if (quota.limited) {
    return {
      ok: false,
      blocked: false,
      quotaExceeded: true,
      reason: 'daily_quota_exceeded',
      // 明天才会变，重试不会有别的结果。客户端据此不显示「重试就能好」那类文案。
      retryable: false,
      dailyLimit: quota.limit,
      dailyUsed: quota.used,
      message: '今天的解读已经用完 ' + quota.limit + ' 次。这个梦已经存下来了，明天可以接着解读它。'
    };
  }

  memory = await loadDreamMemory(wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  var lifeNote = await loadLifeNote(wxContext && wxContext.OPENID ? wxContext.OPENID : '', dreamText);
  var currentPortrait = await loadCurrentPortrait(wxContext && wxContext.OPENID ? wxContext.OPENID : '');
  if (currentPortrait) {
    profileContext = Object.assign({}, profile, { currentPortrait: currentPortrait, confirmedPortrait: currentPortrait });
  }

  try {
    const interpreted = await interpretWithAi(profileContext, dreamText, cardIndex, memory, baziChart, lifeNote);

    return {
      ok: true,
      provider: interpreted.provider,
      model: interpreted.model || '',
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      metaphysicalAvailable: !!(baziChart && baziChart.available),
      memoryUnavailable: !!(memory && memory.memoryUnavailable),
      memoryEcho: evaluateMemoryEcho(memory, dreamText, interpreted.result),
      result: interpreted.result
    };
  } catch (error) {
    const config = providerConfig();
    const diagnostic = error && error.errorCode && error.requestTimeoutMs
      ? error
      : decorateProviderError(error, config);
    return {
      ok: false,
      blocked: false,
      reason: 'ai_provider_error',
      retryable: true,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      memoryUnavailable: !!(memory && memory.memoryUnavailable),
      provider: diagnostic.provider,
      model: diagnostic.model,
      errorCode: diagnostic.errorCode,
      error_code: diagnostic.errorCode,
      providerErrorCode: diagnostic.errorCode,
      requestTimeoutMs: diagnostic.requestTimeoutMs,
      elapsedMs: diagnostic.elapsedMs,
      diagnostics: {
        code: diagnostic.errorCode,
        provider: diagnostic.provider,
        model: diagnostic.model,
        requestTimeoutMs: diagnostic.requestTimeoutMs,
        elapsedMs: diagnostic.elapsedMs
      },
      provider_error: diagnostic.message ? diagnostic.message.slice(0, 180) : 'unknown_error',
      message: 'AI 解读暂时不可用，请稍后再试。'
    };
  }
};
