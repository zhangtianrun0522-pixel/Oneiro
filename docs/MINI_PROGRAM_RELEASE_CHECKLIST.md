# Mini Program Release Checklist

Use this checklist when moving the Oneiro WeChat Mini Program from the current CloudBase-ready MVP to a real-AI preview build.

## Fixed Project State

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment: `cloud1-d9gb0sjvg6a8d9864`
- Cloud function for AI: `interpretDream`
- Cloud function for image generation: `generateDreamImage`
- Hidden diagnostics route: `/pages/diagnostics/index`
- DevTools default compile entry: `pages/home/index` (diagnostics is opened manually)
- Latest local release check: `npm run check:mini-release`
- Latest verified preview size: `209.6 KB / 214,662 bytes`

## Before Configuring Real AI

Run from the repository root:

```bash
npm run check:mini-release
git diff --check
```

Confirm the Mini Program still previews with the real AppID:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram \
  --qr-format image \
  --qr-output /private/tmp/oneiro-preview.png \
  --info-output /private/tmp/oneiro-preview-info.json \
  --lang zh
```

## CloudBase Console Setup

In WeChat CloudBase console, open environment `cloud1-d9gb0sjvg6a8d9864` and function `interpretDream`.

Set function timeout to:

```text
60 seconds
```

For DeepSeek:

```text
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=<rotated-production-key>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERPRET_TIMEOUT_MS=45000
```

Keep keys in CloudBase function environment variables only. Do not put provider keys in Mini Program files, `project.config.json`, or local storage.

For AI card images, configure `generateDreamImage`:

```text
IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=<image-provider-key>
OPENAI_IMAGE_ENDPOINT_URL=<provider-images-endpoint>
OPENAI_IMAGE_MODEL=doubao-seedream-5-0-lite-260128
OPENAI_IMAGE_SIZE=1728x2304
OPENAI_IMAGE_ASPECT_RATIO=1728x2304
OPENAI_IMAGE_TIMEOUT_MS=55000
```

For the optional progressive image2 route, keep it disabled until the fast path has been verified on a real device. When ready, add these variables to the same function:

```text
QUALITY_IMAGE_ENABLED=1
QUALITY_IMAGE_API_KEY=<quality-image-provider-key>
QUALITY_IMAGE_ENDPOINT_URL=<async-image2-endpoint>
QUALITY_IMAGE_RESULT_URL=<optional-result-endpoint>
QUALITY_IMAGE_MODEL=gpt-image-2
QUALITY_IMAGE_SIZE=768x1024
QUALITY_IMAGE_QUALITY=medium
QUALITY_IMAGE_TIMEOUT_MS=12000
```

The quality route is background-polled and must not replace the fast image until the final CloudBase asset has downloaded successfully.

## Diagnostics Verification

Navigate manually to:

```text
/pages/diagnostics/index
```

Confirm:

- CloudBase ready is true.
- Cloud health is ok.
- `providerConfigured` becomes true after env setup.
- `hasApiKey` is true.
- Provider is `deepseek` or `openai-compatible`.
- `requestTimeoutMs` is less than or equal to the CloudBase function timeout.

Then tap `AI SMOKE TEST` once. It should ask for confirmation and return:

```json
{
  "ok": true,
  "provider": "deepseek",
  "providerConfigured": true,
  "fallback": false
}
```

## Real-Device MVP Verification

Scan the preview QR on a real device and verify:

1. First run can enter dream recording and complete the basic interpretation without opening or completing the profile page.
2. The original dream creates a `pending` `dream_entries` record before AI completes; optional birth details add the separate birth-rhythm lens without blocking the base flow.
3. Provider failure or safety blocking leaves the raw dream visible in the archive.
4. Successful results store structured facts plus schema, prompt, model, source, and provider metadata.
5. Result page leads with the dream image/card, then dream facts, the bounded `命理镜头`, and possible real-life connections; no rating panel or fate-prediction section appears.
6. `聊聊这个梦` opens a bounded conversation, returns a relevant reply, enforces the six-turn limit, and persists messages with the dream.
7. `我的资料` saves optional nickname/birth details and loads the AI memory center. High-confidence signals automatically refresh the current portrait without an extra confirmation step; the portrait can be edited, paused, and restored from version history, while extracted real-life fragments can be corrected or deleted.
8. The private deck loads cross-device CloudBase dreams and shows recurring people/symbols/emotions/places plus the monthly primary card.
9. Deleting a dream removes it locally, revokes its share, removes owned generated assets, invalidates derived memory, and rejects delayed writes.
10. The collectible export is 3:4 and image-led; the compact full-reading export has no large blank tail.
11. Share route is `/pages/share/index?id=...`, uses the separately rendered public cover, and opens in a clean session or another device without private reflection content.
12. Raw-save, interpretation, deletion, sharing, voice, and memory events write to `events`.

## Stop Conditions

Do not treat the build as real-AI ready if any of these are true:

- `interpretDream` keeps a `45`-`50` second provider request budget below the
  `60` second CloudBase platform timeout, while the Mini Program client waits
  up to `70` seconds for the result.
- Diagnostics shows `providerConfigured: false`.
- Smoke test returns the configured model provider, or a clear `static_provider` / provider error without a locally generated interpretation.
- Result card keeps showing only the fallback symbolic card art after `generateDreamImage` is configured.
- Normal dream records still show `interpretationProvider: cloudbase-static`.
- Cross-session share path cannot read its CloudBase payload.
