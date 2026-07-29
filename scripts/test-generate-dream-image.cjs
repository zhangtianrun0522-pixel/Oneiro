const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');
const Module = require('module');
const path = require('path');

const modulePath = path.resolve(__dirname, '../miniprogram/cloudfunctions/generateDreamImage/index.js');
const visualPlanner = require('../miniprogram/cloudfunctions/generateDreamImage/visualPlan.js');
const originalLoad = Module._load;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(1100)
]);
png.writeUInt32BE(768, 16);
png.writeUInt32BE(1024, 20);
const state = {
  dream: null,
  deletion: false,
  transactionDeletion: false,
  providerCalls: 0,
  uploaded: 0,
  deletedFiles: [],
  requestBodies: []
};

function queryResult(collection, query) {
  if (collection === 'dream_entries') {
    return state.dream && state.dream.openid === query.openid && query.localId === state.dream.localId
      ? [state.dream] : [];
  }
  if (collection === 'deletion_jobs') {
    return state.deletion && query.openid === 'owner' && query.sourceDreamId === 'dream-1'
      ? [{ _id: 'legacy-tombstone' }] : [];
  }
  return [];
}

function collection(name, transaction) {
  return {
    where: function (query) {
      return {
        limit: function () { return this; },
        get: async function () { return { data: queryResult(name, query) }; }
      };
    },
    doc: function (id) {
      return {
        get: async function () {
          if (name === 'deletion_jobs') return { data: state.transactionDeletion ? { _id: id } : null };
          if (name === 'dream_entries') return { data: state.dream && id === state.dream._id ? state.dream : null };
          return { data: null };
        },
        add: async function () { return { _id: 'asset-1' }; }
      };
    },
    add: async function () {
      if (!transaction) throw new Error('asset writes must be transactional');
      return { _id: 'asset-1' };
    }
  };
}

const cloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init: function () {},
  getWXContext: function () { return { OPENID: 'owner' }; },
  database: function () {
    return {
      collection: function (name) { return collection(name, false); },
      serverDate: function () { return { $date: true }; },
      runTransaction: async function (work) {
        return work({ collection: function (name) { return collection(name, true); } });
      }
    };
  },
  uploadFile: async function () { state.uploaded += 1; return { fileID: 'cloud://image-1' }; },
  deleteFile: async function (input) { state.deletedFiles.push(input.fileList[0]); },
  getTempFileURL: async function () { return { fileList: [{ tempFileURL: 'https://temp/image' }] }; }
};

function fakeRequest(options, callback) {
  const request = new EventEmitter();
  let written = '';
  request.write = function (value) { written += String(value || ''); };
  request.destroy = function (error) { request.emit('error', error); };
  request.end = function () {
    state.providerCalls += 1;
    if (written) state.requestBodies.push(JSON.parse(written));
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    callback(response);
    process.nextTick(function () {
      response.emit('data', Buffer.from(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })));
      response.emit('end');
    });
  };
  return request;
}

Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloud;
  if (request === 'https') return { request: fakeRequest };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.OPENAI_IMAGE_API_KEY = 'test-key';
delete require.cache[modulePath];
const imageFunction = require(modulePath);

async function run() {
  let result;
  const visualPlan = visualPlanner.normalizeVisualPlan({
    main_event: '我在废弃车站等待另一个自己',
    emotion: ['焦虑', '期待'],
    emotion_intensity: 0.8,
    setting: '废弃车站',
    objects: [
      { name: '通向海里的铁轨', importance: 1, visualizable: true },
      { name: '童年房间的窗户', importance: 0.9, visualizable: true },
      { name: '灯', importance: 0.8, visualizable: true },
      { name: '车票', importance: 0.2, visualizable: true },
      { name: '路牌', importance: 0.1, visualizable: true }
    ],
    anomalies: ['铁轨通向海里', '天空倒置'],
    preserve_elements: ['等待的人', '海中铁轨', '另一个自己', '灯', '不应保留的第五项'],
    hidden_symbol: '童年窗户',
    composition: { template: 'off_center_diagonal' }
  }, {
    dreamText: '我在废弃车站等车，铁轨通向海里，另一个我提着灯走来。',
    dreamFacts: { emotions: ['焦虑', '期待'] },
    symbols: ['车站', '海', '灯']
  });
  const compiledPrompt = visualPlanner.buildGenerationPrompt(visualPlan);
  const internalTestPrompt = visualPlanner.buildGenerationPrompt(visualPlan, 'internal-test');
  const healingPlan = visualPlanner.normalizeVisualPlan({ emotion: ['平静', '安心'] }, {
    dreamText: '我回到温暖的家，坐在窗边慢慢呼吸。',
    dreamFacts: { places: ['家'], emotions: ['平静'] },
    symbols: ['家', '窗']
  });
  const mysteryPlan = visualPlanner.normalizeVisualPlan({}, {
    dreamText: '一个没有名字的陌生空间。',
    dreamFacts: {},
    symbols: []
  });
  const hallucinatedPlan = visualPlanner.normalizeVisualPlan({
    main_event: '我在空房间里走路，月亮照着神秘眼睛和蛇',
    setting: '月亮下的神殿',
    characters: [{ role: '主体', description: '戴王冠的陌生祭司', importance: 1 }],
    objects: [{ name: '月亮', importance: 1, visualizable: true }, { name: '蛇', importance: 0.9, visualizable: true }],
    symbols: ['月亮', '神秘眼睛', '蛇'],
    preserve_elements: ['月亮', '神秘眼睛', '蛇'],
    hidden_symbol: '钥匙'
  }, {
    dreamText: '白天，我独自在一间空房间里缓慢走路。',
    dreamFacts: { people: ['祭司'], objects: ['月亮', '蛇'], places: ['神殿'] },
    symbols: ['钥匙']
  });
  const rainGroundingPlan = visualPlanner.normalizeVisualPlan({
    main_event: '沙漠里开始下暴雨，地上积起清水',
    setting: '沙漠里的积水荒原',
    objects: [{ name: '清水', importance: 1, visualizable: true }, { name: '鱼', importance: 0.8, visualizable: true }],
    anomalies: ['沙漠里开始下暴雨，地上积起清水'],
    symbols: ['清水', '鱼'],
    preserve_elements: ['清水', '鱼', '沙漠']
  }, {
    dreamText: '我梦见沙漠里开始下暴雨',
    dreamFacts: { places: ['沙漠'], objects: ['暴雨'] },
    symbols: ['沙漠', '暴雨']
  });

  assert.equal(visualPlan.preserve_elements.length, 4);
  assert.equal(visualPlan.anomalies.length, 1);
  assert.equal(visualPlan.palette.id, 'anxiety');
  assert.equal(healingPlan.palette.id, 'healing');
  assert.equal(mysteryPlan.palette.id, 'mystery');
  assert.deepEqual(hallucinatedPlan.preserve_elements, ['白天，我独自在一间空房间里缓慢走路。']);
  assert.deepEqual(hallucinatedPlan.objects, []);
  assert.deepEqual(hallucinatedPlan.characters, []);
  assert.deepEqual(hallucinatedPlan.symbols, []);
  assert.equal(hallucinatedPlan.hidden_symbol, '');
  assert.equal(hallucinatedPlan.main_event, '白天，我独自在一间空房间里缓慢走路。');
  const rainGroundingText = JSON.stringify(rainGroundingPlan);
  assert.match(rainGroundingText, /沙漠|暴雨/);
  assert.doesNotMatch(rainGroundingText, /清水|鱼|积水荒原/);
  assert.equal(rainGroundingPlan.anomalies.length, 0);
  assert.notEqual(visualPlan.palette.dominant, healingPlan.palette.dominant);
  Object.keys(visualPlanner.EMOTION_PALETTES).forEach(function (key) {
    const palette = Object.assign({ id: key }, visualPlanner.EMOTION_PALETTES[key]);
    const count = visualPlanner.paletteList(palette).length;
    assert.ok(count >= 4 && count <= 6, key + ' palette must contain 4-6 inks');
  });
  assert.equal(visualPlan.composition.id, 'off_center_diagonal');
  assert.match(compiledPrompt, /rough screenprint and risograph texture/);
  assert.equal(
    crypto.createHash('sha256').update(compiledPrompt).digest('hex'),
    'a654063f41d75140ef2025eeba4bd6571af5f12f6ee16b42eea3a929e70ecdbf',
    'production prompt golden changed unexpectedly'
  );
  assert.match(compiledPrompt, /exactly 4–6 inks/);
  assert.doesNotMatch(compiledPrompt, /tarot-inspired|muted watercolor|centered symbolic/);
  assert.equal(visualPlanner.normalizeStylePreset('internal-test'), 'internal_test');
  assert.equal(visualPlanner.styleVersionForPreset('internal-test'), 'oneiro-internal-test-style-v1.4');
  assert.match(internalTestPrompt, /ONEIRO INTERNAL TEST VISUAL STYLE/);
  assert.match(internalTestPrompt, /Priority order/);
  assert.match(internalTestPrompt, /one causal tableau with only 2–3 narrative anchors/);
  assert.match(internalTestPrompt, /reality-breaking rule must visibly change/);
  assert.match(internalTestPrompt, /zero visible white/);
  assert.match(internalTestPrompt, /anonymous cutout figure/);
  assert.match(internalTestPrompt, /Every major silhouette has 2–4 deliberate handmade irregularities/);
  assert.match(internalTestPrompt, /artwork extends beyond every canvas edge/);
  assert.match(internalTestPrompt, /One saturated field occupies about 50–70%/);
  assert.match(internalTestPrompt, /never as a camera template/);
  assert.match(internalTestPrompt, /bowed edge/);
  assert.match(internalTestPrompt, /pressure visibly changes/);
  assert.match(internalTestPrompt, /Do not invent a second figure, pointing hand/);
  assert.match(internalTestPrompt, /no readable text/);
  assert.doesNotMatch(internalTestPrompt, /close foreground gesture points toward one isolated symbol/);
  assert.match(internalTestPrompt, /Hard exclusions/);
  assert.doesNotMatch(internalTestPrompt, /unreachable, departing, pursuing/);
  assert.doesNotMatch(internalTestPrompt, /Favor direct cobalt or ultramarine/);
  assert.doesNotMatch(internalTestPrompt, /dry-brush breaks|heavy distressed texture/);

  result = await imageFunction.main({ prompt: 'moon', dreamId: '' });
  assert.equal(result.reason, 'missing_dream_id');

  state.dream = null;
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');

  state.dream = { _id: 'foreign-record', openid: 'someone-else', localId: 'dream-1' };
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');

  state.dream = {
    _id: 'record-1',
    openid: 'owner',
    localId: 'dream-1',
    dreamText: '我在废弃车站等车，铁轨通向海里，另一个我提着灯走来。',
    dreamFacts: { emotions: ['焦虑', '期待'], places: ['废弃车站'], objects: ['铁轨', '灯'] },
    result: { symbols: ['车站', '海', '灯'], visual_plan: visualPlan }
  };
  state.dream.deletionPending = true;
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');

  state.dream.deletionPending = false;
  state.deletion = true;
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');

  state.deletion = false;
  state.transactionDeletion = true;
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');
  assert.equal(state.uploaded, 1);
  assert.deepEqual(state.deletedFiles, ['cloud://image-1']);
  assert.equal(state.providerCalls, 1);

  state.transactionDeletion = false;
  result = await imageFunction.main({ prompt: 'legacy summary', dreamId: 'dream-1', visualPlan: visualPlan });
  assert.equal(result.ok, true);
  assert.equal(result.styleVersion, 'oneiro-seedream-dream-v2.0');
  assert.equal(result.visualPlan.palette.id, 'anxiety');
  assert.equal(result.qualityCheck.checks.output_aspect_ratio_3_4, true);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].model, 'doubao-seedream-5-0-lite-260128');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].size, '1728x2304');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].sequential_image_generation, 'disabled');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].response_format, 'url');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].watermark, false);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].quality, undefined);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].n, undefined);
  assert.match(state.requestBodies[state.requestBodies.length - 1].prompt, /fixed red-and-blue pairing/);
  assert.doesNotMatch(state.requestBodies[state.requestBodies.length - 1].prompt, /tarot-inspired/);

  result = await imageFunction.main({
    prompt: 'legacy summary',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    stylePreset: 'internal-test'
  });
  assert.equal(result.ok, true);
  assert.equal(result.stylePreset, 'internal_test');
  assert.equal(result.styleVersion, 'oneiro-internal-test-style-v1.4');
  assert.match(state.requestBodies[state.requestBodies.length - 1].prompt, /ONEIRO INTERNAL TEST VISUAL STYLE/);
  assert.doesNotMatch(state.requestBodies[state.requestBodies.length - 1].prompt, /rough screenprint and risograph texture/);

  const deletedBeforeReference = state.deletedFiles.length;
  process.env.OPENAI_IMAGE_ENDPOINT_URL = 'https://grsaiapi.com/v1/api/generate';
  process.env.OPENAI_IMAGE_MODEL = 'nano-banana-fast';
  result = await imageFunction.main({
    prompt: 'legacy summary',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    stylePreset: 'internal-test',
    referenceTest: true,
    referenceImageData: ['data:image/png;base64,' + png.toString('base64')]
  });
  delete process.env.OPENAI_IMAGE_ENDPOINT_URL;
  delete process.env.OPENAI_IMAGE_MODEL;
  assert.equal(result.ok, true);
  assert.equal(result.referenceImageCount, 1);
  assert.deepEqual(state.requestBodies[state.requestBodies.length - 1].urls, ['https://temp/image']);
  assert.ok(state.deletedFiles.length > deletedBeforeReference, 'temporary reference image should be deleted: ' + JSON.stringify(state.deletedFiles));

  console.log('generateDreamImage visual-plan, authorization and deletion-race regressions passed');
}

run().finally(function () {
  Module._load = originalLoad;
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
