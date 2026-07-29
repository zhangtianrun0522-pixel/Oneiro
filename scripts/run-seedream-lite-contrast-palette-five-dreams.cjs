#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-contrast-palette-five-dreams-2026-07-29');
const refsDir = '/tmp/codex-remote-attachments/019fa22b-26db-7c30-8291-ec0ea4209917/1726A28F-E41B-4F93-A6DA-402155206B27';
const model = 'doubao-seedream-5-0-lite-260128';

const styleBase = [
  '使用三张参考图作为统一视觉语言参考，只借用手绘编辑插画的画面气质，不复制具体内容、人物或构图。',
  'Oneiro内测画风：竖幅3:4，满版出血；有限色、哑光平涂、自然不齐的手绘墨线、少量纸张颗粒和干刷覆盖；人物匿名、动作明确、构图偏置、留白充足、安静而轻微不安。',
  '色彩原则不是固定红蓝，而是固定对撞关系：每张图必须有一个主导色场、一个明确的冷暖或互补对撞色、一个小面积高饱和焦点，以及墨黑或暖纸色作为稳定底色；每张图保持4到6个主要颜色。',
  '严格服从每个梦境指定的配色，不要自动套用钴蓝加朱红；颜色可以是稍微复古、略微褪色的印刷色，但保持高对比和平面覆盖。',
  '不要文字、标志、水印、边框、白边、卡片框、摄影感、3D、渐变、玻璃质感、霓虹彩虹、写实电影滤镜、过度细密线稿或商业矢量模板。只表现梦境指定的主体和一个异常规则。'
].join('\n');

const dreams = [
  {
    id: 'wheat-kitchen-sunsets',
    type: '怀旧 / 室内漂浮',
    seed: 57001,
    palette: '配色：暖赭黄作为主导色场，深靛蓝作为冷对撞色，珊瑚橙只作为一个很小的焦点，墨黑用于轮廓，暖纸米色用于人物和桌面。不要把朱红或钴蓝作为主色。',
    prompt: '梦境一：一间完整的旧厨房漂浮在无边的金色麦田上，厨房中央只有一张桌子和一把空椅子；桌上的三个杯子分别装着清晨、黄昏和深夜的天空。窗外没有墙，只有缓慢起伏的麦田。不要增加人物，重点是室内和田野的尺度错位。'
  },
  {
    id: 'forest-telephone-trees',
    type: '自然 / 声音',
    seed: 57002,
    palette: '配色：深墨绿作为主导色场，烧橙色作为暖对撞色，少量浅青色作为声音的视觉痕迹，墨黑压住树干和轮廓，暖纸米色只用于人物皮肤。不要使用红蓝对撞。',
    prompt: '梦境二：一片深绿色森林里，树干都长成老式电话听筒的形状；一个匿名人物靠近其中一棵树，把耳朵贴在树干上，树冠里却传出一片橙色沙漠的风。只保留一个人和几棵主要的电话树，不要出现真正的电话线或文字。'
  },
  {
    id: 'elevator-wall-listeners',
    type: '焦虑 / 社会空间',
    seed: 57003,
    palette: '配色：青绿色作为主导色场，暖橙色作为冷暖对撞色，深紫灰只作为影子和远处压迫色，少量乳白色作为灯光；不使用钴蓝、朱红主导。',
    prompt: '梦境三：一部狭长的电梯停在半空，里面站着几个人，但所有人都面朝墙壁；主角站在最里面，耳朵贴着墙，墙另一边传来海浪声。电梯门外不是楼层，而是一片无边的青绿色天空。人物只画成匿名背影，不要表情、文字或额外装饰。'
  },
  {
    id: 'buried-clock-playground',
    type: '时间 / 童年',
    seed: 57004,
    palette: '配色：陶土橙作为主导色场，浅青蓝作为互补对撞色，深墨绿作为地面，明亮柠檬黄只作为秒针上的小焦点，墨黑用于线稿；避免红蓝主导。',
    prompt: '梦境四：一座空荡的旧游乐场被陶土色沙丘覆盖，沙丘里埋着一只巨大的圆形时钟；一个成年人站在钟面旁，双手试图转动一根比身体还长的秒针。摩天轮只露出一小部分，像远处的骨架。不要出现其他人、数字或文字。'
  },
  {
    id: 'lake-ceiling-bedroom',
    type: '空间反转 / 睡眠',
    seed: 57005,
    palette: '配色：深紫靛色作为主导色场，暖奶油色作为大面积对撞色，橙色作为床头灯的小焦点，深绿色只用于植物和地面阴影，墨黑用于轮廓；不要使用朱红和钴蓝主导。',
    prompt: '梦境五：一间安静的卧室里，天花板变成了一片倒悬的湖，水草从湖面垂下来；床、书桌和一盏小灯仍然贴在地面上，一个人躺在床上抬头看湖，湖里却漂着一张和房间一模一样的床。只保留一个人、一个房间和一片倒悬的湖。'
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
    const prompt = `${styleBase}\n${dream.palette}\n${dream.prompt}`;
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
      palette: dream.palette,
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

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: true, paletteStrategy: 'fixed contrast relationships, rotating hues', dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
