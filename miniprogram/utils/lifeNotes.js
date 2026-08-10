// ── 「关于你的记录」的分组、标签与摘要 ────────────────────────────────
//
// 两个页面用同一份逻辑：资料页只渲染一个入口（几条、在用几条、大致关于什么），
// 详情页渲染完整清单和所有操作。分两份实现会立刻分叉——同一批记录在两页上显示
// 出不同的条数。
//
// 三种来源的可信方式完全不同，界面必须分得开：dream_connection 是 Oneiro 自己
// 写的一句呼应、用户点过「是这样」，把它标成「从你话里提取的」，用户会在自己的
// 资料页读到一句自己从没说过的话。
var LIFE_NOTE_GROUPS = [
  {
    key: 'spoken',
    label: '你说过的话',
    hint: '从你在对话里说的话原样存下来，没有改写。',
    sources: ['', 'portrait_correction']
  },
  {
    key: 'confirmed',
    label: '你认下的解读',
    hint: '这些句子是 Oneiro 写的，你在解读里点过「是这样」。',
    sources: ['dream_connection']
  }
];

// 目录页上一行标签的上限。gist 由云端在提取那一刻生成（不超过 12 字）；没有
// gist 的旧记录退回截断原话——截断不是概括，但至少不假装是。
var NOTE_LABEL_LENGTH = 14;
// 入口上最多列几条标签。再多就又变成一份清单，而入口的职责只是让人知道
// 「这里面大概是些什么」。
var SUMMARY_LABEL_COUNT = 3;

function normalizedClaim(value) {
  return String(value || '').replace(/[\s，。、；：！？…—～·「」『』“”‘’（）()《》,.!?;:~"']/g, '');
}

// 梦册里所有被写过的呼应，连同它出自哪个梦。既用来认领来源，也用来回链梦卡。
function buildConnectionIndex(archive) {
  var index = {};
  (Array.isArray(archive) ? archive : []).forEach(function (dream) {
    var connections = dream && dream.result && dream.result.possible_connections;
    if (!Array.isArray(connections)) return;
    connections.forEach(function (item) {
      var key = normalizedClaim(item);
      if (key && !index[key]) index[key] = { dreamId: dream.id, title: String((dream.result && dream.result.title) || '') };
    });
  });
  return index;
}

function buildDreamIndex(archive) {
  var index = {};
  (Array.isArray(archive) ? archive : []).forEach(function (dream) {
    if (dream && dream.id) {
      index[dream.id] = { id: dream.id, title: String((dream.result && dream.result.title) || '') };
    }
  });
  return index;
}

// 来源不能只靠 source 一个字段：它是旧版云函数会静默省略的字段，而它缺席时的
// 默认值恰好是最糟的那个。本地有第二个、独立的证据：dream_connection 的正文
// 逐字就是某个梦的一条 possible_connections，而整个梦册就在本地缓存里。
function noteSourceOf(note, connectionIndex) {
  var declared = String((note && note.source) || '');
  if (declared) return declared;
  return connectionIndex[normalizedClaim(note && note.text)] ? 'dream_connection' : '';
}

function noteLabel(note) {
  var gist = String((note && note.gist) || '').trim();
  if (gist) return gist.slice(0, NOTE_LABEL_LENGTH);
  var body = String((note && note.text) || '').trim();
  return body.length > NOTE_LABEL_LENGTH ? body.slice(0, NOTE_LABEL_LENGTH) + '…' : body;
}

function noteInUse(note) {
  return !!(note && note.inUseAt && !note.retiredAt);
}

// 云端还没标过谁在用（老数据、或还没生成过画像）时，一切「正在影响 N 条」都是
// 编出来的。这时退回「不知道」，由界面说实话，而不是显示成 0。
function usageUnknown(notes) {
  return notes.length > 0 && !notes.some(function (note) { return note.inUseAt || note.retiredAt; });
}

function decorateNote(note, dreamIndex) {
  var dream = note && note.sourceDreamId ? dreamIndex[note.sourceDreamId] : null;
  return Object.assign({}, note, {
    localKey: (note && (note.localKey || note.id)) || '',
    label: noteLabel(note),
    pinned: !!(note && note.pinnedAt),
    retired: !!(note && note.retiredAt),
    dreamId: dream ? dream.id : '',
    // 梦被删掉时给一句实话，不给死链接。
    dreamLabel: note && note.sourceDreamId ? (dream ? (dream.title || '那个梦') : '梦已删除') : '',
    dreamOpenable: !!dream
  });
}

function groupNotes(notes, archive) {
  var list = Array.isArray(notes) ? notes : [];
  var connectionIndex = buildConnectionIndex(archive);
  var dreamIndex = buildDreamIndex(archive);
  return LIFE_NOTE_GROUPS.map(function (group) {
    var members = list.filter(function (note) {
      return group.sources.indexOf(noteSourceOf(note, connectionIndex)) >= 0;
    }).map(function (note) {
      return decorateNote(note, dreamIndex);
    });
    return {
      key: group.key,
      label: group.label,
      hint: group.hint,
      total: members.length,
      notes: members,
      activeNotes: members.filter(noteInUse),
      dormantNotes: members.filter(function (note) { return !noteInUse(note); }),
      unknownUsage: usageUnknown(members)
    };
  }).filter(function (group) { return group.total > 0; });
}

// 详情页要的形状：每组带折叠状态。
function buildGroups(notes, archive, expandedGroups) {
  var expanded = expandedGroups || {};
  return groupNotes(notes, archive).map(function (group) {
    var groupExpanded = !!expanded[group.key];
    return Object.assign({}, group, {
      expanded: groupExpanded,
      collapsible: !group.unknownUsage && group.dormantNotes.length > 0,
      visibleDormant: group.unknownUsage || groupExpanded ? group.dormantNotes : [],
      dormantCount: group.dormantNotes.length
    });
  });
}

// 资料页入口要的形状：一共几条、在用几条、大致关于什么。入口上只放用户自己
// 说过的那些——Oneiro 写的句子摆在「关于你的记录」的门面上，读起来像是他讲的。
function buildSummary(notes, archive) {
  var groups = groupNotes(notes, archive);
  var spoken = groups.filter(function (group) { return group.key === 'spoken'; })[0];
  var all = groups.reduce(function (acc, group) { return acc.concat(group.notes); }, []);
  var active = all.filter(noteInUse);
  var preferred = spoken ? (spoken.activeNotes.length ? spoken.activeNotes : spoken.notes) : [];
  var pool = preferred.length ? preferred : (active.length ? active : all);
  return {
    total: all.length,
    activeCount: active.length,
    unknownUsage: usageUnknown(all),
    labels: pool.slice(0, SUMMARY_LABEL_COUNT).map(function (note) { return note.label; })
  };
}

module.exports = {
  LIFE_NOTE_GROUPS: LIFE_NOTE_GROUPS,
  NOTE_LABEL_LENGTH: NOTE_LABEL_LENGTH,
  normalizedClaim: normalizedClaim,
  noteSourceOf: noteSourceOf,
  noteLabel: noteLabel,
  buildGroups: buildGroups,
  buildSummary: buildSummary
};
