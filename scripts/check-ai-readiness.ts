import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

type InterpretDreamModule = {
  main: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
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

function loadInterpretDream(env: Record<string, string>): InterpretDreamModule {
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

  vm.runInNewContext(read(interpretDreamPath), sandbox, { filename: interpretDreamPath });
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
  'INTERPRET_TIMEOUT_MS=18000',
  'healthCheck',
  'providerConfigured',
  'timeout: 3',
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
  'npm run check:ai-readiness && npm run check:cloudbase && npm run check:miniprogram && npm run check:dream && npm run typecheck',
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
assert.equal(staticHealth.requestTimeoutMs, 18000);
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
assert.equal(deepseekHealth.requestTimeoutMs, 21000);

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
  profile: { nickname: 'Runtu', birthDate: '1998-01-01', birthTime: '08:30', birthPlace: '青岛' },
  cardIndex: 3,
});
assert.equal(staticInterpretation.ok, true);
assert.equal(staticInterpretation.provider, 'cloudbase-static');
assert.equal((staticInterpretation.result as Record<string, unknown>).card_no, 'NO. 003');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.available, true);
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.precision, 'true_solar_time');
assert.equal((staticInterpretation.result as Record<string, any>).bazi_chart.location.name, '青岛');
assert.match(String((staticInterpretation.result as Record<string, unknown>).metaphysical_resonance || ''), /内在气质底色/);
assert.doesNotMatch(
  String((staticInterpretation.result as Record<string, unknown>).metaphysical_resonance || ''),
  /四柱|八字|日主|五行|排盘|命盘|命理|命格|运势|吉凶/
);

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

console.log(`AI readiness checks passed across ${runtimeFiles.length} Mini Program runtime files.`);
