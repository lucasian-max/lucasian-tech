# Architecture Decision Records

Short, numbered records of decisions that are not obvious from the code. The code comments that used to carry these decisions were removed by the comment audit; these files are now the source of truth.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-shell-version-stamping.md) | Derive shell `?v=` stamps from file content | Accepted |
| [0002](0002-navidrome-build-time-sync.md) | Sync Navidrome at build time; never expose credentials or the private host | Accepted |
| [0003](0003-portable-posix-deploy-staging.md) | Deploy through a portable staging directory | Accepted |
| [0004](0004-zero-dependency-cdp-test-harness.md) | Test with raw CDP over Node's WebSocket, no dependencies | Accepted |
| [0005](0005-ipod-host-fixed-440px.md) | Pin the iPod host to 440×692 so it never self-scales | Accepted |
| [0006](0006-loader-fallback-no-fixed-timeout.md) | Fall back on capability/error signals, not a timer | Accepted (implementation regressed; see issue 0001) |

## Convention

- File name: `NNNN-kebab-case-title.md`, four-digit, monotonically increasing.
- Sections: Status, Date, Deciders, Context, Decision, Consequences, Alternatives considered.
- Status values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by NNNN`.
- Never rewrite an accepted ADR to describe a different decision. Add a new ADR and mark the old one superseded.
- A code comment may point at an ADR only while the migration is in progress; the default is to delete the comment and let the ADR carry the rationale.

## When to write one

Write an ADR when a reasonable maintainer would ask "why is it done this way?" and the answer is not visible from the code: cache behavior imposed by a host, a credential boundary, an unusual build step, a test harness trade-off, or a layout constraint imposed by a vendor component. Do not write one for restating a function's behavior or for aesthetic notes.
