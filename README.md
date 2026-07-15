# Oneiro

Oneiro is a private dream-memory product for WeChat Mini Program. It saves the raw dream first, extracts verifiable dream facts, offers bounded interpretations the user can reject, and gradually builds user-controlled cross-dream memory. The current source of truth is [`V0_2_DEVELOPMENT_PLAN.md`](V0_2_DEVELOPMENT_PLAN.md).

## V0.2 Direction

The current product promise is: "It does not predict your fate, but it will increasingly understand your dreams."

- A dream can be written before opening the profile page, but interpretation requires birth date and birth time because the metaphysical lens is enabled by default.
- Raw dreams are saved before AI runs, so provider failure does not lose the record.
- Results lead with the dream image/card, then grounded facts and possible real-life connections, followed by a bounded `聊聊这个梦` conversation.
- Dream cards and generated art remain as private collectibles and privacy-safe sharing artifacts; exports use image-led 3:4 composition.
- Birth details live under `我的资料`; missing date/time/city pauses interpretation and preserves the draft until the profile is completed. The city is converted to coordinates for true-solar-time correction.
- A deterministic bazi chart is shown as a bounded cultural lens. Astrology, daily fortune, fate prediction, public community, subscriptions, and coins are outside V0.2.

## WeChat Mini Program Direction

Oneiro is WeChat Mini Program-first. The Vite web app remains a legacy prototype and local acceptance harness, while `miniprogram/` contains the active product implementation.

Current Mini Program scope:

- Dream writing before profile completion, followed by profile-gated interpretation and raw-first persistence.
- CloudBase interpretation, storage, analytics, deletion, image generation, and card-only sharing.
- Grounded single-dream result with structured facts and bounded dream chat.
- Private profile with required birth date/time/city for interpretation and true-solar-time correction.
- Private local/cloud archive with collectible card and full-reading exports.

Open `miniprogram/` in WeChat Developer Tools to preview the Mini Program. Deployment and release details are under `docs/`.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run the local dream result contract checks:

```bash
npm run check:dream
```

Run TypeScript checks across the frontend, API handlers, and scripts:

```bash
npm run typecheck
```

Open the local acceptance path to exercise the full frontend flow without provider calls:

```text
http://127.0.0.1:5173/?acceptance=1
```

For mobile visual QA, use a 402 x 874 viewport to approximate an iPhone Pro CSS viewport.

The static frontend build should pass even without a local `.env` file. Real API calls require the environment variables below.

## Environment

Copy `.env.example` to `.env` for local API work and fill in the real values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `/api/interpret` | Calls Gemini for dream interpretation. |
| `GEMINI_MODEL` | `/api/interpret` | Gemini model. Defaults to `gemini-2.5-flash`. |
| `INTERPRET_PROVIDER` | `/api/interpret` | Interpretation provider. Defaults to `gemini`; set to `deepseek` to use DeepSeek. |
| `DEEPSEEK_API_KEY` | `/api/interpret` | Calls DeepSeek for dream interpretation when `INTERPRET_PROVIDER=deepseek`. |
| `DEEPSEEK_BASE_URL` | `/api/interpret` | DeepSeek-compatible chat completions base URL. Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_MODEL` | `/api/interpret` | DeepSeek model. Defaults to `deepseek-chat`. |
| `OPENAI_API_KEY` | `/api/generate-image` | Calls OpenAI Images for dream image generation. |
| `OPENAI_IMAGE_BASE_URL` | `/api/generate-image` | OpenAI-compatible image API base URL. Defaults to `https://api.openai.com/v1`. |
| `OPENAI_IMAGE_ENDPOINT_URL` | `/api/generate-image` | Optional full image endpoint for third-party APIs with nonstandard paths such as `/v1/draw/completions`. |
| `IMAGE_PROVIDER` | `/api/generate-image` | Image provider selector. Defaults to `openai`; set to `pollinations` only for fallback/dev. |
| `OPENAI_IMAGE_MODEL` | `/api/generate-image` | OpenAI image model. Defaults to `gpt-image-1.5`. |
| `OPENAI_IMAGE_SIZE` | `/api/generate-image` | Generated image size. Defaults to `1024x1536`, matching the portrait dream card. |
| `OPENAI_IMAGE_QUALITY` | `/api/generate-image` | Generated image quality. Defaults to `low` for faster, cheaper MVP calls. |
| `OPENAI_IMAGE_TIMEOUT_MS` | `/api/generate-image` | Server-side timeout before image fallback. Defaults to `90000`. |
| `IMAGE_FALLBACK_PROVIDER` | `/api/generate-image` | Fallback provider when OpenAI-compatible image generation fails or times out. Defaults to `pollinations`. |
| `SUPABASE_URL` | `/api/interpret`, `/api/history` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/interpret`, `/api/history` | Server-side Supabase writes and reads. Never expose this in frontend code. |
| `DATABASE_URL` | Drizzle config and `api/_lib/db` | Reserved for direct Postgres/Drizzle migrations or future database access. |

`OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only. Do not prefix them with `VITE_`, do not import them into React code, and do not expose them to the browser.

If the Gemini project is denied model access in production, set:

```env
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
```

## Current MVP Flow

1. The user enters profile fields in the React frontend.
2. The user describes a dream.
3. The frontend calls `POST /api/interpret` with `dreamText` and `userInfo`.
4. The backend calls the configured interpretation provider and returns a `DreamResult`.
5. The frontend renders the text result immediately and stores it locally.
6. The frontend calls `POST /api/generate-image` with `DreamResult.image_prompt` in the background.
7. The backend returns an image URL, or falls back when configured.
8. The frontend updates the dream card image and supports 9:16 PNG export.

## Image Generation

Image generation is now routed through the backend API instead of being hardcoded in the frontend.

Current provider:

- `openai`
- Implemented in `api/generate-image.ts`
- Calls OpenAI Images and returns a browser-loadable `imageUrl`
- The default OpenAI response is base64 image data, wrapped as a `data:image/png;base64,...` URL
- OpenAI-compatible third-party gateways can be used by setting `OPENAI_IMAGE_BASE_URL` and `OPENAI_IMAGE_MODEL`
- Third-party image gateways with custom paths can set `OPENAI_IMAGE_ENDPOINT_URL`, for example `https://example.com/v1/draw/completions`
- Streaming third-party image responses are supported when the final event includes `url`, `results[0].url`, or `data[0].b64_json`

Fallback provider:

- Set `IMAGE_PROVIDER=pollinations` to temporarily use the old Pollinations URL provider.
- Keep the frontend calling `/api/generate-image` so provider changes stay backend-only.

Example third-party image gateway configuration:

```env
OPENAI_API_KEY=sk-...
IMAGE_PROVIDER=openai
OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/api/generate
OPENAI_IMAGE_MODEL=nano-banana-fast
OPENAI_IMAGE_SIZE=768x1024
OPENAI_IMAGE_ASPECT_RATIO=768x1024
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_TIMEOUT_MS=90000
IMAGE_FALLBACK_PROVIDER=pollinations
```

## API Contracts

### `POST /api/interpret`

Interprets a dream and attempts to store the result in Supabase.

Request:

```json
{
  "dreamText": "I was walking through a flooded library.",
  "userInfo": {
    "nickname": "Runtu",
    "birthDate": "1998-01-01",
    "birthTime": "08:30",
    "birthPlace": "Shanghai"
  }
}
```

Response:

```json
{
  "title": "梦标题",
  "image": "梦境画面描述",
  "emotional_weather": "梦的情绪天气",
  "symbols": ["核心象征"],
  "underneath": "潜意识解读",
  "echo": "占星共鸣",
  "mirror": "现实映射",
  "integration_question": "醒后整合问题",
  "one_small_act": "今日小行动",
  "image_prompt": "English visual prompt",
  "omens": {
    "lucky_color": "#aabbcc",
    "lucky_color_name": "颜色名",
    "lucky_number": 7,
    "reason": "解释"
  },
  "sound_config": {
    "theme": "liquid",
    "drone_hz": 60,
    "pulse_rate": 0.15,
    "texture_intensity": 0.3
  }
}
```

### `POST /api/generate-image`

Generates a dream image URL from an image prompt.

Request:

```json
{
  "prompt": "surreal moonlit river, symbolic key, ink texture"
}
```

Response:

```json
{
  "imageUrl": "data:image/png;base64,...",
  "provider": "openai",
  "model": "gpt-image-1.5"
}
```

### `GET /api/health`

Basic API health check.

Response:

```json
{
  "ok": true
}
```

### `GET /api/history`

Returns the latest 20 dream records from Supabase. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### `POST /api/history`

Stores a dream record in Supabase. Requires `dreamText` and `result`.

Request:

```json
{
  "dreamText": "I saw a silver door.",
  "astroInfo": {
    "todayDate": "2026-05-02",
    "lunarPhase": "Waxing moon",
    "majorTransits": "Venus trine Neptune"
  },
  "result": {}
}
```

## Development Checklist

- Work on `codex-optimize-dream-interpretation` for the current dream interpretation upgrade.
- Run `npm install` after cloning.
- Run `npm run check:dream` after changing the dream result schema or normalization.
- Run `npm run typecheck` after touching frontend, API, or scripts.
- Use `/?acceptance=1` to verify the card flow without spending provider calls.
- Verify the public-sharing path on a 402 x 874 mobile viewport: profile, sample dream, immediate text result, async image fill, card flip, PNG export, local recent dream list.
- Test image failure by temporarily using a bad image key or endpoint; the text dream card should still render and export.
- Run `npm run build` before committing.
- Keep `.env` local and untracked.
- Keep OpenAI and service role keys server-side only.
- Missing local environment variables should not block `npm run build`, but real API calls will fail until keys are configured.
- Current Vercel deployments are protected by Vercel Authentication. A public `401 Authentication Required` from `/api/health` means deployment protection is active, not necessarily that the app is down.

## Privacy Notes

- The public-sharing MVP stores recent dreams and profile data only in the current browser's `localStorage`.
- No account, login, or cross-device sync is used in the current frontend history experience.
- API calls still send the submitted dream and profile fields to the configured interpretation provider.
- Do not store real secrets in frontend code or commit local `.env` files.

## Notes

- `api/_lib/db` and `drizzle.config.ts` are present for Drizzle/Postgres usage, but current API handlers use `@supabase/supabase-js` directly.
- `users` exists in the schema, but the current MVP does not create or link user records during dream interpretation.
- Do not run `npm audit fix --force` casually; it may introduce breaking dependency changes.
