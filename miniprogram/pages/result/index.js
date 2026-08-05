var acceptanceDream = require('../../utils/acceptanceDream');
var acceptanceDreamResult = acceptanceDream.acceptanceDreamResult;
var acceptanceDreamText = acceptanceDream.acceptanceDreamText;
var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var tabNav = require('../../utils/tabNav');
var syncQueue = require('../../utils/syncQueue');

var FEEDBACK_OPTIONS = [
  { value: 'inspiring', label: '有感觉' },
  { value: 'too_generic', label: '有点泛' },
  { value: 'too_mystical', label: '太玄了' },
  { value: 'not_grounded', label: '不贴合' }
];

var CARD_WIDTH = 900;
var CARD_HEIGHT = 1200;
var READING_CARD_HEIGHT = 2300;
var QUALITY_POLL_INTERVAL_MS = 3000;
var QUALITY_POLL_MAX_ATTEMPTS = 60;
var themePalettes = {
  tide: {
    stops: ['#102832', '#356f78', '#d5e8df'],
    moon: 'rgba(246, 240, 209, 0.86)',
    shelf: 'rgba(220, 242, 235, 0.22)',
    shelfLine: 'rgba(220, 242, 235, 0.18)',
    water: 'rgba(186, 228, 224, 0.42)',
    key: '#d7e8c9',
    bird: 'rgba(247, 250, 252, 0.7)'
  },
  threshold: {
    stops: ['#1c2130', '#73634a', '#ead9aa'],
    moon: 'rgba(249, 219, 152, 0.82)',
    shelf: 'rgba(255, 230, 180, 0.2)',
    shelfLine: 'rgba(255, 230, 180, 0.18)',
    water: 'rgba(234, 217, 170, 0.26)',
    key: '#f1c979',
    bird: 'rgba(255, 236, 199, 0.64)'
  },
  shadow: {
    stops: ['#0d0f16', '#273049', '#a8b2c3'],
    moon: 'rgba(246, 240, 209, 0.54)',
    shelf: 'rgba(190, 204, 226, 0.18)',
    shelfLine: 'rgba(190, 204, 226, 0.16)',
    water: 'rgba(88, 104, 135, 0.28)',
    key: '#c3c8d7',
    bird: 'rgba(184, 194, 214, 0.54)'
  },
  falling: {
    stops: ['#191729', '#555070', '#ead0be'],
    moon: 'rgba(246, 240, 209, 0.58)',
    shelf: 'rgba(226, 216, 231, 0.2)',
    shelfLine: 'rgba(226, 216, 231, 0.16)',
    water: 'rgba(230, 195, 190, 0.32)',
    key: '#e7c5b5',
    bird: 'rgba(247, 250, 252, 0.62)'
  },
  archive: {
    stops: ['#172033', '#5c6573', '#e0d8c4'],
    moon: 'rgba(246, 240, 209, 0.82)',
    shelf: 'rgba(224, 216, 196, 0.26)',
    shelfLine: 'rgba(224, 216, 196, 0.2)',
    water: 'rgba(199, 207, 211, 0.28)',
    key: '#e6d39a',
    bird: 'rgba(247, 250, 252, 0.7)'
  },
  hearth: {
    stops: ['#201819', '#755243', '#efd2a6'],
    moon: 'rgba(249, 219, 152, 0.82)',
    shelf: 'rgba(255, 230, 180, 0.2)',
    shelfLine: 'rgba(255, 230, 180, 0.18)',
    water: 'rgba(222, 156, 106, 0.24)',
    key: '#f1c979',
    bird: 'rgba(255, 236, 199, 0.64)'
  },
  moon: {
    stops: ['#10182b', '#3e517a', '#dfe7f1'],
    moon: 'rgba(246, 240, 209, 0.92)',
    shelf: 'rgba(216, 231, 239, 0.24)',
    shelfLine: 'rgba(216, 231, 239, 0.2)',
    water: 'rgba(196, 220, 231, 0.32)',
    key: '#efe0a0',
    bird: 'rgba(247, 250, 252, 0.8)'
  },
  mist: {
    stops: ['#18202a', '#68737c', '#e4e4dc'],
    moon: 'rgba(246, 240, 209, 0.78)',
    shelf: 'rgba(216, 231, 239, 0.22)',
    shelfLine: 'rgba(216, 231, 239, 0.18)',
    water: 'rgba(211, 220, 218, 0.3)',
    key: '#e8d99b',
    bird: 'rgba(247, 250, 252, 0.68)'
  }
};

function findDreamById(id) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  var targetId;
  var i;

  try {
    targetId = decodeURIComponent(id || '');
  } catch (error) {
    return null;
  }

  for (i = 0; i < archive.length; i += 1) {
    if (archive[i].id === targetId) {
      return archive[i];
    }
  }

  return null;
}

function normalizeDreamId(id) {
  try {
    return decodeURIComponent(id || '');
  } catch (error) {
    return '';
  }
}

function hasMatchingDreamId(dream, id) {
  return !!dream && dream.id === id;
}

function persistLocalDream(dream) {
  var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
  wx.setStorageSync('oneiro:dreamArchive', archive.map(function (item) {
    return item.id === dream.id ? dream : item;
  }));
}

function cardIndexForDream(dream) {
  var archive = (wx.getStorageSync('oneiro:dreamArchive') || []).slice().sort(function (a, b) {
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  var index = archive.findIndex(function (item) {
    return item && dream && item.id === dream.id;
  });
  return index >= 0 ? index + 1 : 1;
}

function imageFailureMessage(reason) {
  var value = String(reason || '').toLowerCase();
  if (/timeout|timed_out|provider_timeout/.test(value)) {
    return '画面生成超时了，点击重试';
  }
  if (/temp[_-]?url|download|image_load|load_failed/.test(value)) {
    return '图片加载失败，点击重试';
  }
  if (/cloud_unavailable|cloud_call_failed|cloud_result_expired|network|offline/.test(value)) {
    return '网络暂时不可用，稍后重试';
  }
  return '画面暂时没生成出来，点击重试';
}

function imageFailureDetails(response, fallbackReason) {
  var reason = String((response && response.reason) || fallbackReason || 'image_generation_failed').slice(0, 300);
  var message = String((response && response.message) || '').trim().slice(0, 300);
  return {
    reason: reason,
    message: message,
    displayMessage: message || (imageFailureMessage(reason) + '（' + reason + '）'),
    provider: String((response && response.provider) || '')
  };
}

function syncFailureDetails(response) {
  var reason = String((response && response.reason) || 'cloud_sync_pending').slice(0, 300);
  var message = String((response && response.message) || '').trim().slice(0, 300);
  return {
    reason: reason,
    message: message,
    displayMessage: message || ('云端同步未完成（' + reason + '），点击重试')
  };
}

function queueDreamSync(dream) {
  if (!dream || !dream.id) return;
  syncQueue.enqueue('dream_sync', { dream: dream });
}

function removeDreamSync(dream) {
  if (!dream || !dream.id || !syncQueue.removeByKey) return;
  syncQueue.removeByKey('dream:' + String(dream.id));
}

// 云函数没返回 memoryEcho（旧版本云函数、或走了降级分支）时给出 0/0，
// 这样诊断页的分母只统计真正上报过这个信号的解读。
function normalizeMemoryEcho(value) {
  var echo = value && typeof value === 'object' ? value : {};
  var offered = Number(echo.offered);
  var used = Number(echo.used);
  return {
    offered: isFinite(offered) && offered > 0 ? offered : 0,
    used: isFinite(used) && used > 0 ? used : 0
  };
}

function normalizeInterpretationDiagnostics(response) {
  var value = response || {};
  var nested = value.diagnostics && typeof value.diagnostics === 'object' ? value.diagnostics : {};
  return {
    code: String(value.errorCode || value.error_code || value.providerErrorCode || nested.code || value.reason || '').slice(0, 80),
    provider: String(value.provider || nested.provider || '').slice(0, 80),
    model: String(value.model || nested.model || '').slice(0, 120),
    requestTimeoutMs: Number(value.requestTimeoutMs || nested.requestTimeoutMs || 0),
    elapsedMs: Number(value.elapsedMs || nested.elapsedMs || 0),
    providerError: String(value.provider_error || nested.providerError || '').slice(0, 240)
  };
}

function connectionTexts(result) {
  var value = result || {};
  if (Array.isArray(value.possible_connections) && value.possible_connections.length) {
    return value.possible_connections.filter(Boolean);
  }
  return [value.mirror].filter(Boolean);
}

function hasMetaphysicalReading(result) {
  var value = result || {};
  var reading = value.metaphysical_reading || {};
  return !!(value.metaphysical_resonance || value.metaphysical_basis ||
    reading.temperament || reading.dream_echo || reading.tension || reading.rhythm || reading.basis);
}

// Object.assign 把「键存在但值为空」也算作一次有效覆盖。而
// app.globalData.lastProfile 的默认值恰好是五个空字符串俱全的对象，于是 App
// 每次冷启动后，它都会把 storage 里真实填好的出生资料整个抹平。
//
// 这就是「资料页明明填了、命理视角却说没填」的原因：资料页读的是 storage，
// 显示正常；命理视角走这里合并，拿到的是一份全空资料，于是报「缺少出生日期、
// 出生时间、出生城市」——用户三样都填过，却被要求去补。
//
// 合并必须按「非空者优先」，空值永远不能覆盖已有值。
function mergeProfileSources() {
  var merged = {};
  Array.prototype.forEach.call(arguments, function (source) {
    if (!source || typeof source !== 'object') return;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (value === '' || value === null || value === undefined) return;
      merged[key] = value;
    });
  });
  return merged;
}

function metaphysicalProfileFromDream(dream) {
  var app = getApp();
  var stored = wx.getStorageSync('oneiro:lastProfile') || {};
  return mergeProfileSources(
    app && app.globalData ? app.globalData.lastProfile : null,
    stored,
    dream && dream.profile && typeof dream.profile === 'object' ? dream.profile : null
  );
}

// These responses can mean that the cloud function returned before the
// provider job settled. Retrying them must resume the deterministic job, not
// allocate a second paid image request.
function isResumableImageFailure(reason) {
  return /primary_generation_pending|cloud_result_expired|cloud_call_failed/.test(String(reason || '').toLowerCase());
}

function scrubLocalPortraitSource(dreamId) {
  var state = wx.getStorageSync('oneiro:profileMemory') || {};
  var changed = false;
  function scrub(snapshot) {
    if (!snapshot) return snapshot;
    var refs = Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : [];
    var hit = refs.some(function (ref) {
      return ref && (ref.sourceType === 'dream_entries' || ref.type === 'dream') && String(ref.sourceLocalId || ref.sourceId || ref.id || '') === dreamId;
    });
    if (!hit) return snapshot;
    changed = true;
    return Object.assign({}, snapshot, {
      stale: true,
      staleReason: 'source_dream_deleted',
      useInFutureReadings: false,
      summary: '画像来源已发生变化，请根据当前资料重新生成。',
      traits: [],
      themes: [],
      realLifeContext: [],
      sourceRefs: refs.filter(function (ref) {
        return !(ref && (ref.sourceType === 'dream_entries' || ref.type === 'dream') && String(ref.sourceLocalId || ref.sourceId || ref.id || '') === dreamId);
      }),
      aiOriginal: null
    });
  }
  state.current = scrub(state.current);
  state.latestDraft = scrub(state.latestDraft);
  state.history = (Array.isArray(state.history) ? state.history : []).map(scrub);
  if (changed) wx.setStorageSync('oneiro:profileMemory', state);
}

function formatCardTimestamp(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  var hour = date.getHours();
  var minute = date.getMinutes();
  month = month < 10 ? '0' + month : String(month);
  day = day < 10 ? '0' + day : String(day);
  hour = hour < 10 ? '0' + hour : String(hour);
  minute = minute < 10 ? '0' + minute : String(minute);
  return year + '.' + month + '.' + day + ' · ' + hour + ':' + minute;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, color) {
  drawRoundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function fillEllipse(ctx, x, y, radiusX, radiusY, startAngle, endAngle, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.scale(radiusX, radiusY);
  ctx.beginPath();
  ctx.arc(0, 0, 1, startAngle, endAngle);
  ctx.fill();
  ctx.restore();
}

function getThemePalette(theme) {
  return themePalettes[theme] || themePalettes.mist;
}

function drawDreamArt(ctx, theme, imagePath, rect) {
  var art = rect || { x: 96, y: 154, width: 558, height: 610, radius: 28 };
  var palette = getThemePalette(theme);
  var gradient = ctx.createLinearGradient(art.x, art.y, art.x + art.width, art.y + art.height);
  gradient.addColorStop(0, palette.stops[0]);
  gradient.addColorStop(0.62, palette.stops[1]);
  gradient.addColorStop(1, palette.stops[2]);

  ctx.save();
  drawRoundRect(ctx, art.x, art.y, art.width, art.height, art.radius || 28);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(art.x, art.y, art.width, art.height);

  if (imagePath) {
    drawImageCover(ctx, imagePath, art.x, art.y, art.width, art.height, palette.stops[0]);
    ctx.restore();
    return;
  }

  ctx.fillStyle = palette.moon;
  ctx.beginPath();
  ctx.arc(art.x + art.width * 0.78, art.y + art.height * 0.12, art.width * 0.13, 0, Math.PI * 2);
  ctx.fill();

  drawShelf(ctx, art.x + art.width * 0.22, art.y + art.height * 0.28, palette, art.width * 0.22, art.height * 0.42);
  drawShelf(ctx, art.x + art.width * 0.52, art.y + art.height * 0.28, palette, art.width * 0.22, art.height * 0.42);

  fillEllipse(
    ctx,
    art.x + art.width * 0.5,
    art.y + art.height * 0.98,
    art.width * 0.62,
    art.height * 0.18,
    Math.PI,
    Math.PI * 2,
    palette.water
  );
  ctx.fillRect(art.x - art.width * 0.06, art.y + art.height * 0.82, art.width * 1.12, art.height * 0.22);

  ctx.save();
  ctx.translate(art.x + art.width * 0.48, art.y + art.height * 0.72);
  ctx.rotate(-Math.PI / 4.5);
  ctx.fillStyle = palette.key;
  fillRoundRect(ctx, -art.width * 0.1, -art.height * 0.025, art.width * 0.21, art.height * 0.055, art.height * 0.025, palette.key);
  ctx.beginPath();
  ctx.arc(art.width * 0.1, -art.height * 0.018, art.width * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(art.x + art.width * 0.76, art.y + art.height * 0.46);
  ctx.rotate(-Math.PI / 12);
  fillEllipse(ctx, 0, 0, art.width * 0.13, art.height * 0.035, Math.PI, Math.PI * 2, palette.bird);
  ctx.restore();

  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height, background) {
  var imageWidth = image.width || image.naturalWidth || 0;
  var imageHeight = image.height || image.naturalHeight || 0;
  var scale;
  var drawWidth;
  var drawHeight;
  var drawX;
  var drawY;

  ctx.fillStyle = background || '#172033';
  ctx.fillRect(x, y, width, height);

  if (!imageWidth || !imageHeight) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }

  scale = Math.max(width / imageWidth, height / imageHeight);
  drawWidth = imageWidth * scale;
  drawHeight = imageHeight * scale;
  drawX = x + (width - drawWidth) / 2;
  drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawLeftWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  var content = text || '';
  var line = '';
  var lines = [];
  var i;

  for (i = 0; i < content.length; i += 1) {
    var nextLine = line + content[i];
    if (ctx.measureText(nextLine).width > maxWidth && line) {
      lines.push(line);
      line = content[i];
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
  }

  ctx.textAlign = 'left';
  for (i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}

function drawShelf(ctx, x, y, palette, width, height) {
  var shelfWidth = width || 148;
  var shelfHeight = height || 330;
  ctx.strokeStyle = palette.shelf;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + shelfHeight);
  ctx.moveTo(x + shelfWidth, y);
  ctx.lineTo(x + shelfWidth, y + shelfHeight);
  ctx.stroke();

  ctx.strokeStyle = palette.shelfLine;
  ctx.beginPath();
  ctx.moveTo(x, y + shelfHeight / 3);
  ctx.lineTo(x + shelfWidth, y + shelfHeight / 3);
  ctx.moveTo(x, y + shelfHeight * 2 / 3);
  ctx.lineTo(x + shelfWidth, y + shelfHeight * 2 / 3);
  ctx.stroke();
}

function drawSymbols(ctx, symbols, startY) {
  var rows = [];
  var row = [];
  var rowWidth = 0;
  var maxWidth = 630;
  var gap = 14;
  var i;

  ctx.font = '700 24px sans-serif';

  for (i = 0; i < symbols.length; i += 1) {
    var label = symbols[i];
    var width = ctx.measureText(label).width + 42;
    if (row.length && rowWidth + gap + width > maxWidth) {
      rows.push({ items: row, width: rowWidth });
      row = [];
      rowWidth = 0;
    }
    row.push({ label: label, width: width });
    rowWidth += width + (row.length > 1 ? gap : 0);
  }

  if (row.length) {
    rows.push({ items: row, width: rowWidth });
  }

  for (i = 0; i < rows.length; i += 1) {
    var x = (CARD_WIDTH - rows[i].width) / 2;
    var j;
    for (j = 0; j < rows[i].items.length; j += 1) {
      var item = rows[i].items[j];
      fillRoundRect(ctx, x, startY + i * 58, item.width, 40, 20, 'rgba(23, 32, 51, 0.035)');
      ctx.strokeStyle = 'rgba(23, 32, 51, 0.08)';
      ctx.lineWidth = 1;
      drawRoundRect(ctx, x, startY + i * 58, item.width, 40, 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(23, 32, 51, 0.56)';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, x + item.width / 2, startY + i * 58 + 27);
      x += item.width + gap;
    }
  }

  return startY + rows.length * 58;
}

function drawCard(ctx, dream, displayTimestamp, imagePath) {
  var result = dream.result || acceptanceDreamResult;
  var artRect = { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, radius: 0 };
  var overlay;

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawDreamArt(ctx, result.card_theme || 'mist', imagePath, artRect);

  overlay = ctx.createLinearGradient(0, 0, 0, 180);
  overlay.addColorStop(0, 'rgba(5, 6, 9, 0.38)');
  overlay.addColorStop(1, 'rgba(5, 6, 9, 0)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, 180);

  ctx.save();
  ctx.shadowColor = 'rgba(5, 6, 9, 0.52)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '800 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ONEIRO', 54, 62);

  ctx.textAlign = 'right';
  ctx.fillText(result.card_no || 'NO. 001', 846, 58);
  ctx.font = '600 20px sans-serif';
  ctx.fillText(displayTimestamp, 846, 92);
  ctx.restore();
}

function drawReadingPanel(ctx, label, text, x, y, width, maxLines) {
  var panelHeight = 120 + (maxLines || 3) * 42;
  var bottomY;

  fillRoundRect(ctx, x, y, width, panelHeight, 30, 'rgba(245, 241, 232, 0.78)');
  ctx.fillStyle = 'rgba(23, 32, 51, 0.38)';
  ctx.font = '900 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 36, y + 48);
  ctx.fillStyle = 'rgba(23, 32, 51, 0.68)';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'left';
  bottomY = drawLeftWrappedText(ctx, text || '', x + 36, y + 94, width - 72, 42, maxLines || 3);

  return Math.max(y + panelHeight + 26, bottomY + 48);
}

function drawFullReadingCard(ctx, dream, displayTimestamp, imagePath) {
  var result = dream.result || acceptanceDreamResult;
  var y;

  ctx.clearRect(0, 0, CARD_WIDTH, READING_CARD_HEIGHT);
  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, 0, CARD_WIDTH, READING_CARD_HEIGHT);

  drawCard(ctx, dream, displayTimestamp, imagePath);

  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, CARD_HEIGHT, CARD_WIDTH, READING_CARD_HEIGHT - CARD_HEIGHT);

  ctx.fillStyle = 'rgba(23, 32, 51, 0.18)';
  ctx.font = '900 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DREAM READING', CARD_WIDTH / 2, CARD_HEIGHT + 62);

  y = CARD_HEIGHT + 106;
  y = drawReadingPanel(ctx, '梦里发生了什么', (result.reading_hook || '') + '\n' + result.dream_translation, 72, y, 756, 5);
  if (connectionTexts(result).length) {
    y = drawReadingPanel(ctx, '可能触及的现实', connectionTexts(result).join('\n'), 72, y, 756, 5);
  }

  fillRoundRect(ctx, 72, y, 756, 142, 30, 'rgba(23, 32, 51, 0.06)');
  ctx.fillStyle = 'rgba(23, 32, 51, 0.38)';
  ctx.font = '900 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('继续这个梦', 108, y + 46);
  ctx.fillStyle = '#172033';
  ctx.font = '800 28px sans-serif';
  ctx.textAlign = 'left';
  drawLeftWrappedText(ctx, '打开 Oneiro，聊聊这个梦与你想到的现实片段。', 108, y + 90, 684, 40, 2);

  ctx.fillStyle = 'rgba(23, 32, 51, 0.26)';
  ctx.font = '800 22px sans-serif';
  ctx.fillText('Oneiro · ' + displayTimestamp, CARD_WIDTH / 2, READING_CARD_HEIGHT - 56);
}

function cardBackInsight(result) {
  if (!result) return '';
  if (result.reflection_answer && result.card_insight) return result.card_insight;
  return result.reading_hook || result.emotional_weather || '';
}

Page({
  data: {
    entryReady: false,
    displayTimestamp: formatCardTimestamp(new Date()),
    cardFlipped: false,
    cardBackInsight: '',
    imageStatus: 'idle',
    imageErrorMessage: '',
    imageLoadError: '',
    imageSyncPending: false,
    aiImageFileId: '',
    aiImageLocalPath: '',
    imageQualityStatus: 'idle',
    shareImagePath: '',
    publicShareImagePath: '',
    lastFullReadingPath: '',
    sharePath: '',
    sharePreparing: false,
    cardSaved: false,
    showFullReading: false,
    showMoreActions: false,
    possibleConnections: [],
    feedbackOptions: FEEDBACK_OPTIONS,
    feedback: '',
    cloudSyncPending: false,
    // 同步失败的原因码。横幅只说「未同步」时，用户和我都无从判断是网络、
    // 权限还是这条记录已被删除。
    cloudSyncReason: '',
    cloudRepairing: false,
    qualitySyncPending: false,
    interpretationError: '',
    interpretationErrorCode: '',
    interpretationDiagnostics: null,
    interpretationUnavailable: true,
    metaphysicalEntryVisible: false,
    metaphysicalReadingReady: false,
    metaphysicalReadingLoading: false,
    metaphysicalReadingError: '',
    metaphysicalProfileMissing: false,
    retryingInterpretation: false,
    dream: {
      dreamText: '',
      result: {}
    }
  },

  onLoad: function (options) {
    var app = getApp();
    var requestsFixture = options && options.fixture === '1';
    var isFixture = options && options.fixture === '1' && options.devPreview === '1';
    var hasRouteId = !!(options && Object.prototype.hasOwnProperty.call(options, 'id'));
    var routeDreamId = hasRouteId ? normalizeDreamId(options.id) : '';
    var savedDream = hasRouteId && routeDreamId ? findDreamById(routeDreamId) : null;
    var currentDream = app.globalData.currentDream;
    var matchingCurrentDream = hasRouteId && hasMatchingDreamId(currentDream, routeDreamId)
      ? currentDream
      : null;
    var dream;

    this.entryRouteId = hasRouteId ? routeDreamId : '';
    this.entryIsFixture = isFixture && !hasRouteId;
    this.redirectingHome = false;
    this.setData({ entryReady: false });

    if (requestsFixture && !isFixture) {
      this.redirectHome();
      return;
    }

    if (hasRouteId) {
      dream = savedDream || matchingCurrentDream;
    } else if (isFixture) {
      dream = {
        dreamText: acceptanceDreamText,
        profile: wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile,
        result: JSON.parse(JSON.stringify(acceptanceDreamResult)),
        createdAt: new Date().toISOString()
      };
    } else {
      dream = currentDream;
    }

    if (!dream) {
      this.redirectHome();
      return;
    }

    // Older local records predate explicit interpretation statuses. Only a
    // non-empty result earns this compatibility upgrade; pending/blocked data
    // remains unavailable and cannot reach image generation.
    if (!dream.status && dream.result && typeof dream.result === 'object' && Object.keys(dream.result).length) {
      dream = Object.assign({}, dream, { status: 'ready' });
      persistLocalDream(dream);
    }

    var interpretationUnavailable = dream.status !== 'ready' ||
      !dream.result ||
      typeof dream.result !== 'object' ||
      !Object.keys(dream.result).length;
    if (interpretationUnavailable) {
      this.pendingInterpretationDream = dream;
      dream = Object.assign({}, dream, { result: {
        title: '尚未解读',
        card_no: '',
        card_theme: 'mist',
        symbols: [],
        emotional_weather: '原梦已保存。',
        dream_translation: '原梦已保存，但本次未生成解读。',
        possible_connections: [],
        mirror: '',
        integration_question: ''
      } });
    } else {
      this.pendingInterpretationDream = null;
    }
    var displayTimestamp = dream.createdAt
      ? formatCardTimestamp(new Date(dream.createdAt))
      : this.data.displayTimestamp;
    var metaphysicalProfile = metaphysicalProfileFromDream(dream);
    var metaphysicalReadingReady = hasMetaphysicalReading(dream.result);
    var metaphysicalEntryVisible = !interpretationUnavailable && !metaphysicalReadingReady && (
      dream.result.metaphysicalAvailable === true || !!String(metaphysicalProfile.birthDate || '').trim()
    );
    if (!interpretationUnavailable && !dream.result.card_no) {
      dream.result.card_no = dream.result.card_no || 'NO. 001';
      dream.result.profile_summary = dream.result.profile_summary || '梦境记忆';
    }
    var possibleConnections = Array.isArray(dream.result.possible_connections) && dream.result.possible_connections.length
      ? dream.result.possible_connections
      : [dream.result.mirror].filter(Boolean);
    this.setData({
      dream: dream,
      displayTimestamp: displayTimestamp,
      cardBackInsight: cardBackInsight(dream.result),
      imageQualityStatus: dream.result.image_quality_status || 'idle',
      feedback: dream.feedback || '',
      cloudSyncPending: dream.cloudSynced !== true,
      interpretationError: dream.interpretationError || '',
      interpretationErrorCode: dream.interpretationErrorCode || '',
      interpretationDiagnostics: dream.interpretationDiagnostics || null,
      possibleConnections: possibleConnections,
      metaphysicalEntryVisible: metaphysicalEntryVisible,
      metaphysicalReadingReady: metaphysicalReadingReady,
      metaphysicalReadingError: '',
      metaphysicalProfileMissing: false,
      interpretationUnavailable: interpretationUnavailable,
      entryReady: true
    });
    if (!interpretationUnavailable && !this.entryIsFixture && dream.cloudSynced !== true) {
      this.repairCloudDream(dream);
    }
    this.restoreSavedDreamImage(dream);
    analytics.trackEvent('result_view', {
      dreamId: dream.id || '',
      cardTheme: dream.result.card_theme || 'mist',
      source: isFixture ? 'fixture' : savedDream ? 'archive_or_route' : 'current'
    });
  },

  onReady: function () {
    var that = this;

    if (!this.isEntryValid()) {
      this.redirectHome();
      return;
    }
    if (this.data.interpretationUnavailable) return;

    setTimeout(function () {
      that.requestDreamImage(function () {
        that.renderShareCard({ silent: true });
      });
      that.resumeDreamImageQuality();
    }, 300);
  },

  isEntryValid: function () {
    var currentDream;

    if (this.redirectingHome || !this.data.entryReady) return false;
    if (this.entryIsFixture) return true;

    currentDream = getApp().globalData.currentDream;
    if (this.entryRouteId) {
      return hasMatchingDreamId(this.data.dream, this.entryRouteId) && (
        !!findDreamById(this.entryRouteId) || hasMatchingDreamId(currentDream, this.entryRouteId)
      );
    }

    return hasMatchingDreamId(this.data.dream, currentDream && currentDream.id);
  },

  redirectHome: function () {
    if (this.redirectingHome) return;
    this.redirectingHome = true;
    this.setData({ entryReady: false });
    tabNav.switchTab('pages/home/index');
  },

  retryInterpretation: function () {
    var that = this;
    var dream = this.pendingInterpretationDream || this.data.dream;
    var app = getApp();
    var profile;
    var cardIndex;

    if (this.data.retryingInterpretation || !dream || !dream.dreamText) return;
    profile = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile || {};
    cardIndex = cardIndexForDream(dream);
    dream.interpretationRevision = Math.max(0, Number(dream.interpretationRevision) || 0) + 1;
    this.setData({ retryingInterpretation: true });

    cloudBase.interpretDream(dream.dreamText, profile, cardIndex, function (cloudResult) {
      if (cloudResult && cloudResult.blocked) {
        var blockedDiagnostics = normalizeInterpretationDiagnostics(cloudResult);
        dream.status = 'blocked';
        dream.result = null;
        dream.interpretationError = String(cloudResult.reason || 'cloud_safety').slice(0, 300);
        dream.interpretationErrorCode = blockedDiagnostics.code || dream.interpretationError;
        dream.interpretationDiagnostics = blockedDiagnostics;
        dream.updatedAt = new Date().toISOString();
        that.pendingInterpretationDream = dream;
        persistLocalDream(dream);
        cloudBase.saveDream(dream, function (saveResult) {
          dream.cloudSynced = !!(saveResult && saveResult.ok);
          persistLocalDream(dream);
          if (!dream.cloudSynced) queueDreamSync(dream);
          else removeDreamSync(dream);
        });
        that.setData({
          retryingInterpretation: false,
          dream: Object.assign({}, that.data.dream, { status: 'blocked' }),
          interpretationError: dream.interpretationError,
          interpretationErrorCode: dream.interpretationErrorCode,
          interpretationDiagnostics: dream.interpretationDiagnostics
        });
        analytics.trackEvent('interpretation_retry_blocked', {
          dreamId: dream.id || '',
          reason: dream.interpretationError
        });
        wx.showModal({
          title: '暂不生成梦卡',
          content: cloudResult.message || '这个梦暂不适合生成解读。',
          confirmText: '知道了',
          showCancel: false
        });
        return;
      }

      if (!cloudResult || !cloudResult.ok || !cloudResult.result) {
        var failedDiagnostics = normalizeInterpretationDiagnostics(cloudResult);
        dream.status = 'pending';
        dream.result = null;
        dream.interpretationError = String(
          cloudResult && (cloudResult.reason || cloudResult.message) || 'ai_provider_error'
        ).slice(0, 300);
        dream.interpretationErrorCode = failedDiagnostics.code || 'ai_provider_error';
        dream.interpretationDiagnostics = failedDiagnostics;
        dream.updatedAt = new Date().toISOString();
        that.pendingInterpretationDream = dream;
        persistLocalDream(dream);
        cloudBase.saveDream(dream, function (saveResult) {
          dream.cloudSynced = !!(saveResult && saveResult.ok);
          persistLocalDream(dream);
          if (!dream.cloudSynced) queueDreamSync(dream);
          else removeDreamSync(dream);
        });
        that.setData({
          retryingInterpretation: false,
          interpretationError: dream.interpretationError,
          interpretationErrorCode: dream.interpretationErrorCode,
          interpretationDiagnostics: dream.interpretationDiagnostics
        });
        wx.showToast({ title: '解读暂不可用，请稍后再试', icon: 'none' });
        analytics.trackEvent('interpretation_retry_failed', {
          dreamId: dream.id || '',
          reason: dream.interpretationError
        });
        return;
      }

      var retryMemoryEcho = normalizeMemoryEcho(cloudResult && cloudResult.memoryEcho);
      dream.status = 'ready';
      dream.result = cloudResult.result;
      dream.dreamFacts = cloudResult.result.dream_facts || {
        people: [], places: [], objects: [], actions: [], transitions: [], emotions: [], time_sense: []
      };
      dream.interpretationSource = 'cloud';
      dream.interpretationProvider = cloudResult.provider || 'cloud';
      dream.interpretationError = '';
      dream.interpretationMeta = {
        schemaVersion: cloudResult.schemaVersion || 'dream-entry-v0.2',
        promptVersion: cloudResult.promptVersion || '',
        model: cloudResult.model || '',
        memoryUnavailable: !!cloudResult.memoryUnavailable
      };
      dream.interpretationErrorCode = '';
      dream.interpretationDiagnostics = normalizeInterpretationDiagnostics(cloudResult);
      dream.updatedAt = new Date().toISOString();
      // A newly interpreted result is a new version of the dream. Keep the
      // local card visible, but require this version to reach cloud storage
      // before requesting a generated image.
      dream.cloudSynced = false;
      that.pendingInterpretationDream = null;
      app.globalData.currentDream = dream;
      persistLocalDream(dream);
      cloudBase.saveDream(dream, function (saveResult) {
        dream.cloudSynced = !!(saveResult && saveResult.ok);
        persistLocalDream(dream);
        that.setData({
          dream: dream,
          cloudSyncPending: !dream.cloudSynced,
          interpretationError: dream.interpretationError || '',
          interpretationErrorCode: dream.interpretationErrorCode || '',
          interpretationDiagnostics: dream.interpretationDiagnostics || null
        });
        if (dream.cloudSynced) {
          removeDreamSync(dream);
          that.requestDreamImage();
          return;
        }
        var failure = syncFailureDetails(saveResult);
        that.setData({
          imageStatus: 'idle',
          cloudSyncPending: true,
          cloudSyncReason: failure.reason
        });
        analytics.trackEvent('generated_image_sync_fail', {
          dreamId: dream.id || '', reason: failure.reason, message: failure.message
        });
        queueDreamSync(dream);
        wx.showToast({ title: '云端同步未完成，稍后自动重试', icon: 'none' });
      });
      that.setData({
        retryingInterpretation: false,
        interpretationUnavailable: false,
        dream: dream,
        cardBackInsight: cardBackInsight(dream.result),
        possibleConnections: connectionTexts(dream.result),
        imageQualityStatus: dream.result.image_quality_status || 'idle'
      });
      analytics.trackEvent('interpretation_retry_success', {
        dreamId: dream.id || '',
        provider: cloudResult.provider || '',
        memoryEchoOffered: retryMemoryEcho.offered,
        memoryEchoUsed: retryMemoryEcho.used
      });
    });
  },

  openMetaphysicalReading: function () {
    var that = this;
    var app = getApp();
    var dream = this.data.dream;
    var profile;
    var baseResult;

    if (this.data.metaphysicalProfileMissing) {
      tabNav.switchTab('pages/profile/index');
      return;
    }
    if (this.data.metaphysicalReadingLoading || !dream || !dream.dreamText || !dream.result) return;

    profile = metaphysicalProfileFromDream(dream);
    baseResult = {
      title: dream.result.title || '',
      symbols: Array.isArray(dream.result.symbols) ? dream.result.symbols.slice(0, 5) : [],
      dream_translation: dream.result.dream_translation || '',
      underneath: dream.result.underneath || ''
    };
    this.setData({
      metaphysicalReadingLoading: true,
      metaphysicalReadingError: ''
    });
    analytics.trackEvent('metaphysical_reading_open', { dreamId: dream.id || '' });

    cloudBase.metaphysicalReading(dream.dreamText, profile, baseResult, function (cloudResult) {
      if (!cloudResult || !cloudResult.ok) {
        var reason = String(cloudResult && cloudResult.reason || 'unknown').slice(0, 120);
        // 城市认不出来和资料没填是两回事。以前都显示成「先补充出生日期、时间和
        // 城市」，三样都填过的用户只能反复确认自己已经填了。云函数现在会把真正
        // 的原因和可操作的提示一起带回来，直接用它。
        var placeUnresolved = reason === 'birth_place_unresolved';
        var missingProfile = reason === 'birth_profile_missing' || placeUnresolved;
        var serverMessage = String(cloudResult && cloudResult.message || '').slice(0, 160);
        that.setData({
          metaphysicalReadingLoading: false,
          metaphysicalReadingError: missingProfile
            ? (serverMessage || '先补充出生日期、时间和城市，再换一个角度看这个梦。')
            : '这次出生节律没有生成，稍后可以再试。',
          metaphysicalProfileMissing: missingProfile
        });
        analytics.trackEvent('metaphysical_reading_failed', {
          dreamId: dream.id || '',
          reason: reason
        });
        return;
      }

      var updatedDream = Object.assign({}, dream, {
        result: Object.assign({}, dream.result, {
          metaphysicalAvailable: true,
          metaphysical_resonance: cloudResult.metaphysical_resonance || '',
          metaphysical_basis: cloudResult.metaphysical_basis || '',
          metaphysical_reading: cloudResult.metaphysical_reading || {}
        }),
        updatedAt: new Date().toISOString(),
        cloudSynced: false
      });
      app.globalData.currentDream = updatedDream;
      persistLocalDream(updatedDream);
      that.setData({
        dream: updatedDream,
        metaphysicalReadingLoading: false,
        metaphysicalReadingReady: true,
        metaphysicalEntryVisible: false,
        metaphysicalReadingError: '',
        metaphysicalProfileMissing: false,
        cloudSyncPending: true
      });
      analytics.trackEvent('metaphysical_reading_done', {
        dreamId: dream.id || '',
        elapsedMs: Number(cloudResult.elapsedMs || 0)
      });

      cloudBase.saveDream(updatedDream, function (saveResult) {
        var synced = !!(saveResult && saveResult.ok);
        updatedDream.cloudSynced = synced;
        persistLocalDream(updatedDream);
        that.setData({
          dream: updatedDream,
          cloudSyncPending: !synced,
          cloudSyncReason: synced ? '' : syncFailureDetails(saveResult).reason
        });
        if (synced) {
          removeDreamSync(updatedDream);
          return;
        }
        queueDreamSync(updatedDream);
      });
    });
  },

  restoreSavedDreamImage: function (dream) {
    var that = this;
    var result = dream && dream.result ? dream.result : {};
    var imageUrl = String(result.imageUrl || '');
    var fileId = String(result.imageFileId || result.image_file_id || result.fileID || result.fileId || '');
    if (!imageUrl && !fileId) return;
    if (fileId && !result.image_file_id) {
      dream.result = Object.assign({}, result, { image_file_id: fileId });
      persistLocalDream(dream);
    }
    this.setData({ imageStatus: 'loading', aiImageFileId: fileId, imageLoadError: '' });
    cloudBase.resolveCloudImage(fileId, imageUrl, function (localPath, loadError) {
      that.setData({
        aiImageLocalPath: localPath || '',
        imageStatus: localPath ? 'ready' : 'failed',
        imageErrorMessage: localPath ? '' : imageFailureMessage(loadError || 'cloud_image_load_failed'),
        imageLoadError: localPath ? '' : String(loadError || 'cloud_image_load_failed').slice(0, 300)
      });
    });
  },

  repairCloudDream: function (dream) {
    var that = this;
    if (!dream || !dream.id || this.cloudRepairing) return;
    this.cloudRepairing = true;
    this.setData({ cloudRepairing: true, cloudSyncPending: true });
    cloudBase.saveDream(dream, function (saveResult) {
      var ok = !!(saveResult && saveResult.ok);
      that.cloudRepairing = false;
      dream.cloudSynced = ok;
      persistLocalDream(dream);
      that.setData({
        dream: dream,
        cloudRepairing: false,
        cloudSyncPending: !ok,
        cloudSyncReason: ok ? '' : syncFailureDetails(saveResult).reason
      });
      if (ok) {
        removeDreamSync(dream);
        if (getApp && getApp().flushPendingSyncTasks) getApp().flushPendingSyncTasks();
      }
      if (!ok) {
        queueDreamSync(dream);
        analytics.trackEvent('dream_cloud_repair_failed', { dreamId: dream.id, reason: saveResult && saveResult.reason || 'unknown' });
      }
    });
  },

  onUnload: function () {
    this.stopDreamImageQualityPolling();
  },

  toggleDreamCard: function () {
    var next = !this.data.cardFlipped;
    this.setData({ cardFlipped: next });
    analytics.trackEvent('dream_card_flip', {
      dreamId: this.data.dream && this.data.dream.id ? this.data.dream.id : '',
      side: next ? 'back' : 'front'
    });
  },

  requestDreamImage: function (done, options) {
    var that = this;
    var dream = this.data.dream;
    var result = this.data.dream.result || {};

    if (this.cloudRepairing) {
      setTimeout(function () { that.requestDreamImage(done, options); }, 300);
      return;
    }
    var prompt = result.image_prompt || result.image || '';

    var hasSavedImage = !!(result.imageUrl || result.image_file_id || result.imageFileId || result.fileID || result.fileId);
    if (hasSavedImage || (!prompt && !result.visual_plan)) {
      if (hasSavedImage && dream.cloudSynced !== true) {
        that.setData({ imageSyncPending: true });
        cloudBase.saveDream(dream, function (saveResult) {
          dream.cloudSynced = !!(saveResult && saveResult.ok);
          persistLocalDream(dream);
          that.setData({
            dream: dream,
            imageSyncPending: !dream.cloudSynced,
            cloudSyncPending: !dream.cloudSynced
          });
          if (!dream.cloudSynced) queueDreamSync(dream);
          if (done) done();
        });
        return;
      }
      if (done) {
        done();
      }
      return;
    }

    var startGeneration = function () {
      that.setData({ imageStatus: 'generating', imageErrorMessage: '' });
      cloudBase.generateDreamImage(
      prompt,
      dream.id || '',
      result.card_theme || 'mist',
      result.visual_plan || null,
      options && options.forceRefresh ? { forceRefresh: true } : null,
      function (imageRes) {
      var currentDream = that.data.dream;

      if (imageRes && imageRes.ok && imageRes.imageUrl) {
        currentDream.result = Object.assign({}, currentDream.result, {
          imageUrl: imageRes.imageUrl,
          image_file_id: imageRes.fileID || '',
          image_provider: imageRes.provider || '',
          image_model: imageRes.model || '',
          image_style_version: imageRes.styleVersion || '',
          image_cache_hit: !!imageRes.cacheHit,
          image_format: imageRes.imageFormat || '',
          image_bytes: Number(imageRes.imageBytes || 0),
          image_visual_plan: imageRes.visualPlan || result.visual_plan || null,
          image_quality_check: imageRes.qualityCheck || null,
          image_quality: 'fast',
          image_quality_status: 'idle',
          image_quality_job_id: '',
          image_generation_token: imageRes.imageGenerationToken || currentDream.result.image_generation_token || '',
          image_refresh_token: imageRes.imageRefreshToken || ''
        });
        currentDream.cloudSynced = false;
        persistLocalDream(currentDream);
        that.setData({
          dream: currentDream,
          aiImageFileId: imageRes.fileID || '',
          imageSyncPending: true
        });
        cloudBase.resolveCloudImage(imageRes.fileID || '', imageRes.imageUrl, function (localPath, loadError) {
          that.setData({
            aiImageLocalPath: localPath || '',
            imageStatus: localPath ? 'ready' : 'failed',
            imageErrorMessage: localPath ? '' : imageFailureMessage(loadError || 'cloud_image_load_failed'),
            imageLoadError: localPath ? '' : String(loadError || 'cloud_image_load_failed').slice(0, 300)
          });
          cloudBase.saveDream(currentDream, function (saveResult) {
            currentDream.cloudSynced = !!(saveResult && saveResult.ok);
            persistLocalDream(currentDream);
            if (currentDream.cloudSynced) {
              that.setData({
                dream: currentDream,
                imageSyncPending: false,
                cloudSyncPending: false,
                imageErrorMessage: localPath ? '' : that.data.imageErrorMessage,
                imageLoadError: localPath ? '' : that.data.imageLoadError
              });
              return;
            }
            var failure = syncFailureDetails(saveResult);
            that.setData({
              dream: currentDream,
              imageSyncPending: true,
              cloudSyncPending: true
            });
            analytics.trackEvent('generated_image_result_sync_fail', {
              dreamId: currentDream.id || '', reason: failure.reason, message: failure.message
            });
            queueDreamSync(currentDream);
            wx.showToast({ title: '云端同步未完成，稍后自动重试', icon: 'none' });
          });
          if (!localPath) {
            analytics.trackEvent('generated_image_load_fail', {
              dreamId: currentDream.id || '',
              reason: String(loadError || 'cloud_image_load_failed').slice(0, 180)
            });
          }
          if (done) {
            done();
          }
          if (localPath) {
            that.startDreamImageQuality(imageRes, result);
          }
        });
        analytics.trackEvent('generated_image_success', {
          dreamId: currentDream.id || '',
          provider: imageRes.provider || '',
          cacheHit: !!imageRes.cacheHit,
          latencyMs: imageRes.latencyMs || 0
        });
      } else {
        var failure = imageFailureDetails(imageRes, 'image_generation_failed');
        that.setData({
          imageStatus: 'failed',
          imageSyncPending: false,
          imageErrorMessage: failure.displayMessage,
          imageLoadError: failure.reason
        });
        analytics.trackEvent('generated_image_fail', {
          dreamId: currentDream.id || '',
          reason: failure.reason,
          message: failure.message,
          provider: failure.provider
        });
        wx.showToast({ title: failure.displayMessage, icon: 'none' });
        if (done) {
          done();
        }
      }
      }
      );
    };

    if (dream.cloudSynced !== true) {
      dream.cloudSynced = false;
      persistLocalDream(dream);
      cloudBase.saveDream(dream, function (saveResult) {
        if (saveResult && saveResult.ok) {
          dream.cloudSynced = true;
          persistLocalDream(dream);
          that.setData({ dream: dream });
          startGeneration();
          return;
        }
        var failure = syncFailureDetails(saveResult);
        queueDreamSync(dream);
        that.setData({
          imageStatus: 'idle',
          imageSyncPending: false,
          cloudSyncPending: true
        });
        analytics.trackEvent('generated_image_fail', {
          dreamId: dream.id || '',
          reason: failure.reason,
          message: failure.message,
          failureType: 'sync'
        });
        wx.showToast({ title: '云端同步未完成，稍后自动重试', icon: 'none' });
        if (done) done();
      });
      return;
    }

    startGeneration();
  },

  startDreamImageQuality: function (fastImage, visualResult) {
    var that = this;
    var dream = this.data.dream;

    if (!dream || !dream.id || this.data.imageQualityStatus === 'queued' || this.data.imageQualityStatus === 'polling') {
      return;
    }

    this.setData({ imageQualityStatus: 'queued' });
    this.qualityRequestActive = true;
    cloudBase.startDreamImageQuality(dream.id, {
      prompt: visualResult.image_prompt || visualResult.image || '',
      theme: visualResult.card_theme || 'mist',
      visualPlan: visualResult.visual_plan || null,
      fastImageFileId: fastImage.fileID || '',
      fastImageUrl: fastImage.imageUrl || ''
    }, function (startResult) {
      var jobId;

      if (!that.qualityRequestActive) return;

      if (!startResult || !startResult.ok) {
        that.stopDreamImageQualityPolling('unavailable');
        return;
      }

      if (startResult.imageUrl) {
        that.applyDreamImageQuality(startResult);
        return;
      }

      jobId = startResult.jobId || startResult.taskId || startResult.qualityJobId || startResult.id || '';
      if (!jobId) {
        that.stopDreamImageQualityPolling('unavailable');
        return;
      }

      that.qualityJobId = jobId;
      that.qualityPollAttempt = 0;
      var currentDream = that.data.dream;
      currentDream.result = Object.assign({}, currentDream.result, {
        image_quality_job_id: jobId,
        image_quality_status: 'polling'
      });
      currentDream.cloudSynced = false;
      persistLocalDream(currentDream);
        cloudBase.saveDream(currentDream, function (saveResult) {
        currentDream.cloudSynced = !!(saveResult && saveResult.ok);
        persistLocalDream(currentDream);
        that.setData({
          dream: currentDream,
          cloudSyncPending: !currentDream.cloudSynced,
          qualitySyncPending: !currentDream.cloudSynced
        });
        if (!currentDream.cloudSynced) {
          queueDreamSync(currentDream);
          wx.showToast({ title: '高清图待同步', icon: 'none' });
        }
      });
      that.setData({ dream: currentDream, imageQualityStatus: 'polling' });
      that.pollDreamImageQuality();
    });
  },

  resumeDreamImageQuality: function () {
    var dream = this.data.dream;
    var result = dream && dream.result ? dream.result : {};
    var jobId = result.image_quality_job_id || '';
    var status = String(result.image_quality_status || this.data.imageQualityStatus || '').toLowerCase();
    if (!jobId || (status !== 'polling' && status !== 'queued')) return;
    this.qualityJobId = jobId;
    this.qualityPollAttempt = 0;
    this.qualityRequestActive = true;
    this.setData({ imageQualityStatus: 'polling' });
    this.pollDreamImageQuality();
  },

  pollDreamImageQuality: function () {
    var that = this;
    var dream = this.data.dream;
    var jobId = this.qualityJobId;

    if (!this.qualityRequestActive || !jobId || !dream || !dream.id || this.qualityPollAttempt >= QUALITY_POLL_MAX_ATTEMPTS) {
      this.stopDreamImageQualityPolling('timeout');
      return;
    }

    this.qualityPollAttempt += 1;
    cloudBase.pollDreamImageQuality(jobId, dream.id, function (pollResult) {
      var status = String(pollResult && (pollResult.status || pollResult.state) || '').toLowerCase();

      if (!that.qualityRequestActive || that.qualityJobId !== jobId) return;

      if (pollResult && pollResult.ok && pollResult.imageUrl) {
        that.applyDreamImageQuality(pollResult);
        return;
      }
      if (!pollResult || !pollResult.ok || status === 'failed' || status === 'cancelled' || status === 'canceled') {
        that.stopDreamImageQualityPolling('unavailable');
        return;
      }

      that.qualityPollTimer = setTimeout(function () {
        that.pollDreamImageQuality();
      }, QUALITY_POLL_INTERVAL_MS);
    });
  },

  applyDreamImageQuality: function (qualityImage) {
    var that = this;
    var dream = this.data.dream;

    if (!this.qualityRequestActive || !dream || !dream.result || !qualityImage || !qualityImage.imageUrl) {
      this.stopDreamImageQualityPolling('unavailable');
      return;
    }

    cloudBase.resolveCloudImage(qualityImage.fileID || qualityImage.fileId || '', qualityImage.imageUrl, function (localPath) {
      if (!that.qualityRequestActive) return;
      if (!localPath) {
        that.stopDreamImageQualityPolling('unavailable');
        return;
      }
      dream.result = Object.assign({}, dream.result, {
        imageUrl: qualityImage.imageUrl,
        image_file_id: qualityImage.fileID || qualityImage.fileId || dream.result.image_file_id || '',
        image_provider: qualityImage.provider || dream.result.image_provider || '',
        image_model: qualityImage.model || dream.result.image_model || '',
        image_quality: 'high',
        image_quality_status: 'ready',
        image_format: qualityImage.imageFormat || dream.result.image_format || '',
        image_bytes: Number(qualityImage.imageBytes || dream.result.image_bytes || 0)
      });
      dream.cloudSynced = false;
      persistLocalDream(dream);
      cloudBase.saveDream(dream, function (saveResult) {
        dream.cloudSynced = !!(saveResult && saveResult.ok);
        persistLocalDream(dream);
        that.setData({
          dream: dream,
          imageSyncPending: !dream.cloudSynced,
          cloudSyncPending: !dream.cloudSynced,
          qualitySyncPending: !dream.cloudSynced
        });
        if (!dream.cloudSynced) {
          queueDreamSync(dream);
          wx.showToast({ title: '高清图待同步', icon: 'none' });
        }
      });
      that.setData({
        dream: dream,
        aiImageFileId: qualityImage.fileID || qualityImage.fileId || '',
        aiImageLocalPath: localPath,
        imageQualityStatus: 'ready',
        shareImagePath: '',
        publicShareImagePath: '',
        sharePath: ''
      });
      that.stopDreamImageQualityPolling('ready');
      analytics.trackEvent('generated_image_quality_success', {
        dreamId: dream.id || '',
        provider: qualityImage.provider || '',
        model: qualityImage.model || ''
      });
    });
  },

  stopDreamImageQualityPolling: function (status) {
    if (this.qualityPollTimer) {
      clearTimeout(this.qualityPollTimer);
      this.qualityPollTimer = null;
    }
    this.qualityJobId = '';
    this.qualityPollAttempt = 0;
    this.qualityRequestActive = false;
    if (status) {
      this.setData({ imageQualityStatus: status });
      if (status === 'ready' || status === 'timeout' || status === 'unavailable') {
        var dream = this.data.dream;
        if (dream && dream.result) {
          dream.result = Object.assign({}, dream.result, {
            image_quality_status: status
          });
          persistLocalDream(dream);
          cloudBase.saveDream(dream, function (saveResult) {
            dream.cloudSynced = !!(saveResult && saveResult.ok);
            persistLocalDream(dream);
            this.setData({
              dream: dream,
              imageSyncPending: !dream.cloudSynced,
              cloudSyncPending: !dream.cloudSynced,
              qualitySyncPending: !dream.cloudSynced
            });
            if (!dream.cloudSynced) queueDreamSync(dream);
          }.bind(this));
        }
      }
    }
  },

  retryDreamImage: function () {
    var dream = this.data.dream;
    var resumeExistingJob = isResumableImageFailure(this.data.imageLoadError);

    if (resumeExistingJob) {
      this.setData({
        imageStatus: 'idle',
        imageErrorMessage: '',
        imageLoadError: '',
        imageSyncPending: false
      });
      this.requestDreamImage();
      return;
    }

    if (dream && dream.result) {
      dream.result = Object.assign({}, dream.result, {
        imageUrl: '',
        image_file_id: '',
        imageFileId: '',
        fileID: '',
        fileId: '',
        image_generation_token: '',
        image_refresh_token: '',
        image_quality: 'fast',
        image_quality_job_id: '',
        image_quality_status: 'idle'
      });
    }
    this.setData({
      dream: dream,
      imageStatus: 'idle',
      imageErrorMessage: '',
      imageLoadError: '',
      imageSyncPending: false,
      aiImageFileId: '',
      aiImageLocalPath: '',
      imageQualityStatus: 'idle',
      shareImagePath: '',
      publicShareImagePath: ''
    });
    this.stopDreamImageQualityPolling();
    this.requestDreamImage(null, { forceRefresh: true });
  },

  retryDreamImageSync: function () {
    if (!this.data.imageSyncPending) return;
    this.requestDreamImage();
  },

  retryCloudSync: function () {
    this.repairCloudDream(this.data.dream);
  },

  chooseDreamFeedback: function (event) {
    var that = this;
    var dream = this.data.dream;
    var feedback = String(event.currentTarget.dataset.feedback || '');
    var allowed = FEEDBACK_OPTIONS.some(function (item) { return item.value === feedback; });
    if (!dream || dream.status !== 'ready' || this.data.interpretationUnavailable || !allowed) return;
    dream.feedback = feedback;
    dream.feedbackAt = new Date().toISOString();
    dream.cloudSynced = false;
    persistLocalDream(dream);
    this.setData({ dream: dream, feedback: feedback, cloudSyncPending: true });
    analytics.trackEvent('dream_feedback', {
      dreamId: dream.id || '',
      feedback: feedback,
      promptVersion: dream.interpretationMeta && dream.interpretationMeta.promptVersion || ''
    });
    cloudBase.saveDream(dream, function (saveResult) {
      dream.cloudSynced = !!(saveResult && saveResult.ok);
      persistLocalDream(dream);
            that.setData({
              dream: dream,
              cloudSyncPending: !dream.cloudSynced,
              qualitySyncPending: !dream.cloudSynced
            });
      if (!dream.cloudSynced) queueDreamSync(dream);
      else removeDreamSync(dream);
      if (dream.cloudSynced && getApp && getApp().flushPendingSyncTasks) getApp().flushPendingSyncTasks();
    });
  },

  openDreamChat: function () {
    var dreamId = this.data.dream && this.data.dream.id ? this.data.dream.id : '';
    var feedback = this.data.feedback || '';
    analytics.trackEvent('dream_chat_open', { dreamId: dreamId, feedback: feedback });
    wx.navigateTo({ url: '/pages/dream-chat/index?id=' + encodeURIComponent(dreamId) + '&feedback=' + encodeURIComponent(feedback) });
  },

  // 第三层：完整解读默认收起，避免核心观察被长文淹没
  toggleFullReading: function () {
    var next = !this.data.showFullReading;
    this.setData({ showFullReading: next });
    if (next) {
      analytics.trackEvent('result_full_reading_expand', {
        dreamId: this.data.dream && this.data.dream.id ? this.data.dream.id : ''
      });
    }
  },

  toggleMoreActions: function () {
    this.setData({ showMoreActions: !this.data.showMoreActions });
  },

  openLifeNoteSource: function () {
    var note = this.data.dream.result.referenced_life_note;
    var source;
    if (!note || !note.sourceDreamId) return;
    source = findDreamById(note.sourceDreamId);
    if (!source) {
      wx.showToast({ title: '这条记录已被删除', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/result/index?id=' + encodeURIComponent(note.sourceDreamId) });
  },

  openMilestoneArchive: function () {
    var milestone = this.data.dream.result.symbol_milestones && this.data.dream.result.symbol_milestones[0];
    if (!milestone) return;
    tabNav.switchTab('pages/archive/index', { symbolFilter: milestone.symbol });
  },

  correctMilestoneSymbol: function () {
    var that = this;
    var dream = this.data.dream;
    var milestone = dream.result.symbol_milestones && dream.result.symbol_milestones[0];
    if (!milestone || !dream.id) return;
    wx.showModal({
      title: '更正这个梦象标签',
      editable: true,
      placeholderText: milestone.symbol,
      success: function (res) {
        var newSymbol = String(res.content || '').trim();
        if (!res.confirm || !newSymbol || newSymbol === milestone.symbol) return;
        cloudBase.editSymbol(dream.id, milestone.symbol, newSymbol, function (result) {
          if (!result || !result.ok) {
            wx.showToast({ title: '更正失败，请稍后再试', icon: 'none' });
            return;
          }
          dream.result.symbols = (dream.result.symbols || []).map(function (symbol) {
            return symbol === milestone.symbol ? newSymbol : symbol;
          });
          dream.result.symbol_milestones = [{ symbol: newSymbol, count: milestone.count }];
          that.setData({ dream: dream });
          var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
          wx.setStorageSync('oneiro:dreamArchive', archive.map(function (item) {
            return item.id === dream.id ? dream : item;
          }));
          wx.showToast({ title: '已更正', icon: 'success' });
        });
      }
    });
  },

  deleteDream: function () {
    var that = this;
    var dream = this.data.dream;

    if (!dream || !dream.id) return;

    wx.showModal({
      title: '删除这个梦？',
      content: '原梦、解读和反馈都会被删除，之后不再用于梦境关联。',
      confirmText: '删除',
      confirmColor: '#b85c54',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '正在删除' });
        cloudBase.deleteDream(dream.id, function (result) {
          var canDeleteLocally = result && result.ok;
          wx.hideLoading();
          if (
            !canDeleteLocally &&
            result &&
            result.reason !== 'cloud_unavailable' &&
            result.reason !== 'dream_not_found'
          ) {
            wx.showToast({ title: '云端删除失败，请稍后重试', icon: 'none' });
            return;
          }
          var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
          wx.setStorageSync('oneiro:dreamArchive', archive.filter(function (item) {
            return item.id !== dream.id;
          }));
          scrubLocalPortraitSource(dream.id);
          if (!canDeleteLocally) {
            var pendingDeletes = wx.getStorageSync('oneiro:pendingCloudDeletes') || [];
            if (pendingDeletes.indexOf(dream.id) < 0) pendingDeletes.push(dream.id);
            wx.setStorageSync('oneiro:pendingCloudDeletes', pendingDeletes.slice(-30));
          }
          analytics.trackEvent('dream_deleted', { dreamId: dream.id, cloudDeleted: canDeleteLocally });
          that.setData({ dreamDeleted: true });
          tabNav.switchTab('pages/archive/index');
        });
      }
    });
  },

  onShareAppMessage: function () {
    var sharePath = this.data.sharePath || '/pages/home/index?fromShare=1';

    analytics.trackEvent('share', {
      dreamId: this.data.dream.id || '',
      hasImage: !!this.data.publicShareImagePath,
      hasSharePath: !!this.data.sharePath
    });
    return {
      title: '我刚抽到一张梦卡：' + (
        this.data.dream.result.reflection_answer
          ? (this.data.dream.result.public_title || '梦卡')
          : this.data.dream.result.title
      ),
      path: sharePath,
      imageUrl: this.data.sharePath ? (this.data.publicShareImagePath || '') : ''
    };
  },

  prepareShareCard: function () {
    var that = this;
    if (this.data.sharePreparing) return;
    this.setData({ sharePreparing: true });
    this.renderShareCard({
      force: true,
      publishShare: true,
      publicShare: true,
      success: function () {
        that.setData({ sharePreparing: false });
        wx.showToast({ title: that.data.sharePath ? '分享梦卡已准备' : '图片已准备，可直接转发', icon: 'none' });
      },
      fail: function () {
        that.setData({ sharePreparing: false });
      }
    });
  },

  renderShareCard: function (options) {
    var that = this;
    var config = options || {};
    var canvasWidth = CARD_WIDTH;
    var canvasHeight = config.fullReading ? READING_CARD_HEIGHT : CARD_HEIGHT;

    if (!config.fullReading && !config.force && this.data.shareImagePath) {
      if (config.success) {
        config.success(this.data.shareImagePath);
      }
      return;
    }

    if (!config.silent) {
      wx.showLoading({ title: config.fullReading ? '生成长图中' : '生成梦卡中' });
    }

    wx.createSelectorQuery()
      .in(this)
      .select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var canvas = res && res[0] && res[0].node;
        var ctx;

        if (!canvas) {
          if (!config.silent) {
            wx.hideLoading();
            wx.showToast({ title: '暂时无法生成图片', icon: 'none' });
          }
          if (config.fail) {
            config.fail();
          }
          return;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        ctx = canvas.getContext('2d');

        var exportCard = function () {
          wx.canvasToTempFilePath(
            {
              canvas: canvas,
              width: canvasWidth,
              height: canvasHeight,
              destWidth: canvasWidth,
              destHeight: canvasHeight,
              success: function (fileRes) {
                if (!config.fullReading) {
                  if (config.publicShare) {
                    that.setData({ publicShareImagePath: fileRes.tempFilePath });
                  } else {
                    that.setData({ shareImagePath: fileRes.tempFilePath });
                  }
                  if (config.publishShare) {
                    cloudBase.createShareCard(that.data.dream, function (shareRes) {
                      if (shareRes && shareRes.ok && shareRes.path) {
                        that.setData({ sharePath: shareRes.path });
                        analytics.trackEvent('share_card_ready', { dreamId: that.data.dream.id || '' });
                        if (!config.silent) wx.hideLoading();
                        if (config.success) config.success(fileRes.tempFilePath);
                        return;
                      }
                      that.setData({ sharePath: '' });
                      if (!config.silent) wx.hideLoading();
                      wx.showToast({ title: '图片已保存，但分享链接创建失败', icon: 'none' });
                      if (config.fail) config.fail({ reason: shareRes && shareRes.reason || 'share_card_create_failed', imageSaved: true });
                    });
                  } else if (config.success) {
                    config.success(fileRes.tempFilePath);
                  }
                } else {
                  that.setData({ lastFullReadingPath: fileRes.tempFilePath });
                }
                analytics.trackEvent('image_success', {
                  dreamId: that.data.dream.id || '',
                  silent: !!config.silent,
                  type: config.fullReading ? 'full_reading' : 'collection_card'
                });
                if (!config.silent) {
                  wx.hideLoading();
                }
              },
              fail: function () {
                analytics.trackEvent('image_fail', {
                  dreamId: that.data.dream.id || '',
                  silent: !!config.silent
                });
                if (!config.silent) {
                  wx.hideLoading();
                  wx.showToast({ title: '图片生成失败', icon: 'none' });
                }
                if (config.fail) {
                  config.fail();
                }
              }
            },
            that
          );
        };
        var imagePath = that.data.aiImageLocalPath;

        if (imagePath && canvas.createImage) {
          var aiImage = canvas.createImage();
          aiImage.onload = function () {
            if (config.fullReading) {
              drawFullReadingCard(ctx, that.data.dream, that.data.displayTimestamp, aiImage);
            } else {
              drawCard(ctx, that.data.dream, that.data.displayTimestamp, aiImage);
            }
            exportCard();
          };
          aiImage.onerror = function () {
            if (config.fullReading) {
              drawFullReadingCard(ctx, that.data.dream, that.data.displayTimestamp);
            } else {
              drawCard(ctx, that.data.dream, that.data.displayTimestamp, null);
            }
            exportCard();
          };
          aiImage.src = imagePath;
        } else {
          if (config.fullReading) {
            drawFullReadingCard(ctx, that.data.dream, that.data.displayTimestamp);
          } else {
            drawCard(ctx, that.data.dream, that.data.displayTimestamp, null);
          }
          exportCard();
        }
      });
  },

  saveCard: function () {
    var that = this;
    var dreamId = this.data.dream.id || '';

    this.renderShareCard({
      force: true,
      success: function (tempFilePath) {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: function () {
            that.setData({ cardSaved: true });
            analytics.trackEvent('export_success', {
              dreamId: dreamId
            });
            wx.showToast({ title: '梦卡已保存', icon: 'success' });
          },
          fail: function () {
            analytics.trackEvent('export_fail', {
              dreamId: dreamId
            });
            wx.showModal({
              title: '需要相册权限',
              content: '请允许保存到相册后，再试一次。',
              confirmText: '去设置',
              cancelText: '稍后',
              success: function (modalRes) {
                if (modalRes.confirm) {
                  wx.openSetting({});
                }
              }
            });
          }
        });
      }
    });
  },

  saveFullReading: function () {
    var dreamId = this.data.dream.id || '';

    this.renderShareCard({
      force: true,
      fullReading: true,
      success: function (tempFilePath) {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: function () {
            analytics.trackEvent('export_full_reading_success', {
              dreamId: dreamId
            });
            wx.showToast({ title: '解读长图已保存', icon: 'success' });
          },
          fail: function () {
            analytics.trackEvent('export_full_reading_fail', {
              dreamId: dreamId
            });
            wx.showModal({
              title: '需要相册权限',
              content: '请允许保存到相册后，再试一次。',
              confirmText: '去设置',
              cancelText: '稍后',
              success: function (modalRes) {
                if (modalRes.confirm) {
                  wx.openSetting({});
                }
              }
            });
          }
        });
      }
    });
  },

  newDream: function () {
    analytics.trackEvent('dream_start', { source: 'result' });
    tabNav.switchTab('pages/home/index');
  },

  openArchive: function () {
    analytics.trackEvent('archive_open', { source: 'result' });
    tabNav.switchTab('pages/archive/index');
  }
});
