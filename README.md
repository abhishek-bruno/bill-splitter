# SplitEasy

Live: https://abhishek-bruno.github.io/bill-splitter/

Offline-first PWA for splitting a bill: enter items and shared charges, add people, assign items, see who owes what. Progress is saved in localStorage.

## Bill photo scanning (optional, needs internet)

Users bring their own Google Gemini, Anthropic or OpenAI key. The photo is downscaled on-device and sent directly to that provider; the result fills the manual form for review. Everything else works offline.

The key is AES-GCM encrypted in IndexedDB with a non-extractable Web Crypto key (`src/secureStore.js`). This keeps the raw key out of plain storage, but any script running on this origin could still use it, so keep the app free of third-party scripts.

## Commands

```sh
npm install
npm run dev       # dev server (service worker disabled)
npm run build     # production build to dist/ with service worker
npm run preview   # serve dist/ at http://localhost:4173
npm run icons     # regenerate icons from public/logo.svg
```

## Deploying

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Installing on a phone

Open https://abhishek-bruno.github.io/bill-splitter/ once while online, then:
- Android Chrome: menu > Install app
- iOS Safari: Share > Add to Home Screen

After the first load it works with no connection.

## Credits

Pizza icon from [Noto Emoji](https://github.com/googlefonts/noto-emoji) by Google, licensed under the Apache License 2.0.
