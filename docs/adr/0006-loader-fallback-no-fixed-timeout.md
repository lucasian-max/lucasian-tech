# 0006 — Loader fallback follows capability and load errors, not a timer

- Status: Accepted (implementation regressed; see issue 0001)
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

The page must work even when the iPod module is unavailable. A plain link list (`#fallback`) is rendered in the HTML and hidden by default. The original implementation switched to that list with a fixed six-second timer.

That timer cannot distinguish a slow module from a broken one. On a slow connection it replaced a page that was still loading successfully. This produced a blank-looking site in Firefox and was fixed by removing the timer (commit `71cf244`, "Fix blank page in Firefox: no fixed-timeout fallback, no stale cache").

The correct signals are explicit:

- The device is ready when `customElements.whenDefined("web-music-ipod")` resolves. Reveal `#stage` and hide `#fallback`.
- The browser cannot support the device when `customElements` or `ShadowRoot`/`attachShadow` is missing. Reveal the fallback immediately.
- The module failed to load when a `<script>` element fires an `error` event. Reveal the fallback.
- `whenDefined` rejecting is also a failure signal.

## Decision

Reveal the device only on successful custom-element definition, and reveal the fallback only on capability absence, script load error, or a rejected `whenDefined` promise. No fixed-duration timer may switch a still-loading page to the fallback.

A backstop timer, if one is ever reintroduced, must be a last-resort watchdog longer than any realistic module transfer, and it must not fire while the module's request is still in flight. The default should remain no timer at all.

`tests/slow.mjs` encodes the contract: with the module artificially delayed nine seconds, the device must still be visible at three, seven, and eleven seconds. `tests/fallback.mjs` encodes the failure path: with the module blocked, the fallback must appear.

## Consequences

- Slow devices keep the device shell visible instead of flipping to a link list.
- A genuinely missing module still falls back through the `<script>` error path, which fires even when the request is blocked.
- The fallback test must wait for the load failure signal, not a fixed number of seconds.
- Removing the timer means a module that hangs forever without firing `error` leaves the stage blank. That is preferable to falsely declaring a slow load broken, and the browser's own network timeout eventually produces an error.

## Known deviation

`app.js` currently reintroduces `backstop = setTimeout(showLinks, 5000)`. With a nine-second module delay, `tests/slow.mjs` fails at the seven-second sample because the fallback has already replaced the device. This violates the decision above. The regression, evidence, and fix are tracked in `docs/issues/0001-fixed-timeout-loader-backstop.md`.

## Alternatives considered

- **Fixed six-second timer** — the original Firefox regression; rejected.
- **Timer plus `navigator.onLine`** — `onLine` does not describe module latency; rejected.
- **Render the fallback first and upgrade later** — causes a flash of the link list and loses the device-first presentation; rejected.
- **Server-side user-agent sniffing** — cannot detect module support (for example, old Safari) reliably; rejected.
