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

function saveDream(dream, callback) {
  return callCloudFunction('saveDream', { dream: dream }, callback);
}

function deleteDream(dreamId, callback) {
  return callCloudFunction('saveDream', {
    action: 'delete',
    dreamId: dreamId || ''
  }, callback);
}

function createShareCard(dream, imageFileId, callback) {
  return callCloudFunction('createShareCard', {
    dream: dream,
    imageFileId: imageFileId || ''
  }, callback);
}

function getShareCard(shareId, callback) {
  return callCloudFunction('getShareCard', { shareId: shareId || '' }, callback);
}

function generateDreamImage(prompt, dreamId, theme, callback) {
  if (typeof theme === 'function') {
    callback = theme;
    theme = 'mist';
  }
  return callCloudFunction('generateDreamImage', {
    prompt: prompt || '',
    dreamId: dreamId || '',
    theme: theme || 'mist'
  }, callback);
}

function imageHealth(callback) {
  return callCloudFunction('generateDreamImage', { healthCheck: true }, callback);
}

function imageSmokeTest(callback) {
  return callCloudFunction('generateDreamImage', {
    prompt: 'vertical 3:4 tarot-inspired illustration panel, moon, silver key, vintage ink watercolor, no frame, no text',
    dreamId: 'diagnostics-smoke-test',
    theme: 'moon'
  }, callback);
}

function interpretDream(dreamText, profile, cardIndex, callback) {
  return callCloudFunction('interpretDream', {
    dreamText: dreamText,
    profile: profile || {},
    cardIndex: cardIndex || 1
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
  function finishWithRemote(downloadError) {
    if (!imageUrl || !wx.getImageInfo) {
      if (callback) callback('', downloadError || 'missing_image_url');
      return;
    }

    wx.getImageInfo({
      src: imageUrl,
      success: function (info) {
        if (callback) callback(info && info.path ? info.path : '', '');
      },
      fail: function (error) {
        var message = error && error.errMsg ? error.errMsg : downloadError || 'get_image_info_failed';
        if (callback) callback('', message);
      }
    });
  }

  if (!cloudReady) {
    initCloud();
  }

  if (!fileId || !cloudReady || !hasCloud() || !wx.cloud.downloadFile) {
    finishWithRemote();
    return false;
  }

  wx.cloud.downloadFile({
    fileID: fileId,
    success: function (res) {
      var path = res && (res.tempFilePath || res.filePath);
      if (callback) callback(path || '', path ? '' : 'download_missing_path');
    },
    fail: function (error) {
      finishWithRemote(error && error.errMsg ? error.errMsg : 'cloud_download_failed');
    }
  });

  return true;
}

function uploadShareCard(dreamId, filePath, callback) {
  if (!cloudReady) {
    initCloud();
  }

  if (!cloudReady || !hasCloud() || !wx.cloud.uploadFile || !filePath) {
    if (callback) {
      callback(null);
    }
    return false;
  }

  wx.cloud.uploadFile({
    cloudPath: 'share-cards/' + String(dreamId || 'dream') + '-' + String(Date.now()) + '.png',
    filePath: filePath,
    success: function (res) {
      if (callback) {
        callback(res);
      }
    },
    fail: function () {
      if (callback) {
        callback(null);
      }
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
  saveDream: saveDream,
  deleteDream: deleteDream,
  createShareCard: createShareCard,
  getShareCard: getShareCard,
  generateDreamImage: generateDreamImage,
  imageHealth: imageHealth,
  imageSmokeTest: imageSmokeTest,
  interpretDream: interpretDream,
  chatAboutDream: chatAboutDream,
  aiHealth: aiHealth,
  aiSmokeTest: aiSmokeTest,
  trackEvent: trackEvent,
  flushEvents: flushEvents,
  cloudHealth: cloudHealth,
  resolveCloudImage: resolveCloudImage,
  uploadShareCard: uploadShareCard
};
