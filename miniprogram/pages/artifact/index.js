function drawCenteredWrappedText(ctx, text, centerX, y, maxWidth, lineHeight, maxLines) {
  var content = String(text || '');
  var line = '';
  var lines = [];
  var nextLine;
  var i;

  for (i = 0; i < content.length; i += 1) {
    nextLine = line + content[i];
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

function drawBackground(ctx, width, height) {
  var gradient = ctx.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, '#0d0f16');
  gradient.addColorStop(0.55, '#111624');
  gradient.addColorStop(1, '#090b11');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawFineFrame(ctx, x, y, width, height) {
  ctx.save();
  ctx.strokeStyle = 'rgba(202, 177, 117, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

Page({
  data: {
    artifact: null,
    exportedPath5x4: '',
    exportedPath3x4: '',
    activeFormat: '5x4'
  },

  onLoad: function (options) {
    var app = getApp();
    var artifact = app.globalData.currentArtifact;
    var requestedType = options && options.type;
    var validType = requestedType === 'topic' || requestedType === 'archetype';
    var hasPayload = artifact && (
      artifact.type === 'topic' ? artifact.topicCard :
      artifact.type === 'archetype' ? artifact.archetype :
      null
    );

    if (!validType || !artifact || artifact.type !== requestedType || !hasPayload) {
      wx.showToast({
        title: '内容已过期，请重新生成',
        icon: 'none'
      });
      wx.navigateBack();
      return;
    }

    this.setData({
      artifact: artifact
    });
  },

  onReady: function () {
    if (this.data.artifact) {
      this.renderFormat('5x4');
    }
  },

  switchFormat: function (event) {
    var format = event.currentTarget.dataset.format;

    if (format !== '5x4' && format !== '3x4') {
      return;
    }

    this.setData({
      activeFormat: format
    });

    if (format === '5x4' && !this.data.exportedPath5x4) {
      this.renderFormat('5x4');
    }

    if (format === '3x4' && !this.data.exportedPath3x4) {
      this.renderFormat('3x4');
    }
  },

  renderFormat: function (format) {
    if (format === '5x4') {
      this.renderArtifactCanvas({
        selector: '#artifactCanvas5x4',
        width: 1000,
        height: 800,
        pathKey: 'exportedPath5x4',
        renderingKey: 'rendering5x4',
        draw: this.drawArtifact5x4
      });
      return;
    }

    this.renderArtifactCanvas({
      selector: '#artifactCanvas3x4',
      width: 1242,
      height: 1656,
      pathKey: 'exportedPath3x4',
      renderingKey: 'rendering3x4',
      draw: this.drawArtifact3x4
    });
  },

  renderArtifactCanvas: function (options) {
    var that = this;

    if (!this.data.artifact || this[options.renderingKey]) {
      return;
    }

    this[options.renderingKey] = true;

    wx.createSelectorQuery()
      .in(this)
      .select(options.selector)
      .fields({ node: true, size: true })
      .exec(function (res) {
        var canvas = res && res[0] && res[0].node;
        var ctx;
        var update;

        if (!canvas) {
          that[options.renderingKey] = false;
          return;
        }

        canvas.width = options.width;
        canvas.height = options.height;
        ctx = canvas.getContext('2d');
        options.draw.call(that, ctx, options.width, options.height);

        wx.canvasToTempFilePath({
          canvas: canvas,
          width: options.width,
          height: options.height,
          destWidth: options.width,
          destHeight: options.height,
          success: function (result) {
            update = {};
            update[options.pathKey] = result.tempFilePath;
            that[options.renderingKey] = false;
            that.setData(update);
          },
          fail: function () {
            that[options.renderingKey] = false;
            wx.showToast({
              title: '图片生成失败，请重试',
              icon: 'none'
            });
          }
        });
      });
  },

  drawArtifact5x4: function (ctx, width, height) {
    var artifact = this.data.artifact;
    var isTopic = artifact.type === 'topic';
    var content = isTopic ? artifact.topicCard : artifact.archetype;
    var titleBottom;

    drawBackground(ctx, width, height);
    drawFineFrame(ctx, 54, 54, width - 108, height - 108);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(202, 177, 117, 0.72)';
    ctx.font = '500 20px sans-serif';
    ctx.fillText(isTopic ? 'REPEATED DREAM MOTIF' : 'DREAM ARCHETYPE', width / 2, 100);

    ctx.strokeStyle = 'rgba(202, 177, 117, 0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 70, 148);
    ctx.lineTo(width / 2 + 70, 148);
    ctx.stroke();

    if (isTopic) {
      ctx.fillStyle = 'rgba(247, 243, 232, 0.94)';
      ctx.font = '600 52px sans-serif';
      titleBottom = drawCenteredWrappedText(
        ctx,
        content.headline,
        width / 2,
        220,
        760,
        76,
        3
      );

      ctx.fillStyle = 'rgba(222, 225, 232, 0.62)';
      ctx.font = '400 25px sans-serif';
      drawCenteredWrappedText(
        ctx,
        content.prompt,
        width / 2,
        titleBottom + 48,
        690,
        40,
        2
      );
    } else {
      ctx.fillStyle = 'rgba(239, 228, 200, 0.96)';
      ctx.font = '600 68px sans-serif';
      ctx.fillText(content.label, width / 2, 205);

      ctx.fillStyle = 'rgba(202, 177, 117, 0.68)';
      ctx.font = '400 24px sans-serif';
      ctx.fillText('「' + content.evidenceKeyword + '」的阶段原型', width / 2, 304);

      ctx.fillStyle = 'rgba(236, 237, 241, 0.74)';
      ctx.font = '400 29px sans-serif';
      drawCenteredWrappedText(
        ctx,
        content.description,
        width / 2,
        380,
        700,
        44,
        2
      );

      ctx.fillStyle = 'rgba(159, 183, 201, 0.6)';
      ctx.font = '400 21px sans-serif';
      ctx.fillText('基于你最近 ' + content.evidenceCount + ' 个梦', width / 2, 505);
    }

    ctx.strokeStyle = 'rgba(202, 177, 117, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(110, 646);
    ctx.lineTo(width - 110, 646);
    ctx.stroke();

    ctx.fillStyle = 'rgba(239, 228, 200, 0.62)';
    ctx.font = '500 18px sans-serif';
    ctx.fillText('ONEIRO · 私密梦境记录', width / 2, 676);
  },

  drawArtifact3x4: function (ctx, width, height) {
    var artifact = this.data.artifact;
    var isTopic = artifact.type === 'topic';
    var content = isTopic ? artifact.topicCard : artifact.archetype;
    var titleBottom;

    drawBackground(ctx, width, height);
    drawFineFrame(ctx, 76, 76, width - 152, height - 152);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(202, 177, 117, 0.72)';
    ctx.font = '500 24px sans-serif';
    ctx.fillText(isTopic ? 'REPEATED DREAM MOTIF' : 'DREAM ARCHETYPE', width / 2, 146);

    ctx.strokeStyle = 'rgba(202, 177, 117, 0.54)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 88, 208);
    ctx.lineTo(width / 2 + 88, 208);
    ctx.stroke();

    if (isTopic) {
      ctx.fillStyle = 'rgba(247, 243, 232, 0.95)';
      ctx.font = '600 66px sans-serif';
      titleBottom = drawCenteredWrappedText(
        ctx,
        content.headline,
        width / 2,
        430,
        920,
        96,
        4
      );

      ctx.fillStyle = 'rgba(222, 225, 232, 0.64)';
      ctx.font = '400 31px sans-serif';
      drawCenteredWrappedText(
        ctx,
        content.prompt,
        width / 2,
        titleBottom + 100,
        790,
        52,
        3
      );
    } else {
      ctx.fillStyle = 'rgba(239, 228, 200, 0.97)';
      ctx.font = '600 86px sans-serif';
      ctx.fillText(content.label, width / 2, 400);

      ctx.fillStyle = 'rgba(202, 177, 117, 0.7)';
      ctx.font = '400 30px sans-serif';
      ctx.fillText('「' + content.evidenceKeyword + '」的阶段原型', width / 2, 530);

      ctx.strokeStyle = 'rgba(202, 177, 117, 0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(310, 620);
      ctx.lineTo(width - 310, 620);
      ctx.stroke();

      ctx.fillStyle = 'rgba(236, 237, 241, 0.76)';
      ctx.font = '400 36px sans-serif';
      drawCenteredWrappedText(
        ctx,
        content.description,
        width / 2,
        710,
        820,
        58,
        3
      );

      ctx.fillStyle = 'rgba(159, 183, 201, 0.62)';
      ctx.font = '400 27px sans-serif';
      ctx.fillText('基于你最近 ' + content.evidenceCount + ' 个梦', width / 2, 920);
    }

    ctx.strokeStyle = 'rgba(202, 177, 117, 0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(150, 1400);
    ctx.lineTo(width - 150, 1400);
    ctx.stroke();

    ctx.fillStyle = 'rgba(239, 228, 200, 0.64)';
    ctx.font = '500 23px sans-serif';
    ctx.fillText('ONEIRO · 私密梦境记录', width / 2, 1444);
  },

  saveCurrentFormat: function () {
    var that = this;
    var format = this.data.activeFormat;
    var filePath = format === '5x4'
      ? this.data.exportedPath5x4
      : this.data.exportedPath3x4;

    if (!filePath) {
      this.renderFormat(format);
      wx.showToast({
        title: '图片生成中，请稍候',
        icon: 'none'
      });
      return;
    }

    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: function () {
        wx.showToast({
          title: '已保存到相册',
          icon: 'success'
        });
      },
      fail: function () {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册。',
          confirmText: '去设置',
          success: function (result) {
            if (result.confirm) {
              wx.openSetting({
                fail: function () {
                  wx.showToast({
                    title: '暂时无法打开设置',
                    icon: 'none'
                  });
                }
              });
            } else {
              wx.showToast({
                title: '未保存图片',
                icon: 'none'
              });
            }
          }
        });
      }
    });
  },

  onShareAppMessage: function () {
    var artifact = this.data.artifact;
    var isTopic = artifact && artifact.type === 'topic';
    var title = isTopic
      ? artifact.topicCard.headline
      : artifact && artifact.archetype
        ? artifact.archetype.label
        : 'ONEIRO';
    var imageUrl = this.data.activeFormat === '5x4'
      ? this.data.exportedPath5x4
      : this.data.exportedPath3x4;

    return {
      title: title,
      path: '/pages/home/index?fromShare=1',
      imageUrl: imageUrl
    };
  }
});
