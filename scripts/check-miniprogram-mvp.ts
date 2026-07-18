import assert from 'node:assert/strict';
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

function assertJson(path: string): void {
  JSON.parse(read(path));
}

function last<T>(values: T[]): T {
  assert.ok(values.length > 0, 'expected a non-empty array');
  return values[values.length - 1];
}

type AcceptanceModule = {
  acceptanceDreamText: string;
  acceptanceDreamResult: Record<string, unknown> & {
    title: string;
    symbols: string[];
  };
};

type LocalOracleModule = {
  buildLocalDreamResult: (
    baseResult: AcceptanceModule['acceptanceDreamResult'],
    dreamText: string
  ) => AcceptanceModule['acceptanceDreamResult'] & {
    card_theme: string;
    card_theme_label: string;
    card_insight: string;
    emotional_weather: string;
    dream_translation: string;
    underneath: string;
    mirror: string;
    integration_question: string;
    one_small_act: string;
    oracle: string;
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

type CanvasFrameModule = {
  drawOrnamentalFrame: (
    ctx: unknown,
    width: number,
    height: number,
    options?: Record<string, unknown>
  ) => void;
};

type ProfileOracleModule = {
  personalizeDreamResult: (
    result: ReturnType<LocalOracleModule['buildLocalDreamResult']>,
    profile: {
      nickname: string;
      birthDate: string;
      birthTime?: string;
      birthPlace?: string;
    },
    index: number
  ) => ReturnType<LocalOracleModule['buildLocalDreamResult']> & {
    card_no: string;
    profile_summary: string;
    metaphysical_resonance: string;
    metaphysical_basis: string;
    birth_profile: {
      nickname: string;
      zodiac: string;
      element: string;
      chineseZodiac: string;
      timeBranch: string;
    };
  };
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
  saveDream: (dream: Record<string, unknown>, callback?: Function) => boolean;
  deleteDream: (dreamId: string, callback?: Function) => boolean;
  createShareCard: (dream: Record<string, unknown>, imageFileId: string, callback?: Function) => boolean;
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
  aiHealth: (callback?: Function) => boolean;
  aiSmokeTest: (callback?: Function) => boolean;
  trackEvent: (event: Record<string, unknown>, callback?: Function) => boolean;
  flushEvents: (events: Array<Record<string, unknown>>, callback?: Function) => boolean;
  uploadShareCard: (dreamId: string, filePath: string, callback?: Function) => boolean;
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
  cloud?: Record<string, any>;
  getStorageSync: (key: string) => any;
  setStorageSync: (key: string, value: any) => void;
  navigateTo: (options: { url: string }) => void;
  showToast: (options: { title: string }) => void;
  showModal: (options: Record<string, any>) => void;
  showLoading: (options: { title: string }) => void;
  hideLoading: () => void;
  createSelectorQuery: () => any;
  canvasToTempFilePath: (options: Record<string, any>) => void;
  getImageInfo: (options: Record<string, any>) => void;
  saveImageToPhotosAlbum: (options: Record<string, any>) => void;
  openSetting: () => void;
  getRecorderManager: () => Record<string, any>;
  authorize: (options: Record<string, any>) => void;
  getFileSystemManager: () => Record<string, any>;
};

function createCanvasContext(): Record<string, any> {
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
    fillText() {},
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
    blockNextInterpret: false,
    getStorageSync(key) {
      return this.storage[key];
    },
    getRecorderManager() {
      return {
        onStop() {},
        onError() {},
        start() {},
        stop() {},
      };
    },
    authorize(options) {
      if (options && typeof options.success === 'function') {
        options.success();
      }
    },
    getFileSystemManager() {
      return {
        readFile(options: Record<string, any>) {
          if (options && typeof options.fail === 'function') {
            options.fail({ errMsg: 'readFile:fail mock' });
          }
        },
      };
    },
    setStorageSync(key, value) {
      this.storage[key] = value;
    },
    navigateTo(options) {
      this.navigations.push(options.url);
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
          return createCanvasContext();
        },
      };

      return {
        in() {
          return this;
        },
        select() {
          return this;
        },
        fields() {
          return this;
        },
        exec(callback: Function) {
          callback([{ node: canvas, size: { width: 375, height: 667 } }]);
        },
      };
    },
    canvasToTempFilePath(options) {
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
      wx.cloudCalls.push({ name: options.name, data: options.data });
      if (options.name === 'login') {
        options.success({ result: { openid: 'mock-openid' } });
        return;
      }
      if (options.name === 'interpretDream') {
        if (options.data?.chatAboutDream) {
          options.success({
            result: {
              ok: true,
              provider: 'mock-cloud',
              fallback: false,
              reply: '你提到的期限感让学校和追逐更具体了。这可能与近期被评价的压力有关，也可能只是偶然联想。你最在意的是赶不上，还是被看见？',
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
              requestTimeoutMs: 18000,
              strictAi: false,
              fallbackProvider: 'cloudbase-static-fallback',
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
        options.success({
          result: {
            ok: true,
            provider: 'mock-cloud',
            model: 'mock-grounded-model',
            promptVersion: 'oneiro-grounded-reading-v0.2.2',
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
              mirror: '现实里可能有一个期限或评价正在逼近。',
              possible_connections: [
                '学校与迟到可能和近期的截止时间有关。',
                '追逐也可能只是紧张感在梦里的偶然组合。',
              ],
              metaphysical_resonance: 'Runtu的摩羯气质让追逐和学校显得更像责任感的提醒。',
              integration_question: '如果追逐会替你说一句真话，它想提醒什么？',
              one_small_act: '写下正在追你的事。',
              image: '云端梦卡画面以追逐、学校为核心。',
              image_prompt: 'surreal symbolic dream card, chase, school',
              echo: '给压力一个出口。',
              omens: { lucky_color_name: '云影色', reason: '云端返回的测试色。' },
            },
          },
        });
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
            styleVersion: 'oneiro-etched-dream-v2',
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
    wx,
  };

  vm.runInNewContext(read(path), sandbox, { filename: path });
  assert.ok(page, `${path} should register a Page`);
  return page!;
}

const acceptance = loadCommonJS<AcceptanceModule>('miniprogram/utils/acceptanceDream.js');
const contentSafety = loadCommonJS<ContentSafetyModule>('miniprogram/utils/contentSafety.js');
const localOracle = loadCommonJS<LocalOracleModule>('miniprogram/utils/localDreamOracle.js');
const profileOracle = loadCommonJS<ProfileOracleModule>('miniprogram/utils/profileOracle.js');
const dreamArtifacts = loadCommonJS<DreamArtifactsModule>('miniprogram/utils/dreamArtifacts.js');
const canvasFrame = loadCommonJS<CanvasFrameModule>('miniprogram/utils/canvasFrame.js');

for (const path of [
  'miniprogram/app.json',
  'miniprogram/project.config.json',
  'miniprogram/project.private.config.json',
  'miniprogram/pages/home/index.json',
  'miniprogram/pages/new-dream/index.json',
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

assertIncludes('miniprogram/project.config.json', '"cloudfunctionRoot"');
assertIncludes('miniprogram/project.config.json', 'AI 诊断页');
assertIncludes('miniprogram/project.config.json', 'pages/diagnostics/index');
for (const path of [
  'miniprogram/cloudfunctions/login/package.json',
  'miniprogram/cloudfunctions/createShareCard/package.json',
  'miniprogram/cloudfunctions/getShareCard/package.json',
  'miniprogram/cloudfunctions/interpretDream/package.json',
  'miniprogram/cloudfunctions/generateDreamImage/package.json',
  'miniprogram/cloudfunctions/saveProfile/package.json',
  'miniprogram/cloudfunctions/saveDream/package.json',
  'miniprogram/cloudfunctions/trackEvent/package.json',
]) {
  assertJson(path);
}

for (const [path, expected] of [
  ['miniprogram/pages/home/index.wxml', '记下刚才的梦'],
  ['miniprogram/pages/home/index.wxml', '打开梦境档案'],
  ['miniprogram/pages/home/index.wxml', '我的资料'],
  ['miniprogram/pages/home/index.wxml', 'fromShare'],
  ['miniprogram/pages/new-dream/index.wxml', 'bindtap="generateDreamCard"'],
  ['miniprogram/pages/new-dream/index.wxml', 'bindtap="useSample"'],
  ['miniprogram/pages/result/index.wxml', 'theme-{{dream.result.card_theme}}'],
  ['miniprogram/pages/result/index.wxml', 'dream-ai-image'],
  ['miniprogram/pages/result/index.wxml', '画面生成中'],
  ['miniprogram/pages/result/index.wxml', '你记下的原梦'],
  ['miniprogram/pages/result/index.wxml', '梦里发生了什么'],
  ['miniprogram/pages/result/index.wxml', '可能触及的现实'],
  ['miniprogram/pages/result/index.wxml', '聊聊这个梦'],
  ['miniprogram/pages/result/index.wxml', '这个梦的张力'],
  ['miniprogram/pages/result/index.wxml', '另一种可能'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="saveCard"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="saveFullReading"'],
  ['miniprogram/pages/result/index.wxml', '保存收藏梦卡'],
  ['miniprogram/pages/result/index.wxml', '保存完整解读'],
  ['miniprogram/pages/result/index.wxml', 'open-type="share"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="newDream"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="openArchive"'],
  ['miniprogram/pages/result/index.wxml', 'bindtap="deleteDream"'],
  ['miniprogram/pages/result/index.wxml', 'id="shareCanvas"'],
  ['miniprogram/pages/dream-chat/index.wxml', 'bindtap="sendMessage"'],
  ['miniprogram/pages/dream-chat/index.wxml', '{{turnCount}} / {{maxTurns}}'],
  ['miniprogram/pages/profile/index.wxml', 'bindtap="saveProfile"'],
  ['miniprogram/pages/profile/index.wxml', '可随时清空'],
  ['miniprogram/pages/share/index.wxml', '记下我的梦'],
  ['miniprogram/pages/share/index.wxml', 'theme-{{payload.cardTheme}}'],
  ['miniprogram/pages/diagnostics/index.wxml', '运行诊断'],
  ['miniprogram/pages/diagnostics/index.wxml', 'Provider Ready'],
  ['miniprogram/pages/diagnostics/index.wxml', 'requestTimeoutMs'],
  ['miniprogram/pages/diagnostics/index.wxml', 'bindtap="refresh"'],
  ['miniprogram/pages/diagnostics/index.wxml', 'AI SMOKE TEST'],
  ['miniprogram/pages/diagnostics/index.wxml', 'bindtap="runSmokeTest"'],
  ['miniprogram/pages/archive/index.wxml', '梦境档案'],
  ['miniprogram/pages/archive/index.wxml', 'wx:for="{{archive}}"'],
] as const) {
  assertIncludes(path, expected);
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
  ['miniprogram/utils/cloudBase.js', "aiHealth"],
  ['miniprogram/utils/cloudBase.js', "aiSmokeTest"],
  ['miniprogram/utils/cloudBase.js', "generateDreamImage"],
  ['miniprogram/utils/cloudBase.js', "imageHealth"],
  ['miniprogram/utils/cloudBase.js', "imageSmokeTest"],
  ['miniprogram/utils/cloudBase.js', "resolveCloudImage"],
  ['miniprogram/utils/cloudBase.js', "wx.cloud.downloadFile"],
  ['miniprogram/utils/cloudBase.js', "healthCheck"],
  ['miniprogram/utils/cloudBase.js', "smokeTest"],
  ['miniprogram/utils/cloudBase.js', "uploadShareCard"],
  ['miniprogram/utils/cloudBase.js', "deleteDream"],
  ['miniprogram/utils/cloudBase.js', "chatAboutDream"],
  ['miniprogram/pages/new-dream/index.js', "validateDreamText"],
  ['miniprogram/pages/new-dream/index.js', "interpretDream"],
  ['miniprogram/pages/new-dream/index.js', "cloudResult.blocked"],
  ['miniprogram/pages/new-dream/index.js', "createLocalResult"],
  ['miniprogram/pages/new-dream/index.js', "saveDream"],
  ['miniprogram/pages/new-dream/index.js', "dream_saved_before_interpretation"],
  ['miniprogram/pages/new-dream/index.js', "dream_submit"],
  ['miniprogram/pages/new-dream/index.js', "interpretation_success"],
  ['miniprogram/pages/new-dream/index.js', "interpretationProvider"],
  ['miniprogram/pages/new-dream/index.js', "provider: provider"],
  ['miniprogram/pages/new-dream/index.js', "wx.showModal"],
  ['miniprogram/pages/new-dream/index.js', "buildLocalDreamResult"],
  ['miniprogram/pages/new-dream/index.js', "pages/result/index?id="],
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
  ['miniprogram/pages/result/index.js', "dream_chat_open"],
  ['miniprogram/pages/result/index.js', "dream_deleted"],
  ['miniprogram/pages/result/index.wxml', "重新生成画面"],
  ['miniprogram/pages/result/index.js', "result_view"],
  ['miniprogram/pages/result/index.js', "image_success"],
  ['miniprogram/pages/result/index.js', "export_success"],
  ['miniprogram/pages/result/index.js', "uploadShareCard"],
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
  ['miniprogram/pages/diagnostics/index.js', "normalizeAiHealth"],
  ['miniprogram/pages/share/index.js', "share_card_open"],
  ['miniprogram/pages/result/index.js', "pages/new-dream/index"],
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
  ['miniprogram/pages/archive/index.js', "archive_revisit"],
  ['miniprogram/pages/archive/index.js', "!item.id"],
  ['miniprogram/pages/archive/index.js', "isNaN(date.getTime())"],
  ['miniprogram/pages/dream-chat/index.js', "MAX_USER_TURNS"],
  ['miniprogram/pages/dream-chat/index.js', "chatAboutDream"],
  ['miniprogram/pages/profile/index.js', "cloudBase.saveProfile"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "INTERPRET_PROVIDER"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "DEEPSEEK_API_KEY"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "OPENAI_COMPATIBLE_API_KEY"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "response_format"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "cloudbase-static-fallback"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "INTERPRET_STRICT_AI"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "normalizeAiResult"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "healthCheck"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "providerConfigured"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "hasApiKey"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "baseUrlHost"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "PROMPT_VERSION"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "dream_facts"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "possible_connections"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "reading_hook"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "alternative_reading"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "loadDreamMemory"],
  ['miniprogram/cloudfunctions/interpretDream/index.js', "memory_reflection"],
  ['miniprogram/cloudfunctions/interpretDream/package.json', "lunar-javascript"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "OPENAI_IMAGE_API_KEY"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "OPENAI_IMAGE_ENDPOINT_URL"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "aspectRatio"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "replyType"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/v1/draw/nano-banana"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/v1/draw/result"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "vertical 3:4 tarot-inspired"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "aspect_ratio: '3:4'"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "/result"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "generated-dream-images/"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "getTempFileURL"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "Oneiro signature style"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "STYLE_VERSION"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "cache_key"],
  ['miniprogram/cloudfunctions/generateDreamImage/index.js', "THEME_ACCENTS"],
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

const chaseDream = localOracle.buildLocalDreamResult(
  acceptance.acceptanceDreamResult,
  '我梦见自己在学校考试迟到，被一个黑影追着跑，怎么也找不到出口。'
);
const homeDream = localOracle.buildLocalDreamResult(
  acceptance.acceptanceDreamResult,
  '我回到老家的厨房，外面一直下雨，妈妈站在门口等我。'
);

assert.notEqual(chaseDream.title, acceptance.acceptanceDreamResult.title);
assert.notEqual(homeDream.title, acceptance.acceptanceDreamResult.title);
assert.notDeepEqual(chaseDream.symbols, homeDream.symbols);
assert.notEqual(chaseDream.card_theme, homeDream.card_theme);
assert.equal(chaseDream.card_theme, 'shadow');
assert.equal(homeDream.card_theme, 'tide');
assert.equal(chaseDream.card_theme_label, '追逐');
assert.ok(chaseDream.symbols.includes('追逐'));
assert.ok(chaseDream.symbols.includes('学校'));
assert.ok(homeDream.symbols.includes('清水'));
assert.ok(homeDream.symbols.includes('家屋'));
assert.ok(chaseDream.dream_translation.includes('学校考试迟到'));
assert.ok(homeDream.dream_translation.includes('老家的厨房'));

const personalized = profileOracle.personalizeDreamResult(
  chaseDream,
  {
    nickname: 'Runtu',
    birthDate: '1998-01-01',
    birthTime: '08:30',
    birthPlace: 'Shanghai',
  },
  7
);

assert.equal(personalized.card_no, 'NO. 007');
assert.equal(personalized.birth_profile.nickname, 'Runtu');
assert.equal(personalized.birth_profile.zodiac, '摩羯');
assert.ok(personalized.profile_summary.includes('Runtu'));
assert.ok(personalized.profile_summary.includes('虎生肖'));
assert.ok(personalized.metaphysical_resonance.includes('追逐'));
assert.ok(personalized.metaphysical_resonance.includes('学校'));
assert.ok(personalized.metaphysical_resonance.includes('辰时'));
assert.ok(personalized.metaphysical_basis.includes('非完整出生背景计算'));
assert.ok(personalized.metaphysical_resonance.length > 20);
assert.ok(personalized.card_insight.length > 10);
assert.ok(personalized.card_insight.includes('门'));
assert.ok(personalized.oracle.length > 10);
assert.ok(personalized.oracle.includes('摩羯'));

const wx = createWxMock();
const cloudBase = loadCommonJS<CloudBaseModule>('miniprogram/utils/cloudBase.js', { wx });
const analytics = loadCommonJS<AnalyticsModule>(
  'miniprogram/utils/analytics.js',
  { wx },
  { './cloudBase': cloudBase }
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
cloudBase.aiHealth((health: { provider: string; providerConfigured: boolean }) => {
  aiHealthProvider = health.provider;
  assert.equal(health.providerConfigured, true);
});
assert.equal(aiHealthProvider, 'mock-cloud');
analytics.trackEvent('app_start', { source: 'test', ignored: { nested: true } });
assert.equal(analytics.getEvents()[0].name, 'app_start');
assert.equal(analytics.getEvents()[0].metadata.source, 'test');
assert.equal(Object.prototype.hasOwnProperty.call(analytics.getEvents()[0].metadata, 'ignored'), false);
assert.ok(wx.cloudCalls.some((call) => call.name === 'trackEvent'));

const app = {
  globalData: {
    currentDream: null,
    currentArtifact: null,
    lastProfile: {
      nickname: '',
      birthDate: '',
      birthTime: '',
      birthPlace: '',
    },
  },
};
const pageModules = {
  '../../utils/acceptanceDream': acceptance,
  '../../utils/analytics': analytics,
  '../../utils/cloudBase': cloudBase,
  '../../utils/contentSafety': contentSafety,
  '../../utils/localDreamOracle': localOracle,
  '../../utils/profileOracle': profileOracle,
  '../../utils/dreamArtifacts': dreamArtifacts,
  '../../utils/canvasFrame': canvasFrame,
};

const homePage = loadPage('miniprogram/pages/home/index.js', pageModules, wx, app);
homePage.onLoad({ fromShare: '1' });
assert.equal(homePage.data.fromShare, true);
homePage.openProfile();
assert.equal(last(wx.navigations), '/pages/profile/index');
const profilePage = loadPage('miniprogram/pages/profile/index.js', pageModules, wx, app);
profilePage.onLoad();
profilePage.onInput({ currentTarget: { dataset: { key: 'nickname' } }, detail: { value: ' Runtu ' } });
profilePage.onBirthDateChange({ detail: { value: '1998-01-01' } });
profilePage.onBirthTimeChange({ detail: { value: '08:30' } });
profilePage.onInput({ currentTarget: { dataset: { key: 'birthPlace' } }, detail: { value: ' Shanghai ' } });
profilePage.saveProfile();
assert.equal(wx.storage['oneiro:lastProfile'].nickname, 'Runtu');
assert.equal(wx.storage['oneiro:lastProfile'].birthPlace, 'Shanghai');
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveProfile'));
homePage.startDream();
assert.equal(last(wx.navigations), '/pages/new-dream/index');

const newDreamPage = loadPage('miniprogram/pages/new-dream/index.js', pageModules, wx, app);
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
newDreamPage.onDreamInput({
  detail: { value: '我梦见自己在学校考试迟到，被一个黑影追着跑，怎么也找不到出口。' },
});
newDreamPage.generateDreamCard();

const archiveAfterDream = wx.storage['oneiro:dreamArchive'] as unknown as Array<Record<string, any>>;
assert.ok(Array.isArray(archiveAfterDream));
assert.equal(archiveAfterDream.length, 2);
assert.ok(app.globalData.currentDream);
assert.ok(last(wx.navigations).startsWith('/pages/result/index?id='));
assert.ok(archiveAfterDream[0].result.symbols.includes('追逐'));
assert.equal(archiveAfterDream[0].interpretationSource, 'cloud');
assert.equal(archiveAfterDream[0].interpretationProvider, 'mock-cloud');
assert.equal(archiveAfterDream[0].status, 'ready');
assert.equal(archiveAfterDream[0].dreamFacts.places[0], '学校');
assert.equal(archiveAfterDream[0].interpretationMeta.schemaVersion, 'dream-entry-v0.2');
assert.equal(archiveAfterDream[0].interpretationMeta.promptVersion, 'oneiro-grounded-reading-v0.2.2');
assert.equal(archiveAfterDream[0].result.title, '云影');
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream'));
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'interpretDream' && call.data?.dreamText && !call.data?.chatAboutDream)?.data?.profile?.birthTime,
  '08:30'
);

const resultPage = loadPage('miniprogram/pages/result/index.js', pageModules, wx, app);
resultPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(resultPage.data.dream.id, archiveAfterDream[0].id);
resultPage.requestDreamImage();
assert.equal(resultPage.data.imageStatus, 'ready');
assert.equal(resultPage.data.dream.result.imageUrl, 'https://mock-image.example.com/oneiro.png');
assert.equal(resultPage.data.dream.result.image_cache_hit, true);
assert.equal(resultPage.data.dream.result.image_style_version, 'oneiro-etched-dream-v2');
assert.equal(resultPage.data.aiImageLocalPath, '/tmp/oneiro-ai-image.png');
assert.ok(wx.cloudCalls.some((call) => call.name === 'generateDreamImage'));
assert.equal(
  wx.cloudCalls.find((call) => call.name === 'generateDreamImage')?.data?.theme,
  'shadow'
);
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
assert.equal(resultPage.data.sharePath, '/pages/share/index?id=card-mock');
const readySharePayload = resultPage.onShareAppMessage();
assert.equal(readySharePayload.path, '/pages/share/index?id=card-mock');
resultPage.saveCard();
assert.equal(last(wx.savedImages), '/tmp/oneiro-card.png');
assert.ok(wx.cloudUploads.some((upload) => upload.filePath === '/tmp/oneiro-card.png'));
assert.ok(wx.cloudCalls.some((call) => call.name === 'createShareCard'));
resultPage.saveFullReading();
assert.equal(last(wx.savedImages), '/tmp/oneiro-card.png');
assert.equal(resultPage.data.shareImagePath, '/tmp/oneiro-card.png');
resultPage.openDreamChat();
assert.ok(last(wx.navigations).startsWith('/pages/dream-chat/index?id='));
const dreamChatPage = loadPage('miniprogram/pages/dream-chat/index.js', pageModules, wx, app);
dreamChatPage.onLoad({ id: archiveAfterDream[0].id });
assert.equal(dreamChatPage.data.messages.length, 1);
dreamChatPage.onInput({ detail: { value: '我最近确实很怕赶不上期限。' } });
dreamChatPage.sendMessage();
assert.equal(dreamChatPage.data.messages.length, 3);
assert.equal(dreamChatPage.data.turnCount, 1);
assert.ok(dreamChatPage.data.messages[2].content.includes('期限感'));
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.chatAboutDream));
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).find((item) => item.id === archiveAfterDream[0].id)?.chatMessages.length,
  3
);
resultPage.newDream();
assert.equal(last(wx.navigations), '/pages/new-dream/index');
resultPage.openArchive();
assert.equal(last(wx.navigations), '/pages/archive/index');
resultPage.deleteDream();
assert.equal(last(wx.modals).title, '删除这个梦？');
assert.equal(
  (wx.storage['oneiro:dreamArchive'] as Array<Record<string, any>>).some((item) => item.id === archiveAfterDream[0].id),
  false
);
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream' && call.data.action === 'delete'));

wx.storage['oneiro:dreamArchive'] = [
  {
    dreamText: '旧梦',
    result: chaseDream,
  },
];
const archivePage = loadPage('miniprogram/pages/archive/index.js', pageModules, wx, app);
archivePage.onShow();
assert.equal(archivePage.data.archiveCount, 1);
assert.ok(archivePage.data.archive[0].id);
assert.ok(archivePage.data.archive[0].createdAt);
archivePage.openDream({ currentTarget: { dataset: { index: 0 } } });
assert.ok(last(wx.navigations).startsWith('/pages/result/index?id='));
assert.ok(wx.cloudCalls.some((call) => call.name === 'saveDream'));

const sharePage = loadPage('miniprogram/pages/share/index.js', pageModules, wx, app);
sharePage.onLoad({ id: 'card-mock' });
assert.equal(sharePage.data.loading, false);
assert.equal(sharePage.data.payload.title, '云影');
sharePage.startDream();
assert.equal(last(wx.navigations), '/pages/home/index?fromShare=1');
assert.ok(wx.cloudCalls.some((call) => call.name === 'getShareCard'));

const diagnosticsPage = loadPage('miniprogram/pages/diagnostics/index.js', pageModules, wx, app);
diagnosticsPage.onLoad();
assert.equal(diagnosticsPage.data.loading, false);
assert.equal(diagnosticsPage.data.aiHealth.provider, 'mock-cloud');
assert.equal(diagnosticsPage.data.aiHealth.providerConfigured, true);
assert.equal(diagnosticsPage.data.cloudHealth.ok, true);
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.healthCheck));
assert.ok(wx.cloudCalls.some((call) => call.name === 'cloudHealth'));
diagnosticsPage.runSmokeTest();
assert.equal(last(wx.modals).title, '确认测试 AI');
assert.equal(diagnosticsPage.data.smokeLoading, false);
assert.equal(diagnosticsPage.data.smokeTest.provider, 'mock-cloud');
assert.equal(diagnosticsPage.data.smokeTest.reason, 'provider_error');
assert.ok(wx.cloudCalls.some((call) => call.name === 'interpretDream' && call.data.smokeTest));

const eventNames = analytics.getEvents().map((event) => event.name);
for (const expected of [
  'app_start',
  'share_landing_view',
  'dream_start',
  'dream_submit',
  'dream_saved_before_interpretation',
  'dream_submit_blocked',
  'interpretation_success',
  'dream_deleted',
  'profile_open',
  'profile_view',
  'profile_saved',
  'dream_chat_open',
  'dream_chat_view',
  'dream_chat_reply',
  'result_view',
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
]) {
  assert.ok(eventNames.includes(expected), `expected analytics event ${expected}`);
}

console.log('Mini Program MVP acceptance checks passed.');
