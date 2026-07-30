# Oneiro AI Provider Runbook

This runbook covers the last manual CloudBase steps required before the Mini Program can use a real AI interpretation provider.

## Current Verified Baseline

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment: `cloud1-d9gb0sjvg6a8d9864`
- Cloud function: `interpretDream`
- Current verified runtime provider: `deepseek` (`deepseek-v4-flash`)
- Current verified CloudBase function timeout from DevTools CLI: `60` seconds
- Current safe provider health check:

```json
{
  "provider": "deepseek",
  "providerConfigured": true,
  "hasApiKey": true,
  "model": "deepseek-v4-flash",
  "requestTimeoutMs": 30000,
  "fallbackProvider": "none"
}
```

## Configure DeepSeek

In the WeChat CloudBase console, open environment `cloud1-d9gb0sjvg6a8d9864`, then open cloud function `interpretDream`.

Set the function timeout to:

```text
60 seconds
```

Set these cloud function environment variables:

```text
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=<rotated-production-key>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERPRET_TIMEOUT_MS=30000
```

There is no local semantic fallback or strict-mode switch. Provider failures return a retryable error without a generated result; the original dream stays saved for a later retry.

## Configure OpenAI-Compatible Provider

Use this only if DeepSeek is not the production provider.

```text
INTERPRET_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=<provider-key>
OPENAI_COMPATIBLE_BASE_URL=https://example.com/v1
OPENAI_COMPATIBLE_MODEL=<model-name>
INTERPRET_TIMEOUT_MS=30000
```

Compatibility aliases accepted by the cloud function:

```text
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
AI_API_KEY
AI_BASE_URL
AI_MODEL
```

## Verify Provider Configuration

After saving CloudBase function configuration, call:

```js
wx.cloud.callFunction({
  name: 'interpretDream',
  data: { healthCheck: true }
});
```

From Mini Program code or automation that imports the CloudBase adapter, use the wrapper:

```js
cloudBase.aiHealth(function (health) {
  console.log(health.provider, health.providerConfigured);
});
```

You can also open the hidden Mini Program diagnostics page in WeChat Developer Tools:

```text
/pages/diagnostics/index
```

The project intentionally keeps the default compile entry on `pages/home/index`; navigate to the hidden diagnostics route manually when needed.

Expected DeepSeek result:

```json
{
  "provider": "deepseek",
  "providerConfigured": true,
  "hasApiKey": true,
  "model": "deepseek-chat",
  "baseUrlHost": "api.deepseek.com",
  "requestTimeoutMs": 30000
}
```

Expected OpenAI-compatible result:

```json
{
  "provider": "openai-compatible",
  "providerConfigured": true,
  "hasApiKey": true,
  "requestTimeoutMs": 30000
}
```

The health check never returns the API key value.

## Verify Provider Smoke Test

After `providerConfigured` is true, run one explicit smoke test from the diagnostics page by tapping `AI SMOKE TEST`, or call:

```js
cloudBase.aiSmokeTest(function (result) {
  console.log(result.ok, result.provider, result.title);
});
```

Expected successful provider smoke test:

```json
{
  "ok": true,
  "provider": "deepseek",
  "providerConfigured": true,
  "fallback": false
}
```

The smoke test sends one standard safe dream to the provider and checks that the response can be normalized into the Mini Program dream-card schema. Run it intentionally because it may consume one provider request. The diagnostics page asks for confirmation before sending the request once `providerConfigured` is true.

## Verify Real Interpretation

Run a normal Mini Program flow:

1. Open the Mini Program preview in WeChat Developer Tools or on a real device.
2. Enter profile nickname and birth date.
3. Write or use the sample dream.
4. Generate a dream card.
5. Confirm the generated dream record has `interpretationSource: cloud`.
6. Confirm `interpretationProvider` is `deepseek` or `openai-compatible`.
7. Confirm result copy feels specific to the submitted dream, not generic fallback copy.
8. Confirm share-card generation still returns `/pages/share/index?id=...`.

If `interpretationError` is `ai_provider_error`, the cloud function reached the provider boundary but did not receive a valid model result. The original dream remains saved and can be retried.

## Failure Triage

`providerConfigured: false`

- `INTERPRET_PROVIDER` is still `static`, missing, unsupported, or the matching API key variable is missing.
- Confirm the variables are set on the `interpretDream` function, not only globally in another console area.

`hasApiKey: false`

- The provider variable is set, but the key variable is missing or empty.
- For DeepSeek, set `DEEPSEEK_API_KEY`.
- For OpenAI-compatible providers, set `OPENAI_COMPATIBLE_API_KEY` or one of the accepted aliases.

`providerConfigured: true` but dreams remain pending with `ai_provider_error`

- Check provider base URL, model name, quota, network access, and JSON response format support.
- Confirm `INTERPRET_TIMEOUT_MS` is lower than or equal to the CloudBase function timeout.
- Recheck the CloudBase function timeout if a future deployment lowers it below `INTERPRET_TIMEOUT_MS`; the current verified timeout is 60 seconds.

`providerConfigured: true` but generated dreams fail instead of falling back

- Check provider credentials, outbound access, timeout, and response JSON validity.

## Local Safety Checks

Before and after provider setup, run:

```bash
npm run check:mini-release
```

`check:mini-release` runs AI readiness, CloudBase readiness, Mini Program MVP contract, dream-result contract, and TypeScript checks. The AI readiness step verifies that Mini Program runtime files do not contain server-side AI API key markers or likely key literals.
