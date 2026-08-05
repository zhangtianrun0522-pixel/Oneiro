# Oneiro

Oneiro is a private dream-memory product for WeChat Mini Program. It saves the raw dream first, then adds grounded cultural, psychological, personal, and optional birth-rhythm perspectives. The current implementation status is maintained in [`PROJECT_PROGRESS.md`](PROJECT_PROGRESS.md).

## Active Product

The Mini Program under [`miniprogram/`](miniprogram/) is the only active product surface.

- Dream writing and raw-first interpretation without a profile gate.
- CloudBase interpretation, storage, analytics, deletion, image generation, and card-only sharing.
- Grounded single-dream results with structured facts and bounded dream chat.
- A personal memory center with an editable current portrait, pause controls, source correction, and version history.
- A private dream deck with cross-dream patterns, collectible cards, and full-reading exports.

Open `miniprogram/` in WeChat Developer Tools to preview the product. Deployment and release details are in [`docs/`](docs/), especially [`docs/MINI_PROGRAM_RELEASE_CHECKLIST.md`](docs/MINI_PROGRAM_RELEASE_CHECKLIST.md) and [`docs/CLOUDBASE_DEPLOYMENT.md`](docs/CLOUDBASE_DEPLOYMENT.md).

## Local Checks

Install dependencies once:

```bash
npm install
```

Run the Mini Program release contract suite:

```bash
npm run check:mini-release
```

Run focused checks while changing a specific area:

```bash
npm run check:ai-readiness
npm run check:miniprogram
npm run check:phase3
npm run typecheck
```

The checks use local mocks and static contracts. They do not replace a real WeChat Developer Tools preview or a live CloudBase smoke test. Before release, use the commands in the Mini Program checklist and record the preview/deployment version alongside the commit.

## CloudBase

Provider keys stay in CloudBase function environment variables. They must not appear in Mini Program files, `project.config.json`, or local storage. `interpretDream` supports the configured DeepSeek/OpenAI-compatible boundary; `generateDreamImage` owns the server-side image-provider boundary. Health checks and the explicit AI smoke test are available from the hidden diagnostics page described in [`docs/AI_PROVIDER_RUNBOOK.md`](docs/AI_PROVIDER_RUNBOOK.md).

## Archived Web Prototype

The former Vite/Vercel browser prototype is frozen under [`archive/web-vite/`](archive/web-vite/). It is not an active product, release target, or acceptance surface for the Mini Program. Its source, API handlers, deployment configuration, and old environment example remain there only for historical reproducibility. Use the explicit `web:dev`, `web:build`, and `web:preview` scripts only when investigating that archive.

The shared visual contract remains active for Mini Program image generation and is documented in [`docs/design/ONEIRO_DREAM_IMAGE_SYSTEM_V1.md`](docs/design/ONEIRO_DREAM_IMAGE_SYSTEM_V1.md).
