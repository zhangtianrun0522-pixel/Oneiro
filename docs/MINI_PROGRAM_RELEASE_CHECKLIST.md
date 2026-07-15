# Mini Program Release Checklist

Use this checklist when moving the Oneiro WeChat Mini Program from the current CloudBase-ready MVP to a real-AI preview build.

## Fixed Project State

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment: `cloud1-d9gb0sjvg6a8d9864`
- Cloud function for AI: `interpretDream`
- Cloud function for image generation: `generateDreamImage`
- Hidden diagnostics route: `/pages/diagnostics/index`
- DevTools compile condition: `AI 诊断页`
- Latest local release check: `npm run check:mini-release`
- Latest verified preview size: `59.5 KB / 60,963 bytes`

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

Set function timeout to at least:

```text
20 seconds
```

For DeepSeek:

```text
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=<rotated-production-key>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERPRET_TIMEOUT_MS=18000
```

Keep keys in CloudBase function environment variables only. Do not put provider keys in Mini Program files, `project.config.json`, or local storage.

For AI card images, configure `generateDreamImage`:

```text
IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=<image-provider-key>
OPENAI_IMAGE_ENDPOINT_URL=<provider-images-endpoint>
OPENAI_IMAGE_MODEL=nano-banana-fast
OPENAI_IMAGE_SIZE=768x1024
OPENAI_IMAGE_ASPECT_RATIO=768x1024
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_TIMEOUT_MS=55000
```

## Diagnostics Verification

Open the `AI 诊断页` compile condition, or navigate to:

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

1. First run can enter dream recording without opening the profile page; submitting for interpretation prompts for birth date/time when missing.
2. After the profile is completed, the original dream text resumes and creates a `pending` `dream_entries` record before AI completes.
3. Provider failure or safety blocking leaves the raw dream visible in the archive.
4. Successful results store structured facts plus schema, prompt, model, source, and provider metadata.
5. Result page leads with the dream image/card, then dream facts, the bounded `命理镜头`, and possible real-life connections; no rating panel or fate-prediction section appears.
6. `聊聊这个梦` opens a bounded conversation, returns a relevant reply, enforces the six-turn limit, and persists messages with the dream.
7. `我的资料` saves nickname and birth date/time/city, resolves the city for true-solar-time correction, and never exposes profile data in shared cards.
8. Deleting a dream removes it locally and from the current user's `dream_entries` records.
9. The collectible export is 3:4 and image-led; the compact full-reading export has no large blank tail.
10. Share route is `/pages/share/index?id=...` and opens in a clean session or another device.
11. Raw-save, interpretation, feedback, deletion, and sharing events write to `events`.

## Stop Conditions

Do not treat the build as real-AI ready if any of these are true:

- `interpretDream` timeout still reports `3`.
- Diagnostics shows `providerConfigured: false`.
- Smoke test returns `cloudbase-static`, `static_provider`, or `cloudbase-static-fallback`.
- Result card keeps showing only the fallback symbolic card art after `generateDreamImage` is configured.
- Normal dream records still show `interpretationProvider: cloudbase-static`.
- Cross-session share path cannot read its CloudBase payload.
