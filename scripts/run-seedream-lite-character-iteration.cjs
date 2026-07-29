#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-character-iteration-2026-07-27');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';

const shared = [
  '使用三张参考图作为统一视觉语言参考，只借用画风，不复制参考图的具体人物、构图或物体。',
  'Oneiro内测梦境插画：竖幅3:4，满版出血；大面积钴蓝/群青、深绿、朱红、暖黄平涂；安静、孤独、轻微不安；非对称编辑插画构图。',
  '画面必须像手工绘制的纸面插画：边缘有轻微自然不齐，墨线粗细有变化，填色有少量干刷和纸张颗粒；不要做成软件路径、图标、海报模板或干净矢量插画。',
  '主角是同一个匿名人物：黑色短发或整块黑发，朱红色外套，深色裤子，脸部背对、侧遮或被裁切；不强调五官，但必须有清楚、独特、有情绪的身体姿态和剪影。',
  '手臂、手和肩背是叙事重点：动作自然但略有手绘夸张，手指保持可辨识；人物轮廓比服装褶皱和五官细节更重要。',
  '不要文字、边框、白边、水印、卡片框、摄影感、3D、渐变、霓虹、塑料质感、商业矢量模板、过度对称、额外人物。'
].join('\n');

const rounds = [
  {
    id: 'round-1-tactile-figure',
    label: '第一轮：手绘材质与人物基线',
    seedOffset: 0,
    focus: '保持大色块简洁，但让轮廓、填色和人物动作出现轻微手工痕迹；人物不能像图标或几何剪影。'
  },
  {
    id: 'round-2-gesture-lock',
    label: '第二轮：强化人物姿态与剪影',
    seedOffset: 100,
    focus: '进一步强化主角的肩背、手臂、手势和红外套形成的整体剪影；人物要成为画面情绪核心，背景细节退后。'
  },
  {
    id: 'round-3-collectible-finish',
    label: '第三轮：收藏级画面整理',
    seedOffset: 200,
    focus: '在保持人物剪影和手绘材质的前提下整理画面层次；构图要有封面级记忆点，细节克制但不能过分干净，保留少量纸面与墨线变化。'
  }
];

const dreams = [
  {
    id: 'red-coat-window-reach',
    type: '渴望 / 伸手',
    seed: 53001,
    prompt: '梦境一：深夜的钴蓝海面上铺着一条旧铁轨，远处漂浮着一扇亮着暖黄色灯光的小窗。主角站在画面右下方，穿朱红色外套，伸出一只手越过海面，手指朝向那扇窗；铁轨和手臂形成两条不同方向的线。只保留一个主角。'
  },
  {
    id: 'shadow-holds-the-door',
    type: '自我错位 / 影子',
    seed: 53002,
    prompt: '梦境二：空旷的深绿色地面上立着一扇朱红色的门，门内是钴蓝天空。主角背对观者站在左侧，朱红色外套的影子却从脚下延伸到门边，并伸出一只手替主角推门。影子必须像主角的第二个版本，不要增加真人，不要镜子。'
  },
  {
    id: 'corridor-hand-memory',
    type: '记忆 / 追赶',
    seed: 53003,
    prompt: '梦境三：一条暖黄色的旧学校走廊向远处收缩，深蓝色地面通向一扇很小的红门。主角从前景右下方奔向红门，只看到黑发块面、红外套、弯曲的肩背和向前伸出的手；身后的巨大黑影落在墙上。只有一个真人和一个影子。'
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

async function generate({ baseUrl, apiKey, imageRefs, round, dream }) {
  const prompt = `${shared}\n${round.focus}\n${dream.prompt}`;
  const started = Date.now();
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      image: imageRefs,
      size: '2K',
      seed: dream.seed + round.seedOffset,
      sequential_image_generation: 'disabled',
      stream: false,
      response_format: 'url',
      watermark: false
    })
  });
  const payload = await response.json();
  const item = payload.data?.[0];
  const record = {
    round: round.id,
    roundLabel: round.label,
    dream: dream.id,
    type: dream.type,
    seed: dream.seed + round.seedOffset,
    elapsedMs: Date.now() - started,
    httpStatus: response.status,
    ok: response.ok && Boolean(item?.url),
    providerSize: item?.size || null
  };
  if (!record.ok) {
    record.error = payload.error || 'provider returned no image';
    return { record, prompt };
  }
  const imageResponse = await fetch(item.url);
  if (!imageResponse.ok) throw new Error(`${round.id}/${dream.id}: download failed ${imageResponse.status}`);
  const outputDir = path.join(outputRoot, round.id);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${dream.id}.jpg`);
  fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
  record.outputPath = path.relative(root, outputPath);
  record.bytes = fs.statSync(outputPath).size;
  return { record, prompt };
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const { baseUrl, apiKey } = credentials();
  const imageRefs = ['1-照片-1.jpg', '2-照片-2.jpg', '3-照片-3.jpg'].map((name) => dataUrl(path.join(refsDir, name)));
  const records = [];
  for (const round of rounds) {
    for (const dream of dreams) {
      const result = await generate({ baseUrl, apiKey, imageRefs, round, dream });
      records.push({ ...result.record, prompt: result.prompt });
      console.log(JSON.stringify(result.record));
    }
  }
  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, rounds, dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
