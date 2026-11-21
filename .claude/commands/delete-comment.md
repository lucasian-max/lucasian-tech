---
description: Delete code comments by category, extract ADRs, file excuse issues, and tighten the comment ratchet
argument-hint: "[path or scope] (optional; defaults to the whole repository)"
---

Execute the `delete-comment` skill at `.agents/skills/delete-comment/SKILL.md` exactly.

Scope: `$ARGUMENTS`

If no scope is given, audit the whole repository. If a path is given, restrict the audit to that path, but still run the full-repository ratchet check at the end.

Required sequence:

1. Run `node scripts/lint-comments.mjs` and record the inventory (scanned files, total comment lines, baselines).
2. Read every non-baselined comment in context. Classify each block as **Tautology**, **Excuse**, **Stale**, or **Decision Record**.
3. Delete Tautology and Stale comments with exact edits.
4. For each Excuse: delete the comment and create a numbered `docs/issues/NNNN-*.md` with exact file/symbol, evidence, proper fix, and acceptance criteria. Update `docs/issues/README.md`.
5. For each Decision Record: create a numbered `docs/adr/NNNN-*.md` (Context, Decision, Consequences, Alternatives), delete the inline comment, and update `docs/adr/README.md`.
6. Never strip the compiled vendor bundle (`includes/ipod/web-music-ipod.esm.js`) or functional directives (`@ts-ignore`, `eslint-disable`, `/*#__PURE__*/`).
7. Verify every edited `.js`/`.mjs` with `node --check` and every `.sh` with `sh -n`. Preserve shebangs.
8. Run `node scripts/lint-comments.mjs --update-ratchet` to lock in lowered counts, then `node scripts/lint-comments.mjs` and require exit 0. Never raise a baseline.
9. Do not run `git commit`.

Return a structured report with the categorized inventory, links to created ADRs/issues, exact lines shed now, remaining grandfathered comment lines, total lines that would be shed if every comment were deleted, and verification results.
