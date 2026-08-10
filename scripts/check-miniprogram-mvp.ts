import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';

type CommonJSModule<T> = {
  exports: T;
};

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

function loadCommonJS<T>(
  path: string,
  globals: Record<string, unknown> = {},
  modules: Record<string, unknown> = {}
): T {
  const module: CommonJSModule<T> = { exports: {} as T };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    Date,
    require: (request: string) => {
      if (Object.prototype.hasOwnProperty.call(modules, request)) {
        return modules[request];
      }
      throw new Error(`Unexpected require(${request}) while loading ${path}`);
    },
    ...globals,
  };

  vm.runInNewContext(read(path), sandbox, { filename: path });
  return module.exports;
}

function assertIncludes(path: string, expected: string): void {
  assert.ok(read(path).includes(expected), `${path} should include ${expected}`);
}

function assertNotIncludes(path: string, unexpected: string): void {
  assert.ok(!read(path).includes(unexpected), `${path} should not include ${unexpected}`);
}

function assertJson(path: string): void {
  JSON.parse(read(path));
}

function assertTrackedRuntimeFile(path: string): void {
  assert.equal(fs.existsSync(path), true, `${path} should exist in the release snapshot`);
  let tracked = false;
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', path], { stdio: 'ignore' });
    tracked = true;
  } catch (_error) {
    tracked = false;
  }
  if (!tracked) {
    // The contract runs before the caller stages a new release file. Accept a
    // visible worktree addition while still rejecting files hidden by ignore
    // rules or absent from the snapshot entirely.
    const status = execFileSync('git', ['status', '--short', '--', path], { encoding: 'utf8' });
    assert.match(status, /^(?:\?\?|[ MARC])[ MARC]/m, `${path} should be tracked or present as a release worktree addition`);
  }
}

function last<T>(values: T[]): T {
  assert.ok(values.length > 0, 'expected a non-empty array');
  return values[values.length - 1];
}

for (const requiredRuntimeFile of [
  'miniprogram/utils/recorderRouter.js',
  'miniprogram/utils/syncQueue.js',
]) {
  assertTrackedRuntimeFile(requiredRuntimeFile);
}

type AcceptanceModule = {
  acceptanceDreamText: string;
  acceptanceDreamResult: Record<string, unknown> & {
    title: string;
    symbols: string[];
  };
};

type DreamArtifactsModule = {
  computeArchetype: (archive: unknown[]) => {
    eligible: boolean;
    archetype?: {
      label: string;
      description: string;
      evidenceKeyword: string;
      evidenceCount: number;
      disclaimer: string;
    };
  };
  buildTopicCard: (symbol: string) => {
    symbol: string;
    headline: string;
    prompt: string;
  };
};

type DreamMemoryModule = {
  buildInsights: (archive: unknown[]) => Record<string, any>;
  buildProfileDraft: (
    profile: Record<string, unknown>,
    archive: unknown[],
    nextVersion: number,
    changeReason: string
  ) => Record<string, any>;
};

type CanvasFrameModule = {
  drawOrnamentalFrame: (
    ctx: unknown,
    width: number,
    height: number,
    options?: Record<string, unknown>
  ) => void;
};

type ContentSafetyModule = {
  validateDreamText: (value: string) => {
    safe: boolean;
    message: string;
  };
};

type AnalyticsModule = {
  STORAGE_KEY: string;
  trackEvent: (eventName: string, metadata?: Record<string, unknown>) => unknown;
  getEvents: () => Array<{
    name: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  clearEvents: () => void;
};

type CloudBaseModule = {
  CLOUD_STATUS_KEY: string;
  initCloud: (callback?: Function) => boolean;
  getIdentity: (callback?: Function) => void;
  saveProfile: (profile: Record<string, unknown>, callback?: Function) => boolean;
  getProfileMemory: (callback?: Function) => boolean;
  generateProfilePortrait: (changeReason: string, callback?: Function) => boolean;
  saveProfilePortrait: (snapshotId: string, snapshot: Record<string, unknown>, callback?: Function) => boolean;
  confirmProfilePortrait: (snapshotId: string, callback?: Function) => boolean;
  rejectProfilePortrait: (snapshotId: string, callback?: Function) => boolean;
  toggleProfilePortrait: (snapshotId: string, useInFutureReadings: boolean, callback?: Function) => boolean;
  saveDream: (dream: Record<string, unknown>, callback?: Function) => boolean;
  getDreamArchive: (callback?: Function) => boolean;
  deleteDream: (dreamId: string, callback?: Function) => boolean;
  getLifeNotes: (callback?: Function) => boolean;
  editLifeNote: (noteId: string, text: string, callback?: Function) => boolean;
  deleteLifeNote: (noteId: string, callback?: Function) => boolean;
  createShareCard: (dream: Record<string, unknown>, callback?: Function) => boolean;
  getShareCard: (shareId: string, callback?: Function) => boolean;
  generateDreamImage: (prompt: string, dreamId: string, theme: string | Function, callback?: Function) => boolean;
  resolveCloudImage: (fileId: string, imageUrl: string, callback?: Function) => boolean;
  imageHealth: (callback?: Function) => boolean;
  imageSmokeTest: (callback?: Function) => boolean;
  interpretDream: (
    dreamText: string,
    profile: Record<string, unknown>,
    cardIndex: number,
    callback?: Function
  ) => boolean;
  chatAboutDream: (
    dreamText: string,
    dreamResult: Record<string, unknown>,
    messages: Array<Record<string, unknown>>,
    userMessage: string,
    callback?: Function
  ) => boolean;
  refineDream: (
    dreamText: string,
    dreamResult: Record<string, unknown>,
    answer: string,
    callback?: Function
  ) => boolean;
  aiHealth: (callback?: Function) => boolean;
  aiSmokeTest: (callback?: Function) => boolean;
  trackEvent: (event: Record<string, unknown>, callback?: Function) => boolean;
  flushEvents: (events: Array<Record<string, unknown>>, callback?: Function) => boolean;
};

type MiniProgramPage = {
  data: Record<string, any>;
  setData: (data: Record<string, any>) => void;
  [key: string]: any;
};

type WxMock = {
  storage: Record<string, any>;
  navigations: string[];
  toasts: string[];
  modals: Array<Record<string, any>>;
  loading: string[];
  savedImages: string[];
  settingsOpened: number;
  cloudCalls: Array<Record<string, any>>;
  cloudUploads: Array<Record<string, any>>;
  blockNextInterpret: boolean;
  failNextInterpret: boolean;
  failNextDreamSave: boolean;
  // 一次性的 failNextDreamSave 只能模拟「重试就好」；验证「自动重试只跑一次」
  // 需要一个持续失败的开关。
  failEveryDreamSave: boolean;
  blockNextDreamChat: boolean;
  lifeNoteRows: Array<Record<string, any>>;
  deferSaveDream: boolean;
  deferredSaveDreams: Array<() => void>;
  failNextReadyDreamSave: boolean;
  failDreamSaveIds: string[];
  failDreamSaveTitles: string[];
  beforeDreamSaveSuccess?: (options: Record<string, any>) => void;
  beforePortraitGenerate?: () => void;
  recorderStopListener?: (result: Record<string, any>) => void;
  recorderErrorListener?: (error: Record<string, any>) => void;
  recorderStopCalls: number;
  recorderStartCalls: number;
  recorderStartOptions: Record<string, any>[];
  failNextPortraitToggle: boolean;
  failNextPortraitSave: boolean;
  failNextPortraitGenerate: boolean;
  nextPortraitUnchanged: boolean;
  portraitUnchangedVersion: number;
  portraitUnchangedId: string;
  lastPortraitGenerateForced: boolean;
  adminStatsResult: boolean;
  // 归档页拉云端存档时返回的记录。为 null 时走默认的 { ok: true }（没有 dreams
  // 数组），归档页据此跳过合并——绝大多数用例不需要碰这条路径。
  archiveListDreams: Array<Record<string, any>> | null;
  feedbackStatsResult: Record<string, any>;
  internalStatsResult: Record<string, any>;
  profilePortraitSummary: string;
  canvasTexts: string[][];
  cloud?: Record<string, any>;
  getStorageSync: (key: string) => any;
  setStorageSync: (key: string, value: any) => void;
  navigateTo: (options: { url: string }) => void;
  reLaunch: (options: { url: string }) => void;
  switchTab: (options: { url: string }) => void;
  showToast: (options: { title: string }) => void;
  setNavigationBarTitle: (options: { title: string }) => void;
  navigationBarTitle: string;
  showModal: (options: Record<string, any>) => void;
  showLoading: (options: { title: string }) => void;
  hideLoading: () => void;
  createSelectorQuery: () => any;
  pageScrollTo: (options: Record<string, any>) => void;
  pageScrolls: Array<Record<string, any>>;
  canvasToTempFilePath: (options: Record<string, any>) => void;
  canvasExports: Array<{ width: number; height: number }>;
  getImageInfo: (options: Record<string, any>) => void;
  saveImageToPhotosAlbum: (options: Record<string, any>) => void;
  openSetting: () => void;
  getRecorderManager: () => Record<string, any>;
  authorize: (options: Record<string, any>) => void;
  getFileSystemManager: () => Record<string, any>;
  failNextFileRead: boolean;
  failNextSpeechRecognize: boolean;
};

function createCanvasContext(texts: string[] = []): Record<string, any> {
  const ctx: Record<string, any> = {
    arc() {},
    beginPath() {},
    clearRect() {},
    clip() {},
    closePath() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    drawImage() {},
    fill() {},
    fillRect() {},
    fillText(text: string) { texts.push(String(text || '')); },
    lineTo() {},
    measureText(text: string) {
      return { width: String(text || '').length * 13 };
    },
    moveTo() {},
    quadraticCurveTo() {},
    restore() {},
    rotate() {},
    save() {},
    scale() {},
    stroke() {},
    strokeRect() {},
    translate() {},
  };

  return ctx;
}

function createWxMock(): WxMock {
  const wx: WxMock = {
    storage: {},
    navigations: [],
    toasts: [],
    modals: [],
    loading: [],
    savedImages: [],
    settingsOpened: 0,
    cloudCalls: [],
    cloudUploads: [],
    failNextFileRead: false,
    failNextSpeechRecognize: false,
    blockNextInterpret: false,
    failNextInterpret: false,
    failNextDreamSave: false,
    failEveryDreamSave: false,
    blockNextDreamChat: false,
    navigationBarTitle: '',
    lifeNoteRows: [] as Array<Record<string, any>>,
    deferSaveDream: false,
    deferredSaveDreams: [],
    failNextReadyDreamSave: false,
    failDreamSaveIds: [],
    failDreamSaveTitles: [],
    recorderStopCalls: 0,
    recorderStartCalls: 0,
    recorderStartOptions: [],
    failNextPortraitToggle: false,
    failNextPortraitSave: false,
    failNextPortraitGenerate: false,
    nextPortraitUnchanged: false,
    portraitUnchangedVersion: 1,
    portraitUnchangedId: '',
    lastPortraitGenerateForced: false,
    // 默认不是管理员：内测观测面板必须对普通测试者完全不存在。
    adminStatsResult: false,
    archiveListDreams: null,
    feedbackStatsResult: {
      ok: true,
      total: 3,
      excerptsEnabled: false,
      counts: { inspiring: 2, too_generic: 1, too_mystical: 0, not_grounded: 0 },
      recent: [
        { feedback: 'inspiring', feedbackAt: '2026-08-04T10:00:00.000Z', promptVersion: 'v0.6', dreamExcerpt: '', createdAt: '2026-08-04T09:00:00.000Z' },
      ],
    },
    internalStatsResult: {
      ok: true,
      generatedAt: '2026-08-05T02:00:00.000Z',
      memoryEcho: { ok: true, offeredReadings: 8, hitReadings: 6, offeredEchoes: 14, usedEchoes: 7, hitRate: 75, echoUseRate: 50 },
      readingDepth: { ok: true, viewedDreams: 40, expandedDreams: 8, expandRate: 20 },
      retention: { ok: true, atLeast1: 20, atLeast3: 9, atLeast5: 4, totalDreams: 62, rate3: 45, rate5: 20, dreamsPerUser: 3.1 },
      pipeline: {
        ok: true,
        interpretation: { success: 57, failed: 3, attempts: 60, failureRate: 5, failureRateText: '' },
        image: { success: 0, failed: 0, attempts: 0, failureRate: null },
      },
    },
    profilePortraitSummary: '近期梦境反复出现学校、追逐与期限感。',
    canvasTexts: [],
    canvasExports: [],
    pageScrolls: [],
    getStorageSync(key) {
      return this.storage[key];
    },
    getRecorderManager() {
      return {
        onStop(callback: (result: Record<string, any>) => void) { wx.recorderStopListener = callback; },
        onError(callback: (error: Record<string, any>) => void) { wx.recorderErrorListener = callback; },
        start(options: Record<string, any>) {
          wx.recorderStartCalls += 1;
          wx.recorderStartOptions.push(options || {});
        },
        stop() { wx.recorderStopCalls += 1; },
      };
    },
    authorize(options) {
      if (options && typeof options.success === 'function') {
        options.success();
      }
    },
    getFileSystemManager() {
      return {
        // 默认成功：内联识别这条路径要能真的走完，否则「短音频内联、长音频
        // 走云存储」这条分叉根本测不到。失败分支由 failNextFileRead 触发。
        readFile(options: Record<string, any>) {
          if (wx.failNextFileRead) {
            wx.failNextFileRead = false;
            if (options && typeof options.fail === 'function') options.fail({ errMsg: 'readFile:fail mock' });
            return;
          }
          if (options && typeof options.success === 'function') options.success({ data: 'bW9jay1hdWRpbw==' });
        },
      };
    },
    setStorageSync(key, value) {
      this.storage[key] = value;
    },
    navigateTo(options) {
      this.navigations.push(options.url);
    },
    switchTab(options) {
      this.navigations.push(options.url);
    },
    reLaunch(options) {
      this.navigations.push(options.url);
    },
    setNavigationBarTitle(options) {
      wx.navigationBarTitle = String(options?.title || '');
    },
    showToast(options) {
      this.toasts.push(options.title);
    },
    showModal(options) {
      this.modals.push(options);
      if (options.success) {
        options.success({ confirm: true, cancel: false });
      }
    },
    showLoading(options) {
      this.loading.push(options.title);
    },
    hideLoading() {
      this.loading.push('hide');
    },
    createSelectorQuery() {
      const texts: string[] = [];
      this.canvasTexts.push(texts);
      const canvas = {
        height: 0,
        width: 0,
        createImage() {
          const image: Record<string, any> = {};
          Object.defineProperty(image, 'src', {
            set() {
              if (image.onload) {
                image.onload();
              }
            },
          });
          return image;
        },
        getContext() {
          return createCanvasContext(texts);
        },
      };

      // 同一个查询器既服务于分享卡的 canvas 取节点，也服务于「滚到对话入口」的
      // 位置计算。按实际排队的查询类型回结果，两条路才不会互相顶掉。
      return {
        queued: [] as string[],
        in() {
          return this;
        },
        select() {
          return this;
        },
        selectViewport() {
          return this;
        },
        fields() {
          this.queued.push('fields');
          return this;
        },
        boundingClientRect() {
          this.queued.push('rect');
          return this;
        },
        scrollOffset() {
          this.queued.push('scroll');
          return this;
        },
        exec(callback: Function) {
          if (!this.queued.length) {
            callback([{ node: canvas, size: { width: 375, height: 667 } }]);
            return;
          }
          callback(this.queued.map((kind: string) => {
            if (kind === 'rect') return { top: 900, height: 120 };
            if (kind === 'scroll') return { scrollTop: 200 };
            return { node: canvas, size: { width: 375, height: 667 } };
          }));
        },
      };
    },
    pageScrollTo(options) {
      this.pageScrolls.push(options);
    },
    canvasToTempFilePath(options) {
      // 导出尺寸是「转发缩略图有没有被微信裁坏」的唯一可断言信号：微信按 5:4
      // 显示，给它竖版就只能居中裁一条横带出来。
      this.canvasExports.push({ width: options.width, height: options.height });
      options.success({ tempFilePath: '/tmp/oneiro-card.png' });
    },
    getImageInfo(options) {
      options.success({ path: '/tmp/oneiro-ai-image.png', width: 1024, height: 1536 });
    },
    saveImageToPhotosAlbum(options) {
      this.savedImages.push(options.filePath);
      options.success({});
    },
    openSetting() {
      this.settingsOpened += 1;
    },
  };

  wx.cloud = {
    init() {},
    downloadFile(options: Record<string, any>) {
      options.success({ tempFilePath: '/tmp/oneiro-ai-image.png' });
    },
    callFunction(options: Record<string, any>) {
      // saveDream receives a mutable page object. Record its call-time shape
      // so later quality updates cannot make an earlier fast-image write look
      // like a high-image write in this integration test.
      wx.cloudCalls.push({
        name: options.name,
        data: options.name === 'saveDream' ? structuredClone(options.data) : options.data
      });
      if (options.name === 'login') {
        options.success({ result: { openid: 'mock-openid' } });
        return;
      }
      if (options.name === 'saveDream' && options.data?.action === 'list' && wx.archiveListDreams) {
        options.success({ result: { ok: true, dreams: wx.archiveListDreams } });
        return;
      }
      if (options.name === 'saveDream' && options.data?.action === 'feedbackStats') {
        options.success({ result: wx.adminStatsResult ? wx.feedbackStatsResult : { ok: false, reason: 'not_admin' } });
        return;
      }
      if (options.name === 'saveDream' && options.data?.action === 'internalStats') {
        options.success({ result: wx.adminStatsResult ? wx.internalStatsResult : { ok: false, reason: 'not_admin' } });
        return;
      }
      // 真机上保存是异步的，mock 默认同步回调，于是「同一条梦的两次保存有没有
      // 重叠」在测试里根本无法发生。这个开关把回调扣住，用来观察排队。
      if (options.name === 'saveDream' && wx.deferSaveDream && options.data?.dream) {
        wx.deferredSaveDreams.push(() => options.success({ result: { ok: true } }));
        return;
      }
      if (options.name === 'saveDream' && wx.failEveryDreamSave) {
        options.success({ result: { ok: false, reason: 'mock_save_failed' } });
        return;
      }
      if (options.name === 'saveDream' && wx.failNextDreamSave) {
        wx.failNextDreamSave = false;
        options.success({ result: { ok: false, reason: 'mock_save_failed' } });
        return;
      }
      if (options.name === 'saveDream' && wx.failNextReadyDreamSave && options.data?.dream?.status === 'ready') {
        wx.failNextReadyDreamSave = false;
        options.success({ result: { ok: false, reason: 'mock_ready_save_failed' } });
        return;
      }
      if (options.name === 'saveDream' && wx.beforeDreamSaveSuccess) {
        wx.beforeDreamSaveSuccess(options);
      }
      if (options.name === 'saveDream' && wx.failDreamSaveIds.includes(String(options.data?.dream?.id || ''))) {
        wx.failDreamSaveIds = wx.failDreamSaveIds.filter((id) => id !== String(options.data?.dream?.id || ''));
        options.success({ result: { ok: false, reason: 'mock_replaced_save_failed' } });
        return;
      }
      if (options.name === 'saveDream' && wx.failDreamSaveTitles.includes(String(options.data?.dream?.result?.title || ''))) {
        wx.failDreamSaveTitles = wx.failDreamSaveTitles.filter((title) => title !== String(options.data?.dream?.result?.title || ''));
        options.success({ result: { ok: false, reason: 'mock_replaced_save_failed' } });
        return;
      }
      // 识别要真的还回一段文字。原来这里落到最后那句只有 ok:true 的兜底上，
      // 于是每次语音都走了失败分支——「转出来的字有没有真的进到草稿里」这件事
      // 从来没被验证过。
      // 三种来源的可信方式不一样，界面必须分得开：dream_connection 是我们
      // 自己写的句子，用户只是点过「是这样」。
      if (options.name === 'saveDream' && options.data?.action === 'listLifeNotes') {
        options.success({
          result: {
            ok: true,
            notes: (wx.lifeNoteRows || []).map((row: Record<string, any>) => ({
              id: row.id,
              text: row.text,
              source: row.source || '',
              sourceDreamId: '',
              createdAt: row.createdAt || '2026-08-01T00:00:00.000Z',
              updatedAt: row.createdAt || '2026-08-01T00:00:00.000Z',
            })),
          },
        });
        return;
      }
      if (options.name === 'speechRecognize') {
        if (wx.failNextSpeechRecognize) {
          wx.failNextSpeechRecognize = false;
          options.success({ result: { ok: false, reason: 'empty_result' } });
          return;
        }
        options.success({ result: { ok: true, text: '我梦见沙漠里下起暴雨' } });
        return;
      }
      if (options.name === 'interpretDream') {
        if (options.data?.metaphysicalReading) {
          options.success({
            result: {
              ok: true,
              provider: 'mock-metaphysical',
              model: 'mock-metaphysical-model',
              promptVersion: 'oneiro-freeform-reading-v0.7-grounded-modules',
              elapsedMs: 1234,
              metaphysical_resonance: '梦里的学校走廊与日主甲木的行动底色形成有限呼应。',
              metaphysical_basis: '四柱中的日主甲木是本次确定性计算的技术锚点。',
              metaphysical_reading: {
                temperament: '学校走廊里的追逐调动了日主甲木的主动应对底色。',
                dream_echo: '梦里的学校走廊与五行木的展开意象形成有限呼应。',
                tension: '追逐和迟到把十神只作为观察拉扯的技术参照。',
                rhythm: '先记录梦里被追上的那一刻，不把它用于预测。',
                basis: '四柱中的日主甲木为确定性盘面锚点。',
              },
            },
          });
          return;
        }
        if (options.data?.refineDream) {
          options.success({
            result: {
              ok: true,
              provider: 'mock-cloud',
              fallback: false,
              final_title: '期限门',
              final_card_insight: '你的回答让学校与追逐落在了现实期限上。',
              personal_connection: '这次梦更像在整理你对截止时间与被评价的感受。',
            },
          });
          return;
        }
        if (options.data?.chatAboutDream && wx.blockNextDreamChat) {
          wx.blockNextDreamChat = false;
          options.success({
            result: {
              ok: false,
              blocked: true,
              reason: 'self_harm',
              message: '这个梦里有很重的痛感。请先联系身边可信任的人，或当地紧急支持。',
            },
          });
          return;
        }
        if (options.data?.chatAboutDream) {
          options.success({
            result: {
              ok: true,
              provider: 'mock-cloud',
              fallback: false,
              reply: '你提到的期限感让学校和追逐更具体了。这可能与近期被评价的压力有关，也可能只是偶然联想。你最在意的是赶不上，还是被看见？',
              realityClue: '我最近确实很怕赶不上期限',
            },
          });
          return;
        }
        if (options.data?.chatAboutPortrait) {
          options.success({
            result: {
              ok: true,
              provider: 'mock-cloud',
              fallback: false,
              reply: '那句确实说反了。你说的是当场就讲，不是先撤开——最近哪件事上是这样？',
              recorded: true,
            },
          });
          return;
        }
        if (options.data?.smokeTest) {
          options.success({
            result: {
              ok: false,
              type: 'interpretDream.aiSmokeTest',
              provider: 'mock-cloud',
              providerConfigured: true,
              reason: 'provider_error',
              title: '',
              symbolCount: 0,
            },
          });
          return;
        }
        if (options.data?.healthCheck) {
          options.success({
            result: {
              ok: true,
              type: 'interpretDream.aiHealth',
              provider: 'mock-cloud',
              providerConfigured: true,
              hasApiKey: true,
              model: 'mock-model',
              baseUrlHost: 'mock.example.com',
              requestTimeoutMs: 45000,
              fallbackProvider: 'none',
            },
          });
          return;
        }
        if (wx.blockNextInterpret) {
          wx.blockNextInterpret = false;
          options.success({
            result: {
              ok: false,
              blocked: true,
              reason: 'self_harm',
              message: '这个梦里有很重的痛感。请先联系身边可信任的人，或当地紧急支持；Oneiro 暂不解读这类内容。',
            },
          });
          return;
        }
        if (wx.failNextInterpret) {
          wx.failNextInterpret = false;
          options.success({
            result: {
              ok: false,
              provider: 'mock-cloud',
              reason: 'ai_provider_error',
              retryable: true,
              provider_error: 'mock provider unavailable',
            },
          });
          return;
        }
        options.success({
          result: {
            ok: true,
            provider: 'mock-cloud',
            model: 'mock-grounded-model',
            promptVersion: 'oneiro-freeform-reading-v0.7-grounded-modules',
            schemaVersion: 'dream-entry-v0.2',
            result: {
              title: '云影',
              card_no: 'NO. 001',
              card_theme: 'shadow',
              card_theme_label: '追逐',
              birth_profile: {
                nickname: 'Runtu',
                zodiac: '摩羯',
                element: '云端初判',
              },
              profile_summary: 'Runtu · 摩羯 · 云端梦卡',
              dream_facts: {
                people: [],
                places: ['学校'],
                objects: [],
                actions: ['追逐', '考试迟到'],
                emotions: ['紧张'],
                time_sense: [],
              },
              symbols: ['追逐', '学校'],
              emotional_weather: '云端识别到紧张和评价感正在靠近。',
              oracle: '摩羯的底色让这个梦更像一次自我校准。',
              card_insight: '这张云端梦卡提醒你先看见追逐背后的真实需要。',
              dream_translation: '云端解读：学校考试迟到和追逐构成主要梦象。',
              underneath: '追逐和学校共同指向压力、标准和旧身份。',
              cultural_symbolism: '传统梦文化会把学校与追逐视作考验和寻找出口的象征。',
              mirror: '现实里可能有一个期限或评价正在逼近。',
              possible_connections: [
                '学校与迟到可能和近期的截止时间有关。',
                '追逐也可能只是紧张感在梦里的偶然组合。',
              ],
              metaphysical_resonance: 'Runtu的摩羯气质让追逐和学校显得更像责任感的提醒。',
              metaphysical_basis: '四柱中的日主与五行只作为这次学校追逐梦的文化参照。',
              metaphysical_reading: {
                temperament: '学校与追逐调动了日主所代表的主动承担。',
                dream_echo: '学校走廊与五行流转形成有限呼应。',
                tension: '追逐与迟到让十神关系只呈现为边界拉扯。',
                rhythm: '先写下学校里最紧张的一刻，不预测后续。',
                basis: '四柱、日主与五行来自确定性历法计算。',
              },
              integration_question: '如果追逐会替你说一句真话，它想提醒什么？',
              one_small_act: '写下正在追你的事。',
              image: '云端梦卡画面以追逐、学校为核心。',
              image_prompt: 'a person runs through an empty school while an examination room recedes',
              visual_plan: {
                version: 'oneiro-visual-plan-v1',
                raw_text: '我梦到考试迟到，被人在学校里追赶。',
                main_event: '梦者在学校里被追赶并错过考试',
                emotion: ['紧张'],
                emotion_intensity: 0.82,
                setting: '空荡的学校走廊',
                characters: [{ role: '主体', description: '奔跑的学生背影', importance: 1 }],
                objects: [{ name: '越来越远的考试教室', importance: 0.9, visualizable: true }],
                anomalies: ['走廊不断变长'],
                symbols: ['学校', '追逐'],
                memory_elements: [],
                preserve_elements: ['奔跑的学生', '学校走廊', '考试教室'],
                hidden_symbol: '停住的钟',
                composition: {
                  template: 'threshold_depth',
                  subject_position: '人物位于左下并朝远处奔跑',
                  visual_flow: '从奔跑背影通向远处教室',
                  spatial_layers: '前景人物，中景走廊，远景教室',
                  negative_space: '上方保留约40%空墙'
                }
              },
              echo: '给压力一个出口。',
              omens: { lucky_color_name: '云影色', reason: '云端返回的测试色。' },
            },
          },
        });
        return;
      }
      if (options.name === 'profileMemory') {
        if (options.data?.action === 'generate') {
          if (wx.beforePortraitGenerate) wx.beforePortraitGenerate();
          wx.lastPortraitGenerateForced = options.data?.force === true;
          if (wx.failNextPortraitGenerate) {
            wx.failNextPortraitGenerate = false;
            options.success({ result: { ok: false, reason: 'mock_generate_failed' } });
            return;
          }
          // 云端判定这次没有实质变化时不发新版本，返回 unchanged + 当前快照。
          // 这是正常结果，不是失败——客户端必须原样保留画像，不进失败态，
          // 也不显示「已更新」。
          if (wx.nextPortraitUnchanged) {
            wx.nextPortraitUnchanged = false;
            options.success({
              result: {
                ok: true,
                unchanged: true,
                unchangedReason: 'evidence_unchanged',
                // unchanged 的语义是「当前这一版原样返回」，所以版本号必须
                // 就是它已有的版本号。编一个更大的数字会让客户端误判成有新版本
                // ——那正是这条闸要消灭的东西。
                snapshot: {
                  _id: wx.portraitUnchangedId,
                  version: wx.portraitUnchangedVersion,
                  status: 'confirmed',
                  summary: wx.profilePortraitSummary,
                  useInFutureReadings: true,
                },
              },
            });
            return;
          }
          options.success({
            result: {
              ok: true,
              snapshot: {
                _id: 'portrait-v1',
                version: 1,
                status: 'draft',
                summary: wx.profilePortraitSummary,
                traits: ['会留意期限与评价感'],
                themes: ['学校', '追逐'],
                realLifeContext: [],
                changeReason: '根据近期梦境生成',
                useInFutureReadings: true,
              },
            },
          });
          return;
        }
        if (options.data?.action === 'save') {
          if (wx.failNextPortraitSave) {
            wx.failNextPortraitSave = false;
            options.success({ result: { ok: false, reason: 'mock_save_failed' } });
            return;
          }
          wx.profilePortraitSummary = options.data.snapshot?.summary || wx.profilePortraitSummary;
          options.success({
            result: {
              ok: true,
              snapshot: {
                _id: 'portrait-v2',
                version: 2,
                status: 'confirmed',
                summary: wx.profilePortraitSummary,
                themes: ['学校', '追逐'],
                useInFutureReadings: true,
                userEdited: true,
              },
            },
          });
          return;
        }
        if (options.data?.action === 'confirm') {
          options.success({
            result: {
              ok: true,
              snapshot: {
                _id: options.data.snapshotId,
                version: 1,
                status: 'confirmed',
                isCurrent: true,
                summary: wx.profilePortraitSummary,
                themes: ['学校', '追逐'],
                useInFutureReadings: true,
              },
            },
          });
          return;
        }
        if (options.data?.action === 'toggleUse') {
          if (wx.failNextPortraitToggle) {
            wx.failNextPortraitToggle = false;
            options.success({ result: { ok: false, reason: 'mock_sync_failed' } });
            return;
          }
          options.success({
            result: {
              ok: true,
              snapshot: {
                _id: options.data.snapshotId,
                version: 1,
                status: 'confirmed',
                isCurrent: true,
                summary: '近期梦境反复出现学校、追逐与期限感。',
                themes: ['学校', '追逐'],
                useInFutureReadings: options.data.useInFutureReadings,
              },
            },
          });
          return;
        }
        options.success({ result: { ok: true, current: null, latestDraft: null, history: [] } });
        return;
      }
      if (options.name === 'generateDreamImage') {
        if (options.data?.healthCheck) {
          options.success({
            result: {
              ok: true,
              type: 'generateDreamImage.health',
              provider: 'openai',
              providerConfigured: true,
              hasApiKey: true,
              model: 'mock-image-model',
              endpointHost: 'mock-image.example.com',
              requestTimeoutMs: 90000,
            },
          });
          return;
        }
        if (options.data?.action === 'startPrimaryImage') {
          options.success({ result: { ok: true, status: 'provider_ready', jobId: 'primary-mock' } });
          return;
        }
        options.success({
          result: {
            ok: true,
            provider: 'openai',
            providerConfigured: true,
            model: 'mock-image-model',
            fileID: 'cloud://mock/generated-dream-images/mock.png',
            imageUrl: 'https://mock-image.example.com/oneiro.png',
            cloudPath: 'generated-dream-images/mock.png',
            cacheHit: true,
            styleVersion: 'oneiro-seedream-dream-v2.0',
            visualPlan: options.data?.visualPlan,
            qualityCheck: { version: 'oneiro-image-quality-v1', passed: true },
            latencyMs: 32,
          },
        });
        return;
      }
      if (options.name === 'createShareCard') {
        options.success({
          result: {
            ok: true,
            shareId: 'card-mock',
            path: '/pages/share/index?id=card-mock',
            payload: {
              title: '云影',
              cardNo: 'NO. 001',
              cardTheme: 'shadow',
              profileSummary: 'Runtu · 摩羯 · 云端梦卡',
              emotionalWeather: '云端识别到紧张和评价感正在靠近。',
              symbols: ['追逐', '学校'],
              cardInsight: '这张云端梦卡提醒你先看见追逐背后的真实需要。',
              metaphysicalResonance: 'Runtu的摩羯气质让追逐和学校显得更像责任感的提醒。',
              oracle: '摩羯的底色让这个梦更像一次自我校准。',
            },
          },
        });
        return;
      }
      if (options.name === 'getShareCard') {
        options.success({
          result: {
            ok: true,
            shareId: options.data.shareId,
            payload: {
              title: '云影',
              cardNo: 'NO. 001',
              cardTheme: 'shadow',
              profileSummary: 'Runtu · 摩羯 · 云端梦卡',
              emotionalWeather: '云端识别到紧张和评价感正在靠近。',
              symbols: ['追逐', '学校'],
              cardInsight: '这张云端梦卡提醒你先看见追逐背后的真实需要。',
              metaphysicalResonance: 'Runtu的摩羯气质让追逐和学校显得更像责任感的提醒。',
              oracle: '摩羯的底色让这个梦更像一次自我校准。',
            },
          },
        });
        return;
      }
      options.success({ result: { ok: true } });
    },
    uploadFile(options: Record<string, any>) {
      wx.cloudUploads.push({ cloudPath: options.cloudPath, filePath: options.filePath });
      options.success({ fileID: 'cloud://oneiro/share-card.png' });
    },
  };

  return wx;
}

function loadPage(
  path: string,
  modules: Record<string, unknown>,
  wx: WxMock,
  app: Record<string, any>
): MiniProgramPage {
  let page: MiniProgramPage | null = null;
  // 沙箱里没有真实时钟。把 setInterval 的回调存下来交给用例手动「走表」，
  // 录音倒数这类跟时间强相关的行为才测得动——否则只能靠 sleep 碰运气。
  const intervalCallbacks: Function[] = [];
  const sandbox = {
    console,
    Date,
    encodeURIComponent,
    decodeURIComponent,
    getApp: () => app,
    module: { exports: {} },
    Page(config: MiniProgramPage) {
      page = config;
      page.setData = function setData(data: Record<string, any>) {
        page!.data = Object.assign({}, page!.data, data);
      };
    },
    require(request: string) {
      if (Object.prototype.hasOwnProperty.call(modules, request)) {
        return modules[request];
      }
      throw new Error(`Unexpected require(${request}) while loading ${path}`);
    },
    setTimeout(callback: Function) {
      callback();
      return 1;
    },
    // 手势代码会主动撤销还没触发的长按计时器（下滑提交时不该误起录音）。
    // 沙箱里 setTimeout 是同步的，所以这里只需要一个不抛错的存根。
    clearTimeout() {},
    setInterval(callback: Function) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval(id: number) {
      // 清掉的计时器换成空函数而不是从数组里摘掉，这样后面的 id 不会错位。
      if (id) intervalCallbacks[id - 1] = function () {};
    },
    wx,
  };

  vm.runInNewContext(read(path), sandbox, { filename: path });
  assert.ok(page, `${path} should register a Page`);
  const loaded = page as unknown as MiniProgramPage;
  loaded.__tickIntervals = function () {
    intervalCallbacks.slice().forEach((callback) => callback());
  };
  return loaded;
}

function loadApp(
  path: string,
  modules: Record<string, unknown>,
  wx: WxMock
): Record<string, any> {
  let app: Record<string, any> | null = null;
  const sandbox = {
    console,
    Date,
    wx,
    module: { exports: {} },
    App(config: Record<string, any>) { app = config; },
    require(request: string) {
      if (Object.prototype.hasOwnProperty.call(modules, request)) return modules[request];
      throw new Error(`Unexpected require(${request}) while loading ${path}`);
    },
  };
  vm.runInNewContext(read(path), sandbox, { filename: path });
  assert.ok(app, `${path} should register an App`);
  return app!;
}

const acceptance = loadCommonJS<AcceptanceModule>('miniprogram/utils/acceptanceDream.js');
const contentSafety = loadCommonJS<ContentSafetyModule>('miniprogram/utils/contentSafety.js');
const dreamArtifacts = loadCommonJS<DreamArtifactsModule>('miniprogram/utils/dreamArtifacts.js');
const syncQueue = loadCommonJS<Record<string, any>>('miniprogram/utils/syncQueue.js', { wx: createWxMock() });
const dreamMemory = loadCommonJS<DreamMemoryModule>('miniprogram/utils/dreamMemory.js', {}, { './syncQueue': syncQueue });
const canvasFrame = loadCommonJS<CanvasFrameModule>('miniprogram/utils/canvasFrame.js');

for (const path of [
  'miniprogram/app.json',
  'miniprogram/project.config.json',
  'miniprogram/project.private.config.json',
  'miniprogram/pages/home/index.json',
  'miniprogram/pages/result/index.json',
  'miniprogram/pages/dream-chat/index.json',
  'miniprogram/pages/archive/index.json',
  'miniprogram/pages/profile/index.json',
  'miniprogram/pages/share/index.json',
  'miniprogram/pages/diagnostics/index.json',
  'miniprogram/sitemap.json',
]) {
  assertJson(path);
}

// 首页按设计稿清空后，「我的资料」「打开梦境档案」两个文字入口从首页移除，
// 资料页与梦册改由原生 tabBar 到达。原先断言这两个字符串在首页 wxml 里，
// 现在改为断言真正承担可达性的 tabBar 配置——三个 tab 缺一个都会让对应
// 页面变成只能靠代码跳转的孤儿页。
const appConfig = JSON.parse(read('miniprogram/app.json')) as Record<string, any>;
const tabBarPaths = (appConfig.tabBar?.list ?? []).map((tab: Record<string, string>) => tab.pagePath);
for (const required of ['pages/home/index', 'pages/archive/index', 'pages/profile/index']) {
  assert.ok(tabBarPaths.includes(required), `app.json tabBar should expose ${required}`);
}

assertIncludes('miniprogram/project.config.json', '"cloudfunctionRoot"');
const projectConfig = JSON.parse(read('miniprogram/project.config.json')) as Record<string, any>;
assert.equal(projectConfig.setting.condition, false);
assert.equal(Object.prototype.hasOwnProperty.call(projectConfig, 'condition'), false);
for (const path of [
  'miniprogram/cloudfunctions/login/package.json',
  'miniprogram/cloudfunctions/createShareCard/package.json',
  'miniprogram/cloudfunctions/getShareCard/package.json',
  'miniprogram/cloudfunctions/interpretDream/package.json',
  'miniprogram/cloudfunctions/generateDreamImage/package.json',
  'miniprogram/cloudfunctions/saveProfile/package.json',
  'miniprogram/cloudfunctions/saveDream/package.json',
  'miniprogram/cloudfunctions/trackEvent/package.json',
  'miniprogram/cloudfunctions/speechRecognize/package.json',
  'miniprogram/cloudfunctions/profileMemory/package.json',
]) {
  assertJson(path);
}

for (const [path, expected] of [
  // 首页是手势采集区（方向代号 1a）：验证拖拽状态机确实接了线（touchmove
  // 绑定，而不只是 touchstart/touchend 两端）、点文字进入编辑态的绑定，
  // 以及录音中那一行必须一次说全三条出路——落点条只讲了下滑，上滑取消和
  // 「直接松手就转文字」没有别的地方会说。
  ['miniprogram/pages/home/index.wxml', '上滑取消 · 下滑直接解读 · 松手转成文字'],
  // 60 秒是「一句话识别」接口自身的上限。只往上数到 60 然后凭空结束，用户读到
  // 的是「我的话丢了」；最后十几秒必须倒数，并且说明到点那段也会收下。
  ['miniprogram/pages/home/index.wxml', '还剩 {{recordingCountdown}} 秒'],
  ['miniprogram/pages/dream-chat/index.wxml', 'recordingCountdown'],
  ['miniprogram/pages/home/index.wxml', 'catchtouchmove="onVoiceTouchMove"'],
  ['miniprogram/pages/home/index.wxml', 'bindtap="onDreamTextTap"'],
  ['miniprogram/pages/home/index.wxml', 'bindtouchstart="onVoiceTouchStart"'],
  ['miniprogram/pages/home/index.wxml', 'fromShare'],
  ['miniprogram/pages/result/index.wxml', 'theme-{{dream.result.card_theme}}'],
  ['miniprogram/pages/result/index.wxml', 'dream-ai-image'],
  ['miniprogram/pages/result/index.wxml', '画面生成中'],
  ['miniprogram/pages/result/index.wxml', '你记下的原梦'],
  ['miniprogram/pages/result/index.wxml', '梦里发生了什么'],
  ['miniprogram/pages/result/index.wxml', '与你有关'],
  // 每条呼应下面挂着它自己的两个出口。整块共用一组按钮问不清用户在说哪一条，
  // 收到的表态也就无法上行成任何证据。
  ['miniprogram/pages/result/index.wxml', 'bindtap="onConnectionVerdict"'],
  ['miniprogram/pages/result/index.wxml', '是这样'],
  ['miniprogram/pages/result/index.wxml', '不太像'],
  ['miniprogram/pages/result/index.wxml', '{{item.text}}'],
  ['miniprogram/pages/result/index.wxml', '文化象征'],
  ['miniprogram/pages/result/index.wxml', '再多看一点'],
  ['miniprogram/pages/result/index.wxml', '这次没有找到和你生活的具体呼应'],
  ['miniprogram/pages/diagnostics/index.wxml', '折叠区展开率'],
  ['miniprogram/cloudfunctions/saveDream/index.js', 'readingDepthStats'],
  ['miniprogram/pages/result/index.wxml', '心理视角'],
  ['miniprogram/pages/result/index.wxml', '聊聊这个梦'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="retryCloudSync"'],
  ['miniprogram/pages/result/index.wxml', 'class="core-observation"'],
  ['miniprogram/pages/result/index.wxml', 'dream.result.reading_hook'],
  // 设计稿去掉了「三个视角」分组标题，三个 block 直接平铺。原先断言这个
  // 字符串，改稿后它只剩在一句代码注释里——断言会假通过。改为断言第三个
  // 视角（命理）的 block 类名：文化/心理已在上面各有一条，三条合起来才真正
  // 证明三个视角都还在页面上。
  ['miniprogram/pages/result/index.wxml', 'metaphysical-reading'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="toggleFullReading"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="toggleMoreActions"'],
  ['miniprogram/pages/result/index.wxml', '传统解梦怎么说'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="saveCard"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="saveFullReading"'],
  ['miniprogram/pages/result/index.wxml', '收藏梦卡'],
  ['miniprogram/pages/result/index.wxml', '保存完整解读'],
  // 设计稿把操作区收成一行平级文字链，文案由「分享这张梦卡」缩短为「分享梦卡」
  ['miniprogram/pages/result/index.wxml', '分享梦卡'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="newDream"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="openArchive"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="deleteDream"'],
  ['miniprogram/pages/result/index.wxml', 'id="shareCanvas"'],
  // 长梦的原文默认只留第一行：用户打开解读页想看的是解读，不是自己刚写完的
  // 那段话被顶在最前面。
  ['miniprogram/pages/result/index.wxml', 'bindtap="toggleOriginalDream"'],
  ['miniprogram/pages/result/index.wxml', 'is-collapsed'],
  ['miniprogram/pages/result/index.wxss', '-webkit-line-clamp: 1'],
  // 手势之外必须有一条不需要被教会的提交路径。
  ['miniprogram/pages/home/index.wxml', 'bindtap="onSubmitTap"'],
  ['miniprogram/pages/home/index.wxml', '解读这个梦'],
  ['miniprogram/pages/dream-chat/index.wxml', 'bindtap="sendMessage"'],
  ['miniprogram/pages/profile/index.wxml', 'bindtap="saveProfile"'],
  ['miniprogram/pages/profile/index.wxml', '可随时修改或清空'],
  // 阶段画像的完整面板已经搬到「梦册」顶部：「我」是一整页表单，把产品里最有
  // 辨识度的产出摆在表单上方，它会被读成一个用户自己填的字段。这一页只留
  // 入口，编辑/重新梳理/溯源/历史版本都在梦册。
  ['miniprogram/pages/profile/index.wxml', '阶段画像'],
  ['miniprogram/pages/profile/index.wxml', 'bindtap="openPortrait"'],
  ['miniprogram/pages/profile/index.wxml', '在梦册查看'],
  ['miniprogram/pages/profile/index.wxml', '你说过的话'],
  ['miniprogram/pages/profile/index.wxml', '你认下的解读'],
  ['miniprogram/pages/profile/index.wxml', 'bindtap="toggleLifeNoteGroup"'],
  ['miniprogram/pages/archive/index.wxml', '阶段画像'],
  ['miniprogram/pages/archive/index.wxml', '这段不像我'],
  ['miniprogram/pages/dream-chat/index.wxml', '{{portraitMode}}'],
  ['miniprogram/pages/archive/index.wxml', 'bindtap="refreshPortrait"'],
  // 画像从「好看」变成「可信」的全部差别：判断能指回具体哪几个梦，以及能看到
  // 自己以前的样子。这两样的数据一直存在 profile_snapshots 里，此前从未渲染。
  ['miniprogram/pages/archive/index.wxml', 'bindtap="openPortraitSource"'],
  ['miniprogram/pages/archive/index.wxml', 'bindtap="togglePortraitHistory"'],
  ['miniprogram/pages/archive/index.wxml', '你以前的样子'],
  ['miniprogram/pages/share/index.wxml', '记下我的梦'],
  ['miniprogram/pages/share/index.wxml', 'theme-{{payload.cardTheme}}'],
  ['miniprogram/pages/diagnostics/index.wxml', '运行诊断'],
  ['miniprogram/pages/diagnostics/index.wxml', 'Provider Ready'],
  ['miniprogram/pages/diagnostics/index.wxml', 'requestTimeoutMs'],
  ['miniprogram/pages/diagnostics/index.wxml', 'bindtap="refresh"'],
  ['miniprogram/pages/diagnostics/index.wxml', 'AI SMOKE TEST'],
  ['miniprogram/pages/diagnostics/index.wxml', 'bindtap="runSmokeTest"'],
  ['miniprogram/pages/archive/index.wxml', '私人梦境牌组'],
  ['miniprogram/pages/archive/index.wxml', '本月观察'],
  ['miniprogram/pages/archive/index.wxml', 'class="month-observation"'],
  ['miniprogram/pages/archive/index.wxml', 'wx:for="{{timelineGroups}}"'],
  ['miniprogram/pages/archive/index.wxml', 'timelineTimestamp'],
  ['miniprogram/pages/archive/index.wxml', 'archive-thumb-placeholder'],
] as const) {
  assertIncludes(path, expected);
}

for (const [path, unexpected] of [
  ['miniprogram/pages/result/index.wxml', '把这张梦卡变成你的'],
  ['miniprogram/pages/result/index.wxml', '生成分享话题卡'],
  // 让用户自己重写画像的输入框已经废止：他写的那句会被当成最高权重原文照抄
  // 回去，等于让用户自己给自己下判断。纠偏只走对话。
  ['miniprogram/pages/archive/index.wxml', 'portrait-editor'],
  ['miniprogram/pages/archive/index.wxml', 'bindinput="onPortraitSummaryInput"'],
] as const) {
  assertNotIncludes(path, unexpected);
}

for (const [path, expected] of [
  ['miniprogram/app.js', "app_start"],
  ['miniprogram/app.js', "initCloud"],
  ['miniprogram/app.js', "getIdentity"],
  ['miniprogram/app.js', "flushEvents"],
  ['miniprogram/utils/cloudBase.js', "wx.cloud.init"],
  ['miniprogram/utils/cloudBase.js', "wx.cloud.callFunction"],
  ['miniprogram/utils/cloudBase.js', "createShareCard"],
  ['miniprogram/utils/cloudBase.js', "getShareCard"],
  ['miniprogram/utils/cloudBase.js', "interpretDream"],
  ['miniprogram/utils/cloudBase.js', "metaphysicalReading"],
  ['miniprogram/utils/cloudBase.js', "aiHealth"],
  ['miniprogram/utils/cloudBase.js', "aiSmokeTest"],
  ['miniprogram/utils/cloudBase.js', "generateDreamImage"],
  ['miniprogram/utils/cloudBase.js', "imageHealth"],
  ['miniprogram/utils/cloudBase.js', "imageSmokeTest"],
  ['miniprogram/utils/cloudBase.js', "resolveCloudImage"],
  ['miniprogram/utils/cloudBase.js', "wx.cloud.downloadFile"],
  ['miniprogram/utils/cloudBase.js', "healthCheck"],
  ['miniprogram/utils/cloudBase.js', "smokeTest"],
  ['miniprogram/utils/cloudBase.js', "deleteDream"],
  ['miniprogram/utils/cloudBase.js', "getDreamArchive"],
  ['miniprogram/utils/cloudBase.js', "getLifeNotes"],
  ['miniprogram/utils/cloudBase.js', "editLifeNote"],
  ['miniprogram/utils/cloudBase.js', "chatAboutDream"],
  ['miniprogram/utils/cloudBase.js', "refineDream"],
  ['miniprogram/utils/cloudBase.js', "getProfileMemory"],
  ['miniprogram/utils/cloudBase.js', "generateProfilePortrait"],
  ['miniprogram/utils/recorderRouter.js', "register"],
  ['miniprogram/utils/syncQueue.js', "enqueue"],
  ['miniprogram/pages/home/index.js', "validateDreamText"],
  ['miniprogram/pages/home/index.js', "interpretDream"],
  ['miniprogram/pages/home/index.js', "cloudResult.blocked"],
  ['miniprogram/pages/home/index.js', "saveDream"],
  ['miniprogram/pages/home/index.js', "dream_saved_before_interpretation"],
  ['miniprogram/pages/home/index.js', "dream_submit"],
  ['miniprogram/pages/home/index.js', "interpretation_success"],
  ['miniprogram/pages/home/index.js', "interpretationProvider"],
  ['miniprogram/pages/home/index.js', "provider: provider"],
  ['miniprogram/pages/home/index.js', "wx.showModal"],
  ['miniprogram/pages/home/index.js', "interpretation_failed"],
  ['miniprogram/pages/home/index.js', "pages/result/index?id="],
  ['miniprogram/pages/home/index.js', "dream_start"],
  ['miniprogram/pages/home/index.js', "share_landing_view"],
  ['miniprogram/pages/result/index.js', "findDreamById"],
  ['miniprogram/pages/result/index.js', "wx.canvasToTempFilePath"],
  ['miniprogram/pages/result/index.js', "wx.saveImageToPhotosAlbum"],
  ['miniprogram/pages/result/index.js', "wx.openSetting"],
  ['miniprogram/pages/result/index.js', "requestDreamImage"],
  ['miniprogram/pages/result/index.js', "cloudBase.generateDreamImage"],
  ['miniprogram/pages/result/index.js', "generated_image_success"],
  ['miniprogram/pages/result/index.js', "generated_image_load_fail"],
  ['miniprogram/pages/result/index.js', "imageErrorMessage"],
  ['miniprogram/pages/result/index.js', "retryDreamImage"],
  ['miniprogram/pages/result/index.js', "retryInterpretation"],
  ['miniprogram/pages/result/index.js', "cloudBase.metaphysicalReading"],
  ['miniprogram/pages/result/index.js', "metaphysical_reading_done"],
  ['miniprogram/pages/result/index.js', "dream_chat_open"],
  // 上行走的是 life_note 那条已经通了的管子（写入 → 画像证据 → 重算 → 失败
  // 补偿），不另起一条只被一个入口用到的新管道。
  ['miniprogram/pages/result/index.js', "cloudBase.confirmDreamConnection"],
  ['miniprogram/pages/result/index.js', "syncQueue.enqueue('life_note'"],
  ['miniprogram/pages/result/index.js', "source: 'dream_connection'"],
  ['miniprogram/utils/cloudBase.js', "confirmDreamConnection"],
  ['miniprogram/cloudfunctions/saveDream/index.js', "LIFE_NOTE_SOURCES"],
  ['miniprogram/cloudfunctions/profileMemory/index.js', "userConfirmedConnections"],
  // 补写路径必须带上 source，否则离线时确认的呼应重放回云端就退化成一条普通
  // 生活记录，画像那头再也分不出它当初是被用户核实过的。
  ['miniprogram/app.js', "task.source"],
  ['miniprogram/pages/dream-chat/index.js', "connectionCorrectionOpening"],
  ['miniprogram/pages/dream-chat/index.js', "connectionCorrectionRaisedFor"],
  ['miniprogram/pages/result/index.js', "dream_deleted"],
  ['miniprogram/pages/result/index.wxml', "重新生成画面"],
  ['miniprogram/pages/result/index.wxml', "重新解读"],
  ['miniprogram/pages/result/index.js', "result_view"],
  ['miniprogram/pages/result/index.js', "image_success"],
  ['miniprogram/pages/result/index.js', "export_success"],
  ['miniprogram/pages/result/index.js', "createShareCard"],
  ['miniprogram/pages/result/index.js', "sharePath"],
  ['miniprogram/pages/result/index.js', "share"],
  ['miniprogram/pages/share/index.js', "getShareCard"],
  ['miniprogram/pages/diagnostics/index.js', "aiHealth"],
  ['miniprogram/pages/diagnostics/index.js', "aiSmokeTest"],
  ['miniprogram/pages/diagnostics/index.js', "imageHealth"],
  ['miniprogram/pages/diagnostics/index.js', "imageSmokeTest"],
  ['miniprogram/pages/diagnostics/index.wxml', "IMAGE TEST"],
  ['miniprogram/pages/diagnostics/index.js', "runSmokeTest"],
  ['miniprogram/pages/diagnostics/index.js', "startSmokeTest"],
  ['miniprogram/pages/diagnostics/index.js', "确认测试 AI"],
  ['miniprogram/pages/diagnostics/index.js', "cloudHealth"],
  ['miniprogram/pages/diagnostics/index.js', "getFeedbackStats"],
  ['miniprogram/pages/diagnostics/index.js', "getInternalStats"],
  ['miniprogram/pages/diagnostics/index.wxml', "内测观测"],
  ['miniprogram/pages/diagnostics/index.wxml', "记忆呼应命中率"],
  ['miniprogram/pages/diagnostics/index.wxml', "留存漏斗"],
  ['miniprogram/pages/diagnostics/index.wxml', "解读失败率"],
  ['miniprogram/pages/diagnostics/index.wxml', "生图失败率"],
  ['miniprogram/pages/diagnostics/index.wxml', "解读反馈"],
  ['miniprogram/pages/diagnostics/index.wxml', "ADMIN_OPENIDS"],
  ['miniprogram/cloudfunctions/saveDream/index.js', "feedbackStats"],
  ['miniprogram/cloudfunctions/saveDream/index.js', "internalStats"],
  ['miniprogram/cloudfunctions/saveDream/index.js', "ADMIN_OPENIDS"],
  ['miniprogram/cloudfunctions/saveDream/index.js', "ADMIN_FEEDBACK_EXCERPTS"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "evaluateMemoryEcho"],
  ['miniprogram/pages/home/index.js', "memoryEchoOffered"],
  ['miniprogram/pages/diagnostics/index.js', "normalizeAiHealth"],
  ['miniprogram/pages/share/index.js', "share_card_open"],
  ['miniprogram/pages/result/index.js', "tabNav.switchTab('pages/home/index')"],
  ['miniprogram/pages/result/index.js', "pages/archive/index"],
  ['miniprogram/pages/result/index.js', "onShareAppMessage"],
  ['miniprogram/pages/result/index.js', "themePalettes"],
  ['miniprogram/pages/result/index.js', "drawDreamArt(ctx, result.card_theme || 'mist', imagePath, artRect)"],
  ['miniprogram/pages/result/index.js', "READING_CARD_HEIGHT"],
  ['miniprogram/pages/result/index.js', "var CARD_HEIGHT = 1200"],
  ['miniprogram/pages/result/index.js', "var READING_CARD_HEIGHT = 2300"],
  ['miniprogram/pages/result/index.js', "drawImageCover"],
  ['miniprogram/pages/result/index.js', "drawLeftWrappedText"],
  ['miniprogram/pages/result/index.wxml', 'mode="aspectFill"'],
  ['miniprogram/pages/result/index.js', "drawFullReadingCard"],
  ['miniprogram/pages/result/index.js', "saveFullReading"],
  ['miniprogram/pages/result/index.js', "fullReading"],
  ['miniprogram/pages/result/index.js', "collection_card"],
  ['miniprogram/pages/archive/index.js', "pages/result/index?id="],
  ['miniprogram/pages/archive/index.js', "archive_view"],
  ['miniprogram/pages/archive/index.js', "archive_cloud_synced"],
  ['miniprogram/pages/archive/index.js', "archive_revisit"],
  ['miniprogram/pages/archive/index.js', "!item.id"],
  ['miniprogram/pages/archive/index.js', "isNaN(date.getTime())"],
  ['miniprogram/pages/dream-chat/index.js', "MAX_STORED_MESSAGES"],
  ['miniprogram/pages/dream-chat/index.js', "chatAboutDream"],
  ['miniprogram/pages/profile/index.js', "cloudBase.saveProfile"],
  ['miniprogram/pages/profile/index.js', "refreshPortraitInBackground"],
  ['miniprogram/pages/profile/index.js', "deleteLifeNote"],
  // 画像的编排只有一份实现（utils/stagePortrait），梦册和「我」两页都用它。
  // 两页各自实现会立刻分叉：同一个快照在两处显示出不同的版本号或状态。
  ['miniprogram/utils/stagePortrait.js', "toggleUse"],
  ['miniprogram/pages/archive/index.js', "openPortraitChat"],
  ['miniprogram/utils/stagePortrait.js', "generateProfilePortrait"],
  ['miniprogram/utils/stagePortrait.js', "toggleProfilePortrait"],
  ['miniprogram/pages/archive/index.js', "stagePortrait.createController"],
  ['miniprogram/pages/profile/index.js', "stagePortrait.createController"],
  ['miniprogram/cloudfunctions/profileMemory/index.js', "profile_snapshots"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "INTERPRET_PROVIDER"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "DEEPSEEK_API_KEY"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "OPENAI_COMPATIBLE_API_KEY"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "response_format"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "fallbackProvider: 'none'"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "retryable: true"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "normalizeAiResult"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "healthCheck"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "providerConfigured"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "hasApiKey"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "baseUrlHost"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "PROMPT_VERSION"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "dream_facts"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "possible_connections"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "reading_hook"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "sanitizeFortuneClaims"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "loadDreamMemory"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "cultural_symbolism"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "loadCurrentPortrait"],
  ['miniprogram/cloudfunctions/interpretDream/package.json', "lunar-javascript"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "OPENAI_IMAGE_API_KEY"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "OPENAI_IMAGE_ENDPOINT_URL"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "aspectRatio"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "replyType"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/v1/draw/nano-banana"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/v1/draw/result"],
  ['miniprogram/cloudfunctions/generateDreamImage/visualPlan.js', "rough screenprint and risograph texture"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "aspect_ratio: '3:4'"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/result"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "generated-dream-images/"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "getTempFileURL"],
  ['miniprogram/cloudfunctions/generateDreamImage/visualPlan.js', "high-saturation flat color blocks"],
  ['miniprogram/cloudfunctions/generateDreamImage/visualPlan.js', "EMOTION_PALETTES"],
  ['miniprogram/cloudfunctions/generateDreamImage/visualPlan.js', "COMPOSITIONS"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "STYLE_VERSION"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "cache_key"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "LEGACY_THEMES"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "detectImageFormat"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "imageBytes"],
] as const) {
  assertIncludes(path, expected);
}

assert.equal(contentSafety.validateDreamText('我在清晨的海边捡到一把钥匙').safe, true);
assert.equal(contentSafety.validateDreamText('').safe, false);
assert.equal(contentSafety.validateDreamText('水').safe, false);
assert.equal(contentSafety.validateDreamText('我梦见自己不想活了').safe, false);
assert.equal(contentSafety.validateDreamText('我梦见医生给我诊断癌症').safe, false);
assert.equal(read('miniprogram/cloudfunctions/interpretDream/index.js').includes('profile.confirmedPortrait.themes'), false);
assert.equal(read('miniprogram/cloudfunctions/interpretDream/index.js').includes('profile.confirmedPortrait.traits'), false);
assertNotIncludes('miniprogram/pages/home/index.js', 'localDreamOracle');
// ── 折叠边界：这次改版的全部意义就在这条线的两侧 ──
//
// 共鸣来自「具体到用户能当场核对」。所以能被核对的内容必须在折叠外，对谁都
// 成立的内容才进折叠。字符串存在性检查测不出位置——三个模块搬回原处，上面
// 那批断言依然全绿——所以这里直接比较它们在模板里的偏移量。
//
// 「与你有关」尤其关键：prompt 要求已核实的历史呼应落在 possible_connections
// 或 underneath，两处都必须可见，否则记忆呼应命中率会显示很高，而用户一个字
// 都没看到。
// 注释里也会出现这些模块名，会让 indexOf 量到错误的位置，所以先剥掉注释，
// 只对真正渲染的标记做位置判断。
const resultTemplate = read('miniprogram/pages/result/index.wxml').replace(/<!--[\s\S]*?-->/g, '');
const foldStart = resultTemplate.indexOf('class="tier-full"');
assert.ok(foldStart > 0, '结果页应保留折叠区');
for (const visible of ['与你有关', '你之前提到过', '心理视角', '这是一种理解角度']) {
  const at = resultTemplate.indexOf(visible);
  assert.ok(at > 0 && at < foldStart, `${visible} 必须在折叠区之外`);
}
for (const folded of ['梦里发生了什么', '传统解梦怎么说']) {
  const at = resultTemplate.indexOf(folded);
  assert.ok(at > foldStart, `${folded} 应留在折叠区内`);
}

// ── 「与你有关」只能是自然语句，不能是标签块 ──
//
// 画像接进解读之后，最省事的写法是把画像主题原样贴出来：「承接压力」。它读起来
// 不是理解，是归档——用户明确反感这一点。提示词里已经禁了，但那是靠模型自觉；
// 这条是产品的硬边界，不能只有一道靠说服的闸，所以云函数里必须有确定性兜底。
assertIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'stripConnectionLabels');
assertIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'CONNECTION_LABEL_META_PATTERN');
// 结果页自己也不许在呼应周围造标签块——渲染的是模型那句话本身，前后不加分类框。
assert.doesNotMatch(
  resultTemplate.slice(resultTemplate.indexOf('connection-list'), resultTemplate.indexOf('reading-boundary')),
  /[「『]/,
  '「与你有关」的呼应不得被括号框成标签'
);

// 兜底文案不得预设梦里有什么。「一段话」这类预设一旦在无对话的梦上触发，
// 就是对用户自己的梦说了假话。
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', '梦里出现了一段让你停住的话');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', '这也可能只是梦里一段需要慢慢消化的话');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'person pausing before an unfinished conversation');

assertNotIncludes('miniprogram/pages/home/index.js', 'buildLocalDreamResult');
assertNotIncludes('miniprogram/pages/home/index.js', 'createLocalResult');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'cloudbase-static-fallback');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'INTERPRET_STRICT_AI');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'inferLiteralVisuals');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'buildPsychologicalFallback');
assertNotIncludes('miniprogram/cloudfunctions/interpretDream/index.js', 'buildCulturalSymbolismFallback');
assert.equal(fs.existsSync('miniprogram/utils/localDreamOracle.js'), false);
assert.equal(fs.existsSync('miniprogram/utils/profileOracle.js'), false);

const modelDreamFixture = Object.assign({}, acceptance.acceptanceDreamResult, {
  title: '云影',
  card_theme: 'shadow',
  card_theme_label: '追逐',
  symbols: ['追逐', '学校', '门'],
  dream_translation: '我梦见自己在学校考试迟到，被一个黑影追着跑，怎么也找不到出口。',
});

const memoryFixture = [1, 2, 3].map((index) => ({
  id: `memory-${index}`,
  status: 'ready',
  createdAt: new Date().toISOString(),
  result: { symbols: ['学校', index === 3 ? '门' : '追逐'] },
  dreamFacts: {
    people: ['老师'],
    places: ['学校'],
    emotions: ['紧张'],
    actions: ['寻找出口'],
  },
}));
const crossDreamInsights = dreamMemory.buildInsights(memoryFixture);
assert.equal(crossDreamInsights.eligible, true);
assert.equal(crossDreamInsights.recurringSymbols[0].label, '学校');
assert.equal(crossDreamInsights.recurringSymbols[0].count, 3);
assert.equal(crossDreamInsights.recurringPeople[0].label, '老师');
assert.equal(crossDreamInsights.monthlyCard.eligible, true);
const portraitDraft = dreamMemory.buildProfileDraft({ nickname: 'Runtu' }, memoryFixture, 2, '三条新梦');
assert.equal(portraitDraft.status, 'confirmed');
assert.equal(portraitDraft.version, 2);
assert.ok(portraitDraft.summary.includes('学校'));
assert.equal(portraitDraft.sourceRefs.length, 3);

const wx = createWxMock();
const mainSyncQueue = loadCommonJS<Record<string, any>>('miniprogram/utils/syncQueue.js', { wx });
const cloudBase = loadCommonJS<CloudBaseModule>('miniprogram/utils/cloudBase.js', {
  wx,
  setTimeout,
  clearTimeout,
});
const recorderRouter = loadCommonJS<Record<string, any>>('miniprogram/utils/recorderRouter.js', { wx });
const analytics = loadCommonJS<AnalyticsModule>(
  'miniprogram/utils/analytics.js',
  { wx },
  { './cloudBase': cloudBase }
);
const stagePortrait = loadCommonJS<Record<string, any>>(
  'miniprogram/utils/stagePortrait.js',
  { wx, setTimeout, clearTimeout },
  { './analytics': analytics, './syncQueue': mainSyncQueue }
);
analytics.clearEvents();
assert.equal(analytics.STORAGE_KEY, 'oneiro:events');
assert.equal(cloudBase.CLOUD_STATUS_KEY, 'oneiro:cloudStatus');
assert.equal(cloudBase.initCloud(), true);
let identitySource = '';
cloudBase.getIdentity((identity: { openid: string; source: string }) => {
  identitySource = identity.source;
});
assert.equal(identitySource, 'cloud');
let aiHealthProvider = '';
  cloudBase.aiHealth((health: { provider: string; providerConfigured: boolean; requestTimeoutMs: number }) => {
  aiHealthProvider = health.provider;
  assert.equal(health.providerConfigured, true);
  assert.equal(health.requestTimeoutMs, 45000);
});
assert.equal(aiHealthProvider, 'mock-cloud');
analytics.trackEvent('app_start', { source: 'test', ignored: { nested: true } });
assert.equal(analytics.getEvents()[0].name, 'app_start');
assert.equal(analytics.getEvents()[0].metadata.source, 'test');
assert.equal(Object.prototype.hasOwnProperty.call(analytics.getEvents()[0].metadata, 'ignored'), false);
assert.ok(wx.cloudCalls.some((call) => call.name === 'trackEvent'));

const app = {
  globalData: {
    pendingTabParams: {} as Record<string, Record<string, any>>,
    currentDream: null,
    currentArtifact: null,
    lastProfile: {
      nickname: '',
      birthDate: '',
      birthTime: '',
      birthPlace: '',
      gender: '',
    },
  },
};
// tabNav 依赖运行时的 getApp() 与 wx，因此在 wx / app 就绪后再加载
const tabNav = loadCommonJS<Record<string, any>>('miniprogram/utils/tabNav.js', {
  getApp: () => app,
  wx,
});

const pageModules = {
  '../../utils/acceptanceDream': acceptance,
  '../../utils/analytics': analytics,
  '../../utils/cloudBase': cloudBase,
  '../../utils/contentSafety': contentSafety,
  '../../utils/dreamArtifacts': dreamArtifacts,
  '../../utils/dreamMemory': dreamMemory,
  '../../utils/canvasFrame': canvasFrame,
  '../../utils/tabNav': tabNav,
  '../../utils/syncQueue': mainSyncQueue,
  '../../utils/recorderRouter': recorderRouter,
  '../../utils/stagePortrait': stagePortrait,
};

const homePage = loadPage('miniprogram/pages/home/index.js', pageModules, wx, app);
homePage.onLoad({ fromShare: '1' });
assert.equal(homePage.data.fromShare, true);

// Leaving while recording stops the native recorder before unregistering the
// page, resets visible state immediately, and discards the late terminal
// callback rather than recognizing a partial clip.
homePage.data.recording = true;
homePage.data.recordingSeconds = 3;
const recorderStopsBeforeHomeHide = wx.recorderStopCalls;
homePage.onHide();
assert.equal(homePage.data.recording, false);
assert.equal(homePage.data.recordingSeconds, 0);
assert.equal(wx.recorderStopCalls, recorderStopsBeforeHomeHide + 1);
if (wx.recorderStopListener) wx.recorderStopListener({ tempFilePath: '/tmp/partial.m4a', duration: 3000 });
assert.equal(homePage.data.recognizing, false);
homePage.onShow();

const dreamChatExitPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
dreamChatExitPage.onShow();
dreamChatExitPage.data.recording = true;
dreamChatExitPage.data.recordingSeconds = 2;
dreamChatExitPage.onHide();
assert.equal(dreamChatExitPage.data.recording, false);
assert.equal(dreamChatExitPage.data.recordingSeconds, 0);

// Drag submission is based on finger coordinates, never on asynchronous
// rendering state. Keep this focused on the gesture path so recording and
// recognition behavior remain covered by the integration checks below.
const originalGenerateDreamCard = homePage.generateDreamCard;
let gestureSubmitCount = 0;
homePage.generateDreamCard = function () {
  gestureSubmitCount += 1;
};

function startVoiceGesture(page: MiniProgramPage): void {
  page.voiceTouching = true;
  page.voiceStartX = 100;
  page.voiceStartY = 100;
  page.voiceLongPressStarted = false;
  page.voiceDragZone = 'none';
  page.lastDragZone = 'none';
  page.voiceMoved = false;
  page.voiceStartTimer = null;
  page.voiceAutoStopped = false;
  page.voiceStopAfterAuthorization = false;
  // 默认「这次停止是用户要求的」，好让下面的用例只在真的要测 60 秒上限时
  // 才显式把它翻成 false。
  page.userStoppedRecorder = true;
  page.data.recording = false;
  page.data.recognizing = false;
  page.data.editingDream = false;
  page.data.dreamText = '已经写下的梦';
}

// 已经进入录音的手势：拖到哪都还在录，松手的位置决定收尾方式。
function startVoiceRecordingGesture(page: MiniProgramPage): void {
  startVoiceGesture(page);
  page.voiceLongPressStarted = true;
  page.voiceCancelled = false;
  page.voiceSubmitAfterRecognition = false;
  page.data.recording = true;
  page.recordingStartedAt = Date.now() - 3000;
}

function touchAt(y: number): Record<string, unknown> {
  return { touches: [{ clientX: 100, clientY: y }] };
}

function touchEndAt(y: number): Record<string, unknown> {
  return { changedTouches: [{ clientX: 100, clientY: y }] };
}

// A slow drag that passes 39px then 41px submits at its final point.
startVoiceGesture(homePage);
homePage.onVoiceTouchMove(touchAt(139));
assert.equal(homePage.voiceDragZone, 'attempt');
homePage.onVoiceTouchMove(touchAt(141));
assert.equal(homePage.voiceDragZone, 'submit');
homePage.onVoiceTouchEnd(touchEndAt(141));
assert.equal(gestureSubmitCount, 1);

// The 40px boundary is inclusive; 39px remains an incomplete attempt.
startVoiceGesture(homePage);
homePage.onVoiceTouchEnd(touchEndAt(140));
assert.equal(gestureSubmitCount, 2);
startVoiceGesture(homePage);
homePage.onVoiceTouchEnd(touchEndAt(139));
assert.equal(gestureSubmitCount, 2);

// Crossing the boundary is not sticky: releasing after returning to 39px
// must not submit even though the last touchmove entered the submit zone.
startVoiceGesture(homePage);
homePage.onVoiceTouchMove(touchAt(160));
assert.equal(homePage.voiceDragZone, 'submit');
homePage.onVoiceTouchEnd(touchEndAt(139));
assert.equal(gestureSubmitCount, 2);

// 跟手位移必须一路跟到判定阈值，中间不能出现「手指还在动、圆环已经不动」
// 的死区——那正是用户读成「手势没反应」的地方。
startVoiceGesture(homePage);
homePage.onVoiceTouchMove(touchAt(140));
assert.equal(homePage.data.dragDy, 40);
homePage.onVoiceTouchEnd(touchEndAt(140));
assert.equal(gestureSubmitCount, 3);

// 划了但没到位：什么都不做，且绝不能把文字编辑态打开——用户刚做的是一个
// 滑动手势，突然弹出输入法是完全无关的反馈。
startVoiceGesture(homePage);
homePage.onVoiceTouchMove(touchAt(125));
assert.equal(homePage.voiceDragZone, 'attempt');
homePage.onVoiceTouchEnd(touchEndAt(125));
assert.equal(gestureSubmitCount, 3);
assert.equal(homePage.data.editingDream, false);

// 拖拽绝不中断录音的启动。之前有一个「越过 slop 就判定为划、撤掉长按计时器」
// 的分支，结果是按下后马上开始拖的人根本录不上音——按住说话在他手里就是坏的。
// 现在唯一决定录不录的是按住时长，touchmove 不得碰长按计时器。
startVoiceGesture(homePage);
homePage.voiceStartTimer = 1;
homePage.onVoiceTouchMove(touchAt(120));
assert.equal(homePage.voiceStartTimer, 1);
assert.equal(homePage.voiceMoved, true);
homePage.voiceStartTimer = null;
homePage.onVoiceTouchEnd(touchEndAt(141));
assert.equal(gestureSubmitCount, 4);
assert.equal(homePage.data.editingDream, false);

// 纯轻触（完全没有移动）仍然打开文字输入。
startVoiceGesture(homePage);
homePage.onVoiceTouchEnd(touchEndAt(100));
assert.equal(gestureSubmitCount, 4);
assert.equal(homePage.data.editingDream, true);

// ── 已进入录音后，松手位置决定收尾方式（三条出路，见 home/index.js 顶部的
// 状态机注释）。录音期间圆环变黑，拖到任何位置都仍在录。 ──

// 上方松手 = 取消：整段丢弃，不转文字。
startVoiceRecordingGesture(homePage);
homePage.onVoiceTouchMove(touchAt(40));
assert.equal(homePage.voiceDragZone, 'cancel');
homePage.onVoiceTouchEnd(touchEndAt(40));
assert.equal(homePage.voiceCancelled, true);
assert.equal(homePage.voiceSubmitAfterRecognition, false);
assert.equal(gestureSubmitCount, 4);

// 下方松手 = 转文字后直接进入解读。
startVoiceRecordingGesture(homePage);
homePage.onVoiceTouchEnd(touchEndAt(160));
assert.equal(homePage.voiceSubmitAfterRecognition, true);
assert.equal(homePage.voiceCancelled, false);

// 其余任何位置松手 = 只转成文字。拖了但没到位也走这条路：录音已经正常收下，
// 此时提示「没划到位」会让人以为刚说的话丢了。
startVoiceRecordingGesture(homePage);
homePage.onVoiceTouchMove(touchAt(125));
assert.equal(homePage.voiceDragZone, 'attempt');
const toastsBeforeAttemptRelease = wx.toasts.length;
homePage.onVoiceTouchEnd(touchEndAt(125));
assert.equal(homePage.voiceCancelled, false);
assert.equal(homePage.voiceSubmitAfterRecognition, false);
assert.equal(wx.toasts.length, toastsBeforeAttemptRelease);

// 原地松手同样只转文字，且不得打开文字编辑态（手里刚说完话，弹键盘是打断）。
startVoiceRecordingGesture(homePage);
homePage.onVoiceTouchEnd(touchEndAt(100));
assert.equal(homePage.voiceCancelled, false);
assert.equal(homePage.voiceSubmitAfterRecognition, false);
assert.equal(homePage.data.editingDream, false);

// Simulate delayed setData. The synchronously stored zone and changedTouches
// still submit, proving rendering state is not used as business state.
const immediateSetData = homePage.setData;
homePage.setData = function () {};
startVoiceGesture(homePage);
homePage.onVoiceTouchMove(touchAt(149));
assert.equal(homePage.voiceDragZone, 'submit');
homePage.onVoiceTouchEnd(touchEndAt(149));
assert.equal(gestureSubmitCount, 5);
homePage.setData = immediateSetData;

// 手势之外必须有一条不需要被教会的路径。内测反馈里最集中的一条就是
// 「不知道要按着圆圈下滑」——一个只能靠手势触发的主流程，对第一次用的人
// 等于没有入口。按钮和手势走同一个 generateDreamCard。
startVoiceGesture(homePage);
homePage.onSubmitTap();
assert.equal(gestureSubmitCount, 6);

// 空草稿点按钮不提交，也不能是静默的（用户手势/点击做对了却什么都没发生，
// 只会被理解成功能坏了）。
homePage.data.dreamText = '';
const toastsBeforeEmptySubmit = wx.toasts.length;
homePage.onSubmitTap();
assert.equal(gestureSubmitCount, 6);
assert.ok(wx.toasts.length > toastsBeforeEmptySubmit);

// 录音中这块区域是下滑落点，不是提交按钮，点击不能越过录音直接提交。
homePage.data.dreamText = '已经写下的梦';
homePage.data.recording = true;
homePage.onSubmitTap();
assert.equal(gestureSubmitCount, 6);
homePage.data.recording = false;

homePage.generateDreamCard = originalGenerateDreamCard;
homePage.data.dreamText = '';

// 第一次用语音时，授权弹窗返回得比手指抬起晚。以前的做法是照常 start 再立刻
// stop，录到 0 长度文件，用户读到的是「语音识别暂不可用」——一次成功的授权被
// 显示成功能坏掉。现在不启动录音，只提示权限已拿到。
const recorderStartsBeforeAuthorizeRace = wx.recorderStartCalls;
homePage.voiceStopAfterAuthorization = true;
homePage.voiceCancelled = false;
homePage.voiceSubmitAfterRecognition = false;
homePage.startRecorder();
assert.equal(homePage.data.recording, false);
assert.equal(wx.recorderStartCalls, recorderStartsBeforeAuthorizeRace);
assert.equal(homePage.voiceStopAfterAuthorization, false);

// 同一场景下如果用户已经有草稿并且做的是「下滑提交」，提交意图不能因为中间
// 插了一次授权就丢掉。
let authorizeRaceSubmits = 0;
homePage.generateDreamCard = function () { authorizeRaceSubmits += 1; };
homePage.data.dreamText = '授权前就写好的梦';
homePage.voiceStopAfterAuthorization = true;
homePage.voiceSubmitAfterRecognition = true;
homePage.startRecorder();
assert.equal(authorizeRaceSubmits, 1);
assert.equal(homePage.data.recording, false);
homePage.generateDreamCard = originalGenerateDreamCard;
homePage.data.dreamText = '';

// 过短的片段送到 ASR 只会拿回 empty_result，用户读到的是「没有听清」，会以为
// 是识别不准而反复重试同样短的一下。客户端直接拦下，且不发起云调用。
const speechCallsBeforeShortClip = wx.cloudCalls.filter((call) => call.name === 'speechRecognize').length;
homePage.data.recording = true;
homePage.userStoppedRecorder = true;
homePage.recordingStartedAt = Date.now();
homePage.onRecorderStop({ tempFilePath: '/tmp/short.mp3', duration: 400 });
assert.equal(homePage.data.recording, false);
assert.equal(homePage.data.recognizing, false);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'speechRecognize').length,
  speechCallsBeforeShortClip
);

// 「说得久一点就失败」是这条链路的结构性问题，不是调大超时能解决的：base64
// 音频走 callFunction 时同一段字节要被搬两次（客户端上行一次，云函数再原样
// POST 给腾讯一次），两段耗时都随时长线性增长，而云函数平台超时是一堵固定的
// 墙。超过阈值改走云存储：客户端 uploadFile 不占 callFunction 的超时预算，
// 云函数只递一个签名 URL，运行时长几乎与音频长度无关。
const uploadsBeforeShortSpeech = wx.cloudUploads.length;
homePage.data.recording = true;
homePage.userStoppedRecorder = true;
homePage.recordingStartedAt = Date.now();
homePage.onRecorderStop({ tempFilePath: '/tmp/brief.mp3', duration: 3000 });
// 短音频仍然内联，不为一句话多付一次上传往返。
assert.equal(wx.cloudUploads.length, uploadsBeforeShortSpeech);
const inlineSpeechCall = last(wx.cloudCalls.filter((call) => call.name === 'speechRecognize'));
assert.ok(inlineSpeechCall.data.audioBase64);
assert.equal(inlineSpeechCall.data.fileID, undefined);

homePage.data.dreamText = '';
homePage.data.recording = true;
homePage.userStoppedRecorder = true;
homePage.recordingStartedAt = Date.now();
homePage.onRecorderStop({ tempFilePath: '/tmp/long.mp3', duration: 42000 });
assert.equal(wx.cloudUploads.length, uploadsBeforeShortSpeech + 1);
assert.ok(last(wx.cloudUploads).cloudPath.startsWith('voice-clips/'));
const uploadedSpeechCall = last(wx.cloudCalls.filter((call) => call.name === 'speechRecognize'));
// 长音频只传 fileID，请求体里不再有音频字节。
assert.ok(uploadedSpeechCall.data.fileID);
assert.equal(uploadedSpeechCall.data.audioBase64, undefined);
assert.equal(uploadedSpeechCall.data.duration, 42);

// ── 60 秒上限：录音可以停，说过的话不能丢 ──
// 60 秒是腾讯云「一句话识别」接口自身的上限，不是产品挑的数。原来到点时录音器
// 静默切断、界面直接退回待机，用户读到的不是「到上限了」而是「我刚说的全没了」。

// 1) 最后 15 秒开始倒数，而不是一路数到 60 然后凭空结束。
homePage.data.recording = true;
homePage.recordingStartedAt = Date.now() - 44000;
homePage.startRecordingTimer();
homePage.__tickIntervals();
// 还剩 16 秒：不打扰。
assert.equal(homePage.data.recordingSeconds, 44);
assert.equal(homePage.data.recordingCountdown, 0);
homePage.recordingStartedAt = Date.now() - 46000;
homePage.__tickIntervals();
assert.equal(homePage.data.recordingCountdown, 14);
homePage.stopRecordingTimer();

// 2) 到点时那 60 秒照常送去识别。这是这条反馈里最伤人的部分——用户已经说出口
//    的话不能因为撞到上限就整段作废。
startVoiceRecordingGesture(homePage);
let limitReleaseSubmits = 0;
homePage.generateDreamCard = function () { limitReleaseSubmits += 1; };
homePage.data.dreamText = '';
// 我们没要求停，是录音器自己走到了 60 秒。
homePage.userStoppedRecorder = false;
homePage.recordingStartedAt = Date.now() - 60000;
const speechCallsBeforeLimit = wx.cloudCalls.filter((call) => call.name === 'speechRecognize').length;
const toastsBeforeLimit = wx.toasts.length;
homePage.onRecorderStop({ tempFilePath: '/tmp/limit.mp3', duration: 60000 });
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'speechRecognize').length,
  speechCallsBeforeLimit + 1
);
assert.ok(homePage.data.dreamText);
// 到点这件事必须说出来，否则用户读到的是故障而不是上限。
assert.ok(wx.toasts.length > toastsBeforeLimit);
assert.ok(String(last(wx.toasts)).includes('60'));
assert.ok(analytics.getEvents().some((event) => event.name === 'voice_record_limit_reached'));
assert.equal(homePage.voiceAutoStopped, true);

// 3) 撞上限之后那次松手只是「把手拿开」。它落进任何一支都是错的：submit 会凭空
//    提交，pendingRecording 会置位 voiceStopAfterAuthorization——于是下一次按住
//    圆环整个变成空按，用户说了一整段，一个字都进不来。
homePage.onVoiceTouchEnd(touchEndAt(160));
assert.equal(limitReleaseSubmits, 0);
assert.ok(!homePage.voiceStopAfterAuthorization);
assert.equal(homePage.voiceAutoStopped, false);
assert.equal(homePage.voiceLongPressStarted, false);

// 4) 所以下一次按住必须真的录得起来——这是上一条的落点。
const recorderStartsBeforeResume = wx.recorderStartCalls;
homePage.data.recording = false;
homePage.data.recognizing = false;
homePage.voiceStopAfterAuthorization = false;
homePage.startRecorder();
assert.equal(wx.recorderStartCalls, recorderStartsBeforeResume + 1);
assert.equal(homePage.data.recording, true);
// 录音器自报的时长要和上限一致，客户端不能比接口放得更宽。
assert.equal(last(wx.recorderStartOptions).duration, 60000);
homePage.stopRecordingTimer();
homePage.data.recording = false;
homePage.generateDreamCard = originalGenerateDreamCard;
homePage.data.dreamText = '';
const profilePage = loadPage('miniprogram/pages/profile/index.js', pageModules, wx, app);
profilePage.onLoad();
profilePage.onInput({ currentTarget: { dataset: { key: 'nickname' } }, detail: { value: ' Runtu ' } });
profilePage.onBirthDateChange({ detail: { value: '1998-01-01' } });
profilePage.onBirthTimeChange({ detail: { value: '08:30' } });
profilePage.onGenderChange({ detail: { value: 1 } });
profilePage.onInput({ currentTarget: { dataset: { key: 'birthPlace' } }, detail: { value: ' Shanghai ' } });
profilePage.saveProfile();
assert.equal(wx.storage['oneiro:lastProfile'].nickname, 'Runtu');
assert.equal(wx.storage['oneiro:lastProfile'].birthPlace, 'Shanghai');
assert.equal(wx.storage['oneiro:lastProfile'].gender, 'male');
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveProfile'));
assert.equal(profilePage.data.memoryState.current.version, 1);

// ── 关于你的记录：按来源分组，折叠，可展开 ──────────────────────────────
//
// 此前三种来源混成一堆，统一标着「系统提取的现实线索」。dream_connection 根本
// 不是从用户话里提取的——那是我们写的一句呼应，他只是点过「是这样」。混在
// 一起，用户会在自己的资料页读到一句自己从没说过的话，还以为是自己说的。
wx.lifeNoteRows = [
  { id: 'n1', text: '我最近其实很颓废，我啥也不想干只想躺着，事实上我已经这样有两三个月了', source: '' },
  { id: 'n2', text: '黑夜中的馈赠，呼应了你当前过渡期中那种不确定但充满可能的感觉', source: 'dream_connection' },
  { id: 'n3', text: '我在考虑出国', source: '' },
  { id: 'n4', text: '那句说反了，我是当场就讲', source: 'portrait_correction' },
  { id: 'n5', text: '这周开始每天走一万步', source: '' },
  { id: 'n6', text: '换了个新组，还在适应', source: '' },
];
const lifeNotePage = loadPage('miniprogram/pages/profile/index.js', pageModules, wx, app);
lifeNotePage.onLoad();
const spokenGroup = lifeNotePage.data.lifeNoteGroups.find((group: Record<string, any>) => group.key === 'spoken');
const confirmedGroup = lifeNotePage.data.lifeNoteGroups.find((group: Record<string, any>) => group.key === 'confirmed');
assert.ok(spokenGroup && confirmedGroup);
// 画像纠偏里说的话也是他的原话，和梦后对话提取的归在一起。
assert.equal(spokenGroup.total, 5);
assert.equal(confirmedGroup.total, 1);
assert.ok(!spokenGroup.notes.some((note: Record<string, any>) => note.id === 'n2'));
assert.ok(confirmedGroup.hint.includes('Oneiro 写的'));

// 折叠：超过三条才出现展开入口，展开后全部可见。
assert.equal(spokenGroup.notes.length, 3);
assert.equal(spokenGroup.collapsible, true);
assert.equal(spokenGroup.hiddenCount, 2);
assert.equal(confirmedGroup.collapsible, false);
lifeNotePage.toggleLifeNoteGroup({ currentTarget: { dataset: { group: 'spoken' } } });
assert.equal(
  lifeNotePage.data.lifeNoteGroups.find((group: Record<string, any>) => group.key === 'spoken').notes.length,
  5
);

// 缩略：长句先截断，点一下看全文。
const longNote = lifeNotePage.data.lifeNoteGroups
  .find((group: Record<string, any>) => group.key === 'spoken')
  .notes.find((note: Record<string, any>) => note.id === 'n1');
assert.equal(longNote.truncated, true);
assert.ok(longNote.displayText.endsWith('…'));
assert.ok(longNote.displayText.length < longNote.text.length);
lifeNotePage.toggleLifeNote({ currentTarget: { dataset: { key: 'n1' } } });
assert.equal(
  lifeNotePage.data.lifeNoteGroups
    .find((group: Record<string, any>) => group.key === 'spoken')
    .notes.find((note: Record<string, any>) => note.id === 'n1').displayText,
  wx.lifeNoteRows[0].text
);
// 短句不该被加上「全文」。
assert.equal(
  lifeNotePage.data.lifeNoteGroups
    .find((group: Record<string, any>) => group.key === 'spoken')
    .notes.find((note: Record<string, any>) => note.id === 'n3').truncated,
  false
);

// 分组之后按下标定位就不成立了——界面位置和 lifeNotes 里的位置不再对应，折叠
// 还会让可见项少于实际项。编辑/删除必须按 id 查。
assert.equal(lifeNotePage.findLifeNote({ currentTarget: { dataset: { key: 'n6' } } }).text, '换了个新组，还在适应');
assert.equal(lifeNotePage.findLifeNote({ currentTarget: { dataset: { key: 'nope' } } }), null);
wx.lifeNoteRows = [];

// 「我」页只剩一个只读入口：完整面板在「梦册」顶部。这一页是一整页表单，把
// 产品里最有辨识度的产出摆在表单上方，它会被读成一个用户自己填的字段。入口
// 仍然要显示版本与状态，否则老用户在熟悉的位置什么都看不到。
assert.equal(profilePage.data.portraitVersionLabel, 'V1');
assert.ok(profilePage.data.portraitStatusLabel.length > 0);
assert.equal(typeof profilePage.startPortraitEdit, 'undefined');
profilePage.openPortrait();
assert.equal(last(wx.navigations), '/pages/archive/index');

// 画像的编辑/重新梳理/溯源/历史版本全部在梦册。下面这些用例跟着 UI 一起搬到
// archive 页，编排逻辑本身由 utils/stagePortrait 共享，两页不会分叉。
function loadPortraitPage(): MiniProgramPage {
  const page = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
  page.onLoad({});
  page.portrait.load();
  return page;
}

const portraitPage = loadPortraitPage();

// 手写输入框没了：按钮只能传达「错了」，输入框把写作负担丢给用户，而且他写的
// 那句会被当成最高权重原文照抄回画像——等于让用户自己给自己下判断。两个都换
// 成对话，入口按钮上写的就是那句异议本身。
assert.equal(typeof portraitPage.startPortraitEdit, 'undefined');
assert.equal(typeof portraitPage.savePortraitEdit, 'undefined');
assert.equal(typeof portraitPage.onPortraitSummaryInput, 'undefined');
portraitPage.openPortraitChat();
assert.equal(last(wx.navigations), '/pages/dream-chat/index?portrait=1');

// 历史版本一直存在 profile_snapshots 里，此前界面只显示当前这一版。
// 「三个月前你是这样，现在你是这样」是画像唯一能做、而单次解读永远做不到的事。
assert.ok(portraitPage.data.memoryState.current.summary.length > 0);
assert.equal(portraitPage.data.showPortraitHistory, false);
portraitPage.togglePortraitHistory();
assert.equal(portraitPage.data.showPortraitHistory, true);

// A usable cached current portrait must not generate again merely because the
// get request has no newer state. Legacy template text does trigger exactly
// one replacement, and the explicit refresh remains available afterwards.
const generatePortraitCalls = () => wx.cloudCalls.filter((call) => call.name === 'profileMemory' && call.data.action === 'generate').length;
const validPortraitGenerateCount = generatePortraitCalls();
loadPortraitPage();
assert.equal(generatePortraitCalls(), validPortraitGenerateCount);
const userEditedMetaState = wx.storage['oneiro:profileMemory'] as Record<string, any>;
userEditedMetaState.current = Object.assign({}, userEditedMetaState.current, {
  summary: '这是我基于近期经历写下的一份阶段性观察。',
  profileText: '这是我基于近期经历写下的一份阶段性观察。',
  userEdited: true,
});
wx.storage['oneiro:profileMemory'] = userEditedMetaState;
loadPortraitPage();
assert.equal(generatePortraitCalls(), validPortraitGenerateCount);
const legacyState = wx.storage['oneiro:profileMemory'] as Record<string, any>;
legacyState.current = Object.assign({}, legacyState.current, {
  summary: '这是一份基于近期梦境与生活记录形成的阶段性观察，供你确认、修改或拒绝。',
  profileText: '',
  userEdited: null,
  userEditedOriginal: null,
});
wx.storage['oneiro:profileMemory'] = legacyState;
const legacyPortraitPage = loadPortraitPage();
assert.equal(generatePortraitCalls(), validPortraitGenerateCount + 1);
assert.equal(legacyPortraitPage.data.memoryState.current.summary, wx.profilePortraitSummary);
assert.equal(legacyPortraitPage.data.memoryState.history.filter((item: Record<string, any>) => item.isCurrent === true).length, 1);
legacyPortraitPage.refreshPortrait();
assert.equal(generatePortraitCalls(), validPortraitGenerateCount + 2);

const profileTextOnlyState = wx.storage['oneiro:profileMemory'] as Record<string, any>;
profileTextOnlyState.current = Object.assign({}, profileTextOnlyState.current, {
  summary: '',
  profileText: '只存在 profileText 的旧阶段画像',
});
wx.storage['oneiro:profileMemory'] = profileTextOnlyState;
wx.failNextPortraitGenerate = true;
const profileTextOnlyPage = loadPortraitPage();
assert.equal(profileTextOnlyPage.data.memoryState.current.summary, '只存在 profileText 的旧阶段画像');
assert.equal(profileTextOnlyPage.data.memoryState.current.profileText, '只存在 profileText 的旧阶段画像');
profileTextOnlyPage.refreshPortrait();
assert.equal(profileTextOnlyPage.data.portraitGenerateFailed, true);
assert.equal(profileTextOnlyPage.data.memoryState.current.summary, '只存在 profileText 的旧阶段画像');
profileTextOnlyPage.refreshPortrait();
assert.equal(profileTextOnlyPage.data.portraitGenerateFailed, false);
assert.equal(profileTextOnlyPage.data.memoryState.current.summary, wx.profilePortraitSummary);

// 用户主动点「重新梳理」要带 force：云端据此区分「后台刷新，证据没变就整个
// 跳过」和「用户明确要一次新解读，即使证据没变也真的跑一次生成」。
assert.equal(wx.lastPortraitGenerateForced, true);

// 云端判定没有实质变化时不发新版本。这是正常结果，不是失败：画像原样保留、
// 不进失败态、不出现「已更新」。以前每记一个梦都重生成并发一版，V2 和 V3
// 常常只是换了说法——版本号一通胀，历史时间轴和「画像更新了」这条召回提示
// 就同时退化成噪音，而这两个功能的价值全建立在「版本变了 = 真的变了」上。
const unchangedPage = loadPortraitPage();
const summaryBeforeUnchanged = unchangedPage.data.memoryState.current.summary;
const versionBeforeUnchanged = unchangedPage.data.memoryState.current.version;
const historyBeforeUnchanged = unchangedPage.data.portraitHistory.length;
wx.nextPortraitUnchanged = true;
wx.portraitUnchangedVersion = versionBeforeUnchanged;
wx.portraitUnchangedId = unchangedPage.data.memoryState.current._id;
unchangedPage.refreshPortrait();
assert.equal(unchangedPage.data.portraitGenerateFailed, false);
assert.equal(unchangedPage.data.portraitLoading, false);
assert.equal(unchangedPage.data.memoryState.current.summary, summaryBeforeUnchanged);
assert.equal(unchangedPage.data.portraitHasUpdate, false);
// 没有实质变化就不该往历史里塞一版。
assert.equal(unchangedPage.data.portraitHistory.length, historyBeforeUnchanged);
assert.notEqual(versionBeforeUnchanged, undefined);
// 用户点了按钮却什么都不说，按钮转一圈回来像是坏了，所以要有一句回执。
assert.ok(last(wx.toasts).includes('没有实质变化'));
// home 与 new-dream 已合并：首页本身就是采集页，不再有二次跳转
const newDreamPage = homePage;
newDreamPage.generateDreamCard();
assert.equal(last(wx.toasts), '先写下一点梦');
wx.blockNextInterpret = true;
newDreamPage.onDreamInput({
  detail: { value: '我梦见自己站在门口，远处有一片安静的湖。' },
});
newDreamPage.generateDreamCard();
assert.equal(last(wx.modals).title, '暂不生成梦卡');
const archiveAfterBlockedDream = wx.storage['oneiro:dreamArchive'] as unknown as Array<Record<string, any>>;
assert.equal(archiveAfterBlockedDream.length, 1);
assert.equal(archiveAfterBlockedDream[0].status, 'blocked');
assert.ok(archiveAfterBlockedDream[0].dreamText.includes('安静的湖'));
wx.failNextInterpret = true;
newDreamPage.onDreamInput({
  detail: { value: '我梦见一盏灯在空房间里忽明忽暗。' },
});
newDreamPage.generateDreamCard();
const archiveAfterProviderError = wx.storage['oneiro:dreamArchive'] as unknown as Array<Record<string, any>>;
const providerErrorDream = archiveAfterProviderError.find((dream) => dream.dreamText.includes('空房间'));
assert.ok(providerErrorDream);
assert.equal(providerErrorDream.status, 'pending');
assert.equal(providerErrorDream.result, null);
assert.equal(providerErrorDream.interpretationError, 'ai_provider_error');
assert.equal(providerErrorDream.interpretationRevision, 1);

const pendingResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
pendingResultPage.onLoad({ id: providerErrorDream.id });
assert.equal(pendingResultPage.data.interpretationUnavailable, true);
assert.equal(pendingResultPage.data.dream.result.title, '尚未解读');
assert.equal(pendingResultPage.pendingInterpretationDream.result, null);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((dream) => dream.id === providerErrorDream.id)?.result,
  null
);
wx.blockNextInterpret = true;
pendingResultPage.retryInterpretation();
assert.equal(pendingResultPage.data.retryingInterpretation, false);
assert.equal(pendingResultPage.pendingInterpretationDream.status, 'blocked');
assert.equal(pendingResultPage.pendingInterpretationDream.result, null);
assert.equal(pendingResultPage.pendingInterpretationDream.interpretationRevision, 2);
assert.equal(pendingResultPage.data.dream.status, 'blocked');
assert.equal(last(wx.modals).title, '暂不生成梦卡');
wx.failNextInterpret = true;
pendingResultPage.retryInterpretation();
assert.equal(pendingResultPage.data.retryingInterpretation, false);
assert.equal(pendingResultPage.pendingInterpretationDream.result, null);
assert.equal(pendingResultPage.pendingInterpretationDream.interpretationRevision, 3);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((dream) => dream.id === providerErrorDream.id)?.result,
  null
);
assert.equal(
  last(wx.cloudCalls.filter((call) => call.name === 'saveDream')).data.dream.result,
  null
);
pendingResultPage.retryInterpretation();
assert.equal(pendingResultPage.data.retryingInterpretation, false);
assert.equal(pendingResultPage.data.interpretationUnavailable, false);
assert.equal(pendingResultPage.pendingInterpretationDream, null);
assert.equal(pendingResultPage.data.dream.status, 'ready');
assert.equal(pendingResultPage.data.dream.interpretationRevision, 4);
assert.equal(pendingResultPage.data.dream.result.title, '云影');
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((dream) => dream.id === providerErrorDream.id)?.result?.title,
  '云影'
);
newDreamPage.onDreamInput({
  detail: { value: '我梦见自己在学校考试迟到，被一个黑影追着跑，怎么也找不到出口。' },
});
newDreamPage.generateDreamCard();

const archiveAfterDream = wx.storage['oneiro:dreamArchive'] as unknown as Array<Record<string, any>>;
assert.ok(Array.isArray(archiveAfterDream));
assert.equal(archiveAfterDream.length, 3);
assert.ok(app.globalData.currentDream);
assert.ok(last(wx.navigations).startsWith('/pages/result/index?id='));
assert.ok(archiveAfterDream[0].result.symbols.includes('追逐'));
assert.equal(archiveAfterDream[0].interpretationSource, 'cloud');
assert.equal(archiveAfterDream[0].interpretationProvider, 'mock-cloud');
assert.equal(archiveAfterDream[0].status, 'ready');
assert.equal(archiveAfterDream[0].dreamFacts.places[0], '学校');
assert.equal(archiveAfterDream[0].interpretationMeta.schemaVersion, 'dream-entry-v0.2');
assert.equal(archiveAfterDream[0].interpretationMeta.promptVersion, 'oneiro-freeform-reading-v0.7-grounded-modules');
assert.equal(archiveAfterDream[0].result.title, '云影');
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream'));
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'interpretDream' && call.data?.dreamText && !call.data?.chatAboutDream)?.data?.profile?.birthTime,
  '08:30'
);
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'interpretDream' && call.data?.dreamText && !call.data?.chatAboutDream)?.data?.profile?.gender,
  'male'
);

const resultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
resultPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(resultPage.data.dream.id, archiveAfterDream[0].id);
assert.equal(resultPage.data.entryReady, true);
// 梦越长，把原文顶在解读前面越是把真正的结果推下屏幕。长文默认折叠、可展开；
// 短梦不折叠，多一个「展开」只是噪音。
assert.equal(resultPage.data.dreamTextExpanded, false);
assert.equal(
  resultPage.data.dreamTextCollapsible,
  resultPage.data.dream.dreamText.length > 26 || resultPage.data.dream.dreamText.includes('\n')
);
const collapsibleBeforeToggle = resultPage.data.dreamTextCollapsible;
resultPage.toggleOriginalDream();
assert.equal(resultPage.data.dreamTextExpanded, collapsibleBeforeToggle);
resultPage.toggleOriginalDream();
assert.equal(resultPage.data.dreamTextExpanded, false);
resultPage.requestDreamImage();
assert.equal(resultPage.data.imageStatus, 'ready');
assert.equal(resultPage.data.metaphysicalEntryVisible, false);
assert.equal(resultPage.data.metaphysicalReadingReady, true);
assert.equal(resultPage.data.dream.result.imageUrl, 'https://mock-image.example.com/oneiro.png');
assert.equal(resultPage.data.dream.result.image_cache_hit, true);
assert.equal(resultPage.data.dream.result.image_style_version, 'oneiro-seedream-dream-v2.0');
assert.equal(resultPage.data.dream.result.image_visual_plan.composition.template, 'threshold_depth');
assert.equal(resultPage.data.dream.result.image_quality_check.passed, true);
assert.equal(resultPage.data.aiImageLocalPath, '/tmp/oneiro-ai-image.png');
const qualityImageSave = wx.cloudCalls.filter((call) =>
  call.name === 'saveDream' && call.data?.dream?.id === resultPage.data.dream.id &&
  call.data?.dream?.result?.image_quality === 'high'
).slice(-1)[0];
assert.ok(qualityImageSave);
assert.match(qualityImageSave.data.dream.result.image_generation_token, /^image-[0-9a-z]+-[a-z0-9_-]{4,64}$/);
assert.equal(qualityImageSave.data.dream.result.image_quality_status, 'ready');
assert.match(resultPage.data.displayTimestamp, /^\d{4}\.\d{2}\.\d{2} · \d{2}:\d{2}$/);

const optionalMetaphysicalDream: Record<string, any> = Object.assign({}, archiveAfterDream[0], {
  id: 'optional-metaphysical-dream',
  cloudSynced: true,
  result: Object.assign({}, archiveAfterDream[0].result, {
    metaphysicalAvailable: true,
    metaphysical_resonance: '',
    metaphysical_basis: '',
    metaphysical_reading: {
      temperament: '',
      dream_echo: '',
      tension: '',
      rhythm: '',
      basis: '',
    },
  }),
});
wx.storage['oneiro:dreamArchive'] = [optionalMetaphysicalDream].concat(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).filter((dream) => dream.id !== optionalMetaphysicalDream.id)
);
const optionalResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
optionalResultPage.onLoad({ id: optionalMetaphysicalDream.id });
assert.equal(optionalResultPage.data.metaphysicalEntryVisible, true);
assert.equal(optionalResultPage.data.metaphysicalReadingReady, false);
optionalResultPage.openMetaphysicalReading();
assert.equal(optionalResultPage.data.metaphysicalReadingLoading, false);
assert.equal(optionalResultPage.data.metaphysicalReadingReady, true);
assert.equal(optionalResultPage.data.metaphysicalEntryVisible, false);
assert.equal(optionalResultPage.data.dream.result.metaphysical_resonance.includes('学校走廊'), true);
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data?.metaphysicalReading));
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data?.dream?.id === optionalMetaphysicalDream.id && call.data?.dream?.result?.metaphysical_basis));

// ── 冷启动后，已保存的出生资料不得被空默认值抹平 ──
//
// app.globalData.lastProfile 的默认值是五个空字符串俱全的对象。用 Object.assign
// 合并时，「键存在但值为空」也算一次有效覆盖，于是它会把 storage 里真实填好的
// 出生资料整个清空。症状极具迷惑性：资料页读的是 storage，显示一切正常；命理
// 视角却拿到一份空资料，要求用户去补他明明已经填过的三样东西。
//
// 这个功能已经因为相邻原因被修过多次，所以这里断言真正上行的那份 profile。
wx.storage['oneiro:lastProfile'] = {
  nickname: '云',
  birthDate: '1998-01-01',
  birthTime: '08:30',
  birthPlace: '青岛',
  gender: 'male',
};
// 冷启动状态：用户本次会话还没打开过资料页，globalData 仍是空默认值。
app.globalData.lastProfile = {
  nickname: '',
  birthDate: '',
  birthTime: '',
  birthPlace: '',
  gender: '',
};
const coldStartResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
coldStartResultPage.onLoad({ id: optionalMetaphysicalDream.id });
coldStartResultPage.openMetaphysicalReading();
const metaphysicalCalls = wx.cloudCalls.filter((call) => call.name === 'interpretDream' && call.data?.metaphysicalReading);
const coldStartProfile = metaphysicalCalls[metaphysicalCalls.length - 1].data.profile as Record<string, any>;
assert.equal(coldStartProfile.birthDate, '1998-01-01');
assert.equal(coldStartProfile.birthTime, '08:30');
assert.equal(coldStartProfile.birthPlace, '青岛');
assert.equal(resultPage.data.cardFlipped, false);
const reopenedResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
reopenedResultPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(reopenedResultPage.data.aiImageLocalPath, '/tmp/oneiro-ai-image.png');
assert.equal(reopenedResultPage.data.imageStatus, 'ready');
const legacyReadyDream = Object.assign({}, archiveAfterDream[0], {
  id: 'legacy-ready-without-status',
  status: undefined,
  result: Object.assign({}, archiveAfterDream[0].result),
});
wx.storage['oneiro:dreamArchive'] = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).concat([legacyReadyDream]);
const legacyReadyResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
legacyReadyResultPage.onLoad({ id: legacyReadyDream.id });
assert.equal(legacyReadyResultPage.data.dream.status, 'ready');
assert.equal(legacyReadyResultPage.data.interpretationUnavailable, false);
legacyReadyResultPage.openDreamChat();
assert.ok(last(wx.navigations).startsWith('/pages/dream-chat/index?id=legacy-ready-without-status'));
const activeDream = app.globalData.currentDream as any;
const currentDreamResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
currentDreamResultPage.onLoad({});
assert.equal(currentDreamResultPage.data.dream.id, activeDream.id);
assert.equal(currentDreamResultPage.data.entryReady, true);
app.globalData.currentDream = Object.assign({}, activeDream, { id: 'different-current-dream' });
const mismatchedRouteResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
mismatchedRouteResultPage.onLoad({ id: 'missing-dream-id' });
assert.equal(last(wx.navigations), '/pages/home/index');
assert.equal(mismatchedRouteResultPage.data.entryReady, false);
const cloudCallCountBeforeMismatchedReady = wx.cloudCalls.length;
mismatchedRouteResultPage.onReady();
assert.equal(wx.cloudCalls.length, cloudCallCountBeforeMismatchedReady);
app.globalData.currentDream = activeDream;
const unguardedFixtureWithCurrentPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
unguardedFixtureWithCurrentPage.onLoad({ fixture: '1' });
assert.equal(last(wx.navigations), '/pages/home/index');
app.globalData.currentDream = null;
const emptyResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
emptyResultPage.onLoad({});
assert.equal(last(wx.navigations), '/pages/home/index');
assert.equal(emptyResultPage.data.dream.dreamText, '');
const cloudCallCountBeforeInvalidReady = wx.cloudCalls.length;
emptyResultPage.onReady();
assert.equal(wx.cloudCalls.length, cloudCallCountBeforeInvalidReady);
const unguardedFixturePage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
unguardedFixturePage.onLoad({ fixture: '1' });
assert.equal(last(wx.navigations), '/pages/home/index');
const guardedFixturePage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
guardedFixturePage.onLoad({ fixture: '1', devPreview: '1' });
assert.equal(guardedFixturePage.data.dream.dreamText, acceptance.acceptanceDreamText);
app.globalData.currentDream = activeDream;
resultPage.toggleDreamCard();
assert.equal(resultPage.data.cardFlipped, true);
resultPage.toggleDreamCard();
assert.equal(resultPage.data.cardFlipped, false);
assert.ok(wx.cloudCalls.some((call) => call.name === 'generateDreamImage'));
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage')?.data?.theme,
  'shadow'
);
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage')?.data?.visualPlan?.main_event,
  '梦者在学校里被追赶并错过考试'
);
assert.ok(wx.cloudCalls.some((call) => call.name === 'generateDreamImage' && call.data?.action === 'finalizePrimaryImage'));

// Once the provider image exists, a failed result write must keep the picture
// visible and retry only the cloud sync. It must not trigger another paid
// generation request.
const imageResultSyncDream = Object.assign({}, archiveAfterDream[0], {
  id: 'image-result-sync-dream',
  cloudSynced: true,
  result: Object.assign({}, archiveAfterDream[0].result, {
    imageUrl: '',
    image_file_id: '',
    imageFileId: '',
    fileID: '',
    fileId: '',
  }),
});
wx.storage['oneiro:dreamArchive'] = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).concat([imageResultSyncDream]);
const imageResultSyncPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
imageResultSyncPage.onLoad({ id: imageResultSyncDream.id });
const generationCallsBeforeImageSyncFailure = wx.cloudCalls.filter(
  (call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage'
).length;
wx.failNextDreamSave = true;
imageResultSyncPage.requestDreamImage();
assert.equal(imageResultSyncPage.data.imageStatus, 'ready');
assert.equal(imageResultSyncPage.data.imageSyncPending, false);
assert.equal(imageResultSyncPage.data.dream.cloudSynced, true);
const generationCallsAfterImageSyncFailure = wx.cloudCalls.filter(
  (call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage'
).length;
assert.equal(generationCallsAfterImageSyncFailure, generationCallsBeforeImageSyncFailure + 1);
imageResultSyncPage.requestDreamImage();
assert.equal(imageResultSyncPage.data.imageStatus, 'ready');
assert.equal(imageResultSyncPage.data.imageSyncPending, false);
assert.equal(imageResultSyncPage.data.dream.cloudSynced, true);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage').length,
  generationCallsAfterImageSyncFailure
);

// The visible sync retry keeps the generated image intact and never asks the
// provider for another image.
imageResultSyncPage.data.dream.cloudSynced = false;
imageResultSyncPage.setData({ imageSyncPending: true });
const generationCallsBeforeSyncOnlyRetry = wx.cloudCalls.filter(
  (call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage'
).length;
imageResultSyncPage.retryDreamImageSync();
assert.equal(imageResultSyncPage.data.imageStatus, 'ready');
assert.equal(imageResultSyncPage.data.imageSyncPending, false);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage').length,
  generationCallsBeforeSyncOnlyRetry
);

// A cloud response can arrive before its provider job settles. Retrying that
// state resumes the existing deterministic job instead of creating a refresh
// request with a new paid job identity.
const pendingImageDream = Object.assign({}, archiveAfterDream[0], {
  id: 'pending-image-job-dream',
  cloudSynced: true,
  result: Object.assign({}, archiveAfterDream[0].result, {
    imageUrl: '', image_file_id: '', imageFileId: '', fileID: '', fileId: ''
  })
});
wx.storage['oneiro:dreamArchive'] = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).concat([pendingImageDream]);
const pendingImagePage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
pendingImagePage.onLoad({ id: pendingImageDream.id });
pendingImagePage.setData({
  imageStatus: 'failed',
  imageLoadError: 'primary_generation_pending',
  imageErrorMessage: '画面仍在生成'
});
pendingImagePage.retryDreamImage();
const resumeImageCall = wx.cloudCalls.filter(
  (call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage'
).slice(-1)[0];
assert.equal(resumeImageCall?.data?.forceRefresh, false);
assert.equal(resumeImageCall?.data?.requestId, undefined);

resultPage.data.dream.result = Object.assign({}, resultPage.data.dream.result, {
  imageUrl: 'https://expired.example.com/image.png',
  image_file_id: 'cloud://expired/image.png',
  imageFileId: 'cloud://expired/image-file-id.png',
  fileID: 'cloud://expired/file-id.png',
  fileId: 'cloud://expired/file-id-lower.png'
});
resultPage.retryDreamImage();
const retryImageCall = wx.cloudCalls.filter((call) => call.name === 'generateDreamImage' && call.data?.action === 'startPrimaryImage').slice(-1)[0];
assert.equal(retryImageCall?.data?.forceRefresh, true);
assert.match(retryImageCall?.data?.requestId, /^refresh-[0-9a-z]+-[a-z0-9_-]{4,64}$/);
assert.equal(resultPage.data.dream.result.image_file_id, 'cloud://mock/generated-dream-images/mock.png');
assert.equal(resultPage.data.dream.result.imageFileId, '');
assert.equal(resultPage.data.dream.result.fileID, '');
assert.equal(resultPage.data.dream.result.fileId, '');
const refreshFastImageSave = wx.cloudCalls.filter((call) =>
  call.name === 'saveDream' && call.data?.dream?.id === resultPage.data.dream.id &&
  call.data?.dream?.result?.image_refresh_token === retryImageCall.data.requestId &&
  call.data?.dream?.result?.image_quality === 'fast' &&
  call.data?.dream?.result?.image_quality_status === 'idle'
).slice(-1)[0];
assert.ok(refreshFastImageSave);
assert.equal(refreshFastImageSave.data.dream.result.image_generation_token, retryImageCall.data.requestId);
assert.equal(refreshFastImageSave.data.dream.result.image_quality_job_id, '');

// A locally ready card with no confirmed cloud save must remain available.
// Image generation is deferred until the retry save succeeds; this covers
// both an explicit failed save and legacy records where cloudSynced was absent.
const syncRetryDream = Object.assign({}, archiveAfterDream[0], {
  id: 'sync-retry-dream',
  cloudSynced: undefined,
  result: Object.assign({}, archiveAfterDream[0].result, {
    imageUrl: '',
    image_file_id: '',
    imageFileId: '',
    fileID: '',
    fileId: '',
  }),
});
wx.storage['oneiro:dreamArchive'] = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).concat([syncRetryDream]);
const syncRetryPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
syncRetryPage.onLoad({ id: syncRetryDream.id });
syncRetryPage.data.dream.cloudSynced = false;
const imageCallsBeforeSyncRetry = wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length;
const savesBeforeSyncRetry = wx.cloudCalls.filter((call) => call.name === 'saveDream').length;
wx.failNextDreamSave = true;
// 预同步失败后必须自动再试一次。以前这里把 imageStatus 设回 'idle'——'idle'
// 在 WXML 里既不显示提示也不显示「重新生成画面」按钮，用户只会看到一张永远
// 停在底色渐变上的卡，且没有任何可点的东西（内测反馈：「梦卡出不来」）。
// 沙箱的 setTimeout 是同步的，所以这一行之内自动重试已经跑完。
syncRetryPage.requestDreamImage();
// 「先存后生图」的顺序不变：第一次保存失败时不能生图，必须等重试保存成功。
// 因此这次总共至少发生了两次 saveDream（失败的那次 + 自动重试那次）。
assert.ok(wx.cloudCalls.filter((call) => call.name === 'saveDream').length >= savesBeforeSyncRetry + 2);
assert.ok(wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length > imageCallsBeforeSyncRetry);
assert.equal(syncRetryPage.data.dream.status, 'ready');
assert.equal(syncRetryPage.data.dream.cloudSynced, true);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((dream) => dream.id === syncRetryDream.id)?.cloudSynced,
  true
);

// 自动重试只走一次。真的坏掉时不能反复烧供应商额度，剩下的交给可见的失败态
// 和用户手动点「重新生成画面」。
// syncRetryDream.result 是共享引用，刚才那次成功生成已经把 imageUrl 写了回去。
// 这里必须给它一份清空过的 result，否则 requestDreamImage 会走「已有图」分支，
// 根本到不了预同步失败这条路径。
const stuckDream = Object.assign({}, syncRetryDream, {
  id: 'sync-stuck-dream',
  result: Object.assign({}, syncRetryDream.result, {
    imageUrl: '',
    image_file_id: '',
    imageFileId: '',
    fileID: '',
    fileId: '',
  }),
});
wx.storage['oneiro:dreamArchive'] = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).concat([stuckDream]);
const stuckPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
stuckPage.onLoad({ id: stuckDream.id });
stuckPage.data.dream.cloudSynced = false;
wx.failEveryDreamSave = true;
const imageCallsBeforeStuck = wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length;
stuckPage.requestDreamImage();
wx.failEveryDreamSave = false;
assert.equal(wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length, imageCallsBeforeStuck);
// 失败必须说得出口、点得动：状态是 failed（WXML 据此渲染提示 + 重试按钮），
// 且提示文案非空。
assert.equal(stuckPage.data.imageStatus, 'failed');
assert.ok(stuckPage.data.imageErrorMessage.length > 0);
assert.equal(stuckPage.data.cloudSyncPending, true);

// 离开页面再回来是用户在「没出画面」时最自然的一次自救动作，之前它什么也不做。
// 云端已有图、只是本地没取下来时必须走重取而不是生图——requestDreamImage 在
// 这种情况下会直接 early-return，imageStatus 会永远停在 'generating'，页面顶着
// 一条永不消失的「完整画面生成中」。
const revisitPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
revisitPage.onLoad({ id: syncRetryDream.id });
revisitPage.imagePipelineStarted = true;
revisitPage.data.aiImageLocalPath = '';
revisitPage.data.imageStatus = 'failed';
const imageCallsBeforeRevisit = wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length;
revisitPage.onShow();
assert.equal(wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length, imageCallsBeforeRevisit);
assert.equal(revisitPage.data.imageStatus, 'ready');
assert.equal(revisitPage.data.aiImageLocalPath, '/tmp/oneiro-ai-image.png');
// 首次进入时 onShow 排在 onReady 之前，补偿不能和首次请求撞在一起生成两张图。
const firstEnterPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
firstEnterPage.onLoad({ id: syncRetryDream.id });
const imageCallsBeforeFirstShow = wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length;
firstEnterPage.onShow();
assert.equal(wx.cloudCalls.filter((call) => call.name === 'generateDreamImage').length, imageCallsBeforeFirstShow);
syncRetryPage.retryDreamImage();
assert.equal(syncRetryPage.data.dream.cloudSynced, true);
const sharePayload = resultPage.onShareAppMessage();
assert.equal(sharePayload.path, '/pages/home/index?fromShare=1');
assert.ok(sharePayload.title.includes(resultPage.data.dream.result.title));

let renderedPath = '';
resultPage.renderShareCard({
  force: true,
  success: (tempFilePath: string) => {
    renderedPath = tempFilePath;
  },
});
assert.equal(renderedPath, '/tmp/oneiro-card.png');
assert.equal(resultPage.data.shareImagePath, '/tmp/oneiro-card.png');
assert.equal(resultPage.data.sharePath, '');
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('ONEIRO'), true);
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('NO. 001'), true);
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('2026.'), true);
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('云影'), false);
// 相册梦卡是 3:4 竖版。
assert.deepEqual(last(wx.canvasExports), { width: 900, height: 1200 });
resultPage.prepareShareCard();
assert.equal(resultPage.data.sharePath, '/pages/share/index?id=card-mock');
assert.equal(resultPage.data.publicShareImagePath, '/tmp/oneiro-card.png');
// 微信会话里的转发缩略图固定按 5:4 显示。以前直接把 900×1200 的竖版梦卡交给
// imageUrl，微信只能居中裁一条横带出来，梦卡的构图全被切坏（内测反馈：
// 「分享的卡片缩略图截成横的了」）。缩略图必须按 5:4 单独构图。
assert.deepEqual(last(wx.canvasExports), { width: 1000, height: 800 });
assert.equal(
  (last(wx.canvasExports).width / last(wx.canvasExports).height).toFixed(2),
  (5 / 4).toFixed(2)
);
// 缩略图仍然带品牌与编号，不是一张裸图。
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('ONEIRO'), true);
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('NO. 001'), true);
const readySharePayload = resultPage.onShareAppMessage();
assert.equal(readySharePayload.path, '/pages/share/index?id=card-mock');
assert.equal(readySharePayload.imageUrl, '/tmp/oneiro-card.png');
resultPage.saveCard();
assert.equal(last(wx.savedImages), '/tmp/oneiro-card.png');
assert.equal(resultPage.data.cardSaved, true);
assert.ok(wx.cloudCalls.some((call) => call.name === 'createShareCard'));
// 反馈只改变反馈字段，不再改写最终梦卡；负面反馈会带入聊天入口。
resultPage.chooseDreamFeedback({ currentTarget: { dataset: { feedback: 'too_generic' } } });
assert.equal(resultPage.data.feedback, 'too_generic');
assert.equal(resultPage.data.dream.feedback, 'too_generic');
assert.ok(resultPage.data.dream.feedbackAt);
assert.equal(resultPage.data.dream.cloudSynced, true);
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data?.dream?.feedback === 'too_generic'));
resultPage.openDreamChat();
assert.ok(last(wx.navigations).includes('feedback=too_generic'));
const feedbackChatPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
feedbackChatPage.onLoad({ id: archiveAfterDream[0].id, feedback: 'too_generic' });
assert.equal(feedbackChatPage.data.messages[0].content, '你标了\'有点泛\'。梦里哪个画面你觉得最被忽略了？我们从它开始');
resultPage.prepareShareCard();
assert.equal(wx.canvasTexts[wx.canvasTexts.length - 1].join(' ').includes('云影'), false);
assert.ok(resultPage.onShareAppMessage().title.includes('云影'));
resultPage.saveFullReading();
assert.equal(last(wx.savedImages), '/tmp/oneiro-card.png');
assert.equal(resultPage.data.shareImagePath, '/tmp/oneiro-card.png');
resultPage.openDreamChat();
assert.ok(last(wx.navigations).startsWith('/pages/dream-chat/index?id='));
const dreamChatPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
dreamChatPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(dreamChatPage.data.messages.length, 1);
dreamChatPage.onInput({ detail: { value: '我最近确实很怕赶不上期限。' } });
const lifeNoteCallsBeforeChat = wx.cloudCalls.filter((call) => call.name === 'saveDream' && call.data.action === 'addLifeNote').length;
dreamChatPage.sendMessage();
assert.equal(dreamChatPage.data.messages.length, 3);
assert.equal(dreamChatPage.data.turnCount, 1);
assert.ok(dreamChatPage.data.messages[2].content.includes('期限感'));
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.chatAboutDream));
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'saveDream' && call.data.action === 'addLifeNote').length,
  lifeNoteCallsBeforeChat + 1
);
assert.equal(
  last(wx.cloudCalls.filter((call) => call.name === 'saveDream' && call.data.action === 'addLifeNote')).data.text,
  '我最近确实很怕赶不上期限'
);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === archiveAfterDream[0].id)?.chatMessages.length,
  3
);
// 轮数不再设上限：一个梦可以一直聊下去。之前聊满 6 轮会把输入框、语音、发送
// 三个控件一起变灰（内测反馈里那句「卡死无法发送」就是它），现在这条路没有了。
dreamChatPage.data.turnCount = 12;
const chatMessagesAfterManyTurns = dreamChatPage.data.messages.length;
dreamChatPage.onInput({ detail: { value: '聊了很多轮之后我还想再说一句' } });
dreamChatPage.sendMessage();
assert.ok(
  dreamChatPage.data.messages.length > chatMessagesAfterManyTurns,
  '聊过很多轮之后仍然必须能继续发'
);

// 被安全规则拦下时，云端返回的是一句为这种处境写好的话。它原来和网络故障共用
// 同一条 toast，于是一个刚说出很重的事的人，收到的是一句「这次没回上来」。
const modalsBeforeBlockedChat = wx.modals.length;
const toastsBeforeBlockedChat = wx.toasts.length;
wx.blockNextDreamChat = true;
dreamChatPage.onInput({ detail: { value: '这一句会被安全规则拦下' } });
dreamChatPage.sendMessage();
assert.equal(wx.modals.length, modalsBeforeBlockedChat + 1, '被拦下的内容必须原样把回应送到');
assert.ok(
  String(last(wx.modals).content || '').includes('联系身边可信任的人'),
  '云端写好的那句话不能被通用错误盖掉'
);
assert.equal(wx.toasts.length, toastsBeforeBlockedChat, '这不是一次可以重试的故障，不该再弹故障提示');

// ── 画像 ↔「与你有关」的双向闭环 ──
//
// 「与你有关」是产品里唯一一处系统主动对用户的现实下判断的地方。判断只往下走
// 而收不回表态，画像就永远只能从梦本身长，用户读到的关联对不对，我们无从知道。
// 这一段测的就是那两条回路真的接上了，且各自去了不同的地方：
//   是这样 → 上行成画像证据（复用 life_note 那条管子，靠 source 分辨来源）
//   不太像 → 下行进梦后对话，成为纠偏对话的第一句
const addLifeNoteCalls = () => wx.cloudCalls.filter(
  (call) => call.name === 'saveDream' && call.data?.action === 'addLifeNote'
);
// 呼应是对象而不是字符串——wxml 里渲染的是 item.text。这条断言存在的原因很
// 直接：改成对象数组而模板还在渲染 item 时，页面上出现的是 [object Object]。
assert.equal(typeof resultPage.data.possibleConnections[0], 'object');
const confirmedConnection = resultPage.data.possibleConnections[0].text;
const rejectedConnection = resultPage.data.possibleConnections[1].text;
assert.equal(confirmedConnection, '学校与迟到可能和近期的截止时间有关。');
assert.equal(resultPage.data.possibleConnections[0].verdict, '');

const lifeNoteCallsBeforeVerdict = addLifeNoteCalls().length;
const portraitGenerationsBeforeVerdict = generatePortraitCalls();
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 0, verdict: 'confirmed' } } });
assert.equal(resultPage.data.possibleConnections[0].verdict, 'confirmed');
assert.equal(addLifeNoteCalls().length, lifeNoteCallsBeforeVerdict + 1);
// source 是这条回路和梦后对话提取现实线索的唯一区别。丢了它，画像那头就分不出
// 这句话是用户自己讲的事，还是他在我们写的一句话上点了头——而后者不能被当成
// 他的原话复述回去。
assert.equal(last(addLifeNoteCalls()).data.text, confirmedConnection);
assert.equal(last(addLifeNoteCalls()).data.source, 'dream_connection');
// 确认过的呼应不进纠偏队列：它没有要纠正的东西。
assert.equal(resultPage.data.connectionToCorrect, '');
// 确认之后必须当场重算画像，否则这条证据要等到下一个梦才生效——用户点头和
// 画像变化之间隔着一整个梦，这条回路对他来说就是不存在的。
assert.equal(generatePortraitCalls(), portraitGenerationsBeforeVerdict + 1);

// 再点一次＝撤销表态。但已经发布出去的画像证据不回撤——画像沿版本轴单调生长，
// 回撤会把「这一版为什么变了」这条轴搞乱；撤销后它只是下一版不再被强化。
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 0, verdict: 'confirmed' } } });
assert.equal(resultPage.data.possibleConnections[0].verdict, '');
assert.equal(addLifeNoteCalls().length, lifeNoteCallsBeforeVerdict + 1);

// 「不太像」是否定，不是证据：它一个字都不该上行。
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 1, verdict: 'rejected' } } });
assert.equal(resultPage.data.possibleConnections[1].verdict, 'rejected');
assert.equal(addLifeNoteCalls().length, lifeNoteCallsBeforeVerdict + 1);
assert.equal(resultPage.data.connectionToCorrect, rejectedConnection);
// 划掉一句话之后，纠偏这件事只发生在页面更下面的对话入口里。用户此刻最有话要
// 说，而那个入口在屏幕外——不带他过去，这次否定就只是一个没有下文的标记。
const scrollAfterReject = last(wx.pageScrolls);
assert.ok(scrollAfterReject, '「不太像」必须把用户带到对话入口');
assert.ok(
  scrollAfterReject.scrollTop > 0 && scrollAfterReject.scrollTop < 900 + 200,
  '停在入口上方一点，被否定的那句话要和入口同时在屏幕里'
);
// 「是这样」是确认，不需要下一步，滚动只会把人从他正在读的地方推走。
const scrollsBeforeConfirm = wx.pageScrolls.length;
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 0, verdict: 'confirmed' } } });
assert.equal(wx.pageScrolls.length, scrollsBeforeConfirm, '「是这样」不得滚动页面');
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 0, verdict: 'confirmed' } } });

// 有呼应可以裁决时，底部那块「这份解读，贴合你吗」问的是同一件事，只是更粗。
// 两个反馈控件隔着几十像素同时问「对不对」，结果是两个都被略过。
const feedbackTemplate = read('miniprogram/pages/result/index.wxml').replace(/<!--[\s\S]*?-->/g, '');
const feedbackBlockAt = feedbackTemplate.indexOf('class="dream-feedback"');
assert.ok(feedbackBlockAt > 0, '模板应保留整份解读的反馈块');
assert.ok(
  feedbackTemplate.slice(Math.max(0, feedbackBlockAt - 260), feedbackBlockAt)
    .includes('!possibleConnections.length'),
  '有逐条裁决时不得再问一遍整份解读贴不贴合'
);

// 裁决以呼应原文为键存盘。重新解读会打乱条目顺序，用下标存就会把用户当时点的
// 那次表态挂到另一条呼应上。
const verdictDream = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>)
  .find((item) => item.id === archiveAfterDream[0].id);
assert.equal(verdictDream?.connectionVerdicts[rejectedConnection].verdict, 'rejected');
assert.equal(verdictDream?.connectionToCorrect, rejectedConnection);

// 下行的那一半：被否定的呼应必须在梦后对话里被原样念回来。只说「你觉得不对」
// 而不引出是哪一条，用户没法纠正任何东西——这个梦已经聊过 3 条消息了，所以
// 纠偏问句要接在后面，而不是顶掉早就过去的开场白。
// ── 画像纠偏对话 ──────────────────────────────────────────────────────
//
// 「聊聊」是这套系统里唯一的更正通道，所以它和梦后对话共用同一个页面：复制
// 一份只有 sendMessage 不同的聊天页，等于把录音那两百行也复制一份。
const portraitChatPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
portraitChatPage.onLoad({ portrait: '1' });
assert.equal(portraitChatPage.data.portraitMode, true);
assert.equal(portraitChatPage.data.dream, null);
assert.ok(portraitChatPage.data.portraitSummary.length > 0);
// 第一句已经替用户说完了：他要付出的和点一个「不像」按钮一样多。
assert.equal(portraitChatPage.data.messages.length, 1);
assert.ok(portraitChatPage.data.messages[0].content.includes('不像你'));

const portraitGeneratesBeforeCorrection = wx.cloudCalls.filter(
  (call) => call.name === 'profileMemory' && call.data.action === 'generate'
).length;
portraitChatPage.onInput({ detail: { value: '我不是遇事先撤，我是当场就讲。' } });
portraitChatPage.sendMessage();
assert.equal(portraitChatPage.data.messages.length, 3);
assert.equal(portraitChatPage.data.sending, false);
// 走的是画像通道，不能捎带任何梦上下文上去。
const portraitChatCall = last(wx.cloudCalls.filter((call) => call.name === 'interpretDream' && call.data.chatAboutPortrait));
assert.ok(portraitChatCall);
assert.equal(portraitChatCall.data.dreamText, undefined);
assert.equal(portraitChatCall.data.userMessage, '我不是遇事先撤，我是当场就讲。');
// 对话存在本机，不挂在任何一个梦上。
assert.equal((wx.storage['oneiro:portraitChat'] as Array<Record<string, any>>).length, 3);
// 他刚说的话已经落进 life_notes，画像必须马上去读它——否则用户还得自己回去
// 点一次「重新梳理」，这次纠正就白做了。
assert.ok(
  wx.cloudCalls.filter((call) => call.name === 'profileMemory' && call.data.action === 'generate').length >
    portraitGeneratesBeforeCorrection
);

// 回来时读到的是完整那段对话，不是重新开场。
const reopenedPortraitChat = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
reopenedPortraitChat.onLoad({ portrait: '1' });
assert.equal(reopenedPortraitChat.data.messages.length, 3);

const correctionChatPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
correctionChatPage.onLoad({ id: archiveAfterDream[0].id });
const correctionOpening = last(correctionChatPage.data.messages as Array<Record<string, any>>);
assert.ok(correctionChatPage.data.messages.length > 1);
assert.equal(correctionOpening.role, 'assistant');
assert.ok(correctionOpening.content.includes(rejectedConnection));
// 接在已有对话后面的这句没人替它落盘（空对话时的开场白会被用户的第一条消息
// 一起带上，这句不会），所以它必须自己存下来，否则下次进来就凭空消失了。
assert.equal(
  last((wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>)
    .find((item) => item.id === archiveAfterDream[0].id)?.chatMessages as Array<Record<string, any>>).content,
  correctionOpening.content
);
// 同一条呼应只开一次场。每次进来都重问一遍已经聊过的事，纠偏就变成了骚扰。
const reopenedCorrectionPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
reopenedCorrectionPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(reopenedCorrectionPage.data.messages.length, correctionChatPage.data.messages.length);
// 从对话回来后，底部入口不该继续催用户去说一件他刚说完的事。对话页改的是它
// 自己从 storage 读出来的那份记录，所以结果页必须主动把标记取回来。否定本身
// 仍然留着——那条呼应还显示为「不太像」，只是不再是一件待办。
assert.equal(resultPage.data.connectionToCorrect, rejectedConnection);
resultPage.onShow();
assert.equal(resultPage.data.connectionToCorrect, '');
assert.equal(resultPage.data.possibleConnections[1].verdict, 'rejected');

resultPage.newDream();
assert.equal(last(wx.navigations), '/pages/home/index');
resultPage.openArchive();
assert.equal(last(wx.navigations), '/pages/archive/index');
resultPage.deleteDream();
assert.equal(last(wx.modals).title, '删除这个梦？');
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).some((item) => item.id === archiveAfterDream[0].id),
  false
);
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data.action === 'delete'));

// A completed interpretation is useful locally even if the final cloud write
// fails. It must be persisted as a replayable dream_sync task, not trigger a
// portrait refresh before the ready record exists in the cloud.
wx.setStorageSync(mainSyncQueue.STORAGE_KEY, []);
const firstRevisionTask = mainSyncQueue.enqueue('dream_sync', {
  dream: { id: 'revision-dream', status: 'ready', result: { title: '旧版本' }, cloudSynced: false },
});
const secondRevisionTask = mainSyncQueue.enqueue('dream_sync', {
  dream: { id: 'revision-dream', status: 'ready', result: { title: '新版本' }, cloudSynced: false },
});
assert.notEqual(firstRevisionTask.instanceId, secondRevisionTask.instanceId);
assert.equal(mainSyncQueue.remove(firstRevisionTask), false);
assert.equal(mainSyncQueue.list()[0].instanceId, secondRevisionTask.instanceId);
assert.equal(mainSyncQueue.remove(secondRevisionTask), true);
const foregroundCleanupTask = mainSyncQueue.enqueue('dream_sync', {
  dream: { id: 'foreground-cleanup', status: 'ready', result: { title: '已成功写入' }, cloudSynced: false },
});
assert.equal(mainSyncQueue.removeByKey(foregroundCleanupTask.key), true);
assert.equal(mainSyncQueue.list().some((task: any) => task.key === foregroundCleanupTask.key), false);
wx.failNextReadyDreamSave = true;
newDreamPage.onDreamInput({ detail: { value: '我梦见一扇门在雨里缓缓打开。' } });
newDreamPage.generateDreamCard();
const queuedReadyDream = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) =>
  item.dreamText.includes('一扇门在雨里')
);
assert.ok(queuedReadyDream);
assert.equal(queuedReadyDream.status, 'ready');
assert.equal(queuedReadyDream.cloudSynced, false);
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'dream_sync' && task.dream.id === queuedReadyDream.id).length, 1);
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'portrait_refresh').length, 0);

// Simulate a fresh app process: a successful replay removes dream_sync and
// schedules exactly one portrait generation after all replayed dreams land.
const portraitCallsBeforeReplay = wx.cloudCalls.filter((call) =>
  call.name === 'profileMemory' && call.data?.action === 'generate'
).length;
const restartedApp = loadApp('miniprogram/app.js', {
  './utils/analytics': analytics,
  './utils/cloudBase': cloudBase,
  './utils/syncQueue': mainSyncQueue,
}, wx);
restartedApp.flushPendingSyncTasks();
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'dream_sync').length, 0);
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'portrait_refresh').length, 0);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'profileMemory' && call.data?.action === 'generate').length,
  portraitCallsBeforeReplay + 1
);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === queuedReadyDream.id)?.cloudSynced,
  true
);

// A different-key task added while the batch's first task is in flight is
// discovered at the batch boundary and drained immediately. The original
// snapshot's failed tasks are still not retried in a loop.
const batchDrainDream = Object.assign({}, queuedReadyDream, {
  id: 'batch-drain-dream',
  cloudSynced: false,
});
wx.storage['oneiro:dreamArchive'] = [batchDrainDream];
wx.setStorageSync(mainSyncQueue.STORAGE_KEY, []);
mainSyncQueue.enqueue('portrait_refresh', { refreshKey: 'batch-drain-portrait', reason: '测试批尾排空' });
wx.beforePortraitGenerate = function () {
  wx.beforePortraitGenerate = undefined;
  mainSyncQueue.enqueue('dream_sync', { dream: batchDrainDream });
};
const batchDrainApp = loadApp('miniprogram/app.js', {
  './utils/analytics': analytics,
  './utils/cloudBase': cloudBase,
  './utils/syncQueue': mainSyncQueue,
}, wx);
batchDrainApp.flushPendingSyncTasks();
assert.equal(mainSyncQueue.list().length, 0);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === batchDrainDream.id)?.cloudSynced,
  true
);

// If a newer payload replaces an in-flight replay, the old callback must not
// mark the newer local record synced. The new task is retried in the same
// flush, but an ordinary network failure remains queued without looping.
const concurrentId = 'concurrent-replay-dream';
const concurrentOld = Object.assign({}, queuedReadyDream, {
  id: concurrentId,
  result: Object.assign({}, queuedReadyDream.result, { title: '旧云端写入' }),
  cloudSynced: false,
});
const concurrentNew = Object.assign({}, concurrentOld, {
  result: Object.assign({}, queuedReadyDream.result, { title: '本地较新写入' }),
  updatedAt: new Date(Date.now() + 1000).toISOString(),
  cloudSynced: false,
});
wx.storage['oneiro:dreamArchive'] = [concurrentOld];
wx.setStorageSync(mainSyncQueue.STORAGE_KEY, []);
mainSyncQueue.enqueue('dream_sync', { dream: concurrentOld });
  wx.beforeDreamSaveSuccess = function () {
    wx.beforeDreamSaveSuccess = undefined;
    mainSyncQueue.enqueue('dream_sync', { dream: concurrentNew });
  wx.failDreamSaveTitles.push('本地较新写入');
};
const concurrentApp = loadApp('miniprogram/app.js', {
  './utils/analytics': analytics,
  './utils/cloudBase': cloudBase,
  './utils/syncQueue': mainSyncQueue,
}, wx);
concurrentApp.flushPendingSyncTasks();
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === concurrentId)?.cloudSynced,
  false
);
assert.equal(mainSyncQueue.list().find((task: any) => task.type === 'dream_sync')?.dream.result.title, '本地较新写入');
concurrentApp.flushPendingSyncTasks();
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'dream_sync').length, 0);
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === concurrentId)?.cloudSynced,
  true
);

// Repairing several historical archive entries restores cloud consistency
// only; it must not fan out into one portrait generation per entry.
wx.setStorageSync(mainSyncQueue.STORAGE_KEY, []);
const archiveRepairBatch = [1, 2, 3, 4].map((index) => Object.assign({}, queuedReadyDream, {
  id: 'archive-batch-' + index,
  cloudSynced: false,
}));
const archiveRepairBatchPage = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
const portraitCallsBeforeArchiveRepair = wx.cloudCalls.filter((call) =>
  call.name === 'profileMemory' && call.data?.action === 'generate'
).length;
archiveRepairBatchPage.repairStaleCloudDreams(archiveRepairBatch);
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'portrait_refresh').length, 0);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'profileMemory' && call.data?.action === 'generate').length,
  portraitCallsBeforeArchiveRepair
);

// Archive repair uses the same persistent queue when its automatic save
// cannot reach the cloud, so it survives leaving the archive page.
const archiveRepairDream = Object.assign({}, queuedReadyDream, {
  id: 'archive-repair-failure',
  cloudSynced: false,
});
wx.storage['oneiro:dreamArchive'] = [archiveRepairDream];
const repairArchivePage = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
wx.failNextDreamSave = true;
repairArchivePage.repairStaleCloudDreams([archiveRepairDream]);
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'dream_sync' && task.dream.id === archiveRepairDream.id).length, 1);
assert.equal(mainSyncQueue.list().find((task: any) => task.dream.id === archiveRepairDream.id)?.refreshPortrait, false);
const portraitCallsBeforeArchiveReplay = wx.cloudCalls.filter((call) =>
  call.name === 'profileMemory' && call.data?.action === 'generate'
).length;
const archiveReplayApp = loadApp('miniprogram/app.js', {
  './utils/analytics': analytics,
  './utils/cloudBase': cloudBase,
  './utils/syncQueue': mainSyncQueue,
}, wx);
archiveReplayApp.flushPendingSyncTasks();
assert.equal(mainSyncQueue.list().filter((task: any) => task.type === 'dream_sync').length, 0);
assert.equal(
  wx.cloudCalls.filter((call) => call.name === 'profileMemory' && call.data?.action === 'generate').length,
  portraitCallsBeforeArchiveReplay
);

// 归档页会用云端记录盖回本地（同一条记录云端更新时间更晚时远端胜出）。呼应上
// 的表态因此必须一路跟着云端记录回来——漏在任何一层，用户逛一次归档回来，刚
// 点过的「是这样」就全部弹回未选中。上行出去的证据还在，但他看到的是自己的判断
// 凭空消失，那比没有这个功能更糟。
const verdictSentence = '学校与迟到可能和近期的截止时间有关。';
wx.storage['oneiro:dreamArchive'] = [{
  id: 'verdict-roundtrip', dreamText: '我梦到考试迟到。', status: 'ready',
  result: { title: '云影', possible_connections: [verdictSentence] },
  connectionVerdicts: { [verdictSentence]: { verdict: 'confirmed', text: verdictSentence } },
  connectionToCorrect: '', cloudSynced: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}];
wx.archiveListDreams = [{
  localId: 'verdict-roundtrip', dreamText: '我梦到考试迟到。', status: 'ready',
  result: { title: '云影', possible_connections: [verdictSentence] },
  connectionVerdicts: { [verdictSentence]: { verdict: 'confirmed', text: verdictSentence } },
  connectionToCorrect: '', connectionCorrectionRaisedFor: '',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}];
const verdictRoundtripPage = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
verdictRoundtripPage.onShow();
const roundtrippedDream = (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>)
  .find((item) => item.id === 'verdict-roundtrip');
assert.equal(roundtrippedDream?.connectionVerdicts[verdictSentence].verdict, 'confirmed');
wx.archiveListDreams = null;

wx.storage['oneiro:dreamArchive'] = [
  {
    dreamText: '旧梦',
    result: modelDreamFixture,
  },
];
const archivePage = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
archivePage.onShow();
assert.equal(archivePage.data.archiveCount, 1);
assert.ok(archivePage.data.archive[0].id);
assert.ok(archivePage.data.archive[0].createdAt);
assert.equal(archivePage.data.timelineGroups.length, 1);
assert.match(archivePage.data.timelineGroups[0].dreams[0].timelineTimestamp, /^\d{4}\.\d{2}\.\d{2}\s{2}\d{2}:\d{2}$/);
archivePage.openDream({ currentTarget: { dataset: { index: 0 } } });
assert.ok(last(wx.navigations).startsWith('/pages/result/index?id='));
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream'));

const sharePage = loadPage('miniprogram/pages/share/index.js', pageModules, wx, app);
sharePage.onLoad({ id: 'card-mock' });
assert.equal(sharePage.data.loading, false);
assert.equal(sharePage.data.payload.title, '云影');
sharePage.startDream();
// 改用原生 tabBar 后 switchTab 不能带查询串，fromShare 经 tabNav 暂存交接
assert.equal(last(wx.navigations), '/pages/home/index');
assert.equal(app.globalData.pendingTabParams['pages/home/index'].fromShare, true);
assert.equal(tabNav.takeParams('pages/home/index').fromShare, true);
assert.equal(Object.keys(tabNav.takeParams('pages/home/index')).length, 0);
assert.ok(wx.cloudCalls.some((call) => call.name === 'getShareCard'));

const diagnosticsPage = loadPage('miniprogram/pages/diagnostics/index.js', pageModules, wx, app);
diagnosticsPage.onLoad();
assert.equal(diagnosticsPage.data.loading, false);
assert.equal(diagnosticsPage.data.aiHealth.provider, 'mock-cloud');
assert.equal(diagnosticsPage.data.aiHealth.providerConfigured, true);
assert.equal(diagnosticsPage.data.cloudHealth.ok, true);
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.healthCheck));
assert.ok(wx.cloudCalls.some((call) => call.name === 'cloudHealth'));

// ── 内测观测面板 ──────────────────────────────────────────────────────
//
// 面板读的是全体用户的数据，所以非管理员必须什么都拿不到，而不是拿到一个
// 空面板。云函数返回 not_admin 时两块数据都要保持 null，模板整块不渲染。
assert.equal(diagnosticsPage.data.feedbackStats, null);
assert.equal(diagnosticsPage.data.internalStats, null);
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data.action === 'feedbackStats'));
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data.action === 'internalStats'));

wx.adminStatsResult = true;
diagnosticsPage.refreshStats();
assert.equal(diagnosticsPage.data.statsLoading, false);
const feedbackStats = (diagnosticsPage.data as Record<string, any>).feedbackStats;
assert.equal(feedbackStats.total, 3);
assert.equal(feedbackStats.counts.inspiring, 2);
assert.equal(feedbackStats.recent[0].feedbackLabel, '有感觉');
// 摘要开关关闭时不得凭空显示原文，模板据此隐藏整行。
assert.equal(feedbackStats.recent[0].dreamExcerpt, '');

const internalStats = (diagnosticsPage.data as Record<string, any>).internalStats;
assert.equal(internalStats.memoryEcho.hitRateText, '75%');
assert.equal(internalStats.memoryEcho.detail, '6 / 8 次带呼应的解读');
assert.equal(internalStats.memoryEcho.echoUseRateText, '50%');
assert.equal(internalStats.readingDepth.expandRateText, '20%');
assert.equal(internalStats.readingDepth.detail, '8 / 40 个梦的折叠区被展开过');
assert.equal(internalStats.retention.rate3Text, '45%');
assert.equal(internalStats.retention.rate5Text, '20%');
assert.equal(internalStats.retention.dreamsPerUser, '3.1');
assert.equal(internalStats.interpretation.failureRateText, '5%');
assert.equal(internalStats.interpretation.detail, '3 / 60 次解读尝试失败');
// 一次生图都还没发生过时，0/0 必须显示「样本不足」而不是 0%——后者会被读成
// 「生图完全没问题」，而真相是这条链路根本还没被跑过。
assert.equal(internalStats.image.failureRateText, '样本不足');
assert.equal(internalStats.image.detail, '0 / 0 次生图尝试失败');

diagnosticsPage.runSmokeTest();
assert.equal(last(wx.modals).title, '确认测试 AI');
assert.equal(diagnosticsPage.data.smokeLoading, false);
assert.equal(diagnosticsPage.data.smokeTest.provider, 'mock-cloud');
assert.equal(diagnosticsPage.data.smokeTest.reason, 'provider_error');
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.smokeTest));

// ── 同一条梦的保存必须排队 ──
// 结果页在很短的时间里会为同一条梦连着保存好几次（生图开始、高清图就绪、裁决、
// 解读评价）。云函数是「先读出已有记录、再写回去」，两次保存重叠时后写的那次基于
// 的是过期快照，事务冲突，客户端收到一次没有任何解释的保存失败。
const savesBeforeSerial = () => wx.cloudCalls.filter((call) => call.name === 'saveDream').length;
const serialBaseline = savesBeforeSerial();
const serialResults: string[] = [];
wx.deferSaveDream = true;
cloudBase.saveDream({ id: 'serial-dream', dreamText: '第一次' }, () => serialResults.push('first'));
cloudBase.saveDream({ id: 'serial-dream', dreamText: '第二次' }, () => serialResults.push('second'));
assert.equal(savesBeforeSerial(), serialBaseline + 1, '前一次还没回来时，第二次保存必须排队而不是并发发出');
// 不同的梦之间没有冲突，不该互相等待。
cloudBase.saveDream({ id: 'serial-other-dream', dreamText: '另一条梦' }, () => serialResults.push('other'));
assert.equal(savesBeforeSerial(), serialBaseline + 2, '不同的梦不得互相排队');
while (wx.deferredSaveDreams.length) {
  const release = wx.deferredSaveDreams.shift();
  if (release) release();
}
assert.equal(savesBeforeSerial(), serialBaseline + 3, '前一次回来之后，排队的那次必须自己发出去');
assert.deepEqual(serialResults, ['first', 'other', 'second'], '每一次保存都必须拿到自己的回调');
wx.deferSaveDream = false;

// ── 保存进行中不是保存失败 ──
// 「未同步，稍后自动重试」原来在保存刚发出的那一刻就显示出来，等云函数返回才消失
// ——冷启动时能顶十几秒。用户看到的「一直同步不上」大多是这一句在保存中说的话。
wx.deferSaveDream = true;
resultPage.chooseDreamFeedback({ currentTarget: { dataset: { feedback: 'inspiring' } } });
assert.equal(resultPage.data.cloudSyncSaving, true, '保存中要标成保存中');
assert.equal(resultPage.data.cloudSyncPending, false, '保存还没回来，不能显示成同步失败');
while (wx.deferredSaveDreams.length) {
  const release = wx.deferredSaveDreams.shift();
  if (release) release();
}
assert.equal(resultPage.data.cloudSyncSaving, false);
assert.equal(resultPage.data.cloudSyncPending, false, '保存成功后不得留下未同步');
// 存的是「这份解读贴不贴合」，和高清图没有任何关系。
assert.equal(resultPage.data.qualitySyncPending, false, '评价保存失败不得显示成高清图待同步');
wx.deferSaveDream = false;
// 真失败时横幅必须说得出是什么失败了。裁决和解读评价这两条路径原来只置位不记
// 原因，横幅就是一句光秃秃的「未同步」——用户看不懂，我也无从排查。
wx.failEveryDreamSave = true;
resultPage.onConnectionVerdict({ currentTarget: { dataset: { index: 1, verdict: 'rejected' } } });
assert.equal(resultPage.data.cloudSyncPending, true, '真的保存失败时必须显示');
assert.ok(resultPage.data.cloudSyncReason, '同步失败必须带上原因码');
wx.failEveryDreamSave = false;
resultPage.setData({ cloudSyncPending: false, cloudSyncReason: '' });

const syncTemplate = read('miniprogram/pages/result/index.wxml').replace(/<!--[\s\S]*?-->/g, '');
const syncNoticeAt = syncTemplate.indexOf('class="cloud-sync-notice"');
assert.ok(syncNoticeAt > 0, '模板应保留同步横幅');
assert.ok(
  syncTemplate.slice(Math.max(0, syncNoticeAt - 200), syncNoticeAt).includes('!cloudSyncSaving'),
  '保存进行中不得显示同步失败横幅'
);

// ── 补写成功之后，横幅必须消失 ──
// 补写队列此前只在冷启动被消费，成功后又只改 storage 不通知页面，两件事叠起来
// 的效果是：一条早就同步好的梦，页面一整个会话都挂着「未同步／高清图待同步」。
const appSource = read('miniprogram/app.js');
assert.ok(appSource.includes('onShow: function'), 'App 必须在回到前台时消费补写队列');
assert.ok(
  appSource.indexOf('notifyDreamSynced(task.dream.id)') > 0,
  '补写成功后必须通知页面，否则页面继续显示已经完成的同步'
);
assert.ok(
  read('miniprogram/pages/result/index.js').includes('getApp().flushPendingSyncTasks();\n}'),
  '入队后必须立刻推一次，「稍后自动重试」不能等到下次冷启动'
);
resultPage.setData({
  cloudSyncPending: true,
  qualitySyncPending: true,
  imageSyncPending: true,
  cloudSyncReason: 'mock_failure',
});
resultPage.onDreamSynced(resultPage.data.dream.id);
assert.equal(resultPage.data.cloudSyncPending, false, '同步完成后不得再显示未同步');
assert.equal(resultPage.data.qualitySyncPending, false, '三个标记来自同一件事，必须一起清');
assert.equal(resultPage.data.imageSyncPending, false);
assert.equal(resultPage.data.cloudSyncReason, '');
assert.equal(resultPage.data.dream.cloudSynced, true);
resultPage.setData({ cloudSyncPending: true });
resultPage.onDreamSynced('another-dream-entirely');
assert.equal(resultPage.data.cloudSyncPending, true, '别的梦同步完成不得清掉这一页的状态');
resultPage.setData({ cloudSyncPending: false });

// ── 示例梦：可以被读，绝不能被存 ──
// 它渲染在真实的结果页上，共用同一份数据结构，所以只要有一条写入路径漏掉守卫，
// 一个虚构的梦就会出现在用户档案里，并且从此参与画像的证据统计。这里守的就是
// 那条底线：看完之后，档案必须一字未动。
const sampleResultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
const archiveBeforeSample = JSON.stringify(wx.storage['oneiro:dreamArchive'] ?? []);
const cloudCallsBeforeSample = wx.cloudCalls.length;
sampleResultPage.onLoad({ sample: '1' });
assert.equal(sampleResultPage.data.sampleMode, true, '示例入口必须进入示例态');
assert.equal(sampleResultPage.data.entryReady, true, '示例梦必须能正常渲染');
assert.ok(sampleResultPage.data.dream.result.title, '示例梦必须带完整解读');
assert.equal(
  JSON.stringify(wx.storage['oneiro:dreamArchive'] ?? []),
  archiveBeforeSample,
  '示例梦不得写进本地档案'
);
// 埋点照常上报（要知道有多少人看了例子），但除此之外一个云调用都不许有：
// 存梦、生图、同步修复都作用在一条不属于这个用户的记录上。
assert.deepEqual(
  wx.cloudCalls.slice(cloudCallsBeforeSample)
    .map((call) => call.name)
    .filter((name) => name !== 'trackEvent'),
  [],
  '示例梦除埋点外不得产生云调用'
);
sampleResultPage.onReady();
assert.equal(sampleResultPage.data.imageStatus, 'idle', '示例梦不得进入生图管线');
const resultSource = read('miniprogram/pages/result/index.js');
assert.ok(
  resultSource.includes('if (this.data.sampleMode) return;'),
  'onReady 必须在示例态直接返回，不能只靠模板隐藏按钮'
);
// 收藏、分享、删除、聊聊这个梦作用在一条不存在的记录上；解读评价会把示例的
// 反馈算进真实用户的反馈里。这四处必须由 sampleMode 关掉。
const sampleTemplate = read('miniprogram/pages/result/index.wxml').replace(/<!--[\s\S]*?-->/g, '');
assert.ok(sampleTemplate.includes('class="sample-banner"'), '示例态必须在第一屏自报家门');
assert.ok(sampleTemplate.includes('bindtap="leaveSample"'), '示例态必须给出「去记第一个梦」的出口');
for (const gated of ['class="primary-actions"', 'class="dream-chat-entry', 'class="dream-feedback"']) {
  const at = sampleTemplate.indexOf(gated);
  assert.ok(at > 0, `模板应包含 ${gated}`);
  assert.ok(
    sampleTemplate.slice(Math.max(0, at - 420), at).includes('sampleMode'),
    `${gated} 必须被 sampleMode 关掉`
  );
}
// 空态入口只对一个梦都没有的人出现，记下第一个梦之后必须消失。
const homeTemplate = read('miniprogram/pages/home/index.wxml');
assert.ok(homeTemplate.includes('bindtap="openSample"'), '首页空态应有示例入口');
assert.ok(homeTemplate.includes('showSampleEntry'), '示例入口必须受 showSampleEntry 控制');
homePage.refreshHeroLabel();
assert.equal(
  homePage.data.showSampleEntry,
  ((wx.storage['oneiro:dreamArchive'] as unknown[]) ?? []).length === 0,
  '有梦之后不得再显示示例入口'
);
homePage.openSample();
assert.equal(last(wx.navigations), '/pages/result/index?sample=1');

// ── 每天三次解读：限的是解读，不是记录 ──
// 这条线错在任何一侧都很贵：限到记录上，用户醒来那几分钟里记不下梦，产品就没有
// 存在的理由；限得太靠后，额度检查排在模型调用之后，钱已经花掉了。
const interpretSource = read('miniprogram/cloudfunctions/interpretDream/index.js');
assert.ok(interpretSource.includes('DAILY_INTERPRETATION_LIMIT'), '云函数必须有每日解读上限');
assert.ok(
  interpretSource.indexOf('quota.limited') < interpretSource.indexOf('await interpretWithAi('),
  '额度检查必须发生在调用模型之前'
);
assert.ok(
  interpretSource.includes("status: 'ready'"),
  '额度只能按已产出结果的梦计数——失败的调用不该吃掉用户的额度'
);
assert.ok(
  interpretSource.includes('startOfDayInChina'),
  '一天的边界必须按北京时间算，否则凌晨记的梦会被算进前一天'
);
const homeSource = read('miniprogram/pages/home/index.js');
const quotaBranchAt = homeSource.indexOf('cloudResult.quotaExceeded');
assert.ok(quotaBranchAt > 0, '首页必须单独处理额度用尽');
assert.ok(
  quotaBranchAt < homeSource.indexOf('!cloudResult || !cloudResult.ok'),
  '额度用尽必须在通用失败分支之前拦下，否则会被当成解读失败'
);
const quotaBranch = homeSource.slice(quotaBranchAt, quotaBranchAt + 1800);
assert.ok(quotaBranch.includes('upsertLocalDream(pendingDream)'), '额度用尽时原梦必须仍然保存');
assert.ok(quotaBranch.includes("dreamText: ''"), '额度用尽时必须清空草稿，否则看起来像没提交成功');
assert.ok(
  read('miniprogram/pages/result/index.wxml').includes('quotaBlocked'),
  '结果页必须把「今天用完了」和「解读出错了」显示成两件事'
);

// 本地事件缓冲区上限 120 条（analytics.MAX_EVENTS），一次完整验收跑出的事件
// 早就超过了这个数，最早的 app_start 会被正常挤出去——那是生产行为，不是
// 缺陷。所以这里合并每条事件当时发出的 trackEvent 云调用，它不设上限，
// 断言的是「这些事件确实被埋过」，而不是「它们还留在缓冲区里」。
const eventNames = analytics.getEvents().map((event) => event.name).concat(
  wx.cloudCalls
    .filter((call) => call.name === 'trackEvent' && call.data?.event?.name)
    .map((call) => String(call.data.event.name))
);
for (const expected of [
  'app_start',
  'share_landing_view',
  'dream_start',
  'dream_submit',
  'dream_saved_before_interpretation',
  'dream_submit_blocked',
  'interpretation_success',
  'dream_deleted',
  'profile_view',
  'profile_saved',
  'dream_chat_open',
  'dream_feedback',
  'dream_chat_view',
  'dream_chat_reply',
  'result_view',
  'metaphysical_reading_open',
  'metaphysical_reading_done',
  'share',
  'share_card_ready',
  'share_card_open',
  'share_card_loaded',
  'generated_image_success',
  'image_success',
  'export_success',
  'archive_open',
  'archive_view',
  'archive_revisit',
  'sample_open',
]) {
  assert.ok(eventNames.includes(expected), `expected analytics event ${expected}`);
}

console.log('Mini Program MVP acceptance checks passed.');
