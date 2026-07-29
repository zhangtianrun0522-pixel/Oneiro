#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-breadth-2026-07-27');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';

const styleBase = [
  '使用三张参考图作为统一视觉语言参考，只借用风格，不复制参考图的具体内容或构图。',
  'Oneiro“内测画风”：竖幅3:4，满版出血；大面积饱和钴蓝/群青、深绿、朱红、暖黄平涂；单一手绘墨线，形状有轻微自然不规整；人物简化为背影、侧面或无脸匿名剪影；非对称编辑插画构图，安静但有清楚的超现实叙事。',
  '只表现梦境中明确给出的主体、动作和一个异常规则；不要添加无关人物、装饰符号、文字、边框、卡片框、白边、摄影感、3D、渐变或商业矢量模板。'
].join('\n');

const dreams = [
  {
    id: 'anxiety-yellow-corridor',
    type: '焦虑 / 建筑空间',
    seed: 52001,
    prompt: [
      '梦境一：我在一条很长的黄色学校走廊里奔跑，蓝色地面一直延伸到尽头；我穿着红色外套，伸手想打开远处一扇很小的红门，身后的黑色影子比我大很多。',
      '把奔跑、伸手、远处小红门和压迫性的巨大黑影组织成一个清楚的透视关系；走廊可以略微弯曲，但不要出现第二个人。'
    ].join('\n')
  },
  {
    id: 'snow-rose-desert',
    type: '变形 / 自然',
    seed: 52002,
    prompt: [
      '梦境二：我站在一片空旷的沙漠里，天空突然下起暴雪；雪停后，沙地中长出一朵巨大的朱红玫瑰，花瓣上还留着白雪。',
      '把“沙漠变成暴雪，再长出玫瑰”的时间变化压缩成一个悬停瞬间：前景是深绿或赭色沙地，中景是一朵朱红玫瑰，天空是钴蓝与白色雪势；只保留一个匿名人物作为尺度参照。'
    ].join('\n')
  },
  {
    id: 'flooded-library-key',
    type: '记忆 / 水与静物',
    seed: 52003,
    prompt: [
      '梦境三：我在一座安静的旧图书馆里找一把银色钥匙，书架之间已经涨起到膝盖的深蓝色水；远处一扇窗透进一小块暖黄色光。',
      '画面重点是“人在水中的书架之间寻找钥匙”，钥匙只出现一次且很小；书架、膝盖高度的水和远处窗光形成纵深，不要把水变成海洋，不要加入鱼。'
    ].join('\n')
  },
  {
    id: 'split-shadow-meeting',
    type: '关系 / 自我错位',
    seed: 52004,
    prompt: [
      '梦境四：我站在一面深绿色的墙左边，墙右边站着另一个和我一模一样的人；墙上只有一个红色小窗口，两个人都伸手向窗口靠近，但永远碰不到彼此。',
      '用墙、红色小窗口和两个相互错开的匿名剪影讲清距离；两个主体必须是同一人的两个版本，不要增加第三个人、镜子或装饰符号。'
    ].join('\n')
  },
  {
    id: 'upward-fall-stairwell',
    type: '下坠 / 方向反转',
    seed: 52005,
    prompt: [
      '梦境五：我从一座深蓝色的楼梯井向下坠落，但楼梯和门都朝天空向上生长；我的红色外套被风吹起，一只手抓住了最高处的一扇暖黄色窗。',
      '表现“身体下坠、建筑向上”的相反运动方向；用一个被裁切的匿名人物、连续楼梯和一扇小窗完成画面，不要加入其他人物或飞行物。'
    ].join('\n')
  },
  {
    id: 'empty-classroom-river',
    type: '怀旧 / 室内变形',
    seed: 52006,
    prompt: [
      '梦境六：一间空教室里只有一张朱红色课桌，窗外不是操场而是一条深蓝色的河；河水从窗户流进教室，沿着地面通向一把空着的椅子。',
      '让窗、流入室内的河、朱红课桌和空椅子构成一条清楚的视觉路径；室内保持大面积暖黄色墙面与深蓝地面，不要加入学生、老师、文字或黑板内容。'
    ].join('\n')
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
    const prompt = `${styleBase}\n${dream.prompt}`;
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, image: imageRefs, size: '2K', seed: dream.seed, sequential_image_generation: 'disabled', stream: false, response_format: 'url', watermark: false })
    });
    const payload = await response.json();
    const item = payload.data?.[0];
    const record = { id: dream.id, type: dream.type, seed: dream.seed, elapsedMs: Date.now() - started, httpStatus: response.status, ok: response.ok && Boolean(item?.url), providerSize: item?.size || null };
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
    records.push({ ...record, prompt });
    console.log(JSON.stringify(record));
  }

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

