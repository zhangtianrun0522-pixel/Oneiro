const crypto = require('crypto');

const STYLE_VERSION = 'oneiro-seedream-dream-v2.1';
const INTERNAL_TEST_STYLE_VERSION = 'oneiro-internal-test-style-v1.4';
const STYLE_PRESETS = {
  production: {
    id: 'production',
    label: '正式画风',
    version: STYLE_VERSION
  },
  internal_test: {
    id: 'internal_test',
    label: '内测画风',
    version: INTERNAL_TEST_STYLE_VERSION
  }
};

const EMOTION_PALETTES = {
  anxiety: {
    label: '焦虑',
    keywords: ['焦虑', '紧张', '害怕', '恐惧', '不安', '压迫', '窒息', '追赶'],
    dominant: 'deep ink green #104A43',
    accent: 'burnt orange #C9682E',
    auxiliary: ['pale cyan #9DD7D4'],
    outline: 'green-black ink #111916',
    paper: 'warm paper cream #F0DFB8'
  },
  nostalgia: {
    label: '怀旧',
    keywords: ['怀旧', '想念', '童年', '小时候', '故乡', '旧', '回忆', '以前'],
    dominant: 'warm ochre #D9A33A',
    accent: 'muted teal #4B9290',
    auxiliary: ['burnt orange #B85A31', 'grass green #6E8A45'],
    outline: 'warm black ink #1C1A18',
    paper: 'aged cream #F1E1BE'
  },
  excitement: {
    label: '兴奋',
    keywords: ['兴奋', '期待', '开心', '快乐', '激动', '自由', '飞翔', '惊喜'],
    dominant: 'terracotta orange #C96532',
    accent: 'pale cyan #94D0D1',
    auxiliary: ['lemon yellow #E7C94A', 'deep green #1C4C43'],
    outline: 'near-black indigo #121525',
    paper: 'clean warm cream #F6E8C8'
  },
  sadness: {
    label: '悲伤',
    keywords: ['悲伤', '难过', '失落', '孤独', '哭', '离开', '消失', '告别'],
    dominant: 'deep indigo #2B3D67',
    accent: 'warm cream #E9D2A4',
    auxiliary: ['muted coral #B96750', 'ink green #1A4A40'],
    outline: 'near-black blue #151923',
    paper: 'milk cream #EFE3C9'
  },
  anger: {
    label: '愤怒',
    keywords: ['愤怒', '生气', '发火', '争吵', '冲突', '破坏', '攻击'],
    dominant: 'vermilion #D33D29',
    accent: 'electric blue #2D68C4',
    auxiliary: ['burnt orange #DA6A2C', 'deep ink #1A1A19'],
    outline: 'charcoal black #151311',
    paper: 'warm paper #F1DFBC'
  },
  mystery: {
    label: '神秘',
    keywords: ['神秘', '未知', '陌生', '奇怪', '诡异', '迷雾', '夜晚', '秘密'],
    dominant: 'deep ink green #164F46',
    accent: 'golden yellow #D6A62E',
    auxiliary: ['deep violet #4D4165', 'pale cyan #9CBEC0'],
    outline: 'green-black ink #111916',
    paper: 'antique ivory #EEE0BE'
  },
  healing: {
    label: '治愈',
    keywords: ['治愈', '安心', '平静', '温暖', '轻松', '安全', '拥抱', '回家'],
    dominant: 'sage green #6B9A70',
    accent: 'warm orange #D77540',
    auxiliary: ['clear light blue #74B9C1', 'warm yellow #E4C25E'],
    outline: 'soft near-black #1B2420',
    paper: 'cream white #F4E8CD'
  }
};

const COMPOSITIONS = {
  off_center_diagonal: {
    subject_position: 'main subject cropped and offset from center',
    visual_flow: 'a strong diagonal path from the primary action to the anomaly',
    spatial_layers: 'quiet foreground edge, dense middle action, sparse distant field',
    negative_space: '40% irregular breathing space opposite the action'
  },
  threshold_depth: {
    subject_position: 'small or medium subject beside an off-center threshold',
    visual_flow: 'foreground threshold pulls the eye toward one distant impossible detail',
    spatial_layers: 'large foreground shape, compressed middle ground, tiny far clue',
    negative_space: '35–45% low-detail space around the threshold'
  },
  cropped_closeup: {
    subject_position: 'one expressive action cropped by the frame, face secondary or hidden',
    visual_flow: 'close foreground gesture points toward one isolated symbol',
    spatial_layers: 'oversized foreground, thin middle strip, nearly empty background',
    negative_space: '35% open paper field around the isolated symbol'
  },
  split_distance: {
    subject_position: 'two unequal figures or states separated across the frame',
    visual_flow: 'distance between the two anchors becomes the main visual path',
    spatial_layers: 'one near anchor, open middle interval, one small far anchor',
    negative_space: '45–50% open interval, never evenly decorated'
  },
  low_horizon: {
    subject_position: 'subject placed low and to one side beneath an oversized environment',
    visual_flow: 'vertical pull from the low subject into the reality-breaking element',
    spatial_layers: 'compressed low foreground and a dominant quiet upper field',
    negative_space: '45% open upper field with one strong color mass'
  },
  vertical_drift: {
    subject_position: 'subject displaced to one side while objects rise or fall vertically',
    visual_flow: 'one broken vertical rhythm leads through the action',
    spatial_layers: 'cropped near object, main action, sparse drifting distance',
    negative_space: '35–45% breathing space between drifting elements'
  }
};

function clean(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit || 240);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function uniqueStrings(value, limit, maxLength) {
  const seen = {};
  const output = [];
  (Array.isArray(value) ? value : []).forEach(function (item) {
    const text = clean(typeof item === 'string' ? item : item && (item.name || item.description), maxLength || 80);
    const key = text.toLowerCase();
    if (text && !seen[key] && output.length < limit) {
      seen[key] = true;
      output.push(text);
    }
  });
  return output;
}

function repairGroundingText(value, dreamText) {
  const source = clean(dreamText, 1200);
  let text = clean(value, 180);
  if (!text) return '';
  if (!/[水海河湖溪江池]/.test(source) && /暴雨|大雨|下雨|雨/.test(source)) {
    text = text.replace(/清水|水面|水体|水意象/g, /暴雨|大雨|下暴雨/.test(source) ? '暴雨' : '雨');
  }
  if (!source.includes('另一个人')) text = text.replace(/另一个人|第二个人|另一个细节/g, '这处梦中细节');
  return text;
}

function groundedInDream(value, dreamText) {
  const candidate = clean(value, 180).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const source = clean(dreamText, 1200).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const ignoredBigrams = {
    '一个': true,
    '人物': true,
    '主体': true,
    '梦者': true,
    '梦中': true,
    '场景': true,
    '远处': true,
    '正在': true,
    '我在': true,
    '在一': true,
    '一间': true
  };
  let comparableCount = 0;
  let matchedCount = 0;
  let unmatchedRun = 0;
  let maxUnmatchedRun = 0;
  let index;

  if (!candidate || !source) return false;
  if (source.indexOf(candidate) >= 0) return true;
  if (candidate.length === 1) return source.indexOf(candidate) >= 0;

  for (index = 0; index < candidate.length - 1; index += 1) {
    const bigram = candidate.slice(index, index + 2);
    if (ignoredBigrams[bigram]) continue;
    comparableCount += 1;
    if (source.indexOf(bigram) >= 0) {
      matchedCount += 1;
      unmatchedRun = 0;
    } else {
      unmatchedRun += 1;
      maxUnmatchedRun = Math.max(maxUnmatchedRun, unmatchedRun);
    }
  }

  if (!comparableCount || !matchedCount) return false;
  if (candidate.length <= 4) return matchedCount >= 1;

  // Longer AI-written phrases must be substantially supported by the source.
  // A single shared word must never whitelist a sentence that also invents props.
  return matchedCount >= 2 && matchedCount / comparableCount >= 0.5 && maxUnmatchedRun < 3;
}

function groundedStrings(value, dreamText, limit, maxLength) {
  return uniqueStrings(value, limit * 3, maxLength).map(function (item) {
    return repairGroundingText(item, dreamText);
  }).filter(function (item) {
    return groundedInDream(item, dreamText);
  }).slice(0, limit);
}

function normalizeCharacters(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    if (typeof item === 'string') {
      return { role: '人物', description: clean(item, 100), importance: 0.7 };
    }
    return {
      role: clean(item && item.role, 30) || '人物',
      description: clean(item && item.description, 100),
      importance: clamp(item && item.importance, 0, 1, 0.7)
    };
  }).filter(function (item) {
    return item.description;
  }).sort(function (a, b) {
    return b.importance - a.importance;
  }).slice(0, 4);
}

function normalizeObjects(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    if (typeof item === 'string') {
      return { name: clean(item, 80), importance: 0.6, visualizable: true };
    }
    return {
      name: clean(item && item.name, 80),
      importance: clamp(item && item.importance, 0, 1, 0.6),
      visualizable: item && item.visualizable !== false
    };
  }).filter(function (item) {
    return item.name;
  }).sort(function (a, b) {
    return b.importance - a.importance;
  }).slice(0, 8);
}

function paletteFor(emotions, dreamText) {
  const search = uniqueStrings(emotions, 6, 30).join(' ') + ' ' + clean(dreamText, 600);
  const keys = Object.keys(EMOTION_PALETTES);
  let bestKey = 'mystery';
  let bestScore = 0;

  keys.forEach(function (key) {
    const score = EMOTION_PALETTES[key].keywords.reduce(function (total, keyword) {
      return total + (search.indexOf(keyword) >= 0 ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  });

  return Object.assign({ id: bestKey }, EMOTION_PALETTES[bestKey]);
}

function compositionFor(rawComposition, seed) {
  const raw = rawComposition && typeof rawComposition === 'object' ? rawComposition : {};
  const names = Object.keys(COMPOSITIONS);
  const requested = clean(raw.template || raw.id, 40);
  const hash = crypto.createHash('sha256').update(String(seed || 'oneiro')).digest();
  const id = COMPOSITIONS[requested] ? requested : names[hash[0] % names.length];
  const fallback = COMPOSITIONS[id];

  return {
    id: id,
    subject_position: clean(raw.subject_position, 160) || fallback.subject_position,
    visual_flow: clean(raw.visual_flow, 180) || fallback.visual_flow,
    spatial_layers: clean(raw.spatial_layers, 180) || fallback.spatial_layers,
    negative_space: clean(raw.negative_space, 120) || fallback.negative_space
  };
}

function normalizeVisualPlan(rawPlan, context) {
  const raw = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
  const safeContext = context || {};
  const facts = safeContext.dreamFacts || {};
  const dreamText = clean(safeContext.dreamText, 1200);
  const emotions = uniqueStrings(raw.emotion || raw.emotions, 3, 30);
  const factEmotions = uniqueStrings(facts.emotions, 3, 30);
  const characters = normalizeCharacters(raw.characters).map(function (item) {
    return Object.assign({}, item, { description: repairGroundingText(item.description, dreamText) });
  }).filter(function (item) {
    return groundedInDream(item.description, dreamText);
  });
  const objects = normalizeObjects(raw.objects).map(function (item) {
    return Object.assign({}, item, { name: repairGroundingText(item.name, dreamText) });
  }).filter(function (item) {
    return groundedInDream(item.name, dreamText);
  });
  const factPeople = groundedStrings(facts.people, dreamText, 3, 50);
  const factPlaces = groundedStrings(facts.places, dreamText, 2, 60);
  const factObjects = groundedStrings(facts.objects, dreamText, 4, 60);
  const factActions = groundedStrings(facts.actions, dreamText, 2, 80);
  const symbols = groundedStrings(raw.symbols || safeContext.symbols, dreamText, 5, 60);
  const preserveCandidates = [];
  const rawMainEvent = repairGroundingText(raw.main_event || raw.mainEvent, dreamText);
  const imagePrompt = clean(safeContext.imagePrompt, 180);
  const mainEvent = (groundedInDream(rawMainEvent, dreamText) && rawMainEvent) ||
    clean(factActions[0], 180) ||
    (groundedInDream(imagePrompt, dreamText) && imagePrompt) ||
    clean(dreamText, 180) || 'the dreamer encounters one impossible change';
  const rawSetting = repairGroundingText(raw.setting, dreamText);
  const setting = (groundedInDream(rawSetting, dreamText) && rawSetting) ||
    factPlaces[0] || 'the setting explicitly described in the dream source';
  const rawAnomalies = Array.isArray(raw.anomalies)
    ? raw.anomalies
    : [raw.anomaly || raw.reality_breaking_rule];
  const anomalies = groundedStrings(
    rawAnomalies.map(function (item) {
      return repairGroundingText(item, dreamText);
    }),
    dreamText,
    1,
    120
  );

  groundedStrings(raw.preserve_elements || raw.visual_elements, dreamText, 4, 80).forEach(function (item) {
    preserveCandidates.push(item);
  });
  characters.forEach(function (item) { preserveCandidates.push(item.description); });
  objects.filter(function (item) { return item.visualizable; }).forEach(function (item) { preserveCandidates.push(item.name); });
  factPeople.concat(factObjects).concat(factPlaces).concat(symbols).forEach(function (item) {
    preserveCandidates.push(item);
  });

  const preserveElements = uniqueStrings(preserveCandidates, 4, 80);
  [setting, mainEvent].forEach(function (item) {
    if (preserveElements.length < 2 && groundedInDream(item, dreamText) && preserveElements.indexOf(item) < 0) {
      preserveElements.push(item);
    }
  });
  const hiddenCandidates = groundedStrings([raw.hidden_symbol].concat(symbols), dreamText, 6, 80);
  const hiddenSymbol = hiddenCandidates.filter(function (item) {
    return preserveElements.indexOf(item) < 0;
  })[0] || '';
  const finalEmotions = emotions.length ? emotions : (factEmotions.length ? factEmotions : ['神秘']);
  const palette = paletteFor(finalEmotions, dreamText);

  return {
    version: 'oneiro-visual-plan-v1',
    raw_text: dreamText,
    main_event: mainEvent,
    emotion: finalEmotions,
    emotion_intensity: clamp(raw.emotion_intensity || raw.emotionIntensity, 0, 1, 0.65),
    setting: setting,
    characters: characters.length ? characters : factPeople.map(function (item, index) {
      return { role: index === 0 ? '主体' : '人物', description: item, importance: index === 0 ? 1 : 0.65 };
    }),
    objects: objects.length ? objects : factObjects.map(function (item, index) {
      return { name: item, importance: Math.max(0.4, 0.85 - index * 0.1), visualizable: true };
    }),
    anomalies: anomalies,
    symbols: symbols,
    memory_elements: groundedStrings(raw.memory_elements, dreamText, 3, 80),
    preserve_elements: preserveElements,
    hidden_symbol: hiddenSymbol,
    composition: compositionFor(raw.composition, dreamText + mainEvent),
    palette: {
      id: palette.id,
      emotion_label: palette.label,
      dominant: palette.dominant,
      accent: palette.accent,
      auxiliary: palette.auxiliary,
      outline: palette.outline,
      paper: palette.paper
    }
  };
}

function paletteList(palette) {
  return [palette.dominant, palette.accent]
    .concat(palette.auxiliary || [])
    .concat([palette.outline, palette.paper])
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeStylePreset(value) {
  const normalized = clean(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'internal_test' ? 'internal_test' : 'production';
}

function styleVersionForPreset(value) {
  return STYLE_PRESETS[normalizeStylePreset(value)].version;
}

function internalCompositionInstruction(plan) {
  const composition = plan.composition || {};
  const fallback = COMPOSITIONS[composition.id];
  const isGeneric = fallback &&
    composition.subject_position === fallback.subject_position &&
    composition.visual_flow === fallback.visual_flow &&
    composition.spatial_layers === fallback.spatial_layers;

  if (isGeneric) {
    return 'Composition seed: ' + composition.id +
      '. Derive scene-specific framing from the main event; do not copy generic pointing, reaching, threshold, pursuit, or near-versus-far actions unless the dream explicitly contains them. ' +
      (composition.negative_space || 'Keep about 40% low-density space') + '.';
  }

  return 'Composition: ' + composition.subject_position + '; ' + composition.visual_flow + '; ' +
    composition.spatial_layers + '; ' + composition.negative_space + '.';
}

function buildInternalTestGenerationPrompt(plan) {
  const palette = paletteList(plan.palette);
  const anomaly = plan.anomalies[0] || 'none beyond the supplied dream facts; do not invent one';
  const hiddenInstruction = plan.hidden_symbol
    ? 'include ' + plan.hidden_symbol + ' only once and very subtly'
    : 'do not invent a decorative hidden symbol';

  return [
    'Create one original vertical 3:4 narrative dream illustration in the ONEIRO INTERNAL TEST VISUAL STYLE ("内测画风"). No typography.',
    'Priority order: 1) preserve the exact main event and impossible rule, 2) condense them into one causal tableau with only 2–3 narrative anchors, 3) obey the style non-negotiables: full bleed, one matte color field, irregular single-ink contours, anonymous cutout people, 4) keep sparse asymmetric staging. If secondary detail conflicts with these, omit the detail rather than polishing it.',
    'Dream source: ' + clean(plan.raw_text, 700) + '.',
    'Main event: ' + plan.main_event + '.',
    'Emotion: ' + plan.emotion.join(', ') + ', intensity ' + plan.emotion_intensity.toFixed(2) + '. Setting: ' + plan.setting + '.',
    'Visual elements to preserve: ' + (plan.preserve_elements.join(', ') || 'only the main event') + '.',
    'Reality-breaking rule: ' + anomaly + '.',
    'Hidden symbol: ' + hiddenInstruction + '.',
    'Story logic: the reality-breaking rule must visibly change the action, distance, or structure of the scene; it cannot be a decorative symbol. Join the 2–3 anchors through one readable cause, exchange, or transformation already present in the dream.',
    'Grounding: every recognizable person, place, object, gesture, and action must come from the supplied facts. Omit uncertain and ordinary filler. Do not invent a second figure, pointing hand, pursuit, threshold, moon, clock, eye, flower, animal, key, water, sign, furniture, or occult motif unless it is explicitly present.',
    internalCompositionInstruction(plan),
    'Framing: use the plan as a loose staging seed, never as a camera template. Keep one focal event, one continuous eye path, asymmetry, locally clustered detail, and 35–55% low-density space. A close crop, wide tableau, overhead view, compressed interior, or distorted space is acceptable only when it clarifies the stated event.',
    'Full bleed is mandatory: artwork extends beyond every canvas edge. There are zero visible white, paper, transparent, or unpainted pixels on any edge. Do not draw a perimeter outline that leaves an exterior margin. No border, mat, card/poster/panel outline, inset image, or frame. Paper color may only be an enclosed interior shape.',
    'Palette: choose only 3–4 flat matte fills from ' + palette.join(', ') + '. One saturated field occupies about 50–70%; one contrasting action color belongs only to the principal action or impossible change; any remaining fill is a supporting mass. Do not distribute colors evenly, model volume, or mix them into a grey-brown wash.',
    'Drawing: use decisive single ink contours whose pressure visibly changes from tapered hairline to blunt dry stroke. Every major silhouette has 2–4 deliberate handmade irregularities such as a bowed edge, off-register join, uneven corner, drifting parallel, or gently asymmetrical proportion. Keep perspective human and slightly unstable; avoid ruler-straight architecture, uniform stroke widths, perfect polygons, mechanically repeated tiles, and duplicate sketch outlines.',
    'People: reduce each person to an anonymous cutout figure: one solid garment mass, a head with no face or hair detail, and limbs made from 2–3 simple tapered shapes. Prefer back, side, tiny, or cropped views. No realistic joints, folds, footwear detail, posed anatomy, portrait features, or cartoon expression.',
    'Surface and detail: use a few broad irregular flat masses with faint ink absorption. Describe rooms, vegetation, crowds, hair, and fabric as large silhouettes with sparse marks. No cast shadows, smooth tonal modelling, tiled grids, or repeated small marks unless the stated dream action itself requires them.',
    'Character: quiet surreal editorial storytelling, authored spatial logic, large silent color fields, simplified anonymous figures, and one suspended moment. The result should feel drawn and specific, not polished or decorative.',
    'Hard exclusions: no readable text, watermark, title, number, white edge, paper margin, border, card mockup, centered poster template, photorealism, 3D/CAD volume, cast shadow, glossy transparency, gradient, glow, cute/anime face, realistic anatomy, ornate mysticism, stock vector polish, clutter, hatching, repeated texture, tiled grid, uniform line weight, or multiple sketch contours.'
  ].join('\n');
}

function buildGenerationPrompt(plan, stylePreset) {
  if (normalizeStylePreset(stylePreset) === 'internal_test') {
    return buildInternalTestGenerationPrompt(plan);
  }
  const palette = paletteList(plan.palette);
  const anomaly = plan.anomalies[0] || 'none beyond the supplied dream facts; do not invent one';
  const hiddenInstruction = plan.hidden_symbol
    ? 'include ' + plan.hidden_symbol + ' only once and very subtly'
    : 'do not invent a decorative hidden symbol';

  return [
    'Create one original vertical 3:4 narrative dream illustration with no typography.',
    'Priority order: preserve the exact main event and impossible rule; condense them into one causal tableau with only 2–3 narrative anchors; use sparse asymmetric staging and a large low-density area. If secondary detail conflicts with these, omit it.',
    'Dream source: ' + clean(plan.raw_text, 700) + '.',
    'Main event: ' + plan.main_event + '.',
    'Emotion: ' + plan.emotion.join(', ') + ', intensity ' + plan.emotion_intensity.toFixed(2) + '. Setting: ' + plan.setting + '.',
    'Visual elements to preserve: ' + (plan.preserve_elements.join(', ') || 'only the main event') + '.',
    'Reality-breaking rule: ' + anomaly + '.',
    'Hidden symbol: ' + hiddenInstruction + '.',
    'Story logic: the reality-breaking rule must visibly change the action, distance, or structure of the scene; it cannot be a decorative symbol. Join the 2–3 anchors through one readable cause, exchange, or transformation already present in the dream.',
    'Grounding lock: every recognizable person, place, animal, object, gesture, and action must come from the Dream source, the Visual elements to preserve, or the single Reality-breaking rule above. Omit uncertain filler. Do not add a moon, clock, eyes, flowers, occult marks, decorative animals, or a second figure unless explicitly present.',
    'Composition: ' + plan.composition.subject_position + '; ' + plan.composition.visual_flow + '; ' +
      plan.composition.spatial_layers + '; ' + plan.composition.negative_space + '.',
    'Framing: use the plan as a loose staging seed, never as a fixed camera template. Keep one focal event, one continuous eye path, asymmetry, locally clustered detail, and 35–50% breathing room. Use scale mismatch, spatial distortion, or a structural crop only when it clarifies the stated event.',
    'Color system: do not lock the series to a fixed red-and-blue pairing. Use a scene-specific relationship palette with one dominant color field, one clear warm/cool or complementary contrast, one small high-saturation focal accent, and near-black ink or warm paper as stabilizers.',
    'Color palette, exactly 4–6 inks. Color roles for this dream: dominant field ' + palette[0] + '; contrast/action color ' + palette[1] + '; supporting colors ' + palette.slice(2).join(', ') + '. Use 4–6 major flat matte colors, with the dominant field carrying about 45–60% of the image, the contrast color carrying the action, and the focal accent kept localized. Allow hue rotation across dreams; do not distribute colors evenly or turn the image into a single-color filter.',
    'Drawing: rough screenprint and risograph texture with a handmade print character, high-saturation flat color blocks, clear pressure-varied ink contours, limited matte flat fills, slight retro print paper grain and dry-brush breaks, high contrast without realism. Make silhouettes and architecture slightly irregular at the construction level: bowed edges, uneven corners, off-register joins, lopsided circles, and small accidental-looking asymmetries. No traced duplicate outlines.',
    'People: reduce each person to an anonymous cutout figure: one solid garment mass, a head with no face or hair detail, and limbs made from 2–3 simple tapered shapes. Prefer back, side, tiny, or cropped views. No realistic joints, folds, footwear detail, posed anatomy, portrait features, or cartoon expression.',
    'Surface and detail: use a few broad irregular flat masses with sparse marks. No cast shadows, smooth tonal modelling, tiled grids, glossy highlights, gradients, glow, or repeated tiny texture unless the stated dream action requires it.',
    'Represent about 60–70% remembered dream content, 20–25% emotional translation, and 10–15% artistic breathing room or one hidden symbol. Condense the dream; do not illustrate every noun.',
    'Avoid: tarot border, title, number, ornate frame, card mockup, text, letters, watermark, photorealism, 3D/CAD volume, realistic anatomy, ungrounded props, excessive symbols, clutter, centered character template, generic purple fantasy, uniform blue palette, muddy grey-brown filter, pastel wash, rainbow mixing, heavy distressed texture, polished AI stock illustration, smooth vector curves, ruler-straight architecture, perfectly geometric objects, uniform line weight, or repeated sketch contours.'
  ].join('\n');
}

function buildSeedreamGenerationPrompt(plan, stylePreset) {
  const anomaly = clean(plan.anomalies[0] || '没有额外异常，不要自行添加', 120);
  const hiddenSymbol = plan.hidden_symbol
    ? '隐藏符号“' + clean(plan.hidden_symbol, 50) + '”只出现一次且非常隐蔽。'
    : '不要自行添加隐藏符号。';
  const style = normalizeStylePreset(stylePreset) === 'internal_test'
    ? '极简手绘内测画风：单一大色场、匿名剪影人物、粗细变化明显的单线墨迹、少量套色偏移与纸张颗粒。'
    : 'ONEIRO v2.1 内测确认画风：满版连续大面积哑光色场，安静低密度空间约 40–50%。色彩只用钴蓝/群青、朱红、暖赭黄、深绿、近黑、暖纸的角色关系：钴蓝/群青、深绿或暖赭黄承托单一主色场，朱红只作叙事焦点和关键动作，其他颜色仅作少量结构，近黑为墨线，暖纸仅作内含色块；不平均分配颜色。人物只作匿名、背影或侧背剪影。所有轮廓使用单条手绘墨线，粗细变化、略弯、轻微错位；少物件。拒绝商业矢量、规则透视、重复纹理、渐变、发光和投影。';

  return [
    '创作一张原创竖版 3:4 梦境叙事插画；画面全出血，无边框、标题、文字、数字或水印。',
    '梦境事实：' + clean(plan.raw_text, 220) + '。',
    '核心事件：' + clean(plan.main_event, 140) + '。场景：' + clean(plan.setting, 80) + '。',
    '情绪：' + clean(plan.emotion.join('、'), 70) + '，强度 ' + plan.emotion_intensity.toFixed(2) + '。',
    '必须保留：' + clean(plan.preserve_elements.join('、') || plan.main_event, 130) + '。',
    '唯一超现实规则：' + anomaly + '；它必须真实改变动作、距离或空间结构，不能只是装饰。',
    '构图：' + clean([
      plan.composition.subject_position,
      plan.composition.visual_flow,
      plan.composition.negative_space
    ].join('；'), 150) + '。只保留一个焦点和 2–3 个叙事锚点；其余区域保持安静、低密度。',
    style,
    '人物若出现，画成无五官、无写实关节和衣褶的匿名剪影。只画梦境事实中明确出现的人、地点、物体和动作；不确定的细节宁可省略。' + hiddenSymbol,
    '避免写实、3D、光泽、渐变、发光、卡牌框、塔罗装饰、通用紫色幻想、平滑矢量、对称海报、重复纹理和无依据的月亮、时钟、眼睛、花朵、动物或第二个人物。'
  ].join('\n');
}

function buildPlanQualityCheck(plan) {
  const palette = paletteList(plan.palette);
  const recognizableCount = 1 + Math.min(plan.anomalies.length, 1) + plan.preserve_elements.length + (plan.hidden_symbol ? 1 : 0);
  const checks = {
    aspect_ratio_planned: true,
    main_event_present: !!plan.main_event,
    anomaly_count_valid: plan.anomalies.length <= 1,
    preserve_element_count_valid: plan.preserve_elements.length >= 1 && plan.preserve_elements.length <= 4,
    recognizable_element_count_valid: recognizableCount <= 7,
    hidden_symbol_count_valid: !plan.hidden_symbol || typeof plan.hidden_symbol === 'string',
    palette_color_count_valid: palette.length >= 4 && palette.length <= 6,
    asymmetric_composition_planned: !!plan.composition.id,
    breathing_space_planned: /3[5-9]|4[0-9]|50/.test(plan.composition.negative_space)
  };

  return {
    version: 'oneiro-image-quality-v1',
    stage: 'plan_preflight',
    passed: Object.keys(checks).every(function (key) { return checks[key]; }),
    checks: checks,
    semantic_image_checks: {
      text_or_gibberish: 'requires_vision_review',
      clear_focal_point: 'requires_vision_review',
      main_event_visible: 'requires_vision_review',
      unrelated_elements: 'requires_vision_review',
      face_complexity: 'requires_vision_review',
      saturation: 'requires_vision_review',
      gradient_or_3d: 'requires_vision_review',
      density_contrast: 'requires_vision_review',
      thumbnail_readability: 'requires_vision_review'
    }
  };
}

module.exports = {
  STYLE_VERSION: STYLE_VERSION,
  INTERNAL_TEST_STYLE_VERSION: INTERNAL_TEST_STYLE_VERSION,
  STYLE_PRESETS: STYLE_PRESETS,
  EMOTION_PALETTES: EMOTION_PALETTES,
  COMPOSITIONS: COMPOSITIONS,
  normalizeVisualPlan: normalizeVisualPlan,
  normalizeStylePreset: normalizeStylePreset,
  styleVersionForPreset: styleVersionForPreset,
  buildGenerationPrompt: buildGenerationPrompt,
  buildSeedreamGenerationPrompt: buildSeedreamGenerationPrompt,
  buildInternalTestGenerationPrompt: buildInternalTestGenerationPrompt,
  buildPlanQualityCheck: buildPlanQualityCheck,
  paletteList: paletteList
};
