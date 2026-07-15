# Oneiro Project Progress

Last updated: 2026-07-15

## Product Correction: Metaphysical Lens Default-On (2026-07-15)

The user clarified that metaphysical interpretation is a default part of every reading. A user may write a dream before opening the profile page, but interpretation must stop when birth date, birth time, or birth city is missing, preserve the draft text, and guide the user to `我的资料`. Birth city is now required for true-solar-time correction. The CloudBase `interpretDream` function calculates a deterministic four-pillar chart, passes it to the AI as bounded context, and returns `metaphysical_resonance`, `metaphysical_basis`, and `bazi_chart`; the result page displays a separate `命理镜头` block.

- Removed the visible `人物 / 地点 / 物件 / 行动 / 情绪 / 时间感` fact table from the result page. Structured `dreamFacts` remain stored for model grounding and future memory.
- Accuracy implementation: `lunar-javascript` now receives true-solar-time-corrected values from a deterministic city coordinate resolver, with `setSect(2)` and explicit correction metadata. The LLM does not calculate the chart; it receives the deterministic chart and writes the explanation.
- Local/cloud-unavailable fallback no longer fabricates a metaphysical reading from season or zodiac; it states that no four-pillar chart was generated.

- Current implementation branch remains `codex-optimize-dream-interpretation`.
- Prompt version is now `oneiro-grounded-reading-v0.2.2`.
- Bazi calculation version is now `bazi-v0.3-true-solar`; `interpretDream` deploy includes `locationResolver.js` and completed with a 3-file, 14.9 KB package.
- Verification so far: `npm run check:mini-release`, `npm run build`, `git diff --check`, CloudBase deploy, and WeChat preview passed. The latest preview package is `84.3 KB / 86,295 bytes` with AppID `wx61800035c4e1a092`.
- Next verification: test missing-profile prompt, profile save/resume, city resolution, true-solar-time output, and result-page rendering on a real device.

## Latest Product Decision And Agent Handoff (2026-07-12)

The current product direction has changed from a card-first dream oracle with a lightweight birth-rhythm layer to a **private dream-memory system**. The single source of truth for the next development phase is [`V0_2_DEVELOPMENT_PLAN.md`](V0_2_DEVELOPMENT_PLAN.md).

- Core promise: “它不替你预测命运，但会越来越理解你的梦。”
- China / WeChat Mini Program remains the first market and delivery surface. The existing dream card/image/share stack remains useful, but it is a collectible/share artifact rather than the primary user value.
- V0.2 must prioritize: dream-grounded single reading, real-life notes and bounded dream dialogue, editable private memory, archive views, and evidence-based 3/7-dream reports.
- Bazi is now a default bounded interpretation lens after the 2026-07-15 product correction. Astrology, daily fortune, public community, subscriptions, and coins remain deferred.
- Memory must be quiet and user-controllable: no repeated in-chat consent prompts, no default display of retrieval citations, no invented memories, no permanent labels from one statement, and deletion/pause must prevent future use.
- Result tone must be observant and bounded rather than flattering: no fate, medical, trauma, relationship, or career diagnosis; use uncertainty when evidence is weak.
- The immediate implementation sequence is Sprint 1 of the V0.2 plan: restructure the result around dream facts and possible real-life relevance, persist the raw dream even if AI fails, store normalized facts/result versions, and collect `有启发 / 太泛 / 太玄 / 不贴梦` feedback.

### Handoff Safety

- Current branch is still `codex-optimize-dream-interpretation`; it is the correct continuation branch for this objective.
- The worktree is intentionally dirty with user work across strategy docs, Mini Program pages, CloudBase functions, scripts, and configuration. Do not reset, broadly reformat, or overwrite those changes. Inspect a file's diff immediately before editing it.
- Sprint 1 code is implemented locally on this branch. The updated `interpretDream` function with the default metaphysical lens was deployed on 2026-07-15; real-device acceptance is still pending.

### V0.2 Sprint 1 Implementation (2026-07-12)

- Home no longer requires nickname, birth date, birth time, or birth place before recording a dream.
- Dream submission writes a `pending` raw entry locally and through `saveDream` before calling `interpretDream`, then updates the same id with the normalized result. Local archive capacity is now 30 entries.
- Stored entries include structured dream facts, status, provider/error data, schema/prompt/model versions, feedback, and timestamps.
- Result order now starts with the dream image/card, followed immediately by raw dream facts and possible real-life connections. The former four-option feedback panel was removed because it felt like a software test.
- The former static question is now a functional `聊聊这个梦` entry. The bounded chat keeps only the current dream and recent messages, limits users to six turns, persists with the dream, and avoids diagnosis, prediction, or invented memories.
- Added local/CloudBase dream deletion. Natural corrections can now be collected through the bounded conversation instead of an exposed rating panel.
- Added a `我的资料` page for nickname and birth details. Dream writing can begin without it, but interpretation now requires birth date/time, preserves the draft, and redirects the user to complete the profile.
- Redesigned the 3:4 collectible export around a near-full-bleed image with text overlay, and reduced the full-reading export from 3200 to 2300 pixels to eliminate excessive whitespace.
- `interpretDream` now requests factual extraction and bounded hypotheses, receives a deterministic four-pillar chart, adds a bounded metaphysical lens, preserves uncertainty, excludes fate predictions, and limits historical context to three observations.
- Verification passed: JavaScript syntax checks, `npm run check:mini-release`, `npm run build`, `git diff --check`, and WeChat DevTools preview with AppID `wx61800035c4e1a092` (`83.0 KB / 84,960 bytes`). Build retains the existing >500 kB Vite chunk warning.
- WeChat DevTools automation previously verified home, profile, result top/reading, bounded chat, collectible Canvas export, and full-reading Canvas export with no runtime exceptions. The chat composer was corrected after the first narrow-screen screenshot showed a compressed send button.
- Immediate next step: run real-device checks for missing-profile prompting, profile save/resume, deterministic metaphysical output, pending-save recovery, bounded dream chat, deletion, and both redesigned exports.

### Interpretation Quality Pass (2026-07-14)

- Deployed `interpretDream` and `saveDream` to `cloud1-d9gb0sjvg6a8d9864`. Both are `Active` on Nodejs16.13; `interpretDream` timeout is 60 seconds and `saveDream` timeout is 3 seconds.
- Added `reading_hook` and `alternative_reading` to the interpretation contract. The first must connect two concrete dream details through a tension or turn; the second keeps a falsifiable non-pathological alternative visible.
- Result page now shows “这个梦的张力” and “另一种可能” between dream facts and the bounded chat entry.
- Real Mini Program submission previously verified provider `deepseek`, title `迷途`, schema `dream-entry-v0.2`, prompt `oneiro-grounded-reading-v0.2.1`, and a concrete hook about being late, chased, and unable to find an exit. The deployed prompt is now `oneiro-grounded-reading-v0.2.2` with the default metaphysical lens.
- Real bounded chat verification also passed with three messages after one user turn and a specific follow-up question.
- Remaining release work is real-device verification of the new interpretation, deletion, profile persistence, and both exports; no commit or push was made.

## Current Status

- Branch: `codex-optimize-dream-interpretation`
- Current local focus: V0.2 private dream memory, with grounded single-dream interpretation as the first value and dream cards only as the save/share artifact.
- Production: `https://oneiro-psi.vercel.app`
- Vercel project: `zhangtianruns-projects-7b0d221b/oneiro`
- GitHub repo: `zhangtianrun0522-pixel/Oneiro`
- GitHub integration is working. Pushes to `main` trigger Production deployments.
- Product decision: validate in China first as a private dream-memory product. Bazi is a default, bounded lens after the latest product correction; astrology and fate claims remain outside V0.2. `V0_2_DEVELOPMENT_PLAN.md` supersedes older market decisions where they conflict.
- Vercel Authentication is enabled. Public requests may return `401 Authentication Required`; use `vercel curl` when testing protected deployments.

## Recent Commits

- `928f2c5 feat: add public sharing baseline`
- `861cc06 docs: record current project progress`
- `5dd5de1 feat: add DeepSeek interpretation provider`
- `d5f990b fix: keep MVP running when image generation times out`
- `eff347c fix: add ESM extensions for API imports`
- `4df7877 feat: add OpenAI-compatible image provider`

## MVP Flow

1. User can start writing a dream immediately without profile data; interpretation requires birth date/time and prompts for the profile when missing.
2. The raw dream is saved before interpretation starts, so provider failure or safety blocking does not discard it.
3. Interpretation extracts verifiable dream facts and returns bounded possible real-life connections plus one answerable question.
4. Result page leads with the raw dream, facts, hypotheses, and feedback; the dream card appears afterward as a collectible/share artifact.
5. User can submit one of four structured feedback values, delete the dream, save a collectible card, or export the full reading.
6. Up to 30 local dreams appear in the private dream archive; pending or blocked entries remain visible as saved raw dreams.
7. Local MVP analytics records raw save, interpretation, feedback, deletion, image, export, share, and archive events under `oneiro:events`.
10. Result sharing can create a card-only CloudBase payload and route to `/pages/share/index?id=...`; if cloud share creation is unavailable, it falls back to the existing home share route.
11. `interpretDream` has a basic server-side safety gate. Explicit cloud safety blocks show a modal and do not fall back to local generation.
12. CloudBase-ready client paths and cloud function skeletons exist for login/openid, cloud interpretation, profile save, dream save, event tracking, Canvas share-card upload, and share-card payloads; these still need a real AppID, CloudBase environment, deployment, and database/storage rules before production verification.

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
- WeChat Developer Tools `open --compile-condition` does not apply page conditions; `compile-condition` belongs to preview commands, so do not use preview unless uploading/QR generation is explicitly approved.
- Mini Program visual verification is partly pending: the home page is visible in DevTools, but result-page visual inspection and album/share behavior still need manual DevTools interaction or automation. macOS screen recording permission also blocked clean screenshot capture during the latest attempt.
- WeChat Developer Tools `engine build` is not available on the current local IDE HTTP server. The CLI returned `Cannot GET /engine/build`, so local Mini Program verification currently relies on DevTools `open`, script/JSON checks, and manual GUI inspection.
- WeChat Developer Tools is running and `open` succeeds, but the window could not be surfaced into the current screenshot space via app name or bundle id (`com.tencent.webplusdevtools`). Treat visual inspection of result/save/share as still pending until it is manually confirmed in the visible DevTools GUI.
- WeChat Developer Tools `preview` passes with the real Mini Program AppID `wx61800035c4e1a092`. The latest preview package size is 53.1 KB / 54,362 bytes after adding `cloudHealth`.
- WeChat Developer Tools automation is enabled on `ws://127.0.0.1:9420`. Automated simulator acceptance reached `pages/home/index`, `pages/new-dream/index`, `pages/result/index`, and `pages/archive/index`.
- Automated simulator flow verified: first-run profile is present, "try sample dream" fills dream text, result generation eventually falls back to the local oracle when CloudBase functions are unavailable, result card renders with title `潮钥`, theme `tide`, `shareImagePath` is ready, the full reading section exists, `saveCard` executes without throwing in the simulator, and archive shows saved cards.
- Save-card permission was exercised in WeChat DevTools. The simulator showed the `saveImageToPhotosAlbum` authorization prompt, and `miniprogram-automator` handled it through `native().authorizeAllow()`. DevTools then opened a macOS save dialog for the generated image; direct coordinate clicking is blocked because `osascript` does not have Accessibility permission on this machine, so the project window was closed/reopened through the CLI to clear the dialog.
- CloudBase code paths are present and the eight MVP cloud functions have been deployed to `cloud1-d9gb0sjvg6a8d9864`: `cloudHealth`, `login`, `interpretDream`, `saveProfile`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard`. All checked functions report `Active` with runtime `Nodejs16.13`. `cloudHealth` verified database collections and storage writes. `interpretDream` currently returns a deterministic MVP oracle response and includes only a basic regex safety gate; it still needs real AI provider calls plus WeChat/provider content-safety implementation before launch.
- CloudBase data/storage verification passed through `cloudHealth` run `1781339229268`: it created/read `users`, `dream_entries`, `events`, `share_pages`, and `generated_assets`; wrote event id `8efe4ec36a2d145d00e7956c3db3c03c`; uploaded `share-cards/healthcheck-1781339229268.txt`; and recorded generated asset id `6711d5f06a2d145e003257f71d2e7b0e`.
- CloudBase business cloud flow verification passed from the Mini Program runtime: `login` returned openid `oiMk63bCBgTZuiqu7caFt-ziUirA`; `saveProfile` wrote id `f5f35ce96a2d15780052d3df25887e4d`; `interpretDream` returned provider `cloudbase-static` and result title `钥月`; `saveDream` wrote id `8efe4ec36a2d157c00e7eae2178b7fd8`; `trackEvent` inserted 1 event; `createShareCard` wrote id `8efe4ec36a2d157f00e7eb1f668ea360`; and `getShareCard` read share id `card-1781339519031-iph0sh` back successfully.
- CloudBase deployment readiness is now documented in `docs/CLOUDBASE_DEPLOYMENT.md`, and `npm run check:cloudbase` verifies the real AppID, cloud function folders, CloudBase adapter hooks, share-card storage path, health-check function, and required collection documentation.
- Earlier WeChat Developer Tools `cloud env list` calls failed before the CloudBase package/environment was created. The actual environment id is now `cloud1-d9gb0sjvg6a8d9864`. A post-deploy `cloud functions list` call intermittently returned `Failed to fetch`, but `cloud functions info` successfully confirmed all deployed functions are active.

## Next Recommended Work

1. Recruit 30–50 Chinese seed users and instrument structured interpretation feedback: useful, too generic, too mystical, or not grounded in the dream.
2. Tune the result page so the first visible value is a meaningful personalized dream interpretation, with the card acting as the collectible/shareable artifact.
3. Define the lightweight metaphysical profile contract from nickname, birth date, optional birth time, and optional birth place.
4. Run a real-device Mini Program QR flow to verify end-user share-card image upload and `/pages/share/index?id=...` across a clean session.
5. Add structured interpretation feedback (`有启发 / 太泛 / 太玄 / 不贴梦`) and begin the three-dream pattern-memory loop.
6. Rotate the DeepSeek and image gateway keys that were shared during setup.
7. Fix Supabase Production env only if the Vite web prototype needs cloud history again; Mini Program V1 should prioritize CloudBase.

## 2026-07-10 Product And Generation Iteration

- Completed market and user-pain research across dream apps, astrology products, U.S. survey data, WeChat reach, privacy research, and Chinese platform/regulatory constraints.
- Chose China-first validation because the existing WeChat/CloudBase/share stack minimizes cash and launch friction; North America remains the second market after retention is proven.
- Replaced the vague “full metaphysics later” starting point with an explainable Eastern birth-rhythm lens based on birth season, Chinese zodiac, and optional birth time period. Results now state their basis and explicitly say they are not full bazi or fate prediction.
- Defined the Oneiro visual signature as `Oneiro Etched Dream Atlas`: indigo copperplate etching, restrained gouache, moon ivory, cotton paper texture, and one theme accent from a closed eight-theme vocabulary.
- Image generation now accepts only a normalized card theme, reports style version/cache/latency metadata, and reuses CloudBase `generated_assets` entries by prompt + theme + model + style version.
- Result-page Canvas sharing no longer waits for the AI image. A branded static dream card is rendered immediately, while AI art replaces it in the background when ready.
- Verification passed: `npm run check:mini-release`, `npm run build`, and JavaScript syntax checks for the changed Mini Program runtime files. Vite still reports the existing >500 kB chunk warning.
- User restored the WeChat Developer Tools login and runtime automation completed against `pages/result/index?fixture=1`. First paint showed `潮钥`, theme `tide`, the birth-rhythm basis, and a usable `shareImagePath` while the AI image was still generating; there were no runtime exceptions or console errors.
- Redeployed `interpretDream` and `generateDreamImage` to `cloud1-d9gb0sjvg6a8d9864`. Both remained `Active` on `Nodejs16.13` with 60-second timeouts.
- First v1 style generation took about 45 seconds; the second identical request returned from cache before the 1.8-second first-paint assertion with `cacheHit: true`.
- Runtime debugging found that the provider returns JPEG bytes while the old pipeline always uploaded with a `.png` suffix. `generateDreamImage` now detects PNG/JPEG/WebP magic bytes, rejects tiny/unknown payloads, uploads with the correct extension, records image format/size, and uses style/pipeline version `oneiro-etched-dream-v2` to avoid stale cache entries.
- A v2 generation produced a valid 886,074-byte JPEG and cached it successfully. The subsequent request returned the same asset with `cacheHit: true`.
- The current Mac/DevTools environment cannot download the CloudBase CDN asset: both `wx.cloud.downloadFile` and direct curl fail during TLS setup with `Client network socket disconnected before secure TLS connection was established`. The Mini Program now prefers `wx.cloud.downloadFile(fileID)`, falls back to the temporary URL, records the internal failure, and shows a friendly static dream-card fallback instead of a raw error. A real-device test on a different network is still required to validate the final generated artwork visually.

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
- Product strategy now frames Oneiro as personalized dream interpretation first, beautiful dream card second, dream journal/card archive third, and long-term metaphysical memory as the retention moat.
- Added `miniprogram/` as a separate native WeChat Mini Program spike with static acceptance pages for profile entry, dream input, result dream card, and recent local archive.
- Mini Program result page now includes a Canvas-based save-card flow that draws a 750 x 1334 dream card and saves it to the user's photo album.
- Mini Program page scripts passed local `node --check` syntax verification. The Canvas export still needs verification inside WeChat Developer Tools because the WeChat canvas and album permission APIs cannot be exercised from Node.
- WeChat Developer Tools CLI service port is reachable locally. The Mini Program now uses real AppID `wx61800035c4e1a092`; DevTools preview and simulator launch succeed with that AppID.
- Mini Program MVP shape now follows a card-first oracle flow: the result page shows the dream card first, but the card carries condensed interpretation via emotional weather, symbols, today's omen, and metaphysical resonance; the full reading below is organized as card meaning sections.
- Added a local lightweight birth-profile oracle for the static MVP. It derives zodiac/seasonal element/time tone from nickname, birth date, optional birth time, and optional birth place, then personalizes card number, profile summary, today's omen, and metaphysical resonance.
- Birth-profile personalization now layers on top of the local dream-symbol reading instead of replacing it, so card insight/oracle/metaphysical resonance still reference the user's actual dream symbols.
- Home, dream input, and archive copy now frame the product as drawing and collecting dream oracle cards instead of generic dream logging.
- Result page now pre-renders the Canvas dream card as a temporary image for both saving to the album and WeChat share preview image.
- Added a `fixture=1` result-page mode for local Mini Program acceptance. It loads the sample dream and current/default profile without changing the normal user path from dream input or archive.
- Enabled a project-level condition named `MVP 验收结果页` for `pages/result/index?fixture=1`.
- Added a local dream-symbol oracle for the Mini Program static MVP. User dream text now changes card title, symbols, emotional weather, dream translation, subconscious clues, reality mirror, wake-up question, and one small act before the birth-profile personalization layer is applied.
- Mini Program dream cards now include a dream-derived visual theme (`tide`, `threshold`, `shadow`, `falling`, `archive`, `hearth`, `moon`, or `mist`). The result page and exported Canvas share card both use this theme, so the card's visual mood changes with the user's dream symbols instead of staying as a fixed cover.
- Added a local MVP analytics utility that stores funnel events under `oneiro:events`. It is wired into app launch, share landing, profile validation, dream start/submit, safety blocking, interpretation success, result view, Canvas image generation, save/export, WeChat share, archive view, and archive revisit. This satisfies the static event contract and leaves CloudBase upload as the next backend step.
- Added a CloudBase-ready frontend adapter at `miniprogram/utils/cloudBase.js`. It initializes `wx.cloud` when available, retrieves openid via `login`, calls `interpretDream` before falling back to the local oracle, syncs profiles and dreams through cloud functions, flushes MVP analytics events, and uploads generated Canvas share cards to cloud storage without blocking the local fallback flow.
- Added minimal cloud function skeletons under `miniprogram/cloudfunctions/`: `login`, `interpretDream`, `saveProfile`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard`. They target the `users`, `dream_entries`, `events`, and `share_pages` collections where relevant and are now declared through `cloudfunctionRoot` in `project.config.json`.
- Added `pages/share/index` as a card-only sharing landing page. Result-page Canvas generation now attempts to upload the share card, create a `share_pages` payload, and use `/pages/share/index?id=...` in `onShareAppMessage` once the payload is ready.
- Added a server-side basic content-safety gate in `interpretDream`. Frontend generation now distinguishes cloud safety blocks from cloud failures: safety blocks show a modal and stop, while ordinary cloud unavailability can still fall back to local generation.
- Added a local basic dream-text safety gate before dream card generation. It blocks empty/too-short input and obvious high-risk self-harm, harm, or medical-diagnosis phrasing from producing a shareable card in the static MVP.
- Dream input now starts empty, with the sample dream available through an explicit "try sample" action, so the first action feels like entering the user's own dream.
- Result navigation now carries local dream ids (`pages/result/index?id=...`) from generation and archive paths, so saved local cards can be revisited from the result route on the same device. Share messages now route recipients to `/pages/home/index?fromShare=1` while using the generated card image as the share preview, avoiding broken cross-device local ids until CloudBase share payloads exist.
- Home now detects `fromShare=1` and shows a short shared-card landing note, so users who arrive from a shared dream card understand they can draw their own card.
- First-run profile fields now start empty instead of using demo defaults. Nickname and birth date are required, and birth date validation is component-based to avoid timezone issues.
- Result page now includes loop actions for drawing another dream card and returning to the dream card archive. Save-card permission failure opens a modal with a route to `wx.openSetting`.
- Archive loading now backfills missing local ids/createdAt values and guards invalid dates, improving compatibility with older local demo data.
- Added `npm run check:miniprogram` as a local Mini Program MVP acceptance check. It verifies profile fields, birth date validation, basic dream-text safety, server-side safety blocking, dream text adaptation, cloud-interpretation-first fallback behavior, dream-derived visual card themes, birth-profile personalization, result reading sections, Canvas save/share hooks, card-only share landing payloads, CloudBase-ready adapter calls, local MVP analytics events, result loop actions, archive rendering, local id routes, JSON configs, and a mocked page-method flow from profile to dream input, result, save card, share payload, share page, and archive revisit.
- Added `npm run check:cloudbase` and `docs/CLOUDBASE_DEPLOYMENT.md` to make CloudBase deployment readiness explicit. The current environment id is `cloud1-d9gb0sjvg6a8d9864`.
- Latest checks passed: Mini Program page/util script `node --check`, `npm run check:cloudbase`, `npm run check:miniprogram`, `npm run check:dream`, `npm run typecheck`, and `git diff --check`. On 2026-06-10, `npm run check:cloudbase`, `npm run check:miniprogram`, and `npm run typecheck` passed after opening the project in WeChat Developer Tools.
- Latest WeChat Developer Tools check: with AppID `wx61800035c4e1a092`, `cli open --project miniprogram --lang zh` succeeded and `cli preview --project miniprogram --qr-format image --qr-output /private/tmp/oneiro-preview.png --info-output /private/tmp/oneiro-preview-info.json --lang zh` passed. Latest preview info reported total package size 54,362 bytes.
- Latest simulator automation check: temporary `miniprogram-automator@0.12.1` was installed under `/private/tmp/automator-env` only, connected to `ws://127.0.0.1:9420`, and verified home -> new dream -> sample dream -> result -> full reading -> save card -> archive. Screenshots were written to `/private/tmp/oneiro-automator-after-generate-wait.png`, `/private/tmp/oneiro-automator-reading.png`, and `/private/tmp/oneiro-automator-archive.png`.
- Latest save-card permission check: `saveCard` triggered the album permission prompt; `native().authorizeAllow()` accepted it and `shareImagePath` remained ready on `pages/result/index`.
- Latest CloudBase CLI check: `cli cloud functions deploy --env cloud1-d9gb0sjvg6a8d9864` deployed the original seven MVP cloud functions successfully, then `cloudHealth` was added and deployed successfully. First creation attempts can return `Creating`; retrying after creation completed worked. `cloud functions info` confirmed `cloudHealth` is `Active` on `Nodejs16.13`.
- Latest CloudBase runtime check: `cloudHealth` was invoked from WeChat DevTools automation and returned `ok: true`, confirmed openid/appid/env, created/read all five MVP collections, wrote one `events` document, uploaded one `share-cards/` healthcheck file, and recorded one `generated_assets` document.
- Latest business cloud runtime check: WeChat DevTools automation invoked `login`, `saveProfile`, `interpretDream`, `saveDream`, `trackEvent`, `createShareCard`, and `getShareCard` in sequence. All returned `ok: true`; share payload path was `/pages/share/index?id=card-1781339519031-iph0sh`.
- Latest WeChat Developer Tools preview after adding `cloudHealth`: `cli preview --project miniprogram --qr-format image --qr-output /private/tmp/oneiro-preview.png --info-output /private/tmp/oneiro-preview-info.json --lang zh` passed with total package size 54,362 bytes.
- Latest DevTools diagnosis: the `tcbGetResourceLimit` / `Please choose a package first` popup appears to be a WeChat Developer Tools CloudBase console resource-package panel state issue, not a Mini Program code or deployment failure. `cloud env list` saw `cloud1-d9gb0sjvg6a8d9864`, `cloud functions list` saw all eight functions, `preview` passed with AppID `wx61800035c4e1a092`, and automator read `pages/home/index` with page data and visible nodes.
- Latest AI-ready CloudBase update: `interpretDream` now supports `INTERPRET_PROVIDER=deepseek` and `INTERPRET_PROVIDER=openai-compatible` through server-side CloudBase environment variables, normalizes provider JSON into the existing dream-card schema, and falls back to `cloudbase-static-fallback` when the provider is unavailable. The updated function was deployed to `cloud1-d9gb0sjvg6a8d9864`; `cloud functions info` reports `Active` on `Nodejs16.13`, currently with timeout `3`.
- Latest runtime verification after AI-ready deploy: direct Mini Program runtime call to `interpretDream` returned `ok: true`, provider `cloudbase-static`, title `钥月`, and profile summary `Runtu · 摩羯 · 云端梦卡`. WeChat DevTools preview still passes with AppID `wx61800035c4e1a092` and package size `53.1 KB / 54,362 bytes`.
- Latest page-flow verification after AI-ready deploy: automator completed home profile entry -> new dream sample -> result page with source `cloud`, title `潮钥`, generated share image, and local archive update. Forced result-page share creation returned `/pages/share/index?id=card-1781340711166-29550s`, and opening that share page loaded CloudBase payload title `潮钥`, card no `NO. 001`, theme `tide`, and symbols `清水`, `钥匙`, `月光`, `鸟`, `图书馆`.
- Latest provider-trace update: Mini Program dream records now store `interpretationProvider` from the cloud function result, and analytics sends the provider with `interpretation_success`. Local checks pass, WeChat DevTools preview passes with package size `53.2 KB / 54,427 bytes`, and automator verified a generated result/archived dream with `interpretationProvider: cloudbase-static`. This gives the real-AI verification a concrete signal: after CloudBase env setup, the same field should become `deepseek` or `openai-compatible`.
- Latest AI health-check update: `interpretDream` now supports `{ healthCheck: true }`, returning safe provider diagnostics without exposing secrets. The updated function was deployed successfully with package size `7.3 KB`. Automator invoked the deployed function and got `type: interpretDream.aiHealth`, `provider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, `requestTimeoutMs: 18000`, `strictAi: false`, and `fallbackProvider: cloudbase-static-fallback`.
- Latest AI readiness guardrail: added `npm run check:ai-readiness`, which verifies the `interpretDream` provider/health-check contract, confirms the CloudBase AI setup docs include required env and health-check details, and scans Mini Program runtime files to ensure server-side AI provider markers or likely API key literals are not present. It passed across 32 Mini Program runtime files. Latest local checks and WeChat preview still pass; preview package size remains `53.2 KB / 54,427 bytes`.
- Latest AI provider runbook: added `docs/AI_PROVIDER_RUNBOOK.md` with the exact CloudBase console configuration, expected `{ healthCheck: true }` outputs, real interpretation verification steps, and failure triage for missing keys, fallback provider responses, strict mode, timeout, model, and base URL issues. `npm run check:ai-readiness` now verifies this runbook stays aligned with the code contract.
- Latest AI readiness behavior check: `npm run check:ai-readiness` now loads the `interpretDream` cloud function in a local mocked CommonJS/CloudBase environment and executes `{ healthCheck: true }` for both static mode and a mock DeepSeek env. It asserts `providerConfigured: false` for static mode and `providerConfigured: true`, `model: deepseek-chat`, `baseUrlHost: api.deepseek.com`, and `requestTimeoutMs: 21000` for the DeepSeek scenario.
- Latest AI failure-path readiness check: `npm run check:ai-readiness` now also executes normal static interpretation, missing-key DeepSeek fallback, strict-mode provider error, and high-risk dream-text safety blocking in the mocked cloud function environment. This verifies the Mini Program should keep working with `cloudbase-static-fallback` when provider env is incomplete, while still stopping explicit safety blocks.
- Latest Mini Program AI health wrapper: added `cloudBase.aiHealth(callback)`, which calls `interpretDream` with `{ healthCheck: true }`. `npm run check:miniprogram` now covers the wrapper through the mocked CloudBase adapter. WeChat DevTools automator verified the real Mini Program runtime can `require('utils/cloudBase')` and call `cloudBase.aiHealth()`, returning deployed cloud diagnostics: `provider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, and `requestTimeoutMs: 18000`.
- Latest Mini Program diagnostics page: added hidden route `/pages/diagnostics/index` for checking CloudBase and AI provider state from WeChat Developer Tools. Automator opened the route and verified `cloudReady: true`, `cloudHealth.ok: true`, `collections: 5`, `aiProvider: cloudbase-static`, `providerConfigured: false`, `hasApiKey: false`, and visible diagnostic nodes. Latest preview package size is `57.8 KB / 59,184 bytes`.
- Latest DevTools diagnostics condition: added a project compile condition named `AI 诊断页` targeting `pages/diagnostics/index`. `npm run check:miniprogram` verifies the condition and route. WeChat DevTools preview still passes with AppID `wx61800035c4e1a092`, package size `57.8 KB / 59,184 bytes`, and automator reopened the diagnostics route with `cloudReady: true`, `cloudHealth.ok: true`, `provider: cloudbase-static`, `providerConfigured: false`, and `collections: 5`.
- Latest Mini Program release check: added `npm run check:mini-release`, which runs AI readiness, CloudBase readiness, Mini Program MVP contract, dream-result contract, and TypeScript checks in sequence. The command passed, followed by `git diff --check` and WeChat DevTools preview with AppID `wx61800035c4e1a092` and package size `57.8 KB / 59,184 bytes`.
- Latest AI smoke-test capability: `interpretDream` now supports `{ smokeTest: true }` for one explicit provider schema test after CloudBase env setup. Added `cloudBase.aiSmokeTest(callback)` and an `AI SMOKE TEST` action on `/pages/diagnostics/index`. The updated cloud function deployed successfully with package size `7.6 KB`; `cloud functions info` reports `Active` on `Nodejs16.13`, still with platform timeout `3`. Automator ran the diagnostics smoke test before provider setup and got the expected safe result: `smokeOk: false`, `smokeProvider: cloudbase-static`, `smokeReason: static_provider`, while `cloudHealth.ok` stayed `true`. Latest preview package size is `59.2 KB / 60,620 bytes`.
- Latest smoke-test safety update: diagnostics `AI SMOKE TEST` now asks for confirmation when `providerConfigured` is true, because it sends one real provider request after AI setup. When the provider is still static/unconfigured it runs directly. `npm run check:mini-release`, `git diff --check`, and WeChat DevTools preview passed; latest preview package size is `59.5 KB / 60,963 bytes`. A final automator recheck of the diagnostics button was not run because the current Codex usage limit blocked another GUI automation call.
- Latest release handoff update: added `docs/MINI_PROGRAM_RELEASE_CHECKLIST.md` and refreshed `docs/CLOUDBASE_DEPLOYMENT.md` so the final real-AI setup is an explicit checklist: run `npm run check:mini-release`, preview with AppID `wx61800035c4e1a092`, set CloudBase provider env vars, raise `interpretDream` timeout, verify the diagnostics health check, run one confirmed `AI SMOKE TEST`, then test real-device dream generation and cross-session share.
- Latest local verification on 2026-06-14: `npm run check:mini-release` passed, `git diff --check` passed, and WeChat DevTools `preview` passed with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`.
- Latest real-AI verification attempt on 2026-06-15: `npm run check:mini-release` passed, `git diff --check` passed, and WeChat DevTools `preview` passed with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`. WeChat DevTools CLI confirmed CloudBase environments `cloud1-d9gb0sjvg6a8d9864` and `onerio-d3g5kuewjff567707`; `interpretDream` in `cloud1-d9gb0sjvg6a8d9864` is `Active` on `Nodejs16.13` but still had `timeout: 3`. The installed DevTools CLI exposes only cloud function `list/info/deploy/inc-deploy/download`, and this machine does not have `tcb`, `cloudbase`, or `tccli`, so provider environment variables and timeout need to be set in the CloudBase console. DevTools automator could not reconnect to `ws://127.0.0.1:9420` because the current project window is not opened with automation enabled.
- Latest CloudBase console update on 2026-06-15: user configured `interpretDream` from the WeChat Developer Tools cloud function configuration dialog. CLI verification now reports `interpretDream` is `Active`, runtime `Nodejs16.13`, and `timeout: 30`. `npm run check:mini-release` passed again, and WeChat DevTools `preview` passed again with AppID `wx61800035c4e1a092`, package size `59.5 KB / 60,963 bytes`. Runtime AI health/smoke test still needs to be checked from the Mini Program diagnostics page because the DevTools automator port is not enabled.
- Latest runtime AI confirmation on 2026-06-15: user confirmed the Mini Program diagnostics page after configuring `interpretDream` with DeepSeek provider env vars. The expected target state is `provider: deepseek`, `providerConfigured: true`, `hasApiKey: true`, `model: deepseek-v4-flash`, `baseUrlHost: api.deepseek.com`, and `requestTimeoutMs: 18000`; user also confirmed after the requested diagnostics/smoke-test step. CLI recheck still reports `interpretDream` as `Active`, runtime `Nodejs16.13`, `timeout: 30`.
- Latest Mini Program certification update on 2026-06-15: user started WeChat Mini Program account certification and the application is now waiting for review. During certification review, preview/dev verification can continue, but public sharing/release behavior may remain limited until certification completes.
- Latest AI image-generation update on 2026-06-16: added CloudBase cloud function `generateDreamImage`, which calls an OpenAI-compatible image provider using server-side env vars, uploads generated images to CloudBase storage under `generated-dream-images/`, and returns a temporary URL for the Mini Program card surface. Result page now calls `cloudBase.generateDreamImage` with the interpretation `image_prompt`, displays the generated image on the card when available, and falls back to local symbolic card art if generation fails. The function was updated to match the GRSAI Apifox docs for `POST /v1/api/generate`, including `aspectRatio`, `replyType: json`, `results[0].url`, and async polling through `/v1/api/result?id=...`. `npm run check:mini-release` passed. The updated cloud function deployed successfully to `cloud1-d9gb0sjvg6a8d9864`; latest deploy package size is `2.9 KB`. WeChat Developer Tools only allows 1-60 seconds for cloud function timeout, so `generateDreamImage` now uses a 55-second internal request budget. CLI still reports `generateDreamImage` timeout as `3`, so CloudBase console configuration is still required before real image generation can work reliably.
- Latest image-provider configuration confirmation on 2026-06-16: user moved image provider env vars from `interpretDream` to `generateDreamImage`. CLI now confirms both `interpretDream` and `generateDreamImage` are `Active`, runtime `Nodejs16.13`, timeout `60`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `61.6 KB / 63,056 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png` for real-device image-generation testing.
- Latest image-timeout fix on 2026-06-16: diagnostics `IMAGE TEST` on device returned `image reason: provider_error` and `image message: image provider timeout`. Updated `generateDreamImage` so GRSAI `/v1/api/generate` gets up to 45 seconds for the initial provider request while keeping the total internal budget at 55 seconds for the 60-second WeChat cloud function limit. `node --check`, `npm run check:miniprogram`, and `git diff --check` passed. The updated cloud function deployed successfully with package size `3.1 KB`. A post-deploy `cloud functions info` recheck was blocked by current Codex usage limits, so verify timeout/function state later when CLI access resumes or from WeChat Developer Tools.
- Latest result-card image retry update on 2026-06-16: real-device diagnostics showed `IMAGE TEST` as `image ok: true` and `image url: ready`, confirming the image provider configuration works. One existing result card still displayed the local fallback overlay with `provider_error`, likely from a previous failed request or prompt-specific provider failure. Added a result-page `重新生成画面` action that clears the failed image state and calls `generateDreamImage` again for the same dream card. `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check` passed. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.2 KB / 66,779 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest image-timeout tightening on 2026-06-22: real-device diagnostics again showed `IMAGE TEST` returning `provider timeout`, which confirms the request reaches the image provider but the provider does not respond within the WeChat cloud function budget. Tightened `generateDreamImage` defaults from vertical full-card image generation to a faster square tarot illustration panel: default size/aspect ratio is now `1024x1024`, prompt/style text is shorter and focused on hand-drawn tarot illustration, and the local dream oracle/image smoke test now sends only core symbols instead of long narrative prompts. `node --check`, `npm run check:miniprogram`, `npm run check:dream`, `npm run check:mini-release`, and `git diff --check` passed. The updated `generateDreamImage` cloud function deployed successfully to `cloud1-d9gb0sjvg6a8d9864` with package size `3.2 KB`, and WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.2 KB / 66,788 bytes`.
- Latest GRSAI model switch on 2026-06-28: user asked to switch image generation to the nanobanana model family and provided the GRSAI model dashboard. Updated `generateDreamImage` default model to `nano-banana-fast` for the Mini Program's faster square tarot illustration panel. Added model normalization so stale CloudBase env values `gpt-image-1.5` and `gpt-image-2` are mapped to `nano-banana-fast`, while `nanobanana`, `nanobanana-fast`, `nanobanana-2`, and `nanobanana-pro` aliases resolve to the corresponding GRSAI `nano-banana*` model names. Diagnostics now reports both `requestedModel` and effective `model`, so stale CloudBase env overrides can be seen on-device. Updated CloudBase/release docs and README examples to use `OPENAI_IMAGE_ENDPOINT_URL=https://grsaiapi.com/v1/api/generate`, `OPENAI_IMAGE_MODEL=nano-banana-fast`, and `1024x1024` image/aspect values. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:cloudbase`, `npm run check:mini-release`, and `git diff --check`. The updated `generateDreamImage` function deployed successfully to `cloud1-d9gb0sjvg6a8d9864` with package size `3.3 KB`; WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `65.9 KB / 67,450 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest generateDreamImage dependency fix on 2026-06-28: real-device diagnostics showed `image reason: cloud_call_failed` and `Cannot find module 'wx-server-sdk'` for `generateDreamImage`, meaning the cloud function was crashing before reaching the image provider. The function already had `wx-server-sdk` in `package.json`, but earlier deploys uploaded only the source files, so the runtime dependency was missing. A local `npm install --omit=dev` proved the missing dependency, but uploading local `node_modules` caused a WeChat CLI `EISDIR` packaging error. Redeployed `generateDreamImage` with WeChat Developer Tools `--remote-npm-install`, letting CloudBase install npm dependencies in the cloud. The deployment succeeded with package size `16.7 KB`; local temporary `node_modules` was removed afterward. `npm run check:mini-release` passed and WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`.
- Latest nano-banana API adapter update on 2026-06-28: real-device diagnostics reached GRSAI with `image model: nano-banana-fast`, `image size: 1024x1024`, and `image key: true`, but `IMAGE TEST` returned provider error `400 {"status":"failed","error":"generate failed"}` from the generic `/v1/api/generate` endpoint. Updated `generateDreamImage` so `nano-banana*` models use the GRSAI nano-banana-specific endpoint `POST /v1/draw/nano-banana`, then poll `POST /v1/draw/result` for task completion. Non-nano image models still use the existing `/v1/api/generate` flow. Added local acceptance checks for the nano-banana draw/result endpoints. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` with `--remote-npm-install`; deployment succeeded with package size `17.2 KB`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest nano-banana response parser fix on 2026-06-28: after switching to the nano-banana-specific GRSAI endpoint, real-device diagnostics returned `Unexpected token d in JSON at position 0`, indicating the provider returned a non-standard JSON body, likely `data:`/SSE-style response text. Updated `generateDreamImage` response parsing to support plain JSON and `data:` event-stream payloads, keeping the last valid JSON event when multiple `data:` lines are returned. Redeployed `generateDreamImage` with `--remote-npm-install`; deployment succeeded with package size `17.5 KB`. Verification passed: `node --check`, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `66.6 KB / 68,180 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest real-device image success and composition tuning on 2026-06-28: user confirmed diagnostics `IMAGE TEST` with `image ok: true` and a real dream result card rendered an AI image. The image style is close to the intended hand-drawn tarot direction, but the model generated a complete tarot card inside the Oneiro card frame, causing nested-card composition and excess blank margins. Updated `generateDreamImage` default style and prompt builder to request only a full-bleed square inner illustration panel, explicitly excluding complete card mockups, borders, frames, blank margins, text, letters, and watermarks. Updated the local dream oracle and `interpretDream` image-prompt contract to the same inner-panel language, and changed Canvas share-card drawing to center-crop AI images instead of stretching them. Verification passed: `node --check` for `generateDreamImage` and result page, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` with `--remote-npm-install` and redeployed `interpretDream`; both deployments succeeded. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `67.2 KB / 68,801 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Latest 3:4 dream-card product update on 2026-07-08: user confirmed the card direction should prioritize a social-friendly 3:4 ratio, with two export modes: a low-text collectible dream card and a full-reading long image. Updated the Mini Program result page so the visible dream art is vertical 3:4, the default share/save Canvas exports a 900 x 1200 collectible card with only image, title, profile summary, one omen line, symbols, and date, and a new `保存完整解读` button exports a 900 x 2800 long image with the collectible card plus dream translation, subconscious clue, reality mirror, metaphysical resonance, and wake-up question. WeChat sharing continues to use the collectible card, not the long reading. Updated `generateDreamImage` defaults and prompts from square artwork to vertical 3:4 Rider-Waite-inspired vintage ink/watercolor tarot illustration panels, mapping stale `1024x1024`/`1024x1536` env values to `768x1024`; nano-banana calls now request `aspect_ratio: '3:4'`. Updated local dream oracle, `interpretDream` image-prompt contract, diagnostics image smoke prompt, README, CloudBase docs, and Mini Program contract checks accordingly. Verification passed: `node --check` for result page and both cloud functions, `npm run check:miniprogram`, `npm run check:mini-release`, and `git diff --check`. Redeployed `generateDreamImage` and `interpretDream` to `cloud1-d9gb0sjvg6a8d9864`; both deployments succeeded. WeChat DevTools preview passed with AppID `wx61800035c4e1a092`, package size `69.6 KB / 71,251 bytes`, and the latest QR was opened from `/private/tmp/oneiro-preview.png`.
- Recommended next development step: scan the latest preview QR, create a fresh dream card, test both `保存收藏梦卡` and `保存完整解读`, and judge whether the 3:4 AI illustration now feels closer to a tarot deck while still avoiding AI-generated text or nested card frames.

## Useful Commands

```bash
npm run build
npm run check:cloudbase
npm run check:mini-release
npm run check:miniprogram
npm run check:dream
npm run typecheck
npx vercel env ls
npx vercel logs https://oneiro-psi.vercel.app --no-follow --limit 20 --expand
npx vercel --prod --yes
```
