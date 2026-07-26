const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const visualPlanner = require('./visualPlan');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const STYLE_VERSION = visualPlanner.STYLE_VERSION;
const LEGACY_THEMES = {
  tide: true,
  threshold: true,
  shadow: true,
  falling: true,
  archive: true,
  hearth: true,
  moon: true,
  mist: true
};
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'nano-banana-fast';
const DEFAULT_SIZE = '768x1024';
const DEFAULT_ASPECT_RATIO = '768x1024';
const DEFAULT_QUALITY = 'low';
const DEFAULT_TIMEOUT_MS = 55000;
const FUNCTION_BUDGET_MS = 55000;
const NANO_BANANA_SUBMIT_TIMEOUT_MS = 46000;
const QUALITY_DEFAULT_MODEL = 'gpt-image-2';
const QUALITY_DEFAULT_TIMEOUT_MS = 12000;
const QUALITY_DEFAULT_SIZE = '768x1024';
const QUALITY_DEFAULT_QUALITY = 'medium';
const QUALITY_ADAPTER_VERSION = 'image2-quality-v2';

function parseResponseBody(raw) {
  const text = String(raw || '').trim();
  const dataLines = [];
  let lastJson = null;
  let i;

  if (!text) {
    return {};
  }

  if (/^data:/m.test(text)) {
    text.split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (trimmed.indexOf('data:') === 0) {
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          dataLines.push(payload);
        }
      }
    });

    for (i = 0; i < dataLines.length; i += 1) {
      try {
        lastJson = JSON.parse(dataLines[i]);
      } catch (error) {
        if (!lastJson) {
          lastJson = { raw: dataLines[i] };
        }
      }
    }

    if (lastJson) {
      return lastJson;
    }
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

function providerErrorCode(body) {
  const payload = body && body.data && !Array.isArray(body.data) && typeof body.data === 'object'
    ? Object.assign({}, body, body.data)
    : body || {};
  const providerError = payload.error;
  const candidate = providerError && typeof providerError === 'object'
    ? providerError.code || providerError.type
    : payload.code || payload.error_code || (typeof providerError === 'string' ? providerError : '');
  const normalized = String(candidate || '').trim().toUpperCase().replace(/[^A-Z0-9_.-]+/g, '_').slice(0, 80);
  return normalized && normalized !== '0' ? normalized : '';
}

function qualityProviderResponseError(body) {
  const payload = body && body.data && !Array.isArray(body.data) && typeof body.data === 'object'
    ? Object.assign({}, body, body.data)
    : body || {};
  const status = String(payload.status || payload.state || payload.task_status || '').toLowerCase();
  if (!payload.error && status !== 'failed' && status !== 'error') return null;
  const error = new Error('quality provider rejected request');
  error.providerCode = providerErrorCode(body);
  return error;
}

function qualityDiagnosticCode(error) {
  const statusCode = Number(error && error.statusCode || 0);
  const providerCode = String(error && error.providerCode || '').toUpperCase();
  const text = (providerCode + ' ' + String(error && error.message || '')).toUpperCase();
  const networkCode = String(error && error.code || '').toUpperCase();

  if (text.indexOf('SUBSCRIPTION_NOT_FOUND') >= 0) return 'subscription_not_found';
  if (text.indexOf('INSUFFICIENT') >= 0 || text.indexOf('BALANCE') >= 0 || text.indexOf('QUOTA') >= 0) {
    return 'insufficient_balance';
  }
  if (statusCode === 401 || statusCode === 403 ||
    text.indexOf('INVALID_API_KEY') >= 0 || text.indexOf('UNAUTHORIZED') >= 0 ||
    text.indexOf('AUTH') >= 0) {
    return 'auth_failed';
  }
  if (statusCode === 404) return 'endpoint_not_found';
  if (statusCode === 429 || text.indexOf('RATE_LIMIT') >= 0) return 'rate_limited';
  if (statusCode === 400 || statusCode === 422) return 'invalid_request';
  if (statusCode >= 500) return 'provider_unavailable';
  if (networkCode === 'ETIMEDOUT' || text.indexOf('TIMEOUT') >= 0 || text.indexOf('TIMED OUT') >= 0) {
    return 'provider_timeout';
  }
  if (networkCode === 'ECONNRESET' || networkCode === 'ECONNREFUSED' ||
    networkCode === 'ENOTFOUND' || networkCode === 'EAI_AGAIN') {
    return 'provider_network_error';
  }
  return 'provider_error';
}

function requestJson(url, options, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request({
      method: options.method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      headers: options.headers || {},
      timeout: timeoutMs
    }, function (res) {
      const chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const parsedBody = parseResponseBody(raw);
          const error = new Error('image provider failed with HTTP ' + res.statusCode);
          error.statusCode = res.statusCode;
          error.providerCode = providerErrorCode(parsedBody);
          reject(error);
          return;
        }
        resolve({ headers: res.headers, body: parseResponseBody(raw) });
      });
    });

    req.on('timeout', function () {
      const error = new Error('image provider timeout');
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestBuffer(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      timeout: timeoutMs
    }, function (res) {
      const chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('image download failed: ' + res.statusCode));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('timeout', function () {
      req.destroy(new Error('image download timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function imagesUrl() {
  const endpointUrl = String(process.env.OPENAI_IMAGE_ENDPOINT_URL || '').trim();
  const baseUrl = String(process.env.OPENAI_IMAGE_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');

  if (endpointUrl) {
    return endpointUrl;
  }

  if (baseUrl.endsWith('/images/generations') || baseUrl.endsWith('/draw/completions')) {
    return baseUrl;
  }

  return baseUrl + '/images/generations';
}

function extractImage(data) {
  const body = data || {};
  // Some gateways wrap the OpenAI-compatible payload as { data: { results: [...] } }.
  // Normalize that shape here so the synchronous and quality paths share the same parser.
  const payload = body.data && !Array.isArray(body.data) && typeof body.data === 'object'
    ? Object.assign({}, body, body.data)
    : body;
  const image = (payload.data && payload.data[0]) || (payload.results && payload.results[0]) || {};

  if (typeof image === 'string') {
    return {
      b64: '',
      url: image
    };
  }

  if (Array.isArray(payload.data) && typeof payload.data[0] === 'string') {
    return {
      b64: '',
      url: payload.data[0]
    };
  }

  if (Array.isArray(payload.results) && typeof payload.results[0] === 'string') {
    return {
      b64: '',
      url: payload.results[0]
    };
  }

  return {
    b64: image.b64_json || image.b64 || payload.b64_json || payload.b64 || '',
    url: image.url || image.imageUrl || image.image_url || image.output_url || image.output ||
      payload.url || payload.imageUrl || payload.image_url || payload.output_url || payload.output || ''
  };
}

function isGrsaiGenerateEndpoint(endpointUrl) {
  return /\/v1\/api\/generate\/?$/.test(String(endpointUrl || ''));
}

function isNanoBananaModel(model) {
  return /^nano-banana/.test(String(model || '').toLowerCase());
}

function grsaiResultUrl(endpointUrl, id) {
  return String(endpointUrl || '').replace(/\/generate\/?$/, '/result') + '?id=' + encodeURIComponent(id);
}

function grsaiNanoBananaUrl(endpointUrl) {
  const parsed = new URL(endpointUrl);
  return parsed.protocol + '//' + parsed.host + '/v1/draw/nano-banana';
}

function grsaiDrawResultUrl(endpointUrl) {
  const parsed = new URL(endpointUrl);
  return parsed.protocol + '//' + parsed.host + '/v1/draw/result';
}

function extractTaskId(body) {
  const payload = body && body.data && !Array.isArray(body.data) && typeof body.data === 'object'
    ? Object.assign({}, body, body.data)
    : body;
  return payload && (payload.id || payload.task_id || payload.taskId || payload.data && (payload.data.id || payload.data.task_id || payload.data.taskId));
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function remainingTimeout(deadline, maxMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 1000) {
    return 1000;
  }
  return Math.min(maxMs, remaining - 500);
}

function normalizeTheme(theme) {
  return Object.prototype.hasOwnProperty.call(LEGACY_THEMES, theme) ? theme : 'mist';
}

function cacheKey(generationPrompt, model, styleVersion, referenceCount) {
  return crypto.createHash('sha256')
    .update([styleVersion || STYLE_VERSION, model, referenceCount ? 'reference:' + referenceCount : 'text', String(generationPrompt || '').trim()].join('|'))
    .digest('hex');
}

function deletionJobId(openid, localDreamId) {
  return 'dream-' + crypto.createHash('sha256')
    .update(String(openid || '') + ':' + String(localDreamId || ''))
    .digest('hex')
    .slice(0, 48);
}

async function getDocument(collection, id) {
  try {
    const response = await collection.doc(id).get();
    return response && response.data ? response.data : null;
  } catch (error) {
    return null;
  }
}

async function findOwnedDream(openid, sourceDreamId) {
  if (!openid || !sourceDreamId) return null;

  const db = cloud.database();
  const owned = await db.collection('dream_entries')
    .where({ openid: openid, localId: sourceDreamId })
    .limit(1)
    .get();
  const dream = owned && owned.data && owned.data[0];

  if (!dream || dream.deletionPending) return null;

  // Querying by fields also detects tombstones created before deterministic IDs were introduced.
  const deletion = await db.collection('deletion_jobs')
    .where({ openid: openid, sourceDreamId: sourceDreamId })
    .limit(1)
    .get();
  if (deletion && deletion.data && deletion.data.length) return null;

  return dream;
}

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 1024) {
    throw new Error('generated image payload is unexpectedly small');
  }

  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  throw new Error('image provider returned an unsupported binary format');
}

function readJpegDimensions(buffer) {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += length + 2;
  }

  return null;
}

function readWebpDimensions(buffer) {
  const chunk = buffer.slice(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return null;
}

function readImageDimensions(buffer, format) {
  if (format === 'png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (format === 'jpg') return readJpegDimensions(buffer);
  if (format === 'webp') return readWebpDimensions(buffer);
  return null;
}

function buildImageQualityCheck(plan, buffer, format) {
  const quality = visualPlanner.buildPlanQualityCheck(plan);
  const dimensions = readImageDimensions(buffer, format);
  const ratio = dimensions && dimensions.height ? dimensions.width / dimensions.height : 0;
  const ratioPassed = !!dimensions && dimensions.height > dimensions.width && Math.abs(ratio - 0.75) <= 0.035;

  quality.stage = 'generated_geometry';
  quality.dimensions = dimensions || { width: 0, height: 0 };
  quality.checks.output_dimensions_readable = !!dimensions;
  quality.checks.output_portrait = !!dimensions && dimensions.height > dimensions.width;
  quality.checks.output_aspect_ratio_3_4 = ratioPassed;
  quality.passed = Object.keys(quality.checks).every(function (key) {
    return quality.checks[key];
  });
  return quality;
}

async function cachedImage(key, openid, sourceDreamId) {
  try {
    const result = await cloud.database().collection('generated_assets')
      .where({ cache_key: key, openid: openid, sourceDreamId: sourceDreamId })
      .limit(1)
      .get();
    const asset = result && result.data && result.data[0];

    if (!asset || !asset.file_id) {
      return null;
    }

    const urls = await cloud.getTempFileURL({ fileList: [asset.file_id] });
    const imageUrl = urls && urls.fileList && urls.fileList[0] ? urls.fileList[0].tempFileURL : '';
    return imageUrl ? {
      fileID: asset.file_id,
      imageUrl: imageUrl,
      imageFormat: asset.image_format || '',
      imageBytes: Number(asset.image_bytes || 0),
      visualPlan: asset.visual_plan || null,
      qualityCheck: asset.quality_check || null
    } : null;
  } catch (error) {
    return null;
  }
}

async function reserveImage(key, fileID, cloudPath, generationPrompt, visualPlan, qualityCheck, theme, model, format, imageBytes, openid, sourceDreamId, dream, stylePreset, styleVersion) {
  const db = cloud.database();
  const assetData = {
    cache_key: key,
    openid: openid,
    sourceDreamId: String(sourceDreamId || ''),
    file_id: fileID,
    cloud_path: cloudPath,
    style_preset: stylePreset,
    style_version: styleVersion,
    theme: normalizeTheme(theme),
    model: model,
    image_format: format,
    image_bytes: imageBytes,
    generation_prompt: String(generationPrompt || '').slice(0, 6000),
    prompt_preview: String(generationPrompt || '').replace(/\s+/g, ' ').slice(0, 240),
    visual_plan: visualPlan,
    quality_check: qualityCheck,
    created_at: db.serverDate()
  };

  if (typeof db.runTransaction !== 'function') {
    return false;
  }

  try {
    const created = await db.runTransaction(async function (transaction) {
      const tombstone = await getDocument(
        transaction.collection('deletion_jobs'),
        deletionJobId(openid, sourceDreamId)
      );
      const currentDream = await getDocument(transaction.collection('dream_entries'), dream._id);

      if (tombstone || !currentDream || currentDream.deletionPending ||
        currentDream.openid !== openid || currentDream.localId !== sourceDreamId) {
        return null;
      }

      return transaction.collection('generated_assets').add({ data: assetData });
    });
    return !!(created && created._id);
  } catch (error) {
    return false;
  }
}

async function deleteUploadedFile(fileID) {
  try {
    await cloud.deleteFile({ fileList: [fileID] });
  } catch (error) {
    // The caller never exposes the file ID when its asset reservation did not commit.
  }
}

function decodeReferenceImage(value) {
  const text = String(value || '').trim();
  const match = text.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  const encoded = match ? match[2] : text;
  const buffer = Buffer.from(encoded, 'base64');
  const format = detectImageFormat(buffer);
  return { buffer: buffer, extension: format.extension };
}

async function prepareReferenceImages(referenceImageData, sourceDreamId) {
  const values = Array.isArray(referenceImageData) ? referenceImageData.slice(0, 3) : [];
  const fileIDs = [];
  const urls = [];

  try {
    for (let index = 0; index < values.length; index += 1) {
      const decoded = decodeReferenceImage(values[index]);
      const cloudPath = 'reference-style-tests/' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8) + '.' + decoded.extension;
      const upload = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: decoded.buffer });
      fileIDs.push(upload.fileID);
    }

    if (fileIDs.length) {
      const tempUrlRes = await cloud.getTempFileURL({ fileList: fileIDs });
      (tempUrlRes && tempUrlRes.fileList || []).forEach(function (item) {
        if (item && item.tempFileURL) urls.push(item.tempFileURL);
      });
    }

    if (urls.length !== fileIDs.length) {
      throw new Error('reference image temporary URL preparation failed');
    }

    return { fileIDs: fileIDs, urls: urls, sourceDreamId: sourceDreamId };
  } catch (error) {
    for (let index = 0; index < fileIDs.length; index += 1) {
      await deleteUploadedFile(fileIDs[index]);
    }
    throw error;
  }
}

function normalizeImageModel(model) {
  const value = String(model || DEFAULT_MODEL).trim();
  const normalized = value.toLowerCase().replace(/[_\s]+/g, '-');

  if (!normalized || normalized === 'gpt-image-1.5' || normalized === 'gpt-image-2') {
    return DEFAULT_MODEL;
  }

  if (normalized === 'nanobanana' || normalized === 'nano-banana') {
    return 'nano-banana';
  }

  if (normalized === 'nanobanana-fast' || normalized === 'nano-banana-fast') {
    return 'nano-banana-fast';
  }

  if (normalized === 'nanobanana-2' || normalized === 'nano-banana-2') {
    return 'nano-banana-2';
  }

  if (normalized === 'nanobanana-pro' || normalized === 'nano-banana-pro') {
    return 'nano-banana-pro';
  }

  return value;
}

function normalizeImageDimension(value, model) {
  const dimension = String(value || '').trim();
  const normalizedModel = String(model || '').toLowerCase();

  if (
    normalizedModel === 'nano-banana-fast' &&
    (!dimension || dimension === '1024x1536' || dimension === '1024x1024')
  ) {
    return DEFAULT_SIZE;
  }

  return dimension || DEFAULT_SIZE;
}

function configuredProvider() {
  const provider = String(process.env.IMAGE_PROVIDER || 'openai').trim().toLowerCase();
  const apiKey = String(process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const requestedModel = String(process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL).trim();
  const model = normalizeImageModel(requestedModel);
  const endpointUrl = imagesUrl();
  const timeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const requestedSize = String(process.env.OPENAI_IMAGE_SIZE || DEFAULT_SIZE).trim();
  const requestedAspectRatio = String(process.env.OPENAI_IMAGE_ASPECT_RATIO || process.env.OPENAI_IMAGE_SIZE || DEFAULT_ASPECT_RATIO).trim();

  return {
    provider: provider,
    apiKey: apiKey,
    requestedModel: requestedModel,
    model: model,
    endpointUrl: endpointUrl,
    endpointHost: new URL(endpointUrl).hostname,
    requestedSize: requestedSize,
    requestedAspectRatio: requestedAspectRatio,
    size: normalizeImageDimension(requestedSize, model),
    aspectRatio: normalizeImageDimension(requestedAspectRatio, model),
    quality: String(process.env.OPENAI_IMAGE_QUALITY || DEFAULT_QUALITY).trim(),
    timeoutMs: Math.min(Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS, FUNCTION_BUDGET_MS)
  };
}

function qualityImagesUrl() {
  const endpointUrl = String(process.env.QUALITY_IMAGE_ENDPOINT_URL || '').trim();
  if (endpointUrl) return endpointUrl;

  const sharedEndpoint = String(process.env.OPENAI_IMAGE_ENDPOINT_URL || '').trim();
  if (sharedEndpoint) return sharedEndpoint;

  const baseUrl = String(process.env.QUALITY_IMAGE_BASE_URL || process.env.OPENAI_IMAGE_BASE_URL || DEFAULT_BASE_URL)
    .trim().replace(/\/+$/, '');
  if (baseUrl.endsWith('/images/generations') || baseUrl.endsWith('/draw/completions')) {
    return baseUrl;
  }
  return baseUrl + '/images/generations';
}

function configuredQualityProvider() {
  const endpointUrl = qualityImagesUrl();
  const requestedModel = String(process.env.QUALITY_IMAGE_MODEL || QUALITY_DEFAULT_MODEL).trim();
  const timeoutMs = Number(process.env.QUALITY_IMAGE_TIMEOUT_MS || QUALITY_DEFAULT_TIMEOUT_MS);
  const requestedSize = String(process.env.QUALITY_IMAGE_SIZE || QUALITY_DEFAULT_SIZE).trim();

  return {
    adapterVersion: QUALITY_ADAPTER_VERSION,
    provider: String(process.env.QUALITY_IMAGE_PROVIDER || process.env.IMAGE_PROVIDER || 'openai').trim().toLowerCase(),
    apiKey: String(process.env.QUALITY_IMAGE_API_KEY || process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '').trim(),
    model: requestedModel || QUALITY_DEFAULT_MODEL,
    endpointUrl: endpointUrl,
    endpointHost: new URL(endpointUrl).hostname,
    endpointMode: qualityEndpointMode(endpointUrl),
    resultUrl: String(process.env.QUALITY_IMAGE_RESULT_URL || '').trim(),
    size: requestedSize || QUALITY_DEFAULT_SIZE,
    quality: String(process.env.QUALITY_IMAGE_QUALITY || QUALITY_DEFAULT_QUALITY).trim(),
    timeoutMs: Math.min(Number.isFinite(timeoutMs) ? timeoutMs : QUALITY_DEFAULT_TIMEOUT_MS, 20000)
  };
}

function qualityEndpointPath(endpointUrl) {
  try {
    return new URL(String(endpointUrl || '')).pathname.replace(/\/+$/, '');
  } catch (error) {
    return String(endpointUrl || '').split(/[?#]/, 1)[0].replace(/\/+$/, '');
  }
}

function isQualityDrawEndpoint(endpointUrl) {
  return /\/v1\/draw\/completions$/.test(qualityEndpointPath(endpointUrl));
}

function qualityEndpointMode(endpointUrl) {
  if (isQualityDrawEndpoint(endpointUrl)) return 'draw_async';
  if (/\/v1\/images\/generations$/.test(qualityEndpointPath(endpointUrl))) return 'openai_images_sync';
  return 'custom_async';
}

function qualityResultUrl(config, taskId) {
  if (config.resultUrl) return config.resultUrl;
  if (isQualityDrawEndpoint(config.endpointUrl)) {
    return grsaiDrawResultUrl(config.endpointUrl);
  }
  return String(config.endpointUrl || '').replace(/\/completions\/?$/, '/result') + '?id=' + encodeURIComponent(taskId);
}

function qualityJobId(openid, sourceDreamId, generationPrompt, config) {
  return 'quality-' + crypto.createHash('sha256')
    .update([
      openid,
      sourceDreamId,
      config.adapterVersion,
      config.endpointMode,
      config.model,
      config.size,
      config.quality,
      generationPrompt
    ].join('|'))
    .digest('hex').slice(0, 48);
}

function qualityJobStatus(body) {
  const payload = body && body.data && !Array.isArray(body.data) && typeof body.data === 'object'
    ? Object.assign({}, body, body.data)
    : body || {};
  const status = String(payload.status || payload.state || payload.task_status || '').toLowerCase();
  if (payload.error) return 'failed';
  if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') return 'failed';
  if (status === 'succeeded' || status === 'success' || status === 'completed' || status === 'done') return 'succeeded';
  return 'pending';
}

async function pollGrsaiDrawResult(config, taskId, deadline) {
  let body;
  let image;
  let pollIndex;

  for (pollIndex = 0; pollIndex < 10 && deadline - Date.now() > 8000; pollIndex += 1) {
    await wait(Math.min(4000, Math.max(1200, deadline - Date.now() - 7000)));
    const poll = await requestJson(
      grsaiDrawResultUrl(config.endpointUrl),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + config.apiKey,
          'Content-Type': 'application/json'
        }
      },
      JSON.stringify({ id: taskId }),
      remainingTimeout(deadline, 7000)
    );
    body = poll.body;
    image = extractImage(body);
    if (image.b64 || image.url) {
      return image;
    }
    if (body && (body.status === 'failed' || body.status === 'error' || body.error)) {
      throw new Error(body.error || body.failure_reason || body.msg || 'nano-banana generation failed');
    }
  }

  throw new Error('nano-banana result timeout');
}

async function generateWithGrsaiNanoBanana(config, generationPrompt, deadline, referenceImageUrls) {
  const payload = {
    model: config.model,
    prompt: generationPrompt,
    image_size: '1K',
    aspect_ratio: '3:4',
    replyType: 'json'
  };
  if (Array.isArray(referenceImageUrls) && referenceImageUrls.length) {
    payload.urls = referenceImageUrls;
  }
  const response = await requestJson(
    grsaiNanoBananaUrl(config.endpointUrl),
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json'
      }
    },
    JSON.stringify(payload),
    remainingTimeout(deadline, NANO_BANANA_SUBMIT_TIMEOUT_MS)
  );
  const body = response.body;
  const image = extractImage(body);
  const taskId = extractTaskId(body);

  if (image.b64 || image.url) {
    return image;
  }

  if (body && (body.status === 'failed' || body.status === 'error' || body.error)) {
    throw new Error(body.error || body.failure_reason || body.msg || 'nano-banana generation failed');
  }

  if (taskId) {
    return pollGrsaiDrawResult(config, taskId, deadline);
  }

  throw new Error('nano-banana response did not include image data or task id');
}

function buildGenerationContext(prompt, theme, requestedVisualPlan, dream, requestedStylePreset, config, referenceImageCount) {
  const stylePreset = visualPlanner.normalizeStylePreset(requestedStylePreset);
  const styleVersion = visualPlanner.styleVersionForPreset(stylePreset);
  const dreamResult = dream && dream.result ? dream.result : {};
  const dreamFacts = dream && dream.dreamFacts ? dream.dreamFacts : (dreamResult.dream_facts || {});
  const visualPlan = visualPlanner.normalizeVisualPlan(
    dreamResult.visual_plan || requestedVisualPlan,
    {
      dreamText: dream && dream.dreamText,
      dreamFacts: dreamFacts,
      symbols: dreamResult.symbols || dream.symbols,
      imagePrompt: prompt,
      theme: theme
    }
  );
  const generationPrompt = visualPlanner.buildGenerationPrompt(visualPlan, stylePreset);
  return {
    stylePreset: stylePreset,
    styleVersion: styleVersion,
    visualPlan: visualPlan,
    generationPrompt: generationPrompt,
    referenceCount: Number(referenceImageCount || 0),
    key: cacheKey(generationPrompt, config.model, styleVersion, referenceImageCount)
  };
}

async function finalizeImageResult(image, config, context, theme, openid, sourceDreamId, dream, startedAt) {
  let buffer;
  if (image && image.b64) {
    buffer = Buffer.from(image.b64, 'base64');
  } else if (image && image.url) {
    buffer = await requestBuffer(image.url, Math.min(config.timeoutMs, 12000));
  } else {
    throw new Error('image provider response did not include image data');
  }

  const format = detectImageFormat(buffer);
  const qualityCheck = buildImageQualityCheck(context.visualPlan, buffer, format.extension);
  const cloudPath = 'generated-dream-images/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + format.extension;
  const upload = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buffer });
  const reserved = await reserveImage(
    context.key,
    upload.fileID,
    cloudPath,
    context.generationPrompt,
    context.visualPlan,
    qualityCheck,
    theme,
    config.model,
    format.extension,
    buffer.length,
    openid,
    sourceDreamId,
    dream,
    context.stylePreset,
    context.styleVersion
  );

  if (!reserved) {
    await deleteUploadedFile(upload.fileID);
    return { ok: false, reason: 'dream_not_found' };
  }

  const tempUrlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] });
  const tempUrl = tempUrlRes && tempUrlRes.fileList && tempUrlRes.fileList[0]
    ? tempUrlRes.fileList[0].tempFileURL
    : '';

  return {
    ok: true,
    provider: config.provider,
    providerConfigured: true,
    model: config.model,
    fileID: upload.fileID,
    imageUrl: tempUrl,
    cloudPath: cloudPath,
    cacheHit: false,
    stylePreset: context.stylePreset,
    styleVersion: context.styleVersion,
    theme: normalizeTheme(theme),
    imageFormat: format.extension,
    imageBytes: buffer.length,
    visualPlan: context.visualPlan,
    qualityCheck: qualityCheck,
    referenceImageCount: context.referenceCount,
    latencyMs: Date.now() - startedAt
  };
}

async function submitQualityTask(config, generationPrompt) {
  const drawEndpoint = isQualityDrawEndpoint(config.endpointUrl);
  const payload = drawEndpoint
    ? {
      model: config.model,
      prompt: generationPrompt,
      size: config.size,
      quality: config.quality,
      n: 1,
      output_format: 'png'
    }
    : {
      model: config.model,
      prompt: generationPrompt,
      size: config.size,
      quality: config.quality,
      n: 1,
      output_format: 'png'
    };
  const response = await requestJson(
    config.endpointUrl,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json'
      }
    },
    JSON.stringify(payload),
    config.timeoutMs
  );
  const responseError = qualityProviderResponseError(response.body);
  if (responseError) throw responseError;
  return {
    body: response.body,
    image: extractImage(response.body),
    taskId: extractTaskId(response.body)
  };
}

async function pollQualityTask(config, taskId) {
  const drawEndpoint = isQualityDrawEndpoint(config.endpointUrl);
  const url = qualityResultUrl(config, taskId);
  const response = await requestJson(
    url,
    {
      method: drawEndpoint || config.resultUrl ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json'
      }
    },
    drawEndpoint || config.resultUrl ? JSON.stringify({ id: taskId }) : '',
    config.timeoutMs
  );
  const responseError = qualityProviderResponseError(response.body);
  return {
    body: response.body,
    image: extractImage(response.body),
    status: qualityJobStatus(response.body),
    diagnosticCode: responseError ? qualityDiagnosticCode(responseError) : ''
  };
}

async function updateQualityJobIfActive(db, jobId, data) {
  let updated = false;
  const write = async function (scope) {
    const current = await getDocument(scope.collection('image_generation_jobs'), jobId);
    if (!current || current.status === 'cancelled' || current.cancel_requested) return;
    await scope.collection('image_generation_jobs').doc(jobId).update({ data: data });
    updated = true;
  };

  if (typeof db.runTransaction === 'function') {
    await db.runTransaction(function (transaction) { return write(transaction); });
  } else {
    await write(db);
  }
  return updated;
}

async function claimQualityJob(db, jobId, data) {
  let claimed = false;
  let existing = null;
  const claim = async function (scope) {
    existing = await getDocument(scope.collection('image_generation_jobs'), jobId);
    if (existing) return;
    await scope.collection('image_generation_jobs').doc(jobId).set({ data: data });
    claimed = true;
  };

  if (typeof db.runTransaction === 'function') {
    await db.runTransaction(function (transaction) { return claim(transaction); });
  } else {
    await claim(db);
  }
  return { claimed: claimed, existing: existing };
}

async function prepareQualityContext(event, openid) {
  const sourceDreamId = String((event && event.dreamId) || '').trim().slice(0, 100);
  if (!sourceDreamId) return { error: { ok: false, reason: 'missing_dream_id' } };
  const dream = await findOwnedDream(openid, sourceDreamId);
  if (!dream) return { error: { ok: false, reason: 'dream_not_found' } };
  const prompt = String((event && event.prompt) || '').trim();
  const theme = normalizeTheme(String((event && event.theme) || 'mist').trim());
  const visualPlan = event && event.visualPlan && typeof event.visualPlan === 'object' ? event.visualPlan : null;
  if (!prompt && !String(dream.dreamText || '').trim() && !visualPlan) {
    return { error: { ok: false, reason: 'missing_dream_content' } };
  }
  const config = configuredQualityProvider();
  const context = buildGenerationContext(prompt, theme, visualPlan, dream, event && event.stylePreset, config, 0);
  return { sourceDreamId, dream, theme, config, context };
}

async function startQualityJob(event, openid) {
  const prepared = await prepareQualityContext(event, openid);
  if (prepared.error) return prepared.error;
  const { sourceDreamId, dream, theme, config, context } = prepared;
  const enabled = /^(1|true|yes)$/i.test(String(process.env.QUALITY_IMAGE_ENABLED || '').trim());
  if (!enabled || config.provider !== 'openai' || !config.apiKey) {
    return { ok: false, reason: 'quality_unavailable', providerConfigured: enabled && config.provider === 'openai' && !!config.apiKey };
  }
  if (config.endpointMode === 'openai_images_sync') {
    return {
      ok: false,
      reason: 'quality_sync_endpoint_unsupported',
      endpointMode: config.endpointMode,
      providerConfigured: true
    };
  }
  if (!process.env.QUALITY_IMAGE_ENDPOINT_URL && /\/v1\/api\/generate\/?$/.test(config.endpointUrl)) {
    return { ok: false, reason: 'quality_endpoint_required', providerConfigured: true };
  }
  const jobId = qualityJobId(openid, sourceDreamId, context.generationPrompt, config);
  const db = cloud.database();
  const cached = await cachedImage(context.key, openid, sourceDreamId);
  if (cached) {
    return Object.assign({ ok: true, status: 'succeeded', jobId: jobId, model: config.model, provider: config.provider }, cached);
  }
  const existing = await getDocument(db.collection('image_generation_jobs'), jobId);
  if (existing && existing.status === 'succeeded' && existing.file_id) {
    const cached = await cachedImage(context.key, openid, sourceDreamId);
    if (cached) {
      return Object.assign({ status: 'succeeded', jobId: jobId }, cached, { model: config.model, provider: config.provider });
    }
    const urls = await cloud.getTempFileURL({ fileList: [existing.file_id] });
    const imageUrl = urls && urls.fileList && urls.fileList[0] ? urls.fileList[0].tempFileURL : '';
    return { ok: true, status: 'succeeded', jobId: jobId, fileID: existing.file_id, imageUrl: imageUrl, model: config.model, provider: config.provider };
  }
  if (existing && existing.status === 'failed') {
    return { ok: false, status: 'failed', jobId: jobId, reason: 'quality_retry_exhausted' };
  }
  if (existing && (existing.status === 'submitting' || existing.status === 'queued' || existing.status === 'provider_pending')) {
    return { ok: true, status: existing.status, jobId: jobId, model: config.model, provider: config.provider };
  }

  // Claim a deterministic placeholder in a transaction before submitting. A
  // second page either observes the existing claim or loses the transaction,
  // preventing duplicate paid provider requests in the normal race case.
  const claim = await claimQualityJob(db, jobId, {
    openid: openid,
    sourceDreamId: sourceDreamId,
    dreamRecordId: dream._id,
    status: 'submitting',
    provider: config.provider,
    model: config.model,
    adapter_version: config.adapterVersion,
    endpoint_mode: config.endpointMode,
    request_size: config.size,
    request_quality: config.quality,
    generation_prompt: context.generationPrompt.slice(0, 6000),
    visual_plan: context.visualPlan,
    style_preset: context.stylePreset,
    style_version: context.styleVersion,
    theme: theme,
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  });
  if (!claim.claimed) {
    const claimedExisting = claim.existing || {};
    return {
      ok: claimedExisting.status !== 'failed',
      status: claimedExisting.status || 'provider_pending',
      jobId: jobId,
      model: config.model,
      provider: config.provider,
      reason: claimedExisting.status === 'failed' ? 'quality_retry_exhausted' : undefined
    };
  }

  let submitted;
  try {
    submitted = await submitQualityTask(config, context.generationPrompt);
  } catch (error) {
    const diagnosticCode = qualityDiagnosticCode(error);
    await updateQualityJobIfActive(db, jobId, {
      status: 'failed',
      last_error: 'quality provider request failed',
      last_error_code: diagnosticCode,
      updated_at: db.serverDate(),
      finished_at: db.serverDate()
    });
    throw error;
  }
  if (submitted.image && (submitted.image.b64 || submitted.image.url)) {
    const result = await finalizeImageResult(submitted.image, config, context, theme, openid, sourceDreamId, dream, Date.now());
    await updateQualityJobIfActive(db, jobId, {
      status: result.ok ? 'succeeded' : 'failed',
      file_id: result.fileID || '',
      image_format: result.imageFormat || '',
      image_bytes: result.imageBytes || 0,
      model: config.model,
      provider: config.provider,
      updated_at: db.serverDate(),
      finished_at: db.serverDate()
    });
    return Object.assign({}, result, { jobId, status: result.ok ? 'succeeded' : 'failed' });
  }
  if (!submitted.taskId) {
    await updateQualityJobIfActive(db, jobId, {
      status: 'failed',
      last_error: 'quality provider returned neither an image nor a task id',
      last_error_code: 'invalid_provider_response',
      updated_at: db.serverDate(),
      finished_at: db.serverDate()
    });
    return { ok: false, reason: 'quality_provider_no_task' };
  }

  await updateQualityJobIfActive(db, jobId, {
    status: 'provider_pending',
    provider: config.provider,
    model: config.model,
    provider_task_id: String(submitted.taskId),
    updated_at: db.serverDate()
  });
  return { ok: true, status: 'provider_pending', jobId: jobId, model: config.model, provider: config.provider };
}

async function pollQualityJob(event, openid) {
  const jobId = String((event && event.jobId) || '').trim();
  const sourceDreamId = String((event && event.dreamId) || '').trim().slice(0, 100);
  if (!jobId || !sourceDreamId) return { ok: false, reason: 'missing_quality_job' };
  const db = cloud.database();
  const job = await getDocument(db.collection('image_generation_jobs'), jobId);
  if (!job || job.openid !== openid || job.sourceDreamId !== sourceDreamId) return { ok: false, reason: 'quality_job_not_found' };
  if (job.status === 'succeeded' && job.file_id) {
    const urls = await cloud.getTempFileURL({ fileList: [job.file_id] });
    const imageUrl = urls && urls.fileList && urls.fileList[0] ? urls.fileList[0].tempFileURL : job.image_url || '';
    return { ok: true, status: 'succeeded', jobId: jobId, fileID: job.file_id, imageUrl: imageUrl, model: job.model, provider: job.provider, imageFormat: job.image_format || '', imageBytes: Number(job.image_bytes || 0) };
  }
  if (job.status !== 'provider_pending' || !job.provider_task_id) return { ok: true, status: job.status || 'pending', jobId: jobId };

  const config = configuredQualityProvider();
  let polled;
  try {
    polled = await pollQualityTask(config, job.provider_task_id);
  } catch (error) {
    const diagnosticCode = qualityDiagnosticCode(error);
    await updateQualityJobIfActive(db, jobId, {
      last_error: 'quality provider polling request failed',
      last_error_code: diagnosticCode,
      updated_at: db.serverDate()
    });
    return {
      ok: false,
      status: 'provider_pending',
      reason: 'quality_provider_error',
      diagnosticCode: diagnosticCode
    };
  }
  if (polled.image && (polled.image.b64 || polled.image.url)) {
    const dream = await findOwnedDream(openid, sourceDreamId);
    if (!dream) {
      await updateQualityJobIfActive(db, jobId, { status: 'cancelled', updated_at: db.serverDate(), finished_at: db.serverDate() });
      return { ok: false, status: 'cancelled', reason: 'dream_not_found' };
    }
    const context = {
      stylePreset: job.style_preset || 'production',
      styleVersion: job.style_version || STYLE_VERSION,
      visualPlan: job.visual_plan || {},
      generationPrompt: job.generation_prompt || '',
      referenceCount: 0,
      key: cacheKey(job.generation_prompt || '', job.model || config.model, job.style_version || STYLE_VERSION, 0)
    };
    const result = await finalizeImageResult(polled.image, config, context, job.theme || 'mist', openid, sourceDreamId, dream, Date.now());
    await updateQualityJobIfActive(db, jobId, {
      status: result.ok ? 'succeeded' : 'failed',
      file_id: result.fileID || '',
      image_format: result.imageFormat || '',
      image_bytes: result.imageBytes || 0,
      updated_at: db.serverDate(),
      finished_at: db.serverDate()
    });
    return Object.assign({}, result, { jobId, status: result.ok ? 'succeeded' : 'failed' });
  }
  if (polled.status === 'failed') {
    const diagnosticCode = polled.diagnosticCode || 'provider_error';
    await updateQualityJobIfActive(db, jobId, {
      status: 'failed',
      last_error: 'quality provider polling failed',
      last_error_code: diagnosticCode,
      updated_at: db.serverDate(),
      finished_at: db.serverDate()
    });
    return {
      ok: false,
      status: 'failed',
      reason: 'quality_provider_failed',
      diagnosticCode: diagnosticCode
    };
  }
  return { ok: true, status: 'provider_pending', jobId: jobId };
}

async function generateImage(prompt, theme, requestedVisualPlan, openid, sourceDreamId, dream, requestedStylePreset, referenceImageUrls) {
  const config = configuredProvider();
  const deadline = Date.now() + config.timeoutMs;
  const startedAt = Date.now();
  const stylePreset = visualPlanner.normalizeStylePreset(requestedStylePreset);
  const styleVersion = visualPlanner.styleVersionForPreset(stylePreset);
  const dreamResult = dream && dream.result ? dream.result : {};
  const dreamFacts = dream && dream.dreamFacts ? dream.dreamFacts : (dreamResult.dream_facts || {});
  const visualPlan = visualPlanner.normalizeVisualPlan(
    dreamResult.visual_plan || requestedVisualPlan,
    {
      dreamText: dream && dream.dreamText,
      dreamFacts: dreamFacts,
      symbols: dreamResult.symbols || dream.symbols,
      imagePrompt: prompt,
      theme: theme
    }
  );
  const generationPrompt = visualPlanner.buildGenerationPrompt(visualPlan, stylePreset);
  const referenceCount = Array.isArray(referenceImageUrls) ? referenceImageUrls.length : 0;
  const key = cacheKey(generationPrompt, config.model, styleVersion, referenceCount);

  if (config.provider !== 'openai') {
    throw new Error('Unsupported IMAGE_PROVIDER: ' + config.provider);
  }

  if (!config.apiKey) {
    return {
      ok: false,
      reason: 'missing_api_key',
      provider: config.provider,
      providerConfigured: false
    };
  }

  const cached = await cachedImage(key, openid, sourceDreamId);
  if (cached) {
    return {
      ok: true,
      provider: config.provider,
      providerConfigured: true,
      model: config.model,
      fileID: cached.fileID,
      imageUrl: cached.imageUrl,
      cacheHit: true,
      stylePreset: stylePreset,
      styleVersion: styleVersion,
      theme: normalizeTheme(theme),
      imageFormat: cached.imageFormat,
      imageBytes: cached.imageBytes,
      visualPlan: cached.visualPlan || visualPlan,
      qualityCheck: cached.qualityCheck || visualPlanner.buildPlanQualityCheck(visualPlan),
      referenceImageCount: referenceCount,
      latencyMs: Date.now() - startedAt
    };
  }

  const isGrsaiEndpoint = isGrsaiGenerateEndpoint(config.endpointUrl);
  let image;

  if (isGrsaiEndpoint && isNanoBananaModel(config.model)) {
    image = await generateWithGrsaiNanoBanana(config, generationPrompt, deadline, referenceImageUrls);
  } else {
  const response = await requestJson(
    config.endpointUrl,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json'
      }
    },
    JSON.stringify(isGrsaiEndpoint
      ? {
        model: config.model,
        prompt: generationPrompt,
        images: [],
        aspectRatio: config.aspectRatio,
        replyType: 'json'
      }
      : {
        model: config.model,
        prompt: generationPrompt,
        size: config.size,
        quality: config.quality,
        n: 1
    }),
    isGrsaiEndpoint ? remainingTimeout(deadline, 45000) : remainingTimeout(deadline, 12000)
  );
  let body = response.body;
  image = extractImage(body);
  let pollIndex;

  if (!image.b64 && !image.url && isGrsaiGenerateEndpoint(config.endpointUrl) && body && body.id) {
    for (pollIndex = 0; pollIndex < 8 && deadline - Date.now() > 8000; pollIndex += 1) {
      await wait(Math.min(4000, Math.max(1000, deadline - Date.now() - 7000)));
      const poll = await requestJson(
        grsaiResultUrl(config.endpointUrl, body.id),
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + config.apiKey
          }
        },
        '',
        remainingTimeout(deadline, 7000)
      );
      body = poll.body;
      image = extractImage(body);
      if (image.b64 || image.url) {
        break;
      }
      if (body && (body.status === 'failed' || body.status === 'error')) {
        throw new Error(body.error || body.failure_reason || body.msg || 'image generation failed');
      }
    }
  }
  }
  let buffer;

  if (image.b64) {
    buffer = Buffer.from(image.b64, 'base64');
  } else if (image.url) {
    buffer = await requestBuffer(image.url, remainingTimeout(deadline, 8000));
  } else {
    throw new Error('image provider response did not include image data');
  }

  const format = detectImageFormat(buffer);
  const qualityCheck = buildImageQualityCheck(visualPlan, buffer, format.extension);
  const cloudPath = 'generated-dream-images/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + format.extension;
  const upload = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buffer });
  const reserved = await reserveImage(
    key,
    upload.fileID,
    cloudPath,
    generationPrompt,
    visualPlan,
    qualityCheck,
    theme,
    config.model,
    format.extension,
    buffer.length,
    openid,
    sourceDreamId,
    dream,
    stylePreset,
    styleVersion
  );

  if (!reserved) {
    await deleteUploadedFile(upload.fileID);
    return { ok: false, reason: 'dream_not_found' };
  }

  const tempUrlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] });
  const tempUrl = tempUrlRes && tempUrlRes.fileList && tempUrlRes.fileList[0]
    ? tempUrlRes.fileList[0].tempFileURL
    : '';

  return {
    ok: true,
    provider: config.provider,
    providerConfigured: true,
    model: config.model,
    fileID: upload.fileID,
    imageUrl: tempUrl,
    cloudPath: cloudPath,
    cacheHit: false,
    stylePreset: stylePreset,
    styleVersion: styleVersion,
    theme: normalizeTheme(theme),
    imageFormat: format.extension,
    imageBytes: buffer.length,
    visualPlan: visualPlan,
    qualityCheck: qualityCheck,
    referenceImageCount: referenceCount,
    latencyMs: Date.now() - startedAt
  };
}

exports.main = async function (event) {
  const action = String((event && event.action) || '').trim();
  const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};
  const openid = String((wxContext && wxContext.OPENID) || '');

  if (action === 'startQuality' || action === 'image2.start') {
    try {
      return await startQualityJob(event, openid);
    } catch (error) {
      return {
        ok: false,
        reason: 'quality_provider_error',
        diagnosticCode: qualityDiagnosticCode(error),
        message: 'quality image start failed'
      };
    }
  }

  if (action === 'pollQuality' || action === 'image2.poll') {
    try {
      return await pollQualityJob(event, openid);
    } catch (error) {
      return {
        ok: false,
        reason: 'quality_provider_error',
        diagnosticCode: qualityDiagnosticCode(error),
        message: 'quality image poll failed'
      };
    }
  }

  const prompt = String((event && event.prompt) || '').trim();
  const theme = normalizeTheme(String((event && event.theme) || 'mist').trim());
  const requestedVisualPlan = event && event.visualPlan && typeof event.visualPlan === 'object'
    ? event.visualPlan
    : null;
  const requestedStylePreset = visualPlanner.normalizeStylePreset(event && event.stylePreset);
  const sourceDreamId = String((event && event.dreamId) || '').trim().slice(0, 100);
  const config = configuredProvider();

  if (event && event.healthCheck) {
    return {
      ok: true,
      type: 'generateDreamImage.health',
      provider: config.provider,
      providerConfigured: config.provider === 'openai' && !!config.apiKey,
      hasApiKey: !!config.apiKey,
      requestedModel: config.requestedModel,
      model: config.model,
      endpointHost: config.endpointHost,
      requestedSize: config.requestedSize,
      requestedAspectRatio: config.requestedAspectRatio,
      size: config.size,
      aspectRatio: config.aspectRatio,
      quality: config.quality,
      requestTimeoutMs: config.timeoutMs,
      styleVersion: STYLE_VERSION,
      stylePresets: visualPlanner.STYLE_PRESETS,
      supportedThemes: Object.keys(LEGACY_THEMES),
      paletteModes: Object.keys(visualPlanner.EMOTION_PALETTES),
      compositionModes: Object.keys(visualPlanner.COMPOSITIONS),
      semanticQualityReview: 'requires_vision_review',
      qualityChannel: (function () {
        const qualityConfig = configuredQualityProvider();
        return {
          enabled: /^(1|true|yes)$/i.test(String(process.env.QUALITY_IMAGE_ENABLED || '').trim()),
          model: qualityConfig.model,
          provider: qualityConfig.provider,
          endpointHost: qualityConfig.endpointHost,
          endpointMode: qualityConfig.endpointMode,
          adapterVersion: qualityConfig.adapterVersion,
          providerConfigured: qualityConfig.provider === 'openai' && !!qualityConfig.apiKey,
          size: qualityConfig.size,
          quality: qualityConfig.quality,
          requestTimeoutMs: qualityConfig.timeoutMs
        };
      }())
    };
  }

  if (!sourceDreamId) {
    return { ok: false, reason: 'missing_dream_id', message: 'dreamId required' };
  }

  let dream;
  try {
    dream = await findOwnedDream(openid, sourceDreamId);
  } catch (error) {
    return { ok: false, reason: 'dream_not_found' };
  }
  if (!dream) {
    return { ok: false, reason: 'dream_not_found' };
  }

  if (!prompt && !String(dream.dreamText || '').trim() && !requestedVisualPlan) {
    return { ok: false, reason: 'missing_dream_content', message: 'dream content required' };
  }

  let preparedReferences = { fileIDs: [], urls: [] };
  const referenceTest = event && event.referenceTest === true && requestedStylePreset === 'internal_test';
  try {
    if (referenceTest) {
      preparedReferences = await prepareReferenceImages(event.referenceImageData, sourceDreamId);
    }
    return await generateImage(
      prompt,
      theme,
      requestedVisualPlan,
      openid,
      sourceDreamId,
      dream,
      requestedStylePreset,
      preparedReferences.urls
    );
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_error',
      provider: config.provider,
      providerConfigured: config.provider === 'openai' && !!config.apiKey,
      message: error && error.message ? error.message.slice(0, 300) : 'image generation failed'
    };
  } finally {
    for (let index = 0; index < preparedReferences.fileIDs.length; index += 1) {
      await deleteUploadedFile(preparedReferences.fileIDs[index]);
    }
  }
};
