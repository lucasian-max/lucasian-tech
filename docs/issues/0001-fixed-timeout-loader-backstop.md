# 0001 — Loader backstop reintroduces a fixed-timeout fallback

- Status: Open
- Severity: High
- Type: Excuse / regression
- Found: comment audit, 2026-11-21
- Files: `app.js`, `tests/slow.mjs`, `tests/fallback.mjs`
- Related: `docs/adr/0006-loader-fallback-no-fixed-timeout.md`

## Summary

`app.js` reveals the plain-link fallback after a fixed 5 seconds:

```js
var backstop;
...
customElements.whenDefined("web-music-ipod").then(showDevice, showLinks);
backstop = setTimeout(showLinks, 5000);
```

This is the fixed-timeout strategy that caused a blank page in Firefox during the v1 incident. It cannot tell a module that is still downloading from one that has failed, so it hides a working device on slow connections. The comment that used to justify the slow-load test claimed "a fixed 6s timer cannot tell slow from broken"; the audit removed that stale comment, but the code it warned about is back.

## Evidence

Run against the delayed fixture (`tests/serve.py` on port `8100`, module delayed 9 seconds):

```text
$ CHROME_BIN=/usr/bin/chromium node tests/slow.mjs
  ok   t=3s (module still downloading) shows the device
  FAIL t=7s (past the old 6s timer) still shows the device — {"stageDisplay":"none","fallbackDisplay":"block","state":"failed"}
  ok   t=11s (module arrived) shows the device
2 passed, 1 failed
```

`tests/fallback.mjs` still waits `5200ms` for the timer and expects the fallback at that point, so the two suites encode opposite contracts. The fallback suite also expects `10` links while `index.html` now ships `6`.

## Why this is harmful

- A five-second rule fires on ordinary mobile latency, hiding the product behind a link list.
- The timer races `whenDefined`: on a slow but successful load the UI flips to "failed" and then back, which is worse than a stable skeleton.
- The `<script>` error listener already detects a blocked or missing module, so the timer adds no coverage for the failure case.
- Two tests disagree about the intended behavior, so neither protects the contract.

## Proper fix

1. Delete the `backstop` variable, both `clearTimeout(backstop)` calls, and `backstop = setTimeout(showLinks, 5000)` in `app.js`.
2. Keep `customElements.whenDefined("web-music-ipod").then(showDevice, showLinks)` and the capture-phase `<script>` error listener as the only transitions.
3. In `tests/fallback.mjs`, replace the `sleep(5200)` wait with a wait for the block/error signal (or poll for `#fallback:not([hidden])`), and derive the expected link count from the DOM or `window.__SITE` instead of the literal `10`.
4. Keep `tests/slow.mjs` as the regression guard; its seven-second sample must pass without a timer.
5. Run both suites together and require both to pass before merging.

## Acceptance criteria

- [ ] No fixed-duration timer can call `showLinks()` while the module request is pending.
- [ ] `tests/slow.mjs` passes all three samples with a 9-second-delayed module.
- [ ] `tests/fallback.mjs` passes with the module blocked, using an event/poll wait.
- [ ] The fallback link count assertion reflects the current `index.html`.
- [ ] `node --check app.js` passes.
