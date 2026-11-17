# Local OrbStack PostgreSQL cutover — 2026-11-13

The owner explicitly requested filling `.env`, using OrbStack for PostgreSQL and migrating the retained local data. This amendment records that completed single-owner development operation. NMA-072 remains Done; NMA-082's central-server HTTPS, multi-user, provider and deployment-recovery gates remain Backlog.

Source is `96a99a5` plus the [captured local configuration and backup correction](local-orbstack-2026-11-13/source-hashes.json). Execution completed on November 13 in Asia/Makassar, with UTC timestamps retained in the [redacted result](local-orbstack-2026-11-13/result.json). The original [November 12 fixture cohort](README.md) retains its captured source and proof boundary.

## Database and configuration

- OrbStack Docker context `orbstack`, PostgreSQL 18.1, pinned image `postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`.
- Persistent container `ngertiin-postgres18`, volume `ngertiin_postgres18_data`, database `ngertiin`, schema `ngertiin_app` and loopback endpoint `127.0.0.1:55472`.
- [Persistent Compose configuration](../../../compose.postgres.local.yml), restart policy `unless-stopped`, healthy TCP database readiness, `fsync=on` and `synchronous_commit=on`.
- `.env` now supplies `NGERTIIN_DATABASE_URL`, `NGERTIIN_DATABASE_SCHEMA`, `NGERTIIN_POSTGRES_PASSWORD` and `NGERTIIN_POSTGRES_PORT`. The generated password remains private, the file mode is `0600`, and all pre-existing environment values are unchanged. Old `DATABASE_URL`/`POSTGRES_*` values are retained for the retired runtime.
- The application configuration loader was checked against the imported target. The application scheduler/native executors were not started; no provider calls or billing changes occurred.

Start or recover this same database with the existing private credentials:

```sh
docker --context orbstack compose -f compose.postgres.local.yml up -d
```

The disposable `compose.postgres.yml` and other projects' databases are separate. No retired PostgreSQL volume or shared Cua container was reset.

## Migration and reconciliation

No SQLite authority or active run existed at preflight. SQLite integrity passed, installation ownership matched, and the original legacy authority lock was held during each offline operation. A copied state snapshot omitted six Chromium `SingletonSocket`/`SingletonCookie`/`SingletonLock` symlinks without following or deleting the originals. All regular application/private files were retained with hashes.

Dry-run inspection preceded import into the fresh PostgreSQL schema. The importer compared complete normalized rows, IDs, sequences, event order and receipts before commit. Reconciliation was repeated against the original SQLite state and after a real PostgreSQL container restart.

| Relation | SQLite | PostgreSQL | Complete rows equal |
| --- | --- | --- | --- |
| Entities | 1,043 | 1,043 | Yes |
| Events | 5,786 | 5,786 | Yes |
| Commands/receipts | 832 | 832 | Yes |
| Routing traces | 45 | 45 | Yes |
| Conversation parts | 334 | 334 | Yes |
| Projection checkpoint | 1 | 1 | Yes |

All 1,043 entities validate against the current domain schemas. The event cursor remains 5,786; all 43 immutable artifact hashes and 59 native binding identities are retained. The legacy owner remains unbound to a user/organization pending NMA-073–075. Provider/native homes continue at their original paths and are not reassigned.

## Backup, restore and failure handling

The verified backup contains 7,217 files, including the portable SQLite image, private connection homes and installation identity. A restore into a separate directory passed database-image equality, all 7,216 regular application/private file hashes and all 43 artifact hashes. Original SQLite file bytes and application/private files remain unchanged. Snapshot and restore rehearsal directories were removed after verification; the backup and private operational reports remain.

Private local paths, excluded from Git:

```text
.dev/migrations/postgres-2026-11-12T16-29-14Z/backup/
.dev/migrations/postgres-2026-11-12T16-29-14Z/env.before
.dev/migrations/postgres-2026-11-12T16-29-14Z/cutover.json
```

Two backup issues were found and corrected before updating `.env`:

1. Serializing a WAL-mode source retained WAL read/write format flags, so the standalone copied image could not open read-only. Only the serialized copy now uses rollback-format flags, following [SQLite's documented standalone-image workaround](https://www.sqlite.org/c3ref/deserialize.html). The source database and WAL remain untouched.
2. The first snapshot captured the authority lock's temporary rollback journal. Its bytes changed when the lock closed, making the first restore comparison ambiguous for that one transient control file. Backups now exclude the authority database and all of its journal/WAL/shared-memory sidecars. A fresh backup and full restore then passed. Private failure reports and the first manifest are retained; domain import was not repeated.

The environment was changed only after successful import, fresh backup/restore and unchanged-source verification. Rollback requires stopping the PostgreSQL application authority and selecting one consistent code/environment/state set. The previous SQLite runtime is at `1a024950c94bd54a2c1c911fc96b7557627c77d1`; the original SQLite state is still present. Restore the full private backup into a new directory when rehearsing rollback, and use `env.before` with that compatible runtime. Do not merge divergent database writers.

## Verification

- [Persistence regressions](local-orbstack-2026-11-13/persistence-tests.log): **12 pass, 0 fail**, 68 assertions across two files. Includes an uncheckpointed WAL commit restored as a standalone read-only database, authority-sidecar exclusion, and the existing PostgreSQL race/crash/import/restore checks.
- [Updated foundation command](local-orbstack-2026-11-13/foundation.log): **30 pass, 0 fail**, 136 assertions across four files. `bun run verify:foundation` now includes the WAL backup regression alongside lifecycle, PostgreSQL and bootstrap coverage; its database is disposable and separate from the migrated installation.
- [Server typecheck](local-orbstack-2026-11-13/typecheck.log) and [lint](local-orbstack-2026-11-13/lint.log): pass.
- OrbStack Compose configuration validation: pass using `.env`, without printing resolved secrets.
- Actual local PostgreSQL restart: **5/5 checks** pass — selected application configuration, changed postmaster start time, advanced epoch, all imported tables equal, and preserved event cursor.
- Documentation check retains the same eight pre-existing broken GPUI skill-reference links; [output](local-orbstack-2026-11-13/docs-check.log) records the current result.

This proves local retained-data migration, backup/restore and restart. It does not establish central-server deployment, RLS, multi-user privacy, provider login/inference, browser/Tauri journeys, production recovery objectives or fresh-device distribution.
