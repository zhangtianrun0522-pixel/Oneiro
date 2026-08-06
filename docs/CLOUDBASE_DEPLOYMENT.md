# CloudBase Deployment Checklist

This checklist is for the WeChat Mini Program MVP under `miniprogram/`.

## Current Verified State

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment id: `cloud1-d9gb0sjvg6a8d9864`
- WeChat DevTools `preview` passes with package size `209.6 KB / 214,662 bytes`.
- Local release checks pass with `npm run check:mini-release`.
- Cloud function source folders exist and have been deployed to the real CloudBase environment.
- `cloudHealth` exists to create/check required collections, write a health event, upload a healthcheck asset under `share-cards/`, and record asset metadata.
- Latest verified `cloudHealth` run: `1784446424263`, covering the original 9 required collections and storage. The progressive image2 flow additionally uses the private `image_generation_jobs` collection.
- Latest verified business cloud flow:
  - openid: `oiMk63bCBgTZuiqu7caFt-ziUirA`
  - `saveProfile` id: `f5f35ce96a2d15780052d3df25887e4d`
  - `saveDream` id: `8efe4ec36a2d157c00e7eae2178b7fd8`
  - `createShareCard` id: `8efe4ec36a2d157f00e7eb1f668ea360`
  - share id: `card-1781339519031-iph0sh`
  - share path: `/pages/share/index?id=card-1781339519031-iph0sh`

## Required CloudBase Environment

Use the CloudBase environment in WeChat Developer Tools for AppID `wx61800035c4e1a092`.

Current environment id:

```text
ENVID=cloud1-d9gb0sjvg6a8d9864
```

The CLI requires this id for cloud function list/deploy commands.

## Verified Collections

These database collections have been created and read by `cloudHealth`:

- `users`
- `dream_entries`
- `life_notes`
- `profile_snapshots`
- `profile_memory_state`
- `deletion_jobs`
- `events`
- `share_pages`
- `generated_assets`
- `image_generation_jobs`

Keep every database collection private to the Mini Program client. Public card reads must go through `getShareCard`, which returns only the share-safe payload and enforces revocation; do not grant direct public read access to `share_pages`, because its server record also contains ownership and source fields. Keep CloudBase storage private as well and expose only temporary URLs created by trusted cloud functions.

Latest live rule probe: a server-created test `dream_entries` record and `share_pages` record were readable through their cloud functions, while direct Mini Program database queries by exact `localId` and `slug` both returned zero rows. The test dream was then deleted and its share revoked.

## Verified Storage

Storage access has been verified for:

```text
share-cards/
```

`cloudHealth` uploaded `share-cards/healthcheck-1781339229268.txt`. User share cards now use a local Canvas image for WeChat forwarding; `createShareCard` stores only a server-projected text/card payload and does not trust or retain client-provided cloud file ids.

## Real AI Interpretation Provider

`interpretDream` is provider-ready. Its code default remains a static fallback so the Mini Program keeps working when provider configuration is unavailable. The current verified cloud environment is configured for DeepSeek (`deepseek-v4-flash`) and passed both smoke and full-reading calls without fallback:

For the step-by-step provider setup and failure triage, see `docs/AI_PROVIDER_RUNBOOK.md`.

```text
INTERPRET_PROVIDER=static
```

To enable DeepSeek in the CloudBase function runtime, configure these environment variables on the `interpretDream` cloud function:

```text
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=<rotate-and-set-in-cloudbase-only>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERPRET_TIMEOUT_MS=45000
```

OpenAI-compatible providers are also supported through:

```text
INTERPRET_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=<set-in-cloudbase-only>
OPENAI_COMPATIBLE_BASE_URL=https://example.com/v1
OPENAI_COMPATIBLE_MODEL=<model-name>
```

Compatibility aliases are also accepted for the OpenAI-compatible path: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, or `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.

Keep provider keys server-side in CloudBase only. Do not put them in Mini Program source files, `project.config.json`, or frontend storage. Dream semantics are model-only: if the provider is unavailable, missing a key, times out, or returns malformed JSON, `interpretDream` returns a retryable error without `result`. The original dream remains saved, and the result page offers “重新解读”. No local keyword classifier generates substitute symbols or interpretations.

The deployed `interpretDream` function keeps the CloudBase platform timeout at
60 seconds and clamps the provider request budget to `45000`-`50000` ms. The
default is `45000` ms, leaving time for response validation and persistence.
The Mini Program client waits up to `70000` ms for `interpretDream` results.

`interpretDream` also supports a safe provider health check:

```js
wx.cloud.callFunction({
  name: 'interpretDream',
  data: { healthCheck: true }
});
```

The response intentionally does not expose secrets. It reports `provider`,
`providerConfigured`, `hasApiKey`, `model`, `baseUrlHost`, `requestTimeoutMs`,
`timeoutBudget`, and `fallbackProvider`. Provider failures also include a
stable `errorCode` (for example `provider_timeout`) plus `diagnostics` with
provider, model, request budget, and elapsed time. Before real AI setup it
should report `provider: cloudbase-static` and `providerConfigured: false`;
interpretation requests fail retryably rather than fabricating local results.
After real AI setup it should report `provider: deepseek` or
`provider: openai-compatible` and `providerConfigured: true`.

## Internal-test observation panel

The diagnostics page (`pages/diagnostics/index`) can show aggregate internal-test
metrics: memory-echo hit rate, the 1/3/5-dream retention funnel, interpretation and
image failure rates, and reading feedback. These read across **all** users, so both
`saveDream` actions behind them (`feedbackStats`, `internalStats`) are closed by
default and only answer openids listed explicitly on the `saveDream` cloud function:

```text
ADMIN_OPENIDS=<comma-separated openids; unset means nobody has access>
ADMIN_FEEDBACK_EXCERPTS=<'true' to also return 40-char dream excerpts; default off>
```

Open the diagnostics page to read your own openid off the top panel, then add it to
`ADMIN_OPENIDS`. Non-admins get `{ ok: false, reason: 'not_admin' }` and the page
renders no panel at all.

Dream text is the most private content in the product. `ADMIN_FEEDBACK_EXCERPTS` is
a separate switch on purpose — feedback type, timestamp and `promptVersion` are
enough to locate a bad reading, and that is what ships by default.

The memory-echo hit rate is computed from `interpretation_success` /
`interpretation_retry_success` events in the `events` collection, so it only covers
readings recorded after this build. Its denominator counts only readings where the
system actually found a verified repetition; a dream with no overlap against history
is correctly silent and is excluded.

## Real AI Image Provider

`interpretDream` now returns a structured `result.visual_plan`. `generateDreamImage` re-normalizes that plan against the owner-scoped stored dream, selects a relationship-based emotion palette and non-fixed composition, compiles the final `oneiro-seedream-dream-v2.0` prompt, uploads the generated bitmap under `generated-dream-images/`, and stores the full prompt, model, normalized plan, format/dimensions, and quality record in `generated_assets`.

Configure these environment variables on the `generateDreamImage` cloud function:

```text
IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=<set-in-cloudbase-only>
OPENAI_IMAGE_ENDPOINT_URL=<provider-images-endpoint>
OPENAI_IMAGE_MODEL=doubao-seedream-5-0-lite-260128
OPENAI_IMAGE_SIZE=1728x2304
OPENAI_IMAGE_ASPECT_RATIO=1728x2304
OPENAI_IMAGE_TIMEOUT_MS=55000
```

For the Seedream 5.0 Lite gateway, set its OpenAI-compatible base URL in `OPENAI_IMAGE_BASE_URL` or the full `OPENAI_IMAGE_ENDPOINT_URL`, and keep `OPENAI_IMAGE_MODEL=doubao-seedream-5-0-lite-260128`. The production request uses the verified Seedream payload shape (`1728x2304`, `sequential_image_generation=disabled`, URL response, no `quality` or `n` assumptions). The gateway key stays server-side in CloudBase only. The older `nano-banana-fast` adapter remains available when explicitly selected through the model environment variable.

The new visual system must pass the nine-card stability test before deployment: calm, anxious, and surreal dreams, three independent generations each. Pixel-level semantic checks such as unwanted text, focal clarity, face complexity, actual saturation, and thumbnail readability are currently recorded as `requires_vision_review`; only binary format and output geometry are enforced automatically.

The deployed `generateDreamImage` function now reports the 60-second platform maximum; keep `OPENAI_IMAGE_TIMEOUT_MS=55000` below that limit.

### Progressive image2 quality route

The Mini Program uses the synchronous Seedream 5.0 Lite call as the immediate image path. The optional progressive quality route remains independent: after the first image is available, the result page can submit `startQuality` and poll `pollQuality` while the user continues reading. A completed quality asset replaces the fast image; a failed or unavailable quality job leaves the Seedream image untouched.

Configure the quality route independently from the fast route on the same CloudBase function. These variables are optional; leaving them unset makes the action return `quality_unavailable` without changing the existing image path:

```text
QUALITY_IMAGE_ENABLED=1
QUALITY_IMAGE_PROVIDER=openai
QUALITY_IMAGE_API_KEY=<optional; falls back to OPENAI_IMAGE_API_KEY when omitted>
QUALITY_IMAGE_ENDPOINT_URL=<verified async image2 endpoint; do not use Rehdasu /v1/images/generations here>
QUALITY_IMAGE_RESULT_URL=<optional provider result endpoint>
QUALITY_IMAGE_MODEL=gpt-image-2
QUALITY_IMAGE_SIZE=768x1024
QUALITY_IMAGE_QUALITY=medium
QUALITY_IMAGE_TIMEOUT_MS=12000
```

The quality route is disabled unless `QUALITY_IMAGE_ENABLED=1`. The quality job is owner-scoped and idempotent. It stores only the provider task id, prompt metadata, status, and final CloudBase asset reference; it never stores API keys, base64 payloads, or temporary signed URLs.

Rehdasu's `/v1/images/generations` endpoint is synchronous and historically takes longer than the Mini Program request budget. `generateDreamImage` therefore returns `quality_sync_endpoint_unsupported` before making a paid request when that endpoint is configured. This limitation applies only to the optional quality channel; the verified Seedream 5.0 Lite synchronous path is the current production image channel.

### 语音识别（speechRecognize）

`speechRecognize` 调用腾讯云 ASR `SentenceRecognition`，需要 `TENCENT_ASR_SECRET_ID` /
`TENCENT_ASR_SECRET_KEY`。函数自己在 `ASR_REQUEST_TIMEOUT_MS`（15 秒）收口并返回
`recognize_timeout`，**控制台里这个函数的平台超时必须高于 15 秒**（建议 20 秒）；
低于它时函数会被平台直接掐断，客户端只能拿到一个没有原因的 `cloud_call_failed`，
线上就无法区分「ASR 慢」和「网络断」。部署或改动控制台配置后请复核该值。

客户端对 `cloud_call_failed` / `cloud_result_expired` / `client_timeout` /
`cloud_unavailable` / `recognize_timeout` 自动重试一次；识别类失败
（`empty_result` / `not_configured` / `too_long`）不重试。腾讯 ASR 的 `code`
会以 `providerErrorCode` 原样带回并进入 `voice_recognize_failed` 事件——
这是区分「音频有问题」和「账号/额度有问题」的唯一信号。

### AI 阶段画像

`profileMemory` 使用 `profile_snapshots` 保存自动发布的阶段画像、用户编辑、历史回溯和停用状态。它会复用 `INTERPRET_PROVIDER` / `DEEPSEEK_API_KEY` 等服务端配置；未配置或调用失败时生成朋友式确定性画像。生成成功的版本直接成为当前画像；只有 `status: confirmed`、`isCurrent: true` 且 `useInFutureReadings: true` 的画像会进入后续解读上下文。

用户编辑和历史回溯不会覆盖原快照，而是创建新的递增版本并移动 `profile_memory_state.currentSnapshotId`。历史旧草稿在读取时归入历史，不再作为待确认版本显示。

`profile_memory_state` stores the atomic next-version counter and single current-snapshot pointer. `deletion_jobs` stores idempotent privacy-deletion progress; keep a job until all share, asset, life-note, and derived-profile cleanup succeeds.

The newly created `profileMemory` function currently reports a 3-second timeout, which is sufficient for its deterministic fallback and state operations. If provider credentials are later added to this function for live AI portrait generation, raise its timeout above `PROFILE_MEMORY_TIMEOUT_MS` first.

## Deploy Cloud Functions

The eleven Mini Program cloud functions are expected. To redeploy them, run this from the repository root:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env ENVID \
  --project /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram \
  --remote-npm-install \
  --paths \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/cloudHealth \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/login \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/interpretDream \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/generateDreamImage \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/saveProfile \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/saveDream \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/trackEvent \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/createShareCard \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/getShareCard \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/speechRecognize \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/profileMemory \
  --lang zh
```

Then list deployed functions:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions list \
  --env ENVID \
  --project /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram \
  --lang zh
```

## Verification Flow

1. Run `npm run check:mini-release`.
2. Run `git diff --check`.
3. Run WeChat DevTools `preview` and scan the QR code on a real device.
4. Enter a new dream without a birth profile and confirm the basic interpretation completes; after optional birth details are saved, confirm later readings add the birth-rhythm lens.
5. Confirm `login` returns a cloud openid, not a local fallback id.
6. Run `cloudHealth` and confirm it returns `ok: true`. Latest verified run `1784446424263` returned `ok: true`.
7. Confirm `saveDream` first writes the raw dream with `status: pending`, then updates the same `localId` after interpretation.
8. Navigate manually to `/pages/diagnostics/index` and confirm CloudBase health is `ok`; the default compile entry must remain `pages/home/index`.
9. Call `interpretDream` with `{ healthCheck: true }` and confirm AI provider configuration. Before AI env setup it should show `provider: cloudbase-static` and `providerConfigured: false`; after setup it should show `provider: deepseek` or `provider: openai-compatible` and `providerConfigured: true`.
10. After `providerConfigured: true`, tap `AI SMOKE TEST` once on the diagnostics page and confirm it returns `ok: true` with the real provider. This sends one provider request.
11. Confirm `interpretDream` returns a result and blocks unsafe dream text. Before AI env setup, confirm it returns a retryable `ai_provider_error` without `result`. After configuring a real provider, confirm the returned provider is `deepseek` or `openai-compatible`.
12. Confirm `dream_entries` stores `dreamFacts`, `interpretationMeta`, and each submitted feedback value; then verify deletion removes only the current user's matching `localId`.
13. Confirm result-page Canvas generation stays local until the user explicitly prepares sharing, and that `createShareCard` stores no client-provided file id.
14. Confirm `createShareCard` writes to `share_pages`. Latest verified id: `8efe4ec36a2d157f00e7eb1f668ea360`.
15. Confirm `getShareCard` can read the share payload. Latest verified share id: `card-1781339519031-iph0sh`.
16. Confirm WeChat share path opens `/pages/share/index?id=...` on another device or clean session.
17. Confirm `trackEvent` writes funnel events to `events`. Latest verified inserted count: `1`.
18. Trigger an automatic portrait refresh, edit it, pause/resume future use, and restore an earlier version; verify `profile_snapshots` keeps every version and only the current enabled portrait is used by a later interpretation.

## Known MVP Limits

- `interpretDream` has a real AI provider boundary and static fallback. The current CloudBase environment has working DeepSeek and image-provider credentials; rotate/audit those server-side credentials before a public launch and never copy them into client source.
- `interpretDream` and `generateDreamImage` are both active with 60-second platform timeouts. Recheck these values after future console or deployment changes; the former's provider request budget must remain below 60 seconds.
- Live non-cached image generation passed after the ownership/race fix with `nano-banana-fast` (811,786-byte JPG, 17.2-second provider latency), followed by successful source-dream and owned-asset cleanup. A nonexistent dream id was rejected before provider work, and deletion blocked subsequent life-note writes. Physical-device rendering and album-save permission still require QR acceptance.
- Content safety is currently a basic local/server regex gate. Production should add WeChat content security and provider-side moderation before wider launch.
- `generated_assets` is verified through `cloudHealth` and is used only for owner-scoped generated dream artwork. Share-card Canvas files stay local; `share_pages` stores only the server-built card-only payload and never stores a client-provided image file id.

### 阶段画像的版本闸（profileMemory generate）

`generate` 不再无条件发新版本。两道闸，命中任一即返回
`{ ok: true, unchanged: true, unchangedReason, snapshot }`——这是**正常结果，不是失败**，
客户端据此原样保留画像、不进失败态、不显示「已更新」。

1. **证据指纹**（`evidenceFingerprint`，存在快照的 `sourceFingerprint` 字段）：
   喂给画像的东西（基础资料、梦、生活记录）一个字没变时直接返回，**连供应商调用
   都不发起**。缺这个字段的历史快照会走正常生成，不会被误判成无变化。
   `unchangedReason: 'evidence_unchanged'`。
2. **结构化断言**（`traits` + `themes` + `realLifeContext` 逐条相同）：证据变了但
   模型说的还是同一件事时，就地刷新溯源与指纹，不动版本号。
   `unchangedReason: 'claims_unchanged'`。旧快照没有这些字段时才退回到正文字面
   相似度（`PORTRAIT_SAME_TEXT_SIMILARITY = 0.9`，`unchangedReason: 'text_unchanged'`）。

只在**完全相同**时才抑制，不设中间阈值：失败代价不对称——多一个版本号只是难看，
把一次真实变化吞掉会让用户觉得画像根本不长进，那正好摧毁历史时间轴和「画像更新
了」这两个功能的全部价值。判不准就发版。

客户端点「重新梳理」会传 `force: true`：跳过闸①（用户明确要一次新解读，即使证据
没变也真的跑一次生成），但仍要过闸②。旧模板文案（`isMetaSummary`）的迁移路径不受
任何抑制。游离旧草稿的归档在三条路径上都会执行，与发不发版本无关。

线上观测：客户端每次被抑制都会上报 `profile_portrait_unchanged`，带
`reason` 与 `forced`。**上线后先看这个事件的分布**——如果 `claims_unchanged` 长期占
绝大多数且用户版本号几乎不动，说明闸②过紧，要放宽而不是收紧。
