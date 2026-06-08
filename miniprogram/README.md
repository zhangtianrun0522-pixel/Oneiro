# Oneiro Mini Program

This folder contains the first WeChat Mini Program spike for Oneiro.

It is intentionally separate from the current Vite web prototype. The web app remains useful as an acceptance harness, while this folder proves the WeChat-native product shape.

## Current Scope

- Native WeChat Mini Program pages.
- Static acceptance dream flow.
- Profile entry.
- Dream input.
- Result dream card.
- Recent local archive.
- Share button placeholder.
- Save-card placeholder.

No cloud functions or real AI calls are wired yet.

## Open In WeChat DevTools

1. Open WeChat Developer Tools.
2. Import project.
3. Select this folder:

```text
miniprogram/
```

4. Use the test AppID or replace `touristappid` in `project.config.json` with the real Mini Program AppID.
5. Run on an iPhone simulator size first.

## Next Mini Program Tasks

1. Rebuild dream-card export with Canvas.
2. Add CloudBase environment.
3. Add login/openid binding.
4. Move static interpretation to an `interpretDream` cloud function.
5. Store dream entries in cloud database.
6. Store generated images and card images in cloud storage.
7. Add WeChat content safety checks before interpretation and sharing.
