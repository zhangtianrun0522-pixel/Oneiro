# Oneiro Product Strategy

Last updated: 2026-07-10

> 2026 市场、命理路线、自然传播与 90 天验证决策见 `docs/MARKET_AND_PRODUCT_DECISION_2026.md`。

## Product Bet

Oneiro should validate in China as a WeChat Mini Program, not as a standalone web app. It must be positioned as a private dream-reflection product with Eastern cultural texture, not as an AI fortune-telling service. North America is the second market after retention is proven.

The strongest product shape is not generic "AI dream interpretation" alone. Oneiro's first value must still be dream interpretation, but the interpretation should be personal, emotionally useful, and connected to the user's metaphysical profile. The stronger shape is:

> A personal dream oracle that interprets a private dream through symbolism, emotion, and metaphysical context, then turns it into a beautiful card the user wants to save, revisit, and share.

The product stack should stay ordered this way:

1. Personalized dream interpretation: explain the dream's images, emotions, symbols, and current-life signal.
2. Beautiful dream card: turn the interpretation into a collectible, shareable object.
3. Dream journal and card archive: create a record users want to keep building.
4. Long-term personal memory: combine recurring dream patterns, user feedback, and an explicitly bounded birth-rhythm lens. Full bazi or astrology should only be added later as optional, correctly calculated systems.

The first version should feel like a tiny morning ritual inside WeChat:

1. Wake up.
2. Open Oneiro from WeChat.
3. Speak or type a dream in under two minutes.
4. Receive a poetic, personal interpretation quickly.
5. Save or share a 9:16 dream card.
6. Come back over time for recurring symbols, emotional patterns, and metaphysical self-understanding.

## Why WeChat First

WeChat is the right first channel because Oneiro depends on low-friction mobile usage and social sharing:

- Users can try it without installing an app.
- Sharing dream cards to chats or Moments is a native behavior.
- Morning usage can be triggered by WeChat reminders and saved mini program entry points.
- Anonymous or lightweight login can be based on WeChat identity without building a full account system first.
- Payments, subscriptions, and member benefits can be added later without rebuilding the product channel.

This also changes the product priorities. The MVP should optimize for WeChat completion and sharing, not desktop web polish.

## Target User

Primary user:

- Young mobile-first users who enjoy self-exploration, astrology, MBTI-like identity rituals, journaling, sleep, dreams, and beautiful shareable images.
- They do not want clinical language. They want something intimate, aesthetic, emotionally accurate, and safe to post.

Secondary user:

- Creators and emotionally reflective users who treat dreams as creative material.
- They may use Oneiro as a personal archive of images, symbols, moods, and story fragments.

## User Attraction Points

### 1. Personalized Dream Interpretation

The first value is still dream interpretation. Users come because they want to know what the dream means and what it says about them right now.

The interpretation should combine:

- Dream images and narrative.
- Emotional weather.
- Core symbols and archetypes.
- Current-life mirror.
- One gentle daily action.
- A lightweight metaphysical resonance based on birth data.

The tone should avoid clinical diagnosis and fatalistic prediction. Oneiro should feel like a poetic oracle that helps users understand themselves, not a tool that scares them.

### 2. Beautiful Dream Cards

The most viral surface is the card, not the interpretation page.

The card should be immediately recognizable:

- 9:16 vertical format.
- A symbolic dream image.
- A short title.
- 3 to 5 dream symbols.
- Emotional weather.
- One small daily ritual.
- Oneiro branding that feels collectible, not loud.

The card should be safe to share without exposing the full dream text by default.

### 3. The App Gets More Personal Over Time

Oneiro should remember recurring symbols, emotional weather, people, places, and themes. The product becomes more useful after 7, 14, and 30 dreams.

Examples:

- "Water has appeared in 6 of your last 10 dreams."
- "Your dreams this week moved from pursuit to threshold imagery."
- "You often dream of libraries when you are about to make a creative decision."

This is where Oneiro's metaphysical layer becomes a retention engine. Birth date, birth time, and birth place are not just registration fields; they create the user's private metaphysical baseline. Over time, Oneiro should connect dream patterns with zodiac, bazi, zi wei, moon phase, and personal memory in a way that feels emotionally accurate and personally meaningful.

### 4. Private But Shareable

Dreams are intimate. The product should default to privacy, then allow selective sharing:

- Private journal by default.
- Share card without original dream text.
- Optional public share page.
- Delete and unshare controls.
- Clear warning before sharing full interpretation.

### 5. Morning Ritual

The product should not feel like a productivity app. It should feel like a soft daily ritual:

- Fast entry.
- Calm loading states.
- Gentle interpretation.
- Small daily action.
- Optional reminder.

## WeChat Mini Program MVP

The first WeChat version should be narrow and complete.

### Must Have

- WeChat login or cloud openid identity.
- First-run profile: nickname and birth date required; birth time and place optional.
- Dream input with text and optional voice-to-text later.
- `POST interpretDream` cloud function.
- Personalized interpretation that combines dream symbolism, emotional weather, current-life mirror, and a lightweight birth-profile resonance.
- Text interpretation returns before image generation completes.
- Image generation continues asynchronously.
- Dream card result page.
- Save latest dreams to cloud database.
- Save generated image to cloud storage.
- Export dream card as an image with Canvas.
- Share to WeChat chat with a card image and share path.
- Recent dream archive.
- Basic content safety checks for user dream text and generated/shareable content.
- Basic event analytics: start, submit, interpretation success/fail, image success/fail, export, share, revisit.

### Should Not Have In V1

- Full social feed.
- Comments.
- Friend graph.
- Complex gamification.
- Public dream marketplace.
- Full astrology engine.
- Web dashboard.
- Native iOS/Android app.

## Recommended Architecture

### Client

Use Taro + React + TypeScript for the Mini Program client.

Reasons:

- Keeps a React mental model close to the current web prototype.
- Allows future H5 reuse if needed.
- Still compiles to WeChat Mini Program pages.
- Keeps shared TypeScript types practical.

The current Vite web UI should be treated as a prototype and verification surface, not as code that can be directly shipped to WeChat. DOM-specific pieces such as `html2canvas`, browser `localStorage`, and normal image loading need Mini Program-native replacements.

Mini Program client modules:

- `pages/home`: profile and latest dream entry.
- `pages/new-dream`: dream text input.
- `pages/result`: result card and interpretation.
- `pages/archive`: dream history.
- `pages/patterns`: recurring symbols and emotional weather.
- `pages/share`: public or semi-public shared dream card.
- `pages/settings`: privacy, data deletion, reminder preferences.

### Backend

Use WeChat CloudBase / Mini Program cloud development as the first backend layer.

Cloud functions:

- `login`: bind openid and user profile.
- `interpretDream`: validate dream text, run content safety, call AI provider, normalize result, store interpretation.
- `generateDreamImage`: call image provider, store final image in cloud storage, update dream entry.
- `getDreamArchive`: return user's dream history.
- `getDreamPatterns`: summarize recurring symbols and emotional weather.
- `createShareCard`: create share-safe payload and image.
- `deleteDream`: delete or soft-delete private dream data.

Important rule:

AI provider keys, WeChat app secret, Supabase keys, and image gateway keys must never exist in Mini Program frontend code.

### Data Storage

Use cloud database for V1. Keep the schema simple and document-like.

Collections:

- `users`
  - `openid`
  - `nickname`
  - `birthDate`
  - `birthTime`
  - `birthPlace`
  - `createdAt`
  - `lastActiveAt`

- `dream_entries`
  - `userId`
  - `dreamText`
  - `dreamTextSafeStatus`
  - `status`: `interpreting`, `image_pending`, `ready`, `failed`
  - `result`
  - `imageFileId`
  - `symbols`
  - `emotionalWeather`
  - `createdAt`
  - `updatedAt`

- `generated_assets`
  - `dreamId`
  - `kind`: `dream_image`, `share_card`
  - `fileId`
  - `provider`
  - `promptVersion`
  - `createdAt`

- `share_pages`
  - `dreamId`
  - `userId`
  - `slug`
  - `visibility`: `card_only`, `card_and_reading`
  - `revokedAt`
  - `createdAt`

- `events`
  - `userId`
  - `eventName`
  - `dreamId`
  - `metadata`
  - `createdAt`

### AI Layer

Keep a provider-neutral AI layer.

Interpretation pipeline:

1. Validate input.
2. Run content safety on user text.
3. Build prompt with `prompt_version`.
4. Call provider.
5. Parse JSON.
6. Normalize result.
7. Store result.
8. Return interpretation immediately.
9. Generate image asynchronously.

Output schema should remain close to the current `DreamResult`:

- `title`
- `image`
- `emotional_weather`
- `symbols`
- `underneath`
- `echo`
- `mirror`
- `integration_question`
- `one_small_act`
- `image_prompt`
- `omens`
- `sound_config`

Add later:

- `safety_level`
- `share_summary`
- `pattern_tags`
- `personal_memory_refs`

### Image And Card Generation

For V1:

- Generate dream image through backend provider.
- Store image in cloud storage.
- Render the share card in the Mini Program using Canvas.
- Save the rendered card to a temporary local path for user export/share.

Do not rely on DOM screenshot libraries in the Mini Program.

### Content Safety

Because Oneiro uses user-generated dream text and shareable generated content, safety must be in the backend path:

- Text safety before interpretation.
- Text safety before public sharing.
- Image safety before shareable/public image storage when feasible.
- AI prompt policy that avoids diagnosis, intimidation, fatalism, sexual content involving minors, self-harm encouragement, and medical claims.

For rejected content, the product tone should stay gentle:

> 这个梦里有一些暂时不适合生成公开解读的内容。你仍然可以把它保存在私人日记里，或换一种更模糊的方式描述。

## Market And Growth Strategy

### Acquisition

Start with WeChat-native loops:

- Shareable dream cards.
- "今日梦境天气" card.
- Friends can open a shared card and generate their own.
- Invite prompt after export, not before the user receives value.
- Seasonal campaigns: full moon, new moon, Mercury retrograde, New Year dream archive.

### Activation

Activation metric:

- User completes first dream card within 3 minutes.

Supporting metrics:

- Profile completion rate.
- Dream submit rate.
- Interpretation success rate.
- Image completion rate.
- Export rate.
- Share rate.

### Retention

Retention loop:

- Morning reminder.
- Recent dream archive.
- Weekly pattern report after 3+ dreams.
- Monthly symbol report after 7+ dreams.
- "A symbol returned" notification when a recurring image appears again.

### Monetization

Do not monetize before the first sharing/retention loop is proven.

Potential Pro features:

- More dream interpretations per month.
- High-definition card export.
- Premium card styles.
- Longer personal memory.
- Weekly and monthly dream pattern reports.
- Private cloud archive.
- Advanced image regeneration.

## Development Roadmap

### Phase 0: Current Web MVP Closeout

- Commit the current public-sharing MVP polish.
- Keep the Vite web app as a prototype and acceptance harness.
- Ensure `npm run check:dream`, `npm run typecheck`, and `npm run build` pass.

### Phase 1: Mini Program Technical Spike

- Create a Mini Program workspace, preferably `miniprogram/`.
- Choose Taro + React + TypeScript unless a native Mini Program prototype proves much simpler.
- Implement static pages using the current acceptance fixture.
- Rebuild the dream card UI with Mini Program-compatible layout.
- Prove Canvas export for one 9:16 card.
- Validate that the first result screen still feels like a strong interpretation, not only a visual card.

Exit criteria:

- A user can open the Mini Program preview, submit the fixture dream, read a meaningful interpretation, see the dream card, and save/share a generated card image.

### Phase 2: Cloud Backend MVP

- Add CloudBase environment.
- Implement login/openid binding.
- Implement `interpretDream` cloud function.
- Implement result normalization in shared backend code.
- Add a minimal birth-profile layer: zodiac/sign basics and simple five-element or metaphysical keywords derived from user profile fields.
- Store dreams in cloud database.
- Store generated images in cloud storage.
- Add basic content safety.

Exit criteria:

- A real user can submit a dream from WeChat and receive a persisted, personalized interpretation result.

### Phase 3: Sharing MVP

- Add share-safe card payload.
- Add share path and shared result page.
- Add export/share events.
- Add unshare/delete controls.

Exit criteria:

- A shared dream card can bring a new user into Oneiro and let them create their own card.

### Phase 4: Retention MVP

- Add archive search.
- Add recurring symbol extraction.
- Add weekly pattern report.
- Add reminder opt-in.

Exit criteria:

- A user with 3+ dreams receives a meaningful pattern view that feels more personal than a single interpretation.

## Immediate Next Steps

1. Finish visual verification of the current Mini Program static flow in WeChat Developer Tools.
2. Tune the result page so the first screen clearly delivers personalized dream interpretation before the card/export actions.
3. Commit the Mini Program static flow and Canvas card export baseline.
4. Define the first lightweight metaphysical profile contract from nickname, birth date, optional birth time, and optional birth place.
5. Add CloudBase login/openid and move static interpretation to an `interpretDream` cloud function.
6. Replace local archive storage with cloud database only after the Mini Program UI and interpretation contract are proven.

## Technical Risks

- WeChat Mini Program rendering is not DOM rendering; current card export code must be rebuilt.
- External AI and image domains must be called from backend/cloud functions, not the client.
- Generated images should be stored in cloud storage to avoid client-side domain and availability issues.
- Content safety and review requirements can affect launch timing.
- Dream content is sensitive; privacy copy and deletion controls are product-critical, not polish.

## Reference Links

- WeChat login docs: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html
- WeChat share docs: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html
- WeChat content security docs: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/msgSecCheck.html
- WeChat cloud development docs: https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
