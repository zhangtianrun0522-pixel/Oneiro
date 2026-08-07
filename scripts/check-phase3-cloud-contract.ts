import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

type Row = Record<string, any>;

function getPath(value: Row, path: string): any {
  return path.split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}

function setPath(value: Row, path: string, next: any): void {
  const parts = path.split('.');
  let current = value;
  parts.slice(0, -1).forEach((key) => {
    if (current[key] === null) throw new Error('mock_nested_update_under_null');
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  current[parts[parts.length - 1]] = next;
}

function isPlainObject(value: any): value is Row {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function matches(row: Row, query: Row): boolean {
  return Object.entries(query || {}).every(([key, value]) => getPath(row, key) === value);
}

function fakeDatabase(seed: Record<string, Row[]>): any {
  let idCounter = 100;
  const failNextUpdates = new Set<string>();
  let beforeNextTransaction: (() => void) | null = null;
  const collections: Record<string, Row[]> = {};
  const command = {
    set(value: any) {
      return { __fakeDbCommand: 'set', value };
    },
  };
  Object.entries(seed).forEach(([name, rows]) => { collections[name] = rows.map((row) => ({ ...row })); });

  function applyUpdate(row: Row, data: Row): void {
    function apply(path: string, value: any): void {
      if (value && value.__fakeDbCommand === 'set') {
        setPath(row, path, value.value);
        return;
      }
      // CloudBase treats a plain object in update() as nested field updates.
      // This deliberately makes result:{...} fail when the stored parent is
      // result:null, matching the production PathNotViable behavior.
      if (isPlainObject(value)) {
        Object.entries(value).forEach(([key, child]) => apply(`${path}.${key}`, child));
        return;
      }
      setPath(row, path, value);
    }

    Object.entries(data).forEach(([key, value]) => apply(key, value));
  }

  function collection(name: string): any {
    if (!collections[name]) collections[name] = [];

    function queryApi(query: Row = {}, order: { key: string; direction: string } | null = null, max = Infinity, offset = 0): any {
      return {
        where(next: Row) { return queryApi(next, order, max, offset); },
        orderBy(key: string, direction: string) { return queryApi(query, { key, direction }, max, offset); },
        skip(value: number) { return queryApi(query, order, max, value); },
        limit(value: number) { return queryApi(query, order, value, offset); },
        async get() {
          let data = collections[name].filter((row) => matches(row, query));
          if (order) {
            data = data.slice().sort((left, right) => {
              const delta = new Date(getPath(left, order.key) || 0).getTime() - new Date(getPath(right, order.key) || 0).getTime();
              return order.direction === 'desc' ? -delta : delta;
            });
          }
          return { data: data.slice(offset, offset + max).map((row) => ({ ...row })) };
        },
        async remove() {
          const before = collections[name].length;
          collections[name] = collections[name].filter((row) => !matches(row, query));
          return { stats: { removed: before - collections[name].length } };
        },
      };
    }

    return {
      ...queryApi(),
      async add({ data }: { data: Row }) {
        const row = { ...data, _id: data._id || `id-${idCounter++}` };
        collections[name].push(row);
        return { _id: row._id };
      },
      doc(id: string) {
        return {
          async get() {
            const row = collections[name].find((item) => item._id === id);
            if (!row) throw new Error('document_not_found');
            return { data: { ...row } };
          },
          async set({ data }: { data: Row }) {
            const index = collections[name].findIndex((item) => item._id === id);
            const row = { ...data, _id: id };
            if (index >= 0) collections[name][index] = row;
            else collections[name].push(row);
            return { stats: { created: index < 0 ? 1 : 0, updated: index >= 0 ? 1 : 0 } };
          },
          async update({ data }: { data: Row }) {
            const failureKey = `${name}:${id}`;
            if (failNextUpdates.has(failureKey)) {
              failNextUpdates.delete(failureKey);
              throw new Error('mock_update_failed');
            }
            const row = collections[name].find((item) => item._id === id);
            if (!row) return { stats: { updated: 0 } };
            applyUpdate(row, data);
            return { stats: { updated: 1 } };
          },
        };
      },
    };
  }

  const database: any = {
    collection,
    command,
    rows: collections,
    failNextUpdate(name: string, id: string) { failNextUpdates.add(`${name}:${id}`); },
    beforeTransaction(work: () => void) { beforeNextTransaction = work; },
  };
  const runTransaction = async (work: (transaction: { collection: typeof collection }) => Promise<any>) => {
      const before = beforeNextTransaction;
      beforeNextTransaction = null;
      if (before) before();
      return work({ collection });
  };
  database.runTransaction = runTransaction;
  database.setTransactionsEnabled = (enabled: boolean) => {
    database.runTransaction = enabled ? runTransaction : undefined;
  };
  return database;
}

function loadCloudFunction(path: string, cloud: Row): (event: Row) => Promise<Row> {
  const module = { exports: {} as Row };
  const sandbox = {
    module,
    exports: module.exports,
    require(request: string) {
      if (request === 'wx-server-sdk') return cloud;
      if (request === 'http') return http;
      if (request === 'https') return https;
      if (request === 'crypto') return crypto;
      throw new Error(`Unexpected require(${request}) in ${path}`);
    },
    console,
    process: { env: {} },
    Buffer,
    URL,
    Date,
    Math,
    Promise,
    Set,
  };
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
  return module.exports.main as (event: Row) => Promise<Row>;
}

const now = new Date();
const database = fakeDatabase({
  users: [{ _id: 'user-1', openid: 'user-a', nickname: 'Runtu', birthDate: '1990-01-02', birthTime: '08:30', birthPlace: '上海', gender: 'male', createdAt: now, updatedAt: now }],
  dream_entries: [1, 2, 3].map((index) => ({
    _id: `dream-cloud-${index}`,
    openid: 'user-a',
    localId: `dream-${index}`,
    dreamText: `第${index}个学校与追逐的梦`,
    status: index === 3 ? 'pending' : 'ready',
    symbols: ['学校', '追逐'],
    emotionalWeather: '紧张',
    chatMessages: index === 1 ? [{ role: 'assistant', content: '你想起了什么？' }, { role: 'user', content: '我想到最近的项目期限。' }] : [],
    revisitAnswer: index === 2 ? '我决定先和同事确认范围。' : '',
    result: { title: `梦${index}`, symbols: ['学校', '追逐'], emotional_weather: '紧张' },
    createdAt: new Date(now.getTime() - index * 1000),
  })).concat([{
    _id: 'dream-other-user', openid: 'user-b', localId: 'private-other', dreamText: '不应被读取', status: 'ready',
    symbols: ['门'], emotionalWeather: '', chatMessages: [], revisitAnswer: '', result: { title: '他人梦', symbols: ['门'], emotional_weather: '' }, createdAt: now,
  }]),
  life_notes: [{ _id: 'note-1', openid: 'user-a', text: '最近担心项目期限', sourceDreamId: 'dream-1', createdAt: now }],
  profile_snapshots: [],
  share_pages: [],
  generated_assets: [],
  deletion_jobs: [],
  profile_memory_state: [],
});

let currentOpenId = 'user-a';
const deletedFiles: string[] = [];
let failFileDelete = false;
const cloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database: () => database,
  getWXContext: () => ({ OPENID: currentOpenId }),
  async deleteFile({ fileList }: { fileList: string[] }) {
    if (failFileDelete) throw new Error('storage unavailable');
    deletedFiles.push(...fileList);
    return {};
  },
  async getTempFileURL({ fileList }: { fileList: string[] }) {
    return {
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: `https://temp.example/${encodeURIComponent(fileID)}`,
      })),
    };
  },
};

const profileMain = loadCloudFunction('miniprogram/cloudfunctions/profileMemory/index.js', cloud);
const firstDraft = await profileMain({ action: 'generate', changeReason: '三条新梦' });
assert.equal(firstDraft.ok, true, JSON.stringify(firstDraft));
assert.equal(firstDraft.snapshot.status, 'confirmed');
assert.equal(firstDraft.snapshot.isCurrent, true);
assert.equal(firstDraft.snapshot.version, 1);
assert.equal(firstDraft.snapshot.changeReason, '三条新梦');
assert.equal(firstDraft.snapshot.profileText, firstDraft.snapshot.summary);
assert.ok(Array.isArray(firstDraft.snapshot.recentContext));
assert.equal(firstDraft.snapshot.summary.includes('这是一份'), false);
assert.ok(firstDraft.snapshot.summary.includes('Runtu'));
assert.ok(firstDraft.snapshot.sourceRefs.length >= 4);
assert.equal(firstDraft.snapshot.sourceRefs.some((ref: Row) => Object.prototype.hasOwnProperty.call(ref, 'excerpt')), false);
assert.equal(JSON.stringify(firstDraft.snapshot.baseProfile), JSON.stringify({ nickname: 'Runtu', birthDate: '1990-01-02', birthTime: '08:30', birthPlace: '上海', gender: 'male' }));
assert.equal(firstDraft.snapshot.sourceCounts.dreamCount, 3);
assert.equal(firstDraft.snapshot.sourceCounts.discussionCount, 2);

// ── 阶段画像是一段话，不是一张表单 ──
//
// 「当下的状态／反复出现的主题／情绪的底色／正在变化的」四个固定小标题，把
// 画像变成了一份分栏统计报告：用户打开它，读到的是系统统计到了什么，而不是
// 自己是谁。梦的条数尤其如此——那是使用统计，不是这个人的样子。
for (const formHeading of ['当下的状态：', '反复出现的主题：', '情绪的底色：', '正在变化的：']) {
  assert.equal(
    firstDraft.snapshot.summary.includes(formHeading),
    false,
    `画像不应带分栏小标题：${formHeading}`
  );
}
assert.doesNotMatch(firstDraft.snapshot.summary, /\d+\s*个梦|第\s*\d+\s*次/, '画像不得播报使用统计');
// 兜底文案也必须明说这份理解可以被推翻，可反驳性是画像可信的前提。
assert.ok(firstDraft.snapshot.summary.includes('修改或忽略'));
// 画像是连续的一段话，不是多行分栏。
assert.equal(firstDraft.snapshot.summary.includes('\n'), false);

// A normal dream discussion is prompt evidence, not a persisted reality clue.
// Only an automatically stored life_note may populate deterministicDraft's
// realLifeContext and its corresponding sourceRefs.
const isolatedDatabase = fakeDatabase({
  users: [{ _id: 'isolated-user', openid: 'isolated-a', nickname: '测试用户', createdAt: now, updatedAt: now }],
  dream_entries: [{
    _id: 'isolated-dream', openid: 'isolated-a', localId: 'isolated-dream',
    dreamText: '一场普通的梦', status: 'ready', symbols: ['门'], emotionalWeather: '平静',
    chatMessages: [{ role: 'user', content: '我最近在换工作，压力有点大。' }],
    result: { title: '普通梦', symbols: ['门'], emotional_weather: '平静' }, createdAt: now,
  }],
  life_notes: [], profile_snapshots: [], profile_memory_state: [], deletion_jobs: [],
});
const isolatedCloud = {
  ...cloud,
  database: () => isolatedDatabase,
  getWXContext: () => ({ OPENID: 'isolated-a' }),
};
const isolatedProfileMain = loadCloudFunction('miniprogram/cloudfunctions/profileMemory/index.js', isolatedCloud);
const chatOnlyPortrait = await isolatedProfileMain({ action: 'generate', changeReason: '聊天语义回归' });
assert.equal(chatOnlyPortrait.ok, true, JSON.stringify(chatOnlyPortrait));
assert.equal(chatOnlyPortrait.snapshot.realLifeContext.some((item: string) => item.includes('换工作')), false);
assert.equal(chatOnlyPortrait.snapshot.sourceRefs.some((ref: Row) => ref.sourceType === 'life_notes'), false);
isolatedDatabase.rows.life_notes.push({
  _id: 'isolated-note', openid: 'isolated-a', text: '我最近在换工作，压力有点大。', sourceDreamId: 'isolated-dream', createdAt: new Date(now.getTime() + 1000),
});
const lifeNotePortrait = await isolatedProfileMain({ action: 'generate', changeReason: '自动生活线索回归' });
assert.equal(lifeNotePortrait.ok, true, JSON.stringify(lifeNotePortrait));
assert.equal(lifeNotePortrait.snapshot.realLifeContext.some((item: string) => item.includes('换工作')), true);
assert.equal(lifeNotePortrait.snapshot.sourceRefs.some((ref: Row) => ref.sourceType === 'life_notes' && ref.sourceId === 'isolated-note'), true);
// 用户在一条呼应上点头，同样成为画像证据——这是这套系统里唯一一次他主动说
// 「对」，不进画像的话，「与你有关」就只是个单向的展示。但它必须和他自己讲出
// 来的事分开标注：那句话是我们写的，画像照抄回去就等于把自己的措辞当成他的
// 原话，越写越确信。
isolatedDatabase.rows.life_notes.push({
  _id: 'isolated-connection', openid: 'isolated-a', source: 'dream_connection',
  text: '梦里门一直关不上，和你最近一直在收尾一件事是同一种姿态。',
  sourceDreamId: 'isolated-dream', createdAt: new Date(now.getTime() + 2000),
});
const connectionPortrait = await isolatedProfileMain({ action: 'generate', changeReason: '已确认呼应回归' });
assert.equal(connectionPortrait.ok, true, JSON.stringify(connectionPortrait));
assert.equal(
  connectionPortrait.snapshot.sourceRefs.some((ref: Row) => ref.sourceType === 'life_notes' && ref.sourceId === 'isolated-connection'),
  true
);
assert.equal(
  connectionPortrait.snapshot.realLifeContext.some((item: string) => item.startsWith('你确认过的呼应：')),
  true
);
// 「你最近提到…」后面只能是用户自己说过的话。已确认的呼应是系统写的句子，引在
// 那里就是把我们的措辞当成他的原话念回去。
assert.equal(connectionPortrait.snapshot.summary.includes('梦里门一直关不上'), false);

const edited = await profileMain({
  action: 'save',
  snapshotId: firstDraft.snapshot._id,
  snapshot: { summary: '这是我确认过措辞的阶段画像。' },
});
assert.equal(edited.snapshot.summary, '这是我确认过措辞的阶段画像。');
assert.ok(edited.snapshot.userEdited);
assert.equal(edited.snapshot.version, 2);
assert.equal(edited.snapshot.status, 'confirmed');
assert.equal(edited.snapshot.isCurrent, true);
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === firstDraft.snapshot._id)?.isCurrent, false);

const confirmed = await profileMain({ action: 'confirm', snapshotId: edited.snapshot._id });
assert.equal(confirmed.snapshot.status, 'confirmed');
assert.equal(confirmed.snapshot.isCurrent, true);

const paused = await profileMain({ action: 'toggleUse', snapshotId: edited.snapshot._id, useInFutureReadings: false });
assert.equal(paused.snapshot.useInFutureReadings, false);

// 只在发生实质变化时才发新版本。以前每次 generate 都无条件发一版，于是每记一个
// 梦画像就 +1，V2 和 V3 常常只是换了说法——版本号一通胀，「你以前的样子」时间轴
// 和「画像更新了」这条召回提示的价值就同时归零，因为它们全都建立在
// 「版本变了 = 真的变了」这个前提上。
const snapshotsBeforeNoOpGenerate = database.rows.profile_snapshots.length;
const noOpGenerate = await profileMain({ action: 'generate', changeReason: '新增现实片段' });
assert.equal(noOpGenerate.ok, true);
assert.equal(noOpGenerate.unchanged, true);
// 证据和结构化断言都没动，不该多出一条快照，版本号也不该往前走。
assert.equal(database.rows.profile_snapshots.length, snapshotsBeforeNoOpGenerate);
assert.equal(noOpGenerate.snapshot.version, edited.snapshot.version);
assert.equal(noOpGenerate.snapshot._id, edited.snapshot._id);
assert.equal(noOpGenerate.snapshot.isCurrent, true);
// 抑制版本的同时必须把溯源刷新到最新：后续解读要用它。
assert.ok(database.rows.profile_snapshots.find((item: Row) => item._id === edited.snapshot._id)?.sourceFingerprint);

// 证据变了、图景也真的变了（出现新意象）：必须照常发新版本。判不准就发版——
// 把一次真实变化吞掉，用户会觉得画像根本不长进，比多一个版本号严重得多。
database.rows.dream_entries.push({
  _id: 'dream-cloud-4', openid: 'user-a', localId: 'dream-4',
  dreamText: '水一直漫上来，我却一点也不慌', status: 'ready',
  symbols: ['水', '涨潮'], emotionalWeather: '平静', chatMessages: [], revisitAnswer: '',
  result: { title: '梦4', symbols: ['水', '涨潮'], emotional_weather: '平静' },
  createdAt: new Date(now.getTime() + 1000),
});
const thirdDraft = await profileMain({ action: 'generate', changeReason: '出现了新的意象' });
assert.equal(thirdDraft.unchanged, undefined);
assert.equal(thirdDraft.snapshot.version, edited.snapshot.version + 1);
assert.equal(thirdDraft.snapshot.status, 'confirmed');
assert.equal(thirdDraft.snapshot.isCurrent, true);
assert.ok(thirdDraft.snapshot.themes.indexOf('水') >= 0);
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === edited.snapshot._id)?.isCurrent, false);

// 新版本写下了自己的证据指纹；下一次同样证据的后台刷新会在调用供应商之前
// 就被挡掉，连一次生成都不该花。
const fingerprintAfterPublish = database.rows.profile_snapshots.find((item: Row) => item._id === thirdDraft.snapshot._id)?.sourceFingerprint;
assert.ok(fingerprintAfterPublish);
const fingerprintGate = await profileMain({ action: 'generate', changeReason: '后台自动刷新' });
assert.equal(fingerprintGate.unchanged, true);
assert.equal(fingerprintGate.unchangedReason, 'evidence_unchanged');
assert.equal(fingerprintGate.snapshot._id, thirdDraft.snapshot._id);

const draftState = await profileMain({ action: 'get' });
assert.equal(draftState.latestDraft, null);
assert.equal(draftState.current._id, thirdDraft.snapshot._id);
assert.equal(draftState.history.filter((item: Row) => item.status === 'draft').length, 0);
const state = await profileMain({ action: 'get' });
assert.equal(state.current._id, thirdDraft.snapshot._id);
assert.equal(state.history.find((item: Row) => item._id === firstDraft.snapshot._id).isCurrent, false);

// Early snapshots used profileText without summary. The response must remain
// displayable without mutating the legacy database record.
database.rows.profile_snapshots.push({
  _id: 'legacy-profile-text', openid: 'user-a', version: 98, status: 'superseded', isCurrent: false,
  profileText: '只存在 profileText 的旧阶段画像', createdAt: now, updatedAt: now
});
const profileTextState = await profileMain({ action: 'get' });
assert.equal(profileTextState.history.find((item: Row) => item._id === 'legacy-profile-text')?.summary, '只存在 profileText 的旧阶段画像');
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === 'legacy-profile-text')?.summary, undefined);

database.rows.profile_snapshots.push({
  _id: 'legacy-draft', openid: 'user-a', version: 99, status: 'draft', isCurrent: false,
  summary: '旧草稿应归入历史', createdAt: now, updatedAt: now
});
const legacyState = await profileMain({ action: 'get' });
assert.equal(legacyState.latestDraft?._id, 'legacy-draft');
assert.equal(legacyState.history.find((item: Row) => item._id === 'legacy-draft')?.status, 'draft');
// 游离旧草稿必须归入历史。这件事和「这次发不发新版本」无关：证据没变时这次
// generate 会被抑制，草稿清理仍然要跑，否则它会一直被 getState 当成待确认版本
// 报出来。
const migrated = await profileMain({ action: 'generate', changeReason: '迁移旧草稿' });
assert.equal(migrated.snapshot.status, 'confirmed');
assert.equal(migrated.snapshot.isCurrent, true);
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === 'legacy-draft')?.status, 'superseded');
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, migrated.snapshot._id);

const restored = await profileMain({ action: 'restore', snapshotId: firstDraft.snapshot._id });
assert.equal(restored.ok, true);
assert.equal(restored.snapshot.status, 'confirmed');
assert.equal(restored.snapshot.isCurrent, true);
// 版本号改为相对断言：写死数字会把「这一步发不发版」的契约藏进一个常量里，
// 而这正是这轮改动的重点。
assert.equal(restored.snapshot.version, migrated.snapshot.version + 1);
assert.equal(restored.snapshot.derivedFromSnapshotId, firstDraft.snapshot._id);
assert.equal(restored.snapshot.changeReason, '从 V1 回溯');
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === migrated.snapshot._id)?.isCurrent, false);
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, restored.snapshot._id);

const portraitsBeforeConcurrentEdit = database.rows.profile_snapshots.length;
database.beforeTransaction(() => {
  database.rows.profile_snapshots.forEach((item: Row) => { item.isCurrent = false; });
  database.rows.profile_snapshots.push({
    _id: 'portrait-concurrent-user-edit',
    openid: 'user-a',
    version: 7,
    status: 'confirmed',
    isCurrent: true,
    summary: '用户在生成过程中保存的新画像',
    profileText: '用户在生成过程中保存的新画像',
    userEdited: true,
    sourceRefs: [],
    createdAt: now,
    updatedAt: new Date(now.getTime() + 1000),
  });
  database.rows.profile_memory_state[0].currentSnapshotId = 'portrait-concurrent-user-edit';
  database.rows.profile_memory_state[0].nextVersion = 8;
});
const concurrentEditPortrait = await profileMain({ action: 'generate', changeReason: '并发编辑回归' });
assert.equal(concurrentEditPortrait.ok, false);
assert.equal(concurrentEditPortrait.reason, 'sources_changed');
assert.equal(database.rows.profile_snapshots.length, portraitsBeforeConcurrentEdit + 1);
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, 'portrait-concurrent-user-edit');

currentOpenId = 'user-b';
const crossUser = await profileMain({ action: 'save', snapshotId: thirdDraft.snapshot._id, snapshot: { summary: '越权' } });
assert.equal(crossUser.reason, 'snapshot_not_found');
currentOpenId = 'user-a';

const portraitsBeforeConcurrentDelete = database.rows.profile_snapshots.length;
database.beforeTransaction(() => {
  database.rows.dream_entries = database.rows.dream_entries.filter((item: Row) => item.localId !== 'dream-3');
  database.rows.deletion_jobs.push({
    _id: 'job-profile-generate-race', openid: 'user-a', sourceDreamId: 'dream-3', resourceType: 'dream', status: 'pending', attempts: 1,
  });
  database.rows.profile_snapshots.forEach((item: Row) => {
    if ((item.sourceRefs || []).some((ref: Row) => ref.sourceLocalId === 'dream-3')) {
      item.stale = true;
      item.isCurrent = false;
    }
  });
  database.rows.profile_memory_state[0].currentSnapshotId = '';
});
const concurrentDeletePortrait = await profileMain({ action: 'generate', changeReason: '删除竞争回归' });
assert.equal(concurrentDeletePortrait.ok, false);
assert.equal(concurrentDeletePortrait.reason, 'sources_changed');
assert.equal(database.rows.profile_snapshots.length, portraitsBeforeConcurrentDelete);
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, '');
assert.equal(database.rows.profile_snapshots.some((item: Row) => item.isCurrent && (item.sourceRefs || []).some((ref: Row) => ref.sourceLocalId === 'dream-3')), false);

database.rows.share_pages.push({ _id: 'share-1', openid: 'user-a', slug: 'card-delete', sourceDreamId: 'dream-1', payload: { title: '梦卡' }, revokedAt: null });
database.rows.generated_assets.push({ _id: 'asset-1', openid: 'user-a', sourceDreamId: 'dream-1', fileId: 'cloud://share-card-1.png' });
database.rows.generated_assets.push({
  _id: 'asset-dream-image-1',
  openid: 'user-a',
  sourceDreamId: 'dream-1',
  file_id: 'cloud://dream-image-1.png',
  image_format: 'png',
  style_preset: 'oneiro-seedream-dream-v2.0',
  created_at: new Date(now.getTime() + 1000),
});
database.rows.profile_snapshots.push({
  _id: 'portrait-delete-source', openid: 'user-a', version: 3, status: 'confirmed', isCurrent: true,
  useInFutureReadings: true,
  sourceRefs: [{ sourceType: 'dream_entries', sourceId: 'dream-cloud-1', sourceLocalId: 'dream-1' }],
});

// Portrait sourceRefs must keep the newest material when there are more than
// the display cap. This mirrors the July 30 records that were previously
// excluded by insertion-order truncation.
const recentPortraitDreamIds: string[] = [];
for (let index = 1; index <= 20; index += 1) {
  const localId = index === 20 ? 'dream-2026-07-30-latest' : `dream-recent-${index}`;
  recentPortraitDreamIds.push(localId);
  database.rows.dream_entries.push({
    _id: `portrait-recent-${index}`, openid: 'user-a', localId,
    dreamText: index === 20 ? '7月30日最新的换工作梦' : `近期梦境 ${index}`,
    status: 'ready', symbols: ['变化'], emotionalWeather: '思索', chatMessages: [],
    result: { title: `近期梦境 ${index}`, symbols: ['变化'], emotional_weather: '思索' },
    createdAt: new Date(now.getTime() + index * 1000),
  });
}
const newestSourcesPortrait = await profileMain({ action: 'generate', changeReason: '最新梦境纳入回归' });
assert.equal(newestSourcesPortrait.ok, true);
assert.equal(newestSourcesPortrait.snapshot.sourceRefs.length, 18);
assert.equal(newestSourcesPortrait.snapshot.sourceRefs.some((ref: Row) => ref.sourceLocalId === 'dream-2026-07-30-latest'), true);
database.rows.dream_entries = database.rows.dream_entries.filter((item: Row) => !recentPortraitDreamIds.includes(item.localId));

const saveDreamMain = loadCloudFunction('miniprogram/cloudfunctions/saveDream/index.js', cloud);
const pendingContractDreamWrite = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读',
  status: 'pending',
  result: null,
  interpretationError: 'ai_provider_error',
  createdAt: now,
} });
assert.equal(pendingContractDreamWrite.ok, true);
const storedPendingDream = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-pending-contract');
assert.equal(storedPendingDream.status, 'pending');
assert.equal(storedPendingDream.result, null);
const pendingSymbolCorrection = await saveDreamMain({ action: 'editSymbol', dreamId: 'dream-pending-contract', oldSymbol: '不存在', newSymbol: '新标签' });
assert.equal(pendingSymbolCorrection.ok, true);
assert.equal(storedPendingDream.result, null);
// Historical records may also have structured non-result fields stored as
// null. A plain-object update would expand these into invalid nested paths.
storedPendingDream.dreamFacts = null;
storedPendingDream.interpretationMeta = null;
const readyRevisionWrite = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读',
  status: 'ready',
  result: {
    title: '已完成',
    symbols: ['云端模型'],
    alternative_reading: '从另一面看，这个梦也可能关乎正在发生的变化。'
  },
  interpretationRevision: 1,
  createdAt: now,
} });
assert.equal(readyRevisionWrite.ok, true);
const stalePendingWrite = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读',
  status: 'pending',
  result: null,
  interpretationRevision: 1,
  createdAt: now,
} });
assert.equal(stalePendingWrite.ok, false);
assert.equal(stalePendingWrite.reason, 'stale_interpretation_write');
const storedReadyDream = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-pending-contract');
assert.equal(storedReadyDream.status, 'ready');
assert.equal(storedReadyDream.result.title, '已完成');
assert.equal(storedReadyDream.result.alternative_reading, '从另一面看，这个梦也可能关乎正在发生的变化。');
assert.equal(JSON.stringify(storedReadyDream.dreamFacts), JSON.stringify({ people: [], places: [], objects: [], actions: [], emotions: [], timeSense: [] }));
assert.equal(storedReadyDream.interpretationMeta.schemaVersion, 'dream-entry-v0.2');
const readySymbolCorrection = await saveDreamMain({ action: 'editSymbol', dreamId: 'dream-pending-contract', oldSymbol: '云端模型', newSymbol: '修正标签' });
assert.equal(readySymbolCorrection.ok, true);
assert.deepEqual(storedReadyDream.symbols, ['修正标签']);
assert.deepEqual(storedReadyDream.result.symbols, ['修正标签']);

// Direct pending -> ready recovery must work independently of editSymbol. The
// strict fake update semantics below would reproduce PathNotViable for a
// plain nested result write, so this locks the production regression itself.
const directPendingWrite = await saveDreamMain({ dream: {
  id: 'dream-direct-null', dreamText: '直接恢复的卡死梦', status: 'pending', result: null, createdAt: now,
} });
assert.equal(directPendingWrite.ok, true);
const directReadyWrite = await saveDreamMain({ dream: {
  id: 'dream-direct-null', dreamText: '直接恢复的卡死梦', status: 'ready', createdAt: now,
  result: {
    title: '直接恢复完成', symbols: ['桥'],
    alternative_reading: '也可以从现实处境的变化来理解。',
  },
} });
assert.equal(directReadyWrite.ok, true);
const storedDirectReady = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-direct-null');
assert.equal(storedDirectReady.status, 'ready');
assert.equal(storedDirectReady.result.title, '直接恢复完成');
assert.equal(storedDirectReady.result.alternative_reading, '也可以从现实处境的变化来理解。');

// Production CloudBase has both transactional and non-transactional update
// paths. A blocked legacy record with result:null must promote to a complete
// ready card without attempting result.alternative_reading as a dot-path.
database.rows.dream_entries.push({
  _id: 'dream-blocked-null', openid: 'user-a', localId: 'dream-blocked-null',
  dreamText: '一条卡死的梦', status: 'blocked', result: null,
  dreamFacts: null, interpretationMeta: null,
  interpretationRevision: 0, createdAt: now,
});
database.setTransactionsEnabled(false);
const blockedRecoveryWrite = await saveDreamMain({ dream: {
  id: 'dream-blocked-null', dreamText: '一条卡死的梦', status: 'ready', interpretationRevision: 1, createdAt: now,
  result: { title: '已从阻塞状态恢复', symbols: ['门'], alternative_reading: '另一个观察角度' },
} });
database.setTransactionsEnabled(true);
assert.equal(blockedRecoveryWrite.ok, true);
const storedBlockedRecovery = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-blocked-null');
assert.equal(storedBlockedRecovery.status, 'ready');
assert.equal(storedBlockedRecovery.result.alternative_reading, '另一个观察角度');

// A malformed historical ready record can also have result:null. The
// same-revision merge path must atomically establish result instead of
// expanding an incoming nested object beneath that null parent.
database.rows.dream_entries.push({
  _id: 'dream-concurrent-null', openid: 'user-a', localId: 'dream-concurrent-null',
  dreamText: '并发合并的旧梦', status: 'ready', result: null,
  interpretationRevision: 3, chatMessages: [], createdAt: now,
});
const concurrentNullMerge = await saveDreamMain({ dream: {
  id: 'dream-concurrent-null', dreamText: '并发合并的旧梦', status: 'ready', interpretationRevision: 3, createdAt: now,
  result: { reflection_answer: '这次并发写入仍应保存', image_quality_status: 'polling' },
} });
assert.equal(concurrentNullMerge.ok, true);
assert.equal(concurrentNullMerge.merged, true);
const storedConcurrentNull = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-concurrent-null');
assert.equal(storedConcurrentNull.result.reflection_answer, '这次并发写入仍应保存');
storedReadyDream.result.title = '云端更新后的标题';
storedReadyDream.result.card_insight = '云端更新后的卡背文案';
storedReadyDream.updatedAt = new Date(now.getTime() + 5000);
const staleReadyOverwrite = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读',
  status: 'ready',
  result: {
    public_title: '新的精修公开标题',
    title: '新的精修标题',
    card_insight: '新的精修卡背文案',
    personal_connection: '新的精修私人关联',
    finalized_at: '2026-07-31T12:00:00.000Z',
    refinement_provider: 'deepseek-refinement-v1',
    image_file_id: 'cloud://first-fast-image.png',
    imageUrl: 'https://temp.example/first-fast-image.png',
    image_provider: 'openai',
    image_model: 'gpt-image-1',
    image_format: 'png',
    image_bytes: 1200,
    image_quality_job_id: 'quality-first-job',
    image_quality_status: 'polling',
    image_generation_token: 'image-mdr0a0bc-firstjob',
    symbols: ['云端模型'],
    reflection_answer: '这是并发写入的新反馈'
  },
  chatMessages: [{
    role: 'user',
    content: '这是生图期间新增的聊天',
    createdAt: new Date(now.getTime() + 6000),
  }],
  interpretationRevision: 1,
  createdAt: now,
  updatedAt: now,
} });
assert.equal(staleReadyOverwrite.ok, true);
assert.equal(staleReadyOverwrite.merged, true);
assert.equal(staleReadyOverwrite.updated, true);
assert.equal(storedReadyDream.result.image_file_id, 'cloud://first-fast-image.png');
assert.equal(storedReadyDream.result.imageUrl, 'https://temp.example/first-fast-image.png');
assert.equal(storedReadyDream.result.image_provider, 'openai');
assert.equal(storedReadyDream.result.image_model, 'gpt-image-1');
assert.equal(storedReadyDream.result.image_format, 'png');
assert.equal(storedReadyDream.result.image_bytes, 1200);
assert.equal(storedReadyDream.result.image_quality_job_id, 'quality-first-job');
assert.equal(storedReadyDream.result.image_quality_status, 'polling');
assert.equal(storedReadyDream.result.public_title, '新的精修公开标题');
assert.equal(storedReadyDream.result.title, '新的精修标题');
assert.equal(storedReadyDream.result.card_insight, '新的精修卡背文案');
assert.equal(storedReadyDream.result.reflection_answer, '这是并发写入的新反馈');
assert.equal(storedReadyDream.result.personal_connection, '新的精修私人关联');
assert.equal(storedReadyDream.result.finalized_at, '2026-07-31T12:00:00.000Z');
assert.equal(storedReadyDream.result.refinement_provider, 'deepseek-refinement-v1');
assert.equal(storedReadyDream.chatMessages[0].content, '这是生图期间新增的聊天');

// This is the actual page-quality write shape: its ready/high result shares
// the fast image's generation token and must replace the whole image bundle.
const highQualityPromotion = await saveDreamMain({ dream: {
  id: 'dream-pending-contract', dreamText: '等待云端模型解读', status: 'ready', interpretationRevision: 1, createdAt: now,
  result: {
    image_file_id: 'cloud://newer-high-image.png',
    imageUrl: 'https://temp.example/newer-high-image.png',
    image_provider: 'quality-provider', image_model: 'quality-model',
    image_quality_job_id: 'quality-newer-job', image_quality_status: 'ready', image_quality: 'high',
    image_generation_token: 'image-mdr0a0bc-firstjob'
  }
} });
assert.equal(highQualityPromotion.ok, true);
assert.equal(storedReadyDream.result.image_file_id, 'cloud://newer-high-image.png');
assert.equal(storedReadyDream.result.image_model, 'quality-model');
assert.equal(storedReadyDream.result.image_quality, 'high');

const oldRefinementSnapshot = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读',
  status: 'ready',
  result: {
    public_title: '旧精修公开标题不应覆盖',
    title: '旧精修标题不应覆盖',
    card_insight: '旧精修卡背不应覆盖',
    personal_connection: '旧精修私人关联不应覆盖',
    finalized_at: '2026-07-30T12:00:00.000Z',
    refinement_provider: 'old-refinement-provider',
    reflection_answer: '旧精修答案不应覆盖',
    image_file_id: 'cloud://old-fast-image.png',
    imageUrl: 'https://temp.example/old-fast-image.png',
    image_provider: 'old-fast-provider',
    image_quality_job_id: 'quality-old-job',
    image_quality_status: 'polling',
    image_generation_token: 'image-mdr0a0bc-firstjob'
  },
  interpretationRevision: 1,
  createdAt: now,
  updatedAt: now,
} });
assert.equal(oldRefinementSnapshot.ok, true);
assert.equal(oldRefinementSnapshot.merged, true);
assert.equal(storedReadyDream.result.reflection_answer, '这是并发写入的新反馈');
assert.equal(storedReadyDream.result.public_title, '新的精修公开标题');
assert.equal(storedReadyDream.result.title, '新的精修标题');
assert.equal(storedReadyDream.result.card_insight, '新的精修卡背文案');
assert.equal(storedReadyDream.result.personal_connection, '新的精修私人关联');
assert.equal(storedReadyDream.result.finalized_at, '2026-07-31T12:00:00.000Z');
assert.equal(storedReadyDream.result.refinement_provider, 'deepseek-refinement-v1');
assert.equal(storedReadyDream.result.image_file_id, 'cloud://newer-high-image.png');
assert.equal(storedReadyDream.result.imageUrl, 'https://temp.example/newer-high-image.png');
assert.equal(storedReadyDream.result.image_provider, 'quality-provider');
assert.equal(storedReadyDream.result.image_quality_job_id, 'quality-newer-job');
assert.equal(storedReadyDream.result.image_quality_status, 'ready');

// A manual refresh carries a request token. Its completed fast image is a
// newer requested version and therefore replaces the prior high-quality
// bundle atomically; an old refresh snapshot can never put the high card back.
const refreshedImageWrite = await saveDreamMain({ dream: {
  id: 'dream-pending-contract',
  dreamText: '等待云端模型解读', status: 'ready', interpretationRevision: 1, createdAt: now,
  result: {
    image_file_id: 'cloud://refreshed-fast-image.png',
    imageUrl: 'https://temp.example/refreshed-fast-image.png',
    image_provider: 'refresh-provider', image_model: 'refresh-model',
    image_quality: 'fast', image_quality_status: 'idle',
    image_generation_token: 'refresh-mdr0a1bc-newrefresh',
    image_refresh_token: 'refresh-mdr0a1bc-newrefresh'
  }
} });
assert.equal(refreshedImageWrite.ok, true);
assert.equal(storedReadyDream.result.image_file_id, 'cloud://refreshed-fast-image.png');
assert.equal(storedReadyDream.result.imageUrl, 'https://temp.example/refreshed-fast-image.png');
assert.equal(storedReadyDream.result.image_provider, 'refresh-provider');
assert.equal(storedReadyDream.result.image_model, 'refresh-model');
assert.equal(storedReadyDream.result.image_refresh_token, 'refresh-mdr0a1bc-newrefresh');
assert.equal(storedReadyDream.result.image_quality_status, 'idle');

// After a refresh fast image is stored, the same generation may advance into
// a quality queue without replacing that image or carrying the old high state.
const refreshedQualityQueued = await saveDreamMain({ dream: {
  id: 'dream-pending-contract', dreamText: '等待云端模型解读', status: 'ready', interpretationRevision: 1, createdAt: now,
  result: {
    image_quality: 'fast', image_quality_status: 'polling', image_quality_job_id: 'quality-refresh-job',
    image_generation_token: 'refresh-mdr0a1bc-newrefresh', image_refresh_token: 'refresh-mdr0a1bc-newrefresh'
  }
} });
assert.equal(refreshedQualityQueued.ok, true);
assert.equal(storedReadyDream.result.image_file_id, 'cloud://refreshed-fast-image.png');
assert.equal(storedReadyDream.result.image_quality, 'fast');
assert.equal(storedReadyDream.result.image_quality_status, 'polling');
assert.equal(storedReadyDream.result.image_quality_job_id, 'quality-refresh-job');

const delayedOldRefresh = await saveDreamMain({ dream: {
  id: 'dream-pending-contract', dreamText: '等待云端模型解读', status: 'ready', interpretationRevision: 1, createdAt: now,
  result: {
    image_file_id: 'cloud://stale-high-image.png', imageUrl: 'https://temp.example/stale-high-image.png',
    image_provider: 'stale-provider', image_quality: 'high', image_quality_status: 'ready',
    image_generation_token: 'refresh-mdr0a0bc-oldrefresh', image_refresh_token: 'refresh-mdr0a0bc-oldrefresh'
  }
} });
assert.equal(delayedOldRefresh.ok, true);
assert.equal(storedReadyDream.result.image_file_id, 'cloud://refreshed-fast-image.png');
assert.equal(storedReadyDream.result.image_quality, 'fast');

database.rows.dream_entries = database.rows.dream_entries.filter((item: Row) => ![
  'dream-pending-contract', 'dream-direct-null', 'dream-blocked-null', 'dream-concurrent-null',
  // 只为「图景真的变了要发新版本」那一段而加的梦，不属于归档列表的基线。
  'dream-4'
].includes(item.localId));
const archiveList = await saveDreamMain({ action: 'list' });
assert.equal(archiveList.ok, true);
assert.equal(archiveList.dreams.length, 2);
assert.equal(archiveList.dreams.some((item: Row) => item.localId === 'private-other'), false);
assert.equal(Object.prototype.hasOwnProperty.call(archiveList.dreams[0], 'openid'), false);
const recoveredDream = archiveList.dreams.find((item: Row) => item.localId === 'dream-1');
assert.equal(recoveredDream.result.image_file_id, 'cloud://dream-image-1.png');
assert.equal(recoveredDream.result.imageUrl, 'https://temp.example/cloud%3A%2F%2Fdream-image-1.png');
// 表态必须活过一次云端往返。dream_entries 是严格白名单，而归档页会用云端记录
// 盖回本地（同一条记录云端更新时间更晚，远端胜出），所以字段没进白名单的后果
// 不是「云端存不下」，而是用户逛一次归档回来，刚点过的「是这样」全部弹回未选
// 中——上行出去的证据还在 life_notes 里，但他看到的是自己的判断凭空消失。
const verdictSentence = '学校与迟到可能和近期的截止时间有关。';
await saveDreamMain({
  dream: {
    id: 'dream-2', dreamText: '一场普通的梦', status: 'ready',
    result: { title: '普通梦', possible_connections: [verdictSentence] },
    connectionVerdicts: {
      [verdictSentence]: { verdict: 'confirmed', text: verdictSentence, at: now.toISOString() },
      '不该留下的一条': { verdict: '', text: '不该留下的一条' },
    },
    connectionToCorrect: '',
    connectionCorrectionRaisedFor: verdictSentence,
  },
});
const verdictRecord = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-2');
assert.equal(verdictRecord.connectionVerdicts[verdictSentence].verdict, 'confirmed');
assert.equal(verdictRecord.connectionCorrectionRaisedFor, verdictSentence);
// 只有 confirmed / rejected 是真的表态。空裁决是「已撤销」，不该以记录形式留下。
assert.equal(Object.prototype.hasOwnProperty.call(verdictRecord.connectionVerdicts, '不该留下的一条'), false);

const lifeNotes = await saveDreamMain({ action: 'listLifeNotes' });
assert.equal(lifeNotes.notes.length, 1);
const addedLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'dream-2', text: '这是确认过的现实片段' });
assert.equal(addedLifeNote.ok, true);
assert.equal(database.rows.life_notes.some((item: Row) => item._id === addedLifeNote.id), true);
const lifeNoteCountAfterAdd = database.rows.life_notes.length;
const duplicateLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'dream-2', text: '  这是确认过的现实片段  ' });
assert.equal(duplicateLifeNote.ok, true);
assert.equal(duplicateLifeNote.id, addedLifeNote.id);
assert.equal(duplicateLifeNote.deduplicated, true);
assert.equal(database.rows.life_notes.length, lifeNoteCountAfterAdd);
const crossUserLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'private-other', text: '不应写入' });
assert.equal(crossUserLifeNote.reason, 'dream_deleted');
// 用户在「与你有关」某条呼应上点「是这样」，走的就是这条管子，只多带一个
// source。来源必须跟着记录一起存下去：画像那头要靠它分辨这句话是用户自己讲的
// 事，还是他在我们写的一句话上点了头——后者不能被当成他的原话复述回去。
const confirmedConnectionNote = await saveDreamMain({
  action: 'addLifeNote', dreamId: 'dream-2', text: '梦里水漫上来你却不慌，和你最近一直在接住很多事是同一种姿态', source: 'dream_connection',
});
assert.equal(confirmedConnectionNote.ok, true);
assert.equal(
  database.rows.life_notes.find((item: Row) => item._id === confirmedConnectionNote.id)?.source,
  'dream_connection'
);
// 白名单之外的 source 不落库，客户端传什么都不能变成一个新的证据类别。
const unknownSourceNote = await saveDreamMain({
  action: 'addLifeNote', dreamId: 'dream-2', text: '来源不明的片段', source: 'whatever',
});
assert.equal(unknownSourceNote.ok, true);
assert.equal(database.rows.life_notes.find((item: Row) => item._id === unknownSourceNote.id)?.source, '');
await saveDreamMain({ action: 'deleteLifeNote', noteId: confirmedConnectionNote.id });
await saveDreamMain({ action: 'deleteLifeNote', noteId: unknownSourceNote.id });
await saveDreamMain({ action: 'deleteLifeNote', noteId: addedLifeNote.id });
const editedLifeNote = await saveDreamMain({ action: 'editLifeNote', noteId: 'note-1', text: '项目期限已经调整' });
assert.equal(editedLifeNote.ok, true);
assert.equal(database.rows.life_notes[0].text, '项目期限已经调整');
const deletedLifeNote = await saveDreamMain({ action: 'deleteLifeNote', noteId: 'note-1' });
assert.equal(deletedLifeNote.ok, true);
assert.equal(database.rows.life_notes.length, 0);
database.rows.life_notes.push({ _id: 'note-retry', openid: 'user-a', text: '需要一致删除', sourceDreamId: 'dream-2', createdAt: now });
database.rows.profile_snapshots.push({
  _id: 'portrait-note-retry', openid: 'user-a', status: 'confirmed', useInFutureReadings: true,
  sourceRefs: [{ sourceType: 'life_notes', sourceId: 'note-retry' }],
});
database.failNextUpdate('profile_snapshots', 'portrait-note-retry');
const pendingLifeNoteEdit = await saveDreamMain({ action: 'editLifeNote', noteId: 'note-retry', text: '修改后内容' });
assert.equal(pendingLifeNoteEdit.reason, 'life_note_update_pending');
assert.equal(database.rows.life_notes.find((item: Row) => item._id === 'note-retry')?.text, '需要一致删除');
const completedLifeNoteEdit = await saveDreamMain({ action: 'editLifeNote', noteId: 'note-retry', text: '修改后内容' });
assert.equal(completedLifeNoteEdit.ok, true);
assert.equal(database.rows.life_notes.find((item: Row) => item._id === 'note-retry')?.text, '修改后内容');
const portraitNoteRetry = database.rows.profile_snapshots.find((item: Row) => item._id === 'portrait-note-retry');
portraitNoteRetry.sourceRefs = [{ sourceType: 'life_notes', sourceId: 'note-retry' }];
portraitNoteRetry.useInFutureReadings = true;
portraitNoteRetry.stale = false;
database.failNextUpdate('profile_snapshots', 'portrait-note-retry');
const pendingLifeNoteDelete = await saveDreamMain({ action: 'deleteLifeNote', noteId: 'note-retry' });
assert.equal(pendingLifeNoteDelete.reason, 'life_note_deletion_pending');
assert.equal(database.rows.life_notes.some((item: Row) => item._id === 'note-retry'), true);
const completedLifeNoteDelete = await saveDreamMain({ action: 'deleteLifeNote', noteId: 'note-retry' });
assert.equal(completedLifeNoteDelete.ok, true);
assert.equal(database.rows.life_notes.some((item: Row) => item._id === 'note-retry'), false);
database.rows.life_notes.push({
  _id: 'note-from-dream-delete', openid: 'user-a', text: '来自即将删除梦境的现实片段', sourceDreamId: 'dream-1', createdAt: now,
});
database.rows.profile_snapshots.push({
  _id: 'portrait-life-note-delete-source', openid: 'user-a', status: 'confirmed', isCurrent: true,
  useInFutureReadings: true,
  summary: '包含即将删除的现实片段',
  sourceRefs: [{ sourceType: 'life_notes', sourceId: 'note-from-dream-delete' }],
});
const deleted = await saveDreamMain({ action: 'delete', dreamId: 'dream-1' });
assert.equal(deleted.ok, true);
assert.equal(database.rows.dream_entries.some((item: Row) => item.localId === 'dream-1'), false);
assert.equal(database.rows.life_notes.some((item: Row) => item.sourceDreamId === 'dream-1'), false);
assert.equal(database.rows.share_pages.find((item: Row) => item._id === 'share-1')?.revoked, true);
assert.equal(database.rows.generated_assets.some((item: Row) => item._id === 'asset-1'), false);
assert.deepEqual(deletedFiles, ['cloud://share-card-1.png', 'cloud://dream-image-1.png']);
const invalidated = database.rows.profile_snapshots.find((item: Row) => item._id === 'portrait-delete-source');
assert.equal(invalidated?.stale, true);
assert.equal(invalidated?.useInFutureReadings, false);
assert.equal(invalidated?.sourceRefs.length, 0);
assert.equal(invalidated?.traits.length, 0);
assert.equal(invalidated?.aiOriginal, null);
const invalidatedLifeNotePortrait = database.rows.profile_snapshots.find((item: Row) => item._id === 'portrait-life-note-delete-source');
assert.equal(invalidatedLifeNotePortrait?.stale, true);
assert.equal(invalidatedLifeNotePortrait?.useInFutureReadings, false);
assert.equal(invalidatedLifeNotePortrait?.sourceRefs.length, 0);
const lateDreamWrite = await saveDreamMain({ dream: {
  id: 'dream-1', dreamText: '延迟回调不应复活已删除梦', status: 'ready', result: { title: '延迟梦' }, createdAt: now,
} });
assert.equal(lateDreamWrite.reason, 'dream_deleted');
assert.equal(database.rows.dream_entries.some((item: Row) => item.localId === 'dream-1'), false);
const lateLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'dream-1', text: '删除后的迟到现实片段' });
assert.equal(lateLifeNote.reason, 'dream_deleted');
assert.equal(database.rows.life_notes.some((item: Row) => item.text === '删除后的迟到现实片段'), false);

const createShareMain = loadCloudFunction('miniprogram/cloudfunctions/createShareCard/index.js', cloud);
const dreamTwo = database.rows.dream_entries.find((item: Row) => item.localId === 'dream-2');
dreamTwo.result = Object.assign({}, dreamTwo.result, {
  title: '回答中的私人地点',
  public_title: '电话 13800138000',
  reflection_answer: '我的真实住址和关系片段',
  card_insight: '用户回答：我的真实住址和关系片段',
  one_small_act: '写下学校门口的感受',
});
const share = await createShareMain({
  dream: {
    id: 'dream-2', createdAt: now,
    result: { title: '电话 13800138000', card_no: 'NO. 002', symbols: ['学校'], card_insight: '联系 dreamer@example.com' },
  },
  imageFileId: 'cloud://safe-card.png',
});
assert.equal(share.ok, true);
assert.equal(Object.prototype.hasOwnProperty.call(share.payload, 'localDreamId'), false);
assert.equal(Object.prototype.hasOwnProperty.call(share.payload, 'createdAt'), false);
assert.ok(share.payload.title.includes('[已隐藏]'));
assert.equal(share.payload.title.includes('私人地点'), false);
assert.equal(share.payload.cardInsight, '写下学校门口的感受');
assert.equal(JSON.stringify(share.payload).includes('我的真实住址'), false);
assert.equal(database.rows.generated_assets.some((item: Row) => item.type === 'share_card'), false);
const forgedShare = await createShareMain({ dream: { id: 'private-other' }, imageFileId: 'cloud://someone-else.png' });
assert.equal(forgedShare.reason, 'dream_not_found');
const deletedDreamShare = await createShareMain({ dream: { id: 'dream-1' } });
assert.equal(deletedDreamShare.reason, 'dream_not_found');

database.rows.dream_entries.push({ _id: 'dream-retry-cloud', openid: 'user-a', localId: 'dream-retry', dreamText: '等待删除', status: 'ready', result: { title: '等待' }, createdAt: now });
database.rows.generated_assets.push({ _id: 'asset-retry', openid: 'user-a', sourceDreamId: 'dream-retry', file_id: 'cloud://retry.png' });
failFileDelete = true;
const pendingDelete = await saveDreamMain({ action: 'delete', dreamId: 'dream-retry' });
assert.equal(pendingDelete.reason, 'deletion_pending');
assert.equal(database.rows.dream_entries.some((item: Row) => item.localId === 'dream-retry'), true);
assert.equal(database.rows.generated_assets.some((item: Row) => item._id === 'asset-retry'), true);
const pendingDreamWrite = await saveDreamMain({ dream: {
  id: 'dream-retry', dreamText: '删除中的延迟写入', status: 'ready', result: { title: '不应写入' }, createdAt: now,
} });
assert.equal(pendingDreamWrite.reason, 'dream_deleted');
const pendingDreamShare = await createShareMain({ dream: { id: 'dream-retry' } });
assert.equal(pendingDreamShare.reason, 'dream_not_found');
failFileDelete = false;
const completedDelete = await saveDreamMain({ action: 'delete', dreamId: 'dream-retry' });
assert.equal(completedDelete.ok, true);
assert.equal(database.rows.dream_entries.some((item: Row) => item.localId === 'dream-retry'), false);

database.rows.deletion_jobs.push({
  _id: 'job-missing-main', openid: 'user-a', sourceDreamId: 'dream-missing-main', resourceType: 'dream', status: 'pending', attempts: 1,
});
const recoveredMissingMainDelete = await saveDreamMain({ action: 'delete', dreamId: 'dream-missing-main' });
assert.equal(recoveredMissingMainDelete.ok, true);
assert.equal(database.rows.deletion_jobs.find((item: Row) => item._id === 'job-missing-main')?.status, 'completed');

const getShareMain = loadCloudFunction('miniprogram/cloudfunctions/getShareCard/index.js', cloud);
database.rows.share_pages.push({ _id: 'revoked-share', slug: 'revoked-card', revokedAt: now, payload: { title: '不应读取' } });
const revoked = await getShareMain({ shareId: 'revoked-card' });
assert.equal(revoked.reason, 'not_found');

console.log('Phase 3 CloudBase contract checks passed.');
