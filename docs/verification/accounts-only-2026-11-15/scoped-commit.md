# Scoped local delivery — 2026-11-15

The owner requested a local commit after the cleanup/account-only implementation. The index contains retired GPUI clients/tooling, mandatory account authentication, the account-only Tauri client, local development email/secret defaults, unified development startup and their documentation/evidence.

Preexisting PostgreSQL cutover/SQLite backup work remains outside the commit. Five shared files are staged selectively. Their working-tree bytes, the unrelated PostgreSQL files and the private `.env` remain unchanged. The [original report](README.md) and its captured hashes retain the original working-tree context, including that preexisting work; they are not relabeled as an identical staged-tree run. The [delivery manifest](scoped-commit.json) identifies the differences and the exact tested source hashes.

Verification ran in an isolated Git worktree created from the staged implementation tree. Installed dependencies were reused through symlinks, and native checks reused the existing Cargo cache. The implementation source in the final commit matches that snapshot; only these delivery notes/manifests/logs were added afterward. Documentation is checked again with those records included.

| Check | Result | Evidence |
| --- | --- | --- |
| Server/web lint and typecheck | Pass | [Lint](scoped-commit-lint.log), [types](scoped-commit-typecheck.log) |
| Shared web build | Pass; retained large-chunk warning | [Build](scoped-commit-build.log) |
| Development launcher/verifier lint | Pass | [Launcher](scoped-commit-launcher-lint.log) |
| Auth, bootstrap, organizations and contract inventory | 51/51 tests, 11 files, disposable PostgreSQL | [API tests](scoped-commit-auth.log) |
| Frontend units | 86/86 tests, 19 files | [Frontend](scoped-commit-web.log) |
| Desktop profile and Rust unit tests | 2/2 tooling, 11 Rust passed, zero failed, two explicitly ignored | [Desktop tests](scoped-commit-desktop-tests.log) |
| Desktop typecheck, Rust format and clippy | Pass | [Types](scoped-commit-desktop-typecheck.log), [lint](scoped-commit-desktop-lint.log) |
| Full documentation check | Pass | [Documentation](scoped-commit-docs.log) |
| Staged whitespace and captured log integrity | Pass; raw build whitespace preserved with an exact-path attribute | [Manifest](scoped-commit.json) |

The two ignored Rust tests require an explicit Keychain mutation or separately launched HTTPS fixture. The original native sign-in and browser evidence remain at their captured scope; those journeys, the complete backend suite and production/distribution acceptance are not repeated for this delivery. No push or deployment is authorized or performed.
