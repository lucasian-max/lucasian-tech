# Issues

Local, git-tracked issue files. They record work discovered by the comment audit that must not be allowed to hide behind a code comment. No public GitHub issues are created from this directory.

| Issue | Title | Severity | Status |
| --- | --- | --- | --- |
| [0001](0001-fixed-timeout-loader-backstop.md) | Loader backstop reintroduces a fixed-timeout fallback | High | Open |
| [0002](0002-navidrome-sync-stale-catalog.md) | Navidrome sync still emits the deleted Studio Ambient catalog | Medium | Open |
| [0003](0003-v1-test-suites-stale.md) | Five end-to-end suites still assert the v1 six-row menu | Medium | Open |
| [0004](0004-external-rows-lack-anchors.md) | External menu rows are imperative navigation, not anchors | Medium | Open |

## Convention

- File name: `NNNN-kebab-case-title.md`, four-digit, monotonically increasing.
- Header: Status, Severity, Type, Found, Files, Related.
- Body: Summary, Evidence, Why this is harmful, Proper fix, Acceptance criteria.
- Status values: `Open`, `In progress`, `Blocked`, `Fixed`.
- Include exact file paths and symbol or line references. Evidence should be a command and its output, not a recollection.
- When an issue is fixed, keep the file and mark it `Fixed` with the commit or PR that closed it. Do not delete the history.
