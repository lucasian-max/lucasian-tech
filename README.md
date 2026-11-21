<img src="assets/icon.svg" width="64" height="64" alt="">

# lucasian.tech

Personal site for Mridul Vijay ([lucasian.tech](https://lucasian.tech)), built as a working 2004 4th-generation iPod.

No build step, no runtime framework dependencies, no CMS. Static HTML, CSS, vanilla JS, a patched `<web-music-ipod>` custom element, and full-length MP3 audio served from Cloudflare Pages.

## Controls

- **LCD rows:** click to highlight, click again (or double-click) to open.
- **Click wheel:** drag around the ring, scroll with a mouse/trackpad, tap `menu` / `>||` / `|<<` / `>>|`, or press the center button.
- **Keyboard:** `ArrowUp` / `ArrowDown`, `Enter`, `Escape` / `Backspace`, `Space` (mute/unmute music).
- **Inline remote (top right):** starts muted; click the speaker key to unmute and start playback, click the LCD readout to jump to `Now Playing`, or click `>>|` to skip.
- **Chassis:** drag outside the wheel to tilt the iPod in 3D; specular highlight, handling wear, and floor shadow track the angle.
- **Brick:** open `About → Brick`, hold the center button on `About`, or open `Projects → lucasian.tech → Play Brick`.

## Layout

```
index.html                  Page shell, metadata, inline remote, noscript fallback
styles.css                  Studio backdrop, 3D chassis rig, inline remote styling
app.js                      Site data (window.__SITE), LCD/wheel bridge, tilt, HUD
includes/ipod/
  web-music-ipod.esm.js     Patched <web-music-ipod> custom element
  data/us/en-US.json        Track/artist catalog (mirrored to index.json)
assets/audio/               Full-length 112 kbps MP3 tracks
scripts/
  sync-navidrome.mjs        Pulls tracks from Navidrome without exposing server credentials
  lint-comments.mjs         Ratcheting comment linter (.comment-ratchet.json)
tests/verify-v2.mjs         Headless Chromium CDP verification suite
deploy.sh                   Content-hashes shell assets (?v=...) and deploys to Cloudflare Pages
```

## Local dev

Any static file server works:

```sh
python3 -m http.server 8123 --bind 127.0.0.1
```

Open `http://127.0.0.1:8123/`.

## Verification & lint

```sh
node tests/verify-v2.mjs
node scripts/lint-comments.mjs
```

`tests/verify-v2.mjs` launches headless Chromium over CDP with zero npm dependencies and checks root navigation, direct LCD clicks, full-length audio playback, mobile bounds, and console/page errors.

## Deploy

```sh
./deploy.sh
```

`deploy.sh` computes an 8-character SHA-256 stamp from `app.js`, `styles.css`, and `includes/ipod/web-music-ipod.esm.js`, rewrites `?v=...` in a temporary build directory so Cloudflare's edge cache busts cleanly, verifies required assets exist, and deploys via `wrangler pages deploy`.
