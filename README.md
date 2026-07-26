# Oneiro

Oneiro is a private dream-memory product for WeChat Mini Program. It saves the raw dream first, offers cultural-symbolic, psychological, personal and optional birth-rhythm perspectives, and gradually builds a user-controlled personal dream universe. Current implementation status is maintained in [`PROJECT_PROGRESS.md`](PROJECT_PROGRESS.md).

## Current Direction

The current product promise is: "It does not predict your fate, but it will increasingly understand your dreams."

- A dream can be written and interpreted without profile data. Birth details are optional and add a separate birth-rhythm perspective when available.
- Raw dreams are saved before AI runs, so provider failure does not lose the record.
- Results separate dream narrative, cultural symbolism, psychological perspective and personal connection. The user may answer one question to generate a refined final card, or continue in bounded `聊聊这个梦` conversation.
- Dream cards and generated art remain as private collectibles and privacy-safe sharing artifacts; exports use image-led 3:4 composition.
- `我的资料` is now a personal memory center. The system quietly extracts high-confidence reality signals and automatically publishes an editable current portrait; users can correct it, pause future use, or restore an earlier version. Extracted real-life fragments remain viewable, correctable, and deletable.
- The private deck shows recurring people, symbols, emotions and places, plus stage observations, a monthly primary card and evidence-based archetype artifacts.
- A deterministic birth-rhythm calculation remains available as an optional cultural lens. It is not a prerequisite for the basic flow.

## WeChat Mini Program Direction

Oneiro is WeChat Mini Program-first. The Vite web app remains a legacy prototype and local acceptance harness, while `miniprogram/` contains the active product implementation.

Current Mini Program scope:

- Dream writing and raw-first interpretation without a profile gate.
- CloudBase interpretation, storage, analytics, deletion, image generation, and card-only sharing.
- Grounded single-dream result with structured facts and bounded dream chat.
- Personal memory center with optional birth data, an automatically published editable portrait, pause controls, source correction, and version history.
- Private dream deck with cross-dream pattern summaries, monthly primary card, collectible card and full-reading exports.

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
6. The frontend calls `POST /api/generate-image` with the condensed event, emotion-led palette, and asymmetric composition plan in `DreamResult.image_prompt`.
7. The backend returns an image URL, or falls back when configured.
8. The frontend updates the dream card image and supports 9:16 PNG export.

## Image Generation

Image generation is now routed through the backend API instead of being hardcoded in the frontend.

The shared visual contract is documented in [`docs/design/ONEIRO_DREAM_IMAGE_SYSTEM_V1.md`](docs/design/ONEIRO_DREAM_IMAGE_SYSTEM_V1.md): high-saturation rough screenprint/Risograph artwork, dynamic emotion palettes, simplified figures, one dominant event, asymmetric composition, and text-free `3:4` inner art. The Mini Program uses the full structured `visual_plan`; the legacy web endpoint applies the same default style to its condensed prompt.

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
  "image_prompt": "English visual plan: main event, emotion, selected elements, asymmetric composition and dynamic 4-6 ink palette",
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
