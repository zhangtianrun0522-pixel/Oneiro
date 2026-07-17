var ARCHETYPE_MAPPINGS = [
  {
    keywords: ['水', '潮汐'],
    label: '潮汐旅人',
    description: '你或许在适应反复靠近的变化。'
  },
  {
    keywords: ['追逐', '逃跑', '追'],
    label: '奔跑者',
    description: '你可能在靠近目标，也在避开压力。'
  },
  {
    keywords: ['寻找', '寻觅', '迷路'],
    label: '寻路人',
    description: '你或许在寻找尚未清晰的方向。'
  },
  {
    keywords: ['坠落', '下坠'],
    label: '坠落者',
    description: '你可能在感受失控或落差。'
  },
  {
    keywords: ['焦虑', '紧张'],
    label: '守夜人',
    description: '你或许仍在留意尚未落定的事。'
  },
  {
    keywords: ['平静', '安心'],
    label: '静潮者',
    description: '你可能正在靠近内在的安定。'
  },
  {
    keywords: ['愤怒', '生气'],
    label: '烈焰行者',
    description: '你或许在辨认被压低的边界。'
  },
  {
    keywords: ['难过', '孤独'],
    label: '暗礁人',
    description: '你可能在触碰未被说出的失落。'
  },
  {
    keywords: ['兴奋', '激动'],
    label: '追光者',
    description: '你或许正被新的可能吸引。'
  },
  {
    keywords: ['门', '钥匙'],
    label: '启门人',
    description: '你可能在靠近一次选择或转折。'
  },
  {
    keywords: ['光', '月光'],
    label: '守光者',
    description: '你或许在寻找微弱但可靠的方向。'
  },
  {
    keywords: ['学校', '考试', '迟到'],
    label: '迟到者',
    description: '你可能仍在回应评价与时间压力。'
  },
  {
    keywords: ['家', '房子', '故乡'],
    label: '归巢者',
    description: '你或许在重新确认归属与安全感。'
  },
  {
    keywords: ['飞', '飞行'],
    label: '凌空者',
    description: '你可能在试探自由与掌控之间。'
  },
  {
    keywords: ['蛇'],
    label: '蜕变者',
    description: '你或许在感知变化或隐约的不安。'
  }
];

var FALLBACK_ARCHETYPE = {
  label: '观察者',
  description: '你的梦境正在积累线索，模式还在慢慢显现。'
};

function normalizeKeyword(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function buildMappingIndex() {
  var index = {};
  var i;
  var j;
  var item;

  for (i = 0; i < ARCHETYPE_MAPPINGS.length; i += 1) {
    item = ARCHETYPE_MAPPINGS[i];
    for (j = 0; j < item.keywords.length; j += 1) {
      index['$' + item.keywords[j]] = {
        label: item.label,
        description: item.description
      };
    }
  }

  return index;
}

var ARCHETYPE_MAPPING_INDEX = buildMappingIndex();

function countRecordKeywords(records, fieldGetter) {
  var counts = {};
  var order = [];
  var i;
  var j;
  var values;
  var seen;
  var keyword;
  var key;

  for (i = 0; i < records.length; i += 1) {
    values = fieldGetter(records[i]);
    values = Array.isArray(values) ? values : [];
    seen = {};

    for (j = 0; j < values.length; j += 1) {
      keyword = normalizeKeyword(values[j]);
      key = '$' + keyword;

      if (!keyword || seen[key]) {
        continue;
      }

      seen[key] = true;
      if (counts[key] === undefined) {
        counts[key] = 0;
        order.push(keyword);
      }
      counts[key] += 1;
    }
  }

  return {
    counts: counts,
    order: order
  };
}

function getActions(record) {
  return record && record.dreamFacts ? record.dreamFacts.actions : [];
}

function getEmotions(record) {
  return record && record.dreamFacts ? record.dreamFacts.emotions : [];
}

function getSymbols(record) {
  return record && record.result ? record.result.symbols : [];
}

function getPlaces(record) {
  return record && record.dreamFacts ? record.dreamFacts.places : [];
}

function computeArchetype(archive) {
  var records = Array.isArray(archive) ? archive : [];
  var categories;
  var best = null;
  var categoryIndex;
  var keywordIndex;
  var category;
  var keyword;
  var count;
  var mapped;

  if (records.length < 3) {
    return { eligible: false };
  }

  categories = [
    countRecordKeywords(records, getActions),
    countRecordKeywords(records, getEmotions),
    countRecordKeywords(records, getSymbols),
    countRecordKeywords(records, getPlaces)
  ];

  for (categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
    category = categories[categoryIndex];

    for (keywordIndex = 0; keywordIndex < category.order.length; keywordIndex += 1) {
      keyword = category.order[keywordIndex];
      count = category.counts['$' + keyword];

      if (count < 3) {
        continue;
      }

      if (!best || count > best.count) {
        best = {
          keyword: keyword,
          count: count,
          categoryIndex: categoryIndex
        };
      }
    }
  }

  if (!best) {
    return { eligible: false };
  }

  mapped = ARCHETYPE_MAPPING_INDEX['$' + best.keyword] || FALLBACK_ARCHETYPE;

  return {
    eligible: true,
    archetype: {
      label: mapped.label,
      description: mapped.description,
      evidenceKeyword: best.keyword,
      evidenceCount: best.count,
      disclaimer: '阶段观察，不是永久人格判定'
    }
  };
}

function buildTopicCard(symbol) {
  return {
    symbol: symbol,
    headline: '最近反复梦见"' + symbol + '"的人，在担心什么？',
    prompt: '如果你也常梦见相似的画面，也许可以试着记下这一次。'
  };
}

module.exports = {
  computeArchetype: computeArchetype,
  buildTopicCard: buildTopicCard
};
