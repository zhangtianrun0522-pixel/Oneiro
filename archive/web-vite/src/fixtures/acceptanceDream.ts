import type { DreamResult, UserInfo } from '../types';

export const ACCEPTANCE_USER: UserInfo = {
  nickname: 'Runtu',
  birthDate: '1998-01-01',
  birthTime: '08:30',
  birthPlace: 'Shanghai',
};

export const ACCEPTANCE_DREAM_TEXT =
  '我走进一座被月光照亮的图书馆，书架之间慢慢涨起清水。一把银色钥匙漂在水面上，我伸手去拿时，远处有一只白鸟撞向窗户，但没有声音。';

export const ACCEPTANCE_DREAM_RESULT: DreamResult = {
  title: '月钥',
  image: '月光照进一座被清水淹没的图书馆，银色钥匙像一枚安静的星，漂在书架之间。远处白鸟撞向无声的窗，把梦的边界敲出细小裂纹。',
  emotional_weather: '这个梦的情绪天气是清冷的期待里夹着压抑，像想靠近答案，却又害怕答案真的打开。',
  symbols: ['月光', '图书馆', '清水', '银色钥匙', '白鸟'],
  underneath:
    '图书馆像你正在整理的记忆与知识系统，涨起的清水说明情绪已经漫过理性分类。银色钥匙代表一个可以进入新阶段的线索，但白鸟撞窗的无声感提示你还有某种表达被挡在玻璃另一侧。这个梦不是催你立刻决定，而是在提醒你先承认自己已经看见入口。',
  echo:
    '今日月相让直觉比平时更容易浮出水面，适合倾听那些尚未成句的感觉。星象里的水意与钥匙意象相互呼应，提示你把选择权从外部评价中收回一点。',
  mirror:
    '现实里，你可能正在面对一个需要重新命名的创作、关系或工作方向。你知道某扇门存在，也隐约知道钥匙在哪里，但仍担心打开后要承担新的责任。白鸟的无声提醒你，不要只在心里排练表达，要给它一个实际出口。',
  integration_question: '如果那把银色钥匙只能打开一件事，你最希望它打开哪一个被你暂时搁置的愿望？',
  one_small_act: '写下钥匙会打开的门',
  image_prompt:
    'A person reaches for a silver key in a flooding library; a silent white bird stays distant. Tense anticipation, intensity 0.76. Off-center diagonal from hand to key to bird, 40% quiet water. Electric cobalt, vermilion, sunflower yellow, ink black, warm cream.',
  omens: {
    lucky_color: '#9fb7c9',
    lucky_color_name: '月雾蓝',
    lucky_number: 18,
    reason: '月雾蓝适合承接梦里清冷而敏感的线索，18 像一扇即将被打开的门。',
  },
  sound_config: {
    theme: 'liquid',
    drone_hz: 64,
    pulse_rate: 0.16,
    texture_intensity: 0.34,
  },
  imageUrl:
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%230d1726"/><stop offset="0.48" stop-color="%232b4156"/><stop offset="1" stop-color="%23d8e7ef"/></linearGradient></defs><rect width="900" height="1200" fill="url(%23g)"/><circle cx="690" cy="170" r="92" fill="%23f4f1dc" opacity="0.86"/><g stroke="%23d8e7ef" stroke-width="6" opacity="0.35"><path d="M160 220v720M300 180v780M450 250v680M610 210v740"/><path d="M130 390h540M130 530h540M130 670h540M130 810h540"/></g><path d="M0 860c170-58 310-46 450 0s260 58 450 0v340H0z" fill="%23c4dce7" opacity="0.32"/><path d="M430 725c45-30 92-5 92 38 0 43-45 64-78 42l-60 70-42-36 62-69c-15-17-9-34 26-45z" fill="%23f1e2a7" opacity="0.86"/><path d="M640 480c65-42 113-21 145 36-58-12-105 0-145 36-32-20-46-44 0-72z" fill="%23f7fafc" opacity="0.72"/></svg>',
};
