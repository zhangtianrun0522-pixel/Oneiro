#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outDir = path.join(root, 'docs/design/seedream5-lite-internal-style-2026-07-27/round-5-hybrid');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';
const prompt = [
  '生成一幅全新原创的竖幅 3:4 梦境叙事插画，不复制参考图的具体人物或构图。',
  '保持同一场景：黄昏深绿色平原，一个穿朱红外套的成年人在左下方；右侧独立朱红色门打开，门内是暖黄色天空；成年人的长影子变成一个提着橙红灯笼的小孩，安静向右下方走远；上方大片钴蓝天空。',
  '以三张参考图的“内测画风”为最高优先级：大片连续饱和色场，朱红与暖黄作为叙事焦点，深绿平面承接画面；强烈远近尺度差，非对称留白；人物是背影或无脸的匿名剪影。',
  '画面保持简洁，但不要变成无质感的商业矢量图：允许非常轻微的手绘墨线抖动、线宽变化和不均匀色块覆盖，只使用少量自然的手工痕迹。地面只保留一两处宽而稀疏的墨线，不要石头、草、碎点、重复笔触或网格。人物不要画发丝、五官或衣褶。',
  '灯笼和门内的暖黄色使用平面色块，避免明显发光；门内可以有一个很简化的深蓝形状暗示远方，但不要云层、山脉或额外景物。满版出血，无白边、边框、卡片框、文字、渐变、3D、摄影感、装饰符号或无关人物。'
].join('\n');

const refPaths = ['1-照片-1.jpg', '2-照片-2.jpg', '3-照片-3.jpg'].map((name) => path.join(refsDir, name));
const seeds = [51001, 51002];

function credentials() {
  const lines = fs.readFileSync(keyFile, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('key.txt must contain base URL and key');
  return { baseUrl: lines[0].replace(/\/+$/, ''), apiKey: lines[1] };
}

function dataUrl(file) {
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { baseUrl, apiKey } = credentials();
  const images = refPaths.map(dataUrl);
  const records = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, image: images, size: '2K', seed: seeds[i], sequential_image_generation: 'disabled', stream: false, response_format: 'url', watermark: false })
    });
    const payload = await response.json();
    const item = payload.data?.[0];
    const record = { sample: i + 1, seed: seeds[i], elapsedMs: Date.now() - started, httpStatus: response.status, ok: response.ok && Boolean(item?.url), providerSize: item?.size || null };
    if (!record.ok) {
      record.error = payload.error || 'provider returned no image';
    } else {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) throw new Error(`download failed: ${imageResponse.status}`);
      const outputPath = path.join(outDir, `sample-${i + 1}.jpg`);
      fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
      record.outputPath = path.relative(root, outputPath);
      record.bytes = fs.statSync(outputPath).size;
    }
    records.push(record);
    console.log(JSON.stringify(record));
  }
  fs.writeFileSync(path.join(outDir, 'run-records.json'), JSON.stringify({ model, prompt, seeds, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

