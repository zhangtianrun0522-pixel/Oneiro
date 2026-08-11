# CloudBase Deployment Checklist

This checklist is for the WeChat Mini Program MVP under `miniprogram/`.

## Current Verified State

- Mini Program AppID: `wx61800035c4e1a092`
- CloudBase environment id: `cloud1-d9gb0sjvg6a8d9864`
- WeChat DevTools `preview` passes with package size `209.6 KB / 214,662 bytes`.
- Local release checks pass with `npm run check:mini-release`.
- Cloud function source folders exist and have been deployed to the real CloudBase environment.
- `cloudHealth` exists to create/check required collections, write a health event, upload a healthcheck asset under `share-cards/`, and record asset metadata.
- Latest verified `cloudHealth` run: `1784446424263`, covering the original 9 required collections and storage. The progressive image2 flow additionally uses the private `image_generation_jobs` collection.
- Latest verified business cloud flow:
  - openid: `oiMk63bCBgTZuiqu7caFt-ziUirA`
  - `saveProfile` id: `f5f35ce96a2d15780052d3df25887e4d`
  - `saveDream` id: `8efe4ec36a2d157c00e7eae2178b7fd8`
  - `createShareCard` id: `8efe4ec36a2d157f00e7eb1f668ea360`
  - share id: `card-1781339519031-iph0sh`
  - share path: `/pages/share/index?id=card-1781339519031-iph0sh`

## Required CloudBase Environment

Use the CloudBase environment in WeChat Developer Tools for AppID `wx61800035c4e1a092`.

Current environment id:

```text
ENVID=cloud1-d9gb0sjvg6a8d9864
```

The CLI requires this id for cloud function list/deploy commands.

## Verified Collections

These database collections have been created and read by `cloudHealth`:

- `users`
- `dream_entries`
- `life_notes`
- `profile_snapshots`
- `profile_memory_state`
- `deletion_jobs`
- `events`
- `share_pages`
- `generated_assets`
- `image_generation_jobs`

Keep every database collection private to the Mini Program client. Public card reads must go through `getShareCard`, which returns only the share-safe payload and enforces revocation; do not grant direct public read access to `share_pages`, because its server record also contains ownership and source fields. Keep CloudBase storage private as well and expose only temporary URLs created by trusted cloud functions.

Latest live rule probe: a server-created test `dream_entries` record and `share_pages` record were readable through their cloud functions, while direct Mini Program database queries by exact `localId` and `slug` both returned zero rows. The test dream was then deleted and its share revoked.

## Verified Storage

Storage access has been verified for:

```text
share-cards/
```

`cloudHealth` uploaded `share-cards/healthcheck-1781339229268.txt`. User share cards now use a local Canvas image for WeChat forwarding; `createShareCard` stores only a server-projected text/card payload and does not trust or retain client-provided cloud file ids.

## Real AI Interpretation Provider

`interpretDream` is provider-ready. Its code default remains a static fallback so the Mini Program keeps working when provider configuration is unavailable. The current verified cloud environment is configured for DeepSeek (`deepseek-v4-flash`) and passed both smoke and full-reading calls without fallback:

For the step-by-step provider setup and failure triage, see `docs/AI_PROVIDER_RUNBOOK.md`.

```text
INTERPRET_PROVIDER=static
```

To enable DeepSeek in the CloudBase function runtime, configure these environment variables on the `interpretDream` cloud function:

```text
INTERPRET_PROVIDER=deepseek
DEEPSEEK_API_KEY=<rotate-and-set-in-cloudbase-only>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERPRET_TIMEOUT_MS=45000
```

OpenAI-compatible providers are also supported through:

```text
INTERPRET_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=<set-in-cloudbase-only>
OPENAI_COMPATIBLE_BASE_URL=https://example.com/v1
OPENAI_COMPATIBLE_MODEL=<model-name>
```

Compatibility aliases are also accepted for the OpenAI-compatible path: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, or `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.

### Daily interpretation ceiling

`interpretDream` refuses more than `INTERPRET_DAILY_LIMIT` successful readings per
openid per day (default `3`, day boundary in Beijing time). Set it only if you
want a different ceiling:

```text
INTERPRET_DAILY_LIMIT=3
```

What it does **not** limit is recording. A dream is saved before interpretation
runs, so an over-quota user still keeps the dream and can interpret it the next
day from 梦册. Only dreams that actually produced a reading (`status: 'ready'`)
count, so failed or retried calls never consume a user's quota. The count is
read from `dream_entries`; if that query fails, or the caller has no openid
(login degraded to a local id), the request is allowed through — a miscounted
quota must never be the reason someone cannot interpret their dream.

Keep provider keys server-side in CloudBase only. Do not put them in Mini Program source files, `project.config.json`, or frontend storage. Dream semantics are model-only: if the provider is unavailable, missing a key, times out, or returns malformed JSON, `interpretDream` returns a retryable error without `result`. The original dream remains saved, and the result page offers “重新解读”. No local keyword classifier generates substitute symbols or interpretations.

The deployed `interpretDream` function keeps the CloudBase platform timeout at
60 seconds and clamps the provider request budget to `45000`-`50000` ms. The
default is `45000` ms, leaving time for response validation and persistence.
The Mini Program client waits up to `70000` ms for `interpretDream` results.

`interpretDream` also supports a safe provider health check:

```js
wx.cloud.callFunction({
  name: 'interpretDream',
  data: { healthCheck: true }
});
```

The response intentionally does not expose secrets. It reports `provider`,
`providerConfigured`, `hasApiKey`, `model`, `baseUrlHost`, `requestTimeoutMs`,
`timeoutBudget`, and `fallbackProvider`. Provider failures also include a
stable `errorCode` (for example `provider_timeout`) plus `diagnostics` with
provider, model, request budget, and elapsed time. Before real AI setup it
should report `provider: cloudbase-static` and `providerConfigured: false`;
interpretation requests fail retryably rather than fabricating local results.
After real AI setup it should report `provider: deepseek` or
`provider: openai-compatible` and `providerConfigured: true`.

## 生图失败率怎么读

后台上那个「生图失败率」数的是**事件**，而事件的计法是偏的，三个原因都往一个方向偏：

- 有图的梦在 `requestDreamImage` 开头就短路了，不再发任何事件——一条成功的梦一辈子只贡献一次成功。
- 没图的梦每打开一次结果页就重新生一次，于是**每打开一次再记一次失败**。
- 失败后 4 秒还有一次自动重试，把同一次访问的失败再翻一倍。
- 还有一类根本不是生图失败：梦没同步上云、生图压根没开始，也记在同一个计数器里（`metadata.failureType === 'sync'`）。

所以那个百分比只能读作「管线有多颠簸」，不能读作「多少人没拿到图」。后者看诊断页的**「没有画面的梦」**：它由 `imageOutcomeByDream()` 从 `dream_entries` 直接数（`status: ready` 且 `result` 里既没有 `image_file_id` 也没有 `imageUrl`），一条梦无论被打开几次都只算一次。

失败原因由 `imageFailureBreakdown()` 按 `metadata.reason` 聚合，并单独报出其中属于同步问题的次数。这些数据一直都存着，只是此前没有任何地方聚合过——后台只有一个百分比，修哪儿全靠猜。

客户端那头给自动生图加了上限：同一条梦最多自动尝试 `MAX_AUTO_IMAGE_ATTEMPTS = 3` 次，之后显示失败态和「重新生成画面」。手动重试永远放行并重新给满一轮。计数存在 `oneiro:imageAttempts` 这个独立的 storage 里，不挂在梦上——挂上去会被 `safeDream` 的字段白名单丢掉，从云端刷回来就归零，上限形同虚设。

## Internal-test observation panel

The diagnostics page (`pages/diagnostics/index`) can show aggregate internal-test
metrics: memory-echo hit rate, the 1/3/5-dream retention funnel, interpretation and
image failure rates, and reading feedback. These read across **all** users, so both
`saveDream` actions behind them (`feedbackStats`, `internalStats`) are closed by
default and only answer openids listed explicitly on the `saveDream` cloud function:

```text
ADMIN_OPENIDS=<comma-separated openids; unset means nobody has access>
ADMIN_FEEDBACK_EXCERPTS=<'true' to also return 40-char dream excerpts; default off>
```

Open the diagnostics page to read your own openid off the top panel, then add it to
`ADMIN_OPENIDS`. Non-admins get `{ ok: false, reason: 'not_admin' }` and the page
renders no panel at all.

Dream text is the most private content in the product. `ADMIN_FEEDBACK_EXCERPTS` is
a separate switch on purpose — feedback type, timestamp and `promptVersion` are
enough to locate a bad reading, and that is what ships by default.

The memory-echo hit rate is computed from `interpretation_success` /
`interpretation_retry_success` events in the `events` collection, so it only covers
readings recorded after this build. Its denominator counts only readings where the
system actually found a verified repetition; a dream with no overlap against history
is correctly silent and is excluded.

## Real AI Image Provider

`interpretDream` now returns a structured `result.visual_plan`. `generateDreamImage` re-normalizes that plan against the owner-scoped stored dream, selects a relationship-based emotion palette and non-fixed composition, compiles the final `oneiro-seedream-dream-v2.0` prompt, uploads the generated bitmap under `generated-dream-images/`, and stores the full prompt, model, normalized plan, format/dimensions, and quality record in `generated_assets`.

Configure these environment variables on the `generateDreamImage` cloud function:

```text
IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=<set-in-cloudbase-only>
OPENAI_IMAGE_ENDPOINT_URL=<provider-images-endpoint>
OPENAI_IMAGE_MODEL=doubao-seedream-5-0-lite-260128
OPENAI_IMAGE_SIZE=1728x2304
OPENAI_IMAGE_ASPECT_RATIO=1728x2304
OPENAI_IMAGE_TIMEOUT_MS=55000
```

For the Seedream 5.0 Lite gateway, set its OpenAI-compatible base URL in `OPENAI_IMAGE_BASE_URL` or the full `OPENAI_IMAGE_ENDPOINT_URL`, and keep `OPENAI_IMAGE_MODEL=doubao-seedream-5-0-lite-260128`. The production request uses the verified Seedream payload shape (`1728x2304`, `sequential_image_generation=disabled`, URL response, no `quality` or `n` assumptions). The gateway key stays server-side in CloudBase only. The older `nano-banana-fast` adapter remains available when explicitly selected through the model environment variable.

The new visual system must pass the nine-card stability test before deployment: calm, anxious, and surreal dreams, three independent generations each. Pixel-level semantic checks such as unwanted text, focal clarity, face complexity, actual saturation, and thumbnail readability are currently recorded as `requires_vision_review`; only binary format and output geometry are enforced automatically.

The deployed `generateDreamImage` function now reports the 60-second platform maximum; keep `OPENAI_IMAGE_TIMEOUT_MS=55000` below that limit.

### Progressive image2 quality route

The Mini Program uses the synchronous Seedream 5.0 Lite call as the immediate image path. The optional progressive quality route remains independent: after the first image is available, the result page can submit `startQuality` and poll `pollQuality` while the user continues reading. A completed quality asset replaces the fast image; a failed or unavailable quality job leaves the Seedream image untouched.

Configure the quality route independently from the fast route on the same CloudBase function. These variables are optional; leaving them unset makes the action return `quality_unavailable` without changing the existing image path:

```text
QUALITY_IMAGE_ENABLED=1
QUALITY_IMAGE_PROVIDER=openai
QUALITY_IMAGE_API_KEY=<optional; falls back to OPENAI_IMAGE_API_KEY when omitted>
QUALITY_IMAGE_ENDPOINT_URL=<verified async image2 endpoint; do not use Rehdasu /v1/images/generations here>
QUALITY_IMAGE_RESULT_URL=<optional provider result endpoint>
QUALITY_IMAGE_MODEL=gpt-image-2
QUALITY_IMAGE_SIZE=768x1024
QUALITY_IMAGE_QUALITY=medium
QUALITY_IMAGE_TIMEOUT_MS=12000
```

The quality route is disabled unless `QUALITY_IMAGE_ENABLED=1`. The quality job is owner-scoped and idempotent. It stores only the provider task id, prompt metadata, status, and final CloudBase asset reference; it never stores API keys, base64 payloads, or temporary signed URLs.

Rehdasu's `/v1/images/generations` endpoint is synchronous and historically takes longer than the Mini Program request budget. `generateDreamImage` therefore returns `quality_sync_endpoint_unsupported` before making a paid request when that endpoint is configured. This limitation applies only to the optional quality channel; the verified Seedream 5.0 Lite synchronous path is the current production image channel.

### 语音识别（speechRecognize）

`speechRecognize` 调用腾讯云 ASR `SentenceRecognition`，需要 `TENCENT_ASR_SECRET_ID` /
`TENCENT_ASR_SECRET_KEY`。函数自己在 `ASR_REQUEST_TIMEOUT_MS`（15 秒）收口并返回
`recognize_timeout`，**控制台里这个函数的平台超时必须高于 15 秒**（建议 20 秒）；
低于它时函数会被平台直接掐断，客户端只能拿到一个没有原因的 `cloud_call_failed`，
线上就无法区分「ASR 慢」和「网络断」。部署或改动控制台配置后请复核该值。

客户端对 `cloud_call_failed` / `cloud_result_expired` / `client_timeout` /
`cloud_unavailable` / `recognize_timeout` 自动重试一次；识别类失败
（`empty_result` / `not_configured` / `too_long`）不重试。腾讯 ASR 的 `code`
会以 `providerErrorCode` 原样带回并进入 `voice_recognize_failed` 事件——
这是区分「音频有问题」和「账号/额度有问题」的唯一信号。

**长音频走云存储，不走请求体。** 超过 `SPEECH_UPLOAD_MIN_SECONDS`（8 秒）的
录音由客户端 `wx.cloud.uploadFile` 传到 `voice-clips/`，云函数收到的是 `fileID`，
它换成签名 URL 后以 `SourceType: 0` 交给腾讯 ASR，让腾讯在自己的网络里取音频。

这不是为了省流量，是为了消掉「越长越容易失败」：base64 走 `callFunction` 时同一段
字节要被搬两次（客户端上行一次、云函数再原样 POST 给腾讯一次），两段耗时都随时长
线性增长，而平台超时是一堵固定的墙，于是短音频过得去、长音频撞墙。改成 URL 之后
云函数的运行时长几乎与音频长度无关。上传失败会自动退回内联 base64，并在事件里带上
`uploadFallback`。

**60 秒是接口上限，不是产品选择。** `SentenceRecognition`（一句话识别）本身只接受
60 秒以内的音频，所以录音器的 `duration`、客户端的时长夹逼、云函数的 `too_long`
兜底全是在镜像同一个数（客户端两处都由 `MAX_RECORD_SECONDS` 统一）。微信
`recorderManager` 自己允许到 10 分钟，卡住的从来不是客户端。

到点时的处理有两条硬性约定，改动前先读：

1. **已经说出口的那 60 秒必须照常转成文字。** 撞上限不等于这段作废——「录音一长
   就失败」这条反馈里最伤人的正是整段消失。
2. **到点那一刻手指还按在圆环上**，所以这一次手势要就地作废（`voiceAutoStopped`）。
   之后那次松手只是「把手拿开」，不能再被读成取消或提交；漏掉这一步时它会置位
   `voiceStopAfterAuthorization`，于是下一次按住圆环整个变成空按。

界面在最后 `RECORD_WARN_SECONDS`（15 秒）改成倒数并说明「到点这段也会收下」。
上限本身可以接受，毫无预兆地到达不行。

真要支持更长的连续讲述，得换成腾讯的**录音文件识别**（`CreateRecTask` +
`DescribeTaskStatus`，异步、支持到小时级）。它收的同样是 URL，所以上面那条云存储
链路已经是它需要的地基；剩下的是异步任务与轮询，以及「松手就出文字」变成
「说完等一会儿」的交互改动。

`voice-clips/` 里存的是用户未经处理的原始语音，是这个产品里最私密的内容之一。
云函数无论识别成败都会 `deleteFile`；客户端在调用失败（云函数没跑成）时也会补一次
删除。**上线后请在存储控制台确认 `voice-clips/` 长期为空**——如果有残留，说明两条
删除路径都没生效，要优先修。

### AI 阶段画像

`profileMemory` 使用 `profile_snapshots` 保存自动发布的阶段画像、用户编辑、历史回溯和停用状态。它会复用 `INTERPRET_PROVIDER` / `DEEPSEEK_API_KEY` 等服务端配置；未配置或调用失败时生成朋友式确定性画像。生成成功的版本直接成为当前画像；只有 `status: confirmed`、`isCurrent: true` 且 `useInFutureReadings: true` 的画像会进入后续解读上下文。

用户编辑和历史回溯不会覆盖原快照，而是创建新的递增版本并移动 `profile_memory_state.currentSnapshotId`。历史旧草稿在读取时归入历史，不再作为待确认版本显示。

画像的纠偏入口是对话，不是输入框。「梦册」里的「这段不像我」会打开 `pages/dream-chat/index?portrait=1`，走 `interpretDream` 的 `chatAboutPortrait` 分支；用户在那里说的每一句原样存进 `life_notes`（`source: 'portrait_correction'`），下一次生成时作为高权重证据参与。手写覆盖画像的旧路径（`profileMemory` 的 `save` action）仍然受理并继续读取已存下的 `userEditedOriginal`，但客户端不再提供入口。

#### 现实记录的存活规则（life_notes）

记录永久保存，但只有一部分参与画像。以前的规则是「按时间取最新 10 条，第 11 条起归零」——一道切在时间顺序上的悬崖，唯一判据是谁更新。现在名额不变（画像只有 200 字，喂进四十条记录只会让模型去找它们的最大公约数），换的是选法：

- **退休**：`retiredAt` 非空的记录完全不参与。退休由生成画像那次调用顺带判定（`retiredNoteIds`），只在更晚的说法确实取代了它时才发生——「我在考虑出国」之后说了「决定不去了」，前一句退休。时间顺序判断不了这件事，只有读得懂内容的才判得了。退休不可逆，所以只受理**这次真的进过名额**的 id，模型编一个或翻出一条名额外的都不作数。
- **持续状态不衰减**：`durable` 为真的记录权重恒为 1，不随时间下降。这一条原来是一个用户手点的「标为重要」按钮（`pinnedAt` / `pinLifeNote`，已删除）——那是把系统该做的判断转嫁给用户，而且这道题本来就不该按「重不重要」分，该按「是一个状态，还是一件当时的事」分：「我在国外念书」一百二十天后照样成立，「昨天和我爸吵了一架」不是。判断由 `interpretDream` 在提取那一刻做出（`memory_candidates[].durable`，只认显式 `true`），用户什么都不用做。整理靠说话完成——后来说了「回国了」，前面那条走复述/退休自己出局。滥用有一道确定性闸门：正文里带明确时间落点（今天/昨天/这周/周三…）的一律按「当时的事」处理，否则一切都不衰减，选法就退回「最新的十条」。喂给模型的证据里这类记录带 `lasting: true`，并明确告诉它日期只说明用户哪天讲的。
- **复述**：被更晚一条说了同一件事的记录排到最后（不删）——两条说同一件事同时占名额，只会让画像把它读两遍。判定用已有的二元组相似度，阈值 0.3。
- **衰减**：其余按 `recencyWeight` 的四档阶梯（14/45/120 天）打分，反复被提起的乘以呼应加成。梦一直用着这套阶梯，此前从没用到记录上——梦是缓坡，记录是悬崖。

每次生成画像时，被选中的记录写上 `inUseAt`。「我」页据此把记录分成「正在影响」和「更早的」，显示的是上一版画像**真正喂进去的那些**，不是界面自己再猜一遍。`listLifeNotes` 的上限从 30 提到 200：30 条那会儿，超出的记录仍然存在、仍然可能影响画像，却在界面上看不见，用户没有任何办法清理他看不到的东西。

界面还按来源分组（用户原话 / 他点头认下的解读）。`source` 是旧版云函数会静默省略的字段，缺席时的默认值恰好最糟——我们写的句子会被标成「你说过的话」。所以客户端还有一条独立判据：`dream_connection` 的正文逐字就是某个梦的 `possible_connections`，本地梦册对得上就自己认领。

界面分两层：「我」页只放入口（几条、大致关于什么、其中几条正在影响画像），原话、来源梦和删除都在 `pages/life-notes`。二级页上只剩「删除」一个操作：「标为重要」见上（判断已经自动化），「编辑」也去掉了——这一格写着「你说的话原样存下来，没有改写」却允许改写，自相矛盾；提取抓错了的时候删掉比改掉诚实。删除留着，那不是整理，是用户对自己数据的正当控制（`editLifeNote` 的云端 action 保留给尚未更新的客户端，新客户端不再调用）。两组的区别也不能只写在组标题上——滚过三条标题就出了屏幕，剩下的句子看起来一模一样而其中一半不是他说的，所以每条自带来历：用户原话加引号照原样呈现，Oneiro 写的句子逐条署名并整块缩进。入口上那行标签取自 `gist`——由 `interpretDream` 在提取那一刻和原话一起产出（`memory_candidates[].gist`，不超过 12 字，服务端再砍到 14 并拒收比原话还长的），随记录存进 `life_notes.gist`。**`gist` 只是标签**：画像只读 `text`，概括写歪了最多是目录上一行不准，动不了记录本身；没有 `gist` 的旧记录由界面截断，不在服务端补一个。`realityClues` 仍是字符串数组、`realityClueGists` 是同序等长的并行数组——线上还有旧客户端在 `String()` 数组的每一项，换成对象会把 `[object Object]` 存成用户说过的话。

#### 出生盘假设（冷启动与衰减）

新用户还没有任何梦时，画像来自出生资料推出的 3-4 条假设。它们由 `profileMemory/baziHypotheses.js` 确定性生成（真太阳时校正后排四柱，只用日主、扶抑、十神偏向、五行空缺四个轴），存在 `profile_memory_state.baziHypotheses`，每条带 `untested / confirmed / rejected / expired` 状态。这个函数因此依赖 `lunar-javascript`，并保有一份与 `interpretDream` 逐字相同的 `locationResolver.js`（CI 会断言两份一致）。

三条约束是这套设计成立的前提，改动前请先读 `baziHypotheses.js` 顶部的注释：

- **输出里没有命理术语。** 盘面只是内部计算中间量，用户读到的必须是白话。`portraitSummary()` 会拦截含术语、含吉凶、含版本叙述的模型输出并退回确定性文案。
- **只有第一版能自报来历。** 那一版确实只有出生资料，坦白比装作从梦里读出来的更可信；此后任何一版出现「出生 / 生辰」都会被拦下。
- **衰减是结构性的，不靠提示词。** `HYPOTHESIS_DECAY_DREAM_COUNT = 10`：到第 10 个梦，所有还没被证据碰过的假设一律作废。被证据支持的那些转为 `confirmed` 并挂到具体证据上，来源不再记作盘面。状态单向，不回头，所以集合一定收敛。

假设从不进入解梦和聊天的输入，只留在画像里——否则会形成自我确认闭环：盘面推出的判断去影响梦的解读，解读读出对应主题，主题回头「验证」了那条假设。生成证据的路径必须对假设保持无知。

出生资料本身也不再整份进入画像提示词（此前它在里面，却没有任何规则说该拿它干什么，模型可以自行推出生肖星座再悄悄使用）。生辰现在只经由这组受衰减约束的假设影响画像。

`profile_memory_state` stores the atomic next-version counter and single current-snapshot pointer. `deletion_jobs` stores idempotent privacy-deletion progress; keep a job until all share, asset, life-note, and derived-profile cleanup succeeds.

The newly created `profileMemory` function currently reports a 3-second timeout, which is sufficient for its deterministic fallback and state operations. If provider credentials are later added to this function for live AI portrait generation, raise its timeout above `PROFILE_MEMORY_TIMEOUT_MS` first.

## Deploy Cloud Functions

The eleven Mini Program cloud functions are expected. To redeploy them, run this from the repository root:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env ENVID \
  --project /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram \
  --remote-npm-install \
  --paths \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/cloudHealth \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/login \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/interpretDream \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/generateDreamImage \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/saveProfile \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/saveDream \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/trackEvent \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/createShareCard \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/getShareCard \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/speechRecognize \
  /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram/cloudfunctions/profileMemory \
  --lang zh
```

Then list deployed functions:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions list \
  --env ENVID \
  --project /Users/digan/Desktop/闰土乐园/Oneiro/miniprogram \
  --lang zh
```

## Verification Flow

1. Run `npm run check:mini-release`.
2. Run `git diff --check`.
3. Run WeChat DevTools `preview` and scan the QR code on a real device.
4. Enter a new dream without a birth profile and confirm the basic interpretation completes; after optional birth details are saved, confirm later readings add the birth-rhythm lens.
5. Confirm `login` returns a cloud openid, not a local fallback id.
6. Run `cloudHealth` and confirm it returns `ok: true`. Latest verified run `1784446424263` returned `ok: true`.
7. Confirm `saveDream` first writes the raw dream with `status: pending`, then updates the same `localId` after interpretation.
8. Navigate manually to `/pages/diagnostics/index` and confirm CloudBase health is `ok`; the default compile entry must remain `pages/home/index`.
9. Call `interpretDream` with `{ healthCheck: true }` and confirm AI provider configuration. Before AI env setup it should show `provider: cloudbase-static` and `providerConfigured: false`; after setup it should show `provider: deepseek` or `provider: openai-compatible` and `providerConfigured: true`.
10. After `providerConfigured: true`, tap `AI SMOKE TEST` once on the diagnostics page and confirm it returns `ok: true` with the real provider. This sends one provider request.
11. Confirm `interpretDream` returns a result and blocks unsafe dream text. Before AI env setup, confirm it returns a retryable `ai_provider_error` without `result`. After configuring a real provider, confirm the returned provider is `deepseek` or `openai-compatible`.
12. Confirm `dream_entries` stores `dreamFacts`, `interpretationMeta`, and each submitted feedback value; then verify deletion removes only the current user's matching `localId`.
13. Confirm result-page Canvas generation stays local until the user explicitly prepares sharing, and that `createShareCard` stores no client-provided file id.
14. Confirm `createShareCard` writes to `share_pages`. Latest verified id: `8efe4ec36a2d157f00e7eb1f668ea360`.
15. Confirm `getShareCard` can read the share payload. Latest verified share id: `card-1781339519031-iph0sh`.
16. Confirm WeChat share path opens `/pages/share/index?id=...` on another device or clean session.
17. Confirm `trackEvent` writes funnel events to `events`. Latest verified inserted count: `1`.
18. Trigger an automatic portrait refresh, edit it, pause/resume future use, and restore an earlier version; verify `profile_snapshots` keeps every version and only the current enabled portrait is used by a later interpretation.

## Known MVP Limits

- `interpretDream` has a real AI provider boundary and static fallback. The current CloudBase environment has working DeepSeek and image-provider credentials; rotate/audit those server-side credentials before a public launch and never copy them into client source.
- `interpretDream` and `generateDreamImage` are both active with 60-second platform timeouts. Recheck these values after future console or deployment changes; the former's provider request budget must remain below 60 seconds.
- Live non-cached image generation passed after the ownership/race fix with `nano-banana-fast` (811,786-byte JPG, 17.2-second provider latency), followed by successful source-dream and owned-asset cleanup. A nonexistent dream id was rejected before provider work, and deletion blocked subsequent life-note writes. Physical-device rendering and album-save permission still require QR acceptance.
- Content safety is currently a basic local/server regex gate. Production should add WeChat content security and provider-side moderation before wider launch.
- `generated_assets` is verified through `cloudHealth` and is used only for owner-scoped generated dream artwork. Share-card Canvas files stay local; `share_pages` stores only the server-built card-only payload and never stores a client-provided image file id.

### 阶段画像的版本闸（profileMemory generate）

`generate` 不再无条件发新版本。两道闸，命中任一即返回
`{ ok: true, unchanged: true, unchangedReason, snapshot }`——这是**正常结果，不是失败**，
客户端据此原样保留画像、不进失败态、不显示「已更新」。

1. **证据指纹**（`evidenceFingerprint`，存在快照的 `sourceFingerprint` 字段）：
   喂给画像的东西（基础资料、梦、生活记录）一个字没变时直接返回，**连供应商调用
   都不发起**。缺这个字段的历史快照会走正常生成，不会被误判成无变化。
   `unchangedReason: 'evidence_unchanged'`。
2. **结构化断言**（`traits` + `themes` + `realLifeContext` 逐条相同）：证据变了但
   模型说的还是同一件事时，就地刷新溯源与指纹，不动版本号。
   `unchangedReason: 'claims_unchanged'`。旧快照没有这些字段时才退回到正文字面
   相似度（`PORTRAIT_SAME_TEXT_SIMILARITY = 0.9`，`unchangedReason: 'text_unchanged'`）。

只在**完全相同**时才抑制，不设中间阈值：失败代价不对称——多一个版本号只是难看，
把一次真实变化吞掉会让用户觉得画像根本不长进，那正好摧毁历史时间轴和「画像更新
了」这两个功能的全部价值。判不准就发版。

客户端点「重新梳理」会传 `force: true`：跳过闸①（用户明确要一次新解读，即使证据
没变也真的跑一次生成），但仍要过闸②。旧模板文案（`isMetaSummary`）的迁移路径不受
任何抑制。游离旧草稿的归档在三条路径上都会执行，与发不发版本无关。

线上观测：客户端每次被抑制都会上报 `profile_portrait_unchanged`，带
`reason` 与 `forced`。**上线后先看这个事件的分布**——如果 `claims_unchanged` 长期占
绝大多数且用户版本号几乎不动，说明闸②过紧，要放宽而不是收紧。
