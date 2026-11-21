# 0003 — Five end-to-end suites still assert the v1 six-row iPod menu

- Status: Open
- Severity: Medium
- Type: Stale test suite
- Found: comment audit, 2026-11-21
- Files: `tests/live.mjs`, `tests/menu-all.mjs`, `tests/map.mjs`, `tests/nav.mjs`, `tests/smoke.mjs`, `tests/fallback.mjs`
- Related: `tests/verify-v2.mjs`

## Summary

The v2 device ships a four-row root menu: **Music, Projects, About, Contacts**. It has no Audiobooks, Apps, or Settings screens, and its projects are the five entries in `window.__SITE.projects` (Black Hole, handwritten2pdf, Study log, Spotify Display, colophon). The following suites still assert the v1 menu:

| File | Stale expectation | Current reality |
| --- | --- | --- |
| `tests/live.mjs:107` | `Music, Audiobooks, Projects, Apps, About, Settings` | four rows |
| `tests/live.mjs:113` | exactly 6 rows | 4 rows |
| `tests/menu-all.mjs:115,117` | 6 rows / old labels | 4 rows |
| `tests/map.mjs:97` | `NAMES` with Audiobooks/Apps/Settings | four rows |
| `tests/nav.mjs:102,122` | six-row membership | four rows |
| `tests/nav.mjs` | Projects rows match `Navidrome|Kavita|Books|Usage` | project names are the portfolio set |
| `tests/smoke.mjs:85,87` | six rows | four rows |
| `tests/smoke.mjs:91–93` | `{"projects":6,"apps":8}` | no `apps`; project count differs |
| `tests/fallback.mjs:99` | 10 fallback links | 6 links |

The audit removed the stale comments that described these expectations ("Projects/Apps/About/Settings open an internal screen", "Apps screen", "6-row iPod menu"), but the assertions themselves remain. They can never pass against `redesign-v2`, and a green run of any one of them would be a false positive.

## Why this is harmful

- A failing suite that is "known stale" trains people to ignore test output.
- The expectations duplicate the menu definition instead of deriving it, so every menu change breaks five files.
- `tests/verify-v2.mjs` already asserts the correct v2 shape, so the repository has two contradictory sources of truth.
- Stale suites hide regressions in the paths they still cover (wheel, fallback, external navigation).

## Proper fix

1. Decide which suites are worth porting. At minimum keep `verify-v2.mjs`, `slow.mjs`, and `fallback.mjs`; port `nav`/`menu-all`/`map` to the four-row menu if they add coverage beyond `verify-v2.mjs`; delete the rest rather than leaving them red.
2. Derive expected labels from one fixture or from `window.__SITE`, not five hard-coded arrays.
3. Update `tests/fallback.mjs` to read the link count from the DOM (see issue 0001 for the wait change).
4. Add the surviving suites to a documented command (for example `tests/run-all.sh`) so they are run together.
5. Re-run against a local server and record the result in the issue before closing.

## Acceptance criteria

- [ ] Every remaining suite passes against `redesign-v2`.
- [ ] No test asserts Audiobooks, Apps, Settings, or `apps: 8`.
- [ ] Expected menu labels come from one place.
- [ ] The fallback count assertion is derived, not a literal.
- [ ] The suite list and local-server requirements are documented.
