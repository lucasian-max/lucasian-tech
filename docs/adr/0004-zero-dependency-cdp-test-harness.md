# 0004 — End-to-end tests use zero-dependency CDP over a raw WebSocket

- Status: Accepted
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

The site's behavior lives inside a shadow root: menu rows, the click wheel, playback state, and the fallback list. Unit tests in jsdom would not exercise layout, shadow DOM, audio, or the vendor component's boot sequence. The repository has no `package.json`, no lockfile, and no CI dependency install; the tests are run by hand from the repository root.

Playwright and Puppeteer would solve the problem, but each adds a browser download and a dependency tree to a static site whose deploy path deliberately avoids a Node build step.

## Decision

Every end-to-end test controls headless Chromium through the DevTools Protocol using Node's built-in `fetch` and global `WebSocket`:

- Spawn Chromium with `--remote-debugging-port=<port>`, `--user-data-dir=$(mktemp -d)`, `--headless=new`, `--no-sandbox`, and `--disable-gpu`.
- Wait for `/json/version`, open the returned `webSocketDebuggerUrl`, and speak JSON-RPC directly.
- Use `Target.createTarget` + `Target.attachToTarget` with `flatten: true`, then `Runtime.evaluate`, `Page.navigate`, `Input.dispatchKeyEvent`, and `Page.captureScreenshot`.
- Give each suite a distinct debug port (`9333`–`9361`) so parallel runs do not collide.
- Prefer real input events. Synthetic `.click()` calls do not move the wheel selection; arrow, Enter, Escape, and pointer events do. Wheel behavior must be verified with `Input.dispatchKeyEvent` or real pointer events, not by invoking handlers.
- Keep the tests dependency-free: `node tests/<name>.mjs` is the whole interface. Local suites expect a static server on `8099` (or `8100` for the delayed fixture).

## Consequences

- There is no `node_modules` requirement and no lockfile to maintain.
- Each test file repeats roughly thirty lines of CDP plumbing. That duplication is accepted; a shared helper would be a fifth module to keep in sync, and the tests are intentionally standalone.
- Tests require `CHROME_BIN` (or the hard-coded macOS Playwright shell path) and a Chromium that accepts `--headless=new`.
- CDP responses are raw; a protocol change can break every suite at once.
- Screenshots are written to `tests/shots` (gitignored) or `/tmp`.

## Alternatives considered

- **Playwright** — ergonomic, but adds a browser download and a dependency tree; rejected.
- **Puppeteer** — same objection, plus a Chromium revision pin to maintain.
- **jsdom** — no layout, no shadow rendering, no audio; rejected.
- **Manual browser checks** — not repeatable and cannot assert boot timing or console errors; rejected.
