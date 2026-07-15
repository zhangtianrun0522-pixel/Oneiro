# CloudBase Deployment Checklist

This checklist is for the WeChat Mini Program MVP under `miniprogram/`.

## Current Verified State

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment id: `cloud1-d9gb0sjvg6a8d9864`
- WeChat DevTools `preview` passes with package size `59.5 KB / 60,963 bytes`.
- Local release checks pass with `npm run check:mini-release`.
- Cloud function source folders exist and have been deployed to the real CloudBase environment.
- `cloudHealth` exists to create/check required collections, write a health event, upload a healthcheck asset under `share-cards/`, and record asset metadata.
- Latest verified `cloudHealth` run: `1781339229268`.
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
- `events`
- `share_pages`
- `generated_assets`

For MVP testing, keep writes restricted to the current user's openid where applicable. `share_pages` needs public read access only for share-safe fields, not raw dream text.

## Verified Storage

Storage access has been verified for:

```text
share-cards/
```

`cloudHealth` uploaded `share-cards/healthcheck-1781339229268.txt`. Canvas share cards are uploaded by the Mini Program through `wx.cloud.uploadFile` and then referenced by `createShareCard`.

## Real AI Interpretation Provider

`interpretDream` is now provider-ready. By default it runs in safe static mode so the Mini Program keeps working even before production API keys are configured:

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
INTERPRET_TIMEOUT_MS=18000
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

Before enabling a real provider, increase the CloudBase function timeout for `interpretDream` in the WeChat CloudBase console. The latest CLI info check still reports `timeout: 3`, which is fine for static fallback but too short for many real LLM calls. Use at least 20 seconds for first AI verification, matching or exceeding `INTERPRET_TIMEOUT_MS`.

`interpretDream` also supports a safe provider health check:

```js
wx.cloud.callFunction({
  name: 'interpretDream',
  data: { healthCheck: true }
});
```

The response intentionally does not expose secrets. It reports `provider`, `providerConfigured`, `hasApiKey`, `model`, `baseUrlHost`, `requestTimeoutMs`, `strictAi`, and `fallbackProvider`. Before real AI setup it should report `provider: cloudbase-static` and `providerConfigured: false`. After real AI setup it should report `provider: deepseek` or `provider: openai-compatible` and `providerConfigured: true`.

## Real AI Image Provider

`generateDreamImage` creates the visual dream-card image from `interpretDream.result.image_prompt`, uploads the generated bitmap to CloudBase storage under `generated-dream-images/`, and returns a temporary URL for the Mini Program card surface.

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

For the GRSAI image endpoint, use `OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/api/generate` or the domestic endpoint `https://grsai.dakka.com.cn/v1/api/generate`. The current Mini Program default is `OPENAI_IMAGE_MODEL=nano-banana-fast` with `OPENAI_IMAGE_ASPECT_RATIO=768x1024` for a faster tarot illustration panel. For higher quality experiments, change only the model env var to `nano-banana`, `nano-banana-2`, or `nano-banana-pro`. The cloud function maps old `gpt-image-1.5` and `gpt-image-2` env values to `nano-banana-fast` so stale configuration does not keep using the previous slow image model. The cloud function supports the documented `results[0].url` response and can poll `/v1/api/result?id=...` when the first response is asynchronous. If the provider uses the standard OpenAI images endpoint, `OPENAI_IMAGE_ENDPOINT_URL` can be omitted and `OPENAI_IMAGE_BASE_URL` can be used instead. Keep image keys server-side in CloudBase only.

Before testing real image generation, set the CloudBase function timeout for `generateDreamImage` to the platform maximum shown in WeChat Developer Tools. The current configuration dialog allows 1-60 seconds, so use `60` seconds and keep `OPENAI_IMAGE_TIMEOUT_MS=55000`.

## Deploy Cloud Functions

The nine MVP cloud functions have been deployed. To redeploy them, run this from the repository root:

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
4. Enter a new dream before creating a birth profile, confirm `profile_required`, then save birth date/time/city and resume the original dream.
5. Confirm `login` returns a cloud openid, not a local fallback id.
6. Run `cloudHealth` and confirm it returns `ok: true`. Latest verified run `1781339229268` returned `ok: true`.
7. Confirm `saveDream` first writes the raw dream with `status: pending`, then updates the same `localId` after interpretation.
8. Open `/pages/diagnostics/index` or the `AI 诊断页` compile condition and confirm CloudBase health is `ok`.
9. Call `interpretDream` with `{ healthCheck: true }` and confirm AI provider configuration. Before AI env setup it should show `provider: cloudbase-static` and `providerConfigured: false`; after setup it should show `provider: deepseek` or `provider: openai-compatible` and `providerConfigured: true`.
10. After `providerConfigured: true`, tap `AI SMOKE TEST` once on the diagnostics page and confirm it returns `ok: true` with the real provider. This sends one provider request.
11. Confirm `interpretDream` returns a result and blocks unsafe dream text. Latest verified provider before AI env setup: `cloudbase-static`. After configuring a real provider, confirm the returned provider is `deepseek` or `openai-compatible`; if it returns `cloudbase-static-fallback`, check the provider env vars and outbound network access.
12. Confirm `dream_entries` stores `dreamFacts`, `interpretationMeta`, and each submitted feedback value; then verify deletion removes only the current user's matching `localId`.
13. Confirm result-page Canvas generation uploads a card image under `share-cards/`.
14. Confirm `createShareCard` writes to `share_pages`. Latest verified id: `8efe4ec36a2d157f00e7eb1f668ea360`.
15. Confirm `getShareCard` can read the share payload. Latest verified share id: `card-1781339519031-iph0sh`.
16. Confirm WeChat share path opens `/pages/share/index?id=...` on another device or clean session.
17. Confirm `trackEvent` writes funnel events to `events`. Latest verified inserted count: `1`.

## Known MVP Limits

- `interpretDream` has a real AI provider boundary and static fallback. The CloudBase environment still needs production provider keys configured and verified before launch.
- The latest `interpretDream` CloudBase function info still reports a 3-second timeout. Increase it in the CloudBase console before enabling real provider calls.
- `generateDreamImage` also needs CloudBase function timeout increased before real image generation. A 3-second default timeout is too short for image providers; use the 60-second platform maximum.
- Content safety is currently a basic local/server regex gate. Production should add WeChat content security and provider-side moderation before wider launch.
- `generated_assets` is verified through `cloudHealth`; result-page share-card uploads still store the share image file id in `share_pages` and can add richer asset metadata in the real image generation step.
