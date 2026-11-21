---
name: delete-comment
description: Audit every code comment, delete tautologies and stale notes, file issues for excuse comments, extract non-obvious decisions into ADRs, and enforce a comment ratchet that can only move down. Use for /delete-comment, "audit comments", "delete comments", "comment cleanup", "shed comment lines", or when a comment-count ratchet fails.
---

# delete-comment

A repeatable audit that removes comments which do not pay rent, preserves the knowledge worth keeping in ADRs, and prevents the count from growing again.

The goal is **not** "zero comments everywhere at any cost". The goal is zero comments in authored code, with the surviving knowledge moved to `docs/adr/`, and defects that comments were hiding moved to `docs/issues/`.

## Non-negotiables

1. **Never commit** unless the user explicitly asks. Leave a clean, syntax-verified working tree.
2. **Never strip a vendor/compiled bundle.** Compiled Svelte/React output can contain compiler comments such as `/*#__PURE__*/`, `/** @type */`, or template markers. Removing them can change tree-shaking, type tools, or even syntax. Grandfather the bundle's current count in `.comment-ratchet.json` instead.
3. **Never delete functional directives.** `// @ts-ignore`, `// @ts-expect-error`, `/* eslint-disable */`, `/*#__PURE__*/`, source-map and license pragmas, and `/// <reference ...>` are code, not prose. Treat them as non-comments for this audit.
4. **Never blind-strip with regex.** URLs (`https://`), regex literals (`/^https?:\/\//`), strings (`"/* empty */"`), template literals, and CSS `url(data:...)` produce false positives. Use `scripts/lint-comments.mjs` or an equivalent lexer.
5. **Never leave a "see ADR" comment as a replacement.** The ADR is the record; the code should be self-explanatory.
6. **Ratchet only moves down.** Never raise a baseline. Adding a new grandfather entry is an explicit, justified act (`--baseline <file>`), not routine maintenance.
7. **Verify syntax after every edit:** `node --check` for every `.js`/`.mjs`, `sh -n` (or `bash -n`) for every `.sh`. Preserve shebangs.
8. **File local issues, not GitHub issues.** Issues live in `docs/issues/` and are committed with the code.

## The four categories

Classify every comment block in context. A block is one or more adjacent comment lines about the same subject.

### 1. Tautology — delete

The comment repeats what the code already says.

- `// loop over songs` above `for (const song of songs)`
- `/* ---- HUD ---- */` above `.hud {`
- `// Build artist index sorted alphabetically` above code that builds and sorts the artist index
- `// Wait for the element to exist` above a loop that waits for the element
- A header that only restates the filename and how to run the file

Test: if the comment vanished, would a competent maintainer lose any information? If no, delete it.

### 2. Excuse — delete and file an issue

The comment exists to make a fragile, hacky, inaccessible, or incorrect implementation feel acceptable instead of fixing it.

- "These rows set `window.location.href`, so there is no anchor to inspect" — the rows should be anchors.
- "The timer cannot tell slow from broken, so we accept the flicker"
- "Safari needs this workaround"
- "This duplicates the component's styles because we cannot reach the shadow root"
- "The API sometimes returns duplicates, so we ignore them"

Test: does the comment describe a workaround, a missed invariant, or a known bug as normal? Delete it and write a concrete issue with exact file/symbol, evidence, proper fix, and acceptance criteria.

### 3. Stale — delete

The comment references code, files, screens, versions, commands, timers, or behavior that no longer exists.

Signals: a count that disagrees with the code ("6 rows" when there are 4), a deleted file or playlist, an old timeout, an old menu label, a function name that was renamed, "temporary" from three releases ago.

Test: can you point at the current code the comment describes? If not, delete it. If the stale comment was hiding a stale test or dead path, file an issue too.

### 4. Decision Record — extract to an ADR, then delete

The comment explains a non-obvious architectural, infrastructure, security, hosting, or layout decision that a future maintainer would otherwise re-litigate.

Examples from this repository:

- Cloudflare apex caching ignores `_headers`, so shell URLs carry a content-derived stamp.
- Navidrome credentials and the private host must never enter the browser bundle; sync happens at build time.
- GNU/BSD `sed -i` differences force a staging directory instead of in-place editing.
- Tests use raw CDP with no dependencies and must drive real key/pointer events.
- The iPod host is pinned to 440px so the vendor container query does not self-scale.
- The loader falls back on capability/error signals, not a fixed timer.

Test: would a new maintainer ask "why is this done this way?" and be unable to answer from the code? If yes, write an ADR.

## Workflow

### 0. Scope and baseline

```sh
cd <repo>
git status --short
git branch --show-current
node scripts/lint-comments.mjs
```

If the linter does not exist, create it first (`scripts/lint-comments.mjs` plus `.comment-ratchet.json`). It must have zero comments itself. See "Linter contract" below.

Record:

- files scanned,
- total comment lines,
- baselined files and their counts,
- authored files with non-zero counts.

### 1. Inventory accurately

Trust the linter, not `grep`. `grep` will count `https://` in strings, `/*` in CSS data URIs, and `/^https?:\/\//` regexes.

For each non-baselined file with a non-zero count, read the file or the relevant slice. Do not audit from the grep excerpt alone; a comment's meaning depends on the code below it.

### 2. Classify every block

Keep a table as you go:

| File | Lines | Category | Action |
| --- | --- | --- | --- |
| `deploy.sh` | 2–11 | Decision Record | ADR 0001 + 0003, delete |
| `tests/menu-all.mjs` | 149–150 | Excuse | issue 0004, delete |
| `styles.css` | 96 | Tautology | delete |

Every comment line must land in exactly one category. Split a multi-claim header if necessary (for example, a security decision plus a now-stale asset claim).

### 3. Act on each category

**Tautology / Stale:** delete the comment lines with an exact edit. Do not leave orphan blank lines or doubled blank lines. Preserve surrounding indentation.

**Excuse:** delete the comment, then create `docs/issues/NNNN-kebab-title.md`:

```md
# NNNN — Imperative title

- Status: Open
- Severity: High | Medium | Low
- Type: Excuse / regression
- Found: comment audit, YYYY-MM-DD
- Files: `path`, `symbol`
- Related: `docs/adr/NNNN-...md`

## Summary
What the comment claimed and what the code actually does.

## Evidence
Commands and output, not recollection.

## Why this is harmful
Concrete user, maintenance, accessibility, or correctness impact.

## Proper fix
Numbered, specific steps with file and symbol names.

## Acceptance criteria
- [ ] Observable, testable conditions.
```

Update `docs/issues/README.md` with the new row.

**Decision Record:** create `docs/adr/NNNN-kebab-title.md` with Status, Date, Deciders, Context, Decision, Consequences, Alternatives considered. Then delete the comment. Update `docs/adr/README.md` with the new row.

Rules for ADRs:

- Four-digit monotonically increasing numbers; never renumber.
- One decision per ADR. If a header contains two decisions, write two ADRs.
- Put commands and invariants in the Decision section, not a runbook.
- Record the current deviation in a "Known deviation" section and link the issue; do not pretend the code follows the decision.
- Use `Accepted (implementation regressed; see issue NNNN)` rather than silently weakening the decision.

### 4. Delete with precision

Use exact-text edits with a uniqueness check, or a script that asserts each target occurs exactly once. Never:

- delete a line that also contains code (strip only the trailing comment),
- delete a shebang,
- delete a license header that the license requires (classify it as a Decision Record/legal notice instead),
- reflow unrelated code.

After the pass, re-read the head of each file to catch leftover blank lines and broken docblocks.

### 5. Verify syntax

```sh
for f in $(git ls-files '*.js' '*.mjs'); do node --check "$f" || exit 1; done
for f in $(git ls-files '*.sh'); do sh -n "$f" || exit 1; done
node scripts/lint-comments.mjs
```

`node --check` on browser code is a syntax check only; it is still mandatory. Run any available end-to-end suites when the comments touched tests or runtime code.

### 6. Tighten the ratchet

The ratchet has two states:

- **Not in `.comment-ratchet.json`:** the file must have zero comment lines. This is the default for authored code.
- **In `.comment-ratchet.json`:** the file may have at most its baseline count. New files must be zero; existing baselines only go down.

After deleting comments:

```sh
node scripts/lint-comments.mjs                 # prints DOWN notices for lowered files
node scripts/lint-comments.mjs --update-ratchet
node scripts/lint-comments.mjs                 # must exit 0
```

`--update-ratchet` lowers existing entries and removes entries that reached zero. It must not add new files. If a new vendor bundle or intentionally deferred artifact needs grandfathering, do it explicitly and explain why in the commit/report:

```sh
node scripts/lint-comments.mjs --baseline path/to/vendor-bundle.js
```

Never baseline an authored file to avoid cleaning it.

### 7. Report

Return a crisp report:

- categorized inventory (file + count + action),
- links to every ADR, issue, the linter, the ratchet file, and this skill,
- lines shed now in authored files,
- remaining comment lines in grandfathered files,
- total lines that would be shed if every comment in the repo were deleted,
- syntax/test verification results,
- `git status` state (no commit unless asked).

## Linter contract

`scripts/lint-comments.mjs` must be zero-dependency Node ESM and scan `.js`, `.mjs`, `.css`, `.html`, `.sh` while skipping `.git`, `node_modules`, and test screenshot output.

Comment-line definition: a physical source line that contains any part of a comment, including block-comment delimiters and blank `*` continuation lines. Deleting the comment removes that line, so this is the line-shedding metric.

Accuracy requirements:

- JS: handle line and block comments, single/double quotes, template literals with nested `${}`, and regex literals. Do not treat `https://` in a string or `/^https?:\/\//` as a comment.
- CSS: handle `/* ... */` and quoted strings.
- HTML: handle `<!-- ... -->` and delegate `<style>` to CSS, `<script>` to JS. Do not count `<!doctype>`.
- Shell: handle `#` only at a word start, outside quotes, and exclude the first-line shebang. Do not count `#` in `${var#prefix}`, `$#`, or `12#ff`.

The linter's own source must contain zero comments. Put its documentation here, in `docs/adr/`, or in `docs/issues/`, not in the script.

## Done checklist

- [ ] Every comment in scope is classified.
- [ ] Authored files have zero comments.
- [ ] Every excuse has an issue with evidence and a proper fix.
- [ ] Every non-obvious decision has an ADR, and the inline comment is gone.
- [ ] ADR/issue indexes are updated.
- [ ] `node --check` / `sh -n` pass for every edited file.
- [ ] `node scripts/lint-comments.mjs` exits 0.
- [ ] No baseline was raised; only lowered or explicitly added for a vendor/deferred artifact.
- [ ] No commit was made unless requested.
- [ ] The report includes exact line-shedding counts.
