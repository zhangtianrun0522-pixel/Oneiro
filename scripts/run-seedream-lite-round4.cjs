#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outDir = path.join(root, 'docs/design/seedream5-lite-internal-style-2026-07-27/round-4-flat-silhouette');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';
const prompt = [
  '生成一幅全新原创的竖幅 3:4 梦境叙事插画，不复制任何参考图的具体人物或构图。',
  '场景保持不变：黄昏的深绿色平原上，一个穿朱红外套的成年人站在左下方；右侧有一扇独立的朱红色门，门内是温暖的金黄色天空；成年人的长影子变成一个提着橙红色灯笼的小孩，安静地向右下方走远；上方是大片钴蓝天空。',
  '参考三张图的“内测画风”：大面积纯钴蓝、深绿、朱红和暖黄色平涂，安静超现实的编辑插画，非对称留白，单一手绘黑色墨线，人物是没有脸部和头发细节的匿名剪影。',
  '本轮只做一个风格收敛：地面必须是干净的单一深绿色平面，不要石头、碎线、草、纹理或重复小笔触；人物衣服只保留纯色轮廓，不要衣褶、发丝或写实解剖；灯笼是纯平的橙红圆形，不要光晕、发光、反射或阴影；门内是纯平的暖黄色，不要云层、山脉或额外景物。',
  '保持满版出血，四边没有白边、纸边、边框、卡片框或内嵌画面。只保留成年人、红门、长影子变成的小孩和灯笼；不要新增鱼、花、月亮、眼睛、钥匙、植物、家具、装饰符号或第二个无关人物。不要文字、渐变、3D、摄影感、矢量模板或双重描线。'
].join('\n');

const refPaths = ['1-照片-1.jpg', '2-照片-2.jpg', '3-照片-3.jpg'].map((name) => path.join(refsDir, name));
const seeds = [51001, 51002];

function getCredentials() {
  const values = fs.readFileSync(keyFile, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (values.length < 2) throw new Error('key.txt must contain base URL and key');
  return { baseUrl: values[0].replace(/\/+$/, ''), apiKey: values[1] };
}

function dataUrl(file) {
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { baseUrl, apiKey } = getCredentials();
  const images = refPaths.map(dataUrl);
  const records = [];

  for (let i = 0; i < seeds.length; i += 1) {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        image: images,
        size: '2K',
        seed: seeds[i],
        sequential_image_generation: 'disabled',
        stream: false,
        response_format: 'url',
        watermark: false
      })
    });
    const payload = await response.json();
    const elapsedMs = Date.now() - started;
    const item = payload.data?.[0];
    const record = { sample: i + 1, seed: seeds[i], elapsedMs, httpStatus: response.status, ok: response.ok && Boolean(item?.url), providerSize: item?.size || null };
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

