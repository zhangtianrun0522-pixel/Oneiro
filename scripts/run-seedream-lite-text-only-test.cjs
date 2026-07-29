#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-text-only-2026-07-27');
const model = 'doubao-seedream-5-0-lite-260128';

const dreams = [
  {
    id: 'moonlit-amusement-park',
    type: '自然反转 / 游乐园',
    seed: 54001,
    prompt: '梦境：一座废弃的游乐园被清澈的月光淹没，摩天轮停在半空，旋转木马的木马长出了透明的白色树枝；雨水不是落下，而是从地面倒流回云层。一个穿黄色雨衣的人背对观者站在旋转木马中央，抬头看着倒流的雨。画面安静、空旷、具有超现实叙事，不要文字、标志、水印或额外人物。'
  },
  {
    id: 'bedroom-desert-bird',
    type: '室内漂浮 / 尺度错位',
    seed: 54002,
    prompt: '梦境：一间完整的卧室漂浮在无边的白色沙漠上，床单像缓慢起伏的海浪，枕头上放着一座亮着灯的微型房子；房间外同时升起两轮不同大小的月亮。一个人坐在床沿，双手捧着一只黑色鸟，鸟的身体内部像装着一小片星空。画面有明确的前中后景和尺度错位，不要文字、标志、水印或额外人物。'
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

  for (const dream of dreams) {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt: dream.prompt,
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
      prompt: dream.prompt
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

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, mode: 'text-to-image', referenceImages: false, dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
