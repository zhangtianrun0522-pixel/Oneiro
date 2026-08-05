const SOUND_THEMES = ['liquid', 'dust', 'ember', 'wood', 'hollow', 'sterile', 'pursuit'] as const;

type SoundTheme = typeof SOUND_THEMES[number];

const DEFAULT_SOUND_CONFIG = {
  theme: 'liquid' as SoundTheme,
  drone_hz: 60,
  pulse_rate: 0.15,
  texture_intensity: 0.3,
};

const DEFAULT_OMENS = {
  lucky_color: '#7c8ea3',
  lucky_color_name: '雾蓝',
  lucky_number: 7,
  reason: '这组征兆适合承接梦醒后的细微直觉。',
};

function asString(value: unknown, fallback: string, maxLength = 700): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function asStringArray(value: unknown, fallback: string[], maxItems: number, maxLength = 80): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(item => item.slice(0, maxLength));
  return items.length ? items : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeHexColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_OMENS.lucky_color;
  const color = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_OMENS.lucky_color;
}

function normalizeTheme(value: unknown): SoundTheme {
  return SOUND_THEMES.includes(value as SoundTheme) ? value as SoundTheme : DEFAULT_SOUND_CONFIG.theme;
}

export function normalizeDreamResult(raw: any): any {
  const omens = raw?.omens ?? {};
  const soundConfig = raw?.sound_config ?? {};

  return {
    title: asString(raw?.title, '梦之回声', 24),
    image: asString(raw?.image, '梦境留下了一幅未完全显影的内在图像。'),
    emotional_weather: asString(raw?.emotional_weather, '潮汐般的敏感与期待正在心底交替。', 180),
    symbols: asStringArray(raw?.symbols, ['门槛', '水光', '钥匙'], 5, 32),
    underneath: asString(raw?.underneath, '这个梦提示你正在重新整理某种深层感受，并寻找更诚实的表达方式。'),
    echo: asString(raw?.echo, '今日星象像一层背景光，提醒你慢下来听见直觉里较轻的声音。', 420),
    mirror: asString(raw?.mirror, '现实中可能有一件事正在要求你重新命名自己的需要，而不是只按旧习惯回应。'),
    integration_question: asString(raw?.integration_question, '醒来后，哪一个画面仍在向你索要注意？', 120),
    one_small_act: asString(raw?.one_small_act, '写下一个反复出现的意象', 40),
    image_prompt: asString(
      raw?.image_prompt,
      'one condensed dream event, one clear focal action, asymmetric composition, 40% breathing space, emotion-led high-saturation palette of 4-6 inks',
      360
    ),
    omens: {
      lucky_color: normalizeHexColor(omens?.lucky_color),
      lucky_color_name: asString(omens?.lucky_color_name, DEFAULT_OMENS.lucky_color_name, 24),
      lucky_number: Math.round(clampNumber(omens?.lucky_number, 1, 99, DEFAULT_OMENS.lucky_number)),
      reason: asString(omens?.reason, DEFAULT_OMENS.reason, 220),
    },
    sound_config: {
      theme: normalizeTheme(soundConfig?.theme),
      drone_hz: clampNumber(soundConfig?.drone_hz, 40, 120, DEFAULT_SOUND_CONFIG.drone_hz),
      pulse_rate: clampNumber(soundConfig?.pulse_rate, 0.1, 0.3, DEFAULT_SOUND_CONFIG.pulse_rate),
      texture_intensity: clampNumber(
        soundConfig?.texture_intensity,
        0.1,
        0.5,
        DEFAULT_SOUND_CONFIG.texture_intensity
      ),
    },
  };
}
