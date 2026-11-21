# 0004 — External menu rows are imperative navigation, not anchors

- Status: Open
- Severity: Medium
- Type: Excuse / accessibility and UX debt
- Found: comment audit, 2026-11-21
- Files: `includes/ipod/web-music-ipod.esm.js`, `app.js`, `tests/menu-all.mjs`
- Related: `docs/adr/0004-zero-dependency-cdp-test-harness.md`

## Summary

The vendor bundle's menu activation calls navigation imperatively instead of rendering links:

```js
if (/^mailto:/i.test(b.url)) window.location.href = b.url;
else window.open(b.url, "_blank", "noopener,noreferrer");
```

Because the rows are `div`/`li` elements with click handlers and no `href`, the page offers no real link semantics. The removed test comment admitted the workaround: *"These rows set `window.location.href`, so there is no anchor to inspect."* The suite had to spy on `Page.frameNavigated` because there was nothing accessible to assert.

## Why this is harmful

- Middle-click, Cmd/Ctrl-click, "Copy link address", and "Open in new tab" do not work on project links or contacts.
- Screen readers announce rows without link roles or destinations.
- `window.open` is subject to popup blocking when the click is not treated as a direct user gesture (the wheel's synthetic activation path is a particular risk).
- Tests cannot assert destinations from the DOM; they must observe side effects, which is slower and flakier.
- The comment normalized the workaround instead of fixing the markup.

## Proper fix

1. In the bundle's menu renderer, render an `<a href="...">` for items with `data-action="link"` (with `rel="noopener noreferrer"` and `target="_blank"` for external URLs, and no `target` for `mailto:`).
2. Keep the wheel/Enter activation delegating to the same navigation function, but trigger it through the anchor so keyboard and pointer behavior remain consistent.
3. In `app.js`, keep the direct-LCD click bridge calling `activateIndex`; the anchor should still receive the semantic click when activated by keyboard.
4. Update `tests/menu-all.mjs`/`map.mjs` to read `href` from the row instead of watching `Page.frameNavigated`; keep one navigation test for the real browser handoff.
5. Verify a middle-click and Cmd/Ctrl-click open the destination in a new tab.

## Acceptance criteria

- [ ] Every external/menu link row renders a real `<a href>` in the shadow DOM.
- [ ] Middle-click and Cmd/Ctrl-click open a new tab.
- [ ] Enter on a selected row triggers the same destination as a click.
- [ ] No `window.open` remains for menu rows (or it is only a fallback for non-link actions).
- [ ] Tests assert `href` from the DOM.
- [ ] `node --check` passes for any edited authored file; the vendor bundle still loads and `tests/verify-v2.mjs` passes.
