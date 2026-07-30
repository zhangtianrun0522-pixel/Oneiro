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
  normalizeGroundedSymbols?: (value: unknown, dreamText: string, fallback: string[]) => string[];
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
    ? read(interpretDreamPath) + '\nmodule.exports.parseJsonResponse = parseJsonResponse;\nmodule.exports.normalizeGroundedSymbols = normalizeGroundedSymbols;\nmodule.exports.normalizeAiResult = normalizeAiResult;'
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
  'cloudbase-static-fallback',
  'response_format',
  'lunar-javascript',
  'true_solar_time',
  'locationResolver',
  'buildBaziChart',
  'loadDreamMemory',
  'memory_reflection',
  'DREAM_CHAT_SYSTEM_PROMPT',
  'chatAboutDream',
  'reading_hook',
  'alternative_reading',
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
  'cloudbase-static-fallback',
  'Failure Triage',
]) {
  assertIncludes('docs/AI_PROVIDER_RUNBOOK.md', expected);
}

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
assert.equal(staticHealth.fallbackProvider, 'cloudbase-static-fallback');

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
assert.equal(staticInterpretation.ok, true);
assert.equal(staticInterpretation.provider, 'cloudbase-static');
assert.equal((staticInterpretation.result as Record<string, unknown>).card_no, 'NO. 003');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.available, true);
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.precision, 'true_solar_time');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.location.name, '青岛');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.calculationVersion, 'bazi-v0.6-engine');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.birthGender, 'male');
assert.ok(Array.isArray((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.pillarDetails));
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.pillarDetails.length, 4);
assert.ok((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.elementCounts);
assert.ok(Array.isArray((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.hiddenStems.year));
assert.ok((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.strengthEvidence);
assert.ok(Array.isArray((staticInterpretation.result as Record<string, any>).bazi_chart.chartProfile.pillarDetails[0].hiddenTenGods));
assert.ok((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails);
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails.naYin.year, '城头土');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails.diShi.time, '冠带');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails.lifePalaces.mingGong, '壬申');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails.luckCycles.gender, 'male');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.chartDetails.luckCycles.cycles[0].ganZhi, '丙寅');
assert.match(String((staticInterpretation.result as Record<string, unknown>).metaphysical_resonance || ''), /这次梦调动|出生节律/);
const metaphysicalReading = (staticInterpretation.result as Record<string, any>).metaphysical_reading;
assert.ok(metaphysicalReading.temperament.length > 20);
assert.ok(metaphysicalReading.dream_echo.length > 20);
assert.ok(metaphysicalReading.tension.length > 20);
assert.ok(metaphysicalReading.rhythm.length > 20);
assert.ok(metaphysicalReading.basis.length > 20);
assert.match(String((staticInterpretation.result as Record<string, unknown>).cultural_symbolism || ''), /文化象征/);
assert.match(String((staticInterpretation.result as Record<string, unknown>).underneath || ''), /这次梦/);
assert.notEqual(
  String((staticInterpretation.result as Record<string, unknown>).cultural_symbolism || ''),
  String((staticInterpretation.result as Record<string, unknown>).underneath || '')
);
assert.doesNotMatch(
  String((staticInterpretation.result as Record<string, unknown>).metaphysical_resonance || ''),
  /四柱|八字|日主|五行|排盘|命盘|命理|命格|运势|吉凶/
);

const rainDesertInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见沙漠里开始下暴雨',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 4,
});
const rainDesertResult = rainDesertInterpretation.result as Record<string, any>;
assert.ok(rainDesertResult.symbols.includes('暴雨'));
assert.ok(rainDesertResult.symbols.includes('沙漠'));
assert.ok(!rainDesertResult.symbols.includes('清水'));
assert.ok(rainDesertResult.dream_facts.places.includes('沙漠'));
assert.ok(rainDesertResult.dream_facts.objects.includes('暴雨'));
const rainDesertText = JSON.stringify({
  dream_translation: rainDesertResult.dream_translation,
  reading_hook: rainDesertResult.reading_hook,
  underneath: rainDesertResult.underneath,
  cultural_symbolism: rainDesertResult.cultural_symbolism,
  metaphysical_reading: rainDesertResult.metaphysical_reading,
});
assert.doesNotMatch(rainDesertText, /清水|另一个细节|第二个人/);
const rainPsychological = String(rainDesertResult.underneath || '');
assert.match(rainPsychological, /沙漠/);
assert.match(rainPsychological, /暴雨/);
assert.match(rainPsychological, /可能|也许|如果|是否/);
assert.match(rainPsychological, /工作|关系|创作|资源|压力|承担/);
assert.ok(Array.isArray(rainDesertResult.possible_connections));
assert.ok(rainDesertResult.possible_connections.length >= 2);
rainDesertResult.possible_connections.forEach((connection: unknown) => {
  const text = String(connection || '');
  assert.match(text, /沙漠|暴雨/);
  assert.match(text, /工作|关系|创作|资源|压力|边界|承担/);
});
assert.match(String(rainDesertResult.one_small_act || ''), /列出|写下|标记|处理/);
const rainMetaphysical = rainDesertResult.metaphysical_reading;
assert.match(String(rainMetaphysical.temperament || ''), /出生节律|调动|承受边界/);
assert.match(String(rainMetaphysical.dream_echo || ''), /沙漠/);
assert.match(String(rainMetaphysical.dream_echo || ''), /暴雨/);
assert.match(String(rainMetaphysical.tension || ''), /沙漠/);
assert.match(String(rainMetaphysical.tension || ''), /暴雨/);
assert.match(String(rainMetaphysical.tension || ''), /承接|挡|边界|阈值|决定/);
assert.match(String(rainMetaphysical.rhythm || ''), /沙漠|暴雨/);
assert.match(String(rainMetaphysical.rhythm || ''), /列|处理|承接|拒绝/);

const peachInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见西红柿里爆出了一颗水蜜桃',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 6,
});
const peachResult = peachInterpretation.result as Record<string, any>;
assert.ok(!peachResult.symbols.includes('清水'));
assert.doesNotMatch(JSON.stringify(peachResult), /清水|水面|水意象|水的意象/);

const exposedInterpretDream = loadInterpretDream({}, true);
const normalizeGroundedSymbols = exposedInterpretDream.normalizeGroundedSymbols;
assert.ok(normalizeGroundedSymbols);
assert.deepEqual(
  normalizeGroundedSymbols(['水蜜桃'], '我梦见西红柿里爆出了一颗水蜜桃', ['清水']),
  ['水蜜桃']
);
assert.deepEqual(
  normalizeGroundedSymbols(undefined, '我梦见自己站在水里，看着河水涨起', ['清水']),
  ['清水']
);
for (const falseWaterText of ['我去了上海', '墙上挂着海报', '我在看海报', '河马跑过河南']) {
  assert.ok(!normalizeGroundedSymbols(['清水'], falseWaterText, ['未命名场景']).includes('清水'));
}

const normalizeAiResult = exposedInterpretDream.normalizeAiResult;
assert.ok(normalizeAiResult);
const modelFirstPeach = normalizeAiResult(
  {
    symbols: ['西红柿', '水蜜桃'],
    card_theme_label: '未命名场景',
    dream_facts: {
      objects: ['西红柿', '水蜜桃'],
      actions: ['爆出'],
    },
  },
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
assert.doesNotMatch(JSON.stringify(modelFirstPeach), /未命名场景|清水|水面|水意象|水的意象/);

const waterBodyInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见自己站在水里，看着河水涨起',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 7,
});
assert.ok((waterBodyInterpretation.result as Record<string, any>).symbols.includes('清水'));
for (const explicitWaterText of ['我梦见一座水库', '我打了一桶井水', '浴缸里装满了水']) {
  const explicitWaterInterpretation = await loadInterpretDream({}).main({
    dreamText: explicitWaterText,
    profile: {},
    cardIndex: 8,
  });
  assert.ok((explicitWaterInterpretation.result as Record<string, any>).symbols.includes('清水'));
}

const snowRoseInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见沙漠里开始下暴雪，然后沙地里长出了玫瑰花',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 5,
});
const snowRoseResult = snowRoseInterpretation.result as Record<string, any>;
assert.ok(snowRoseResult.symbols.includes('沙漠'));
assert.ok(snowRoseResult.symbols.includes('暴雪'));
assert.ok(snowRoseResult.symbols.includes('玫瑰'));
assert.ok(snowRoseResult.dream_facts.places.includes('沙漠'));
assert.ok(snowRoseResult.dream_facts.objects.includes('暴雪'));
assert.ok(snowRoseResult.dream_facts.objects.includes('玫瑰花'));
assert.ok(snowRoseResult.dream_facts.actions.some((item: string) => /下暴雪/.test(item)));
assert.ok(snowRoseResult.dream_facts.transitions.some((item: string) => /暴雪/.test(item) && /长出|玫瑰/.test(item)));
const snowRoseText = JSON.stringify({
  dream_translation: snowRoseResult.dream_translation,
  reading_hook: snowRoseResult.reading_hook,
  underneath: snowRoseResult.underneath,
  cultural_symbolism: snowRoseResult.cultural_symbolism,
  metaphysical_reading: snowRoseResult.metaphysical_reading,
});
assert.match(snowRoseText, /沙漠/);
assert.match(snowRoseText, /暴雪/);
assert.match(snowRoseText, /玫瑰/);
assert.doesNotMatch(String(snowRoseResult.underneath || ''), /只留下一个清晰的落点/);
assert.doesNotMatch(String(snowRoseResult.cultural_symbolism || ''), /各自代表什么/);
assert.match(String(snowRoseResult.metaphysical_reading.dream_echo || ''), /沙漠/);
assert.match(String(snowRoseResult.metaphysical_reading.dream_echo || ''), /暴雪/);
assert.match(String(snowRoseResult.metaphysical_reading.dream_echo || ''), /玫瑰/);
assert.match(String(snowRoseResult.metaphysical_reading.rhythm || ''), /工作|关系|创作|验证/);

const missingProfileInterpretation = await loadInterpretDream({}).main({
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30' },
  cardIndex: 3,
});
assert.equal(missingProfileInterpretation.ok, true);
assert.equal((missingProfileInterpretation.result as Record<string, any>).bazi_chart.available, false);
assert.equal(String((missingProfileInterpretation.result as Record<string, unknown>).metaphysical_resonance || ''), '');
assert.equal(String((missingProfileInterpretation.result as Record<string, unknown>).metaphysical_basis || ''), '');

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
assert.equal(staticDreamChat.ok, true);
assert.equal(staticDreamChat.provider, 'cloudbase-static');
assert.equal(staticDreamChat.fallback, true);
assert.match(String(staticDreamChat.reply || ''), /学校/);

const missingKeyFallback = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
}).main({
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 4,
});
assert.equal(missingKeyFallback.ok, true);
assert.equal(missingKeyFallback.provider, 'cloudbase-static-fallback');
assert.match(String(missingKeyFallback.provider_error || ''), /Missing API key/);
assert.equal((missingKeyFallback.result as Record<string, unknown>).card_no, 'NO. 004');

const strictMissingKey = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
  INTERPRET_STRICT_AI: '1',
}).main({
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 5,
});
assert.equal(strictMissingKey.ok, false);
assert.equal(strictMissingKey.reason, 'ai_provider_error');

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

console.log(`AI readiness checks passed across ${runtimeFiles.length} Mini Program runtime files.`);
