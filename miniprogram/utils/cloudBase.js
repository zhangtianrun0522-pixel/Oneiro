var CLOUD_STATUS_KEY = 'oneiro:cloudStatus';
var CLOUD_ENV_ID = 'cloud1-d9gb0sjvg6a8d9864';
var LOCAL_ID_KEY = 'oneiro:localOpenId';
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

function callCloudFunction(name, data, callback) {
  if (!cloudReady) {
    initCloud();
  }

  if (!cloudReady || !hasCloud()) {
    if (callback) {
      callback({
        ok: false,
        reason: 'cloud_unavailable',
        functionName: name,
        message: 'wx.cloud is unavailable or not initialized'
      });
    }
    return false;
  }

  wx.cloud.callFunction({
    name: name,
    data: data || {},
    success: function (res) {
      if (callback) {
        callback(res && res.result ? res.result : res);
      }
    },
    fail: function (error) {
      var message = error && error.errMsg ? error.errMsg : 'cloud function call failed';
      var reason = /-404010|result expired|timeout for result fetching/.test(message)
        ? 'cloud_result_expired'
        : 'cloud_call_failed';

      if (callback) {
        callback({
          ok: false,
          reason: reason,
          functionName: name,
          message: reason === 'cloud_result_expired'
            ? '等待云函数结果时小程序进入后台或等待过久，结果已过期。请保持当前页面打开后重试。'
            : message
        });
      }
    }
  });

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

function generateProfilePortrait(changeReason, callback) {
  return profileMemory('generate', { changeReason: changeReason || '' }, callback);
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

function addLifeNote(dreamId, text, callback) {
  return callCloudFunction('saveDream', {
    action: 'addLifeNote',
    dreamId: dreamId || '',
    text: text || ''
  }, callback);
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
  }, callback);
}

function speechRecognize(audioBase64, duration, callback) {
  return callCloudFunction('speechRecognize', {
    audioBase64: audioBase64 || '',
    format: 'mp3',
    duration: Number(duration) || 0
  }, callback);
}

function chatAboutDream(dreamText, dreamResult, messages, userMessage, callback) {
  return callCloudFunction('interpretDream', {
    chatAboutDream: true,
    dreamText: dreamText || '',
    dreamResult: dreamResult || {},
    messages: messages || [],
    userMessage: userMessage || ''
  }, callback);
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
  deleteDream: deleteDream,
  getRevisit: getRevisit,
  answerRevisit: answerRevisit,
  skipRevisit: skipRevisit,
  addLifeNote: addLifeNote,
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
  speechRecognize: speechRecognize,
  chatAboutDream: chatAboutDream,
  refineDream: refineDream,
  aiHealth: aiHealth,
  aiSmokeTest: aiSmokeTest,
  trackEvent: trackEvent,
  flushEvents: flushEvents,
  cloudHealth: cloudHealth,
  resolveCloudImage: resolveCloudImage
};
