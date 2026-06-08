# Oneiro Project Progress

Last updated: 2026-06-08

## Current Status

- Branch: `codex-optimize-dream-interpretation`
- Current local focus: public-sharing MVP polish for the first-run dream card flow, now repositioned toward a WeChat Mini Program-first launch.
- Production: `https://oneiro-psi.vercel.app`
- Vercel project: `zhangtianruns-projects-7b0d221b/oneiro`
- GitHub repo: `zhangtianrun0522-pixel/Oneiro`
- GitHub integration is working. Pushes to `main` trigger Production deployments.
- Vercel Authentication is enabled. Public requests may return `401 Authentication Required`; use `vercel curl` when testing protected deployments.

## Recent Commits

- `5dd5de1 feat: add DeepSeek interpretation provider`
- `d5f990b fix: keep MVP running when image generation times out`
- `eff347c fix: add ESM extensions for API imports`
- `4df7877 feat: add OpenAI-compatible image provider`
- `a7634e3 docs: document MVP setup and API contracts`
- `dec4956 feat: add image generation API endpoint`

## MVP Flow

1. Frontend collects a lightweight profile; nickname and birth date are required, birth time and place are optional.
2. Frontend calls `POST /api/interpret`.
3. Backend interprets the dream with the configured provider.
4. Frontend renders the text result immediately and stores it in local browser history.
5. Frontend calls `POST /api/generate-image` with `image_prompt` in the background.
6. Backend generates or falls back to an image URL.
7. Frontend updates the 9:16 dream card image and supports PNG export.

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

## Next Recommended Work

1. Run several real mobile sessions and tune first-screen copy, dream card hierarchy, and export image layout.
2. Decide whether public MVP testing should disable Vercel Authentication or continue behind protected deployments.
3. Rotate the DeepSeek and image gateway keys that were shared during setup.
4. Fix Supabase Production env only when moving beyond local browser history.
5. Consider storing generated images in Supabase Storage if share links or cloud history become product requirements.
6. Rename `api/_lib/services/geminiService.ts` to a provider-neutral name when convenient.

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
- Added `miniprogram/` as a separate native WeChat Mini Program spike with static acceptance pages for profile entry, dream input, result dream card, and recent local archive.
- Recommended next development step: commit the current baseline, then open `miniprogram/` in WeChat Developer Tools and rebuild dream-card export with Canvas before wiring CloudBase.

## Useful Commands

```bash
npm run build
npm run check:dream
npm run typecheck
npx vercel env ls
npx vercel logs https://oneiro-psi.vercel.app --no-follow --limit 20 --expand
npx vercel --prod --yes
```
