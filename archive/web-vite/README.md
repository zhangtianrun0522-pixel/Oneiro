# Archived Web Prototype

This is the frozen Vite/Vercel prototype. The active product is the WeChat Mini Program under [`../../miniprogram/`](../../miniprogram/).

The files here are retained for historical acceptance-contract coverage and reproducibility only. They are not part of the Mini Program release path, and there is no active web deployment workflow in the repository root.

To run the archived prototype deliberately:

```bash
npm run web:dev
npm run web:build
npm run web:preview
```

The archived `.env.example` documents the old browser/API variables. Keep real values in the existing untracked root `.env` only; never commit provider or database credentials.

The former Vercel project is not automatically disabled by moving these files. Production deployment protection, pause, or removal must be handled separately in Vercel when access is available.
