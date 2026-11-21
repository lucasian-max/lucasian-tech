# 0001 — Content-hashed shell version stamps

- Status: Accepted
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

The site is deployed to Cloudflare Pages on the apex zone (`lucasian.tech`). The apex serves `/app.js`, `/styles.css`, and the iPod bundle with `Cache-Control: max-age=14400` regardless of what `_headers` says. A deploy can therefore leave a visitor on a four-hour-stale shell even when the new HTML has arrived. `_headers` already sets a must-revalidate policy for `/*`, but the apex edge behavior wins for these shell assets.

The HTML references the shell with a `?v=` query string, but a hand-maintained version is easy to forget and does not describe what actually changed.

## Decision

Derive a single eight-character stamp from the bytes of the three shell files:

```sh
set -- app.js styles.css includes/ipod/web-music-ipod.esm.js
V=$(cat "$@" | sha256sum | cut -c1-8)
```

`deploy.sh` rewrites every `?v=[A-Za-z0-9]*` in `index.html` to `?v=$V` in the staging copy. The checked-in HTML keeps a placeholder stamp; only the deployed copy is rewritten. The stamp is never hand-edited or committed as a release number.

A change to any of the three files changes the stamp, so all three URLs bust together. This is deliberate: they are one shell and are tested as one unit.

## Consequences

- Deploys are content-addressed without a build service or git metadata.
- A visitor with a cached HTML document may still see old markup until it revalidates, but every asset it requests is guaranteed to match the HTML that referenced it.
- `sha256sum` is required on GNU/Linux and `shasum` on stock macOS. `deploy.sh` fails loudly when neither exists.
- The version is not a semantic version and must not be used in release notes.
- Running `deploy.sh` prints the stamp and every rewritten URL so a deploy can be inspected.

## Alternatives considered

- **Hand-bumped `?v=`** — one forgotten bump reintroduces the four-hour stale shell; rejected.
- **`_headers` only** — the apex ignores the rule for these paths; rejected as the sole mechanism.
- **Commit SHA** — requires git metadata in the deploy environment and changes even for unrelated commits while missing dirty working-tree edits; rejected.
- **Cloudflare cache purge API** — needs a scoped token, network access, and a post-deploy step; more moving parts than a content hash.
