# Oneiro Mini Program

This folder contains the first WeChat Mini Program spike for Oneiro.

It is intentionally separate from the current Vite web prototype. The web app remains useful as an acceptance harness, while this folder proves the WeChat-native product shape.

## Current Scope

- Native WeChat Mini Program pages.
- Static acceptance dream flow.
- Dream input and the basic interpretation can complete without opening the profile page; optional birth data adds the birth-rhythm perspective.
- Raw-dream-first persistence before interpretation, with pending/ready/blocked states.
- Image-first result page followed by grounded facts, possible real-life connections, and a functional bounded dream-chat entry.
- Private profile page for optional nickname and birth details. The basic interpretation never waits for profile completion; when supplied, the city is resolved to coordinates for the optional true-solar-time birth-rhythm perspective.
- Owner-scoped CloudBase archive with local pending-draft fallback and cross-device deck recovery.
- A personal memory center with an automatically published AI portrait, user editing, pause controls, source-aware versions, editable/deletable high-confidence reality fragments, and CloudBase `profile_snapshots` persistence.
- Cross-dream people/symbol/emotion/place summaries, a monthly primary card, and a private collectible dream deck.
- Optional post-reading reflection that refines the first interpretation into a final dream card.
- Share button using a separately rendered privacy-safe public Canvas cover after explicit preparation.
- CloudBase AI image generation through `generateDreamImage`, using the owner-scoped stored dream plus a structured `visual_plan`; it applies relationship-based emotion palettes, asymmetric composition, strict element limits, and the `oneiro-seedream-dream-v2.0` hand-printed dream style, with local symbolic art as fallback.
- Canvas-based save-card flow.
- Result-page loop actions for drawing another card or returning to the card archive.
- Share-card landing page for card-only public payloads.
- Local basic dream-text safety gate before generating shareable cards.
- Server-side basic dream-text safety gate inside `interpretDream`; explicit cloud safety blocks do not fall back to local generation.
- Local lightweight dream-symbol oracle that adapts the card title, symbols, emotional weather, and reading copy from the user's dream text.
- Dream-derived card themes that change both the on-screen card art and exported Canvas share image.
- Local MVP analytics events for raw save, dream submit, interpretation, bounded chat, profile saving, deletion, image generation, export, share, and archive use.
- CloudBase-ready client adapter and deployed cloud functions for environment health, login/openid, cloud interpretation, image generation, profile save, dream save, event tracking, and card-only share payloads.
- Provider-ready AI interpretation inside `interpretDream`, with DeepSeek and OpenAI-compatible chat providers plus a static fallback when the provider is not configured or unavailable.
- CloudBase adapter AI health wrapper (`cloudBase.aiHealth`) for verifying provider configuration after CloudBase env setup.
- Hidden diagnostics page at `/pages/diagnostics/index` for checking CloudBase and AI provider status in WeChat Developer Tools, including a manual `AI SMOKE TEST` action for one explicit provider schema test after env setup.

The `interpretDream` cloud function now has the real AI provider boundary: set `INTERPRET_PROVIDER=deepseek` with `DEEPSEEK_API_KEY`, or use `INTERPRET_PROVIDER=openai-compatible` with the compatible provider variables documented in `docs/CLOUDBASE_DEPLOYMENT.md`. It returns a normalized `visual_plan` alongside the reading. `generateDreamImage` compiles the final provider prompt on the server, uses a server-side OpenAI-compatible image provider key, and stores the original bitmap plus prompt, model, visual plan, and quality record under `generated-dream-images/` / `generated_assets`. The local production code is now prepared for Seedream 5.0 Lite (`doubao-seedream-5-0-lite-260128`, `1728x2304`); the CloudBase environment still requires the endpoint/key update and function redeployment before the live switch is complete. Deterministic/local card surfaces remain available when either provider fails. `cloudHealth` creates/checks database collections and verifies a basic storage write. Result sharing creates a privacy-safe card-only payload and routes to `/pages/share/index?id=...`; `result?id=...` remains a same-device local revisit path.

The current direction is a private dream-memory system with an optional birth-rhythm lens. Grounded dream interpretation and user-controlled long-term memory are the primary value; the dream card is the collectible/shareable artifact. Birth data is never a prerequisite for the basic reading. Dream text changes card titles, symbol sets, reading directions, and visual themes. The system automatically publishes its latest portrait from high-confidence signals; only the current portrait with future use enabled enters later AI context, and the user can edit, pause, or restore it at any time.

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

1. Scan the latest preview QR and verify microphone permission plus partial voice-record recovery on a physical phone.
2. Verify generated-image rendering, album permission, the 3:4 collectible export, and the compact full-reading export on the phone network.
3. Forward `/pages/share/index?id=...` into a clean WeChat session and confirm only the privacy-safe public cover is visible.
4. Exercise automatic portrait refresh, editing, pause, and history restore; confirm the next dream uses only the current version when future use is enabled.
5. Before wider public launch, add WeChat content-security calls and rotate/audit server-side provider credentials.

## Local Acceptance

From the repository root:

```bash
npm run check:mini-release
```

`check:mini-release` runs the full Mini Program pre-release check suite: AI readiness, CloudBase readiness, Mini Program MVP contract, dream-result contract, and TypeScript type checks.

`check:ai-readiness` validates that the `interpretDream` cloud function is ready for DeepSeek/OpenAI-compatible provider configuration, exercises local mocked health-check and smoke-test responses for static and DeepSeek modes, verifies missing-key fallback, strict-mode provider errors, and safety blocking, confirms the CloudBase setup docs include the health-check flow, and verifies Mini Program runtime files do not contain server-side AI API key markers or likely key literals.

`check:cloudbase` validates that the real AppID, cloud function folders, CloudBase adapter calls, share-card storage path, and deployment documentation are in place before attempting deployment.

`check:miniprogram` validates the single-dream and memory-center contract: dream writing without a profile gate, raw save before interpretation, structured facts and multi-perspective output, optional final-card refinement, bounded dream chat, automatic AI portrait publishing and editing, deletion, Canvas exports, explicit share preparation, analytics, archive rendering, JSON configs, and mocked page flows. `npm run check:phase3` additionally exercises the CloudBase profile state machine and dream-deletion cascades against an in-memory database contract.

CloudBase deployment steps are documented in `docs/CLOUDBASE_DEPLOYMENT.md`. Real AI provider setup, health-check expectations, and fallback triage are documented in `docs/AI_PROVIDER_RUNBOOK.md`.
