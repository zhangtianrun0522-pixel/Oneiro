const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const STYLE_VERSION = 'oneiro-etched-dream-v2';
const DEFAULT_STYLE = [
  'vertical 3:4 tarot-inspired dream illustration panel',
  'Oneiro signature style',
  'delicate copperplate etching and restrained gouache',
  'deep indigo, moon ivory and one muted accent color',
  'antique cotton paper texture with subtle print grain',
  'large centered symbolic dream imagery',
  'quiet cinematic negative space, soft moonlit haze',
  'consistent handcrafted editorial illustration',
  'no card mockup, no border, no frame, no blank margins',
  'no text, no letters, no watermark, no photorealism, no glossy 3d render'
].join(', ');
const THEME_ACCENTS = {
  tide: 'sea glass teal accent, translucent water reflections',
  threshold: 'aged brass accent, a luminous doorway or key motif',
  shadow: 'smoky violet accent, long soft shadows without horror',
  falling: 'dusty rose accent, suspended drifting fragments',
  archive: 'weathered parchment accent, shelves and memory fragments',
  hearth: 'burnt sienna accent, intimate warm interior glow',
  moon: 'pale celestial blue accent, silver moon halo',
  mist: 'sage grey accent, layered fog and quiet ambiguity'
};
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'nano-banana-fast';
const DEFAULT_SIZE = '768x1024';
const DEFAULT_ASPECT_RATIO = '768x1024';
const DEFAULT_QUALITY = 'low';
const DEFAULT_TIMEOUT_MS = 55000;
const FUNCTION_BUDGET_MS = 55000;
const NANO_BANANA_SUBMIT_TIMEOUT_MS = 46000;
const MAX_PROMPT_LENGTH = 280;

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
          reject(new Error('image provider failed: ' + res.statusCode + ' ' + raw.slice(0, 500)));
          return;
        }
        resolve({ headers: res.headers, body: parseResponseBody(raw) });
      });
    });

    req.on('timeout', function () {
      req.destroy(new Error('image provider timeout'));
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
  const image = (body.data && body.data[0]) || (body.results && body.results[0]) || {};

  if (typeof image === 'string') {
    return {
      b64: '',
      url: image
    };
  }

  if (Array.isArray(body.data) && typeof body.data[0] === 'string') {
    return {
      b64: '',
      url: body.data[0]
    };
  }

  if (Array.isArray(body.results) && typeof body.results[0] === 'string') {
    return {
      b64: '',
      url: body.results[0]
    };
  }

  return {
    b64: image.b64_json || image.b64 || body.b64_json || body.b64 || '',
    url: image.url || image.imageUrl || image.image_url || image.output_url || image.output ||
      body.url || body.imageUrl || body.image_url || body.output_url || body.output || ''
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
  return body && (body.id || body.task_id || body.taskId || body.data && (body.data.id || body.data.task_id || body.data.taskId));
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
  return Object.prototype.hasOwnProperty.call(THEME_ACCENTS, theme) ? theme : 'mist';
}

function buildPrompt(prompt, theme) {
  const core = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH);
  const normalizedTheme = normalizeTheme(theme);

  return [
    core,
    'Create only the vertical 3:4 inner illustration artwork, not a complete tarot card or poster.',
    DEFAULT_STYLE,
    THEME_ACCENTS[normalizedTheme],
    'Keep the same Oneiro visual language across the whole collectible series.'
  ].join(', ');
}

function cacheKey(prompt, theme, model) {
  return crypto.createHash('sha256')
    .update([STYLE_VERSION, normalizeTheme(theme), model, String(prompt || '').trim()].join('|'))
    .digest('hex');
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

async function cachedImage(key) {
  try {
    const result = await cloud.database().collection('generated_assets')
      .where({ cache_key: key })
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
      imageBytes: Number(asset.image_bytes || 0)
    } : null;
  } catch (error) {
    return null;
  }
}

async function rememberImage(key, fileID, cloudPath, prompt, theme, model, format, imageBytes) {
  try {
    await cloud.database().collection('generated_assets').add({
      data: {
        cache_key: key,
        file_id: fileID,
        cloud_path: cloudPath,
        style_version: STYLE_VERSION,
        theme: normalizeTheme(theme),
        model: model,
        image_format: format,
        image_bytes: imageBytes,
        prompt_preview: String(prompt || '').slice(0, 120),
        created_at: cloud.database().serverDate()
      }
    });
  } catch (error) {
    // Cache persistence must never turn a successful image into a failed request.
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

async function generateWithGrsaiNanoBanana(config, prompt, theme, deadline) {
  const response = await requestJson(
    grsaiNanoBananaUrl(config.endpointUrl),
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json'
      }
    },
    JSON.stringify({
      model: config.model,
      prompt: buildPrompt(prompt, theme),
      image_size: '1K',
      aspect_ratio: '3:4',
      replyType: 'json'
    }),
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

async function generateImage(prompt, theme) {
  const config = configuredProvider();
  const deadline = Date.now() + config.timeoutMs;
  const startedAt = Date.now();
  const key = cacheKey(prompt, theme, config.model);

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

  const cached = await cachedImage(key);
  if (cached) {
    return {
      ok: true,
      provider: config.provider,
      providerConfigured: true,
      model: config.model,
      fileID: cached.fileID,
      imageUrl: cached.imageUrl,
      cacheHit: true,
      styleVersion: STYLE_VERSION,
      theme: normalizeTheme(theme),
      imageFormat: cached.imageFormat,
      imageBytes: cached.imageBytes,
      latencyMs: Date.now() - startedAt
    };
  }

  const isGrsaiEndpoint = isGrsaiGenerateEndpoint(config.endpointUrl);
  let image;

  if (isGrsaiEndpoint && isNanoBananaModel(config.model)) {
    image = await generateWithGrsaiNanoBanana(config, prompt, theme, deadline);
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
        prompt: buildPrompt(prompt, theme),
        images: [],
        aspectRatio: config.aspectRatio,
        replyType: 'json'
      }
      : {
        model: config.model,
        prompt: buildPrompt(prompt, theme),
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
  const cloudPath = 'generated-dream-images/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + format.extension;
  const upload = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buffer });
  const tempUrlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] });
  const tempUrl = tempUrlRes && tempUrlRes.fileList && tempUrlRes.fileList[0]
    ? tempUrlRes.fileList[0].tempFileURL
    : '';
  await rememberImage(
    key,
    upload.fileID,
    cloudPath,
    prompt,
    theme,
    config.model,
    format.extension,
    buffer.length
  );

  return {
    ok: true,
    provider: config.provider,
    providerConfigured: true,
    model: config.model,
    fileID: upload.fileID,
    imageUrl: tempUrl,
    cloudPath: cloudPath,
    cacheHit: false,
    styleVersion: STYLE_VERSION,
    theme: normalizeTheme(theme),
    imageFormat: format.extension,
    imageBytes: buffer.length,
    latencyMs: Date.now() - startedAt
  };
}

exports.main = async function (event) {
  const prompt = String((event && event.prompt) || '').trim();
  const theme = normalizeTheme(String((event && event.theme) || 'mist').trim());
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
      supportedThemes: Object.keys(THEME_ACCENTS)
    };
  }

  if (!prompt) {
    return { ok: false, reason: 'missing_prompt', message: 'prompt required' };
  }

  try {
    return await generateImage(prompt, theme);
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_error',
      provider: config.provider,
      providerConfigured: config.provider === 'openai' && !!config.apiKey,
      message: error && error.message ? error.message.slice(0, 300) : 'image generation failed'
    };
  }
};
