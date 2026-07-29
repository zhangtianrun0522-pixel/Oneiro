#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-style-proxy-test-2026-07-27');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';

const styleProxy = [
  '使用三张参考图作为视觉语言和构图气质参考，只借用可观察的画面特征，不复制具体内容。',
  '手工绘制的编辑插画与梦境叙事：有限色板，大面积钴蓝、朱红、暖黄、深绿平涂；不规则墨线，线宽随手势变化；边缘有轻微干刷、纸张颗粒和印刷错位；色块平面但不是软件路径。',
  '构图大胆、留白充足、主体偏置、具有封面级记忆点；人物匿名但有明确的肩背、手臂和手势，人物轮廓优先于五官和服装褶皱。',
  '保持克制的超现实叙事：只表现梦境指定的主体和异常关系；安静、孤独、轻微不安。不要摄影写实、3D、渐变、霓虹、玻璃质感、过度精细概念艺术、干净矢量模板、文字、边框、水印或额外人物。'
].join('\n');

const dreams = [
  {
    id: 'red-coat-window-reach',
    type: '渴望 / 伸手',
    seed: 55001,
    prompt: '梦境：深夜的钴蓝海面上铺着一条旧铁轨，远处漂浮着一扇亮着暖黄色灯光的小窗。主角站在画面右下方，穿朱红色外套，伸出一只手越过海面，手指朝向那扇窗；铁轨和手臂形成两条不同方向的线。只保留一个主角。'
  },
  {
    id: 'corridor-hand-memory',
    type: '记忆 / 追赶',
    seed: 55002,
    prompt: '梦境：一条暖黄色的旧学校走廊向远处收缩，深蓝色地面通向一扇很小的红门。主角从前景右下方奔向红门，只看到黑发块面、红外套、弯曲的肩背和向前伸出的手；身后的巨大黑影落在墙上。只有一个真人和一个影子。'
  }
];

function credentials() {
  const lines = fs.readFileSync(keyFile, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('key.txt must contain base URL and key');
  return { baseUrl: lines[0].replace(/\/+$/, ''), apiKey: lines[1] };
}

function dataUrl(file) {
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const { baseUrl, apiKey } = credentials();
  const imageRefs = ['1-照片-1.jpg', '2-照片-2.jpg', '3-照片-3.jpg'].map((name) => dataUrl(path.join(refsDir, name)));
  const records = [];

  for (const dream of dreams) {
    const prompt = `${styleProxy}\n${dream.prompt}`;
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        image: imageRefs,
        size: '2K',
        seed: dream.seed,
        sequential_image_generation: 'disabled',
        stream: false,
        response_format: 'url',
        watermark: false
      })
    });
    const payload = await response.json();
    const item = payload.data?.[0];
    const record = {
      id: dream.id,
      type: dream.type,
      seed: dream.seed,
      elapsedMs: Date.now() - started,
      httpStatus: response.status,
      ok: response.ok && Boolean(item?.url),
      providerSize: item?.size || null,
      prompt
    };
    if (!record.ok) {
      record.error = payload.error || 'provider returned no image';
    } else {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) throw new Error(`${dream.id}: download failed ${imageResponse.status}`);
      const outputPath = path.join(outputRoot, `${dream.id}.jpg`);
      fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
      record.outputPath = path.relative(root, outputPath);
      record.bytes = fs.statSync(outputPath).size;
    }
    records.push(record);
    console.log(JSON.stringify({ ...record, prompt: undefined }));
  }

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: true, directArtistNameUsed: false, dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
