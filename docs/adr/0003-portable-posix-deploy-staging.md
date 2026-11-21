# 0003 — Deploy through a portable staging directory

- Status: Accepted
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

`deploy.sh` runs on both GNU/Linux (the Omarchy workstation) and macOS. The two platforms disagree about `sed -i`: GNU sed treats the suffix as optional and edits in place, while BSD sed requires a backup suffix and behaves differently when the suffix is empty. The script also needs to rewrite the `?v=` stamp in `index.html` without mutating the working tree.

The deploy payload is a subset of the repository: `index.html`, `404.html`, `styles.css`, `app.js`, `assets/`, `includes/`, `_headers`, `robots.txt`, and `sitemap.xml`. Mockups, tests, and docs must not be uploaded.

## Decision

Build the payload in a `mktemp -d` staging directory:

- Copy each deployable path with `cp -R`, skipping paths that do not exist.
- Generate the stamped HTML with a portable stream: `sed "s/?v=[A-Za-z0-9]*/?v=$V/g" index.html > "$DIST/index.html"`. Never use in-place editing.
- Hash with `sha256sum` when available, otherwise `shasum -a 256`.
- Register `trap cleanup EXIT INT TERM` so the staging directory is removed on success, failure, or interrupt.
- Verify that every required file, including both catalog JSON files, exists in staging before invoking `wrangler pages deploy`.

`set -eu` is mandatory: an unset variable or a failed copy must abort the deploy rather than upload a partial site.

## Consequences

- The repository is never modified by a deploy; `git status` stays clean.
- The same script works on GNU and BSD userlands without conditional `sed` branches.
- A missing shell file, catalog, or asset fails before upload with a named path.
- Staging doubles the payload's temporary disk usage, which is negligible here.
- `npx --yes wrangler@latest` is still resolved at deploy time, so the Wrangler version is not pinned.

## Alternatives considered

- **`sed -i`** — platform-dependent and can silently create backup files; rejected.
- **Perl or Python rewriting** — portable but adds a runtime dependency for a six-line transform; rejected.
- **A Node build script** — would duplicate the shell logic and add a second entry point; rejected.
- **`git archive`** — only includes tracked files, which breaks deploys from a dirty tree containing new audio; rejected.
