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

function parseBirthDate(value) {
  var parts = String(value || '').split('-');
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);

  if (!month || !day) {
    return { year: 2000, month: 1, day: 1 };
  }

  return { year: year || 2000, month: month, day: day };
}

var chineseZodiacs = ['猴', '鸡', '狗', '猪', '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊'];

function chineseZodiacFor(year) {
  return chineseZodiacs[Math.abs(Number(year) || 2000) % 12];
}

function zodiacFor(month, day) {
  var sign = '摩羯';

  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) sign = '水瓶';
  else if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) sign = '双鱼';
  else if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) sign = '白羊';
  else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) sign = '金牛';
  else if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) sign = '双子';
  else if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) sign = '巨蟹';
  else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) sign = '狮子';
  else if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) sign = '处女';
  else if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) sign = '天秤';
  else if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) sign = '天蝎';
  else if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) sign = '射手';

  return sign;
}

function elementForMonth(month) {
  if (month === 12 || month <= 2) {
    return {
      name: '水土',
      trait: '敏感、收束、擅长在安静里整理情绪'
    };
  }

  if (month >= 3 && month <= 5) {
    return {
      name: '木',
      trait: '生长、启动、容易被新的愿望牵引'
    };
  }

  if (month >= 6 && month <= 8) {
    return {
      name: '火土',
      trait: '表达、行动、需要把感受落成现实选择'
    };
  }

  return {
    name: '金',
    trait: '分辨、取舍、适合为混乱的经验重新命名'
  };
}

function timeBranchFor(value) {
  var hour = Number(String(value || '').split(':')[0]);

  if (isNaN(hour)) {
    return { name: '时段未知', tone: '出生时间未填写，本次只使用生日季节与生肖建立轻量底图。' };
  }

  var branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var branch = branches[Math.floor(((hour + 1) % 24) / 2)];
  var tone = hour >= 5 && hour < 11
    ? '清晨节律偏向启动，梦更容易把尚未行动的愿望推到眼前。'
    : hour >= 11 && hour < 17
      ? '白昼节律偏向外显，梦更常把选择、行动与现实压力具象化。'
      : hour >= 17 && hour < 23
        ? '黄昏节律偏向关系整理，梦更容易呈现边界与未说出口的话。'
        : '夜间节律偏向内收，梦里的细微信号和情绪余波更容易被放大。';

  return { name: branch + '时', tone: tone };
}

function buildBirthProfile(profile) {
  var safeProfile = profile || {};
  var birth = parseBirthDate(safeProfile.birthDate);
  var zodiac = zodiacFor(birth.month, birth.day);
  var element = elementForMonth(birth.month);
  var timeBranch = timeBranchFor(safeProfile.birthTime);

  return {
    nickname: safeProfile.nickname || '你',
    zodiac: zodiac,
    element: element.name,
    elementTrait: element.trait,
    chineseZodiac: chineseZodiacFor(birth.year),
    timeBranch: timeBranch.name,
    timeTone: timeBranch.tone,
    place: safeProfile.birthPlace || '未填写出生地',
    lens: '东方出生节律',
    precision: safeProfile.birthTime ? '轻量增强' : '基础'
  };
}

function formatCardNumber(index) {
  var value = Number(index) || 1;
  var text = String(value);

  while (text.length < 3) {
    text = '0' + text;
  }

  return 'NO. ' + text;
}

function personalizeDreamResult(baseResult, profile, cardIndex) {
  var result = cloneResult(baseResult);
  var birthProfile = buildBirthProfile(profile);
  var symbols = result.symbols || [];
  var symbolText = symbols.length ? symbols.slice(0, 3).join('、') : '梦里的核心符号';
  var baseInsight = result.card_insight || '这张牌提醒你看见梦里反复出现的真实需要。';
  var baseOracle = result.oracle || '梦先给你的不是结论，而是一种值得停下来辨认的感觉。';

  result.card_no = formatCardNumber(cardIndex);
  result.birth_profile = birthProfile;
  result.profile_summary =
    birthProfile.nickname + ' · ' + birthProfile.chineseZodiac + '生肖 · ' + birthProfile.element + '象节律';
  result.metaphysical_resonance =
    birthProfile.nickname +
    ' 的出生底图带着' +
    birthProfile.element +
    '象季节气质，生肖为' + birthProfile.chineseZodiac + '，出生时段为' + birthProfile.timeBranch + '：' +
    birthProfile.elementTrait +
    '。' + birthProfile.timeTone + ' 这次梦里的' +
    symbolText +
    '，可作为你当下需要倾听直觉、重新命名愿望的一种观察角度。';
  result.metaphysical_basis = birthProfile.precision + '解读 · 依据生日季节、生肖' +
    (profile && profile.birthTime ? '与出生时段' : '') + ' · 非完整出生背景计算或阶段变化预测';
  result.card_insight =
    baseInsight + ' 今天先做一件小事：' + (result.one_small_act || '写下梦里最亮的一个细节') + '。';
  result.oracle =
    baseOracle + ' 结合你的' + birthProfile.zodiac + '底图，它更像一次温柔的自我提醒。';
  result.echo = '出生节律只是观察镜头，不替你做决定。' + birthProfile.timeTone;

  return result;
}

module.exports = {
  buildBirthProfile,
  personalizeDreamResult
};
