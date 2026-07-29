#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const keyPath = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(workspaceRoot, 'docs/design/seedream5-lite-internal-style-2026-07-27');
const referenceRoot = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';
const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

const references = [
  path.join(referenceRoot, '1-照片-1.jpg'),
  path.join(referenceRoot, '2-照片-2.jpg'),
  path.join(referenceRoot, '3-照片-3.jpg')
];

const fixedScene = [
  '生成一幅全新原创的竖幅 3:4 梦境叙事插画，不复制参考图中的具体人物、构图或场景。',
  '画面内容：黄昏的深绿色平原上，一个穿朱红外套的成年人站在左下方；画面中右侧有一扇独立的朱红色门，门打开后露出温暖的金黄色天空；成年人的长影子变成一个提着橙红色灯笼的小孩，正安静地向右下方走远；上方保留大片钴蓝色安静天空。',
  '这是一个悬停的瞬间，重点是成年人、红门、变成小孩的影子之间的关系。只保留这三个叙事锚点。'
].join('\n');

const rounds = [
  {
    id: 'round-1-baseline',
    label: '基线：参考图风格迁移',
    prompt: [
      fixedScene,
      '参考图一、图二、图三的统一视觉语言，而不是复制它们的具体内容：大面积饱和钴蓝、深绿、朱红、暖黄平涂；简化人物；单一手绘黑色墨线；远近尺度反差；安静而略带超现实的编辑插画。',
      '画面要简洁、留白充足、非对称、叙事清楚；不要文字。'
    ].join('\n')
  },
  {
    id: 'round-2-style-lock',
    label: '强化：大色场与满版手绘',
    prompt: [
      fixedScene,
      '严格参考三张参考图的“内测画风”：连续的大面积哑光色场，主色为纯钴蓝或群青，辅以深墨绿、朱红和暖黄色；颜色是干净的平面色块，不做渐变、不做体积光。',
      '满版出血，四条边都被画面覆盖，没有白边、纸边、边框、卡片框或内嵌画面。轮廓是有自然抖动和轻微不规则的单条手绘墨线，线宽有变化；人物是匿名剪影或背影，脸部不画细节。',
      '把暖色强调只放在红门和小孩手里的灯笼上；构图非对称，保留约 40%–50% 低密度安静空间；不要文字。'
    ].join('\n')
  },
  {
    id: 'round-3-drift-control',
    label: '收敛：抑制矢量化与额外元素',
    prompt: [
      fixedScene,
      '这是一次风格收敛测试。以三张参考图为最高优先级的视觉参考：大块纯色、安静的空旷感、轻微失衡的手绘空间、简化且遮挡面部的人物、少量但有叙事作用的物件。',
      '保持画面只有成年人、独立红门、变成小孩的影子和灯笼这几个已给出的元素；不要新增鱼、花、月亮、眼睛、钥匙、植物、家具、装饰符号或第二个无关人物。',
      '拒绝干净的商业矢量图、规则透视、重复瓷砖或网格、双重描线、细密排线、3D、摄影感、渐变、发光、阴影、纸张白边、海报边框和任何文字。让门、平原和人物的轮廓略微弯曲、错位、带手工痕迹，但叙事关系必须清楚。'
    ].join('\n')
  }
];

function readKeyFile() {
  const lines = fs.readFileSync(keyPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('key.txt must contain base URL and API key');
  return { baseUrl: lines[0].replace(/\/+$/, ''), apiKey: lines[1] };
}

function asDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeResponse(payload) {
  return {
    model: payload.model,
    created: payload.created,
    usage: payload.usage,
    data: Array.isArray(payload.data)
      ? payload.data.map((item) => ({ size: item.size, hasUrl: Boolean(item.url), hasB64: Boolean(item.b64_json) }))
      : payload.data
  };
}

async function runOne({ baseUrl, apiKey }, round, sampleIndex, seed, referenceData) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const body = {
    model,
    prompt: round.prompt,
    image: referenceData,
    size: '2K',
    seed,
    sequential_image_generation: 'disabled',
    stream: false,
    response_format: 'url',
    watermark: false
  };
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const elapsedMs = Date.now() - started;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 1000) };
  }

  const record = {
    round: round.id,
    label: round.label,
    sample: sampleIndex,
    seed,
    startedAt,
    elapsedMs,
    httpStatus: response.status,
    ok: response.ok && Array.isArray(payload.data) && Boolean(payload.data[0]?.url || payload.data[0]?.b64_json),
    response: sanitizeResponse(payload)
  };

  if (!record.ok) {
    record.error = payload.error || payload.raw || 'provider returned no image';
    return record;
  }

  const item = payload.data[0];
  const roundDir = path.join(outputRoot, round.id);
  ensureDir(roundDir);
  const outputPath = path.join(roundDir, `sample-${sampleIndex}.jpg`);
  if (item.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) throw new Error(`image download failed: ${imageResponse.status}`);
    fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
  } else {
    fs.writeFileSync(outputPath, Buffer.from(item.b64_json, 'base64'));
  }
  record.outputPath = path.relative(workspaceRoot, outputPath);
  record.providerSize = item.size || null;
  record.bytes = fs.statSync(outputPath).size;
  return record;
}

async function main() {
  ensureDir(outputRoot);
  const credentials = readKeyFile();
  const referenceData = references.map(asDataUrl);
  const records = [];
  const seeds = [51001, 51002];

  for (const round of rounds) {
    for (let index = 0; index < seeds.length; index += 1) {
      const record = await runOne(credentials, round, index + 1, seeds[index], referenceData);
      records.push(record);
      console.log(JSON.stringify({ round: record.round, sample: record.sample, ok: record.ok, elapsedMs: record.elapsedMs, providerSize: record.providerSize, outputPath: record.outputPath, error: record.error }));
    }
  }

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, endpoint, references, fixedScene, rounds, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

