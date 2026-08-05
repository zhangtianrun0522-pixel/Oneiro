# Oneiro Project Progress

Last updated: 2026-08-04

## 当前接管记录：小程序线上超时与网页版封存（2026-08-04）

- 继续使用 `codex/release-dream-sync-portrait`；工作区原有未提交的小程序抢修改动全部保留，不重置、不回退。
- 已确认两个发布风险：`interpretDream` 真实 DeepSeek 请求在约 30.9 秒被当前服务端预算截断；工作区新增的 `miniprogram/utils/recorderRouter.js` 与 `miniprogram/utils/syncQueue.js` 尚未被 Git 跟踪，按不完整树发布可能导致启动时 `Cannot find module`。
- 本轮正在将供应商预算调整为 45–50 秒、客户端等待调整为高于 CloudBase 60 秒平台上限，并补稳定超时诊断码与最终 `saveDream` 失败入队/成功清队合同测试。完成后必须用同一份发布快照生成预览并重新部署 `interpretDream`，不能只依赖本地 mock。
- 旧 Vite/Vercel 网页原型已移入 `archive/web-vite/`，根目录只保留显式 `web:*` 复现命令；它不再是产品、发布目标或小程序验收面。Vercel 控制台中的既有项目尚未执行暂停/删除等外部操作。
- 当前基线验证：`npm run check:ai-readiness`、`npm run check:miniprogram`、`git diff --check` 已通过；这些检查仍不覆盖真实供应商超时和实际微信预览发布。
- 2026-08-04 本轮微信开发者工具真实验收：模拟器冷启动、首页渲染、文本输入、下滑提交、原梦先保存、结果页和“重新解读”链路均可运行；首次旧云函数返回泛化 `ai_provider_error`，随后已将当前工作区 `interpretDream` 部署到 `cloud1-d9gb0sjvg6a8d9864`（3 files，27.0 KB），线上信息确认 `Active / Nodejs16.13 / 60s`。
- 发布后用同一条测试梦 `dream in rain` 重试，结果页正确保留原梦并显示稳定诊断码 `provider_timeout · 45250ms`；控制台无小程序运行时错误，仅有自动热重载、SharedArrayBuffer 和 `reportRealtimeAction` 兼容性警告。当前阻塞点仍是 DeepSeek 供应商在 45 秒预算内未返回，尚不能宣称真实 AI 解读完整成功。

## 解梦链路线上超时待修复（2026-08-04）

- 当前实际工作分支是 `codex/release-dream-sync-portrait`；工作区已有一批未提交的小程序整理改动，后续必须保留并在其基础上修复，不要重置或回退。
- 2026-08-04 微信开发者工具实测确认：`interpretDream` 线上健康检查正常，供应商为 `deepseek`，密钥已识别，模型为 `deepseek-v4-flash`，云函数平台超时为 60 秒。
- 用失败原文“我梦见沙漠里正在下暴雨”直接执行线上 AI smoke test，30,897ms 后返回 `provider_error: AI provider request timed out`。因此不是小程序没保存梦，也不是云函数或密钥缺失；真实失败点是当前 30 秒的 DeepSeek 请求预算切断了模型返回。
- 开发者工具本地存储中的失败记录 ID 为 `1785848881046-fvu70k`：原梦已保存，`status=pending`、`result=null`、`interpretationError=ai_provider_error`。客户端丢掉了云函数返回的 `provider_error`，所以页面只能显示泛化的“未生成解读”，这是当前的可观测性缺口。
- 建议下一步：将供应商请求预算提高到给 60 秒云函数留有收尾余量的范围（建议默认 45 秒、上限 50 秒），小程序端等待时间改为高于平台上限（如 70 秒）；同时保存稳定的超时诊断码，并补齐“重新解读成功后最终 `saveDream` 失败入队、成功清除 `cloudSyncPending`”的同步闭环。
- 现有 `npm run check:miniprogram` 和 `npm run check:ai-readiness` 通过，但使用同步 mock，没有覆盖这次真实 30 秒供应商超时、60 秒客户端竞态和重试后入队遗漏。需要补完合同测试后再部署 `interpretDream`，最后在微信开发者工具里用同一条梦完成“保存 → 解读 → 结果页”真实复测。
- 本次仅完成诊断和记录，没有修改业务代码，没有部署、提交或推送。

## 梦卡稳定性、命理视角与反馈链路修复（2026-07-31）

- 当前工作分支：`codex/fix-memory-sync-palette`。
- 梦卡失败不再把云端同步冲突误报为图片供应商失败。图片已生成但写回失败时保留本地画面并提供独立同步重试；切换页面后可恢复同一个两阶段生成任务，`primary_generation_pending` 等在途状态不会用 `forceRefresh` 启动第二个付费任务。
- 同 revision 的并发写入改为字段级、单调合并：首次图片和高清任务 ID 可进入云端，快速图可原子升级为高清图，较新的手动刷新可替换旧图，旧页面快照不能回退标题、卡背、聊天、精修回答、高清图或任务状态。
- 结果页恢复“回应这个梦 → 最终梦卡 → 聊聊这个梦”链路。精修保存失败时保留本地结果并显示待同步，重载后仍可重试；只有云端保存成功才显示已更新。
- 命理附加视角恢复四柱、日主、五行等确定性技术锚点，但不作运势或未来预测。模型缺失、留空、未落到梦中事实或混入预测词时，由服务端确定性排盘结果补齐命理字段，不再让可选命理内容拖垮基础梦卡；普通解读字段会清理命理术语泄漏。
- 生图服务端同时校验存储梦文本、服务器规范化后的视觉计划和最终供应商提示词；客户端伪造 `ready` 或恶意 `visual_plan` 不能绕过高风险内容闸门。
- 最终验证：`npm run check:mini-release`、`npm run build`、`git diff --check`，以及五个变更 JS 文件的 `node --check` 全部通过；第五轮只读终审无 P0/P1。Vite 仅保留既有的 620.09 kB 主包体积建议警告。
- 已将 `interpretDream`（26.0 KB）、`generateDreamImage`（42.2 KB）、`saveDream`（9.0 KB）部署到 `cloud1-d9gb0sjvg6a8d9864`。线上健康检查确认解读模型 `deepseek-v4-flash` 与生图模型 `doubao-seedream-5-0-lite-260128` 均已配置，两阶段生图管线正常，内部请求预算 55 秒。
- 本轮修复前的真实 Seedream 烟测已成功：供应商约 44.1 秒返回，约 2.7 秒完成落库，临时梦境和资产清理成功。最新真机预览：`/private/tmp/oneiro-preview-dream-flow-stability-20260731.png`，预览包 207,291 bytes。

## Seedream 5.0 Lite 正式生图接入（2026-07-29）

- 已将 `generateDreamImage` 的正式默认模型切换为 `doubao-seedream-5-0-lite-260128`，默认输出为 `1728x2304`（3:4）；保留旧 `nano-banana-*` 适配器作为显式环境变量回退。
- 正式风格版本升级为 `oneiro-seedream-dream-v2.0`。正式 prompt 接入本轮验证的关系型配色和构图语法：主导色场、冷暖/互补对撞色、小面积焦点、墨黑/暖纸稳定色、非对称构图、有效负空间和结构性流线。
- Seedream 专用请求不再假设 `quality` 或 `n` 参数，使用已验证的 URL 响应、`sequential_image_generation=disabled`、`watermark=false` 请求形状。
- 本地验证通过：`npm run check:mini-release`、`npm run check:image-contract`、`git diff --check`。`generateDreamImage` 已部署到 `cloud1-d9gb0sjvg6a8d9864`，并在 CloudBase 正式环境写入 Seedream endpoint、server-side key、model、`1728x2304` 尺寸配置；质量通道保持关闭且未改动。本地 `key.txt` 未写入仓库。
- 线上健康检查通过：`providerConfigured=true`、`hasApiKey=true`、endpoint host 为 Ark、模型为 `doubao-seedream-5-0-lite-260128`，正式画风为 `oneiro-seedream-dream-v2.0`；健康检查耗时 11ms，未产生图片调用费用。

## Git 工作区整理（2026-07-27）

- 当前分支为 `codex-optimize-dream-interpretation`，与这一阶段的工作方向一致，但尚未设置远端跟踪分支。工作区没有已暂存改动，也没有执行提交或推送。
- 本轮审计发现改动跨越记忆画像、梦境解读与图片生成、小程序纸本 UI/语音/入口保护、云端分享协议和发布文档，不应继续压成一个巨型提交，也不建议在整理前继续叠加新功能。
- `.gitignore` 已补充 macOS、Claude 本地启动配置、Playwright 运行快照和设计工具缩略图规则；本地 Playwright 目录中存在与项目无关的 PDF，现已从 Git 候选范围排除，但未删除任何用户文件。
- 建议按以下边界建立检查点：① 记忆画像与跨设备梦境数据；② 解梦、视觉计划与渐进式图片任务；③ 首页/写梦/聊梦/结果页纸本体验与入口保护；④ 分享、健康检查与 CloudBase 客户端协议；⑤ 文档和发布清单。
- 拆分必须按代码块而不是整文件进行：`miniprogram/utils/cloudBase.js`、`pages/result/index.js`、`app.js`、`saveDream/index.js` 和发布检查脚本横跨多个协议；每个检查点都必须包含对应调用端、适配器和未跟踪依赖，并单独跑 `npm run check:mini-release`。
- `docs/design/` 约 78 MB，包含 99 个模型实验输出与报告；`项目页面重新设计/` 约 4.1 MB，是 Claude Design 导出源和参考图。两者均保留原位，是否纳入版本库应单独决定，不与产品代码混合提交。

## 扫码入口、语音与梦后记忆修复（2026-07-27）

- 彻底移除开发工具根级条件编译列表，避免预览继续复用历史 `result?fixture=1` 启动项；`pages/home/index` 保持为 `app.json` 首个页面。结果页同时增加入口保护：只有 `fixture=1&devPreview=1` 才能打开内部样例，未授权样例链接或没有真实梦境上下文的结果页都会 `reLaunch` 回记梦首页。
- 首页按住说话改为暖金色大圆形主按钮；首页、写梦、聊梦统一区分麦克风权限、云函数不可用、服务未配置、未听清和超时等语音失败原因。`speechRecognize`、`interpretDream`、`profileMemory` 已部署到 `cloud1-d9gb0sjvg6a8d9864`。
- “聊聊这个梦”改为暖纸本视觉，支持长按语音转文字，并增加围绕梦中画面、醒来情绪和现实对应的引导入口。
- 移除用户确认现实片段的交互。系统自动从聊天中提取近期事件、情绪、关系和工作生活变化等高价值线索，寒暄、纯梦境描述和模糊猜测不作为长期画像事实。
- 卡片反面改为互斥渲染淡入，移除微信小程序不稳定的 3D 文字翻转，保留轻触切换；同时保留服务端/本地梦卡图片回填。
- 验证通过：微信小程序自动化实测冷启动、旧 `fixture=1` 深链、空结果页深链、错误梦境 ID 深链均落到 `pages/home/index`；无效入口保持 `entryReady=false`，不会在重定向前闪现结果页骨架。`npm run check:mini-release`、`node --check`（首页/写梦/聊梦/结果页/画像云函数/解梦云函数）、`git diff --check` 均通过。最新全新预览二维码：`/private/tmp/oneiro-preview-home-entry-v6.png`，预览包 214,662 bytes。
- 语音云函数若仍返回 `not_configured`，需要在 CloudBase 中补齐 `TENCENT_ASR_SECRET_ID` 与 `TENCENT_ASR_SECRET_KEY`；代码不会记录或暴露密钥。

## Claude Design 纸本视觉重构（2026-07-26）

- 已依据 `项目页面重新设计/Oneiro Redesign.dc.html` 完成首页、写梦、结果、梦册、资料页的纸本化 UI 重构：暖纸底、深墨字、朱砂强调、编辑式梦卡与时间轴梦册。
- 全局小程序导航栏、字体回退、按钮基线与底部导航样式已统一；现有梦境保存、长按语音、识别和解读事件绑定保持不变。
- 首页补回最近梦境横向卡片，并在首页、梦册、资料页加入统一底部导航。
- 验证通过：`npm run check:mini-release`、`git diff --check`、微信开发者工具预览编译。
- 最新预览二维码：`/private/tmp/oneiro-preview-claude-design-v3.png`；预览包 196,668 bytes。尚未提交或重新部署云函数。

### 标注回合（2026-07-27）

- 按原型标注将首页改为打开即写梦：直接提供文本输入、长按语音与“保存并解读”，提交后复用现有完整解读链路。
- 将回访卡从首页迁移至资料页；删除示例梦入口；输入区取消独立背景和框体；保存按钮改为深墨纸本风格。
- 结果页补充条件显示的“命理视角 / 出生节律”；资料页保留并明确性别字段。
- `npm run check:mini-release` 与微信开发者工具预览通过；最新预览二维码：`/private/tmp/oneiro-preview-annotated-v1.png`，预览包 204,708 bytes。尚未提交或重新部署云函数。

## 梦卡图片历史回填与朋友内测准备（2026-07-26）

- 修复旧梦卡图片无法显示的问题：`saveDream` 列表接口会按用户和梦境 ID 查找 `generated_assets`，补回历史图片的 `image_file_id`，并重新生成有效临时地址；不会把分享卡图片误挂到梦卡上。
- 客户端同步牌库时保留本机已下载的 `thumbnailPath`，避免云端记录刷新后清空缩略图；详情页发现补回的文件 ID 后会写回本地缓存。
- `saveDream` 已部署到 `cloud1-d9gb0sjvg6a8d9864`，部署包 6.4 KB。
- 验证通过：`npm run check:mini-release`、`git diff --check`、微信开发者工具预览编译。
- 朋友内测预览二维码：`/private/tmp/oneiro-preview-archive-image-recovery-v2.png`；预览包 175.9 KB。图片能否恢复取决于对应文件仍存在于 `generated_assets` / 云存储；找不到的历史图片会继续显示基础占位卡面。

## 阶段画像自动发布与历史回溯（2026-07-26）

- 将阶段画像从“待用户确认的草稿”改为自动发布的当前理解：新梦、梦后对话、回访、现实片段或基础资料变化后，后台生成成功即成为当前画像；生成失败时保留上一版，不显示占位文案。
- 当前画像改为朋友式单段描述，要求自然连接长期模式、近期变化和当前状态；页面不再展示“待确认/确认/忽略”，用户可以直接编辑当前画像。
- 编辑会创建新的递增版本；历史版本默认折叠，支持“回溯”到旧版本。回溯会生成新的递增版本并保留完整历史，不覆盖原版本。
- 资料页首屏优先展示阶段画像；近期梦境线索、最近现实片段和基础资料降为辅助信息。当前画像暂停使用时仍可查看，只是不再注入后续梦境解读。
- `profileMemory` 新增自动发布编辑/回溯契约，旧草稿读取时归入历史；`saveProfilePortrait` 与 `restoreProfilePortrait` 均更新 `currentSnapshotId`。
- 验证通过：`npm run check:mini-release`、`npm run check:phase3`、`npm run check:miniprogram`、`npm run typecheck`、`git diff --check`。
- `profileMemory` 已重新部署（8.6 KB），并修复当前画像暂停后仍可查看、历史版本可回溯。最新预览二维码：`/private/tmp/oneiro-preview-portrait-auto-v1.png`；预览包 173,631 bytes。

## Full-reading wait experience (2026-07-24)

- Kept the complete grounded-reading payload and response contract intact. The user-facing flow now replaces the generic `wx.showLoading` state with a staged waiting panel: reading the dream scene, organizing literal clues, comparing confirmed memory, combining the birth-rhythm lens, and composing the full result.
- The waiting copy is tied to real pipeline stages and the user's original dream excerpt; it does not expose raw model chain-of-thought or invent interim conclusions. The final response remains the full multi-perspective reading.
- Raised the provider deadline floor from 18s to 30s. A stale `INTERPRET_TIMEOUT_MS=18000` environment value can no longer cut off a healthy full reading before the provider has a chance to finish. CloudBase's 60s function budget remains the upper bound.
- Verification passed: `npm run check:miniprogram`, `npm run check:ai-readiness`, and `git diff --check`.
- Next gate: deploy `interpretDream`, generate a fresh preview, and run five real-device submissions of the same dream on Wi-Fi and cellular. If latency remains uncomfortable or the app backgrounds, the next iteration is a durable interpretation job/status contract rather than reducing the analysis payload.

## Grounded dream-fact extraction (2026-07-24)

- Added literal extraction for snow, roses, sand, growth and weather changes. `dream_facts` now also preserves ordered `transitions`, so a dream such as “沙漠里开始下暴雪，然后沙地里长出了玫瑰花” is represented as a change sequence rather than three unrelated labels.
- Strengthened the shared evidence path: partial model symbols are merged with all grounded source symbols, facts omitted by the model are restored from the original text, and the visual plan uses the grounded transition as its main event.
- Reworked the deterministic cultural, psychological, personal-connection, and birth-rhythm fallbacks for the desert/snow/rose pattern so each section cites the actual scene and its relationship. The generic “只留下一个清晰落点” fallback is no longer used for that dream.
- Mirrored the key fallback behavior in the local oracle and added a regression case to `scripts/check-ai-readiness.ts`.
- Verification passed: `npm run check:ai-readiness`, `npm run check:miniprogram`, `npm run typecheck`, and `git diff --check`. No deployment or commit was performed in this step.

## Birth-rhythm presentation and gender input (2026-07-24)

- The result page now shows only the dream-specific birth-rhythm reading. The fixed chart basis, pillar list, hidden stems, auxiliary palaces, and calculation note remain in `bazi_chart` for internal/profile use but are no longer repeated inside each dream reading.
- `temperament` is now framed as “这次被调动的底色”, so it must explain which aspect of the stable birth profile this dream activated rather than copying the same static chart paragraph.
- Added optional gender to the profile form and saved profile payload. Four-pillar calculation remains available without it; when supplied, `lunar-javascript` receives the gender code for the luck-cycle direction, start timing, and eight major-cycle records. Without gender, the chart explicitly keeps `luckCycles.available=false` instead of guessing.
- Verification passed: `npm run check:ai-readiness`, `npm run check:miniprogram`, and `npm run typecheck`. The updated `interpretDream` and `saveProfile` functions still need deployment before real-device verification.

## Reading separation, chart engine, and card actions (2026-07-24)

- Kept the user-facing labels `文化象征` and `心理视角`, but tightened the interpretation contract: cultural symbolism must stay in the shared traditional/collective-symbol layer; psychological perspective must start from two concrete dream details and explain their personal tension without dictionary-style symbol meanings. Prompt version is now `oneiro-grounded-reading-v0.8.0`.
- Extended the deterministic birth-rhythm engine from true-solar-time four-pillar output to `bazi-v0.4-engine`: pillar details, hidden stems, element counts, dominant/missing elements, day-master element/polarity, balance label, and structured metaphysical sections. Existing fields remain compatible.
- The result page now renders the structured birth-rhythm reading as inner tone, dream echo, tension, current rhythm, and calculation basis, while retaining the old two-field fallback for archived records.
- Removed the result-page `生成分享话题卡` action and its generic topic-card path. Repeated-symbol milestones still open the private archive. The main card is now the single collectible/share object: `保存收藏梦卡` changes to a saved state, and the secondary action is `分享这张梦卡` before becoming `分享给朋友`.
- Verification passed with `npm run check:mini-release`; `interpretDream` was redeployed to `cloud1-d9gb0sjvg6a8d9864` (3 files, 23.1 KB). A fresh Mini Program preview was generated at `/private/tmp/oneiro-preview-qr-reading-card-v2.png` (154.0 KB). Image2 remains disabled.

## Rehdasu quality-route smoke test (2026-07-24)

- Temporarily set `QUALITY_IMAGE_ENABLED=1` and invoked one owner-scoped `startQuality` request through the real Mini Program runtime. The route reused the existing `OPENAI_IMAGE_API_KEY` fallback; no separate key was added or copied.
- The request returned `quality_provider_error` after about `2.45s`, produced no image, and the disposable dream was deleted successfully. `QUALITY_IMAGE_ENABLED` was restored to `0` immediately afterward.
- A separate `QUALITY_IMAGE_API_KEY` was entered directly in the CloudBase console on 2026-07-24 from a local user-provided file; the key value is intentionally not recorded here. The quality route remains disabled until a health check and disposable smoke test pass.
- Read-only health check now reports `providerConfigured: true`, `endpointHost: rehdasu.cn`, and `enabled: false`. A second owner-scoped disposable smoke test with the separate key still returned `quality_provider_error` after about `1.33s`; no image was produced and cleanup deleted the test dream. The switch was restored to `0` and verified. This rules out a missing-key configuration as the only cause; endpoint response/payload compatibility or provider-side authorization still needs diagnosis.
- Root cause is now bounded: Rehdasu `POST /v1/images/generations` is a synchronous endpoint (historical successful calls take roughly 40–90+ seconds), while the Mini Program quality route requires a quick async task submit. A direct probe of `/v1/draw/completions` returned HTTP 404, so there is no verified async Rehdasu endpoint to use.
- `generateDreamImage` now identifies endpoint mode, rejects `/v1/images/generations` as `quality_sync_endpoint_unsupported` before making a paid request, adds `output_format: 'png'` for compatible adapters, records only sanitized diagnostic codes, and isolates job IDs by endpoint/model/size/quality/adapter version. Local quality-job and image-contract tests passed; the function was redeployed to `cloud1-d9gb0sjvg6a8d9864` and online health remains `providerConfigured: true`, `enabled: false`.
- This points to endpoint/credential compatibility or provider response handling, not the background-job storage flow. Do not enable the quality route for friends until the Rehdasu response error is observable through a safe provider diagnostic or an approved endpoint test.

## Progressive nano -> image2 quality route implemented locally (2026-07-23)

- The existing synchronous `nano-banana-fast` image path remains the default and was not changed.
- `generateDreamImage` now accepts `action: startQuality` / `action: pollQuality` (also `image2.start` / `image2.poll`) for an owner-scoped, deterministic `image_generation_jobs` task. The task submits `gpt-image-2` once, then polls the provider without holding a WeChat cloud-function request open. Nested `{ data: { results: [...] } }` gateway responses are normalized.
- The result page calls the quality actions only after the fast image is locally ready. It keeps the current card visible, polls every 3 seconds, replaces the image only after the quality asset downloads successfully, persists the job id/status for a later revisit, and keeps the fast image on any quality failure or timeout.
- Added `QUALITY_IMAGE_*` configuration documentation and the private `image_generation_jobs` health collection. Quality configuration is independent from `OPENAI_IMAGE_*`; the CloudBase function now has the non-secret Rehdasu `gpt-image-2` route parameters saved with `QUALITY_IMAGE_ENABLED=0`.
- Verification passed: `npm run check:image-contract`, `npm run check:image-quality-job`, `npm run check:cloudbase`, `npm run check:miniprogram`, `npm run check:phase3`, `npm run typecheck`, and `git diff --check`.
- Next external step: verify that the existing image-provider key is accepted by the Rehdasu quality endpoint (the function already falls back to `OPENAI_IMAGE_API_KEY` when `QUALITY_IMAGE_API_KEY` is absent), then run one real-device dual-channel test and inspect latency/cost before enabling it for friends.
- Deployment note: `generateDreamImage` (32.1 KB), `saveDream` (5.3 KB), and `cloudHealth` (1.4 KB) were redeployed successfully to `cloud1-d9gb0sjvg6a8d9864`. The new Mini Program preview passed at `154.4 KB`; QR: `/private/tmp/oneiro-preview.png`. `QUALITY_IMAGE_ENABLED=0`, so the live app continues using the existing fast path.

## Rehdasu image2 Same-Six-Dream Comparison Complete (2026-07-23)

- Reused the exact six compiled “内测画风” prompts from the two-round `nano-banana-fast` global test. No global or per-image prompt wording changed; only the provider/model request path changed to Rehdasu `gpt-image-2`, requested at `quality: medium`, `768×1024`, PNG.
- Image2 is visually much closer to the confirmed style under identical prompts. The kitchen, reed field, floating waiting room, and boat/forest images have stronger narrative focus, saturated matte fields, simplified figures, and less generic AI polish. The boat/forest image is the strongest result.
- Style is not fully stable: transparent city remains comparatively precise/diagrammatic, barbershop/market drifts into muted detailed ink illustration, and the v1.1 waiting-room prompt's invented pointing action is followed literally.
- All six outputs are 3:4, but the gateway ignored the requested dimensions on five images: five returned `1086×1448`; only transparent city returned `768×1024`.
- Successful client times were `80.5s`, `68.9s`, `62.2s`, `74.7s`, `41.0s`, and `312.0s` for the separately retried sixth image. The first sixth-image request exhausted retries after a long connection failure.
- The account balance fell from `$9.50` to `$4.80`, so the actual test cost was `$4.70`. Usage records show retry-amplified billed 2K requests, far above the nominal six-image estimate.
- Decision: do not move the synchronous Mini Program path to this Rehdasu image2 configuration. If retained, make it an opt-in quality route behind durable background jobs, idempotency, polling, strict retry caps, dimension normalization, and cost accounting.
- Full prompts, dreams, outputs, observations, latency, cost, and decision: `docs/design/rehdasu-image2-internal-global-2026-07-23/README.md`.

## “内测画风” Two-Round Global Prompt Test Complete (2026-07-23)

- The three user-confirmed reference images are now the canonical style named **“内测画风”**. They are distinct from the rough screenprint/Risograph `oneiro-riso-dream-v1.3` production style and must not be conflated in prompts, reports, or future comparisons.
- Added an explicit opt-in `internal_test` prompt preset, now at `oneiro-internal-test-style-v1.2`. Normal Mini Program requests still default to the existing production preset; style metadata and cache keys are isolated so the two styles cannot cross-hit.
- The deployed `nano-banana-fast` path (`grsaiapi.com`) generated three fresh 3:4 comparisons through the authenticated Mini Program runtime: surreal `20.389s`, anxiety `14.707s`, and distance `20.043s`. All outputs are `896×1200`; all synthetic dreams and generated CloudBase assets were deleted through the normal cascade.
- Visual verdict: the surreal door result is close to the confirmed style in its cobalt field, red/yellow focal object, quiet negative space, and story relationship. Anxiety is directionally close but introduced an inset white margin; distance preserves the story but is too clean/vector-like and too muted. The current model can reach “内测画风”, but the three-image batch is not yet stable enough to switch the product default.
- Canonical references, generated images, exact test dreams, compiled prompts, model metadata, timings, and cleanup evidence are under `docs/design/internal-test-style-2026-07-23/`.
- Two additional global-only Prompt iterations were tested with six completely different dreams. v1.1 removed the fixed near/far story formula and fixed blue/red/yellow preference; v1.2 filtered generic composition actions, grounded gestures, hardened full bleed, and strengthened anti-vector/repeated-texture rules.
- Independent review: only reed field and barbershop/market reached the threshold (`12/14`); the other four scored `6`, `7`, `9`, and `7`. Both rounds passed only `1/3`, with one hard failure each. v1.2 improved full bleed to `3/3`, but transparent architecture still triggered a CAD/3D/vector hard failure.
- Prompt wording is not the only limiter. Four of six interpretations used deterministic fallback after text-model timeouts, and multiple visual plans omitted critical characters, actions, or anomaly facts. The image provider also timed out repeatedly. All final images were eventually captured at `896×1200`, and all synthetic CloudBase records/assets were deleted.
- Full two-round evidence, dreams, plans, compiled prompts, outputs, scoring, and decision: `docs/design/internal-test-global-iterations-2026-07-23/README.md`.
- Decision: keep `internal_test` opt-in and do not switch the product default. Next test reference-image conditioning or a stronger style-adherent model against the same six-dream matrix; separately repair visual-plan fact retention and add resumable/background image generation.

## Rehdasu GPT Image 2 Medium Three-Dream Test Complete (2026-07-23)

- Reused the exact fixed healing, anxiety, and surreal prompts plus every approved `oneiro-riso-dream-v1.3` constraint. Only the Rehdasu request parameters changed to `quality: medium`, native `768×1024`, and PNG output; the deployed Mini Program remained unchanged.
- All three calls succeeded at the requested native 3:4 geometry: healing `65.04s`, anxiety `60.98s`, surreal `56.97s`; average `61.0s`. Rehdasu billed each as one 1K image at `$0.30`, total `$0.90`.
- Manual visual review: healing `13/14`, anxiety `13/14`, surreal `13/14`; batch `3/3` passed the `12/14` threshold. All three keep saturated spot inks, rough single contours, screenprint grain, hidden/minimal faces, asymmetric story-led composition, and no generated text or card frame.
- Medium is the preferred Rehdasu tier over high for this product: compared with the high anxiety test, average latency fell about 32% and per-image cost fell 25%, while visual quality remained within the accepted direction. Native 3:4 also eliminates the crop step.
- It is still not safe for the current synchronous 60-second WeChat cloud function: two of three measured client calls exceeded 60 seconds and all exceed the current 55-second internal image budget. Production remains on `nano-banana-fast`.
- Evidence and individual observations: `docs/design/ONEIRO_REHDASU_IMAGE2_MEDIUM_TEST_2026-07-23.md`; images are under `docs/design/rehdasu-image2-medium-2026-07-23/`.
- Immediate next gate: generate two more independent variants for each fixed dream and require at least `8/9` total passes. If that gate passes, add a Rehdasu Images adapter behind a feature flag and use an asynchronous queue/polling flow rather than the current synchronous cloud-function request.

## Rehdasu GPT Image 2 Single-Sample Test Complete (2026-07-23)

- Tested the user-provided Rehdasu gateway (`https://rehdasu.cn`) without changing the deployed Mini Program provider. The verified model id is `gpt-image-2`, called through `POST /v1/images/generations` with the exact fixed anxiety-corridor prompt and all approved `oneiro-riso-dream-v1.3` constraints preserved.
- The existing subscription-group key was inactive and returned `SUBSCRIPTION_NOT_FOUND` without generating an image. The existing OpenAI balance-group key succeeded; no key was created or changed.
- Successful request parameters: `1024×1536`, `quality: high`, JPEG, one image. Rehdasu recorded one 2K image, `1m 29s` total provider time, and `$0.40` cost. This is roughly five times slower than the current `nano-banana-fast` path at 16–19 seconds.
- The raw 2:3 output was saved as `docs/design/rehdasu-image2-2026-07-23/anxiety-raw.png`; a non-generative center crop was saved at `1024×1365` as `anxiety-3x4.png` for the product's 3:4 card surface.
- Manual visual score: `13/14` pass. It keeps the dream story legible, uses a strong asymmetric corridor/door focal path, vivid matte red/yellow/navy blocks, rough single ink contours, unresolved face, and no generated text, tarot frame, occult decoration, or glossy/3D artifacts. The remaining deduction is for the native 2:3 geometry and slightly over-explicit hand/anatomy detail.
- Evidence and integration decision: `docs/design/ONEIRO_REHDASU_IMAGE2_TEST_2026-07-23.md`. Current recommendation is to keep production unchanged, then test `quality: medium` and a three-dream batch before switching; use a queue/background UX if the 60-second WeChat function limit remains.

## Current Image Model Comparison Complete (2026-07-22)

- The deployed production path was called directly through the authenticated WeChat runtime with the same three fixed healing/anxiety/surreal dream plans used in the prior internal stability work. Health confirmed `nano-banana-fast`, `oneiro-riso-dream-v1.3`, `768×1024`, `3:4`, and provider quality `low`.
- All three fresh calls succeeded on the first attempt in roughly 16–19 seconds. Local evidence is under `docs/design/current-model-2026-07-22/`.
- Human scoring against the preserved Oneiro contract: healing `13/14` pass, anxiety `9/14` fail, surreal `13/14` pass. The model can reach the direction, but `2/3` is not stable enough; the anxiety result drifted into polished commercial-comic language.
- A same-prompt comparison with the built-in internal image model was attempted. The parallel batch failed at the image service network layer; a single-image retry exceeded six minutes without output and was terminated. No model switch was made without valid comparison evidence.
- Full constraints, scores, model metadata, and decision: `docs/design/ONEIRO_CURRENT_MODEL_COMPARISON_2026-07-22.md`.
- All three disposable CloudBase dreams and owned generated assets were deleted through the normal cascade; archive verification returned zero remaining test IDs.
- Immediate next step: shorten the current style prompt into a story-first v1.4 candidate without dropping any approved constraints, then rerun the 3×3 acceptance matrix and the same-prompt internal-model comparison when that service is available.

## Dream Card Presentation v1 Complete Locally (2026-07-22)

- The result card is now a two-sided, full-bleed 3:4 collectible. Tapping the card flips between the image-led front and a restrained editorial back.
- The front preserves the `ONEIRO` wordmark and shows only the stable card number plus the exact `YYYY.MM.DD · HH:mm` record time. The dream title, interpretation, symbol list, status messages, and retry action no longer appear over the artwork.
- The back contains the dream title, condensed insight, selected dream symbols, and the integration question. Image generation status and retry now sit outside the physical card.
- The saved front-card Canvas export follows the same hierarchy: full-bleed artwork with only `ONEIRO`, card number, and minute-level timestamp; Chinese text remains system-rendered rather than model-generated.
- WeChat DevTools simulator verification passed for both faces, flip interaction, fallback-image status placement, and narrow-screen text fit. `npm run check:mini-release` and `git diff --check` pass. No preview upload, commit, or push was performed.
- Immediate next step: run the live generated-art path on a physical phone, then tune front metadata contrast only if it becomes unreadable on unusually bright artwork.

## Dream Image System v1.3 Deployed And Tested (2026-07-22)

- Active live image style is `oneiro-riso-dream-v1.3`: high-saturation rough screenprint/Risograph inner art, pressure-varied hand-drawn contours, simplified faces, asymmetric editorial composition, and no generated text/frame/title.
- `interpretDream` prompt version is now `oneiro-grounded-reading-v0.5.0`. Its normalized result includes `visual_plan`: one main event, at most one anomaly, two to four preserved elements, at most one hidden symbol, emotion/intensity, weighted people/objects, one of six composition modes, and 35–50% planned breathing space.
- `generateDreamImage` rebuilds the plan from the owner-scoped stored dream, selects one of seven emotion palettes, compiles the provider prompt server-side, and no longer lets legacy `card_theme` determine the artwork palette. v1.3 adds a server-side source whitelist so hallucinated people, places, props, anomalies, symbols, and hidden symbols are removed even when an AI plan mixes them with grounded text.
- `generated_assets` now stores the full generation prompt, normalized visual plan, model/style metadata, and a quality record. PNG/JPEG/WebP dimensions and `3:4` portrait geometry are checked automatically. Pixel-semantic checks remain explicitly marked `requires_vision_review` until a vision-review/regeneration loop is added.
- The legacy Web/Vercel image endpoint now uses the same screenprint/Risograph default style and asks the interpretation model for a condensed event/emotion/composition/palette image prompt.
- Canonical specification: `docs/design/ONEIRO_DREAM_IMAGE_SYSTEM_V1.md`. Full evidence and visual verdict: `docs/design/ONEIRO_STYLE_STABILITY_TEST_2026-07-22.md`.
- `generateDreamImage` v1.3 is deployed to `cloud1-d9gb0sjvg6a8d9864`. Live health confirms style v1.3, provider readiness, seven palettes, and six composition modes.
- Nine-card technical stability passed. A final v1.3 healing image passed manual review; the fresh surreal image could not be obtained after three provider timeouts. Provider reliability remains the main image-path risk.
- Both requested sub-agent passes completed: technical regression found all 15 existing samples valid at `896×1200`; the final reviewer identified the prompt-only grounding weakness, which is now fixed and regression-tested server-side.
- All nine synthetic cloud dream records and associated cloud assets were deleted after local capture; archive verification found zero remaining test IDs. Local fixtures remain under `docs/design/stability-v1-2026-07-22/`.
- Verification passes: `npm run check:mini-release` and `git diff --check`. Worktree remains intentionally uncommitted/unpushed.
- Immediate next step: add a bounded image-provider fallback/retry UX, then rerun v1.3 anxiety and surreal semantic review before inviting a wider group of friends.

## V0.4 Phase 1–3 Development Complete Locally (2026-07-19)

Current branch: `codex-optimize-dream-interpretation`. The worktree contains the completed implementation and remains uncommitted/unpushed. The updated Mini Program cloud functions were deployed and a new preview build was generated in this iteration.

### Deployment and live verification — 2026-07-19

- Environment `cloud1-d9gb0sjvg6a8d9864` now has all 11 functions. `cloudHealth`, `interpretDream`, `generateDreamImage`, `saveDream`, `createShareCard`, and `getShareCard` were updated; the new `profileMemory` function was created and then redeployed after its initial CloudBase `Creating` transition. All seven report `Active` on `Nodejs16.13`; `interpretDream` and `generateDreamImage` both report a 60-second timeout.
- Live `cloudHealth` run `1784446424263` passed with all 9 required collections and storage. A disposable dream passed save, owner-scoped archive readback, life-note creation, share creation/read, deletion, share revocation, delayed dream-write rejection, delayed life-note rejection, and rejection of image generation for a nonexistent dream; its source dream was removed.
- Live client-rule probing created a disposable server-side dream/share, then queried `dream_entries.localId` and `share_pages.slug` directly through the Mini Program database SDK. Both targeted reads returned zero rows while cloud-function reads succeeded, confirming revoked/private server records are not directly readable by the client; the test dream was then deleted and its share revoked.
- Live provider health reports DeepSeek model `deepseek-v4-flash` with an 18-second request budget and image model `nano-banana-fast` with a 55-second request budget. The first live AI smoke test exposed an unescaped-control-character JSON response; the parser was repaired, regression tested, redeployed, and the second smoke test plus a full no-profile reading passed without fallback on prompt `oneiro-grounded-reading-v0.4.0`.
- A post-fix live non-cached image request also passed: `nano-banana-fast` returned an 811,786-byte JPG with 17.2-second provider latency. Deleting its disposable source dream then removed the associated owned asset through the privacy cascade.
- WeChat DevTools automation loaded diagnostics, profile memory center, private deck, no-profile dream input, voice state, and the multi-perspective result fixture. Diagnostics showed CloudBase ready, 9 collections, DeepSeek, and the OpenAI-compatible image provider.
- Preview generated successfully for AppID `wx61800035c4e1a092`: `145.1 KB / 148,585 bytes`; QR output is `/private/tmp/oneiro-preview.png` and has been opened for scanning.
- Remaining manual acceptance: scan the QR on a physical phone and verify microphone permission, album save, generated-image rendering on the phone network, and WeChat cross-session forwarding.

### Phase 1 — Reliability and private-data consistency

- Dream deletion now waits for the CloudBase result when available, queues offline cloud deletions, and uses an idempotent `deletion_jobs` tombstone. It rejects delayed writes and new shares as soon as deletion begins, revokes existing share pages, removes owned generated assets and source life notes, scrubs/invalidates derived profile snapshots, and only deletes the main dream after every privacy cascade succeeds.
- Share pages are created only after the user explicitly prepares a share card and the server verifies ownership of the source dream. Public payloads and the separate public Canvas cover no longer accept or reuse private reflection-answer content, client file ids, local dream ids, or exact timestamps; revoked pages cannot be read.
- Stable card numbering no longer reuses a number after archive deletion. Voice listeners are bound once, recording stops on unload, submission is disabled during record/recognition, and the voice funnel now emits analytics events.
- `life_notes` and `profile_snapshots` are included in CloudBase health/deployment readiness.

### Phase 2 — Interpretation and final-card loop

- The result now presents four parallel perspectives: dream narrative/tension, cultural symbolism, psychological perspective, and personal connection. Optional birth data still adds the existing birth-rhythm perspective and never blocks the basic path.
- The user can answer the interpretation question directly on the result page. `interpretDream` refines the first reading into a final title, card insight, and personal connection using AI with a deterministic fallback, then persists the final card.
- Confirmed reality notes are selected from up to six recent notes by relevance instead of checking only the newest note.

### Phase 3 — Personal memory center and private dream universe

- `我的资料` is now a personal memory center. `profileMemory` stores versioned AI portrait drafts in `profile_snapshots`; users can view, edit, confirm, reject, pause/resume future use, and see version history. User-confirmed real-life fragments can also be viewed, edited, or deleted; portrait invalidation must succeed before a source fragment is removed.
- User facts remain in `users` / `life_notes`; AI observations remain in profile snapshots. Only the user-editable confirmed summary with future use enabled enters later interpretation context, preventing uneditable AI traits/themes or drafts from silently becoming user facts. Atomic `profile_memory_state` updates maintain version numbers and the single current pointer.
- Profile drafts refresh after effective changes: profile saves, confirmed real-life notes, the first three dreams, and every two additional dreams. Deleted or corrected evidence marks derived portraits stale and disables future use.
- The private archive is now a dream deck with deterministic cross-dream people, symbols, emotions and places; evidence-based stage observations; monthly primary cards; recurring-symbol milestones; and three-dream archetype artifacts.
- The archive now reads the latest 30 owner-scoped CloudBase dream records and merges pending local drafts, so the visible deck can recover across devices instead of depending only on local storage.

### Verification

- `npm run check:mini-release` includes AI readiness, CloudBase readiness, mocked Mini Program flows, Phase 3 CloudBase state/cascade contracts, deletion-race, image-authorization/race-cleanup, private-share-cover regressions, dream contracts, and TypeScript checks.
- `npm run build` verifies the legacy Vite acceptance harness.
- `git diff --check` verifies patch formatting.
- Final high-severity review found no remaining P0/P1 after the deletion-race, image ownership/race cleanup, public-title isolation, portrait-save failure, and life-note consistency fixes.
- Real CloudBase deployment and WeChat DevTools preview are complete. Physical-device acceptance remains pending because microphone, album, and WeChat forwarding require the user to scan the generated QR.

The sections below are historical handoff notes. Where they conflict with this section, this V0.4 status is authoritative.

## Product Correction: Metaphysical Lens Default-On (2026-07-15)

The user clarified that metaphysical interpretation is a default part of every reading. A user may write a dream before opening the profile page, but interpretation must stop when birth date, birth time, or birth city is missing, preserve the draft text, and guide the user to `我的资料`. Birth city is now required for true-solar-time correction. The CloudBase `interpretDream` function calculates a deterministic four-pillar chart, passes it to the AI as bounded context, and returns `metaphysical_resonance`, `metaphysical_basis`, and `bazi_chart`; the result page displays a separate `命理镜头` block.

- Removed the visible `人物 / 地点 / 物件 / 行动 / 情绪 / 时间感` fact table from the result page. Structured `dreamFacts` remain stored for model grounding and future memory.
- Accuracy implementation: `lunar-javascript` now receives true-solar-time-corrected values from a deterministic city coordinate resolver, with `setSect(2)` and explicit correction metadata. The LLM does not calculate the chart; it receives the deterministic chart and writes the explanation.
- Local/cloud-unavailable fallback no longer fabricates a metaphysical reading from season or zodiac; it states that no four-pillar chart was generated.

- Current implementation branch remains `codex-optimize-dream-interpretation`.
- Prompt version is now `oneiro-grounded-reading-v0.2.2`.
- Bazi calculation version is now `bazi-v0.3-true-solar`; `interpretDream` deploy includes `locationResolver.js` and completed with a 3-file, 14.9 KB package.
- Verification so far: `npm run check:mini-release`, `npm run build`, `git diff --check`, CloudBase deploy, and WeChat preview passed. The latest preview package is `84.3 KB / 86,295 bytes` with AppID `wx61800035c4e1a092`.
- Next verification: test missing-profile prompt, profile save/resume, city resolution, true-solar-time output, and result-page rendering on a real device.

## Latest Product Decision And Agent Handoff (2026-07-12)

The current product direction has changed from a card-first dream oracle with a lightweight birth-rhythm layer to a **private dream-memory system**. The single source of truth for the next development phase is [`V0_2_DEVELOPMENT_PLAN.md`](V0_2_DEVELOPMENT_PLAN.md).

- Core promise: “它不替你预测命运，但会越来越理解你的梦。”
- China / WeChat Mini Program remains the first market and delivery surface. The existing dream card/image/share stack remains useful, but it is a collectible/share artifact rather than the primary user value.
- V0.2 must prioritize: dream-grounded single reading, real-life notes and bounded dream dialogue, editable private memory, archive views, and evidence-based 3/7-dream reports.
- Bazi is now a default bounded interpretation lens after the 2026-07-15 product correction. Astrology, daily fortune, public community, subscriptions, and coins remain deferred.
- Memory must be quiet and user-controllable: no repeated in-chat consent prompts, no default display of retrieval citations, no invented memories, no permanent labels from one statement, and deletion/pause must prevent future use.
- Result tone must be observant and bounded rather than flattering: no fate, medical, trauma, relationship, or career diagnosis; use uncertainty when evidence is weak.
- The immediate implementation sequence is Sprint 1 of the V0.2 plan: restructure the result around dream facts and possible real-life relevance, persist the raw dream even if AI fails, store normalized facts/result versions, and collect `有启发 / 太泛 / 太玄 / 不贴梦` feedback.

### Handoff Safety

- Current branch is still `codex-optimize-dream-interpretation`; it is the correct continuation branch for this objective.
- The worktree is intentionally dirty with user work across strategy docs, Mini Program pages, CloudBase functions, scripts, and configuration. Do not reset, broadly reformat, or overwrite those changes. Inspect a file's diff immediately before editing it.
- Sprint 1 code is implemented locally on this branch. The updated `interpretDream` function with the default metaphysical lens was deployed on 2026-07-15; real-device acceptance is still pending.

### V0.2 Sprint 1 Implementation (2026-07-12)

- Home no longer requires nickname, birth date, birth time, or birth place before recording a dream.
- Dream submission writes a `pending` raw entry locally and through `saveDream` before calling `interpretDream`, then updates the same id with the normalized result. Local archive capacity is now 30 entries.
- Stored entries include structured dream facts, status, provider/error data, schema/prompt/model versions, feedback, and timestamps.
- Result order now starts with the dream image/card, followed immediately by raw dream facts and possible real-life connections. The former four-option feedback panel was removed because it felt like a software test.
- The former static question is now a functional `聊聊这个梦` entry. The bounded chat keeps only the current dream and recent messages, limits users to six turns, persists with the dream, and avoids diagnosis, prediction, or invented memories.
- Added local/CloudBase dream deletion. Natural corrections can now be collected through the bounded conversation instead of an exposed rating panel.
- Added a `我的资料` page for nickname and birth details. Dream writing can begin without it, but interpretation now requires birth date/time, preserves the draft, and redirects the user to complete the profile.
- Redesigned the 3:4 collectible export around a near-full-bleed image with text overlay, and reduced the full-reading export from 3200 to 2300 pixels to eliminate excessive whitespace.
- `interpretDream` now requests factual extraction and bounded hypotheses, receives a deterministic four-pillar chart, adds a bounded metaphysical lens, preserves uncertainty, excludes fate predictions, and limits historical context to three observations.
- Verification passed: JavaScript syntax checks, `npm run check:mini-release`, `npm run build`, `git diff --check`, and WeChat DevTools preview with AppID `wx61800035c4e1a092` (`83.0 KB / 84,960 bytes`). Build retains the existing >500 kB Vite chunk warning.
- WeChat DevTools automation previously verified home, profile, result top/reading, bounded chat, collectible Canvas export, and full-reading Canvas export with no runtime exceptions. The chat composer was corrected after the first narrow-screen screenshot showed a compressed send button.
- Immediate next step: run real-device checks for missing-profile prompting, profile save/resume, deterministic metaphysical output, pending-save recovery, bounded dream chat, deletion, and both redesigned exports.

### Interpretation Quality Pass (2026-07-14)

- Deployed `interpretDream` and `saveDream` to `cloud1-d9gb0sjvg6a8d9864`. Both are `Active` on Nodejs16.13; `interpretDream` timeout is 60 seconds and `saveDream` timeout is 3 seconds.
- Added `reading_hook` and `alternative_reading` to the interpretation contract. The first must connect two concrete dream details through a tension or turn; the second keeps a falsifiable non-pathological alternative visible.
- Result page now shows “这个梦的张力” and “另一种可能” between dream facts and the bounded chat entry.
- Real Mini Program submission previously verified provider `deepseek`, title `迷途`, schema `dream-entry-v0.2`, prompt `oneiro-grounded-reading-v0.2.1`, and a concrete hook about being late, chased, and unable to find an exit. The deployed prompt is now `oneiro-grounded-reading-v0.2.2` with the default metaphysical lens.
- Real bounded chat verification also passed with three messages after one user turn and a specific follow-up question.
- Remaining release work is real-device verification of the new interpretation, deletion, profile persistence, and both exports; no commit or push was made.

## Current Status

- Branch: `codex-optimize-dream-interpretation`
- Current local focus: V0.2 private dream memory, with grounded single-dream interpretation as the first value and dream cards only as the save/share artifact.
- Production: `https://oneiro-psi.vercel.app`
- Vercel project: `zhangtianruns-projects-7b0d221b/oneiro`
- GitHub repo: `zhangtianrun0522-pixel/Oneiro`
- GitHub integration is working. Pushes to `main` trigger Production deployments.
- Product decision: validate in China first as a private dream-memory product. Bazi is a default, bounded lens after the latest product correction; astrology and fate claims remain outside V0.2. `V0_2_DEVELOPMENT_PLAN.md` supersedes older market decisions where they conflict.
- Vercel Authentication is enabled. Public requests may return `401 Authentication Required`; use `vercel curl` when testing protected deployments.

## Recent Commits

- `928f2c5 feat: add public sharing baseline`
- `861cc06 docs: record current project progress`
- `5dd5de1 feat: add DeepSeek interpretation provider`
- `d5f990b fix: keep MVP running when image generation times out`
- `eff347c fix: add ESM extensions for API imports`
- `4df7877 feat: add OpenAI-compatible image provider`

## MVP Flow

1. User can start writing a dream immediately without profile data; interpretation requires birth date/time and prompts for the profile when missing.
2. The raw dream is saved before interpretation starts, so provider failure or safety blocking does not discard it.
3. Interpretation extracts verifiable dream facts and returns bounded possible real-life connections plus one answerable question.
4. Result page leads with the raw dream, facts, hypotheses, and feedback; the dream card appears afterward as a collectible/share artifact.
5. User can submit one of four structured feedback values, delete the dream, save a collectible card, or export the full reading.
6. Up to 30 local dreams appear in the private dream archive; pending or blocked entries remain visible as saved raw dreams.
7. Local MVP analytics records raw save, interpretation, feedback, deletion, image, export, share, and archive events under `oneiro:events`.
10. Result sharing can create a card-only CloudBase payload and route to `/pages/share/index?id=...`; if cloud share creation is unavailable, it falls back to the existing home share route.
11. `interpretDream` has a basic server-side safety gate. Explicit cloud safety blocks show a modal and do not fall back to local generation.
12. CloudBase-ready client paths and cloud function skeletons exist for login/openid, cloud interpretation, profile save, dream save, event tracking, Canvas share-card upload, and share-card payloads; these still need a real AppID, CloudBase environment, deployment, and database/storage rules before production verification.

## Public-Sharing MVP Work

- First-run profile entry now de-emphasizes optional birth time/place and can continue from the last local profile.
- Dream input now includes a sample dream and a visible disabled state instead of hiding the action.
- Text interpretation appears before image generation finishes, with result-page image status messaging.
- Result card is optimized as a social sharing cover: title, image, symbols, emotional weather, one small act, date, and Oneiro branding.
- Full interpretation is available on the flipped card back.
- Recent 5 dreams and last profile are stored in `localStorage` only; no login or cloud history is part of this iteration.
- Local Vite dev now runs `/api/*.ts` handlers directly, so `npm run dev` can call local APIs.

## Current Production Providers

Interpretation:

- `INTERPRET_PROVIDER=deepseek`
- `DEEPSEEK_MODEL=deepseek-chat`
- Gemini remains supported in code, but Production Gemini returned `403 Forbidden: Your project has been denied access`.

Image generation:

- `IMAGE_PROVIDER=openai`
- `OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/draw/completions`
- `OPENAI_IMAGE_MODEL=gpt-image-2`
- `OPENAI_IMAGE_SIZE=1024x1024`
- `OPENAI_IMAGE_QUALITY=low`
- `OPENAI_IMAGE_TIMEOUT_MS=90000`
- `IMAGE_FALLBACK_PROVIDER=pollinations`

The third-party image gateway can be slow or reject prompts. `/api/generate-image` now falls back to Pollinations instead of failing the MVP flow.

## Verified Production Tests

Use authenticated Vercel curl because Deployment Protection is enabled:

```bash
npx vercel curl /api/interpret --deployment https://oneiro-psi.vercel.app -- --request POST --header 'Content-Type: application/json' --data '{"dreamText":"I walked through a moonlit library and found a silver key.","userInfo":{"nickname":"Test","birthDate":"1998-01-01","birthTime":"08:30","birthPlace":"Shanghai"}}'
```

Result: returned valid dream JSON via DeepSeek.

```bash
npx vercel curl /api/generate-image --deployment https://oneiro-psi.vercel.app -- --request POST --header 'Content-Type: application/json' --data '{"prompt":"A moonlit library with towering shelves, a silver key floating amidst dust motes and beams of blue light, surreal and symbolic."}'
```

Result: returned `imageUrl`. In the latest test the OpenAI-compatible gateway rejected/failed and the endpoint returned `provider: "pollinations-fallback"`.

## Known Issues

- Supabase writes are failing in Production logs with DNS error:
  - `getaddrinfo ENOTFOUND owegtixwbjjmwfzorqdz.supabase.co`
  - This does not currently block `/api/interpret` because insert errors are logged and ignored.
  - Next step: confirm whether `SUPABASE_URL` points to an active project, or update Production env to the correct Supabase project URL.
- API keys were shared in chat during setup. Rotate the DeepSeek and image gateway keys after confirming deployment.
- Local image2 generation can take around 40-50 seconds; the UI now handles this by showing the text result first and filling the image later.
- `vercel.json` memory settings are ignored under Active CPU billing. The warning is harmless.
- `npm install` previously reported 5 moderate vulnerabilities. Do not run `npm audit fix --force` casually.
- WeChat Developer Tools `open --compile-condition` does not apply page conditions; `compile-condition` belongs to preview commands, so do not use preview unless uploading/QR generation is explicitly approved.
- Mini Program visual verification is partly pending: the home page is visible in DevTools, but result-page visual inspection and album/share behavior still need manual DevTools interaction or automation. macOS screen recording permission also blocked clean screenshot capture during the latest attempt.
- WeChat Developer Tools `engine build` is not available on the current local IDE HTTP server. The CLI returned `Cannot GET /engine/build`, so local Mini Program verification currently relies on DevTools `open`, script/JSON checks, and manual GUI inspection.
- WeChat Developer Tools is running and `open` succeeds, but the window could not be surfaced into the current screenshot space via app name or bundle id (`com.tencent.webplusdevtools`). Treat visual inspection of result/save/share as still pending until it is manually confirmed in the visible DevTools GUI.
- WeChat Developer Tools `preview` passes with the real Mini Program AppID `wx61800035c4e1a092`. The latest preview package size is 53.1 KB / 54,362 bytes after adding `cloudHealth`.
- WeChat Developer Tools automation is enabled on `ws://127.0.0.1:9420`. Automated simulator acceptance reached `pages/home/index`, `pages/new-dream/index`, `pages/result/index`, and `pages/archive/index`.
- Automated simulator flow verified: first-run profile is present, "try sample dream" fills dream text, result generation eventually falls back to the local oracle when CloudBase functions are unavailable, result card renders with title `潮钥`, theme `tide`, `shareImagePath` is ready, the full reading section exists, `saveCard` executes without throwing in the simulator, and archive shows saved cards.
- Save-card permission was exercised in WeChat DevTools. The simulator showed the `saveImageToPhotosAlbum` authorization prompt, and `miniprogram-automator` handled it through `native().authorizeAllow()`. DevTools then opened a macOS save dialog for the generated image; direct coordinate clicking is blocked because `osascript` does not have Accessibility permission on this machine, so the project window was closed/reopened through the CLI to clear the dialog.
- CloudBase code paths are present and the eight MVP cloud functions have been deployed to `cloud1-d9gb0sjvg6a8d9864`: `cloudHealth`, `login`, `interpretDream`, `saveProfile`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard`. All checked functions report `Active` with runtime `Nodejs16.13`. `cloudHealth` verified database collections and storage writes. `interpretDream` currently returns a deterministic MVP oracle response and includes only a basic regex safety gate; it still needs real AI provider calls plus WeChat/provider content-safety implementation before launch.
- CloudBase data/storage verification passed through `cloudHealth` run `1781339229268`: it created/read `users`, `dream_entries`, `events`, `share_pages`, and `generated_assets`; wrote event id `8efe4ec36a2d145d00e7956c3db3c03c`; uploaded `share-cards/healthcheck-1781339229268.txt`; and recorded generated asset id `6711d5f06a2d145e003257f71d2e7b0e`.
- CloudBase business cloud flow verification passed from the Mini Program runtime: `login` returned openid `oiMk63bCBgTZuiqu7caFt-ziUirA`; `saveProfile` wrote id `f5f35ce96a2d15780052d3df25887e4d`; `interpretDream` returned provider `cloudbase-static` and result title `钥月`; `saveDream` wrote id `8efe4ec36a2d157c00e7eae2178b7fd8`; `trackEvent` inserted 1 event; `createShareCard` wrote id `8efe4ec36a2d157f00e7eb1f668ea360`; and `getShareCard` read share id `card-1781339519031-iph0sh` back successfully.
- CloudBase deployment readiness is now documented in `docs/CLOUDBASE_DEPLOYMENT.md`, and `npm run check:cloudbase` verifies the real AppID, cloud function folders, CloudBase adapter hooks, share-card storage path, health-check function, and required collection documentation.
- Earlier WeChat Developer Tools `cloud env list` calls failed before the CloudBase package/environment was created. The actual environment id is now `cloud1-d9gb0sjvg6a8d9864`. A post-deploy `cloud functions list` call intermittently returned `Failed to fetch`, but `cloud functions info` successfully confirmed all deployed functions are active.

## Next Recommended Work

1. Recruit 30–50 Chinese seed users and instrument structured interpretation feedback: useful, too generic, too mystical, or not grounded in the dream.
2. Tune the result page so the first visible value is a meaningful personalized dream interpretation, with the card acting as the collectible/shareable artifact.
3. Define the lightweight metaphysical profile contract from nickname, birth date, optional birth time, and optional birth place.
4. Run a real-device Mini Program QR flow to verify end-user share-card image upload and `/pages/share/index?id=...` across a clean session.
5. Add structured interpretation feedback (`有启发 / 太泛 / 太玄 / 不贴梦`) and begin the three-dream pattern-memory loop.
6. Rotate the DeepSeek and image gateway keys that were shared during setup.
7. Fix Supabase Production env only if the Vite web prototype needs cloud history again; Mini Program V1 should prioritize CloudBase.

## 2026-07-10 Product And Generation Iteration

- Completed market and user-pain research across dream apps, astrology products, U.S. survey data, WeChat reach, privacy research, and Chinese platform/regulatory constraints.
- Chose China-first validation because the existing WeChat/CloudBase/share stack minimizes cash and launch friction; North America remains the second market after retention is proven.
- Replaced the vague “full metaphysics later” starting point with an explainable Eastern birth-rhythm lens based on birth season, Chinese zodiac, and optional birth time period. Results now state their basis and explicitly say they are not full bazi or fate prediction.
- Defined the Oneiro visual signature as `Oneiro Etched Dream Atlas`: indigo copperplate etching, restrained gouache, moon ivory, cotton paper texture, and one theme accent from a closed eight-theme vocabulary.
- Image generation now accepts only a normalized card theme, reports style version/cache/latency metadata, and reuses CloudBase `generated_assets` entries by prompt + theme + model + style version.
- Result-page Canvas sharing no longer waits for the AI image. A branded static dream card is rendered immediately, while AI art replaces it in the background when ready.
- Verification passed: `npm run check:mini-release`, `npm run build`, and JavaScript syntax checks for the changed Mini Program runtime files. Vite still reports the existing >500 kB chunk warning.
- User restored the WeChat Developer Tools login and runtime automation completed against `pages/result/index?fixture=1`. First paint showed `潮钥`, theme `tide`, the birth-rhythm basis, and a usable `shareImagePath` while the AI image was still generating; there were no runtime exceptions or console errors.
- Redeployed `interpretDream` and `generateDreamImage` to `cloud1-d9gb0sjvg6a8d9864`. Both remained `Active` on `Nodejs16.13` with 60-second timeouts.
- First v1 style generation took about 45 seconds; the second identical request returned from cache before the 1.8-second first-paint assertion with `cacheHit: true`.
- Runtime debugging found that the provider returns JPEG bytes while the old pipeline always uploaded with a `.png` suffix. `generateDreamImage` now detects PNG/JPEG/WebP magic bytes, rejects tiny/unknown payloads, uploads with the correct extension, records image format/size, and uses style/pipeline version `oneiro-etched-dream-v2` to avoid stale cache entries.
- A v2 generation produced a valid 886,074-byte JPEG and cached it successfully. The subsequent request returned the same asset with `cacheHit: true`.
- The current Mac/DevTools environment cannot download the CloudBase CDN asset: both `wx.cloud.downloadFile` and direct curl fail during TLS setup with `Client network socket disconnected before secure TLS connection was established`. The Mini Program now prefers `wx.cloud.downloadFile(fileID)`, falls back to the temporary URL, records the internal failure, and shows a friendly static dream-card fallback instead of a raw error. A real-device test on a different network is still required to validate the final generated artwork visually.

## Current Development Notes

- Dream interpretation has been expanded with emotional weather, core symbols, and an integration question.
- Backend interpretation responses are normalized before returning to the frontend, so missing fields and out-of-range sound values get safe defaults.
- The result card and exported image now include the new interpretation sections.
- Added `npm run check:dream` as a local contract check for dream result normalization and schema boundaries.
- `npm run typecheck` now covers `src/`, `api/`, and `scripts/`, instead of only top-level TypeScript files.
- Added an `?acceptance=1` local verification mode that preloads a stable profile, dream sample, and image result for browser-based end-to-end checks.
- Browser verification on `http://127.0.0.1:5173/?acceptance=1` reached the result card, verified the front and back states, and confirmed the new schema fields display correctly.
- During verification, the browser exposed a usability gap in the acceptance path, so the profile form now accepts initial values and can be exercised without manual date/time entry.
- Public-sharing verification on `http://127.0.0.1:5173/?acceptance=1` reached the redesigned 9:16 result card in a 402 x 874 mobile viewport.
- Local API verification returned 200 from DeepSeek `/api/interpret` and image2 `/api/generate-image`.
- Product direction has been documented in `PRODUCT_STRATEGY.md`: Oneiro should launch first as a WeChat Mini Program, with the Vite web app kept as a prototype and acceptance harness.
- Product strategy now frames Oneiro as personalized dream interpretation first, beautiful dream card second, dream journal/card archive third, and long-term metaphysical memory as the retention moat.
- Added `miniprogram/` as a separate native WeChat Mini Program spike with static acceptance pages for profile entry, dream input, result dream card, and recent local archive.
- Mini Program result page now includes a Canvas-based save-card flow that draws a 750 x 1334 dream card and saves it to the user's photo album.
- Mini Program page scripts passed local `node --check` syntax verification. The Canvas export still needs verification inside WeChat Developer Tools because the WeChat canvas and album permission APIs cannot be exercised from Node.
- WeChat Developer Tools CLI service port is reachable locally. The Mini Program now uses real AppID `wx61800035c4e1a092`; DevTools preview and simulator launch succeed with that AppID.
- Mini Program MVP shape now follows a card-first oracle flow: the result page shows the dream card first, but the card carries condensed interpretation via emotional weather, symbols, today's omen, and metaphysical resonance; the full reading below is organized as card meaning sections.
- Added a local lightweight birth-profile oracle for the static MVP. It derives zodiac/seasonal element/time tone from nickname, birth date, optional birth time, and optional birth place, then personalizes card number, profile summary, today's omen, and metaphysical resonance.
- Birth-profile personalization now layers on top of the local dream-symbol reading instead of replacing it, so card insight/oracle/metaphysical resonance still reference the user's actual dream symbols.
- Home, dream input, and archive copy now frame the product as drawing and collecting dream oracle cards instead of generic dream logging.
- Result page now pre-renders the Canvas dream card as a temporary image for both saving to the album and WeChat share preview image.
- Added a `fixture=1` result-page mode for local Mini Program acceptance. It loads the sample dream and current/default profile without changing the normal user path from dream input or archive.
- Enabled a project-level condition named `MVP 验收结果页` for `pages/result/index?fixture=1`.
- Added a local dream-symbol oracle for the Mini Program static MVP. User dream text now changes card title, symbols, emotional weather, dream translation, subconscious clues, reality mirror, wake-up question, and one small act before the birth-profile personalization layer is applied.
- Mini Program dream cards now include a dream-derived visual theme (`tide`, `threshold`, `shadow`, `falling`, `archive`, `hearth`, `moon`, or `mist`). The result page and exported Canvas share card both use this theme, so the card's visual mood changes with the user's dream symbols instead of staying as a fixed cover.
- Added a local MVP analytics utility that stores funnel events under `oneiro:events`. It is wired into app launch, share landing, profile validation, dream start/submit, safety blocking, interpretation success, result view, Canvas image generation, save/export, WeChat share, archive view, and archive revisit. This satisfies the static event contract and leaves CloudBase upload as the next backend step.
- Added a CloudBase-ready frontend adapter at `miniprogram/utils/cloudBase.js`. It initializes `wx.cloud` when available, retrieves openid via `login`, calls `interpretDream` before falling back to the local oracle, syncs profiles and dreams through cloud functions, flushes MVP analytics events, and uploads generated Canvas share cards to cloud storage without blocking the local fallback flow.
- Added minimal cloud function skeletons under `miniprogram/cloudfunctions/`: `login`, `interpretDream`, `saveProfile`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard`. They target the `users`, `dream_entries`, `events`, and `share_pages` collections where relevant and are now declared through `cloudfunctionRoot` in `project.config.json`.
- Added `pages/share/index` as a card-only sharing landing page. Result-page Canvas generation now attempts to upload the share card, create a `share_pages` payload, and use `/pages/share/index?id=...` in `onShareAppMessage` once the payload is ready.
- Added a server-side basic content-safety gate in `interpretDream`. Frontend generation now distinguishes cloud safety blocks from cloud failures: safety blocks show a modal and stop, while ordinary cloud unavailability can still fall back to local generation.
- Added a local basic dream-text safety gate before dream card generation. It blocks empty/too-short input and obvious high-risk self-harm, harm, or medical-diagnosis phrasing from producing a shareable card in the static MVP.
- Dream input now starts empty, with the sample dream available through an explicit "try sample" action, so the first action feels like entering the user's own dream.
- Result navigation now carries local dream ids (`pages/result/index?id=...`) from generation and archive paths, so saved local cards can be revisited from the result route on the same device. Share messages now route recipients to `/pages/home/index?fromShare=1` while using the generated card image as the share preview, avoiding broken cross-device local ids until CloudBase share payloads exist.
- Home now detects `fromShare=1` and shows a short shared-card landing note, so users who arrive from a shared dream card understand they can draw their own card.
- First-run profile fields now start empty instead of using demo defaults. Nickname and birth date are required, and birth date validation is component-based to avoid timezone issues.
- Result page now includes loop actions for drawing another dream card and returning to the dream card archive. Save-card permission failure opens a modal with a route to `wx.openSetting`.
- Archive loading now backfills missing local ids/createdAt values and guards invalid dates, improving compatibility with older local demo data.
- Added `npm run check:miniprogram` as a local Mini Program MVP acceptance check. It verifies profile fields, birth date validation, basic dream-text safety, server-side safety blocking, dream text adaptation, cloud-interpretation-first fallback behavior, dream-derived visual card themes, birth-profile personalization, result reading sections, Canvas save/share hooks, card-only share landing payloads, CloudBase-ready adapter calls, local MVP analytics events, result loop actions, archive rendering, local id routes, JSON configs, and a mocked page-method flow from profile to dream input, result, save card, share payload, share page, and archive revisit.
- Added `npm run check:cloudbase` and `docs/CLOUDBASE_DEPLOYMENT.md` to make CloudBase deployment readiness explicit. The current environment id is `cloud1-d9gb0sjvg6a8d9864`.
- Latest checks passed: Mini Program page/util script `node --check`, `npm run check:cloudbase`, `npm run check:miniprogram`, `npm run check:dream`, `npm run typecheck`, and `git diff --check`. On 2026-06-10, `npm run check:cloudbase`, `npm run check:miniprogram`, and `npm run typecheck` passed after opening the project in WeChat Developer Tools.
- Latest WeChat Developer Tools check: with AppID `wx61800035c4e1a092`, `cli open --project miniprogram --lang zh` succeeded and `cli preview --project miniprogram --qr-format image --qr-output /private/tmp/oneiro-preview.png --info-output /private/tmp/oneiro-preview-info.json --lang zh` passed. Latest preview info reported total package size 54,362 bytes.
- Latest simulator automation check: temporary `miniprogram-automator@0.12.1` was installed under `/private/tmp/automator-env` only, connected to `ws://127.0.0.1:9420`, and verified home -> new dream -> sample dream -> result -> full reading -> save card -> archive. Screenshots were written to `/private/tmp/oneiro-automator-after-generate-wait.png`, `/private/tmp/oneiro-automator-reading.png`, and `/private/tmp/oneiro-automator-archive.png`.
- Latest save-card permission check: `saveCard` triggered the album permission prompt; `native().authorizeAllow()` accepted it and `shareImagePath` remained ready on `pages/result/index`.
- Latest CloudBase CLI check: `cli cloud functions deploy --env cloud1-d9gb0sjvg6a8d9864` deployed the original seven MVP cloud functions successfully, then `cloudHealth` was added and deployed successfully. First creation attempts can return `Creating`; retrying after creation completed worked. `cloud functions info` confirmed `cloudHealth` is `Active` on `Nodejs16.13`.
- Latest CloudBase runtime check: `cloudHealth` was invoked from WeChat DevTools automation and returned `ok: true`, confirmed openid/appid/env, created/read all five MVP collections, wrote one `events` document, uploaded one `share-cards/` healthcheck file, and recorded one `generated_assets` document.
- Latest business cloud runtime check: WeChat DevTools automation invoked `login`, `saveProfile`, `interpretDream`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard` in sequence. All returned `ok: true`; share payload path was `/pages/share/index?id=card-1781339519031-iph0sh`.
- Latest WeChat Developer Tools preview after adding `cloudHealth`: `cli preview --project miniprogram --qr-format image --qr-output /private/tmp/oneiro-preview.png --info-output /private/tmp/oneiro-preview-info.json --lang zh` passed with total package size 54,362 bytes.
- Latest DevTools diagnosis: the `tcbGetResourceLimit` / `Please choose a package first` popup appears to be a WeChat Developer Tools CloudBase console resource-package panel state issue, not a Mini Program code or deployment failure. `cloud env list` saw `cloud1-d9gb0sjvg6a8d9864`, `cloud functions list` saw all eight functions, `preview` passed with AppID `wx61800035c4e1a092`, and automator read `pages/home/index` with page data and visible nodes.
- Latest AI-ready CloudBase update: `interpretDream` now supports `INTERPRET_PROVIDER=deepseek` and `INTERPRET_PROVIDER=openai-compatible` through server-side CloudBase environment variables, normalizes provider JSON into the existing dream-card schema, and falls back to `cloudbase-static-fallback` when the provider is unavailable. The updated function was deployed to `cloud1-d9gb0sjvg6a8d9864`; `cloud functions info` reports `Active` on `Nodejs16.13`, currently with timeout `3`.
- Latest runtime verification after AI-ready deploy: direct Mini Program runtime call to `interpretDream` returned `ok: true`, provider `cloudbase-static`, title `钥月`, and profile summary `Runtu · 摩羯 · 云端梦卡`. WeChat DevTools preview still passes with AppID `wx61800035c4e1a092` and package size `53.1 KB / 54,362 bytes`.
- Latest page-flow verification after AI-ready deploy: automator completed home profile entry -> new dream sample -> result page with source `cloud`, title `潮钥`, generated share image, and local archive update. Forced result-page share creation returned `/pages/share/index?id=card-1781340711166-29550s`, and opening that share page loaded CloudBase payload title `潮钥`, card no `NO. 001`, theme `tide`, and symbols `清水`, `钥匙`, `月光`, `鸟`, `图书馆`.
- Latest provider-trace update: Mini Program dream records now store `interpretationProvider` from the cloud function result, and analytics sends the provider with `interpretation_success`. Local checks pass, WeChat DevTools preview passes with package size `53.2 KB / 54,427 bytes`, and automator verified a generated result/archived dream with `interpretationProvider: cloudbase-static`. This gives the real-AI verification a concrete signal: after CloudBase env setup, the same field should become `deepseek` or `openai-compatible`.
- Latest AI health-check update: `interpretDream` now supports `{ healthCheck: true }`, returning safe provider diagnostics without exposing secrets. The updated function was deployed successfully with package size `7.3 KB`. Automator invoked the deployed function and got `type: interpretDream.aiHealth`, `provider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, `requestTimeoutMs: 18000`, `strictAi: false`, and `fallbackProvider: cloudbase-static-fallback`.
- Latest AI readiness guardrail: added `npm run check:ai-readiness`, which verifies the `interpretDream` provider/health-check contract, confirms the CloudBase AI setup docs include required env and health-check details, and scans Mini Program runtime files to ensure server-side AI provider markers or likely API key literals are not present. It passed across 32 Mini Program runtime files. Latest local checks and WeChat preview still pass; preview package size remains `53.2 KB / 54,427 bytes`.
- Latest AI provider runbook: added `docs/AI_PROVIDER_RUNBOOK.md` with the exact CloudBase console configuration, expected `{ healthCheck: true }` outputs, real interpretation verification steps, and failure triage for missing keys, fallback provider responses, strict mode, timeout, model, and base URL issues. `npm run check:ai-readiness` now verifies this runbook stays aligned with the code contract.
- Latest AI readiness behavior check: `npm run check:ai-readiness` now loads the `interpretDream` cloud function in a local mocked CommonJS/CloudBase environment and executes `{ healthCheck: true }` for both static mode and a mock DeepSeek env. It asserts `providerConfigured: false` for static mode and `providerConfigured: true`, `model: deepseek-chat`, `baseUrlHost: api.deepseek.com`, and `requestTimeoutMs: 21000` for the DeepSeek scenario.
- Latest AI failure-path readiness check: `npm run check:ai-readiness` now also executes normal static interpretation, missing-key DeepSeek fallback, strict-mode provider error, and high-risk dream-text safety blocking in the mocked cloud function environment. This verifies the Mini Program should keep working with `cloudbase-static-fallback` when provider env is incomplete, while still stopping explicit safety blocks.
- Latest Mini Program AI health wrapper: added `cloudBase.aiHealth(callback)`, which calls `interpretDream` with `{ healthCheck: true }`. `npm run check:miniprogram` now covers the wrapper through the mocked CloudBase adapter. WeChat DevTools automator verified the real Mini Program runtime can `require('utils/cloudBase')` and call `cloudBase.aiHealth()`, returning deployed cloud diagnostics: `provider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, and `requestTimeoutMs: 18000`.
- Latest Mini Program diagnostics page: added hidden route `/pages/diagnostics/index` for checking CloudBase and AI provider state from WeChat Developer Tools. Automator opened the route and verified `cloudReady: true`, `cloudHealth.ok: true`, `collections: 5`, `aiProvider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, and visible diagnostic nodes. Latest preview package size is `57.8 KB / 59,184 bytes`.
- Latest DevTools diagnostics condition: added a project compile condition named `AI 诊断页` targeting `pages/diagnostics/index`. `npm run check:miniprogram` verifies the condition and route. WeChat DevTools preview still passes with AppID `wx61800035c4e1a092`, package size `57.8 KB / 59,184 bytes`, and automator reopened the diagnostics route with `cloudReady: true`, `cloudHealth.ok: true`, `provider: cloudbase-static`, `providerConfigured: false`, and `collections: 5`.
- Latest Mini Program release check: added `npm run check:mini-release`, which runs AI readiness, CloudBase readiness, Mini Program MVP contract, dream-result contract, and TypeScript checks in sequence. The command passed, followed by `git diff --check` and WeChat DevTools preview with AppID `wx61800035c4e1a092` and package size `57.8 KB / 59,184 bytes`.
- Latest AI smoke-test capability: `interpretDream` now supports `{ smokeTest: true }` for one explicit provider schema test after CloudBase env setup. Added `cloudBase.aiSmokeTest(callback)` and an `AI SMOKE TEST` action on `/pages/diagnostics/index`. The updated cloud function deployed successfully with package size `7.6 KB`; `cloud functions info` reports `Active` on `Nodejs16.13`, still with platform timeout `3`. Automator ran the diagnostics smoke test before provider setup and got the expected safe result: `smokeOk: false`, `smokeProvider: cloudbase-static`, `smokeReason: static_provider`, while `cloudHealth.ok` stayed `true`. Latest preview package size is `59.2 KB / 60,620 bytes`.
- Latest smoke-test safety update: diagnostics `AI SMOKE TEST` now asks for confirmation when `providerConfigured` is true, because it sends one real provider request after AI setup. When the provider is still static/unconfigured it runs directly. `npm run check:mini-release`, `git diff --check`, and WeChat DevTools preview passed; latest preview package size is `59.5 KB / 60,963 bytes`. A final automator recheck of the diagnostics button was not run because the current Codex usage limit blocked another GUI automation call.
- Latest release handoff update: added `docs/MINI_PROGRAM_RELEASE_CHECKLIST.md` and refreshed `docs/CLOUDBASE_DEPLOYMENT.md` so the final real-AI setup is an explicit checklist: run `npm run check:mini-release`, preview with AppID `wx61800035c4e1a092`, set CloudBase provider env vars, raise `interpretDream` timeout, verify the diagnostics health check, run one confirmed `AI SMOKE TEST`, then test real-device dream generation and cross-session share.
- Latest local verification on 2026-06-14: `npm run check:mini-release` passed, `git diff --check` passed, and WeChat DevTools `preview` passed with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`.
- Latest real-AI verification attempt on 2026-06-15: `npm run check:mini-release` passed, `git diff --check` passed, and WeChat DevTools `preview` passed with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`. WeChat DevTools CLI confirmed CloudBase environments `cloud1-d9gb0sjvg6a8d9864` and `onerio-d3g5kuewjff567707`; `interpretDream` in `cloud1-d9gb0sjvg6a8d9864` is `Active` on `Nodejs16.13` but still had `timeout: 3`. The installed DevTools CLI exposes only cloud function `list/info/deploy/inc-deploy/download`, and this machine does not have `tcb`, `cloudbase`, or `tccli`, so provider environment variables and timeout need to be set in the CloudBase console. DevTools automator could not reconnect to `ws://127.0.0.1:9420` because the current project window is not opened with automation enabled.
- Latest CloudBase console update on 2026-06-15: user configured `interpretDream` from the WeChat Developer Tools cloud function configuration dialog. CLI verification now reports `interpretDream` is `Active`, runtime `Nodejs16.13`, and `timeout: 30`. `npm run check:mini-release` passed again, and WeChat DevTools `preview` passed again with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`. Runtime AI health/smoke test still needs to be checked from the Mini Program diagnostics page because the DevTools automator port is not enabled.
- Latest runtime AI confirmation on 2026-06-15: user confirmed the Mini Program diagnostics page after configuring `interpretDream` with DeepSeek provider env vars. The expected target state is `provider: deepseek`, `providerConfigured: true`, `hasApiKey: true`, `model: deepseek-v4-flash`, `baseUrlHost: api.deepseek.com`, and `requestTimeoutMs: 18000`; user also confirmed after the requested diagnostics/smoke-test step. CLI recheck still reports `interpretDream` as `Active`, runtime `Nodejs16.13`, `timeout: 30`.
- Latest Mini Program certification update on 2026-06-15: user started WeChat Mini Program account certification and the application is now waiting for review. During certification review, preview/dev verification can continue, but public sharing/release behavior may remain limited until certification completes.
- Latest AI image-generation update on 2026-06-16: added CloudBase cloud function `generateDreamImage`, which calls an OpenAI-compatible image provider using server-side env vars, uploads generated images to CloudBase storage under `generated-dream-images/`, and returns a temporary URL for the Mini Program card surface. Result page now calls `cloudBase.generateDreamImage` with the interpretation `image_prompt`, displays the generated image on the card when available, and falls back to local symbolic card art if generation fails. The function was updated to match the GRSAI Apifox docs for `POST /v1/api/generate`, including `aspectRatio`, `replyType: json`, `results[0].url`, and async polling through `/v1/api/result?id=...`. `npm run check:mini-release` passed. The updated cloud function deployed successfully to `cloud1-d9gb0sjvg6a8d9864`; latest deploy package size is `2.9 KB`. WeChat Developer Tools only allows 1-60 seconds for cloud function timeout, so `generateDreamImage` now uses a 55-second internal request budget. CLI still reports `generateDreamImage` timeout as `3`, so CloudBase console configuration is still required before real image generation can work reliably.
- Latest image-provider configuration confirmation on 2026-06-16: user moved image provider env vars from `interpretDream` to `generateDreamImage`. CLI now confirms both `interpretDream` and `generateDreamImage` are `Active`, runtime `Nodejs16.13`, timeout `60`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `61.6 KB / 63,056 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png` for real-device image-generation testing.
- Latest image-timeout fix on 2026-06-16: diagnostics `IMAGE TEST` on device returned `image reason: provider_error` and `image message: image provider timeout`. Updated `generateDreamImage` so GRSAI `/v1/api/generate` gets up to 45 seconds for the initial provider request while keeping the total internal budget at 55 seconds for the 60-second WeChat cloud function limit. `node --check`, `npm run check:miniprogram`, and `git diff --check` passed. The updated cloud function deployed successfully with package size `3.1 KB`. A post-deploy `cloud functions info` recheck was blocked by current Codex usage limits, so verify timeout/function state later when CLI access resumes or from WeChat Developer Tools.
- Latest result-card image retry update on 2026-06-16: real-device diagnostics showed `IMAGE TEST` as `image ok: true` and `image url: ready`, confirming the image provider configuration works. One existing result card still displayed the local fallback overlay with `provider_error`, likely from a previous failed request or prompt-specific provider failure. Added a result-page `重新生成画面` action that clears the failed image state and calls `generateDreamImage` again for the same dream card. `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check` passed. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.2 KB / 66,779 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest image-timeout tightening on 2026-06-22: real-device diagnostics again showed `IMAGE TEST` returning `provider timeout`, which confirms the request reaches the image provider but the provider does not respond within the WeChat cloud function budget. Tightened `generateDreamImage` defaults from vertical full-card image generation to a faster square tarot illustration panel: default size/aspect ratio is now `1024x1024`, prompt/style text is shorter and focused on hand-drawn tarot illustration, and the local dream oracle/image smoke test now sends only core symbols instead of long narrative prompts. `node --check`, `npm run check:miniprogram`, `npm run check:dream`, `npm run check:mini-release`, and `git diff --check` passed. The updated `generateDreamImage` cloud function deployed successfully to `cloud1-d9gb0sjvg6a8d9864` with package size `3.2 KB`, and WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.2 KB / 66,788 bytes`.
- Latest GRSAI model switch on 2026-06-28: user asked to switch image generation to the nanobanana model family and provided the GRSAI model dashboard. Updated `generateDreamImage` default model to `nano-banana-fast` for the Mini Program's faster square tarot illustration panel. Added model normalization so stale CloudBase env values `gpt-image-1.5` and `gpt-image-2` are mapped to `nano-banana-fast`, while `nanobanana`, `nanobanana-fast`, `nanobanana-2`, and `nanobanana-pro` aliases resolve to the corresponding GRSAI `nano-banana*` model names. Diagnostics now reports both `requestedModel` and effective `model`, so stale CloudBase env overrides can be seen on-device. Updated CloudBase/release docs and README examples to use `OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/api/generate`, `OPENAI_IMAGE_MODEL=nano-banana-fast`, and `1024x1024` image/aspect values. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:cloudbase`, `npm run check:mini-release`, and `git diff --check`. The updated `generateDreamImage` function deployed successfully to `cloud1-d9gb0sjvg6a8d9864` with package size `3.3 KB`; WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.9 KB / 67,450 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest generateDreamImage dependency fix on 2026-06-28: real-device diagnostics showed `image reason: cloud_call_failed` and `Cannot find module 'wx-server-sdk'` for `generateDreamImage`, meaning the cloud function was crashing before reaching the image provider. The function already had `wx-server-sdk` in `package.json`, but earlier deploys uploaded only the source files, so the runtime dependency was missing. A local `npm install --omit=dev` proved the missing dependency, but uploading local `node_modules` caused a WeChat CLI `EISDIR` packaging error. Redeployed `generateDreamImage` with WeChat Developer Tools `--remote-npm-install`, letting CloudBase install npm dependencies in the cloud. The deployment succeeded with package size `16.7 KB`; local temporary `node_modules` was removed afterward. `npm run check:mini-release` passed and WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`.
- Latest nano-banana API adapter update on 2026-06-28: real-device diagnostics reached GRSAI with `image model: nano-banana-fast`, `image size: 1024x1024`, and `image key: true`, but `IMAGE TEST` returned provider error `400 {"status":"failed","error":"generate failed"}` from the generic `/v1/api/generate` endpoint. Updated `generateDreamImage` so `nano-banana*` models use the GRSAI nano-banana-specific endpoint `POST /v1/draw/nano-banana`, then poll `POST /v1/draw/result` for task completion. Non-nano image models still use the existing `/v1/api/generate` flow. Added local acceptance checks for the nano-banana draw/result endpoints. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` with `--remote-npm-install`; deployment succeeded with package size `17.2 KB`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest nano-banana response parser fix on 2026-06-28: after switching to the nano-banana-specific GRSAI endpoint, real-device diagnostics returned `Unexpected token d in JSON at position 0`, indicating the provider returned a non-standard JSON body, likely `data:`/SSE-style response text. Updated `generateDreamImage` response parsing to support plain JSON and `data:` event-stream payloads, keeping the last valid JSON event when multiple `data:` lines are returned. Redeployed `generateDreamImage` with `--remote-npm-install`; deployment succeeded with package size `17.5 KB`. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest real-device image success and composition tuning on 2026-06-28: user confirmed diagnostics `IMAGE TEST` with `image ok: true` and a real dream result card rendered an AI image. The image style is close to the intended hand-drawn tarot direction, but the model generated a complete tarot card inside the Oneiro card frame, causing nested-card composition and excess blank margins. Updated `generateDreamImage` default style and prompt builder to request only a full-bleed square inner illustration panel, explicitly excluding complete card mockups, borders, frames, blank margins, text, letters, and watermarks. Updated the local dream oracle and `interpretDream` image-prompt contract to the same inner-panel language, and changed Canvas share-card drawing to center-crop AI images instead of stretching them. Verification passed: `node --check` for `generateDreamImage` and result page, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` with `--remote-npm-install` and redeployed `interpretDream`; both deployments succeeded. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `67.2 KB / 68,801 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest 3:4 dream-card product update on 2026-07-08: user confirmed the card direction should prioritize a social-friendly 3:4 ratio, with two export modes: a low-text collectible dream card and a full-reading long image. Updated the Mini Program result page so the visible dream art is vertical 3:4, the default share/save Canvas exports a 900 x 1200 collectible card with only image, title, profile summary, one omen line, symbols, and date, and a new `保存完整解读` button exports a 900 x 2800 long image with the collectible card plus dream translation, subconscious clue, reality mirror, metaphysical resonance, and wake-up question. WeChat sharing continues to use the collectible card, not the long reading. Updated `generateDreamImage` defaults and prompts from square artwork to vertical 3:4 Rider-Waite-inspired vintage ink/watercolor tarot illustration panels, mapping stale `1024x1024`/`1024x1536` env values to `768x1024`; nano-banana calls now request `aspect_ratio: '3:4'`. Updated local dream oracle, `interpretDream` image-prompt contract, diagnostics image smoke prompt, README, CloudBase docs, and Mini Program contract checks accordingly. Verification passed: `node --check` for result page and both cloud functions, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` and `interpretDream` to `cloud1-d9gb0sjvg6a8d9864`; both deployments succeeded. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `69.6 KB / 71,251 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Recommended next development step: scan the latest preview QR, create a fresh dream card, test both `保存收藏梦卡` and `保存完整解读`, and judge whether the 3:4 AI illustration now feels closer to a tarot deck while still avoiding AI-generated text or nested card frames.

## Useful Commands

```bash
npm run build
npm run check:cloudbase
npm run check:mini-release
npm run check:miniprogram
npm run check:dream
npm run typecheck
npx vercel env ls
npx vercel logs https://oneiro-psi.vercel.app --no-follow --limit 20 --expand
npx vercel --prod --yes
```

## 2026-07-23 Nano 内测画风三轮迭代

- 固定使用 `nano-banana-fast`，以 9 个不同梦境进行三轮全局 Prompt 迭代；没有针对单张图追加专用补丁。
- Round 1 / v1.3 验证叙事层级，2 张有效输出独立评分为 10/14、12/14；第三个样例连续四次供应商超时。主要问题是白边、干净矢量感和人物不够匿名。
- Round 2 / v1.4 强化零白边、不规整轮廓和匿名人物，3 张独立评分为 10/14、12/14、10/14。白边完全消失，但渐变/辉光、重复网格和矢量规整仍不稳定。
- Round 3 / v1.5 强化离散平涂、扁平空间和禁复制，3 张均为 9/14；复杂空间诱发凭空复制人物和立体透明盒，因此判定回退并撤回。
- 当前云端已恢复为 `production = oneiro-riso-dream-v1.3`、`internal_test = oneiro-internal-test-style-v1.4`；健康检查确认模型为 `nano-banana-fast`。正式画风未改动。
- 新增串行真实测试工具 `scripts/run-nano-internal-style-round.cjs` 和 9 个固定梦境 fixture。工具会保存最终 Prompt/耗时/结果，校验线上模型及 styleVersion，预写当前 dreamId，并通过正常删除链路清理合成数据。
- `scripts/test-generate-dream-image.cjs` 增加 production Prompt SHA-256 golden，防止后续 internal_test 调整误改正式 Prompt。
- 完整图片、manifest、逐轮评分和结论见 `docs/design/nano-internal-style-3round-2026-07-23/README.md`。
- 验证通过：`node --check`（测试工具与 fixtures）、`node scripts/test-generate-dream-image.cjs`、`npm run check:mini-release`、`git diff --check`。
- 追加完成参考图 A/B 测试：GrsAI nano `urls` 参考图入口已作为 `referenceTest` 实验分支接入，只在显式 `internal_test` 下启用；普通生成路径和 production 不变。两张“内测画风”参考图测试了黄伞、珊瑚窗两个梦境，人物匿名性和安静感略有改善，但重复图案/块状纹理仍在；紫岸样例两次超时。完整结果见 `docs/design/nano-internal-style-reference-test-2026-07-23/README.md`。参考图上传后会在生成结束清理，且使用独立缓存键。

## 2026-07-24 解读 grounding 与八字结构扩展

- 修复梦象词误配：`雨/暴雨` 不再被规则映射为“清水”；新增“暴雨”“沙漠”字面梦象，AI 返回的 symbols、人物、地点、物件会按原梦过滤，文本中的“清水/另一个细节”等幻觉也会被修正或回退。
- 强化文化象征与心理视角的分工：文化象征解释共同文化语境，心理视角只引用当次梦的具体细节；只有一个细节时不再硬凑第二个场景。
- 八字计算版本已升级为 `bazi-v0.6-engine`：在保留真太阳时、四柱、天干十神的基础上，新增可选藏干、藏干十神、支十神、纳音、十二长生、旬空、胎元/胎息/命宫/身宫、五行扶助/消耗证据，以及干支合冲害破关系；填写性别后再计算大运方向、起运时间和周期，未填写则不猜测。
- 结果页不再展示“排盘依据”明细；完整排盘结构保留在结果数据中供后续画像和阶段解读使用。
- 回归用例覆盖“我梦见沙漠里开始下暴雨”，并覆盖图片 visual plan 不得带入“清水、鱼、积水荒原”等未出现元素。
- 本轮本地验证：`npm run check:mini-release`、`node scripts/test-generate-dream-image.cjs`、`git diff --check` 均通过。待部署 `interpretDream` 与 `generateDreamImage` 后再生成最新预览二维码。

## 2026-07-24 性别接入与结果页收敛

- 资料页新增“性别 / 可选”，值会随档案保存并随新梦请求传入云函数。
- `interpretDream` 已接入性别到八字大运计算：男/女分别决定大运顺逆与起运周期；未填写性别时只保留四柱与静态结构，不猜大运。
- 结果页仅展示“这次被调动的底色”与梦境呼应，不再展示排盘依据、四柱明细或固定命盘摘要；完整结构仍保留在结果数据中。
- 已部署 `interpretDream`（32.1 KB）与 `saveProfile`；最新内测二维码为 `/private/tmp/oneiro-preview-bazi-gender-v1.png`。
- `npm run check:mini-release`、`git diff --check` 与 `node --check` 均通过。

## 2026-07-24 现实关联表达重写

- 根据内测反馈，问题从“是否先给结论”重新定义为“每句话是否能回答它和用户生活有什么关系”。
- 心理视角现在要求：原梦证据 + 具体关系/工作/项目/等待/边界等现实议题 + 一个可被用户否定的关联假设；不满足证据密度时回退到结构化文案。
- “与你有关”不再使用固定的压力/选择/安全感句式；针对“沙漠下暴雨”会明确指出“长期没动静的事项突然需要承接”，并给出承接/拒绝的验证动作。
- 出生节律现在把静态结构信号翻译成用户可感知的应对倾向，再连接到梦中具体细节和当天的可执行动作；不再只复述“环境变化”。
- 本地兜底 `localDreamOracle` 同步修正雨/暴雨与清水的区分，并加入同样的现实关联表达，避免云端失败后体验回退。
- 新增语义回归断言，拦截只有“沙漠、暴雨象征变化”或“留意感受”而没有现实关联的文本。
- 验证通过：`npm run check:mini-release`、`node --check miniprogram/utils/localDreamOracle.js`、`git diff --check`。`interpretDream` 已重新部署，最新预览二维码为 `/private/tmp/oneiro-preview-qr-relevance-v1.png`。

## 2026-07-24 阶段画像与长期记忆语义调整

- 明确“梦境生成即存档，用户主动删除才移除”的记忆语义；阶段画像读取全部已存档梦境、梦后讨论、回访回答、确认现实片段和基础身份/出生资料。
- 阶段画像改为一段精炼的整体理解，基础资料作为底座，新增信息后后台非阻塞重写；用户仍可编辑、确认、忽略和暂停用于后续解读。
- 自动更新接入新梦保存、梦后讨论、确认现实片段、回访回答、资料变更、现实片段编辑/删除；旧待确认版本会标记为“已被新版本替代”。
- 修复当前画像指针与失效画像状态不一致的问题；后续解读按当前画像指针读取，不再展示已失效画像。
- 已部署 `profileMemory`（7.0 KB）、`saveDream`（5.5 KB）、`interpretDream`（32.2 KB）。最新预览二维码：`/private/tmp/oneiro-preview-memory-v3.png`。
- `npm run check:mini-release`、`git diff --check` 与 TypeScript 检查均通过。

## 2026-07-26 梦境牌库时间线 MVP

- 牌库由普通列表改为按月份分组的竖向时间线，节点展示完整日期与时分，点击仍进入原有梦卡详情。
- 时间线加入主题色缩略图、无图时的稳定占位、重复主梦象的“第 N 次”标记，以及第三次重复/里程碑的轻强调节点。
- 保留阶段观察、本月主牌、阶段梦境原型、象征筛选和新梦入口；当前仍读取最近 30 个梦，后续可再加分页与阶段转折点。
- 详情页重新打开已有生图时会主动按 `image_file_id` 回载本地临时图片；只有成功回载才隐藏底层卡面，避免短期 URL 过期造成空卡。高清替换结果也会同步保存 `image_file_id`。
- 牌库缩略图同样先回载本地路径，回载失败显示主题占位，不直接依赖过期的云端临时 URL。
- 本地验证通过：`npm run check:miniprogram`、`npm run check:phase3`、`npm run check:mini-release`、`npm run typecheck`、`git diff --check`。
- 最新微信开发者工具预览二维码：`/private/tmp/oneiro-preview-timeline-v1.png`，预览包 175.6 KB。

## 2026-08-05 记忆按相关性检索与内测观测面板（v0.6-internal-test）

- 修复「记忆读起来不像记得我」的根因：旧实现把历史上出现次数最多的三个意象无条件塞进 prompt，对每个梦都是同一份背景板；而 prompt 红线规定「没有具体呼应就不许假装记得」，模型只能正确地闭嘴。现在改为拿今晚这个梦去历史里找确凿重合（`buildMemoryEchoes`），带上出现次数与相对时间感，并要求解读至少点出其中一处。
- 时间衰减贯穿 `dreamMemory`、`interpretDream`、`profileMemory`：近期的重复压过陈年的重复，半年前的高频意象不再永远占住阶段画像和跨梦线索。
- `profileMemory` 不再对已经记了几十个梦的用户说「现有素材不多」——那是用户当场就能证伪的一句话。
- 回访窗口从「只匹配昨天一整天」放宽为「已过一夜且不超过 7 天」。回访是产品里唯一主动采集现实线索的通道，窗口过窄会因为漏开一次就永久作废这个梦的回访，直接导致现实线索长期为 0。
- `cloudBase` / `app.js` 补上未处理 Promise 拒绝的日志：基础库原本把云函数超时报成一条没有归属的 `Error: timeout`，四帧堆栈全在 WAServiceMainContext 内部，完全看不出是哪个云函数。
- 新增内测观测面板（诊断页），四项指标：
  - **记忆呼应命中率**：`evaluateMemoryEcho` 统计系统交给模型几处已核实呼应、解读里最终点名了几处。只统计面向用户的叙述字段——意象出现在 `image_prompt` 里说明生图在画它，不代表解读点出了这处重复。分母只算 offered > 0 的解读，今晚的梦与历史无重合时的沉默是正确行为。
  - **留存漏斗**：≥1 / ≥3 / ≥5 个梦的人数与转化率。跨梦线索要到第 3 个梦才开始出现，第 5 个才谈得上习惯。
  - **解读失败率 / 生图失败率**：按尝试次数计，重试成功仍然记一次失败，否则「第一次总是超时」会被洗白。
  - **解读反馈**：四类反馈计数与最近 20 条明细（类型、时间、promptVersion）。
- 所有比率都带分母显示，样本为空时显示「样本不足」而不是 0%：0/0 显示成 0% 会被读成「这条链路没问题」，而真相是它根本还没被跑过。
- 面板从 `stash@{0}` 恢复 feedbackStats 能力（只挑 feedback 相关部分，未 pop，隔离区其余改动原样保留）。两处改动：反馈查询改为按 `feedback` 字段过滤而不是全表分页；梦境原文摘要默认不返回，需另设 `ADMIN_FEEDBACK_EXCERPTS=true`——这正是当初把它隔离的隐私顾虑。
- 访问控制：`saveDream` 的 `feedbackStats` / `internalStats` 只对 `ADMIN_OPENIDS` 显式列出的 openid 开放，未配置时对所有人关闭；非管理员整块面板不渲染。留存与事件统计走数据库聚合，不做全表扫描。
- 本地验证通过：`npm run check:mini-release`（ai-readiness / cloudbase / miniprogram / phase3 / image-contract / image-quality-job / typecheck 全绿）、`git diff --check`。
- 待部署：`interpretDream`（memoryEcho 字段）、`saveDream`（观测面板 action 与 ADMIN_OPENIDS）。部署并设置环境变量前，诊断页面板不会出现，命中率也不会有数据。
