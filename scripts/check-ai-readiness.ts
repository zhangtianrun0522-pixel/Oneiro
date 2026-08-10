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
    realityClues: string[];
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
  sanitizeMetaphysicalText?: (value: unknown, fallback?: string, maxLength?: number) => string;
  validateMetaphysicalContract?: (payload: Record<string, unknown>, dreamText: string, metaphysicalRequired: boolean, errorPrefix: string) => void;
  buildInterpretationSystemPrompt?: (baziChart?: unknown) => string;
  buildBaziChart?: (profile: Record<string, unknown>) => Record<string, any>;
  loadCurrentPortrait?: (openid: string) => Promise<Record<string, any> | null>;
  sanitizeProfileInput?: (value: unknown) => Record<string, unknown>;
  buildDreamMemory?: (records: unknown[], memoryUnavailable?: boolean) => Record<string, any>;
  buildMemoryEchoes?: (memory: unknown, dreamText: string) => Record<string, any>[];
  buildUserContext?: (
    profile: Record<string, unknown>,
    dreamText: string,
    memory: unknown,
    lifeNote: unknown
  ) => string;
  evaluateMemoryEcho?: (
    memory: unknown,
    dreamText: string,
    result: Record<string, unknown>
  ) => { offered: number; used: number; symbols: string[] };
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

function loadInterpretDream(env: Record<string, string>, exposeParser = false, database?: unknown): InterpretDreamModule {
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
          database: database ? () => database : undefined,
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
    ? read(interpretDreamPath) + '\nmodule.exports.parseJsonResponse = parseJsonResponse;\nmodule.exports.parseDreamChatContent = parseDreamChatContent;\nmodule.exports.normalizeSymbols = normalizeSymbols;\nmodule.exports.normalizeAiResult = normalizeAiResult;\nmodule.exports.validateAiSemanticPayload = validateAiSemanticPayload;\nmodule.exports.sanitizeMetaphysicalText = sanitizeMetaphysicalText;\nmodule.exports.validateMetaphysicalContract = validateMetaphysicalContract;\nmodule.exports.buildInterpretationSystemPrompt = buildInterpretationSystemPrompt;\nmodule.exports.buildBaziChart = buildBaziChart;\nmodule.exports.loadCurrentPortrait = loadCurrentPortrait;\nmodule.exports.sanitizeProfileInput = sanitizeProfileInput;\nmodule.exports.buildDreamMemory = buildDreamMemory;\nmodule.exports.buildMemoryEchoes = buildMemoryEchoes;\nmodule.exports.buildUserContext = buildUserContext;\nmodule.exports.evaluateMemoryEcho = evaluateMemoryEcho;'
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
  'METAPHYSICAL_PROMPT_RULES',
  'METAPHYSICAL_READING_SYSTEM_PROMPT',
  'metaphysicalReading',
  'metaphysicalAvailable',
  'reading_hook',
  'sanitizeFortuneClaims',
  'birth_place_unresolved',
  'oneiro-freeform-reading-v0.7-grounded-modules',
]) {
  assertIncludes(interpretDreamPath, expected);
}

for (const expected of [
  'INTERPRET_PROVIDER=deepseek',
  'DEEPSEEK_API_KEY=<rotate-and-set-in-cloudbase-only>',
  'INTERPRET_TIMEOUT_MS=45000',
  'healthCheck',
  'providerConfigured',
  'keeps the CloudBase platform timeout at',
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
  'INTERPRET_TIMEOUT_MS=45000',
  '70000',
  'provider_timeout',
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
  'npm run check:ai-readiness && npm run check:cloudbase && npm run check:miniprogram && npm run check:phase3 && npm run check:image-contract && npm run check:image-quality-job && npm run typecheck',
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

// ── 出生地：认不出城市不等于用户没填 ──
//
// 城市表只有 49 条省会与主要地级市。用户写「山东临沭」这类地名时整个解析失败，
// 而错误信息还在要求他「补充出生城市」——他填了。省级兜底让功能可用，并显式
// 标注精度已降级，而不是假装拿到了精确坐标。
const linshu = locationResolver.resolveBirthPlace('山东临沭');
assert.ok(linshu, '省级兜底应能解析出未收录的县级地名');
assert.equal((linshu as Record<string, any>).precision, 'province');
assert.equal((linshu as Record<string, any>).approximatedFrom, '济南');
// 精确匹配到的城市必须保持 city 精度，不能被兜底降级。
assert.equal((qingdao as Record<string, any>).precision, 'city');
// 完全无从判断的输入仍然要拒绝，不能兜底成某个省。
assert.equal(locationResolver.resolveBirthPlace('某个不存在的地方'), null);
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
assert.equal(staticHealth.requestTimeoutMs, 45000);
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
assert.equal(deepseekHealth.requestTimeoutMs, 45000);
const cappedHealth = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'test-key-not-real',
  INTERPRET_TIMEOUT_MS: '90000',
}).main({ healthCheck: true });
assert.equal(cappedHealth.requestTimeoutMs, 50000);

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

// ── 记忆检索：必须按「与今晚这个梦的相关性」而不是「历史总频次」注入 ──
//
// 旧实现把出现次数最多的三个意象无条件塞进 prompt。于是无论今晚梦到什么，
// 模型看到的永远是同一份背景板；而 prompt 的红线又规定「没有具体呼应时禁止
// 假装记得」，模型只能正确地闭嘴。结果就是用户读到一份完全没有记忆的解读，
// 尽管系统其实知道这个意象在重复。
const buildDreamMemory = exposedInterpretDream.buildDreamMemory;
const buildMemoryEchoes = exposedInterpretDream.buildMemoryEchoes;
const buildUserContext = exposedInterpretDream.buildUserContext;
assert.ok(buildDreamMemory);
assert.ok(buildMemoryEchoes);
assert.ok(buildUserContext);

function memoryRecord(daysAgo: number, symbols: string[], title: string) {
  return {
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    symbols,
    result: { title, symbols, dream_translation: `${title}的复述` },
  };
}

// 「沙漠」出现四次但都在半年前；「树」只出现两次却都在最近一个月内。
const memoryFixture = buildDreamMemory([
  memoryRecord(3, ['树', '窗'], '穿窗之树'),
  memoryRecord(21, ['树', '剪刀'], '剪枝'),
  memoryRecord(200, ['沙漠', '暴雨'], '旧沙漠一'),
  memoryRecord(210, ['沙漠', '暴雨'], '旧沙漠二'),
  memoryRecord(220, ['沙漠', '清水'], '旧沙漠三'),
  memoryRecord(230, ['沙漠', '清水'], '旧沙漠四'),
]);

// 时间衰减：近期在重复的意象必须排在陈年高频意象之前。
assert.equal(memoryFixture.recurringSymbols[0].symbol, '树');

// 今晚梦到树 → 必须给出带时间感、可被用户当场核对的具体呼应。
const treeEchoes = buildMemoryEchoes(memoryFixture, '我梦见一棵树从窗户里长进来，我没有剪掉它，只是坐在树下。');
assert.ok(treeEchoes.length >= 1);
assert.equal(treeEchoes[0].symbol, '树');
assert.equal(treeEchoes[0].pastDreamCount, 2);
assert.ok(String(treeEchoes[0].lastSeen).length > 0);
assert.ok(treeEchoes[0].occurrences.some((item: Record<string, any>) => item.title === '剪枝'));

// 今晚的梦与历史毫无重合 → 一条呼应都不能给，模型才不会被诱导编造记忆。
assert.equal(buildMemoryEchoes(memoryFixture, '我梦见自己在一列没有终点的火车上。').length, 0);

const echoContext = buildUserContext({}, '我梦见一棵树从窗户里长进来。', memoryFixture, null);
assert.ok(echoContext.includes('已核实的历史呼应'));
const silentContext = buildUserContext({}, '我梦见自己在一列没有终点的火车上。', memoryFixture, null);
assert.ok(!silentContext.includes('已核实的历史呼应'));

// ── 呼应命中率：内测唯一能证明「记忆真的被说出口」的指标 ──
//
// 这个数不能靠感觉。系统交给模型 N 处已核实的重复，解读里最终点名了几处，
// 只有分子分母都成立，诊断页上的百分比才不是自我安慰。
const evaluateMemoryEcho = exposedInterpretDream.evaluateMemoryEcho;
assert.ok(evaluateMemoryEcho);

const echoDreamText = '我梦见一棵树从窗户里长进来，我没有剪掉它，只是坐在树下。';

// 呼应被写进了面向用户的叙述 → 命中。
const spokenEcho = evaluateMemoryEcho(memoryFixture, echoDreamText, {
  reading_hook: '这次你没有动手剪。',
  underneath: '树又一次出现，而这次你选择坐下。',
  possible_connections: ['三周前那次你还在剪枝。'],
});
// 今晚的梦同时命中「树」和「窗」两处历史重复，解读只点了「树」——命中率
// 按解读算是命中，按呼应条数算是 1/2。诊断页两个数都显示，正是为了区分
// 「一处都没说」和「说了但没说全」。
assert.equal(spokenEcho.offered, 2);
assert.equal(spokenEcho.used, 1);
assert.equal(spokenEcho.symbols.join(','), '树');

// 系统给了呼应，解读却只字未提 → 未命中。这正是要在内测期抓出来的失败。
const silentEcho = evaluateMemoryEcho(memoryFixture, echoDreamText, {
  reading_hook: '一个关于停留的梦。',
  underneath: '你在梦里选择了不动手。',
  possible_connections: [],
});
assert.equal(silentEcho.offered, 2);
assert.equal(silentEcho.used, 0);

// 意象只出现在生图字段里不算命中：那说明生图在画它，不是解读点出了这处重复。
const visualOnlyEcho = evaluateMemoryEcho(memoryFixture, echoDreamText, {
  reading_hook: '一个关于停留的梦。',
  image_prompt: 'a tree growing through a window',
  visual_plan: { symbols: ['树'] },
});
assert.equal(visualOnlyEcho.used, 0);

// 今晚的梦与历史无重合 → offered 为 0，不进命中率的分母。模型的沉默在这里
// 是正确行为，混进分母只会把指标稀释成噪声。
const noEcho = evaluateMemoryEcho(memoryFixture, '我梦见自己在一列没有终点的火车上。', {
  reading_hook: '火车没有终点。',
});
assert.equal(noEcho.offered, 0);
assert.equal(noEcho.used, 0);

const normalizeAiResult = exposedInterpretDream.normalizeAiResult;
assert.ok(normalizeAiResult);
const validateAiSemanticPayload = exposedInterpretDream.validateAiSemanticPayload;

function portraitDatabase(stateDocs: Record<string, unknown>[], snapshots: Record<string, unknown>[]) {
  return {
    collection(name: string) {
      let query: Record<string, unknown> = {};
      const chain = {
        where(next: Record<string, unknown>) {
          query = next;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return chain;
        },
        async get() {
          if (name === 'profile_memory_state') return { data: stateDocs };
          if (name === 'profile_snapshots') {
            return {
              data: snapshots.filter((snapshot) => Object.entries(query).every(([key, value]) => snapshot[key] === value)),
            };
          }
          return { data: [] };
        },
      };
      return chain;
    },
  };
}

const validPortrait = {
  _id: 'portrait-current',
  openid: 'portrait-user',
  summary: '最近在换工作，也在重新整理生活节奏。',
  status: 'confirmed',
  isCurrent: true,
  useInFutureReadings: true,
};
const loadPortrait = async (stateDocs: Record<string, unknown>[], snapshots: Record<string, unknown>[]) => {
  const module = loadInterpretDream({}, true, portraitDatabase(stateDocs, snapshots));
  assert.ok(module.loadCurrentPortrait);
  return module.loadCurrentPortrait?.('portrait-user');
};

assert.equal(
  JSON.stringify(exposedInterpretDream.sanitizeProfileInput?.({
    nickname: 'Runtu',
    currentPortrait: { summary: '客户端伪造画像' },
    confirmedPortrait: { summary: '客户端缓存画像' },
  })),
  JSON.stringify({ nickname: 'Runtu' }),
  'client-provided portraits must not enter the trusted profile context'
);
assert.equal(
  await loadPortrait([{ openid: 'portrait-user', currentSnapshotId: 'portrait-current', paused: true }], [validPortrait]),
  null,
  'a paused state pointer must not inject a portrait'
);
assert.equal(
  await loadPortrait([{ openid: 'portrait-user', currentSnapshotId: '' }], [validPortrait]),
  null,
  'a state document without a pointer must not fall back to older portraits'
);
assert.equal(
  await loadPortrait([{ openid: 'portrait-user', currentSnapshotId: 'portrait-current' }], [{ ...validPortrait, useInFutureReadings: false }]),
  null,
  'a pointed portrait disabled for future readings must not fall back'
);
assert.equal(
  (await loadPortrait([], [validPortrait]))?.summary,
  validPortrait.summary,
  'legacy users without a state document may fall back to a current confirmed portrait'
);
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
  metaphysical_resonance: '',
  metaphysical_basis: '',
  metaphysical_reading: {
    temperament: '',
    dream_echo: '',
    tension: '',
    rhythm: '',
    basis: '',
  },
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

// ── 画像接进「与你有关」之后：关联必须是一句话，不是一个标签 ──
//
// 把画像主题贴出来是模型最省力的写法：「承接压力」，或者干脆「主题：承接压力」。
// 两种都读作归档动作而不是理解——用户看到的是自己的梦被分了类。提示词里已经
// 禁了，但那道闸靠模型自觉；这是产品的硬边界，所以规范化这一层必须自己兜住。
//
// 两种力度不同，因为破坏方式不同：元话语没有信息量，只有分类动作，整段删掉；
// 引号里那句话往往是句子的主干，连带删掉会把整条呼应打碎，所以只拆括号——
// 拆完它自然融回句子，读起来就是一句观察。
const labelledConnectionPayload = JSON.parse(JSON.stringify(completeModelPayload));
labelledConnectionPayload.possible_connections = [
  '梦里水一直漫上来，你却一点也不慌，和你最近一直在「默默接住很多事」是同一种姿态。',
  '主题：承接压力。西红柿里出现水蜜桃，对应你最近手上那件事的走向。',
  '「承接压力」',
];
labelledConnectionPayload.mirror = '对应画像 2：熟悉外表里出现了不同内容。';
const labelledConnectionResult = normalizeAiResult(
  labelledConnectionPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  8,
  'AI 梦卡',
  null,
  null,
  null
);
// 括号拆掉，句子完整保留——这一条本来就是合格的观察，不该被误伤成空。
assert.equal(
  labelledConnectionResult.possible_connections[0],
  '梦里水一直漫上来，你却一点也不慌，和你最近一直在默默接住很多事是同一种姿态。'
);
// 元话语整段消失，后半句照常留下。
assert.equal(
  labelledConnectionResult.possible_connections[1],
  '西红柿里出现水蜜桃，对应你最近手上那件事的走向。'
);
// 纯标签清完只剩残句，整条丢弃：宁可这次没有关联，也不要在「与你有关」下面
// 挂一句读不通的话。
assert.equal(labelledConnectionResult.possible_connections.length, 2);
assert.doesNotMatch(labelledConnectionResult.possible_connections.join('\n'), /[「」『』]|主题[：:]|对应画像/);
// mirror 同样要过：一条呼应都没有时，结果页会把它当成「与你有关」的正文顶上去。
assert.equal(labelledConnectionResult.mirror, '熟悉外表里出现了不同内容。');

// 干净的短句不该被那道长度下限误伤——它只对被清理过的内容生效。
const shortCleanMirrorPayload = JSON.parse(JSON.stringify(completeModelPayload));
shortCleanMirrorPayload.mirror = '还看不准。';
const shortCleanMirrorResult = normalizeAiResult(
  shortCleanMirrorPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  9,
  'AI 梦卡',
  null,
  null,
  null
);
assert.equal(shortCleanMirrorResult.mirror, '还看不准。');

// 提示词那一侧的禁令也必须在位。确定性兜底能拦住已知写法，但真正决定输出读起来
// 像不像一句人话的，仍然是提示词——两道闸缺一不可。
const interpretSource = read('miniprogram/cloudfunctions/interpretDream/index.js');
assert.ok(interpretSource.includes('严禁把画像主题当标签贴出'));
assert.ok(interpretSource.includes('possible_connections 为空'));

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

// 缺哪一样就点名哪一样。笼统提示会让只差出生时间的用户反复确认自己已经填过
// 日期和城市——资料页把出生时间标成「可选」，而这个功能非它不可。
const missingTimeChart = buildBaziChart({ birthDate: '1998-01-01', birthTime: '', birthPlace: '青岛' });
assert.equal(missingTimeChart.available, false);
assert.equal(missingTimeChart.missingFields.join(','), '出生时间');
assert.ok(missingTimeChart.summary.includes('出生时间'));
assert.ok(!missingTimeChart.summary.includes('出生日期'), '不得要求用户补充已经填好的字段');
assert.ok(!missingTimeChart.summary.includes('出生城市'), '不得要求用户补充已经填好的字段');

const unresolvedPlaceChart = buildBaziChart({ birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '某个不存在的地方' });
assert.equal(unresolvedPlaceChart.available, false);
assert.equal(unresolvedPlaceChart.precision, 'location_unresolved');
assert.ok(unresolvedPlaceChart.basis.includes('无法识别'));


const chartModelPayload = JSON.parse(JSON.stringify(completeModelPayload));
chartModelPayload.metaphysical_resonance = '梦中西红柿里爆出水蜜桃；日主甲木的表达在这里仅作为观察这次变化的技术参照。';
chartModelPayload.metaphysical_basis = '四柱计算显示日主为甲木，梦中西红柿里爆出水蜜桃这一事实是本次解读的落点。';
chartModelPayload.metaphysical_reading = {
  temperament: '梦中西红柿里爆出水蜜桃这一动作，让日主甲木的向外生发只作为当下观察线索。',
  dream_echo: '梦中水蜜桃从西红柿里出现，与五行木的生发意象形成有限呼应。',
  tension: '梦中西红柿的外壳与水蜜桃的出现并置，十神资料只用来观察这份拉扯。',
  rhythm: '梦中爆出水蜜桃的瞬间提示先记录变化；日主甲木不构成对后续结果的判断。',
  basis: '四柱中的日主甲木与梦中西红柿里爆出水蜜桃这一具体画面相对照。',
};
assert.doesNotThrow(() => validateAiSemanticPayload(
  chartModelPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const chartModelResult = normalizeAiResult(
  chartModelPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  9,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(chartModelResult.metaphysicalAvailable, true);
assert.deepEqual(JSON.parse(JSON.stringify(chartModelResult.metaphysical_reading)), {
  temperament: '',
  dream_echo: '',
  tension: '',
  rhythm: '',
  basis: '',
});
assert.equal(chartModelResult.metaphysical_resonance, '');
assert.equal(chartModelResult.metaphysical_basis, '');
assert.doesNotMatch(
  exposedInterpretDream.buildInterpretationSystemPrompt?.(baziChart) || '',
  /必须全部非空|出生节律参考（只能解释/
);

const incompleteChartPayload = JSON.parse(JSON.stringify(chartModelPayload));
incompleteChartPayload.metaphysical_reading.tension = '';
assert.doesNotThrow(() => validateAiSemanticPayload(
  incompleteChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const incompleteChartResult = normalizeAiResult(
  incompleteChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  10,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(incompleteChartResult.metaphysical_resonance, '');
assert.equal(incompleteChartResult.metaphysical_reading.tension, '');

const missingMetaphysicalKeysPayload = JSON.parse(JSON.stringify(completeModelPayload));
delete missingMetaphysicalKeysPayload.metaphysical_resonance;
delete missingMetaphysicalKeysPayload.metaphysical_basis;
delete missingMetaphysicalKeysPayload.metaphysical_reading;
assert.doesNotThrow(() => validateAiSemanticPayload(
  missingMetaphysicalKeysPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const missingMetaphysicalKeysResult = normalizeAiResult(
  missingMetaphysicalKeysPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  11,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(missingMetaphysicalKeysResult.metaphysical_resonance, '');
assert.equal(missingMetaphysicalKeysResult.metaphysical_basis, '');
assert.deepEqual(JSON.parse(JSON.stringify(missingMetaphysicalKeysResult.metaphysical_reading)), {
  temperament: '',
  dream_echo: '',
  tension: '',
  rhythm: '',
  basis: '',
});

const shortDreamChartPayload = JSON.parse(JSON.stringify(completeModelPayload));
shortDreamChartPayload.dream_facts = { objects: ['猫'] };
shortDreamChartPayload.symbols = ['猫'];
shortDreamChartPayload.visual_plan = {
  main_event: '一只猫出现',
  setting: '梦中画面',
  preserve_elements: ['猫']
};
shortDreamChartPayload.metaphysical_resonance = '梦中一只猫出现，日主甲木只作为观察这个画面的技术参照。';
shortDreamChartPayload.metaphysical_basis = '四柱计算显示日主为甲木。';
shortDreamChartPayload.metaphysical_reading = {
  temperament: '日主甲木只作为本次观察的技术参照。',
  dream_echo: '梦中一只猫出现，与五行木的生发意象形成有限呼应。',
  tension: '梦中一只猫停留的画面，十神资料只用来观察这份停顿。',
  rhythm: '日主甲木不构成对后续结果的判断。',
  basis: '四柱中的日主甲木是本次确定性计算的技术锚点。',
};
assert.doesNotThrow(() => validateAiSemanticPayload(
  shortDreamChartPayload,
  '我梦见一只猫。',
  baziChart
));
const shortDreamFallbackPayload = JSON.parse(JSON.stringify(shortDreamChartPayload));
delete shortDreamFallbackPayload.metaphysical_resonance;
delete shortDreamFallbackPayload.metaphysical_basis;
delete shortDreamFallbackPayload.metaphysical_reading;
const shortDreamFallbackResult = normalizeAiResult(
  shortDreamFallbackPayload,
  '我梦见一只猫。',
  {},
  12,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.deepEqual(JSON.parse(JSON.stringify(shortDreamFallbackResult.dream_facts.objects)), ['猫']);
assert.equal(shortDreamFallbackResult.metaphysical_resonance, '');
assert.equal(shortDreamFallbackResult.metaphysical_reading.temperament, '');

const ungroundedChartPayload = JSON.parse(JSON.stringify(chartModelPayload));
ungroundedChartPayload.metaphysical_resonance = '日主甲木只作为技术参照。';
ungroundedChartPayload.metaphysical_reading.temperament = '日主甲木只作为技术参照。';
ungroundedChartPayload.metaphysical_reading.dream_echo = '五行木只作为技术参照。';
ungroundedChartPayload.metaphysical_reading.tension = '十神只作为技术参照。';
ungroundedChartPayload.metaphysical_reading.rhythm = '日主甲木只作为技术参照。';
ungroundedChartPayload.metaphysical_basis = '四柱计算显示日主甲木。';
ungroundedChartPayload.metaphysical_reading.basis = '四柱中的日主甲木是技术锚点。';
assert.doesNotThrow(() => validateAiSemanticPayload(
  ungroundedChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const groundedFallbackResult = normalizeAiResult(
  ungroundedChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  11,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(groundedFallbackResult.metaphysical_resonance, '');
assert.equal(groundedFallbackResult.metaphysical_reading.temperament, '');

const predictiveChartPayload = JSON.parse(JSON.stringify(chartModelPayload));
predictiveChartPayload.metaphysical_resonance = '梦中西红柿里爆出水蜜桃，预示未来运势会变好。';
assert.doesNotThrow(() => validateAiSemanticPayload(
  predictiveChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const predictiveFallbackResult = normalizeAiResult(
  predictiveChartPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  12,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(predictiveFallbackResult.metaphysical_resonance, '');
assert.equal(predictiveFallbackResult.metaphysical_basis, '');
assert.deepEqual(JSON.parse(JSON.stringify(predictiveFallbackResult.metaphysical_reading)), {
  temperament: '',
  dream_echo: '',
  tension: '',
  rhythm: '',
  basis: '',
});
assert.equal(
  exposedInterpretDream.sanitizeMetaphysicalText?.('梦中西红柿里爆出水蜜桃，运势会变好。'),
  ''
);
assert.doesNotThrow(() => exposedInterpretDream.validateMetaphysicalContract?.(
  chartModelPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  true,
  '按需命理'
));
const incompleteMetaphysicalPayload = JSON.parse(JSON.stringify(chartModelPayload));
incompleteMetaphysicalPayload.metaphysical_reading.rhythm = '';
assert.throws(
  () => exposedInterpretDream.validateMetaphysicalContract?.(
    incompleteMetaphysicalPayload,
    '我梦见西红柿里爆出了一颗水蜜桃',
    true,
    '按需命理'
  ),
  /incomplete metaphysical fields/
);
const contaminatedBasePayload = JSON.parse(JSON.stringify(completeModelPayload));
contaminatedBasePayload.metaphysical_resonance = '梦中西红柿里爆出水蜜桃。';
assert.doesNotThrow(() => validateAiSemanticPayload(
  contaminatedBasePayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  null
));
const noChartResult = normalizeAiResult(
  contaminatedBasePayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  13,
  'AI 梦卡',
  null,
  null,
  null
);
assert.equal(noChartResult.metaphysical_resonance, '');
assert.equal(noChartResult.metaphysical_basis, '');
assert.deepEqual(JSON.parse(JSON.stringify(noChartResult.metaphysical_reading)), {
  temperament: '',
  dream_echo: '',
  tension: '',
  rhythm: '',
  basis: '',
});
const technicalLeakPayload = JSON.parse(JSON.stringify(chartModelPayload));
technicalLeakPayload.reading_hook = '日主甲木让西红柿里爆出水蜜桃更醒目。';
assert.doesNotThrow(() => validateAiSemanticPayload(
  technicalLeakPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  baziChart
));
const technicalLeakResult = normalizeAiResult(
  technicalLeakPayload,
  '我梦见西红柿里爆出了一颗水蜜桃',
  {},
  14,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(technicalLeakResult.reading_hook, '这个梦还需要你自己先看一遍，再决定它像什么。');
assert.doesNotMatch(technicalLeakResult.reading_hook, /四柱|八字|日主|五行|十神|排盘|命盘|命理|命格/);
// 这个梦里没有任何人说话。兜底文案一旦预设「这段话」，就是对用户自己的梦说了
// 假话——比留白更伤信任，也违反「只引用梦里真实出现的内容」这条红线。
assert.doesNotMatch(technicalLeakResult.reading_hook, /这段话|一段话|听见/);

// ── 传统解梦可以引用，吉凶判断不行 ──
//
// 「文化象征」改成周公解梦一脉的传统释义是产品决定；但传统文本天然带占卜口吻
// （「主口舌」「大凶」「此乃预兆」），那撞的是这个产品自己的红线：不预测、不断
// 吉凶。带吉凶断言的整段丢弃——宁可没有这一块。
const fortunePayload = JSON.parse(JSON.stringify(chartModelPayload));
fortunePayload.cultural_symbolism = '传统解梦认为梦见水主财，此乃大吉之预兆。';
const fortuneResult = normalizeAiResult(
  fortunePayload, '我梦见西红柿里爆出了一颗水蜜桃', {}, 15, 'AI 梦卡', null, baziChart, null
);
assert.equal(fortuneResult.cultural_symbolism, '');

// 不带吉凶的传统说法必须原样保留，否则这个模块等于没做。
const traditionPayload = JSON.parse(JSON.stringify(chartModelPayload));
traditionPayload.cultural_symbolism = '传统解梦里，果实多被看作收成与生养的意象；这是传统的讲法，不是对你的判断。';
const traditionResult = normalizeAiResult(
  traditionPayload, '我梦见西红柿里爆出了一颗水蜜桃', {}, 16, 'AI 梦卡', null, baziChart, null
);
assert.ok(traditionResult.cultural_symbolism.includes('传统解梦里'));

const restrictedDreamText = '我梦见别人说我的命运由八字决定。';
const restrictedDreamPayload = JSON.parse(JSON.stringify(completeModelPayload));
restrictedDreamPayload.title = '八字决定';
restrictedDreamPayload.card_theme_label = '命理';
restrictedDreamPayload.dream_translation = restrictedDreamText;
restrictedDreamPayload.reading_hook = restrictedDreamText;
restrictedDreamPayload.integration_question = restrictedDreamText;
restrictedDreamPayload.image = restrictedDreamText;
restrictedDreamPayload.image_prompt = restrictedDreamText;
restrictedDreamPayload.dream_facts = { objects: ['八字'] };
restrictedDreamPayload.symbols = ['八字'];
restrictedDreamPayload.visual_plan = {
  main_event: '八字决定',
  setting: '命理场景',
  preserve_elements: ['八字']
};
assert.doesNotThrow(() => validateAiSemanticPayload(restrictedDreamPayload, restrictedDreamText, null));
const restrictedDreamResult = normalizeAiResult(
  restrictedDreamPayload,
  restrictedDreamText,
  {},
  15,
  'AI 梦卡',
  null,
  null,
  null
);
assert.ok(restrictedDreamResult.title);
assert.ok(restrictedDreamResult.dream_translation);
assert.ok(restrictedDreamResult.reading_hook);
assert.ok(restrictedDreamResult.integration_question);
assert.ok(restrictedDreamResult.image);
assert.ok(restrictedDreamResult.image_prompt);
const ordinaryRestrictedResult = JSON.parse(JSON.stringify(restrictedDreamResult));
delete ordinaryRestrictedResult.metaphysical_resonance;
delete ordinaryRestrictedResult.metaphysical_basis;
delete ordinaryRestrictedResult.metaphysical_reading;
delete ordinaryRestrictedResult.bazi_chart;
assert.doesNotMatch(
  JSON.stringify(ordinaryRestrictedResult),
  /四柱|八字|日主|五行|十神|排盘|命盘|命理|命格|运势|吉凶|凶吉|注定|必然|命运/
);
const restrictedChartPayload = JSON.parse(JSON.stringify(restrictedDreamPayload));
delete restrictedChartPayload.metaphysical_resonance;
delete restrictedChartPayload.metaphysical_basis;
delete restrictedChartPayload.metaphysical_reading;
const restrictedChartResult = normalizeAiResult(
  restrictedChartPayload,
  restrictedDreamText,
  {},
  16,
  'AI 梦卡',
  null,
  baziChart,
  null
);
assert.equal(restrictedChartResult.metaphysical_basis, '');
assert.equal(restrictedChartResult.metaphysical_resonance, '');
assert.deepEqual(JSON.parse(JSON.stringify(restrictedChartResult.metaphysical_reading)), {
  temperament: '',
  dream_echo: '',
  tension: '',
  rhythm: '',
  basis: '',
});

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

const missingMetaphysicalProfile = await loadInterpretDream({
  INTERPRET_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'test-key-not-real',
}).main({
  metaphysicalReading: true,
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01' },
  baseResult: { title: '月光钥匙', symbols: ['图书馆', '钥匙'] },
});
assert.equal(missingMetaphysicalProfile.ok, false);
assert.equal(missingMetaphysicalProfile.reason, 'birth_profile_missing');

const unavailableMetaphysicalReading = await loadInterpretDream({}).main({
  metaphysicalReading: true,
  dreamText: '我梦见在月光下的图书馆找到一把银色钥匙',
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  baseResult: { title: '月光钥匙', symbols: ['图书馆', '钥匙'] },
});
assert.equal(unavailableMetaphysicalReading.ok, false);
assert.equal(unavailableMetaphysicalReading.reason, 'ai_provider_unavailable');
assert.equal(unavailableMetaphysicalReading.errorCode, 'provider_error');
assert.ok(unavailableMetaphysicalReading.provider_error);

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
// 模型决定事实是否 eligible；服务端只接受当前用户消息里的连续原文，
// 不能把模型的推测、改写或补全作为资料写入。
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
assert.equal(
  parseDreamChatContent(
    '{"reply":"这是梦里的画面。","memory_candidate":{"eligible":false,"quote":"梦里我正在换工作"}}',
    '梦里我正在换工作。'
  ).realityClue,
  ''
);
// 一条消息里往往同时讲了好几件事。老契约只收一条，剩下的直接蒸发——用户在
// 资料页看到的就是「提取得不全」。
const multiClueMessage = '我最近其实很颓废，什么也不想干，而且我在考虑出国。';
const multiClueChat = parseDreamChatContent(
  JSON.stringify({
    reply: '两件事都听到了。',
    memory_candidates: [
      { eligible: true, quote: '我最近其实很颓废' },
      { eligible: true, quote: '我在考虑出国' },
    ],
  }),
  multiClueMessage
);
assert.equal(multiClueChat.realityClues.length, 2);
assert.equal(multiClueChat.realityClues[1], '我在考虑出国');
// 旧客户端读的仍然是单条字段。
assert.equal(multiClueChat.realityClue, '我最近其实很颓废');
// 最多三条，防止模型把整段话拆成碎片灌进资料。
assert.equal(
  parseDreamChatContent(
    JSON.stringify({
      reply: '好',
      memory_candidates: [1, 2, 3, 4, 5].map(() => ({ eligible: true, quote: '我在考虑出国' })),
    }),
    multiClueMessage
  ).realityClues.length,
  1,
  '同一句重复报上来只算一条'
);
// 旧的单条格式必须继续认。
assert.equal(
  parseDreamChatContent(
    '{"reply":"好","memory_candidate":{"eligible":true,"quote":"我在考虑出国"}}',
    multiClueMessage
  ).realityClues[0],
  '我在考虑出国'
);
// 逐字校验不能被标点卡住：模型顺手把句中的逗号补成句号，原本合格的引用会被
// 静默丢掉，看起来就像模型没提取——而且没有任何地方说发生过什么。
assert.equal(
  parseDreamChatContent(
    '{"reply":"好","memory_candidate":{"eligible":true,"quote":"我最近其实很颓废。什么也不想干"}}',
    multiClueMessage
  ).realityClues[0],
  '我最近其实很颓废。什么也不想干'
);
// 但改写仍然要拦住：这是防止模型把自己的话记成用户的话，这条不能松。
assert.equal(
  parseDreamChatContent(
    '{"reply":"好","memory_candidate":{"eligible":true,"quote":"我打算移民加拿大"}}',
    multiClueMessage
  ).realityClues.length,
  0
);

// 「还没发生」不再是排除理由。计划和正在考虑的选择是这个人现实处境的一部分，
// 往往比已经发生的事更能说明他现在在哪。
const chatPromptSource = read('miniprogram/cloudfunctions/interpretDream/index.js');
assert.ok(
  chatPromptSource.includes('还没发生不是排除理由'),
  '打算、计划、正在考虑的事必须可以记进资料'
);
assert.ok(
  chatPromptSource.includes('全都挑出来，最多三条'),
  '一条消息里的多件事必须全部挑出来'
);

const plainTextDreamChat = parseDreamChatContent('纯文本兼容回复', '最近在换工作');
assert.equal(plainTextDreamChat.reply, '纯文本兼容回复');
assert.equal(plainTextDreamChat.realityClue, '');

// ── 画像 prompt：必须写人，不写梦 ──
const profileMemorySource = read('miniprogram/cloudfunctions/profileMemory/index.js');
assert.ok(
  profileMemorySource.includes('严禁转述、复述或改写任何一个梦的场景、角色或情节'),
  'portrait prompt must ban dream scene retelling'
);
assert.ok(
  profileMemorySource.includes('每一句话的主语应该是这个人的倾向、习惯、状态或处境，不是他的梦'),
  'portrait prompt must require person-as-subject, not dreams'
);
assert.ok(
  profileMemorySource.includes('不得复述梦境场景'),
  'portrait prompt concise ban must also appear in the rules line'
);
assert.ok(
  profileMemorySource.includes('只写推断结果，不铺垫原始场景作为佐证'),
  'portrait prompt must ban using dream scenes as evidence padding'
);

// 画像读起来「云里雾里」有具体来源：模糊限定词、没有所指的抽象名词、对偶排比，
// 以及一个把普适句当填充料的字数下限。这几条是针对它们的，不是风格偏好。
assert.ok(
  profileMemorySource.includes('字数是上限，不是目标'),
  '字数下限会逼出车轱辘话，必须是上限'
);
// 注释里会引用旧值来解释为什么改，所以只看真正发给模型的那些行。
const profileMemoryPromptLines = profileMemorySource
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');
assert.ok(
  !/约\s*150\s*-\s*200\s*字/.test(profileMemoryPromptLines),
  '画像不得再有字数下限'
);
assert.ok(
  profileMemoryPromptLines.includes('summary 是一段连续的话，最多 200 字'),
  '画像字数必须写成上限'
);
assert.ok(
  profileMemorySource.includes('这类模糊限定词整段最多用一次'),
  '模糊限定词必须限量'
);
assert.ok(
  profileMemorySource.includes('不许用没有具体所指的抽象名词充当判断的核心'),
  '判断不得建立在读者无法指认的抽象名词上'
);
assert.ok(
  profileMemorySource.includes('能不能用他自己的话复述出'),
  '必须有可复述性检验——读完说不出它讲了自己什么，就是没写好'
);
assert.ok(
  profileMemorySource.includes('要禁止的是含糊，不是善意'),
  '限制的是含糊而不是温度：被准确说中本身就是情绪价值'
);

const interpretSourceForChat = read('miniprogram/cloudfunctions/interpretDream/index.js');
// 「聊一聊」曾经是整个系统里唯一读不到长期记忆的地方：解梦看得到画像、现实线索
// 和反复出现的意象，对话却每次都从零认识这个人一遍。
assert.ok(
  interpretSourceForChat.includes('async function loadChatBackground'),
  '梦后对话必须能读到这个人的长期背景'
);
assert.ok(
  /runDreamChat\(event, wxContext/.test(interpretSourceForChat),
  '对话必须拿到 openid，否则背景无从加载'
);
assert.ok(
  interpretSourceForChat.includes('每一轮的形状必须不同'),
  '对话不得每轮都长成同一个句式'
);
assert.ok(
  interpretSourceForChat.includes('严禁把背景当成谈资'),
  '长期背景只能在有具体呼应时提起，不能罗列'
);
// 回复是必需品，memory_candidate 只是顺带；空的 JSON 不该把整条回复一起废掉。
assert.ok(
  interpretSourceForChat.includes('extracted = await requestChat(false)'),
  'JSON 模式回空时必须退回纯文本再要一次'
);


// ── 出生盘假设：派生、衰减、判定 ──────────────────────────────────────
//
// 这一段是真的把模块跑起来，不是查字符串。衰减是这套设计里唯一不能靠提示词
// 实现的部分——「随证据增加请降低生辰权重」模型做不到，而上一版画像本身是
// 高权重输入，所以盘面推来的句子会被一版版继承、洗成看起来像从梦里读出来的
// 判断。它必须是结构性的，也就必须被测到。
function loadBaziHypotheses() {
  const commonJsModule = { exports: {} as Record<string, any> };
  const dir = path.join(root, 'miniprogram/cloudfunctions/profileMemory');
  const sandbox = {
    module: commonJsModule,
    exports: commonJsModule.exports,
    require(request: string) {
      if (request === './locationResolver') return nodeRequire(path.join(dir, 'locationResolver.js'));
      if (request === 'lunar-javascript') {
        return {
          Solar: {
            fromYmdHms() {
              return { getLunar() { return { getEightChar() { return {
                setSect() {},
                getYear: () => '戊寅', getMonth: () => '乙丑', getDay: () => '甲子', getTime: () => '戊辰',
                getDayGan: () => '甲',
                getYearHideGan: () => ['甲', '丙', '戊'], getMonthHideGan: () => ['己', '癸', '辛'],
                getDayHideGan: () => ['癸'], getTimeHideGan: () => ['戊', '乙', '癸'],
                getYearShiShenGan: () => '偏财', getMonthShiShenGan: () => '劫财',
                getDayShiShenGan: () => '日主', getTimeShiShenGan: () => '偏财',
                getYearShiShenZhi: () => ['比肩', '食神', '偏财'],
                getMonthShiShenZhi: () => ['正财', '正印', '正官'],
                getDayShiShenZhi: () => ['正印'],
                getTimeShiShenZhi: () => ['偏财', '劫财', '正印'],
              }; } }; } };
            },
          },
        };
      }
      return nodeRequire(request);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(dir, 'baziHypotheses.js'), 'utf8'), sandbox);
  return commonJsModule.exports;
}

// 两个云函数各自打包部署，共享代码只能靠复制。复制没关系，漂了才有关系——
// 出生地解析一旦两边不一致，同一个用户在解读里和在画像里会拿到不同的盘。
assert.equal(
  read('miniprogram/cloudfunctions/profileMemory/locationResolver.js'),
  read('miniprogram/cloudfunctions/interpretDream/locationResolver.js'),
  '两份 locationResolver 必须逐字相同'
);

const bazi = loadBaziHypotheses();
const fullBirthProfile = { birthDate: '1998-01-15', birthTime: '08:30', birthPlace: '青岛' };
const derivedHypotheses = bazi.deriveHypotheses(fullBirthProfile, new Date());
assert.ok(derivedHypotheses.length >= 3 && derivedHypotheses.length <= 4, '每次派生 3-4 条，不多不少');
assert.ok(
  derivedHypotheses.every((item: Record<string, any>) => item.status === 'untested' && item.origin === 'bazi'),
  '派生出来的一律是待验证，不是结论'
);
// 用户读到的必须是一句关于他的白话。术语一旦漏出去，画像就变成了运势。
const hypothesisText = derivedHypotheses.map((item: Record<string, any>) => item.claim).join('');
assert.ok(
  !/八字|四柱|日主|十神|五行|命理|命盘|生肖|属相|星座/.test(hypothesisText),
  '假设正文不得出现任何命理术语'
);
assert.ok(
  !/运势|吉凶|注定|必然|命运|财运|姻缘/.test(hypothesisText),
  '假设不得断吉凶或谈际遇'
);
// 每条都要具体到用户能当场说「不对」。说不出「不对」的句子永远不会被证据推翻，
// 于是会一直赖在画像里。
assert.ok(
  derivedHypotheses.every((item: Record<string, any>) => item.claim.length >= 12),
  '假设不能短到无从反驳'
);
assert.ok(
  new Set(derivedHypotheses.map((item: Record<string, any>) => item.dimension)).size === derivedHypotheses.length,
  '同一个轴不得产出两条'
);
// 资料不全、城市认不出、排盘失败——一律空手而归，绝不猜。
assert.equal(bazi.deriveHypotheses({}, new Date()).length, 0);
assert.equal(bazi.deriveHypotheses({ birthDate: '1998-01-15', birthTime: '08:30' }, new Date()).length, 0);
assert.equal(
  bazi.deriveHypotheses({ birthDate: '1998-01-15', birthTime: '08:30', birthPlace: '火星' }, new Date()).length,
  0
);
// 同一份资料每次派生出同一批 id：假设账本写失败时最坏只是重派一次，不该因此
// 产生一批新 id 把已经判过的那些顶掉。
assert.equal(
  bazi.deriveHypotheses(fullBirthProfile, new Date()).map((item: Record<string, any>) => item.id).join('|'),
  derivedHypotheses.map((item: Record<string, any>) => item.id).join('|')
);

// 生命周期本身在 index.js 里。这里同样跑真的代码，只把 wx-server-sdk 挡掉。
function loadProfileMemory() {
  const commonJsModule = { exports: {} as Record<string, any> };
  const dir = path.join(root, 'miniprogram/cloudfunctions/profileMemory');
  const sandbox = {
    module: commonJsModule,
    exports: commonJsModule.exports,
    process: { env: {} },
    Buffer,
    URL,
    console,
    require(request: string) {
      if (request === 'wx-server-sdk') {
        return { DYNAMIC_CURRENT_ENV: 'mock', init() {}, database: () => ({ command: {} }) };
      }
      if (request === './baziHypotheses') return bazi;
      if (request === './locationResolver') return nodeRequire(path.join(dir, 'locationResolver.js'));
      if (request === 'http' || request === 'https') return nodeRequire(request);
      return nodeRequire(request);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(dir, 'index.js'), 'utf8') +
      '\nmodule.exports.__test = { resolveHypotheses, applyHypothesisVerdicts, livingHypotheses, aiPrompt, HYPOTHESIS_DECAY_DREAM_COUNT };',
    sandbox
  );
  return commonJsModule.exports;
}

const profileMemoryModule = loadProfileMemory();
const lifecycle = profileMemoryModule.__test;
assert.equal(lifecycle.HYPOTHESIS_DECAY_DREAM_COUNT, 10);

const birthUser = { nickname: '闰土', birthDate: '1998-01-15', birthTime: '08:30', birthPlace: '青岛' };
const firstResolve = lifecycle.resolveHypotheses([], birthUser, 0, new Date());
assert.equal(firstResolve.changed, true);
assert.ok(firstResolve.list.length >= 3);
// 已经派生过就不再重复派生，否则每次生成都会把判过的状态冲掉。
assert.equal(lifecycle.resolveHypotheses(firstResolve.list, birthUser, 0, new Date()).changed, false);
// 没有出生资料的用户完全不进这条路径。
assert.equal(lifecycle.resolveHypotheses([], { nickname: '无资料' }, 0, new Date()).list.length, 0);

// 判定是单向的：判过的不会回到 untested，所以假设集合一定收敛。没有这一条，
// 模型这次说「支持」下次说「说不好」，画像会在两版之间反复横跳，而版本号是
// 「真的变了」的唯一凭据。
const targetId = firstResolve.list[0].id;
const afterSupport = lifecycle.applyHypothesisVerdicts(
  firstResolve.list,
  [{ id: targetId, verdict: 'support', evidence: '他自己说过那件事' }],
  new Date()
);
assert.equal(afterSupport.changed, true);
assert.equal(afterSupport.list.find((item: Record<string, any>) => item.id === targetId).status, 'confirmed');
assert.equal(
  lifecycle.applyHypothesisVerdicts(
    afterSupport.list,
    [{ id: targetId, verdict: 'contradict', evidence: '反悔' }],
    new Date()
  ).changed,
  false,
  '已经定论的假设不得被后一次判定改写'
);
// unclear 是默认答案，不改变任何状态。
assert.equal(
  lifecycle.applyHypothesisVerdicts(
    firstResolve.list,
    [{ id: firstResolve.list[1].id, verdict: 'unclear', evidence: '' }],
    new Date()
  ).changed,
  false
);
// 垃圾判定不得改动账本。
assert.equal(lifecycle.applyHypothesisVerdicts(firstResolve.list, [{ id: 'nope', verdict: 'support' }], new Date()).changed, false);
assert.equal(lifecycle.applyHypothesisVerdicts(firstResolve.list, 'not-an-array', new Date()).changed, false);

// 衰减：到第 10 个梦，所有还没被证据碰过的一律作废，不管模型怎么想。被证据
// 接住的那条不受影响——它那时已经不算八字了。
const atDecay = lifecycle.resolveHypotheses(afterSupport.list, birthUser, 10, new Date());
assert.equal(atDecay.changed, true);
assert.equal(
  atDecay.list.filter((item: Record<string, any>) => item.status === 'untested').length,
  0,
  '第 10 个梦之后不得再有未验证的出生盘假设'
);
assert.equal(atDecay.list.find((item: Record<string, any>) => item.id === targetId).status, 'confirmed');
assert.equal(lifecycle.livingHypotheses(atDecay.list).length, 1, '只剩被证据接住的那一条');
// 第 9 个梦时还没到期：这个数字是「我们到底多信八字」的答案，不能悄悄漂移。
assert.ok(
  lifecycle.resolveHypotheses(firstResolve.list, birthUser, 9, new Date()).list
    .some((item: Record<string, any>) => item.status === 'untested')
);

// 冷启动那一版可以自报来历，此后每一版都不许再提——否则盘面就在借画像的壳
// 复活，用户会在 V4 读到「根据你的生辰」，而那时画像本该是从梦里来的。
const coldPrompt = lifecycle.aiPrompt({
  user: birthUser, dreams: [], notes: [], hypotheses: firstResolve.list, priorPortrait: null,
});
assert.ok(coldPrompt.includes('这是第一版画像'), '无证据时走冷启动提示词');
assert.ok(coldPrompt.includes('只是根据他的出生时间推的'), '第一版必须自报来历');
assert.ok(!coldPrompt.includes(birthUser.birthDate), '出生日期本身不得进提示词');

const warmPrompt = lifecycle.aiPrompt({
  user: birthUser,
  dreams: [{ text: '我梦见门口有一片湖', symbols: [], emotion: '', discussion: [], createdAt: new Date() }],
  notes: [],
  hypotheses: firstResolve.list,
  priorPortrait: null,
});
assert.ok(!warmPrompt.includes('这是第一版画像'));
assert.ok(warmPrompt.includes('严禁透露它们的来历'), '有证据之后不得再提盘面');
assert.ok(warmPrompt.includes('hypothesisVerdicts'), '有存活假设时必须索取判定');
assert.ok(!warmPrompt.includes(birthUser.birthDate) && !warmPrompt.includes(birthUser.birthPlace),
  '出生资料不再整份塞进提示词——以前它在里面却没有任何规则说该拿它干什么');
assert.ok(warmPrompt.includes('严禁叙述这份画像自身的沿革'), '画像不得写成修订说明');

// 假设全部出局之后，判定相关的东西也要一起消失，不能留个空壳继续索取。
const noHypothesisPrompt = lifecycle.aiPrompt({
  user: birthUser,
  dreams: [{ text: '我梦见门口有一片湖', symbols: [], emotion: '', discussion: [], createdAt: new Date() }],
  notes: [],
  hypotheses: atDecay.list.map((item: Record<string, any>) => ({ ...item, status: 'expired' })),
  priorPortrait: null,
});
assert.ok(!noHypothesisPrompt.includes('hypothesisVerdicts'));
assert.ok(!noHypothesisPrompt.includes('待验证假设'));

console.log(`AI readiness checks passed across ${runtimeFiles.length} Mini Program runtime files.`);
