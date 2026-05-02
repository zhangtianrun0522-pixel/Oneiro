# Oneiro

Oneiro is a dream oracle MVP. The app collects a lightweight user profile, accepts a dream description, asks Gemini for a structured interpretation, generates a dream image through the backend image API, and renders an exportable dream card.

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
| `SUPABASE_URL` | `/api/interpret`, `/api/history` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/interpret`, `/api/history` | Server-side Supabase writes and reads. Never expose this in frontend code. |
| `DATABASE_URL` | Drizzle config and `api/_lib/db` | Reserved for direct Postgres/Drizzle migrations or future database access. |

`SUPABASE_SERVICE_ROLE_KEY` must stay server-side only. Do not prefix it with `VITE_`, do not import it into React code, and do not expose it to the browser.

## Current MVP Flow

1. The user enters profile fields in the React frontend.
2. The user describes a dream.
3. The frontend calls `POST /api/interpret` with `dreamText` and `userInfo`.
4. The backend calls Gemini and returns a `DreamResult`.
5. The frontend calls `POST /api/generate-image` with `DreamResult.image_prompt`.
6. The backend returns an image URL.
7. The frontend renders the dream card and supports PNG export.

## Image Generation

Image generation is now routed through the backend API instead of being hardcoded in the frontend.

Current provider:

- `pollinations`
- Implemented in `api/generate-image.ts`
- Returns a generated image URL, not stored image bytes

Planned provider direction:

- Replace Pollinations with OpenAI Images in a later change.
- Keep the frontend calling `/api/generate-image` so provider changes stay backend-only.

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
  "underneath": "潜意识解读",
  "echo": "占星共鸣",
  "mirror": "现实映射",
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
  "imageUrl": "https://image.pollinations.ai/...",
  "provider": "pollinations"
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

- Work on `feature/image-api-provider` for the current image API/provider cleanup.
- Run `npm install` after cloning.
- Run `npm run build` before committing.
- Keep `.env` local and untracked.
- Keep service role keys server-side only.
- Missing local environment variables should not block `npm run build`, but real API calls will fail until keys are configured.
- Current Vercel deployments are protected by Vercel Authentication. A public `401 Authentication Required` from `/api/health` means deployment protection is active, not necessarily that the app is down.

## Notes

- `api/_lib/db` and `drizzle.config.ts` are present for Drizzle/Postgres usage, but current API handlers use `@supabase/supabase-js` directly.
- `users` exists in the schema, but the current MVP does not create or link user records during dream interpretation.
- Do not run `npm audit fix --force` casually; it may introduce breaking dependency changes.
