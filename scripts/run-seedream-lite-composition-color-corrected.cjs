#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-composition-color-corrected-2026-07-29');
const model = 'doubao-seedream-5-0-lite-260128';

const common = [
  '不要使用任何参考图。原创Oneiro梦境叙事插画。',
  '清晰但有手工压力变化的墨线，有限色、哑光平涂、略带复古印刷感的纸面颗粒和轻微干刷；颜色高对比但不写实。',
  '固定梦境内容：一间普通的小型博物馆展厅里，墙上挂着一幅风景画；画中的河流从画框底部流到现实地板，并朝一把空木椅子流去；一个匿名人物站在画框左侧观看。画框、人物、河流和空椅子是唯一叙事元素。',
  '配色必须遵循Oneiro的关系型色彩系统，而不是固定红蓝模板：一个低明度主导色场、一个明确的冷暖或互补对撞色、一个小面积高饱和焦点、墨黑线稿和暖纸色作为稳定支撑；本组使用深墨绿主导地面和空间重量，暖奶油与旧纸黄作为建筑平面，烧橙只作为画中太阳或椅子上的小焦点，浅青蓝只用于河流和画中远景。人物服装使用深绿、墨黑或暖纸色，不要默认朱红外套。',
  '颜色保持4到6个主要颜色，平面覆盖，允许轻微印刷偏移；不要把整张图处理成单一滤镜，不要让任何单一颜色铺满所有区域。',
  '不要文字、标志、水印、边框、白边、卡片框、摄影感、3D、渐变、玻璃质感、霓虹、紫粉主导、彩虹色、灰棕电影滤镜、额外人物或装饰符号。'
].join('\n');

const variants = [
  {
    id: 'small-figure-vast-space',
    label: '小人物 / 大环境',
    seed: 59101,
    composition: '构图变体一：人物很小，放在画面左下三分之一；展厅、画框和从画中流出的河占据大部分画面；前景有被裁切的空展台，中景是小人物和画框，远景是大面积但有色块分区的墙面；河流从画框蜿蜒向画面右下方，至少40%的上方留白，突出孤独和尺度差。'
  },
  {
    id: 'cropped-viewer-close',
    label: '近景裁切人物',
    seed: 59102,
    composition: '构图变体二：人物从画面左侧近景被大幅裁切，只看到肩背、侧脸轮廓和一只手；画框位于右上方并被边缘裁切，河流从画框穿过中景，流向画面下方的空椅子；人物的视线和河流形成一条斜向视觉路径；背景留白少但保持清楚的三层关系，避免让人物服装成为整张图的单一色块。'
  },
  {
    id: 'frontal-stage-tableau',
    label: '正面舞台式',
    seed: 59103,
    composition: '构图变体三：使用正面、舞台式、近乎海报的构图；画框居中偏上，人物站在左侧，空椅子在右侧，河流从画框中央垂直流到前景；前景用几何展台作为底座，墙面用暖奶油和旧纸黄分区，地面用深墨绿承重，烧橙只保留在画内一个小焦点；所有主体像一组安静的舞台剪影，不要透视混乱，不要增加其他观看者。'
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
  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: false, colorCorrection: 'deep-green-cream-burnt-orange-pale-cyan', fixedDream: 'museum-floor-river', variants, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
