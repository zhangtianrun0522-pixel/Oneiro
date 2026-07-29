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
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  current[parts[parts.length - 1]] = next;
}

function matches(row: Row, query: Row): boolean {
  return Object.entries(query || {}).every(([key, value]) => getPath(row, key) === value);
}

function fakeDatabase(seed: Record<string, Row[]>): any {
  let idCounter = 100;
  const failNextUpdates = new Set<string>();
  let beforeNextTransaction: (() => void) | null = null;
  const collections: Record<string, Row[]> = {};
  Object.entries(seed).forEach(([name, rows]) => { collections[name] = rows.map((row) => ({ ...row })); });

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
            Object.entries(data).forEach(([key, value]) => setPath(row, key, value));
            return { stats: { updated: 1 } };
          },
        };
      },
    };
  }

  return {
    collection,
    rows: collections,
    failNextUpdate(name: string, id: string) { failNextUpdates.add(`${name}:${id}`); },
    beforeTransaction(work: () => void) { beforeNextTransaction = work; },
    async runTransaction(work: (transaction: { collection: typeof collection }) => Promise<any>) {
      const before = beforeNextTransaction;
      beforeNextTransaction = null;
      if (before) before();
      return work({ collection });
    },
  };
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
assert.equal(firstDraft.ok, true);
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

const secondDraft = await profileMain({ action: 'generate', changeReason: '新增现实片段' });
assert.equal(secondDraft.snapshot.version, 3);
assert.equal(secondDraft.snapshot.status, 'confirmed');
assert.equal(secondDraft.snapshot.isCurrent, true);
const thirdDraft = await profileMain({ action: 'generate', changeReason: '重新提炼整体摘要' });
assert.equal(thirdDraft.snapshot.version, 4);
assert.equal(thirdDraft.snapshot.status, 'confirmed');
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === secondDraft.snapshot._id)?.isCurrent, false);
const draftState = await profileMain({ action: 'get' });
assert.equal(draftState.latestDraft, null);
assert.equal(draftState.current._id, thirdDraft.snapshot._id);
assert.equal(draftState.history.filter((item: Row) => item.status === 'draft').length, 0);
const state = await profileMain({ action: 'get' });
assert.equal(state.current._id, thirdDraft.snapshot._id);
assert.equal(state.history.find((item: Row) => item._id === firstDraft.snapshot._id).isCurrent, false);

database.rows.profile_snapshots.push({
  _id: 'legacy-draft', openid: 'user-a', version: 99, status: 'draft', isCurrent: false,
  summary: '旧草稿应归入历史', createdAt: now, updatedAt: now
});
const legacyState = await profileMain({ action: 'get' });
assert.equal(legacyState.latestDraft, null);
assert.equal(legacyState.history.find((item: Row) => item._id === 'legacy-draft')?.status, 'superseded');
const migrated = await profileMain({ action: 'generate', changeReason: '迁移旧草稿' });
assert.equal(migrated.snapshot.status, 'confirmed');
assert.equal(migrated.snapshot.isCurrent, true);
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === 'legacy-draft')?.status, 'superseded');
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, migrated.snapshot._id);

const restored = await profileMain({ action: 'restore', snapshotId: firstDraft.snapshot._id });
assert.equal(restored.ok, true);
assert.equal(restored.snapshot.status, 'confirmed');
assert.equal(restored.snapshot.isCurrent, true);
assert.equal(restored.snapshot.version, 6);
assert.equal(restored.snapshot.derivedFromSnapshotId, firstDraft.snapshot._id);
assert.equal(restored.snapshot.changeReason, '从 V1 回溯');
assert.equal(database.rows.profile_snapshots.find((item: Row) => item._id === migrated.snapshot._id)?.isCurrent, false);
assert.equal(database.rows.profile_memory_state[0].currentSnapshotId, restored.snapshot._id);

currentOpenId = 'user-b';
const crossUser = await profileMain({ action: 'save', snapshotId: secondDraft.snapshot._id, snapshot: { summary: '越权' } });
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

const saveDreamMain = loadCloudFunction('miniprogram/cloudfunctions/saveDream/index.js', cloud);
const archiveList = await saveDreamMain({ action: 'list' });
assert.equal(archiveList.ok, true);
assert.equal(archiveList.dreams.length, 2);
assert.equal(archiveList.dreams.some((item: Row) => item.localId === 'private-other'), false);
assert.equal(Object.prototype.hasOwnProperty.call(archiveList.dreams[0], 'openid'), false);
const recoveredDream = archiveList.dreams.find((item: Row) => item.localId === 'dream-1');
assert.equal(recoveredDream.result.image_file_id, 'cloud://dream-image-1.png');
assert.equal(recoveredDream.result.imageUrl, 'https://temp.example/cloud%3A%2F%2Fdream-image-1.png');
const lifeNotes = await saveDreamMain({ action: 'listLifeNotes' });
assert.equal(lifeNotes.notes.length, 1);
const addedLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'dream-2', text: '这是确认过的现实片段' });
assert.equal(addedLifeNote.ok, true);
assert.equal(database.rows.life_notes.some((item: Row) => item._id === addedLifeNote.id), true);
const crossUserLifeNote = await saveDreamMain({ action: 'addLifeNote', dreamId: 'private-other', text: '不应写入' });
assert.equal(crossUserLifeNote.reason, 'dream_deleted');
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
