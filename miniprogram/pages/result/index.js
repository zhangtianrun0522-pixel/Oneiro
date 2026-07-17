const { acceptanceDreamResult, acceptanceDreamText } = require('../../utils/acceptanceDream');
const analytics = require('../../utils/analytics');
const cloudBase = require('../../utils/cloudBase');
const { buildLocalDreamResult } = require('../../utils/localDreamOracle');
const dreamArtifacts = require('../../utils/dreamArtifacts');

var CARD_WIDTH = 900;
var CARD_HEIGHT = 1200;
var READING_CARD_HEIGHT = 2300;
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
  var targetId = decodeURIComponent(id || '');
  var i;

  for (i = 0; i < archive.length; i += 1) {
    if (archive[i].id === targetId) {
      return archive[i];
    }
  }

  return null;
}

function formatDate(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  month = month < 10 ? '0' + month : String(month);
  day = day < 10 ? '0' + day : String(day);
  return year + '.' + month + '.' + day;
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

function drawCenteredWrappedText(ctx, text, centerX, y, maxWidth, lineHeight, maxLines) {
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

  if (line) {
    lines.push(line);
  }

  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
  }

  for (i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], centerX, y + i * lineHeight);
  }

  return y + lines.length * lineHeight;
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

function drawOverlaySymbols(ctx, symbols, startY) {
  var items = (symbols || []).slice(0, 4);
  var widths = [];
  var total = 0;
  var gap = 12;
  var i;
  var x;

  ctx.font = '700 22px sans-serif';
  items.forEach(function (label) {
    var width = Math.min(150, ctx.measureText(label).width + 36);
    widths.push(width);
    total += width;
  });
  total += Math.max(0, items.length - 1) * gap;
  x = (CARD_WIDTH - total) / 2;

  for (i = 0; i < items.length; i += 1) {
    fillRoundRect(ctx, x, startY, widths[i], 42, 21, 'rgba(5, 6, 9, 0.42)');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.textAlign = 'center';
    ctx.fillText(items[i], x + widths[i] / 2, startY + 28);
    x += widths[i] + gap;
  }
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

function drawCard(ctx, dream, displayDate, imagePath) {
  var result = dream.result || acceptanceDreamResult;
  var symbols = result.symbols || [];
  var artRect = { x: 36, y: 36, width: 828, height: 1128, radius: 24 };
  var overlay;

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawDreamArt(ctx, result.card_theme || 'mist', imagePath, artRect);

  ctx.save();
  drawRoundRect(ctx, artRect.x, artRect.y, artRect.width, artRect.height, artRect.radius);
  ctx.clip();
  overlay = ctx.createLinearGradient(0, 650, 0, 1164);
  overlay.addColorStop(0, 'rgba(5, 6, 9, 0)');
  overlay.addColorStop(0.48, 'rgba(5, 6, 9, 0.26)');
  overlay.addColorStop(1, 'rgba(5, 6, 9, 0.9)');
  ctx.fillStyle = overlay;
  ctx.fillRect(36, 620, 828, 544);
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '800 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ONEIRO', 70, 84);
  ctx.textAlign = 'right';
  ctx.fillText(result.card_no || 'NO. 001', 830, 84);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(result.title || '梦卡', CARD_WIDTH / 2, 934);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
  ctx.font = '26px sans-serif';
  drawCenteredWrappedText(ctx, result.emotional_weather || '', CARD_WIDTH / 2, 982, 700, 38, 2);

  drawOverlaySymbols(ctx, symbols, 1064);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '800 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Oneiro · ' + displayDate, CARD_WIDTH / 2, 1142);
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

function drawFullReadingCard(ctx, dream, displayDate, imagePath) {
  var result = dream.result || acceptanceDreamResult;
  var y;

  ctx.clearRect(0, 0, CARD_WIDTH, READING_CARD_HEIGHT);
  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, 0, CARD_WIDTH, READING_CARD_HEIGHT);

  drawCard(ctx, dream, displayDate, imagePath);

  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, CARD_HEIGHT, CARD_WIDTH, READING_CARD_HEIGHT - CARD_HEIGHT);

  ctx.fillStyle = 'rgba(23, 32, 51, 0.18)';
  ctx.font = '900 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DREAM READING', CARD_WIDTH / 2, CARD_HEIGHT + 62);

  y = CARD_HEIGHT + 106;
  y = drawReadingPanel(ctx, '梦里发生了什么', (result.reading_hook || '') + '\n' + result.dream_translation, 72, y, 756, 5);
  y = drawReadingPanel(
    ctx,
    '可能触及的现实',
    (result.possible_connections || [result.mirror]).filter(Boolean).join('\n'),
    72,
    y,
    756,
    5
  );

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
  ctx.fillText('Oneiro · ' + displayDate, CARD_WIDTH / 2, READING_CARD_HEIGHT - 56);
}

Page({
  data: {
    displayDate: formatDate(new Date()),
    imageStatus: 'idle',
    imageErrorMessage: '',
    imageLoadError: '',
    aiImageFileId: '',
    aiImageLocalPath: '',
    shareImagePath: '',
    lastFullReadingPath: '',
    sharePath: '',
    possibleConnections: [],
    interpretationUnavailable: false,
    dream: {
      dreamText: acceptanceDreamText,
      result: acceptanceDreamResult
    }
  },

  onLoad: function (options) {
    var app = getApp();
    var isFixture = options && options.fixture === '1';
    var savedDream = options && options.id ? findDreamById(options.id) : null;
    var dream = isFixture
      ? {
        dreamText: acceptanceDreamText,
        profile: wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile,
        result: buildLocalDreamResult(acceptanceDreamResult, acceptanceDreamText),
        createdAt: new Date().toISOString()
      }
      : savedDream || app.globalData.currentDream || this.data.dream;
    var interpretationUnavailable = !dream.result;
    if (interpretationUnavailable) {
      dream.result = {
        title: '尚未解读',
        card_no: '',
        card_theme: 'mist',
        symbols: [],
        emotional_weather: '原梦已保存。',
        dream_translation: '原梦已保存，但本次未生成解读。',
        possible_connections: [],
        mirror: '',
        integration_question: ''
      };
    }
    var displayDate = dream.createdAt ? formatDate(new Date(dream.createdAt)) : this.data.displayDate;
    if (!interpretationUnavailable && !dream.result.card_no) {
      dream.result.card_no = dream.result.card_no || 'NO. 001';
      dream.result.profile_summary = dream.result.profile_summary || '梦境记忆';
    }
    var possibleConnections = Array.isArray(dream.result.possible_connections) && dream.result.possible_connections.length
      ? dream.result.possible_connections
      : [dream.result.mirror].filter(Boolean);
    this.setData({
      dream: dream,
      displayDate: displayDate,
      possibleConnections: possibleConnections,
      interpretationUnavailable: interpretationUnavailable
    });
    analytics.trackEvent('result_view', {
      dreamId: dream.id || '',
      cardTheme: dream.result.card_theme || 'mist',
      source: isFixture ? 'fixture' : savedDream ? 'archive_or_route' : 'current'
    });
  },

  onReady: function () {
    var that = this;

    if (this.data.interpretationUnavailable) return;

    setTimeout(function () {
      that.renderShareCard({
        silent: true,
        success: function (tempFilePath) {
          that.setData({ shareImagePath: tempFilePath });
        }
      });
      that.requestDreamImage(function () {
        that.renderShareCard({ silent: true });
      });
    }, 300);
  },

  requestDreamImage: function (done) {
    var that = this;
    var result = this.data.dream.result || {};
    var prompt = result.image_prompt || result.image || '';

    if (result.imageUrl || !prompt) {
      if (done) {
        done();
      }
      return;
    }

    this.setData({ imageStatus: 'generating', imageErrorMessage: '' });
    cloudBase.generateDreamImage(prompt, this.data.dream.id || '', result.card_theme || 'mist', function (imageRes) {
      var dream = that.data.dream;

      if (imageRes && imageRes.ok && imageRes.imageUrl) {
        dream.result = Object.assign({}, dream.result, {
          imageUrl: imageRes.imageUrl,
          image_provider: imageRes.provider || '',
          image_model: imageRes.model || '',
          image_style_version: imageRes.styleVersion || '',
          image_cache_hit: !!imageRes.cacheHit,
          image_format: imageRes.imageFormat || '',
          image_bytes: Number(imageRes.imageBytes || 0)
        });
        that.setData({
          dream: dream,
          aiImageFileId: imageRes.fileID || ''
        });
        cloudBase.resolveCloudImage(imageRes.fileID || '', imageRes.imageUrl, function (localPath, loadError) {
          that.setData({
            aiImageLocalPath: localPath || '',
            imageStatus: localPath ? 'ready' : 'failed',
            imageErrorMessage: localPath ? '' : '云端画面暂时无法加载，已使用梦象卡面',
            imageLoadError: localPath ? '' : String(loadError || 'cloud_image_load_failed').slice(0, 300)
          });
          if (!localPath) {
            analytics.trackEvent('generated_image_load_fail', {
              dreamId: dream.id || '',
              reason: String(loadError || 'cloud_image_load_failed').slice(0, 180)
            });
          }
          if (done) {
            done();
          }
        });
        analytics.trackEvent('generated_image_success', {
          dreamId: dream.id || '',
          provider: imageRes.provider || '',
          cacheHit: !!imageRes.cacheHit,
          latencyMs: imageRes.latencyMs || 0
        });
      } else {
        that.setData({
          imageStatus: 'failed',
          imageErrorMessage: imageRes && (imageRes.reason || imageRes.message)
            ? String(imageRes.reason || imageRes.message).slice(0, 42)
            : 'unknown'
        });
        analytics.trackEvent('generated_image_fail', {
          dreamId: dream.id || '',
          reason: imageRes && imageRes.reason ? imageRes.reason : 'unknown'
        });
        if (done) {
          done();
        }
      }
    });
  },

  retryDreamImage: function () {
    var dream = this.data.dream;

    if (dream && dream.result) {
      dream.result = Object.assign({}, dream.result, { imageUrl: '' });
    }
    this.setData({
      dream: dream,
      imageStatus: 'idle',
      imageErrorMessage: '',
      imageLoadError: '',
      aiImageFileId: '',
      aiImageLocalPath: '',
      shareImagePath: ''
    });
    this.requestDreamImage();
  },

  openDreamChat: function () {
    var dreamId = this.data.dream && this.data.dream.id ? this.data.dream.id : '';
    analytics.trackEvent('dream_chat_open', { dreamId: dreamId });
    wx.navigateTo({ url: '/pages/dream-chat/index?id=' + encodeURIComponent(dreamId) });
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
    wx.navigateTo({ url: '/pages/archive/index?symbolFilter=' + encodeURIComponent(milestone.symbol) });
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

  openTopicCard: function () {
    var app = getApp();
    var milestone = this.data.dream.result.symbol_milestones && this.data.dream.result.symbol_milestones[0];
    if (!milestone) return;
    app.globalData.currentArtifact = {
      type: 'topic',
      topicCard: dreamArtifacts.buildTopicCard(milestone.symbol)
    };
    wx.navigateTo({ url: '/pages/artifact/index?type=topic' });
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
        var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
        wx.setStorageSync('oneiro:dreamArchive', archive.filter(function (item) {
          return item.id !== dream.id;
        }));
        cloudBase.deleteDream(dream.id);
        analytics.trackEvent('dream_deleted', { dreamId: dream.id });
        that.setData({ dreamDeleted: true });
        wx.navigateTo({ url: '/pages/archive/index' });
      }
    });
  },

  onShareAppMessage: function () {
    var sharePath = this.data.sharePath || '/pages/home/index?fromShare=1';

    analytics.trackEvent('share', {
      dreamId: this.data.dream.id || '',
      hasImage: !!this.data.shareImagePath,
      hasSharePath: !!this.data.sharePath
    });
    return {
      title: '我刚抽到一张梦卡：' + this.data.dream.result.title,
      path: sharePath,
      imageUrl: this.data.shareImagePath || ''
    };
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
                  that.setData({ shareImagePath: fileRes.tempFilePath });
                  cloudBase.uploadShareCard(that.data.dream.id || '', fileRes.tempFilePath, function (uploadRes) {
                    var fileId = uploadRes && uploadRes.fileID ? uploadRes.fileID : '';

                    if (uploadRes && uploadRes.fileID) {
                      analytics.trackEvent('image_upload_success', {
                        dreamId: that.data.dream.id || ''
                      });
                    }
                    cloudBase.createShareCard(that.data.dream, fileId, function (shareRes) {
                      if (shareRes && shareRes.path) {
                        that.setData({ sharePath: shareRes.path });
                        analytics.trackEvent('share_card_ready', {
                          dreamId: that.data.dream.id || ''
                        });
                      }
                    });
                  });
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
                if (config.success) {
                  config.success(fileRes.tempFilePath);
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
              drawFullReadingCard(ctx, that.data.dream, that.data.displayDate, aiImage);
            } else {
              drawCard(ctx, that.data.dream, that.data.displayDate, aiImage);
            }
            exportCard();
          };
          aiImage.onerror = function () {
            if (config.fullReading) {
              drawFullReadingCard(ctx, that.data.dream, that.data.displayDate);
            } else {
              drawCard(ctx, that.data.dream, that.data.displayDate);
            }
            exportCard();
          };
          aiImage.src = imagePath;
        } else {
          if (config.fullReading) {
            drawFullReadingCard(ctx, that.data.dream, that.data.displayDate);
          } else {
            drawCard(ctx, that.data.dream, that.data.displayDate);
          }
          exportCard();
        }
      });
  },

  saveCard: function () {
    var dreamId = this.data.dream.id || '';

    this.renderShareCard({
      force: true,
      success: function (tempFilePath) {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: function () {
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
    wx.navigateTo({ url: '/pages/new-dream/index' });
  },

  openArchive: function () {
    analytics.trackEvent('archive_open', { source: 'result' });
    wx.navigateTo({ url: '/pages/archive/index' });
  }
});
