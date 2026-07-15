# Oneiro Mini Program

This folder contains the first WeChat Mini Program spike for Oneiro.

It is intentionally separate from the current Vite web prototype. The web app remains useful as an acceptance harness, while this folder proves the WeChat-native product shape.

## Current Scope

- Native WeChat Mini Program pages.
- Static acceptance dream flow.
- Dream input can begin without opening the profile page, but interpretation requires birth date and birth time because the metaphysical lens is enabled by default.
- Raw-dream-first persistence before interpretation, with pending/ready/blocked states.
- Image-first result page followed by grounded facts, possible real-life connections, and a functional bounded dream-chat entry.
- Private profile page for nickname and birth details; missing birth date/time/city pauses interpretation and guides the user to complete the profile. The city is resolved to coordinates for true-solar-time correction.
- Recent local archive.
- Share button using the generated Canvas card image when available.
- CloudBase AI image generation through `generateDreamImage`, using `image_prompt` from the interpretation result and falling back to the local symbolic card art if unavailable.
- Canvas-based save-card flow.
- Result-page loop actions for drawing another card or returning to the card archive.
- Share-card landing page for card-only public payloads.
- Local basic dream-text safety gate before generating shareable cards.
- Server-side basic dream-text safety gate inside `interpretDream`; explicit cloud safety blocks do not fall back to local generation.
- Local lightweight dream-symbol oracle that adapts the card title, symbols, emotional weather, and reading copy from the user's dream text.
- Dream-derived card themes that change both the on-screen card art and exported Canvas share image.
- Local MVP analytics events for raw save, dream submit, interpretation, bounded chat, profile saving, deletion, image generation, export, share, and archive use.
- CloudBase-ready client adapter and deployed cloud functions for environment health, login/openid, cloud interpretation, image generation, profile save, dream save, event tracking, share-card upload, and card-only share payloads.
- Provider-ready AI interpretation inside `interpretDream`, with DeepSeek and OpenAI-compatible chat providers plus a static fallback when the provider is not configured or unavailable.
- CloudBase adapter AI health wrapper (`cloudBase.aiHealth`) for verifying provider configuration after CloudBase env setup.
- Hidden diagnostics page at `/pages/diagnostics/index` for checking CloudBase and AI provider status in WeChat Developer Tools, including a manual `AI SMOKE TEST` action for one explicit provider schema test after env setup.

The `interpretDream` cloud function now has the real AI provider boundary: set `INTERPRET_PROVIDER=deepseek` with `DEEPSEEK_API_KEY`, or use `INTERPRET_PROVIDER=openai-compatible` with the compatible provider variables documented in `docs/CLOUDBASE_DEPLOYMENT.md`. The `generateDreamImage` cloud function uses a server-side OpenAI-compatible image provider key to create the visual card art and store it under `generated-dream-images/`. Until production environment variables are configured in CloudBase, interpretation and image generation fail safely into deterministic/local card surfaces. CloudBase now uses environment `cloud1-d9gb0sjvg6a8d9864` and the MVP cloud functions have been deployed. `cloudHealth` can create/check database collections and verify a basic storage write before production traffic. In the local/static MVP, shared cards use the generated card image; when CloudBase is available, result sharing creates a card-only payload and routes to `/pages/share/index?id=...`. `result?id=...` is only a same-device local revisit path until CloudBase storage and public share payloads are verified.

The current direction is a private dream-memory system with a default bounded metaphysical lens. Grounded dream interpretation remains the primary value; the dream card is a secondary collectible/shareable artifact. Birth date/time are required before interpretation, while the deterministic chart is used only to explain a cultural resonance with the current dream. The product does not make fate predictions or provide daily fortune. Dream text changes card titles, symbol sets, reading directions, and visual themes. Core funnel events are stored locally under `oneiro:events` and can be sent through `trackEvent` when CloudBase is available.

## Open In WeChat DevTools

1. Open WeChat Developer Tools.
2. Import project.
3. Select this folder:

```text
miniprogram/
```

4. Confirm `project.config.json` uses the real Mini Program AppID `wx61800035c4e1a092`.
5. Run on an iPhone simulator size first.

## Next Mini Program Tasks

1. Deploy the updated `interpretDream` and `saveDream` cloud functions.
2. Verify pending raw saves survive provider failure and safety blocking on a real device.
3. Verify missing-profile prompt, profile save/resume, bounded dream chat, and deletion in CloudBase.
4. Verify the image-first result, image-led 3:4 collectible export, and compact full-reading export.
5. Run a real-device QR flow for generated imagery, share-card upload, and `/pages/share/index?id=...` across a clean session.
6. Add WeChat content safety checks before interpretation and sharing.

## Local Acceptance

From the repository root:

```bash
npm run check:mini-release
```

`check:mini-release` runs the full Mini Program pre-release check suite: AI readiness, CloudBase readiness, Mini Program MVP contract, dream-result contract, and TypeScript type checks.

`check:ai-readiness` validates that the `interpretDream` cloud function is ready for DeepSeek/OpenAI-compatible provider configuration, exercises local mocked health-check and smoke-test responses for static and DeepSeek modes, verifies missing-key fallback, strict-mode provider errors, and safety blocking, confirms the CloudBase setup docs include the health-check flow, and verifies Mini Program runtime files do not contain server-side AI API key markers or likely key literals.

`check:cloudbase` validates that the real AppID, cloud function folders, CloudBase adapter calls, share-card storage path, and deployment documentation are in place before attempting deployment.

`check:miniprogram` validates the V0.2 single-dream contract: dream writing before profile completion, profile-gated interpretation, raw save before interpretation, safety blocking without data loss, structured facts and version metadata, bounded metaphysical output, image-first result order, bounded dream chat, deletion, redesigned Canvas exports, card-only share payloads, CloudBase adapter calls, analytics, archive rendering, JSON configs, and mocked page flows.

CloudBase deployment steps are documented in `docs/CLOUDBASE_DEPLOYMENT.md`. Real AI provider setup, health-check expectations, and fallback triage are documented in `docs/AI_PROVIDER_RUNBOOK.md`.
