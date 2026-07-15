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
    label: '清水',
    titleWord: '潮',
    theme: 'tide',
    keywords: ['水', '海', '河', '湖', '雨', '洪水', '清水', '下雨'],
    meaning: '水代表正在浮上来的情绪、直觉和记忆。',
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
    keywords: ['钥匙', '锁', '打开', '密码'],
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
    if (containsAny(text, symbolRules[i].keywords)) {
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
    'vertical 3:4 tarot-inspired illustration panel, symbols: ' + labels.slice(0, 5).join(', ') +
    ', vintage ink line art, muted watercolor, aged paper, no frame, no text';
  result.echo =
    '今天适合从“' + secondary.label + '”这个符号开始，给梦里的感觉一个现实中的小出口。';
  result.omens = Object.assign({}, result.omens || {}, {
    lucky_color_name: mood.label + '色',
    reason: '这组梦象适合用' + mood.label + '的方式被轻轻辨认。'
  });

  return result;
}

module.exports = {
  buildLocalDreamResult
};
