import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

type InterpretDreamModule = {
  main: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
  parseJsonResponse?: (text: string) => Record<string, unknown>;
  parseDreamChatContent?: (text: string, userMessage: string) => {
    reply: string;
    realityClue: string;
  };
  normalizeSymbols?: (value: unknown) => string[];
  normalizeAiResult?: (
    raw: Record<string, unknown>,
    dreamText: string,
    profile: Record<string, unknown>,
    cardIndex: number,
    sourceLabel: string,
    memory: unknown,
    baziChart: unknown,
    lifeNote: unknown
  ) => Record<string, any>;
  validateAiSemanticPayload?: (
    raw: Record<string, unknown>,
    dreamText: string,
    baziChart: unknown
  ) => void;
  buildBaziChart?: (profile: Record<string, unknown>) => Record<string, any>;
};

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

function assertIncludes(relativePath: string, expected: string): void {
  assert.ok(
    read(relativePath).includes(expected),
    `${relativePath} should include ${expected}`
  );
}

function assertNotIncludes(relativePath: string, unexpected: string): void {
  assert.ok(
    !read(relativePath).includes(unexpected),
    `${relativePath} should not include ${unexpected}`
  );
}

function walkFiles(directory: string): string[] {
  const absoluteDirectory = path.join(root, directory);
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function isMiniProgramRuntimeFile(relativePath: string): boolean {
  if (relativePath.startsWith('miniprogram/cloudfunctions/')) return false;
  if (relativePath === 'miniprogram/README.md') return false;
  return /\.(js|json|wxml|wxss)$/.test(relativePath);
}

function loadInterpretDream(env: Record<string, string>, exposeParser = false): InterpretDreamModule {
  const commonJsModule = { exports: {} as InterpretDreamModule };
  const sandbox = {
    module: commonJsModule,
    exports: commonJsModule.exports,
    process: { env },
    Buffer,
    URL,
    require(request: string) {
      if (request === 'wx-server-sdk') {
        return {
          DYNAMIC_CURRENT_ENV: 'mock-current-env',
          init() {},
        };
      }

      if (request === 'http' || request === 'https') {
        return nodeRequire(request);
      }

      if (request === './locationResolver') {
        return nodeRequire(path.join(root, 'miniprogram/cloudfunctions/interpretDream/locationResolver.js'));
      }

      if (request === 'lunar-javascript') {
        return {
          Solar: {
            fromYmdHms() {
              return {
                getLunar() {
                  return {
                    getEightChar() {
                      return {
                        setSect() {},
                        getYear: () => '戊寅',
                        getMonth: () => '乙丑',
                        getDay: () => '甲子',
                        getTime: () => '戊辰',
                        getYearWuXing: () => '土木',
                        getMonthWuXing: () => '木土',
                        getDayWuXing: () => '木水',
                        getTimeWuXing: () => '土土',
                        getDayGan: () => '甲',
                        getYearShiShenGan: () => '偏财',
                        getMonthShiShenGan: () => '劫财',
                        getDayShiShenGan: () => '日主',
                        getTimeShiShenGan: () => '偏财',
                        getYearHideGan: () => '甲丙戊',
                        getMonthHideGan: () => '己癸辛',
                        getDayHideGan: () => '癸',
                        getTimeHideGan: () => '戊乙癸',
                        getYearShiShenZhi: () => ['比肩', '食神', '偏财'],
                        getMonthShiShenZhi: () => ['正财', '正印', '正官'],
                        getDayShiShenZhi: () => ['正印'],
                        getTimeShiShenZhi: () => ['偏财', '正官', '正印'],
                        getYearNaYin: () => '城头土',
                        getMonthNaYin: () => '海中金',
                        getDayNaYin: () => '海中金',
                        getTimeNaYin: () => '大林木',
                        getYearDiShi: () => '临官',
                        getMonthDiShi: () => '衰',
                        getDayDiShi: () => '沐浴',
                        getTimeDiShi: () => '冠带',
                        getYearXunKong: () => '申酉',
                        getMonthXunKong: () => '戌亥',
                        getDayXunKong: () => '戌亥',
                        getTimeXunKong: () => '寅卯',
                        getTaiYuan: () => '丙寅',
                        getTaiXi: () => '乙巳',
                        getMingGong: () => '壬申',
                        getShenGong: () => '癸酉',
                        getYun: (gender: number) => ({
                          getGender: () => gender,
                          getStartYear: () => 3,
                          getStartMonth: () => 2,
                          getStartDay: () => 10,
                          getStartHour: () => 0,
                          getStartSolar: () => ({ toYmd: () => '2001-03-01' }),
                          isForward: () => gender === 1,
                          getDaYun: () => [{
                            getIndex: () => 1,
                            getGanZhi: () => '丙寅',
                            getStartAge: () => 3,
                            getEndAge: () => 12,
                            getStartYear: () => 2001,
                            getEndYear: () => 2010,
                            getXunKong: () => '戌亥',
                          }],
                        }),
                      };
                    },
                  };
                },
              };
            },
          },
        };
      }

      throw new Error(`Unexpected require(${request}) while loading ${interpretDreamPath}`);
    },
  };

  const source = exposeParser
    ? read(interpretDreamPath) + '\nmodule.exports.parseJsonResponse = parseJsonResponse;\nmodule.exports.parseDreamChatContent = parseDreamChatContent;\nmodule.exports.normalizeSymbols = normalizeSymbols;\nmodule.exports.normalizeAiResult = normalizeAiResult;\nmodule.exports.validateAiSemanticPayload = validateAiSemanticPayload;\nmodule.exports.buildBaziChart = buildBaziChart;'
    : read(interpretDreamPath);
  vm.runInNewContext(source, sandbox, { filename: interpretDreamPath });
  return commonJsModule.exports;
}

const interpretDreamPath = 'miniprogram/cloudfunctions/interpretDream/index.js';
const packageJson = readJson<{ scripts?: Record<string, string> }>('package.json');
const runtimeFiles = walkFiles('miniprogram').filter(isMiniProgramRuntimeFile);
const forbiddenFrontendMarkers = [
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'AI_API_KEY',
  'INTERPRET_PROVIDER',
  'Authorization: Bearer',
];
const likelySecretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-or-v1-[A-Za-z0-9_-]{20,}/,
];

for (const expected of [
  'INTERPRET_PROVIDER',
  'DEEPSEEK_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'providerConfigured',
  'hasApiKey',
  'baseUrlHost',
  'healthCheck',
  'smokeTest',
  "fallbackProvider: 'none'",
  'response_format',
  'lunar-javascript',
  'true_solar_time',
  'locationResolver',
  'buildBaziChart',
  'loadDreamMemory',
  'DREAM_CHAT_SYSTEM_PROMPT',
  'chatAboutDream',
  'reading_hook',
  'alternative_reading',
  'oneiro-freeform-reading-v0.3',
]) {
  assertIncludes(interpretDreamPath, expected);
}

for (const expected of [
  'INTERPRET_PROVIDER=deepseek',
  'DEEPSEEK_API_KEY=<rotate-and-set-in-cloudbase-only>',
  'INTERPRET_TIMEOUT_MS=30000',
  'healthCheck',
  'providerConfigured',
  'reports a 60-second timeout',
]) {
  assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', expected);
}

for (const expected of [
  'Oneiro AI Provider Runbook',
  'INTERPRET_PROVIDER=deepseek',
  'DEEPSEEK_API_KEY=<rotated-production-key>',
  'providerConfigured',
  'cloudBase.aiHealth',
  'cloudBase.aiSmokeTest',
  'AI SMOKE TEST',
  '/pages/diagnostics/index',
  'interpretationProvider',
  '"fallbackProvider": "none"',
  'Failure Triage',
]) {
  assertIncludes('docs/AI_PROVIDER_RUNBOOK.md', expected);
}

assertNotIncludes(interpretDreamPath, 'cloudbase-static-fallback');
assertNotIncludes(interpretDreamPath, 'INTERPRET_STRICT_AI');

for (const expected of [
  'function aiHealth',
  'function aiSmokeTest',
  'healthCheck: true',
  'smokeTest: true',
  'aiHealth: aiHealth',
  'aiSmokeTest: aiSmokeTest',
]) {
  assertIncludes('miniprogram/utils/cloudBase.js', expected);
}

for (const expected of [
  'pages/diagnostics/index',
  'Provider Ready',
  'requestTimeoutMs',
  'aiHealth',
  'AI SMOKE TEST',
  'smokeTest',
  'cloudHealth',
]) {
  assertIncludes(
    expected === 'pages/diagnostics/index' ? 'miniprogram/app.json' : 'miniprogram/pages/diagnostics/index.wxml',
    expected
  );
}

assert.equal(
  packageJson.scripts?.['check:ai-readiness'],
  'node scripts/check-ai-readiness.ts',
  'package.json should expose check:ai-readiness'
);
assert.equal(
  packageJson.scripts?.['check:mini-release'],
  'npm run check:ai-readiness && npm run check:cloudbase && npm run check:miniprogram && npm run check:phase3 && npm run check:image-contract && npm run check:image-quality-job && npm run check:dream && npm run typecheck',
  'package.json should expose check:mini-release'
);

for (const relativePath of runtimeFiles) {
  const content = read(relativePath);

  for (const marker of forbiddenFrontendMarkers) {
    assert.ok(
      !content.includes(marker),
      `${relativePath} should not contain server-side AI provider marker ${marker}`
    );
  }

  for (const pattern of likelySecretPatterns) {
    assert.ok(
      !pattern.test(content),
      `${relativePath} should not contain a likely API key literal`
    );
  }
}

const locationResolver = nodeRequire(path.join(root, 'miniprogram/cloudfunctions/interpretDream/locationResolver.js')) as {
  resolveBirthPlace: (value: string) => Record<string, any> | null;
  correctToTrueSolarTime: (date: string, time: string, location: Record<string, any>) => Record<string, any>;
};
const qingdao = locationResolver.resolveBirthPlace('山东青岛市');
assert.ok(qingdao);
assert.equal(qingdao?.name, '青岛');
assert.equal(locationResolver.resolveBirthPlace('火星'), null);
const correctedQingdao = locationResolver.correctToTrueSolarTime('2000-05-22', '15:10', qingdao as Record<string, any>);
assert.equal(correctedQingdao.ok, true);
assert.notEqual(correctedQingdao.time, '15:10');
assert.equal(
  Number(correctedQingdao.totalCorrectionMinutes.toFixed(3)),
  Number((correctedQingdao.equationOfTimeMinutes + correctedQingdao.longitudeCorrectionMinutes).toFixed(3))
);

const staticHealth = await loadInterpretDream({}).main({ healthCheck: true });
assert.equal(staticHealth.ok, true);
assert.equal(staticHealth.provider, 'cloudbase-static');
assert.equal(staticHealth.providerConfigured, false);
assert.equal(staticHealth.hasApiKey, false);
assert.equal(staticHealth.requestTimeoutMs, 30000);
assert.equal(staticHealth.fallbackProvider, 'none');

const deepseekHealth = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'test-key-not-real',
  DEEPSEEK_MODEL: 'deepseek-chat',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
  INTERPRET_TIMEOUT_MS: '21000',
}).main({ healthCheck: true });
assert.equal(deepseekHealth.ok, true);
assert.equal(deepseekHealth.provider, 'deepseek');
assert.equal(deepseekHealth.providerConfigured, true);
assert.equal(deepseekHealth.hasApiKey, true);
assert.equal(deepseekHealth.model, 'deepseek-chat');
assert.equal(deepseekHealth.baseUrlHost, 'api.deepseek.com');
assert.equal(deepseekHealth.requestTimeoutMs, 30000);

const staticSmokeTest = await loadInterpretDream({}).main({ smokeTest: true });
assert.equal(staticSmokeTest.ok, false);
assert.equal(staticSmokeTest.type, 'interpretDream.aiSmokeTest');
assert.equal(staticSmokeTest.provider, 'cloudbase-static');
assert.equal(staticSmokeTest.providerConfigured, false);
assert.equal(staticSmokeTest.reason, 'static_provider');

const missingKeySmokeTest = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
}).main({ smokeTest: true });
assert.equal(missingKeySmokeTest.ok, false);
assert.equal(missingKeySmokeTest.provider, 'deepseek');
assert.equal(missingKeySmokeTest.providerConfigured, false);
assert.equal(missingKeySmokeTest.reason, 'missing_api_key');

const staticInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛', gender: 'male' },
  cardIndex: 3,
});
assert.equal(staticInterpretation.ok, false);
assert.equal(staticInterpretation.reason, 'ai_provider_error');
assert.equal(staticInterpretation.retryable, true);
assert.equal(Object.prototype.hasOwnProperty.call(staticInterpretation, 'result'), false);

const exposedInterpretDream = loadInterpretDream({}, true);
const normalizeSymbols = exposedInterpretDream.normalizeSymbols;
assert.ok(normalizeSymbols);
assert.equal(normalizeSymbols(['水蜜桃']).length, 1);
assert.equal(normalizeSymbols(['水蜜桃'])[0], '水蜜桃');
assert.equal(
  normalizeSymbols(['清水']).length,
  1
);

const normalizeAiResult = exposedInterpretDream.normalizeAiResult;
assert.ok(normalizeAiResult);
const validateAiSemanticPayload = exposedInterpretDream.validateAiSemanticPayload;
assert.ok(validateAiSemanticPayload);
assert.throws(
  () => validateAiSemanticPayload({}, '我梦见西红柿里爆出了一颗水蜜桃', null),
  /missing semantic fields/
);
const completeModelPayload = {
  title: '桃心',
  card_theme: 'shadow',
  card_theme_label: '西红柿',
  emotional_weather: '惊讶里带着一点好奇。',
  oracle: '先确认这次变化对你意味着什么，不急着把它定性。',
  card_insight: '西红柿里突然出现水蜜桃，让熟悉事物发生了意外变化。',
  dream_translation: '你看见西红柿里爆出一颗水蜜桃，画面停在变化发生的一刻。',
  reading_hook: '西红柿的外壳与水蜜桃的出现形成了清楚转折。',
  cultural_symbolism: '西红柿与水蜜桃在这里构成一组关于果实变化的共同意象。',
  underneath: '西红柿里出现水蜜桃，也许对应工作中某件熟悉事情突然显露不同结果。',
  possible_connections: [
    '西红柿里出现水蜜桃，可能对应工作中熟悉流程出现意外结果。',
    '西红柿与水蜜桃的变化也可能与最近一个项目方向的调整有关。'
  ],
  mirror: '熟悉外表里出现了不同内容。',
  alternative_reading: '这也可能只是两种水果在梦里的偶然组合。',
  integration_question: '最近哪件熟悉的事出现了意外结果？',
  one_small_act: '记下一次意外变化',
  image: '西红柿裂开，露出一颗水蜜桃。',
  image_prompt: 'A tomato opens to reveal a peach.',
  visual_plan: {
    main_event: '西红柿里爆出水蜜桃',
    setting: '梦中画面',
    preserve_elements: ['西红柿', '水蜜桃']
  },
  dream_facts: {
    objects: ['西红柿', '水蜜桃'],
    actions: ['爆出']
  },
  symbols: ['西红柿', '水蜜桃'],
  echo: '先看看变化本身。',
  omens: {
    lucky_color_name: '桃红',
    reason: '对应梦里突然出现的水蜜桃。'
  }
};
assert.doesNotThrow(() => validateAiSemanticPayload(
  completeModelPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  null
));
const emotionOnlyHallucination = JSON.parse(JSON.stringify(completeModelPayload));
emotionOnlyHallucination.dream_facts = { emotions: ['恐惧'] };
emotionOnlyHallucination.visual_plan.main_event = '月球上有一条龙飞过';
assert.doesNotThrow(() => validateAiSemanticPayload(
  emotionOnlyHallucination,
  '我梦见西红柿里爆出了一颗水蜜桃',
  null
));
const mixedFactHallucination = JSON.parse(JSON.stringify(completeModelPayload));
mixedFactHallucination.dream_facts = {
  actions: ['西红柿，旁边出现一条龙'],
  emotions: ['恐惧']
};
mixedFactHallucination.visual_plan.main_event = '西红柿旁边出现一条龙';
assert.doesNotThrow(() => validateAiSemanticPayload(
  mixedFactHallucination,
  '我梦见西红柿里爆出了一颗水蜜桃',
  null
));
const modelFirstPeach = normalizeAiResult(
  completeModelPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  6,
  'AI 梦卡',
  null,
  null,
  null
);
assert.deepEqual(modelFirstPeach.symbols, ['西红柿', '水蜜桃']);
assert.equal(modelFirstPeach.card_theme_label, '西红柿');
assert.equal(Object.prototype.hasOwnProperty.call(modelFirstPeach, 'memory_reflection'), false);
assert.doesNotMatch(JSON.stringify(modelFirstPeach), /未命名场景|清水|水面|水意象|水的意象/);

const noConnectionPayload = JSON.parse(JSON.stringify(completeModelPayload));
noConnectionPayload.possible_connections = [];
noConnectionPayload.integration_question = '这个画面让你想到最近哪件小事？';
assert.doesNotThrow(() => validateAiSemanticPayload(
  noConnectionPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  null
));
const noConnectionResult = normalizeAiResult(
  noConnectionPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  7,
  'AI 梦卡',
  null,
  null,
  null
);
assert.equal(Array.isArray(noConnectionResult.possible_connections), true);
assert.equal(noConnectionResult.possible_connections.length, 0);
assert.ok(noConnectionResult.integration_question);

const shortDreamPayload = JSON.parse(JSON.stringify(completeModelPayload));
shortDreamPayload.card_theme_label = '猫';
shortDreamPayload.symbols = ['月亮'];
shortDreamPayload.dream_facts = { objects: ['月亮'], actions: ['飞过'] };
shortDreamPayload.visual_plan.main_event = '月亮旁边出现一条龙';
shortDreamPayload.visual_plan.setting = '';
shortDreamPayload.visual_plan.preserve_elements = ['月亮'];
const shortDreamText = '我梦见一只猫。';
assert.doesNotThrow(() => validateAiSemanticPayload(shortDreamPayload, shortDreamText, null));
const shortDreamResult = normalizeAiResult(
  shortDreamPayload,
  shortDreamText,
  {},
  8,
  'AI 梦卡',
  null,
  null,
  null
);
assert.equal(Array.isArray(shortDreamResult.symbols), true);
assert.equal(shortDreamResult.symbols.length, 0);
assert.equal(Array.isArray(shortDreamResult.dream_facts.objects), true);
assert.equal(shortDreamResult.dream_facts.objects.length, 0);
assert.equal(shortDreamResult.visual_plan.main_event, shortDreamText);

const buildBaziChart = exposedInterpretDream.buildBaziChart;
assert.ok(buildBaziChart);
const baziChart = buildBaziChart({
  nickname: 'Runtu',
  birthDate: '1998-01-01',
  birthTime: '08:30',
  birthPlace: '青岛',
  gender: 'male',
});
assert.equal(baziChart.available, true);
assert.equal(baziChart.precision, 'true_solar_time');
assert.equal(baziChart.location.name, '青岛');
assert.equal(baziChart.calculationVersion, 'bazi-v0.6-engine');

const staticDreamChat = await loadInterpretDream({}).main({
  chatAboutDream: true,
  dreamText: '我梦见在学校考试迟到，一直被黑影追赶。',
  dreamResult: {
    title: '云影',
    symbols: ['学校', '追逐'],
    integration_question: '你最在意赶不上什么？',
  },
  messages: [],
  userMessage: '我最近确实很怕赶不上期限。',
});
assert.equal(staticDreamChat.ok, false);
assert.equal(staticDreamChat.reason, 'ai_provider_unavailable');
assert.equal(staticDreamChat.retryable, true);

const missingKeyFallback = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
}).main({
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 4,
});
assert.equal(missingKeyFallback.ok, false);
assert.equal(missingKeyFallback.reason, 'ai_provider_error');
assert.equal(missingKeyFallback.retryable, true);
assert.match(String(missingKeyFallback.provider_error || ''), /Missing API key/);
assert.equal(Object.prototype.hasOwnProperty.call(missingKeyFallback, 'result'), false);

const safetyBlock = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'test-key-not-real',
}).main({
  dreamText: '我梦见自己不想活了',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01' },
  cardIndex: 6,
});
assert.equal(safetyBlock.ok, false);
assert.equal(safetyBlock.blocked, true);
assert.equal(safetyBlock.reason, 'self_harm');

const parseJsonResponse = loadInterpretDream({}, true).parseJsonResponse;
assert.ok(parseJsonResponse);
const repairedModelJson = parseJsonResponse('{"title":"月光\n图书馆","symbols":["银色\t钥匙"],"emotional_weather":"安静"}');
assert.equal(repairedModelJson.title, '月光\n图书馆');
assert.ok(Array.isArray(repairedModelJson.symbols));
assert.equal(repairedModelJson.symbols.join('\u0000'), '银色\t钥匙');
assert.throws(() => parseJsonResponse('["not an object"]'), /must be a JSON object/);
assert.throws(() => parseJsonResponse('{"title":"unterminated}'));

const parseDreamChatContent = exposedInterpretDream.parseDreamChatContent;
assert.ok(parseDreamChatContent);
const explicitRealityChat = parseDreamChatContent(
  '{"reply":"换工作让这个梦更具体了。","memory_candidate":{"eligible":true,"quote":"最近在换工作"}}',
  '我最近在换工作，最近确实睡得不太安稳。'
);
assert.equal(explicitRealityChat.reply, '换工作让这个梦更具体了。');
assert.equal(explicitRealityChat.realityClue, '最近在换工作');
assert.equal(
  parseDreamChatContent(
    '{"reply":"先把它当成一个问题。","memory_candidate":{"eligible":false,"quote":""}}',
    '你觉得我是不是最近在换工作吗？'
  ).realityClue,
  ''
);
assert.equal(
  parseDreamChatContent(
    '{"reply":"这只是模型推测。","memory_candidate":{"eligible":true,"quote":"最近在换工作"}}',
    '我只是说梦里出现了一间办公室。'
  ).realityClue,
  ''
);
for (const message of [
  '梦里我正在换工作。',
  '如果我换工作，可能会轻松一些。',
  '我并不是在换工作。',
]) {
  assert.equal(
    parseDreamChatContent(
      JSON.stringify({
        reply: '继续观察。',
        memory_candidate: { eligible: false, quote: '' },
      }),
      message
    ).realityClue,
    ''
  );
}
assert.equal(
  parseDreamChatContent(
    '{"reply":"不能改写证据。","memory_candidate":{"eligible":true,"quote":"正在准备离职"}}',
    '我最近在换工作。'
  ).realityClue,
  ''
);
const plainTextDreamChat = parseDreamChatContent('纯文本兼容回复', '最近在换工作');
assert.equal(plainTextDreamChat.reply, '纯文本兼容回复');
assert.equal(plainTextDreamChat.realityClue, '');

console.log(`AI readiness checks passed across ${runtimeFiles.length} Mini Program runtime files.`);
