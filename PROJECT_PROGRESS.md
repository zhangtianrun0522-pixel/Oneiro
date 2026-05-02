# Oneiro Project Progress

Last updated: 2026-05-02

## Current Status

- Branch: `main`
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

1. Frontend collects profile and dream text.
2. Frontend calls `POST /api/interpret`.
3. Backend interprets the dream with the configured provider.
4. Frontend calls `POST /api/generate-image` with `image_prompt`.
5. Backend generates or falls back to an image URL.
6. Frontend renders the dream card.

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
- `vercel.json` memory settings are ignored under Active CPU billing. The warning is harmless.
- `npm install` previously reported 5 moderate vulnerabilities. Do not run `npm audit fix --force` casually.

## Next Recommended Work

1. Fix Supabase Production env and verify dream history persistence.
2. Consider storing generated images in Supabase Storage instead of returning transient third-party URLs.
3. Improve image generation UX with async status or a lighter/faster provider; current synchronous request can take tens of seconds.
4. Decide whether to disable Vercel Authentication for public MVP testing or keep using protected preview/production.
5. Rename `api/_lib/services/geminiService.ts` to a provider-neutral name when convenient.

## Useful Commands

```bash
npm run build
npx tsc --noEmit
npx vercel env ls
npx vercel logs https://oneiro-psi.vercel.app --no-follow --limit 20 --expand
npx vercel --prod --yes
```
