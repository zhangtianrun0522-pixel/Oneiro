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
INTERPRET_TIMEOUT_MS=30000
```

OpenAI-compatible providers are also supported through:

```text
INTERPRET_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=<set-in-cloudbase-only>
OPENAI_COMPATIBLE_BASE_URL=https://example.com/v1
OPENAI_COMPATIBLE_MODEL=<model-name>
```

Compatibility aliases are also accepted for the OpenAI-compatible path: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, or `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.

Keep provider keys server-side in CloudBase only. Do not put them in Mini Program source files, `project.config.json`, or frontend storage. If the provider is unavailable, missing a key, times out, or returns malformed JSON, `interpretDream` returns `provider: cloudbase-static-fallback` with the same dream-card schema so the user flow does not break. Set `INTERPRET_STRICT_AI=1` only when you intentionally want provider failures to stop cloud interpretation and let the Mini Program local fallback take over.

The deployed `interpretDream` function now reports a 60-second timeout, safely above the configured 30-second provider request budget.

`interpretDream` also supports a safe provider health check:

```js
wx.cloud.callFunction({
  name: 'interpretDream',
  data: { healthCheck: true }
});
```

The response intentionally does not expose secrets. It reports `provider`, `providerConfigured`, `hasApiKey`, `model`, `baseUrlHost`, `requestTimeoutMs`, `strictAi`, and `fallbackProvider`. Before real AI setup it should report `provider: cloudbase-static` and `providerConfigured: false`. After real AI setup it should report `provider: deepseek` or `provider: openai-compatible` and `providerConfigured: true`.

## Real AI Image Provider

`interpretDream` now returns a structured `result.visual_plan`. `generateDreamImage` re-normalizes that plan against the owner-scoped stored dream, selects an emotion palette and non-fixed composition, compiles the final `oneiro-riso-dream-v1.3` prompt, uploads the generated bitmap under `generated-dream-images/`, and stores the full prompt, model, normalized plan, format/dimensions, and quality record in `generated_assets`.

Configure these environment variables on the `generateDreamImage` cloud function:

```text
IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=<set-in-cloudbase-only>
OPENAI_IMAGE_ENDPOINT_URL=<provider-images-endpoint>
OPENAI_IMAGE_MODEL=nano-banana-fast
OPENAI_IMAGE_SIZE=768x1024
OPENAI_IMAGE_ASPECT_RATIO=768x1024
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_TIMEOUT_MS=55000
```

For the GRSAI image endpoint, use `OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/api/generate` or the domestic endpoint `https://grsai.dakka.com.cn/v1/api/generate`. The current Mini Program default is `OPENAI_IMAGE_MODEL=nano-banana-fast` with `OPENAI_IMAGE_ASPECT_RATIO=768x1024` for a fast `3:4` inner illustration. For higher quality experiments, change only the model env var to `nano-banana`, `nano-banana-2`, or `nano-banana-pro`. The cloud function maps old `gpt-image-1.5` and `gpt-image-2` env values to `nano-banana-fast` so stale configuration does not keep using the previous slow image model. The cloud function supports the documented `results[0].url` response and can poll `/v1/api/result?id=...` when the first response is asynchronous. If the provider uses the standard OpenAI images endpoint, `OPENAI_IMAGE_ENDPOINT_URL` can be omitted and `OPENAI_IMAGE_BASE_URL` can be used instead. Keep image keys server-side in CloudBase only.

The new visual system must pass the nine-card stability test before deployment: calm, anxious, and surreal dreams, three independent generations each. Pixel-level semantic checks such as unwanted text, focal clarity, face complexity, actual saturation, and thumbnail readability are currently recorded as `requires_vision_review`; only binary format and output geometry are enforced automatically.

The deployed `generateDreamImage` function now reports the 60-second platform maximum; keep `OPENAI_IMAGE_TIMEOUT_MS=55000` below that limit.

### Progressive image2 quality route

The Mini Program keeps the existing `nano-banana-fast` call as the immediate image path. After that image is available, the result page submits a short `startQuality` action to `generateDreamImage` and polls `pollQuality` while the user can continue reading. A completed `gpt-image-2` asset replaces the fast image; a failed or unavailable quality job leaves the fast image untouched.

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

Rehdasu's `/v1/images/generations` endpoint is synchronous and historically takes longer than the Mini Program request budget. `generateDreamImage` therefore returns `quality_sync_endpoint_unsupported` before making a paid request when that endpoint is configured. Rehdasu's tested `/v1/draw/completions` endpoint returned 404, so keep production on `nano-banana-fast` until a verified asynchronous image endpoint is available.

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
11. Confirm `interpretDream` returns a result and blocks unsafe dream text. Latest verified provider before AI env setup: `cloudbase-static`. After configuring a real provider, confirm the returned provider is `deepseek` or `openai-compatible`; if it returns `cloudbase-static-fallback`, check the provider env vars and outbound network access.
12. Confirm `dream_entries` stores `dreamFacts`, `interpretationMeta`, and each submitted feedback value; then verify deletion removes only the current user's matching `localId`.
13. Confirm result-page Canvas generation stays local until the user explicitly prepares sharing, and that `createShareCard` stores no client-provided file id.
14. Confirm `createShareCard` writes to `share_pages`. Latest verified id: `8efe4ec36a2d157f00e7eb1f668ea360`.
15. Confirm `getShareCard` can read the share payload. Latest verified share id: `card-1781339519031-iph0sh`.
16. Confirm WeChat share path opens `/pages/share/index?id=...` on another device or clean session.
17. Confirm `trackEvent` writes funnel events to `events`. Latest verified inserted count: `1`.
18. Trigger an automatic portrait refresh, edit it, pause/resume future use, and restore an earlier version; verify `profile_snapshots` keeps every version and only the current enabled portrait is used by a later interpretation.

## Known MVP Limits

- `interpretDream` has a real AI provider boundary and static fallback. The current CloudBase environment has working DeepSeek and image-provider credentials; rotate/audit those server-side credentials before a public launch and never copy them into client source.
- `interpretDream` and `generateDreamImage` are both active with 60-second timeouts. Recheck these values after future console or deployment changes.
- Live non-cached image generation passed after the ownership/race fix with `nano-banana-fast` (811,786-byte JPG, 17.2-second provider latency), followed by successful source-dream and owned-asset cleanup. A nonexistent dream id was rejected before provider work, and deletion blocked subsequent life-note writes. Physical-device rendering and album-save permission still require QR acceptance.
- Content safety is currently a basic local/server regex gate. Production should add WeChat content security and provider-side moderation before wider launch.
- `generated_assets` is verified through `cloudHealth` and is used only for owner-scoped generated dream artwork. Share-card Canvas files stay local; `share_pages` stores only the server-built card-only payload and never stores a client-provided image file id.
