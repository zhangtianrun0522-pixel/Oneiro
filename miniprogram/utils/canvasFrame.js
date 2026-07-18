function drawOrnamentalFrame(ctx, width, height, options) {
  var minSize = Math.min(width, height);
  var settings = options || {};
  var margin = typeof settings.margin === 'number'
    ? settings.margin
    : Math.round(minSize * 0.04);
  var gap = typeof settings.gap === 'number'
    ? settings.gap
    : Math.round(minSize * 0.014);
  var color = typeof settings.color === 'string'
    ? settings.color
    : 'rgba(202, 177, 117, 0.55)';
  var innerColor = typeof settings.innerColor === 'string'
    ? settings.innerColor
    : 'rgba(202, 177, 117, 0.3)';
  var cornerSize = typeof settings.cornerSize === 'number'
    ? settings.cornerSize
    : Math.round(minSize * 0.018);
  var innerMargin = margin + gap;
  var corners = [
    [margin, margin],
    [width - margin, margin],
    [margin, height - margin],
    [width - margin, height - margin]
  ];
  var i;
  var corner;

  ctx.save();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    margin,
    margin,
    width - margin * 2,
    height - margin * 2
  );

  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    innerMargin,
    innerMargin,
    width - innerMargin * 2,
    height - innerMargin * 2
  );

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  for (i = 0; i < corners.length; i += 1) {
    corner = corners[i];
    ctx.save();
    ctx.translate(corner[0], corner[1]);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(
      -cornerSize / 2,
      -cornerSize / 2,
      cornerSize,
      cornerSize
    );
    ctx.restore();
  }

  ctx.restore();
}

module.exports = {
  drawOrnamentalFrame: drawOrnamentalFrame
};
