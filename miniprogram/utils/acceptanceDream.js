const acceptanceDreamText =
  '我走进一座被月光照亮的图书馆，书架之间慢慢涨起清水。一把银色钥匙漂在水面上，我伸手去拿时，远处有一只白鸟撞向窗户，但没有声音。';

const acceptanceDreamResult = {
  card_no: 'NO. 001',
  title: '月钥',
  image:
    '月光照进一座被清水淹没的图书馆，银色钥匙像一枚安静的星，漂在书架之间。远处白鸟撞向无声的窗，把梦的边界敲出细小裂纹。',
  emotional_weather: '清冷的期待里夹着压抑，像想靠近答案，却又害怕答案真的打开。',
  symbols: ['月光', '图书馆', '清水', '银色钥匙', '白鸟'],
  oracle:
    '这个梦不是在告诉你答案，而是在提醒你：答案已经靠近，只是你还需要允许自己打开它。',
  card_insight: '你知道钥匙在哪里，只是还没决定要打开哪扇门。',
  metaphysical_resonance:
    '你的出生底图带着水象式的敏感与观察力。梦里的清水和月光，像是在把尚未成句的直觉推到你面前。',
  metaphysical_basis: '基础解读 · 依据生日季节与生肖 · 非完整出生背景计算或阶段变化预测',
  dream_translation:
    '月光、图书馆和清水共同构成了一个“记忆被情绪浸泡”的场景：理性仍在整理答案，但真正的线索已经从情绪里浮出来。',
  underneath:
    '图书馆像你正在整理的记忆与知识系统，涨起的清水说明情绪已经漫过理性分类。银色钥匙代表一个可以进入新阶段的线索，但白鸟撞窗的无声感提示你还有某种表达被挡在玻璃另一侧。',
  cultural_symbolism:
    '在传统象征里，水常与情绪和变化相连，钥匙则指向开启与选择。它们在这次梦里的并置更像一面文化镜子，而不是吉凶预告。',
  echo:
    '今日月相让直觉比平时更容易浮出水面，适合倾听那些尚未成句的感觉。',
  mirror:
    '现实里，你可能正在面对一个需要重新命名的创作、关系或工作方向。你知道某扇门存在，也隐约知道钥匙在哪里，但仍担心打开后要承担新的责任。',
  integration_question:
    '如果那把银色钥匙只能打开一件事，你最希望它打开哪一个被你暂时搁置的愿望？',
  one_small_act: '写下钥匙会打开的门',
  image_prompt:
    'a person reaches for a silver key in a moonlit library filling with clear water, a silent white bird at the window',
  visual_plan: {
    version: 'oneiro-visual-plan-v1',
    raw_text: acceptanceDreamText,
    main_event: '梦者在逐渐涨水的图书馆里伸手去拿漂浮的银色钥匙',
    emotion: ['期待', '压抑'],
    emotion_intensity: 0.76,
    setting: '月光照亮的图书馆',
    characters: [{ role: '主体', description: '伸手触碰钥匙的人', importance: 1 }],
    objects: [
      { name: '银色钥匙', importance: 1, visualizable: true },
      { name: '涨起的清水', importance: 0.9, visualizable: true },
      { name: '无声撞窗的白鸟', importance: 0.8, visualizable: true }
    ],
    anomalies: ['图书馆里的清水不断上涨，白鸟撞窗却没有声音'],
    symbols: ['银色钥匙', '清水', '白鸟'],
    memory_elements: [],
    preserve_elements: ['伸手的人', '银色钥匙', '涨起的清水', '无声白鸟'],
    hidden_symbol: '窗上的细小裂纹',
    composition: {
      template: 'off_center_diagonal',
      subject_position: '人物位于左下，伸出的手被放大',
      visual_flow: '从左下手臂指向中央钥匙，再落到右上白鸟',
      spatial_layers: '前景手与水，中景钥匙和书架，远景窗与白鸟',
      negative_space: '右侧保留约40%安静水面和月光'
    }
  },
  omens: {
    lucky_color: '#9fb7c9',
    lucky_color_name: '月雾蓝',
    lucky_number: 18,
    reason: '月雾蓝适合承接梦里清冷而敏感的线索。'
  },
  imageUrl: ''
};

module.exports = {
  acceptanceDreamText,
  acceptanceDreamResult
};
