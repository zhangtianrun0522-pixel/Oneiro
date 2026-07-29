#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-five-dream-types-2026-07-27');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';

const styleBase = [
  '使用三张参考图作为统一视觉语言参考，只借用风格，不复制参考图的具体人物、构图或物体。',
  'Oneiro内测画风：竖幅3:4，满版出血；手工绘制的编辑插画和梦境叙事；有限色板，大面积钴蓝或深群青、朱红、暖赭黄、深墨绿、墨黑和暖纸米色平涂；哑光覆盖，边缘有轻微干刷、纸张颗粒、自然不齐和线宽变化；不要软件路径式的干净矢量边缘。',
  '颜色必须承担叙事角色：蓝色负责梦境空间，朱红负责人物或情绪焦点，暖黄色负责出口、记忆或异常光源，深绿色负责现实重量，墨黑负责轮廓、头发和影子。每张图保持4到6个主要颜色，允许小范围手工印刷色差。',
  '人物匿名但有明确的身体动作和整体剪影；人物轮廓、肩背、手臂和手势优先于五官、发丝和服装褶皱。构图有留白、主体偏置、情绪安静而轻微不安。',
  '不要文字、标志、水印、边框、白边、卡片框、摄影感、3D、渐变、玻璃质感、霓虹色、紫色、粉色、彩虹色、灰棕电影滤镜或商业矢量模板。只表现每个梦境明确给出的主体和一个异常规则。'
].join('\n');

const dreams = [
  {
    id: 'upward-rain-meadow',
    type: '自然异变',
    seed: 56001,
    prompt: '梦境一：一片深墨绿色的草原在夜里下雨，但所有雨滴都从地面向上飞，汇聚成天空中的一条钴蓝色河流。一个穿朱红外套的人站在草原中央，举着一把暖黄色的旧伞，伞下没有雨。只保留一个人，重点表现雨的反方向和伞下的空白。'
  },
  {
    id: 'table-between-two',
    type: '关系错位',
    seed: 56002,
    prompt: '梦境二：一张很长的餐桌横跨空旷的深墨绿色房间，桌子两端坐着两个面对面的人；桌面中央不是食物，而是一条细窄的钴蓝色河流，把两人隔开。左边的人穿暖黄色衣服，右边的人穿朱红色衣服，两人的影子在河里交汇。只保留两个人、餐桌和一条河，画面安静克制。'
  },
  {
    id: 'old-cinema-young-self',
    type: '时间记忆',
    seed: 56003,
    prompt: '梦境三：一间废弃的小电影院里只有一排深墨黑色座椅和一块暖赭黄色的银幕；银幕上播放的不是电影，而是同一个房间二十年前的样子，银幕前坐着一个现在的成年人，身旁空着一把椅子。银幕的边缘渗出钴蓝色的光，成年人手里握着一个很小的朱红色纸片。不要增加其他观众或文字。'
  },
  {
    id: 'coat-full-of-sky',
    type: '身体变形',
    seed: 56004,
    prompt: '梦境四：一个穿朱红外套的人站在钴蓝色的空房间里，外套胸口打开后不是身体，而是一片深墨蓝的夜空；几颗暖黄色的小星星从衣服内部落到地面。人物背对观者，双手轻轻拉开外套，脸部不可见。只保留一个人物、外套和内部的天空。'
  },
  {
    id: 'apartment-stair-sky',
    type: '空间尺度',
    seed: 56005,
    prompt: '梦境五：一栋被切开的旧公寓立在深墨绿色的平原上，所有房间都空着，只有一条楼梯从最低层向下延伸，却通向上方的钴蓝天空。楼梯入口有一扇小小的朱红色门，门口站着一个拿暖黄色手电筒的人。建筑必须像纸板模型一样被剖开，但画面仍是手绘平面插画，不要增加其他人物。'
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

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: true, styleColorSpec: 'ONEIRO_INTERNAL_TEST_COLOR_STYLE_V1', dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
