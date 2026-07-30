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
  openid: 'owner',
  dream: null,
  deletion: false,
  transactionDeletion: false,
  providerCalls: 0,
  uploaded: 0,
  deletedFiles: [],
  requestBodies: [],
  generatedAssets: [],
  jobs: {},
  streamResponse: false,
  providerImageUrl: '',
  cancelPrimaryDuringUpload: false
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
  if (collection === 'generated_assets') return state.generatedAssets;
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
          if (name === 'image_generation_jobs') return { data: state.jobs[id] || null };
          return { data: null };
        },
        add: async function () { return { _id: 'asset-1' }; },
        set: async function (input) {
          if (input.data && Object.prototype.hasOwnProperty.call(input.data, '_id')) {
            throw new Error('document.set cannot update _id');
          }
          if (name === 'image_generation_jobs') state.jobs[id] = Object.assign({ _id: id }, input.data);
          return { _id: id };
        },
        update: async function (input) {
          if (name === 'image_generation_jobs' && state.jobs[id]) state.jobs[id] = Object.assign({}, state.jobs[id], input.data);
          return {};
        }
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
  getWXContext: function () { return { OPENID: state.openid }; },
  database: function () {
    return {
      collection: function (name) { return collection(name, false); },
      serverDate: function () { return { $date: true }; },
      runTransaction: async function (work) {
        return work({ collection: function (name) { return collection(name, true); } });
      }
    };
  },
  uploadFile: async function () {
    state.uploaded += 1;
    if (state.cancelPrimaryDuringUpload) {
      Object.keys(state.jobs).forEach(function (jobId) {
        if (state.jobs[jobId] && state.jobs[jobId].status === 'finalizing') {
          state.jobs[jobId] = Object.assign({}, state.jobs[jobId], {
            status: 'cancelled',
            cancel_requested: true
          });
        }
      });
    }
    return { fileID: 'cloud://image-1' };
  },
  deleteFile: async function (input) { state.deletedFiles.push(input.fileList[0]); },
  getTempFileURL: async function (input) {
    return {
      fileList: input.fileList.map(function (fileID) {
        if (fileID === 'cloud://stale') return { fileID: fileID, status: -1, tempFileURL: 'https://temp/stale' };
        if (fileID === 'cloud://valid') return { fileID: fileID, status: 0, tempFileURL: 'https://temp/valid' };
        if (fileID === 'cloud://statusless') return { fileID: fileID, tempFileURL: 'https://temp/statusless' };
        return { fileID: fileID, status: 0, tempFileURL: 'https://temp/image' };
      })
    };
  }
};

function fakeRequest(options, callback) {
  const request = new EventEmitter();
  let written = '';
  request.write = function (value) { written += String(value || ''); };
  request.destroy = function (error) {
    if (request.streamTimer) clearInterval(request.streamTimer);
    request.emit('error', error);
  };
  request.end = function () {
    state.providerCalls += 1;
    if (written) state.requestBodies.push(JSON.parse(written));
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    callback(response);
    if (state.streamResponse) {
      request.streamTimer = setInterval(function () {
        response.emit('data', Buffer.from(' '));
      }, 5);
      return;
    }
    process.nextTick(function () {
      if (options.method === 'GET' && state.providerImageUrl) {
        response.emit('data', png);
      } else if (state.providerImageUrl) {
        response.emit('data', Buffer.from(JSON.stringify({ data: [{ url: state.providerImageUrl }] })));
      } else {
        response.emit('data', Buffer.from(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })));
      }
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
  const seedreamPrompt = visualPlanner.buildSeedreamGenerationPrompt(visualPlan);
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
  const sadnessPlan = visualPlanner.normalizeVisualPlan({
    main_event: '我在屋顶收起一封没有寄出的信',
    emotion: ['悲伤'],
    setting: '下雨的屋顶',
    objects: [{ name: '没有寄出的信', importance: 1, visualizable: true }],
    composition: { template: 'vertical_drift' }
  }, {
    dreamText: '我在下雨的屋顶收起一封没有寄出的信。',
    dreamFacts: { emotions: ['悲伤'], places: ['屋顶'], objects: ['信'] },
    symbols: ['信']
  });
  const sadnessSeedreamPrompt = visualPlanner.buildSeedreamGenerationPrompt(sadnessPlan);
  const sadnessGenericPrompt = visualPlanner.buildGenerationPrompt(sadnessPlan);
  const sadnessInternalPrompt = visualPlanner.buildInternalTestGenerationPrompt(sadnessPlan);
  const plainSeedreamPrompt = visualPlanner.buildSeedreamGenerationPrompt(mysteryPlan);
  const customCompositionPlan = visualPlanner.normalizeVisualPlan({
    main_event: '我站在空房间中央看着天花板缓慢下降',
    emotion: ['焦虑'],
    setting: '空房间',
    anomalies: ['天花板缓慢下降'],
    preserve_elements: ['我', '天花板'],
    composition: {
      template: 'low_horizon',
      subject_position: '主体严格位于画面中央下方',
      visual_flow: '视线从主体垂直上升到下降的天花板',
      spatial_layers: '使用单一平面压缩空间，不建立前中后景',
      negative_space: '顶部保留38%低密度压迫空间'
    }
  }, {
    dreamText: '我站在空房间中央，看着天花板缓慢下降。',
    dreamFacts: {
      people: ['我'],
      places: ['空房间'],
      objects: ['天花板'],
      actions: ['天花板缓慢下降'],
      emotions: ['焦虑']
    },
    symbols: ['天花板']
  });
  const customCompositionPrompt = visualPlanner.buildSeedreamGenerationPrompt(customCompositionPlan);
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
    assert.ok(palette.focal, key + ' palette must define a separate focal color');
    assert.notEqual(palette.accent, palette.focal, key + ' contrast and focal colors must differ');
  });
  assert.equal(visualPlan.composition.id, 'off_center_diagonal');
  assert.match(compiledPrompt, /rough screenprint and risograph texture/);
  assert.ok(seedreamPrompt.length < 2400, 'Seedream prompt should stay concise enough for synchronous generation');
  assert.match(seedreamPrompt, /核心事件/);
  assert.match(seedreamPrompt, /唯一超现实规则/);
  assert.match(seedreamPrompt, /不使用参考图/);
  assert.match(seedreamPrompt, /ONEIRO Seedream v2\.2/);
  assert.match(seedreamPrompt, /低明度主导色场/);
  assert.match(seedreamPrompt, /明确冷暖或互补对撞色/);
  assert.match(seedreamPrompt, /高饱和焦点/);
  assert.match(seedreamPrompt, /不超过3%/);
  assert.match(seedreamPrompt, /近黑线稿/);
  assert.match(seedreamPrompt, /暖纸支撑色/);
  assert.match(seedreamPrompt, /45–60%/);
  assert.match(seedreamPrompt, /35–50%主动留白/);
  assert.match(seedreamPrompt, /若梦境明确给出场所.*普通空间容器/);
  assert.match(seedreamPrompt, /若未说明地点.*不新增房间、家具、景观或人物/);
  assert.match(seedreamPrompt, /将异常关系平静地放进场景/);
  assert.match(seedreamPrompt, /构图方案“off_center_diagonal”/);
  assert.match(seedreamPrompt, /不照搬任何既有场景/);
  assert.match(seedreamPrompt, /一条斜向路径/);
  assert.match(seedreamPrompt, /边缘局部裁切/);
  assert.match(seedreamPrompt, /手工压力墨线、哑光平涂、轻微印刷颗粒和干刷断点，非写实高对比/);
  assert.match(seedreamPrompt, /不得替换成相近物种或物品/);
  assert.match(seedreamPrompt, /不使用排线、素描阴影、密集短线或逐根毛发/);
  assert.match(seedreamPrompt, /大剪影与少量必要结构线/);
  assert.match(seedreamPrompt, /匿名背影、侧背、小尺度或裁切剪影/);
  assert.match(seedreamPrompt, /只画梦境事实中明确出现/);
  assert.match(seedreamPrompt, /无边框、标题、文字、数字或水印/);
  assert.doesNotMatch(seedreamPrompt, /美术馆|河流|椅子|钴蓝\/群青、朱红、暖赭黄、深绿|朱红只作/);
  assert.match(seedreamPrompt, /废弃车站|海中铁轨|铁轨通向海里|提着灯/);
  assert.doesNotMatch(seedreamPrompt, /屋顶|没有寄出的信|下雨/);
  assert.ok(seedreamPrompt.includes(visualPlan.palette.dominant));
  assert.ok(seedreamPrompt.includes(visualPlan.palette.accent));
  assert.ok(seedreamPrompt.includes(visualPlan.palette.focal));
  assert.ok(seedreamPrompt.includes(visualPlan.palette.outline));
  assert.ok(seedreamPrompt.includes(visualPlan.palette.paper));
  assert.match(sadnessSeedreamPrompt, /构图方案“vertical_drift”/);
  assert.match(sadnessSeedreamPrompt, /不照搬任何既有场景/);
  assert.ok(sadnessSeedreamPrompt.includes(sadnessPlan.palette.dominant));
  assert.ok(sadnessSeedreamPrompt.includes(sadnessPlan.palette.accent));
  assert.ok(sadnessSeedreamPrompt.includes(sadnessPlan.palette.focal));
  assert.match(sadnessSeedreamPrompt, /屋顶|没有寄出的信|下雨/);
  assert.doesNotMatch(sadnessSeedreamPrompt, /废弃车站|海中铁轨|铁轨通向海里|美术馆|河流|椅子/);
  assert.notEqual(visualPlan.palette.dominant, sadnessPlan.palette.dominant);
  assert.notEqual(visualPlan.composition.id, sadnessPlan.composition.id);
  assert.notEqual(seedreamPrompt, sadnessSeedreamPrompt);
  assert.match(plainSeedreamPrompt, /本梦没有明确的超现实规则/);
  assert.match(plainSeedreamPrompt, /不要自行制造异常/);
  assert.doesNotMatch(plainSeedreamPrompt, /将异常关系平静地放进场景/);
  assert.match(customCompositionPrompt, /优先服从本梦的场景定制构图/);
  assert.match(customCompositionPrompt, /主体严格位于画面中央下方/);
  assert.match(customCompositionPrompt, /使用单一平面压缩空间，不建立前中后景/);
  assert.match(customCompositionPrompt, /不要用通用模板覆盖这些关系/);
  assert.match(sadnessGenericPrompt, /muted coral #B96750/);
  assert.match(sadnessInternalPrompt, /muted coral #B96750/);
  assert.equal(visualPlanner.styleVersionForPreset('production'), 'oneiro-seedream-dream-v2.2');
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

  result = await imageFunction.main({ healthCheck: true });
  assert.equal(result.primarySubmitTimeoutMs, 54000);
  assert.equal(result.legacySeedreamSubmitTimeoutMs, 42000);
  assert.equal(result.legacyFinalizeMinBudgetMs, 20000);

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
  state.providerImageUrl = 'https://provider.example.com/legacy-seedream.png';
  state.transactionDeletion = true;
  result = await imageFunction.main({ prompt: 'moon', dreamId: 'dream-1' });
  assert.equal(result.reason, 'dream_not_found');
  assert.equal(state.uploaded, 1);
  assert.deepEqual(state.deletedFiles, ['cloud://image-1']);
  assert.equal(state.providerCalls, 2);

  state.transactionDeletion = false;
  result = await imageFunction.main({
    prompt: 'legacy summary',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    forceRefresh: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.ok(result.fileID, 'legacy Seedream calls should transparently finalize when budget allows');
  assert.equal(result.styleVersion, 'oneiro-seedream-dream-v2.2');
  assert.equal(result.visualPlan.palette.id, 'anxiety');
  assert.equal(result.qualityCheck.checks.output_aspect_ratio_3_4, true);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].model, 'doubao-seedream-5-0-lite-260128');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].size, '1728x2304');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].sequential_image_generation, 'disabled');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].response_format, 'url');
  assert.equal(state.requestBodies[state.requestBodies.length - 1].watermark, false);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].quality, undefined);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].n, undefined);
  assert.ok(
    state.requestBodies[state.requestBodies.length - 1].prompt.length < 1800,
    'legacy Seedream clients must use the compact production prompt'
  );
  assert.match(state.requestBodies[state.requestBodies.length - 1].prompt, /核心事件/);
  assert.match(state.requestBodies[state.requestBodies.length - 1].prompt, /ONEIRO Seedream v2\.2/);
  assert.doesNotMatch(state.requestBodies[state.requestBodies.length - 1].prompt, /fixed red-and-blue pairing|tarot-inspired/);

  result = await imageFunction.main({
    prompt: 'legacy summary',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    stylePreset: 'internal-test'
  });
  assert.equal(result.ok, true);
  assert.equal(result.stylePreset, 'internal_test');
  assert.equal(result.styleVersion, 'oneiro-internal-test-style-v1.4');
  assert.match(state.requestBodies[state.requestBodies.length - 1].prompt, /极简手绘内测画风/);
  assert.doesNotMatch(state.requestBodies[state.requestBodies.length - 1].prompt, /ONEIRO INTERNAL TEST VISUAL STYLE|rough screenprint and risograph texture/);

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

  state.generatedAssets = [
    { file_id: 'cloud://stale', image_format: 'png' },
    { file_id: 'cloud://valid', image_format: 'png' }
  ];
  const callsBeforeCache = state.providerCalls;
  result = await imageFunction.main({ prompt: 'legacy summary', dreamId: 'dream-1', visualPlan: visualPlan });
  assert.equal(result.cacheHit, true);
  assert.equal(result.fileID, 'cloud://valid');
  assert.equal(state.providerCalls, callsBeforeCache, 'stale cache entry must not block a valid candidate');

  state.generatedAssets = [
    { file_id: 'cloud://statusless', image_format: 'png' }
  ];
  result = await imageFunction.main({ prompt: 'legacy summary', dreamId: 'dream-1', visualPlan: visualPlan });
  assert.equal(result.cacheHit, true);
  assert.equal(result.fileID, 'cloud://statusless');
  assert.equal(result.imageUrl, 'https://temp/statusless');

  result = await imageFunction.main({ prompt: 'legacy summary', dreamId: 'dream-1', visualPlan: visualPlan, forceRefresh: true });
  assert.equal(result.cacheHit, false);
  assert.ok(state.providerCalls > callsBeforeCache, 'forceRefresh must bypass the fast cache');

  state.generatedAssets = [];
  process.env.OPENAI_IMAGE_TIMEOUT_MS = '1';
  state.streamResponse = true;
  const timeoutStartedAt = Date.now();
  result = await imageFunction.main({ prompt: 'timeout', dreamId: 'dream-1', visualPlan: visualPlan, forceRefresh: true });
  state.streamResponse = false;
  delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
  assert.equal(result.reason, 'provider_timeout');
  assert.equal(result.stage, 'submit');
  assert.ok(Date.now() - timeoutStartedAt < 1500, 'absolute timeout must stop an active response stream');

  process.env.LEGACY_IMAGE_FINALIZE_MIN_BUDGET_MS = '60000';
  state.providerImageUrl = 'https://provider.example.com/legacy-preview.png';
  result = await imageFunction.main({
    prompt: 'legacy preview',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    forceRefresh: true
  });
  delete process.env.LEGACY_IMAGE_FINALIZE_MIN_BUDGET_MS;
  assert.equal(result.ok, true);
  assert.equal(result.status, 'provider_ready');
  assert.equal(result.transientPreview, true);
  assert.equal(result.fileID, '');
  assert.equal(result.imageUrl, state.providerImageUrl);
  const previewFinalized = await imageFunction.main({
    action: 'finalizePrimaryImage',
    jobId: result.jobId,
    dreamId: 'dream-1'
  });
  assert.equal(previewFinalized.ok, true);
  assert.equal(previewFinalized.status, 'succeeded');
  assert.ok(previewFinalized.fileID, 'a transient legacy preview must remain finalizable');

  delete process.env.OPENAI_IMAGE_ENDPOINT_URL;
  delete process.env.OPENAI_IMAGE_MODEL;
  state.providerImageUrl = 'https://provider.example.com/seedream.png';
  state.jobs = {};
  const submitBeforePrimary = state.providerCalls;
  const uploadsBeforePrimary = state.uploaded;
  const primaryStart = await imageFunction.main({ action: 'startPrimaryImage', prompt: 'primary', dreamId: 'dream-1', visualPlan: visualPlan });
  assert.equal(primaryStart.ok, true);
  assert.equal(primaryStart.status, 'provider_ready');
  assert.ok(primaryStart.jobId);
  assert.equal(state.providerCalls, submitBeforePrimary + 1, 'primary stage one submits once');
  assert.equal(state.uploaded, uploadsBeforePrimary, 'primary stage one must not upload');
  assert.equal(state.jobs[primaryStart.jobId].kind, 'seedream_primary');
  assert.equal(state.jobs[primaryStart.jobId].provider_image_url, state.providerImageUrl);
  assert.equal(primaryStart.provider_image_url, undefined, 'provider URL must stay server-side');

  const duplicateStart = await imageFunction.main({ action: 'startPrimaryImage', prompt: 'primary', dreamId: 'dream-1', visualPlan: visualPlan });
  assert.equal(duplicateStart.jobId, primaryStart.jobId);
  assert.equal(state.providerCalls, submitBeforePrimary + 1, 'duplicate start must not submit again');

  const ownerBeforeFinalize = state.openid;
  state.openid = 'other-owner';
  const foreignFinalize = await imageFunction.main({ action: 'finalizePrimaryImage', jobId: primaryStart.jobId, dreamId: 'dream-1' });
  assert.equal(foreignFinalize.reason, 'primary_job_not_found');
  state.openid = ownerBeforeFinalize;

  const primaryFinal = await imageFunction.main({ action: 'finalizePrimaryImage', jobId: primaryStart.jobId, dreamId: 'dream-1' });
  assert.equal(primaryFinal.ok, true);
  assert.equal(primaryFinal.status, 'succeeded');
  assert.ok(primaryFinal.fileID);
  assert.ok(state.uploaded > uploadsBeforePrimary, 'primary finalization uploads exactly after provider readiness');

  const callsBeforeFreshPrimary = state.providerCalls;
  const freshPrimary = await imageFunction.main({
    action: 'startPrimaryImage',
    prompt: 'primary',
    dreamId: 'dream-1',
    visualPlan: visualPlan,
    forceRefresh: true,
    requestId: 'fresh-primary-1'
  });
  assert.equal(freshPrimary.status, 'provider_ready');
  assert.notEqual(freshPrimary.jobId, primaryStart.jobId, 'forceRefresh after success must create a fresh paid job');
  assert.equal(state.providerCalls, callsBeforeFreshPrimary + 1);

  state.dream = Object.assign({}, state.dream, { localId: 'dream-cancel', _id: 'record-cancel' });
  const cancelStart = await imageFunction.main({
    action: 'startPrimaryImage',
    prompt: 'cancel-race',
    dreamId: 'dream-cancel',
    visualPlan: visualPlan
  });
  state.cancelPrimaryDuringUpload = true;
  const cancelledFinalize = await imageFunction.main({
    action: 'finalizePrimaryImage',
    jobId: cancelStart.jobId,
    dreamId: 'dream-cancel'
  });
  state.cancelPrimaryDuringUpload = false;
  assert.equal(cancelledFinalize.status, 'cancelled');
  assert.equal(state.jobs[cancelStart.jobId].status, 'cancelled', 'finalizer must not overwrite deletion cancellation');
  assert.ok(state.deletedFiles.includes('cloud://image-1'), 'lost finalization lease must delete its uploaded file');

  state.dream = Object.assign({}, state.dream, { localId: 'dream-2', _id: 'record-2' });
  const failedStart = await imageFunction.main({ action: 'startPrimaryImage', prompt: 'retry', dreamId: 'dream-2', visualPlan: visualPlan });
  state.jobs[failedStart.jobId] = Object.assign({}, state.jobs[failedStart.jobId], { status: 'failed', reason: 'provider_timeout' });
  const callsBeforeForceRefresh = state.providerCalls;
  const forcedStart = await imageFunction.main({ action: 'startPrimaryImage', prompt: 'retry', dreamId: 'dream-2', visualPlan: visualPlan, forceRefresh: true });
  assert.equal(forcedStart.status, 'provider_ready');
  assert.equal(state.providerCalls, callsBeforeForceRefresh + 1, 'forceRefresh retries a failed deterministic job');
  state.jobs[forcedStart.jobId] = Object.assign({}, state.jobs[forcedStart.jobId], {
    status: 'submitting',
    submit_lease_until_ms: 0
  });
  const callsBeforeExpiredLease = state.providerCalls;
  const expiredSubmit = await imageFunction.main({
    action: 'startPrimaryImage',
    prompt: 'retry',
    dreamId: 'dream-2',
    visualPlan: visualPlan
  });
  assert.equal(expiredSubmit.status, 'failed');
  assert.equal(expiredSubmit.reason, 'submit_lease_expired');
  assert.equal(state.providerCalls, callsBeforeExpiredLease, 'expired submit lease must fail closed without another paid request');
  state.dream = Object.assign({}, state.dream, { localId: 'dream-1', _id: 'record-1' });
  state.providerImageUrl = '';

  console.log('generateDreamImage visual-plan, authorization and deletion-race regressions passed');
}

run().finally(function () {
  Module._load = originalLoad;
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
