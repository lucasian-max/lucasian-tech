# 0002 — Navidrome sync happens at build time, never in the browser

- Status: Accepted
- Date: 2026-11-21
- Deciders: Mridul Vijay
- Supersedes: none

## Context

The listening history lives in a private Navidrome instance at `music.lucasian.tech`. The site is a static Cloudflare Pages deployment whose JavaScript is public. Anything the browser can read is public: a Navidrome URL, a username, a token, or a playlist endpoint must never be shipped.

The iPod needs a small, stable catalog: songs, artists, and playlists in `includes/ipod/data/us/en-US.json` and `index.json` (`schemaVersion: 3`). The device cannot call Navidrome directly because of credentials, CORS, and the fact that the music host is intentionally not part of the public bundle.

## Decision

`scripts/sync-navidrome.mjs` reads the library **at build time** and writes the static catalog. It supports two mutually exclusive sources:

1. **Subsonic API** when `NAVIDROME_URL`, `NAVIDROME_USER`, and `NAVIDROME_PASS` are present. It uses the salted-MD5 token flow (`t = md5(password + salt)`, random six-byte salt), `getAlbumList2?type=frequent`, then `getAlbum` for track details.
2. **Read-only SSH to `node1`** otherwise. It runs a read-only SQLite query against `navidrome.db` through `execFileSync`, with `BatchMode=yes` and an eight-second connect timeout, and parses JSON from stdout.

Both paths normalize titles and artists, exclude audiobook authors, and cap artists per selection. Tracks are resolved to Apple's public CORS-enabled preview CDN through the iTunes Search API, scored against the requested title and artist, and accepted only after a `HEAD` request returns 200. Requests are spaced by 1.8 seconds. The resulting payload is written identically to `en-US.json` and `index.json`, because the loader may request either path.

The security rule is absolute: **no Navidrome credential or `music.lucasian.tech` URL may appear in the browser bundle or the catalog.** The catalog contains only public preview URLs and local `/assets/audio/*.mp3` paths.

## Consequences

- Refreshing the catalog requires either network access to the Subsonic API or SSH access to `node1`; a deploy alone cannot refresh it.
- The generated catalog is committed, so production deploys do not depend on Navidrome availability.
- Matching is best-effort: Apple may not carry an exact track, in which case the track is skipped. The scoring rules prefer exact artist/title and penalize karaoke, tribute, cover, lullaby, and remix results.
- Third-party preview URLs can rot; they are verified at sync time, not at page load.
- The script is not bit-for-bit reproducible because it queries a live API and a live library.
- The v2 catalog currently ships eight local full-length MP3s and a single `pl-favorites` playlist. The script still emits a `studio-ambient` song and `pl-ambient`/`pl-repeat`/`pl-rotation` playlists, so its output no longer matches the shipped schema. That drift is tracked in `docs/issues/0002-navidrome-sync-stale-catalog.md`; the security decision above is unaffected.

## Alternatives considered

- **Call Subsonic from the browser** — exposes credentials and the private host, and fails CORS; rejected.
- **Proxy through a Worker with a runtime secret** — keeps credentials out of the bundle but adds a runtime dependency and an attack surface for a personal site; rejected.
- **Hand-maintained JSON** — no credentials risk, but the catalog goes stale and artist/playlist curation becomes manual; rejected as the primary path.
- **Ship only local audio** — simplest and most private, but loses the library-derived selection that makes the device feel personal; kept as the current v2 compromise.
