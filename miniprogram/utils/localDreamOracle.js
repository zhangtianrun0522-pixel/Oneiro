function cloneResult(result) {
  var copy = {};
  var key;

  for (key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        copy[key] = result[key].slice();
      } else if (result[key] && typeof result[key] === 'object') {
        copy[key] = Object.assign({}, result[key]);
      } else {
        copy[key] = result[key];
      }
    }
  }

  return copy;
}

var symbolRules = [
  {
    label: '暴雨',
    titleWord: '雨',
    theme: 'tide',
    keywords: ['暴雨', '大雨', '下暴雨', '下雨', '雨'],
    meaning: '暴雨把原本在背景里的变化推到眼前，带来突然、密集而难以忽略的输入。',
    mirror: '现实里可能有一件长期没有回应的事，最近突然变成需要你承接的消息、任务或压力。',
    action: '列出一件突然变多的事，标记承接/拒绝'
  },
  {
    label: '暴雪',
    titleWord: '雪',
    theme: 'tide',
    keywords: ['暴雪', '大雪', '下暴雪', '下大雪', '下雪', '飘雪', '雪'],
    meaning: '暴雪把视野、路径和原有秩序一起遮住，也让环境的变化变得无法忽略。',
    mirror: '现实里可能有一件事突然变得更难判断，但它也迫使你看清真正需要保留的东西。',
    action: '写下一个需要先观察再应对的变化'
  },
  {
    label: '沙漠',
    titleWord: '漠',
    theme: 'mist',
    keywords: ['沙漠', '荒漠', '沙丘'],
    meaning: '沙漠把资源稀薄、路径难寻和缺少遮蔽的处境压缩成一个空间。',
    mirror: '现实里可能有一件事长期缺少进展、回应或可用资源。',
    action: '写下目前最缺的一项资源'
  },
  {
    label: '玫瑰',
    titleWord: '花',
    theme: 'hearth',
    keywords: ['玫瑰花', '玫瑰', '花朵', '鲜花'],
    meaning: '玫瑰把美感、欲望、照料与刺痛放在同一朵花里；它从哪里出现，比花本身更重要。',
    mirror: '你可能正在面对一个条件并不理想，却已经开始生长的念头、关系或机会。',
    action: '给一个正在生长的念头留出一小时'
  },
  {
    label: '清水',
    titleWord: '潮',
    theme: 'tide',
    keywords: ['海', '河', '湖', '洪水', '清水', '溪', '江', '池'],
    meaning: '明确出现的水体代表正在浮上来的情绪、直觉和记忆。',
    mirror: '你可能正在让某个感受越过理性控制，开始承认它真实存在。',
    action: '写下这股情绪最想保护你的部分'
  },
  {
    label: '门',
    titleWord: '门',
    theme: 'threshold',
    keywords: ['门', '入口', '出口', '房间', '走廊', '电梯'],
    meaning: '门和通道代表阶段转换，也代表你对未知选择的试探。',
    mirror: '现实里有一个选择已经靠近，你在判断自己是否准备好进入下一层。',
    action: '列出一个你正在犹豫的入口'
  },
  {
    label: '钥匙',
    titleWord: '钥',
    theme: 'threshold',
    keywords: ['钥匙', '锁', '密码'],
    meaning: '钥匙象征解决问题的线索，或你已经拥有但尚未使用的能力。',
    mirror: '你并非没有答案，更像是在等待一个可以安心使用答案的时机。',
    action: '写下你已经拥有的一项资源'
  },
  {
    label: '追逐',
    titleWord: '影',
    theme: 'shadow',
    keywords: ['追', '跑', '逃', '躲', '怪物', '赶不上'],
    meaning: '追逐常把压力、未处理的责任或被压住的欲望具象化。',
    mirror: '你可能正在回避一个需要面对的对话、期限或真实愿望。',
    action: '把正在追你的事命名成一句话'
  },
  {
    label: '坠落',
    titleWord: '坠',
    theme: 'falling',
    keywords: ['掉下', '坠落', '摔', '悬崖', '失重', '飞不起来'],
    meaning: '坠落代表失控感，也可能是从旧支撑里脱落出来。',
    mirror: '某个稳定结构正在松动，但它未必只意味着危险，也可能意味着重排。',
    action: '找出一件你还能控制的小事'
  },
  {
    label: '学校',
    titleWord: '课',
    theme: 'archive',
    keywords: ['学校', '考试', '老师', '同学', '作业', '迟到'],
    meaning: '学校和考试让评价感、表现压力和旧身份重新浮现。',
    mirror: '你可能正在用过去的标准衡量现在的自己。',
    action: '删掉一个不再适合你的旧标准'
  },
  {
    label: '家屋',
    titleWord: '屋',
    theme: 'hearth',
    keywords: ['家', '房子', '卧室', '客厅', '厨房', '老家'],
    meaning: '家屋通常对应内在安全感、亲密关系和自我边界。',
    mirror: '你正在重新感受什么地方让你安心，什么地方让你被消耗。',
    action: '整理一个只属于自己的角落'
  },
  {
    label: '月光',
    titleWord: '月',
    theme: 'moon',
    keywords: ['月', '月亮', '月光', '夜晚', '星星'],
    meaning: '月光代表直觉、梦性和那些尚未被白天语言解释的感受。',
    mirror: '你对某件事已经有隐约判断，只是还没有完全说服自己。',
    action: '记录一个没有证据但很强的直觉'
  },
  {
    label: '鸟',
    titleWord: '羽',
    theme: 'moon',
    keywords: ['鸟', '飞', '翅膀', '白鸟', '羽毛'],
    meaning: '鸟象征表达、离开和更高视角。',
    mirror: '你可能想从一个局面里抽离出来，换一个距离重新看它。',
    action: '给某个没说出口的想法取名'
  },
  {
    label: '图书馆',
    titleWord: '书',
    theme: 'archive',
    keywords: ['书', '图书馆', '书架', '文字', '笔记'],
    meaning: '书与图书馆代表记忆、知识系统和正在被整理的答案。',
    mirror: '你的理性正在试图归档最近的混乱，但情绪线索还没有被真正放进去。',
    action: '写下最近反复出现的一个关键词'
  }
];

var moodRules = [
  {
    label: '紧张',
    keywords: ['害怕', '恐惧', '追', '逃', '躲', '迟到', '考试', '哭'],
    weather: '紧张像一根拉紧的线，提醒你有些感受已经等了太久。',
    oracle: '梦正在把你不想直视的压力变成画面，好让你终于能看见它。'
  },
  {
    label: '失控',
    keywords: ['坠落', '掉下', '洪水', '迷路', '找不到', '失重'],
    weather: '失控感在梦里扩散，但它也在帮你辨认真正需要抓住的东西。',
    oracle: '不是所有失控都意味着失败，有些是旧秩序正在松手。'
  },
  {
    label: '怀念',
    keywords: ['老家', '前任', '亲人', '小时候', '同学', '过去'],
    weather: '怀念和未完成感交叠，像有一段旧时间还想被温柔地听见。',
    oracle: '梦没有让你回到过去，它是在帮你取回过去留下的某个自己。'
  },
  {
    label: '清明',
    keywords: ['月光', '清水', '星星', '白色', '安静'],
    weather: '清冷而敏感的直觉正在浮上来，像答案还没开口但已经靠近。',
    oracle: '梦不是直接给答案，而是在提醒你：你已经感到了答案的方向。'
  }
];

var themePriority = {
  shadow: 1,
  falling: 2,
  tide: 3,
  hearth: 4,
  archive: 5,
  threshold: 6,
  moon: 7,
  mist: 8
};

function containsAny(text, keywords) {
  var i;

  for (i = 0; i < keywords.length; i += 1) {
    if (text.indexOf(keywords[i]) !== -1) {
      return true;
    }
  }

  return false;
}

function hasExplicitWaterBody(text) {
  var source = String(text || '');

  return [
    /清水|海水|海边|海里|海中|海面|海上|海底|海岸|海滩|海洋|河水|河里|河中|河面|河边|河上|河底|河岸|河流|河道|湖水|湖里|湖中|湖面|湖边|湖上|湖底|湖岸|湖畔|湖泊|溪水|溪流|小溪|江水|江里|江中|江面|江边|江上|江底|江岸|池塘|池水|水池|泳池|鱼池|池里|池中|池面|池边|泉水|井水|水井|瀑布|水库|水面|水中|水里|水下|积水|洪水|涨水|水位|水流|水渠|水沟|水塘|水湾|水岸|水边|水底|水草|水淹|水没|水漫|水退|水涨|热水|冷水|温水|开水/,
    /(?:梦见|看见|望着|面对|走向|来到|站在|漂在|沉入|跃入|一片|一条|一座|无边的|辽阔的)(?:了)?(?:大)?(?:海|河|湖|江)(?:[，。！？、\s]|$)/,
    /(?:大海|出海|入海|看海|望海|小河|大河|过河|长江|大江|过江)(?:[，。！？、\s]|$)/,
    /(?:浴缸|杯子?|碗|盆|桶|水槽|地上|路上|屋里|房里)(?:里|中|内|上)?(?:装满|盛满|都是|有|积着|流着)?(?:了)?水(?:[，。！？、\s]|$)/
  ].some(function (pattern) {
    return pattern.test(source);
  });
}

function matchesSymbolRule(text, rule) {
  return rule.label === '清水'
    ? hasExplicitWaterBody(text)
    : containsAny(text, rule.keywords);
}

function pickThemeSymbol(symbols) {
  var themeSymbol = symbols[0];
  var themeScore = themePriority[themeSymbol.theme] || themePriority.mist;
  var i;

  for (i = 1; i < symbols.length; i += 1) {
    var score = themePriority[symbols[i].theme] || themePriority.mist;
    if (score < themeScore) {
      themeSymbol = symbols[i];
      themeScore = score;
    }
  }

  return themeSymbol;
}

function pickSymbols(text) {
  var matches = [];
  var i;

  for (i = 0; i < symbolRules.length; i += 1) {
    if (matchesSymbolRule(text, symbolRules[i])) {
      matches.push(symbolRules[i]);
    }
  }

  if (!matches.length) {
    matches.push({
      label: '未命名场景',
      titleWord: '梦',
      theme: 'mist',
      meaning: '这个梦的重点不在具体物件，而在它留下的整体感受。',
      mirror: '现实里可能有一件事还没有被你清楚命名，但它已经开始影响情绪。',
      action: '给这个梦补一个标题'
    });
  }

  return matches.slice(0, 5);
}

function pickMood(text) {
  var i;

  for (i = 0; i < moodRules.length; i += 1) {
    if (containsAny(text, moodRules[i].keywords)) {
      return moodRules[i];
    }
  }

  return {
    label: '微光',
    weather: '情绪像一层薄雾，还没有形成明确答案，却已经改变了你看事情的角度。',
    oracle: '梦先给你的不是结论，而是一种值得停下来辨认的感觉。'
  };
}

function compactDream(text) {
  var cleaned = String(text || '').replace(/\s+/g, '');

  if (cleaned.length > 42) {
    return cleaned.slice(0, 42) + '...';
  }

  return cleaned || '一个还没有被完整说出的梦';
}

function titleFor(symbols) {
  if (symbols.length >= 2) {
    return symbols[0].titleWord + symbols[1].titleWord;
  }

  return symbols[0].titleWord + '牌';
}

function localVisualPlan(text, symbols, mood) {
  var source = String(text || '');
  var labels = symbols.map(function (symbol) { return symbol.label; }).slice(0, 5);
  var anomalyPatterns = ['通向海里', '漂浮', '飞起来', '没有脸', '变成', '另一个我', '无限', '倒着', '消失', '不会醒'];
  var anomaly = anomalyPatterns.filter(function (item) {
    return source.indexOf(item) >= 0;
  })[0] || '';
  var compositions = ['off_center_diagonal', 'threshold_depth', 'cropped_closeup', 'split_distance', 'low_horizon', 'vertical_drift'];
  var composition = compositions[source.length % compositions.length];

  return {
    version: 'oneiro-visual-plan-v1',
    raw_text: source.slice(0, 1200),
    main_event: compactDream(source),
    emotion: [mood.label || '神秘'],
    emotion_intensity: 0.65,
    setting: labels[0] || '未定义的梦境空间',
    characters: [],
    objects: labels.slice(0, 4).map(function (label, index) {
      return { name: label, importance: Math.max(0.5, 0.9 - index * 0.1), visualizable: true };
    }),
    anomalies: anomaly ? [anomaly] : [],
    symbols: labels,
    memory_elements: [],
    preserve_elements: labels.slice(0, 4),
    hidden_symbol: labels[4] || '',
    composition: {
      template: composition,
      subject_position: '',
      visual_flow: '',
      spatial_layers: '',
      negative_space: '保留约40%低密度呼吸空间'
    }
  };
}

function buildLocalDreamResult(baseResult, dreamText) {
  var result = cloneResult(baseResult);
  var text = String(dreamText || '');
  var symbols = pickSymbols(text);
  var mood = pickMood(text);
  var labels = symbols.map(function (symbol) {
    return symbol.label;
  });
  var meanings = symbols.map(function (symbol) {
    return symbol.meaning;
  });
  var mirrors = symbols.map(function (symbol) {
    return symbol.mirror;
  });
  var primary = symbols[0];
  var secondary = symbols[1] || symbols[0];
  var themeSymbol = pickThemeSymbol(symbols);
  var dreamPreview = compactDream(text);

  result.title = titleFor(symbols);
  result.card_theme = themeSymbol.theme || 'mist';
  result.card_theme_label = themeSymbol.label;
  result.symbols = labels;
  result.emotional_weather = mood.weather;
  result.oracle = mood.oracle;
  result.card_insight = '这张牌的核心不是预言，而是提醒你看见“' + primary.label + '”背后的真实需要。';
  result.dream_translation =
    '你写下的梦像是这样一组画面：“' + dreamPreview + '”。其中' + labels.join('、') +
    '构成了主要梦象，它们共同指向一种正在被你整理的内在经验。';
  result.underneath =
    meanings.join(' ') + '这些符号合在一起，说明梦在把一个原本模糊的感受变得可以被你辨认。';
  result.cultural_symbolism =
    '从文化象征看，“' + primary.label + '”与“' + secondary.label + '”常被用来描绘过渡、寻找与变化。放回这次梦里，它们是一种可供联想的传统意象，不是对未来的确定判断。';
  result.reading_hook =
    '这个梦最有张力的地方，是“' + primary.label + '”和“' + secondary.label + '”同时出现：你似乎一边在靠近什么，一边又在保留退路。这个矛盾比单独的象征更值得继续看。';
  result.alternative_reading =
    '也可能这只是“' + primary.label + '”、“' + secondary.label + '”在一次梦中的偶然组合，不一定需要被解释成一个稳定的人格特征。';
  result.mirror =
    mirrors.join(' ') + '如果这个梦和当下现实有关，它更像是在问：你是否愿意承认自己已经站在新的心理位置上？';
  result.integration_question =
    '如果梦里的“' + primary.label + '”会替你说一句真话，它最想提醒你什么？';
  result.one_small_act = primary.action;
  result.image =
    '梦卡画面以' + labels.join('、') + '为核心，把梦里最强烈的情绪凝成一张可以收藏的象征图。';
  result.image_prompt =
    'one main dream event with ' + labels.slice(0, 4).join(', ') +
    ', one clear focal action, condensed dream scene';
  result.visual_plan = localVisualPlan(text, symbols, mood);
  result.echo =
    '今天适合从“' + secondary.label + '”这个符号开始，给梦里的感觉一个现实中的小出口。';

  if (labels.indexOf('沙漠') >= 0 && labels.indexOf('暴雨') >= 0) {
    result.underneath = '这次梦的核心不是“暴雨代表什么”，而是一个原本干涸、无遮蔽的空间突然出现了过量输入。' +
      '你没有写自己逃跑、寻找避雨处或被冲走，梦把注意力停在“变化发生了”这一刻。' +
      '它可能对应一件长期缺少进展或资源、最近突然需要你处理的工作、关系或创作事项；真正要判断的是，这场变化对你来说是补给，还是新的负担。';
    result.cultural_symbolism = '在传统象征语境里，“沙漠”偏向资源稀薄、路径难寻的处境，“暴雨”偏向外部条件骤变和情势集中涌入。' +
      '两者并置的文化意象是“原本难以推进的秩序被突然打破”，不是对未来的吉凶判断。';
    result.reading_hook = '“沙漠”提供了缺少资源和遮蔽的底盘，“暴雨”却把外界输入突然推高；梦的张力不在雨好不好，而在你要承接多少、拒绝多少。';
    result.mirror = '它可能对应一件从“迟迟没变化”突然变成“需要马上应对”的现实事项。优先检查最近一周的工作、关系或创作，而不是把梦理解成预兆。';
    result.integration_question = '最近有没有一件事从“没动静”突然变成“要马上处理”？';
    result.one_small_act = '列出一件突然变多的事，标记承接/拒绝';
    result.echo = '今天把一件突然变多的事拆成“必须承接”和“可以拒绝”。';
  }

  if (labels.indexOf('沙漠') >= 0 && labels.indexOf('暴雪') >= 0 && labels.indexOf('玫瑰') >= 0) {
    result.underneath = '这次梦的关键不是“暴雪”和“玫瑰”各自代表什么，而是它们先后发生在同一片沙地：环境变得更严苛，新的东西却仍然长了出来。' +
      '梦里没有写你去躲雪、拔掉玫瑰或把它带走，视线停在“它竟然出现了”这一刻。' +
      '它可能对应现实里的工作、关系或创作：你原以为条件不够，某个念头或机会却已经冒头。';
    result.cultural_symbolism = '在传统象征语境里，“沙漠”指向匮乏与难以生长的处境，“暴雪”推高遮蔽与考验，“玫瑰”把美与刺放在一起。三者并置，呈现的是不理想条件里的生长，不是未来判断。';
    result.reading_hook = '“沙漠”让生长看起来不可能，“暴雪”又把环境推向更严苛，但“玫瑰”还是出现了；梦的张力在于你是否愿意相信这件新生的东西。';
    result.mirror = '它可能对应一件条件并不理想、却已经出现新可能的工作、关系或创作事项。先确认它是否真的在生长，再决定要保护、验证还是放下。';
    result.integration_question = '最近有没有一件事在条件并不理想时，反而长出了新的可能？';
    result.one_small_act = '给一个正在生长的念头留出一小时';
    result.echo = '今天先给一件新出现的东西留出观察时间，不急着证明它能不能留下。';
  }

  result.omens = Object.assign({}, result.omens || {}, {
    lucky_color_name: mood.label + '色',
    reason: '这组梦象适合用' + mood.label + '的方式被轻轻辨认。'
  });

  return result;
}

module.exports = {
  buildLocalDreamResult
};
