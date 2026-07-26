'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const Module = require('module');
const path = require('path');

const modulePath = path.resolve(__dirname, '../miniprogram/cloudfunctions/generateDreamImage/index.js');
const visualPlanner = require('../miniprogram/cloudfunctions/generateDreamImage/visualPlan.js');
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(1100)
]);
png.writeUInt32BE(768, 16);
png.writeUInt32BE(1024, 20);

const state = {
  dream: {
    _id: 'record-quality-1',
    openid: 'owner',
    localId: 'dream-quality-1',
    dreamText: '我在黄色长廊里奔跑，远处有一扇红门。',
    result: { card_theme: 'threshold', symbols: ['长廊', '红门'] }
  },
  job: null,
  uploads: 0,
  requestBodies: [],
  immediate: false,
  requestCount: 0,
  errorStatus: 0,
  errorBody: null
};

function queryResult(name, query) {
  if (name === 'dream_entries') {
    return state.dream && query.openid === state.dream.openid && query.localId === state.dream.localId ? [state.dream] : [];
  }
  return [];
}

function collection(name, transactional) {
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
          if (name === 'dream_entries') return { data: state.dream && id === state.dream._id ? state.dream : null };
          if (name === 'image_generation_jobs') return { data: state.job && id === state.job._id ? state.job : null };
          return { data: null };
        },
        set: async function (input) {
          state.job = Object.assign({}, input.data, { _id: id });
          return { _id: id };
        },
        update: async function (input) {
          state.job = Object.assign({}, state.job, input.data);
          return { _id: id };
        }
      };
    },
    add: async function () {
      if (!transactional) throw new Error('asset writes must be transactional');
      return { _id: 'asset-quality-1' };
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
  uploadFile: async function () { state.uploads += 1; return { fileID: 'cloud://quality-1' }; },
  deleteFile: async function () {},
  getTempFileURL: async function () { return { fileList: [{ tempFileURL: 'https://temp/quality-1' }] }; }
};

function fakeRequest(options, callback) {
  const request = new EventEmitter();
  let written = '';
  request.write = function (value) { written += String(value || ''); };
  request.destroy = function (error) { request.emit('error', error); };
  request.end = function () {
    state.requestCount += 1;
    const response = new EventEmitter();
    response.statusCode = state.errorStatus || 200;
    response.headers = {};
    callback(response);
    process.nextTick(function () {
      if (state.errorStatus) {
        response.emit('data', Buffer.from(JSON.stringify(state.errorBody || {})));
      } else if (/draw\/completions/.test(options.path)) {
        state.requestBodies.push(JSON.parse(written));
        response.emit('data', Buffer.from(state.immediate
          ? JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })
          : JSON.stringify({ id: 'provider-task-quality-1' })));
      } else if (/draw\/result/.test(options.path)) {
        response.emit('data', Buffer.from(JSON.stringify({ code: 0, data: { results: [{ url: 'https://cdn.test/quality.png' }] } })));
      } else if (/custom\/submit/.test(options.path)) {
        state.requestBodies.push(JSON.parse(written));
        response.emit('data', Buffer.from(JSON.stringify({ id: 'provider-task-quality-custom' })));
      } else if (/custom\/result/.test(options.path)) {
        response.emit('data', Buffer.from(JSON.stringify({ status: 'succeeded', results: [{ url: 'https://cdn.test/quality.png' }] })));
      } else {
        response.emit('data', png);
      }
      response.emit('end');
    });
  };
  return request;
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloud;
  if (request === 'https') return { request: fakeRequest };
  if (request === 'http') return { request: fakeRequest };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.QUALITY_IMAGE_ENDPOINT_URL = 'https://grsaiapi.com/v1/draw/completions';
process.env.QUALITY_IMAGE_API_KEY = 'quality-test-key';
process.env.QUALITY_IMAGE_ENABLED = '1';
process.env.QUALITY_IMAGE_MODEL = 'gpt-image-2';
process.env.QUALITY_IMAGE_TIMEOUT_MS = '5000';
delete require.cache[modulePath];
const imageFunction = require(modulePath);

(async function run() {
  const plan = visualPlanner.normalizeVisualPlan({}, {
    dreamText: state.dream.dreamText,
    dreamFacts: { emotions: ['焦虑'] },
    symbols: state.dream.result.symbols
  });
  const start = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a runner reaches a red door in a yellow corridor',
    dreamId: state.dream.localId,
    theme: 'threshold',
    visualPlan: plan
  });
  assert.equal(start.ok, true);
  assert.equal(start.status, 'provider_pending');
  assert.ok(start.jobId);
  assert.equal(state.requestBodies[0].model, 'gpt-image-2');
  assert.equal(state.requestBodies[0].quality, 'medium');

  const poll = await imageFunction.main({
    action: 'pollQuality',
    jobId: start.jobId,
    dreamId: state.dream.localId
  });
  assert.equal(poll.ok, true);
  assert.equal(poll.status, 'succeeded');
  assert.equal(poll.model, 'gpt-image-2');
  assert.equal(poll.imageFormat, 'png');
  assert.equal(state.uploads, 1);

  state.immediate = true;
  const immediate = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a different dream with a single orange window',
    dreamId: state.dream.localId,
    theme: 'mist',
    visualPlan: plan
  });
  assert.equal(immediate.ok, true);
  assert.equal(immediate.status, 'succeeded');
  assert.equal(state.job.openid, 'owner');
  assert.equal(state.job.sourceDreamId, state.dream.localId);

  const forbidden = await imageFunction.main({
    action: 'pollQuality',
    jobId: start.jobId,
    dreamId: 'other-dream'
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.reason, 'quality_job_not_found');

  state.job = null;
  state.immediate = false;
  process.env.QUALITY_IMAGE_ENDPOINT_URL = 'https://provider.test/v1/custom/submit';
  process.env.QUALITY_IMAGE_RESULT_URL = 'https://provider.test/v1/custom/result';
  process.env.QUALITY_IMAGE_QUALITY = 'medium';
  const custom = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a runner reaches a red door in a yellow corridor',
    dreamId: state.dream.localId,
    theme: 'threshold',
    visualPlan: plan
  });
  assert.equal(custom.ok, true);
  assert.notEqual(custom.jobId, start.jobId);
  assert.equal(state.requestBodies[state.requestBodies.length - 1].output_format, 'png');

  state.job = null;
  process.env.QUALITY_IMAGE_QUALITY = 'high';
  const highQuality = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a runner reaches a red door in a yellow corridor',
    dreamId: state.dream.localId,
    theme: 'threshold',
    visualPlan: plan
  });
  assert.equal(highQuality.ok, true);
  assert.notEqual(highQuality.jobId, custom.jobId);

  state.job = null;
  process.env.QUALITY_IMAGE_ENDPOINT_URL = 'https://provider.test/v1/images/generations?route=quality';
  delete process.env.QUALITY_IMAGE_RESULT_URL;
  process.env.QUALITY_IMAGE_QUALITY = 'medium';
  const requestCountBeforeSync = state.requestCount;
  const unsupportedSync = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a safe synchronous endpoint check',
    dreamId: state.dream.localId,
    theme: 'threshold',
    visualPlan: plan
  });
  assert.equal(unsupportedSync.ok, false);
  assert.equal(unsupportedSync.reason, 'quality_sync_endpoint_unsupported');
  assert.equal(unsupportedSync.endpointMode, 'openai_images_sync');
  assert.equal(state.requestCount, requestCountBeforeSync);

  state.job = null;
  process.env.QUALITY_IMAGE_ENDPOINT_URL = 'https://provider.test/v1/custom/submit';
  process.env.QUALITY_IMAGE_RESULT_URL = 'https://provider.test/v1/custom/result';
  state.errorStatus = 401;
  state.errorBody = {
    error: {
      code: 'INVALID_API_KEY',
      message: 'sensitive provider detail must not escape'
    }
  };
  const providerFailure = await imageFunction.main({
    action: 'startQuality',
    prompt: 'a provider error diagnostics check',
    dreamId: state.dream.localId,
    theme: 'threshold',
    visualPlan: plan
  });
  assert.equal(providerFailure.ok, false);
  assert.equal(providerFailure.reason, 'quality_provider_error');
  assert.equal(providerFailure.diagnosticCode, 'auth_failed');
  assert.equal(state.job.last_error, 'quality provider request failed');
  assert.equal(state.job.last_error_code, 'auth_failed');
  assert.equal(JSON.stringify(providerFailure).includes('sensitive provider detail'), false);
  assert.equal(JSON.stringify(state.job).includes('sensitive provider detail'), false);

  state.job = {
    _id: 'quality-poll-error',
    openid: 'owner',
    sourceDreamId: state.dream.localId,
    status: 'provider_pending',
    provider_task_id: 'provider-task-poll-error',
    provider: 'openai',
    model: 'gpt-image-2'
  };
  state.errorStatus = 503;
  state.errorBody = {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'sensitive polling detail must not escape'
    }
  };
  const pollFailure = await imageFunction.main({
    action: 'pollQuality',
    jobId: state.job._id,
    dreamId: state.dream.localId
  });
  assert.equal(pollFailure.ok, false);
  assert.equal(pollFailure.status, 'provider_pending');
  assert.equal(pollFailure.diagnosticCode, 'provider_unavailable');
  assert.equal(state.job.last_error, 'quality provider polling request failed');
  assert.equal(state.job.last_error_code, 'provider_unavailable');
  assert.equal(JSON.stringify(pollFailure).includes('sensitive polling detail'), false);
  assert.equal(JSON.stringify(state.job).includes('sensitive polling detail'), false);

  state.errorStatus = 0;
  state.errorBody = null;
  console.log('image2 quality endpoint modes, output format, job identity, diagnostics, and owner isolation passed');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
}).finally(function () {
  Module._load = originalLoad;
});
