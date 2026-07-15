var HIGH_RISK_PATTERNS = [
  {
    pattern: /自杀|轻生|不想活|结束生命|自残|伤害自己/,
    message: '这个梦里有很重的痛感。请先联系身边可信任的人，或当地紧急支持；Oneiro 暂不解读这类内容。'
  },
  {
    pattern: /杀人|杀了|伤害别人|报复|血腥/,
    message: '这个梦可能涉及高风险伤害内容。为了安全，Oneiro 暂不生成分享梦卡。'
  },
  {
    pattern: /诊断|得病|癌症|抑郁症|焦虑症|处方|吃药/,
    message: 'Oneiro 不能提供医疗或诊断判断。你可以改写成梦里的画面和感受，再抽取梦卡。'
  }
];

function compactText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function validateDreamText(value) {
  var text = compactText(value);
  var i;

  if (!text) {
    return {
      safe: false,
      message: '先写下一点梦'
    };
  }

  if (text.length < 6) {
    return {
      safe: false,
      message: '再多写一点梦里的画面'
    };
  }

  if (text.length > 1200) {
    return {
      safe: false,
      message: '梦太长了，先保留最重要的 1200 字以内'
    };
  }

  for (i = 0; i < HIGH_RISK_PATTERNS.length; i += 1) {
    if (HIGH_RISK_PATTERNS[i].pattern.test(text)) {
      return {
        safe: false,
        message: HIGH_RISK_PATTERNS[i].message
      };
    }
  }

  return {
    safe: true,
    message: ''
  };
}

module.exports = {
  validateDreamText
};
