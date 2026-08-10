// 出生盘 → 若干条可被推翻的假设。
//
// 这个模块存在的理由只有一个：新用户一个梦都还没记，画像却需要说点什么。
// 没有证据的时候，先验是手上唯一的东西。但它必须以「假设」的形式进来，
// 不能以「结论」的形式进来——所以这里输出的不是一段话，是几条离散的、
// 带 id 的判断，每一条后面都能挂上支持它或推翻它的证据，也能被整条删掉。
//
// 三条硬规则，改这个文件的人请一起守：
// 1. 输出里不得出现任何命理术语。日主、十神、五行只是这里的计算中间量，
//    用户读到的必须是一句关于他这个人的白话。
// 2. 不断吉凶、不预测、不谈际遇。只写这个人「倾向于怎么反应」。
// 3. 每一条都要具体到用户能当场说「不对」。说不出「不对」的句子（比如
//    「你有时坚强有时脆弱」）在这里没有价值，它永远不会被证据推翻，
//    于是会一直赖在画像里。
const locationResolver = require('./locationResolver');

const STEM_ELEMENT = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水'
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

// A 轴：日主天干。十个干各写一条，讲的是这个人默认的反应方式。
const DAY_MASTER_CLAIMS = {
  '甲': '认定了一个方向就不太容易改道，别人劝你，你会听，但基本不动。',
  '乙': '很少正面顶回去，更习惯绕过去；看着是顺着走的，实际有自己的路线。',
  '丙': '态度藏不住，高兴和不满都写在脸上，来得快也散得快。',
  '丁': '对别人的情绪敏感得过头，屋里谁不舒服，你往往是最先察觉的那个。',
  '戊': '别人的事你容易接过来，接过来之后又不太肯放手。',
  '己': '心里常年同时挂着好几件没解决的事，一件都没真正搁下。',
  '庚': '说话直接，不太愿意为了场面把话磨圆，事后又会想是不是说重了。',
  '辛': '在意做出来的东西够不够好，粗糙的结果别人可能没看出来，你自己先过不去。',
  '壬': '兴趣转得快，被固定的安排框住会明显烦躁。',
  '癸': '想的比说的多，很多已经形成的判断你没打算讲出来。'
};

// B 轴：日主得到的扶助与消耗之比。讲的是压力之下会发生什么。
const STRENGTH_CLAIMS = {
  '扶助偏多': '扛得住事，所以很少开口求助——对你来说求助更像是承认自己不行。',
  '消耗偏多': '和人打交道会实打实地耗掉你的电，事后需要独处很久才补得回来。',
  '扶助与消耗接近': '状态跟着环境走：周围顺你就顺，周围一乱你也跟着乱，自己很难单独稳住。'
};

// C 轴：十神偏向。讲的是他和外部世界（要求、代价、表达、他人）的关系。
const TEN_GOD_GROUPS = [
  { key: 'officer', members: ['正官', '七杀'], claim: '你对自己的要求多半来自外面的标准，不是自己想要什么，而是自己「应该」做到什么。' },
  { key: 'wealth', members: ['正财', '偏财'], claim: '动手之前你会先把代价算清楚，算不清的事你宁可先不做。' },
  { key: 'seal', members: ['正印', '偏印'], claim: '不想明白就不肯开始，所以你卡住的地方常常不是做不到，是还没想好。' },
  { key: 'output', members: ['食神', '伤官'], claim: '需要一个说出来的出口，憋着不讲会难受，讲完了事情本身反而没那么要紧了。' },
  { key: 'peer', members: ['比肩', '劫财'], claim: '习惯跟人比着来，也容易替人出头，事后才发现那件事其实与你无关。' }
];

// D 轴：五行的空缺或独大。只在结构明显偏斜时才给，避免每个人都拿到四条。
const MISSING_ELEMENT_CLAIMS = {
  '木': '长线的事起头容易、续上难，计划做到一半就没了力气。',
  '火': '不太容易被点着，热情通常要等别人先起头。',
  '土': '心里的底不厚，已经定下来的事你还是会想再确认一遍。',
  '金': '取舍的时候反复，做完决定还要回头再想很久。',
  '水': '认死理，一件事想不通就绕不过去，很难换个角度放过自己。'
};

function callEightChar(eightChar, method, fallback) {
  try {
    if (!eightChar || typeof eightChar[method] !== 'function') return fallback;
    const value = eightChar[method]();
    return value === undefined || value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function flatten(value) {
  if (Array.isArray(value)) return value.map(function (item) { return String(item || ''); });
  if (typeof value === 'string' && value) return [value];
  return [];
}

// 盘面本身。这里只算假设映射用得到的那几项——四柱、日主、含藏干的五行分布、
// 十神——不重建 interpretDream 那套完整盘面（纳音、旬空、大运在这里没有用处）。
function computeChartBasis(profile) {
  const safeProfile = profile || {};
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(safeProfile.birthDate || ''));
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(safeProfile.birthTime || ''));
  const location = locationResolver.resolveBirthPlace(safeProfile.birthPlace);
  if (!dateMatch || !timeMatch || !location) return null;

  try {
    const Solar = require('lunar-javascript').Solar;
    const corrected = locationResolver.correctToTrueSolarTime(
      safeProfile.birthDate,
      safeProfile.birthTime,
      location
    );
    if (!corrected || !corrected.ok) return null;

    const solar = Solar.fromYmdHms(
      Number(corrected.date.slice(0, 4)),
      Number(corrected.date.slice(5, 7)),
      Number(corrected.date.slice(8, 10)),
      Number(corrected.time.slice(0, 2)),
      Number(corrected.time.slice(3, 5)),
      0
    );
    const eightChar = solar.getLunar().getEightChar();
    eightChar.setSect(2);

    const keys = ['Year', 'Month', 'Day', 'Time'];
    const dayMaster = String(eightChar.getDayGan() || '');
    if (!STEM_ELEMENT[dayMaster]) return null;

    const elementCounts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    const tenGods = [];
    keys.forEach(function (key) {
      const pillar = String(callEightChar(eightChar, 'get' + key, '') || '');
      const branch = pillar.slice(-1);
      const stem = pillar.slice(0, 1);
      if (STEM_ELEMENT[stem]) elementCounts[STEM_ELEMENT[stem]] += 1;
      const hidden = flatten(callEightChar(eightChar, 'get' + key + 'HideGan', []));
      (hidden.length ? hidden : (HIDDEN_STEMS_BY_BRANCH[branch] || [])).forEach(function (item) {
        const element = STEM_ELEMENT[item];
        if (element) elementCounts[element] += 1;
      });
      // 日柱天干就是日主，它的「十神」是比肩自身，计入会让 peer 永远偏高。
      if (key !== 'Day') tenGods.push(String(callEightChar(eightChar, 'get' + key + 'ShiShenGan', '') || ''));
      flatten(callEightChar(eightChar, 'get' + key + 'ShiShenZhi', [])).forEach(function (item) {
        tenGods.push(item);
      });
    });

    const dayMasterElement = STEM_ELEMENT[dayMaster];
    const supportCount = (elementCounts[dayMasterElement] || 0)
      + (elementCounts[GENERATING_ELEMENT[dayMasterElement]] || 0);
    const drainCount = (elementCounts[PRODUCED_ELEMENT[dayMasterElement]] || 0)
      + (elementCounts[CONTROLLED_ELEMENT[dayMasterElement]] || 0);

    return {
      dayMaster: dayMaster,
      dayMasterElement: dayMasterElement,
      elementCounts: elementCounts,
      tenGods: tenGods.filter(Boolean),
      strengthSignal: supportCount - drainCount > 1
        ? '扶助偏多'
        : supportCount - drainCount < -1 ? '消耗偏多' : '扶助与消耗接近'
    };
  } catch (error) {
    return null;
  }
}

function dominantTenGodGroup(tenGods) {
  let best = null;
  let bestCount = 0;
  TEN_GOD_GROUPS.forEach(function (group) {
    const count = tenGods.filter(function (item) { return group.members.indexOf(item) >= 0; }).length;
    if (count > bestCount) {
      bestCount = count;
      best = group;
    }
  });
  // 两条都只出现一次时没有真正的偏向，宁可不给这条，也不要靠噪声凑满四条。
  return bestCount >= 2 ? best : null;
}

function skewedElement(elementCounts) {
  const elements = ['木', '火', '土', '金', '水'];
  const missing = elements.filter(function (item) { return (elementCounts[item] || 0) === 0; });
  // 缺两行以上时说不清是哪一处失衡，这条就不给了。
  return missing.length === 1 ? missing[0] : '';
}

function hypothesisId(dimension, dayMaster) {
  return 'bz_' + dimension + '_' + dayMaster;
}

// 对外只暴露这一个函数：给资料，拿回若干条待验证的假设。
// 资料不全、城市认不出、排盘失败——一律返回空数组，绝不猜。
function deriveHypotheses(profile, now) {
  const basis = computeChartBasis(profile);
  if (!basis) return [];
  const createdAt = now || new Date();
  const claims = [];

  const dayMasterClaim = DAY_MASTER_CLAIMS[basis.dayMaster];
  if (dayMasterClaim) claims.push({ dimension: 'disposition', claim: dayMasterClaim });

  const strengthClaim = STRENGTH_CLAIMS[basis.strengthSignal];
  if (strengthClaim) claims.push({ dimension: 'pressure', claim: strengthClaim });

  const group = dominantTenGodGroup(basis.tenGods);
  if (group) claims.push({ dimension: 'relation', claim: group.claim });

  const missing = skewedElement(basis.elementCounts);
  if (missing && MISSING_ELEMENT_CLAIMS[missing]) {
    claims.push({ dimension: 'gap', claim: MISSING_ELEMENT_CLAIMS[missing] });
  }

  return claims.slice(0, 4).map(function (item) {
    return {
      id: hypothesisId(item.dimension, basis.dayMaster),
      dimension: item.dimension,
      claim: item.claim,
      origin: 'bazi',
      status: 'untested',
      evidence: [],
      createdAt: createdAt,
      resolvedAt: null
    };
  });
}

module.exports = {
  deriveHypotheses: deriveHypotheses,
  // 导出供测试断言用，产品代码不该直接读它们。
  _internal: {
    computeChartBasis: computeChartBasis,
    DAY_MASTER_CLAIMS: DAY_MASTER_CLAIMS,
    STRENGTH_CLAIMS: STRENGTH_CLAIMS,
    TEN_GOD_GROUPS: TEN_GOD_GROUPS,
    MISSING_ELEMENT_CLAIMS: MISSING_ELEMENT_CLAIMS
  }
};
