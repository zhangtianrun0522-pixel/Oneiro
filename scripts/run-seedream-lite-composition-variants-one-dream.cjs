#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-composition-variants-one-dream-2026-07-29');
const model = 'doubao-seedream-5-0-lite-260128';

const common = [
  '不要使用任何参考图。原创Oneiro梦境叙事插画。',
  '清晰但有手工压力变化的墨线，有限色、哑光平涂、略带复古印刷感的纸面颗粒和轻微干刷；颜色高对比但不写实。',
  '固定梦境内容：一间普通的小型博物馆展厅里，墙上挂着一幅风景画；画中的河流从画框底部流到现实地板，并朝一把空木椅子流去；一个匿名人物站在画框左侧观看。画框、人物、河流和空椅子是唯一叙事元素。',
  '固定配色：暖赭黄墙面主导，深靛紫作为对撞色，少量珊瑚橙作为画中太阳，深墨绿地面，墨黑轮廓，暖纸米色局部；4到6个主要颜色，不要红蓝主导。',
  '不要文字、标志、水印、边框、白边、卡片框、摄影感、3D、渐变、玻璃质感、霓虹、额外人物或装饰符号。'
].join('\n');

const variants = [
  {
    id: 'small-figure-vast-space',
    label: '小人物 / 大环境',
    seed: 59001,
    composition: '构图变体一：人物很小，放在画面左下三分之一；展厅、画框和从画中流出的河占据大部分画面；前景有被裁切的空展台，中景是小人物和画框，远景是大面积暖黄墙面；河流从画框蜿蜒向画面右下方，至少40%的上方留白，突出孤独和尺度差。'
  },
  {
    id: 'cropped-viewer-close',
    label: '近景裁切人物',
    seed: 59002,
    composition: '构图变体二：人物从画面左侧近景被大幅裁切，只看到肩背、侧脸轮廓和一只手；画框位于右上方并被边缘裁切，河流从画框穿过中景，流向画面下方的空椅子；人物的视线和河流形成一条斜向视觉路径；背景留白少但保持清楚的三层关系。'
  },
  {
    id: 'frontal-stage-tableau',
    label: '正面舞台式',
    seed: 59003,
    composition: '构图变体三：使用正面、舞台式、近乎海报的构图；画框居中偏上，人物站在左侧，空椅子在右侧，河流从画框中央垂直流到前景；前景用几何展台作为底座，墙面是大面积暖黄平面；所有主体像一组安静的舞台剪影，不要透视混乱，不要增加其他观看者。'
  }
];

function credentials() {
  const lines = fs.readFileSync(keyFile, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('key.txt must contain base URL and key');
  return { baseUrl: lines[0].replace(/\/+$/, ''), apiKey: lines[1] };
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const { baseUrl, apiKey } = credentials();
  const records = [];
  for (const variant of variants) {
    const prompt = `${common}\n${variant.composition}`;
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, size: '1728x2304', seed: variant.seed, sequential_image_generation: 'disabled', stream: false, response_format: 'url', watermark: false })
    });
    const payload = await response.json();
    const item = payload.data?.[0];
    const record = { id: variant.id, label: variant.label, seed: variant.seed, elapsedMs: Date.now() - started, httpStatus: response.status, ok: response.ok && Boolean(item?.url), providerSize: item?.size || null, prompt };
    if (!record.ok) {
      record.error = payload.error || 'provider returned no image';
    } else {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) throw new Error(`${variant.id}: download failed ${imageResponse.status}`);
      const outputPath = path.join(outputRoot, `${variant.id}.jpg`);
      fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
      record.outputPath = path.relative(root, outputPath);
      record.bytes = fs.statSync(outputPath).size;
    }
    records.push(record);
    console.log(JSON.stringify({ ...record, prompt: undefined }));
  }
  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: false, fixedDream: 'museum-floor-river', variants, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
