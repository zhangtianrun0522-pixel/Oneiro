'use strict';

const SCENE = {
  PROFILE: 1,
  COMMENT: 2,
  FORUM: 3,
  SOCIAL_LOG: 4
};

const MAX_BYTES_PER_CALL = 2500;
const MAX_TOTAL_BYTES = 200000;
const TIMEOUT_MS = 3000;
const RETRY_COUNT = 1;
const RETRY_INTERVAL_MS = 200;
const CONCURRENCY_LIMIT = 4;
const DEFAULT_BUDGET_MS = 8000;

function byteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

function splitByBytes(text, maxBytes) {
  const result = [];
  let current = '';
  let currentBytes = 0;

  for (const char of text) {
    const charBytes = byteLength(char);
    if (currentBytes + charBytes > maxBytes && currentBytes > 0) {
      result.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }

  if (currentBytes > 0) {
    result.push(current);
  }

  return result;
}

function isRiskyError(err) {
  return err && (err.errCode === 87014 || (err.message && err.message.indexOf('87014') !== -1));
}

function callMsgSecCheck(cloud, content, openid, scene, nickname, timeoutMs) {
  const params = {
    content: content,
    openid: openid,
    scene: scene,
    version: 2
  };

  if (nickname) {
    params.nickname = nickname;
  }

  return new Promise(function (resolve, reject) {
    if (!cloud.openapi || !cloud.openapi.security || !cloud.openapi.security.msgSecCheck) {
      reject(new Error('cloud.openapi.security.msgSecCheck is not available'));
      return;
    }

    let settled = false;
    const timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error('timeout'));
      }
    }, timeoutMs);

    cloud.openapi.security.msgSecCheck(params).then(function (res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    }).catch(function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function checkSingle(cloud, content, openid, scene, strict, nickname, deadline) {
  const trimmed = content.trim();
  if (!trimmed) {
    return { pass: true, reason: 'empty', label: 0, suggest: '', degraded: false };
  }

  const totalBytes = byteLength(trimmed);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { pass: false, reason: 'oversize', label: 0, suggest: '', degraded: false };
  }

  const chunks = splitByBytes(trimmed, MAX_BYTES_PER_CALL);

  for (let i = 0; i < chunks.length; i++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      if (strict) {
        return { pass: false, reason: 'budget_exhausted', label: 0, suggest: '', degraded: true };
      }
      return { pass: true, reason: 'budget_exhausted', label: 0, suggest: '', degraded: true };
    }

    const chunk = chunks[i];
    let lastError = null;
    const callTimeoutMs = Math.min(TIMEOUT_MS, remainingMs);

    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      const attemptRemainingMs = deadline - Date.now();
      if (attemptRemainingMs <= 0) {
        lastError = new Error('budget_exhausted');
        break;
      }

      try {
        const res = await callMsgSecCheck(cloud, chunk, openid, scene, nickname, Math.min(callTimeoutMs, attemptRemainingMs));
        const suggest = res.result && res.result.suggest ? res.result.suggest : '';
        const label = res.result && res.result.label ? res.result.label : 0;

        if (suggest === 'risky') {
          return { pass: false, reason: 'risky', label: label, suggest: suggest, degraded: false };
        }

        if (suggest === 'review') {
          return { pass: true, reason: 'review', label: label, suggest: suggest, degraded: false };
        }

        if (suggest === 'pass') {
          lastError = null;
          break;
        }

        lastError = new Error('unexpected suggest: ' + suggest);
      } catch (err) {
        if (isRiskyError(err)) {
          return { pass: false, reason: 'risky', label: 0, suggest: 'risky', degraded: false };
        }
        lastError = err;
        if (attempt < RETRY_COUNT) {
          const retryWaitMs = Math.min(RETRY_INTERVAL_MS, deadline - Date.now());
          if (retryWaitMs > 0) {
            await new Promise(function (resolve) { setTimeout(resolve, retryWaitMs); });
          }
        }
      }
    }

    if (lastError) {
      if (lastError.message === 'budget_exhausted') {
        if (strict) {
          return { pass: false, reason: 'budget_exhausted', label: 0, suggest: '', degraded: true };
        }
        return { pass: true, reason: 'budget_exhausted', label: 0, suggest: '', degraded: true };
      }
      if (strict) {
        return { pass: false, reason: 'api_error', label: 0, suggest: '', degraded: true };
      }
      return { pass: true, reason: 'api_error', label: 0, suggest: '', degraded: true };
    }
  }

  return { pass: true, reason: '', label: 0, suggest: 'pass', degraded: false };
}

async function checkText(cloud, options) {
  const content = options.content || '';
  const openid = options.openid || '';
  const scene = options.scene || SCENE.SOCIAL_LOG;
  const strict = options.strict || false;
  const nickname = options.nickname;
  const budgetMs = options.budgetMs || DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;

  return checkSingle(cloud, content, openid, scene, strict, nickname, deadline);
}

async function checkTexts(cloud, options) {
  const contents = options.contents || [];
  const openid = options.openid || '';
  const scene = options.scene || SCENE.SOCIAL_LOG;
  const strict = options.strict || false;
  const nickname = options.nickname;
  const budgetMs = options.budgetMs || DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;

  const nonEmpty = contents.filter(function (item) {
    return item && item.trim().length > 0;
  });

  if (nonEmpty.length === 0) {
    return { pass: true, reason: 'empty', label: 0, suggest: '', degraded: false };
  }

  const results = [];
  let index = 0;

  async function worker() {
    while (index < nonEmpty.length) {
      const current = index++;
      const result = await checkSingle(cloud, nonEmpty[current], openid, scene, strict, nickname, deadline);
      results[current] = result;
      if (!result.pass) {
        return;
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(CONCURRENCY_LIMIT, nonEmpty.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  for (let i = 0; i < results.length; i++) {
    if (results[i] && !results[i].pass) {
      return results[i];
    }
  }

  return { pass: true, reason: '', label: 0, suggest: 'pass', degraded: false };
}

module.exports = { checkText, checkTexts, SCENE };