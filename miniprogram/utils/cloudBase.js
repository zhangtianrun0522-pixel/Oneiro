var CLOUD_STATUS_KEY = 'oneiro:cloudStatus';
var CLOUD_ENV_ID = 'cloud1-d9gb0sjvg6a8d9864';
var LOCAL_ID_KEY = 'oneiro:localOpenId';
var INTERPRET_CLIENT_TIMEOUT_MS = 70000;
// 客户端超时必须高于云函数自己的预算，否则会在云端仍在正常工作时把它掐断。
// generateDreamImage 的 FUNCTION_BUDGET_MS 是 55 秒，供应商提交单次就可能占
// 54 秒，30 秒的默认值会把正常的生图判成超时。
var IMAGE_CLIENT_TIMEOUT_MS = 70000;
var DEFAULT_CLIENT_TIMEOUT_MS = 30000;

function defaultTimeoutForFunction(name) {
  if (name === 'interpretDream') return INTERPRET_CLIENT_TIMEOUT_MS;
  if (name === 'generateDreamImage') return IMAGE_CLIENT_TIMEOUT_MS;
  return DEFAULT_CLIENT_TIMEOUT_MS;
}
var cloudReady = false;
var cloudChecked = false;

function hasStorage() {
  return typeof wx !== 'undefined' && wx && wx.getStorageSync && wx.setStorageSync;
}

function hasCloud() {
  return typeof wx !== 'undefined' && wx && wx.cloud && wx.cloud.callFunction;
}

function saveStatus(status) {
  if (hasStorage()) {
    wx.setStorageSync(CLOUD_STATUS_KEY, status);
  }
}

function localOpenId() {
  var openid = hasStorage() ? wx.getStorageSync(LOCAL_ID_KEY) : '';

  if (!openid) {
    openid = 'local-' + String(Date.now());
    if (hasStorage()) {
      wx.setStorageSync(LOCAL_ID_KEY, openid);
    }
  }

  return openid;
}

function initCloud(callback) {
  var status;

  if (!hasCloud()) {
    status = { mode: 'local_only', cloudReady: false };
    saveStatus(status);
    if (callback) {
      callback(status);
    }
    return false;
  }

  if (!cloudChecked && wx.cloud.init) {
    try {
      wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
      cloudReady = true;
    } catch (error) {
      cloudReady = false;
    }
    cloudChecked = true;
  }

  status = { mode: cloudReady ? 'cloud_ready' : 'cloud_unavailable', cloudReady: cloudReady };
  saveStatus(status);
  if (callback) {
    callback(status);
  }
  return cloudReady;
}

function callCloudFunction(name, data, callback, options) {
  var settings = options || {};
  var timeoutMs = Number(settings.timeoutMs || defaultTimeoutForFunction(name));
  var startedAt = Date.now();
  var settled = false;
  var timer = null;

  function settle(result) {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (callback) callback(result);
  }

  if (!cloudReady) {
    initCloud();
  }

  if (!cloudReady || !hasCloud()) {
    settle({
      ok: false,
      reason: 'cloud_unavailable',
      errorCode: 'cloud_unavailable',
      error_code: 'cloud_unavailable',
      functionName: name,
      requestTimeoutMs: timeoutMs,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      message: 'wx.cloud is unavailable or not initialized'
    });
    return false;
  }

  timer = setTimeout(function () {
    settle({
      ok: false,
      reason: 'client_timeout',
      errorCode: 'client_timeout',
      error_code: 'client_timeout',
      functionName: name,
      requestTimeoutMs: timeoutMs,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      diagnostics: {
        code: 'client_timeout',
        functionName: name,
        requestTimeoutMs: timeoutMs,
        elapsedMs: Math.max(0, Date.now() - startedAt)
      },
      message: '请求超时，请重试'
    });
  }, timeoutMs);

  try {
    // callFunction 同时返回 Promise。传了 success/fail 时这个 Promise 仍然会
    // 被 reject，基础库把它报成一条没有任何归属信息的 "Error: timeout"，
    // 调试时完全看不出是哪个云函数。settle 是幂等的，这里只负责把函数名和
    // 耗时打进控制台，真正的错误处理仍然走下面的 fail。
    var pending = wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function (res) {
        settle(res && res.result ? res.result : res);
      },
      fail: function (error) {
        var message = error && error.errMsg ? error.errMsg : 'cloud function call failed';
        var reason = /-404010|result expired|timeout for result fetching/.test(message)
          ? 'cloud_result_expired'
          : 'cloud_call_failed';

        settle({
          ok: false,
          reason: reason,
          errorCode: reason,
          error_code: reason,
          functionName: name,
          requestTimeoutMs: timeoutMs,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          message: reason === 'cloud_result_expired'
            ? '等待云函数结果时小程序进入后台或等待过久，结果已过期。请保持当前页面打开后重试。'
            : message
        });
      }
    });
    if (pending && typeof pending.catch === 'function') {
      pending.catch(function (error) {
        console.warn('[cloud] ' + name + ' 调用失败 · 已用时 ' + (Date.now() - startedAt) + 'ms · 客户端上限 '
          + timeoutMs + 'ms', error && error.errMsg ? error.errMsg : error);
      });
    }
  } catch (error) {
    settle({
      ok: false,
      reason: 'cloud_call_failed',
      errorCode: 'cloud_call_failed',
      error_code: 'cloud_call_failed',
      functionName: name,
      requestTimeoutMs: timeoutMs,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      message: error && error.message ? error.message : 'cloud function call failed'
    });
  }

  return true;
}

function getIdentity(callback) {
  callCloudFunction('login', {}, function (result) {
    var identity = result && result.openid
      ? { openid: result.openid, source: 'cloud' }
      : { openid: localOpenId(), source: 'local' };

    if (hasStorage()) {
      wx.setStorageSync('oneiro:identity', identity);
    }
    if (callback) {
      callback(identity);
    }
  });
}

function saveProfile(profile, callback) {
  return callCloudFunction('saveProfile', { profile: profile }, callback);
}

function profileMemory(action, data, callback) {
  return callCloudFunction('profileMemory', Object.assign({ action: action || 'get' }, data || {}), callback);
}

function getProfileMemory(callback) {
  return profileMemory('get', {}, callback);
}

// force 只由用户在界面上主动点「重新梳理」时传。云端据此区分两件事：后台刷新
// 在证据没变时直接跳过（连供应商调用都省掉），而用户明确要一次新解读时照常
// 生成——但生成不等于一定发新版本，仍要过实质变化的判断。
function generateProfilePortrait(changeReason, callback, options) {
  return profileMemory('generate', {
    changeReason: changeReason || '',
    force: !!(options && options.force)
  }, callback);
}

function saveProfilePortrait(snapshotId, snapshot, callback) {
  return profileMemory('save', { snapshotId: snapshotId || '', snapshot: snapshot || {} }, callback);
}

function confirmProfilePortrait(snapshotId, callback) {
  return profileMemory('confirm', { snapshotId: snapshotId || '' }, callback);
}

function rejectProfilePortrait(snapshotId, callback) {
  return profileMemory('reject', { snapshotId: snapshotId || '' }, callback);
}

function toggleProfilePortrait(snapshotId, useInFutureReadings, callback) {
  return profileMemory('toggleUse', {
    snapshotId: snapshotId || '',
    useInFutureReadings: !!useInFutureReadings
  }, callback);
}

function restoreProfilePortrait(snapshotId, callback) {
  return profileMemory('restore', { snapshotId: snapshotId || '' }, callback);
}

function saveDream(dream, callback) {
  return callCloudFunction('saveDream', { dream: dream }, callback);
}

function getDreamArchive(callback) {
  return callCloudFunction('saveDream', { action: 'list' }, callback);
}

// 内测观测：两个 action 都由云函数按 ADMIN_OPENIDS 鉴权，非管理员拿到
// { ok: false, reason: 'not_admin' }，诊断页据此隐藏整块面板。
function getFeedbackStats(callback) {
  return callCloudFunction('saveDream', { action: 'feedbackStats' }, callback);
}

function getInternalStats(callback) {
  return callCloudFunction('saveDream', { action: 'internalStats' }, callback);
}

function deleteDream(dreamId, callback) {
  return callCloudFunction('saveDream', {
    action: 'delete',
    dreamId: dreamId || ''
  }, callback);
}

function getRevisit(callback) {
  return callCloudFunction('saveDream', {
    action: 'getRevisit'
  }, callback);
}

function answerRevisit(dreamId, answer, callback) {
  return callCloudFunction('saveDream', {
    action: 'answerRevisit',
    dreamId: dreamId || '',
    answer: answer || ''
  }, callback);
}

function skipRevisit(dreamId, callback) {
  return callCloudFunction('saveDream', {
    action: 'skipRevisit',
    dreamId: dreamId || ''
  }, callback);
}

// source 是可选的第三个参数，老调用点仍然传 (dreamId, text, callback)。
function addLifeNote(dreamId, text, source, callback) {
  if (typeof source === 'function') {
    callback = source;
    source = '';
  }
  return callCloudFunction('saveDream', {
    action: 'addLifeNote',
    dreamId: dreamId || '',
    text: text || '',
    source: source || ''
  }, callback);
}

// 用户在「与你有关」某一条上点了「是这样」。这不是一条新的生活记录，而是他对
// 一个假设的一次确认——但它对画像的意义和生活记录完全一样（一句他认账的现实
// 描述），所以走同一张表、同一条补偿链路，只用 source 把来源分开，让画像那头
// 能按「用户核实过的呼应」而不是「用户自己讲的事」来使用它。
function confirmDreamConnection(dreamId, text, callback) {
  return addLifeNote(dreamId, text, 'dream_connection', callback);
}

function deleteLifeNote(noteId, callback) {
  return callCloudFunction('saveDream', {
    action: 'deleteLifeNote',
    noteId: noteId || ''
  }, callback);
}

function getLifeNotes(callback) {
  return callCloudFunction('saveDream', { action: 'listLifeNotes' }, callback);
}

function editLifeNote(noteId, text, callback) {
  return callCloudFunction('saveDream', {
    action: 'editLifeNote',
    noteId: noteId || '',
    text: text || ''
  }, callback);
}

function editSymbol(dreamId, oldSymbol, newSymbol, callback) {
  return callCloudFunction('saveDream', {
    action: 'editSymbol',
    dreamId: dreamId || '',
    oldSymbol: oldSymbol || '',
    newSymbol: newSymbol || ''
  }, callback);
}

function createShareCard(dream, callback) {
  return callCloudFunction('createShareCard', {
    dream: dream
  }, callback);
}

function getShareCard(shareId, callback) {
  return callCloudFunction('getShareCard', { shareId: shareId || '' }, callback);
}

function generateDreamImage(prompt, dreamId, theme, visualPlan, options, callback) {
  if (typeof theme === 'function') {
    callback = theme;
    theme = 'mist';
    visualPlan = null;
  } else if (typeof visualPlan === 'function') {
    callback = visualPlan;
    visualPlan = null;
  }
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  var payload = {
    prompt: prompt || '',
    dreamId: dreamId || '',
    theme: theme || 'mist',
    visualPlan: visualPlan && typeof visualPlan === 'object' ? visualPlan : null,
    forceRefresh: !!(options && options.forceRefresh)
  };
  // This request token accompanies the image bundle when it is persisted. It
  // is deliberately generated once per request so a later manual refresh can
  // be ordered against delayed page snapshots on the server.
  var imageGenerationToken = (payload.forceRefresh ? 'refresh-' : 'image-') +
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  payload.imageGenerationToken = imageGenerationToken;
  if (payload.forceRefresh) {
    payload.requestId = imageGenerationToken;
  }
  var startPollAttempts = 0;
  var finalizePollAttempts = 0;
  var maxStartPollAttempts = 21;
  var maxFinalizePollAttempts = 16;

  function finish(result) {
    if (callback) {
      callback(Object.assign({}, result || {}, {
        imageGenerationToken: imageGenerationToken,
        imageRefreshToken: payload.forceRefresh ? imageGenerationToken : ''
      }));
    }
  }

  function finalize(jobId) {
    callCloudFunction('generateDreamImage', {
      action: 'finalizePrimaryImage',
      jobId: jobId,
      dreamId: payload.dreamId
    }, function (result) {
      if (result && result.ok && result.fileID && result.imageUrl) {
        finish(result);
        return;
      }
      if (
        result &&
        (result.status === 'provider_ready' || result.status === 'finalizing' || (result.status === 'succeeded' && result.fileID)) &&
        finalizePollAttempts < maxFinalizePollAttempts
      ) {
        finalizePollAttempts += 1;
        setTimeout(function () { finalize(jobId); }, 1200);
        return;
      }
      if (
        result &&
        (
          result.reason === 'cloud_result_expired' ||
          result.reason === 'cloud_call_failed' ||
          result.reason === 'temp_url_failed'
        ) &&
        finalizePollAttempts < maxFinalizePollAttempts
      ) {
        finalizePollAttempts += 1;
        setTimeout(function () { finalize(jobId); }, 1200);
        return;
      }
      finish(result || { ok: false, reason: 'primary_finalize_failed' });
    });
  }

  function start() {
    callCloudFunction('generateDreamImage', Object.assign({ action: 'startPrimaryImage' }, payload), function (result) {
      if (result && result.ok && result.fileID && result.imageUrl) {
        finish(result);
        return;
      }
      if (result && result.jobId && (result.status === 'provider_ready' || result.status === 'submitting' || result.status === 'finalizing')) {
        if (result.status === 'provider_ready') {
          finalize(result.jobId);
        } else if (startPollAttempts < maxStartPollAttempts) {
          startPollAttempts += 1;
          setTimeout(start, 3000);
        } else {
          finish({ ok: false, reason: 'primary_generation_pending', status: result.status });
        }
        return;
      }
      if (
        result &&
        (result.reason === 'cloud_result_expired' || result.reason === 'cloud_call_failed') &&
        startPollAttempts < maxStartPollAttempts
      ) {
        startPollAttempts += 1;
        setTimeout(start, 3000);
        return;
      }
      finish(result || { ok: false, reason: 'primary_generation_failed' });
    });
  }

  start();
  return true;
}

// Optional progressive-quality contract. Older deployments do not understand
// these actions; callers intentionally treat a failed start as a no-op.
function startDreamImageQuality(dreamId, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  return callCloudFunction('generateDreamImage', Object.assign({
    action: 'startQuality',
    dreamId: dreamId || ''
  }, options || {}), callback);
}

function pollDreamImageQuality(jobId, dreamId, callback) {
  return callCloudFunction('generateDreamImage', {
    action: 'pollQuality',
    jobId: jobId || '',
    dreamId: dreamId || ''
  }, callback);
}

function imageHealth(callback) {
  return callCloudFunction('generateDreamImage', { healthCheck: true }, callback);
}

function imageSmokeTest(callback) {
  var dreamId = 'diagnostics-image-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  var smokeDream = {
    id: dreamId,
    dreamText: 'Diagnostics-only image generation smoke test. Please delete this temporary entry.',
    status: 'ready',
    result: { card_theme: 'moon' }
  };

  return saveDream(smokeDream, function (saved) {
    if (!saved || !saved.ok) {
      if (callback) callback(Object.assign({ ok: false, reason: 'smoke_dream_create_failed' }, saved || {}));
      return;
    }

    generateDreamImage(
      'a person reaches toward a silver key beneath a moonlit opening',
      dreamId,
      'moon',
      function (result) {
        deleteDream(dreamId, function (cleanup) {
          var response = Object.assign({}, result || {});
          response.cleanupOk = !!(cleanup && cleanup.ok);
          if (!response.cleanupOk) response.cleanupReason = (cleanup && cleanup.reason) || 'smoke_dream_cleanup_failed';
          if (callback) callback(response);
        });
      }
    );
  });
}

function interpretDream(dreamText, profile, cardIndex, callback) {
  return callCloudFunction('interpretDream', {
    dreamText: dreamText,
    profile: profile || {},
    cardIndex: cardIndex || 1
  }, callback, { timeoutMs: INTERPRET_CLIENT_TIMEOUT_MS });
}

function metaphysicalReading(dreamText, profile, baseResult, callback) {
  return callCloudFunction('interpretDream', {
    metaphysicalReading: true,
    dreamText: dreamText || '',
    profile: profile || {},
    baseResult: baseResult || {}
  }, callback, { timeoutMs: 40000 });
}

// 语音识别在真机上失败最多的两类原因都是一次性的：弱网下 callFunction 直接
// fail，或小程序短暂切后台导致结果过期。这两种情况重试一次几乎必定成功，而
// 让用户自己重录一遍代价高得多（要重新组织一遍语言）。识别失败本身
// （empty_result / not_configured / too_long）不重试——重试改变不了结果。
var SPEECH_RETRYABLE_REASONS = {
  cloud_call_failed: true,
  cloud_result_expired: true,
  client_timeout: true,
  cloud_unavailable: true,
  recognize_timeout: true
};
// 云函数侧 Tencent ASR 通常 1-3 秒返回，弱网上传才是耗时大头。
var SPEECH_CLIENT_TIMEOUT_MS = 45000;

// 超过这个长度就改走云存储，不再把音频塞进 callFunction 的请求体。
//
// 「越长越容易失败」是这条链路的结构性问题，不是调大超时能解决的：base64 音频
// 走 callFunction 时，同一段字节要被搬两次——客户端上行一次（弱网上行常年只有
// 几百 kbps），云函数再原样 POST 给腾讯 ASR 一次。两段耗时都随时长线性增长，
// 而云函数的平台超时是一堵固定的墙，于是短音频过得去、长音频撞墙。
//
// 换成云存储之后：上传走 uploadFile（不占 callFunction 的超时预算），云函数只
// 递一个签名 URL 给腾讯，让它在腾讯自己的网络里取——云函数的运行时长几乎与音频
// 长度无关，那堵墙就不再随时长逼近。
var SPEECH_UPLOAD_MIN_SECONDS = 8;

function speechCallFunction(payload, callback) {
  var attempted = false;
  function attempt() {
    return callCloudFunction('speechRecognize', payload, function (result) {
      var reason = result && result.reason ? String(result.reason) : '';
      if (!attempted && (!result || result.ok !== true) && SPEECH_RETRYABLE_REASONS[reason]) {
        attempted = true;
        setTimeout(attempt, 600);
        return;
      }
      if (callback) callback(result);
    }, { timeoutMs: SPEECH_CLIENT_TIMEOUT_MS });
  }
  return attempt();
}

function speechRecognize(audioBase64, duration, callback) {
  return speechCallFunction({
    audioBase64: audioBase64 || '',
    format: 'mp3',
    duration: Number(duration) || 0
  }, callback);
}

// 页面统一走这里：读文件、决定内联还是上传、失败兜底，全部收在一处。之前两个
// 页面各自 readFile 再拼 base64，任何一处改动都得改两遍。
function recognizeSpeech(filePath, duration, callback) {
  var seconds = Number(duration) || 0;

  function done(result) {
    if (callback) callback(result);
  }

  function inlineFallback(uploadError) {
    if (!wx.getFileSystemManager) {
      done({ ok: false, reason: 'invalid_audio', message: uploadError || 'no_file_system' });
      return;
    }
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (readResult) {
        speechCallFunction({
          audioBase64: readResult.data || '',
          format: 'mp3',
          duration: seconds,
          // 上传失败后退回内联时留个痕，否则线上只会看到「内联路径偶尔慢」，
          // 看不出它其实是上传失败的下游。
          uploadFallback: uploadError ? String(uploadError).slice(0, 120) : ''
        }, done);
      },
      fail: function () {
        done({ ok: false, reason: 'invalid_audio', message: 'file_read_failed' });
      }
    });
  }

  if (!filePath) {
    done({ ok: false, reason: 'invalid_audio', message: 'missing_file_path' });
    return false;
  }

  if (!cloudReady) initCloud();

  var canUpload = seconds >= SPEECH_UPLOAD_MIN_SECONDS && cloudReady && hasCloud() && wx.cloud.uploadFile;
  if (!canUpload) {
    inlineFallback('');
    return true;
  }

  wx.cloud.uploadFile({
    cloudPath: 'voice-clips/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '.mp3',
    filePath: filePath,
    success: function (uploadResult) {
      var fileID = uploadResult && uploadResult.fileID;
      if (!fileID) {
        inlineFallback('upload_missing_file_id');
        return;
      }
      speechCallFunction({ fileID: fileID, format: 'mp3', duration: seconds }, function (result) {
        // 原始语音是这个产品里最私密的内容之一，不能留在存储里。云函数正常跑完
        // 会自己删；这里是它没跑成（超时、断网）时的兜底。
        if ((!result || result.ok !== true) && wx.cloud.deleteFile) {
          try { wx.cloud.deleteFile({ fileList: [fileID], success: function () {}, fail: function () {} }); } catch (error) {}
        }
        done(result);
      });
    },
    fail: function (error) {
      // 上传这条路走不通时不能让用户白说一段话，退回原来的内联方式再试一次。
      inlineFallback((error && error.errMsg) || 'upload_failed');
    }
  });
  return true;
}

// 梦后对话走的是 interpretDream 这个云函数，于是继承了它 70 秒的客户端上限。
// 但一轮聊天回复和一次完整解读不是一回事：真的等满 70 秒，用户早就认定
// 「卡死了」并反复点发送。回复本身通常几秒返回，35 秒已经足够宽裕。
var CHAT_CLIENT_TIMEOUT_MS = 35000;

function chatAboutDream(dreamText, dreamResult, messages, userMessage, callback, feedback) {
  return callCloudFunction('interpretDream', {
    chatAboutDream: true,
    dreamText: dreamText || '',
    dreamResult: dreamResult || {},
    messages: messages || [],
    userMessage: userMessage || '',
    feedback: feedback || ''
  }, callback, { timeoutMs: CHAT_CLIENT_TIMEOUT_MS });
}

function refineDream(dreamText, dreamResult, answer, callback) {
  return callCloudFunction('interpretDream', {
    refineDream: true,
    dreamText: dreamText || '',
    dreamResult: dreamResult || {},
    answer: answer || ''
  }, callback);
}

function aiHealth(callback) {
  return callCloudFunction('interpretDream', { healthCheck: true }, callback);
}

function aiSmokeTest(callback) {
  return callCloudFunction('interpretDream', { smokeTest: true }, callback);
}

function trackEvent(event, callback) {
  return callCloudFunction('trackEvent', { event: event }, callback);
}

function flushEvents(events, callback) {
  return callCloudFunction('trackEvent', { events: events || [] }, callback);
}

function cloudHealth(callback) {
  return callCloudFunction('cloudHealth', {}, callback);
}

function resolveCloudImage(fileId, imageUrl, callback) {
  function errorMessage(prefix, error) {
    var detail = error && error.errMsg ? error.errMsg : error || 'failed';
    return prefix + ':' + String(detail).slice(0, 240);
  }

  function finishWithRemote(url, downloadError, refreshError) {
    if (!url || !wx.getImageInfo) {
      if (callback) callback('', [downloadError, refreshError, 'missing_image_url'].filter(Boolean).join(';'));
      return;
    }

    wx.getImageInfo({
      src: url,
      success: function (info) {
        if (callback) callback(info && info.path ? info.path : '', '');
      },
      fail: function (error) {
        var remoteError = errorMessage('remote_load', error || 'get_image_info_failed');
        if (callback) callback('', [downloadError, refreshError, remoteError].filter(Boolean).join(';'));
      }
    });
  }

  function refreshTempUrl(downloadError) {
    if (!fileId || !wx.cloud || !wx.cloud.getTempFileURL) {
      finishWithRemote(imageUrl, downloadError);
      return;
    }
    wx.cloud.getTempFileURL({
      fileList: [fileId],
      success: function (res) {
        var item = res && res.fileList && res.fileList[0];
        var statusMissing = item && (item.status === undefined || item.status === null || item.status === '');
        var freshUrl = item && item.tempFileURL && (statusMissing || Number(item.status) === 0)
          ? item.tempFileURL
          : '';
        if (freshUrl) {
          finishWithRemote(freshUrl, downloadError);
          return;
        }
        finishWithRemote(imageUrl, downloadError, 'temp_url:' + (item && item.status !== undefined ? String(item.status) : 'missing'));
      },
      fail: function (error) {
        finishWithRemote(imageUrl, downloadError, errorMessage('temp_url', error));
      }
    });
  }

  if (!cloudReady) {
    initCloud();
  }

  if (!fileId || !cloudReady || !hasCloud() || !wx.cloud.downloadFile) {
    finishWithRemote(imageUrl, 'cloud_download:unavailable');
    return false;
  }

  wx.cloud.downloadFile({
    fileID: fileId,
    success: function (res) {
      var path = res && (res.tempFilePath || res.filePath);
      if (callback) callback(path || '', path ? '' : 'download_missing_path');
    },
    fail: function (error) {
      refreshTempUrl(errorMessage('cloud_download', error || 'failed'));
    }
  });

  return true;
}

module.exports = {
  CLOUD_STATUS_KEY: CLOUD_STATUS_KEY,
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  initCloud: initCloud,
  getIdentity: getIdentity,
  saveProfile: saveProfile,
  getProfileMemory: getProfileMemory,
  generateProfilePortrait: generateProfilePortrait,
  saveProfilePortrait: saveProfilePortrait,
  confirmProfilePortrait: confirmProfilePortrait,
  rejectProfilePortrait: rejectProfilePortrait,
  toggleProfilePortrait: toggleProfilePortrait,
  restoreProfilePortrait: restoreProfilePortrait,
  saveDream: saveDream,
  getDreamArchive: getDreamArchive,
  getFeedbackStats: getFeedbackStats,
  getInternalStats: getInternalStats,
  deleteDream: deleteDream,
  getRevisit: getRevisit,
  answerRevisit: answerRevisit,
  skipRevisit: skipRevisit,
  addLifeNote: addLifeNote,
  confirmDreamConnection: confirmDreamConnection,
  deleteLifeNote: deleteLifeNote,
  getLifeNotes: getLifeNotes,
  editLifeNote: editLifeNote,
  editSymbol: editSymbol,
  createShareCard: createShareCard,
  getShareCard: getShareCard,
  generateDreamImage: generateDreamImage,
  startDreamImageQuality: startDreamImageQuality,
  pollDreamImageQuality: pollDreamImageQuality,
  imageHealth: imageHealth,
  imageSmokeTest: imageSmokeTest,
  interpretDream: interpretDream,
  metaphysicalReading: metaphysicalReading,
  speechRecognize: speechRecognize,
  recognizeSpeech: recognizeSpeech,
  SPEECH_UPLOAD_MIN_SECONDS: SPEECH_UPLOAD_MIN_SECONDS,
  chatAboutDream: chatAboutDream,
  refineDream: refineDream,
  aiHealth: aiHealth,
  aiSmokeTest: aiSmokeTest,
  trackEvent: trackEvent,
  flushEvents: flushEvents,
  cloudHealth: cloudHealth,
  resolveCloudImage: resolveCloudImage
};
