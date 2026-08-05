import assert from 'node:assert/strict';
import { normalizeDreamResult } from '../archive/web-vite/api/_lib/dreamResult.ts';
import { ACCEPTANCE_DREAM_RESULT, ACCEPTANCE_DREAM_TEXT } from '../archive/web-vite/src/fixtures/acceptanceDream.ts';

type CaseSpec = {
  name: string;
  raw: Record<string, unknown>;
  verify: (result: ReturnType<typeof normalizeDreamResult>) => void;
};

const cases: CaseSpec[] = [
  {
    name: 'moon-library',
    raw: {
      title: '月门',
      image: 'A moonlit library with a silver key floating above flooded shelves.',
      emotional_weather: '清澈里带着一点迟疑。',
      symbols: ['月光', '钥匙', '书架', '水面'],
      underneath: '你在寻找某种可以打开记忆的入口。',
      echo: '天象像在提醒你把注意力放回直觉。',
      mirror: '现实里可能有一段关系或工作需要你主动开启。',
      integration_question: '你现在最想打开的门是什么？',
      one_small_act: '写下梦里最亮的一个细节',
      image_prompt: 'surreal moonlit library, silver key, flooding water, poetic and symbolic',
      omens: {
        lucky_color: '#123456',
        lucky_color_name: '深蓝',
        lucky_number: 13,
        reason: '适合安静地整理内在线索。',
      },
      sound_config: {
        theme: 'liquid',
        drone_hz: 72,
        pulse_rate: 0.18,
        texture_intensity: 0.33,
      },
    },
    verify(result) {
      assert.equal(result.title, '月门');
      assert.equal(result.symbols.length, 4);
      assert.equal(result.omens.lucky_color, '#123456');
      assert.equal(result.sound_config.theme, 'liquid');
    },
  },
  {
    name: 'partial-input',
    raw: {
      title: '  ',
      symbols: 'not-an-array',
      omens: {
        lucky_color: 'blue',
        lucky_number: 0,
      },
      sound_config: {
        theme: 'unknown',
        drone_hz: 999,
        pulse_rate: 0.01,
        texture_intensity: 'bad',
      },
    },
    verify(result) {
      assert.equal(result.title, '梦之回声');
      assert.deepEqual(result.symbols, ['门槛', '水光', '钥匙']);
      assert.equal(result.omens.lucky_color, '#7c8ea3');
      assert.equal(result.omens.lucky_number, 1);
      assert.equal(result.sound_config.theme, 'liquid');
      assert.equal(result.sound_config.drone_hz, 120);
      assert.equal(result.sound_config.pulse_rate, 0.1);
      assert.equal(result.sound_config.texture_intensity, 0.3);
    },
  },
  {
    name: 'long-text-trimming',
    raw: {
      image: 'x'.repeat(900),
      emotional_weather: 'y'.repeat(400),
      underneath: 'z'.repeat(900),
      echo: 'e'.repeat(900),
      mirror: 'm'.repeat(900),
      integration_question: 'q'.repeat(400),
      one_small_act: 'a'.repeat(200),
      image_prompt: 'p'.repeat(900),
      symbols: ['a'.repeat(200), 'b', 'c', 'd', 'e', 'f'],
    },
    verify(result) {
      assert.ok(result.image.length <= 700);
      assert.ok(result.emotional_weather.length <= 180);
      assert.ok(result.underneath.length <= 700);
      assert.ok(result.echo.length <= 700);
      assert.ok(result.mirror.length <= 700);
      assert.ok(result.integration_question.length <= 120);
      assert.ok(result.one_small_act.length <= 40);
      assert.ok(result.image_prompt.length <= 360);
      assert.equal(result.symbols.length, 5);
    },
  },
];

const failures: string[] = [];

for (const testCase of cases) {
  try {
    const result = normalizeDreamResult(testCase.raw);
    testCase.verify(result);
    console.log(`ok ${testCase.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${testCase.name}: ${message}`);
    console.error(`fail ${testCase.name}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error(`Dream contract check failed (${failures.length} case(s))`);
  process.exitCode = 1;
} else {
  console.log(`Dream contract check passed for ${cases.length} cases.`);
}

const requiredDreamImages = ['图书馆', '清水', '银色钥匙', '白鸟'];
const acceptanceText = [
  ACCEPTANCE_DREAM_RESULT.image,
  ACCEPTANCE_DREAM_RESULT.underneath,
  ACCEPTANCE_DREAM_RESULT.mirror,
  ACCEPTANCE_DREAM_RESULT.image_prompt,
].join('\n');

for (const image of requiredDreamImages) {
  assert.ok(
    acceptanceText.includes(image) || ACCEPTANCE_DREAM_RESULT.image_prompt.toLowerCase().includes(image.toLowerCase()),
    `acceptance result should reference dream image: ${image}`
  );
}

assert.ok(ACCEPTANCE_DREAM_TEXT.includes('银色钥匙'), 'acceptance dream text should include the key image');
assert.equal(ACCEPTANCE_DREAM_RESULT.symbols.length, 5);
assert.ok(ACCEPTANCE_DREAM_RESULT.one_small_act.length <= 20);
assert.ok(!/诊断|疾病|必然|注定/.test(acceptanceText), 'acceptance result should avoid diagnosis or fatalism');
console.log('Acceptance fixture quality checks passed.');
