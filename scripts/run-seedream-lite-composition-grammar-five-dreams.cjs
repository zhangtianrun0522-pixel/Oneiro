#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyFile = '/Users/digan/Desktop/key.txt';
const outputRoot = path.join(root, 'docs/design/seedream5-lite-composition-grammar-five-dreams-2026-07-29');
const model = 'doubao-seedream-5-0-lite-260128';

const compositionGrammar = [
  '不要使用任何参考图。创作原创的Oneiro梦境叙事插画。',
  '媒介：清晰但有手工压力变化的墨线，有限色、哑光平涂、略带复古印刷感的纸面颗粒和轻微干刷；颜色高对比但不写实，不要摄影、3D、渐变、玻璃质感、霓虹、商业矢量模板。',
  '构图语法：先建立一个几何上普通的空间容器，再放入一个被平静对待的异常关系；每张图只有一个主要异常。使用前景锚点、中景动作、远景结果三层；安排一个偏置的主角或主物体；用一条明确的视觉路径连接主体和异常；保留约30%到50%的主动留白；至少有一个结构性元素被画面边缘裁切，让世界延伸到画外；缩小成缩略图后仍要读得出一个清楚的剪影和一个事件。',
  '叙事预算：一个主事件、最多两个辅助线索、最多三个次要人物；异常元素被当作环境中的正常事物，不要让每件物品都变得奇怪。',
  '不要文字、标志、水印、边框、白边、卡片框、标题、数字或装饰符号。'
].join('\n');

const dreams = [
  {
    id: 'bus-shelter-sea',
    type: '阈限 / 方向',
    seed: 58001,
    palette: '配色关系：青绿色主导空间，烧橙色作为对撞色，奶油白作为留白和人物局部，墨黑作为轮廓；不要使用红蓝主导。',
    prompt: '梦境一：一个普通的城市公交站亭立在空旷海面上，站亭外的道路从水中延伸到远处的橙色太阳。一个人坐在站亭里等待，手边放着一只空的纸袋。前景裁切站亭的一角，中景是等待的人和站牌结构，远景是道路、海和太阳；道路形成一条从左下角通向远方的视觉路径，天空保留大面积青绿色留白。'
  },
  {
    id: 'museum-floor-river',
    type: '记忆 / 室内异常',
    seed: 58002,
    palette: '配色关系：暖赭黄主导墙面，深靛紫作为冷对撞色，少量珊瑚橙作为一幅画的焦点，深绿和墨黑压住地面与线稿；不要用标准红蓝组合。',
    prompt: '梦境二：一间普通的小型博物馆展厅里只有一幅挂在墙上的风景画，画中的河流却从画框底部流到现实地板上，并朝一个空着的木椅子流去。一个人站在画框左侧观看。前景裁切一排空展台，中景是人物、画框和流入地面的河，远景是暖黄色墙面；河流形成一条弯曲的视觉路径，右上方保留安静留白。'
  },
  {
    id: 'rooftop-greenhouse-snow',
    type: '自然 / 尺度错位',
    seed: 58003,
    palette: '配色关系：陶土橙色城市屋顶作为主导，浅青蓝雪景作为对撞色，深墨绿植物和近黑结构作为重量，暖黄只作为玻璃温室内部的小焦点；不要让蓝红成为主关系。',
    prompt: '梦境三：普通城市屋顶上有一座很小的玻璃温室，温室内部正在下雪，而屋顶外面是炎热的橙色夏天。一个很小的人站在温室门口，伸手接住一片雪。前景是被裁切的屋顶水箱，中景是温室和人物，远景是橙色城市天际线；温室的斜边把视线引向天空，画面左侧保留大片暖色留白。'
  },
  {
    id: 'dining-room-moon-window',
    type: '关系 / 远近',
    seed: 58004,
    palette: '配色关系：深墨绿房间作为主导，暖米色餐桌作为大面积对撞色，橙黄色月光作为唯一高亮焦点，少量青蓝只用于窗外夜空；不要使用朱红主导。',
    prompt: '梦境四：一间普通的餐厅里，一张很长的餐桌通向远处的窗；窗外不是街道，而是一轮巨大得贴近玻璃的月亮。桌子近端有一个人独自坐着，远端的空椅子上却放着一件刚刚有人穿过的外套。前景裁切桌边和一把椅子，中景是人物和餐桌，远景是窗与巨大月亮；桌面形成一条强烈的纵深线，房间上半部保留深绿色留白。'
  },
  {
    id: 'ordinary-stairs-upside-down',
    type: '空间 / 重力',
    seed: 58005,
    palette: '配色关系：深群青作为远景空间，暖奶油色建筑平面作为对撞色，烧橙色只用于一扇小门，深绿用于地面阴影，墨黑用于结构线；颜色不要自动回到红蓝对撞。',
    prompt: '梦境五：一栋普通的旧公寓楼外墙上有一条外置楼梯，楼梯从地面向上通往屋顶，但屋顶上又有另一条楼梯向下，通向天空。一个人站在两条楼梯交汇处，身体朝上，影子却朝下。前景裁切公寓的一侧墙体，中景是人物和交汇楼梯，远景是深群青天空；两条楼梯形成交叉的视觉路径，画面右侧保留大面积安静空间。'
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
    const prompt = `${compositionGrammar}\n${dream.palette}\n${dream.prompt}`;
    const started = Date.now();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        size: '1728x2304',
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

  fs.writeFileSync(path.join(outputRoot, 'run-records.json'), JSON.stringify({ model, referenceImages: false, compositionGrammar: true, paletteStrategy: 'fixed contrast relationships, rotating hues', dreams, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
