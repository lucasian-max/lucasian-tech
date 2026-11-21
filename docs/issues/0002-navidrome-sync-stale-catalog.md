# 0002 — Navidrome sync still emits the deleted Studio Ambient catalog

- Status: Open
- Severity: Medium
- Type: Stale / broken build step
- Found: comment audit, 2026-11-21
- Files: `scripts/sync-navidrome.mjs`, `assets/audio/`, `includes/ipod/data/us/en-US.json`, `includes/ipod/data/us/index.json`
- Related: `docs/adr/0002-navidrome-build-time-sync.md`

## Summary

The removed header comment said the sync "pairs the result with the local full-length Studio Ambient loop". That pairing no longer exists:

- `assets/audio/studio-ambient.mp3` is deleted from the working tree.
- The shipped catalog contains eight full-length local tracks (`dear-prudence`, `gypsy`, `no-surprises`, `the-chain`, `karma-police`, `dreams`, `veridis-quo`, `change`) and one playlist, `pl-favorites` ("On Repeat").
- `scripts/sync-navidrome.mjs` still defines `LOCAL_SONG` with `id: "studio-ambient-01"` and `previewUrl: "/assets/audio/studio-ambient.mp3"` (line 17), prepends it to every generated catalog (line 255), and builds `pl-ambient`/`pl-repeat`/`pl-rotation` from `CHILL_ARTISTS` (lines 273–288).

Running the script today would publish a catalog whose first song 404s and whose playlist IDs the v2 UI never renders. The comment made this dead path look intentional.

## Why this is harmful

- A future catalog refresh silently reintroduces a 404 into production.
- The script documents a three-playlist model that the v2 device no longer exposes.
- `CHILL_ARTISTS` and `AUDIOBOOK_AUTHORS` overlap conceptually with shipped curation, so the source of truth is ambiguous.
- The ADR still describes the security model correctly, but the output contract is stale, which makes the build step untrustworthy.

## Proper fix

Choose one source of truth and encode it:

1. **Update the script** to emit the v2 shape: no `LOCAL_SONG`, local tracks from an explicit manifest of the eight committed MP3s (or a directory scan), and the `pl-favorites` playlist ID/name. Keep the Subsonic/SSH fetch only if it still curates the local library.
2. **Or retire the fetch path** and write the catalog by hand or from a small manifest, deleting the Subsonic/SSH code and the `.comment-ratchet.json` grandfather implications.
3. Validate every emitted `previewUrl`: local paths must exist on disk; remote URLs must return 200. Fail the sync on a missing local file.
4. Assert the emitted `playlists[].id` set matches the IDs the component reads.
5. Update ADR 0002's "current catalog" paragraph once the shape is settled.

## Acceptance criteria

- [ ] `node scripts/sync-navidrome.mjs` produces byte-identical or semantically identical output to the committed catalog.
- [ ] No emitted `previewUrl` points to a missing file.
- [ ] No `pl-ambient`/`studio-ambient` remnants remain unless the UI actually renders them.
- [ ] `node --check scripts/sync-navidrome.mjs` passes.
- [ ] ADR 0002 and the script agree on the catalog schema.
