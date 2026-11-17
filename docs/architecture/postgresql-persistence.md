# PostgreSQL persistence and offline SQLite import

NMA-072 replaces the synchronous SQLite application store with PostgreSQL. The existing single-owner HTTP contract remains in place; account login, organization binding, RLS and multi-user access remain NMA-073–075 and the NMA-079 API gate. See [implementation evidence](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-072/README.md at 043f7c9") and [the main plan](server-organizations-plan-2026-11-12.md).

## Runtime and schema

The implementation pins Bun 1.3.10, `pg` 8.23.1 and `@types/pg` 8.23.1. Disposable verification uses PostgreSQL 18.1 with `postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`. This is a compatibility tuple, not a production deployment or capacity certification.

`NGERTIIN_DATABASE_URL` must explicitly select PostgreSQL. `NGERTIIN_DATABASE_SCHEMA` defaults to `ngertiin_app`. Each schema binds one installation and legacy owner. A state directory still holds installation identity, provider stores and immutable artifact bytes; `ngertiin.postgres` is a local storage-location marker used to resolve these directories, not a database file. An existing SQLite path is refused and never opened as an automatic fallback.

Migration 1 is defined in `apps/server/src/persistence/schema.ts`. Its checksum and version are recorded atomically in `schema_migrations`. Unknown or modified applied migrations and owner mismatches refuse startup. Application relations are:

| Relation | Responsibility |
| --- | --- |
| `installation` | Stable installation/owner identity, schema version, durable authority epoch and event clock |
| `entities` | Validated JSONB projections with constrained identity/owner columns, ordered sequence and nullable future organization/actor keys |
| `events` | Immutable domain envelopes with commit-ordered cursors and future scope columns |
| `commands` | Scoped command identity, canonical-input fingerprint and committed or reserved receipt |
| `conversation_parts`, `conversation_projection` | Public conversation positions and replay checkpoint |
| `routing_traces` | Bounded private routing diagnostics |

Current uniqueness rules for active lanes, native bindings, primary DMs, agent handles/system identity, Routine occurrences, answers, workspaces, artifact publications and skill revisions remain database constraints. JSONB retains domain payloads without replacing the explicit identity/index columns. Organization/actor columns are deliberately unbound until the verified mapping in NMA-075; this milestone does not enable multi-user access.

## Transactions, reads and authority

All database-facing services are asynchronous. `Store.open`, `Lifecycle.open` and the modules requiring persisted recovery have explicit asynchronous initialization. Transaction callbacks use one checked-out client through `AsyncLocalStorage`; nested transactions use savepoints. Sibling nested operations are serialized, and queued nested work drains before rollback. Escaping a completed transaction context is rejected.

A transaction locks the installation clock row until commit. This intentionally serializes the current application's mutations, including projections, events, public conversation positions and command receipts. It prevents a smaller event cursor from committing behind an already consumed larger cursor. Failed mutations and receipts roll back together, and notifications follow only the outer commit. Native/model/network operations and asynchronous file preparation retain their external-effect boundaries.

`Store.page` uses indexed owner/kind/scope filters, keyset sequence and a 1–1000 row bound. Existing service traversals consume bounded SQL pages; conversation/lane/resource lookups push applicable filters into SQL. Legacy aggregate APIs can still return an entire authorized collection and are not a capacity guarantee. Conversation snapshots use a transaction; filtered replay retains a consistent high watermark and advances over excluded events. The conversation journal replays in 500-event batches.

One dedicated `pg.Client`, separate from the query pool, holds a session advisory authority lock keyed by database/schema. Startup increments the durable epoch. Every transaction validates that epoch and the original session's exact lock before committing. Readiness returns HTTP 503 after authority loss. Losing the authority session aborts active dispatcher signals and permanently fences that Store; pool reconnection never reacquires authority. Restart requires a new Store. PostgreSQL concurrency does not authorize another scheduler.

Native observations are processed in order. Tool leases await already received observations, preventing a tool from passing admission before its native acceptance is durable. Disconnect handling drains accepted observations before finalizing an unknown outcome. Self-stop waits for its receipt to reach the Codex response transport or Muse bridge response body before scheduled interruption. Stop intent and confirmed native stop remain separate.

Concurrent exact machine-command retries share admission before their first SQL read and retain one native effect. Human input takeover waits for both native cleanup and its persisted observation fence, preventing late cleanup from overwriting the granted human lease.

## Receipts and external effects

Idempotency scope includes the installation owner, organization/actor context and operation or HTTP method/path. Fingerprints still bind the full canonical input. Command IDs remain text because internal bootstrap identities such as `development:tobi:v1` must survive import; public HTTP command keys remain validated UUIDs.

Tool dispatch installs a transaction-local reauthorization callback. Receipt replay, asynchronous command completion and explicit receipt reads recheck current authorization. Receipt lookup rejects ambiguous operation matches. Imported owner-only receipts can be read through their legacy scope only while using that same unbound legacy principal; fingerprint checks preserve their original identities.

Asynchronous effects reserve a durable pending receipt, perform preparation outside SQL, then reauthorize and commit. Simultaneous retries share the same in-process preparation and reject changed fingerprints. A pending external-effect receipt recovered after restart is unresolved and cannot blindly repeat an effect. The separate `fileCommand` path labels deterministic, exact-byte-verified file projections and may reconcile only those reservations after reauthorization. Native/tool-specific reconciliation remains authoritative.

## Controlled SQLite import and rollback

The current installation is not reset or switched by installation or startup. Work first against disposable data. An operator stops the old lifecycle authority before applying an import; the importer also acquires its legacy authority lock when present.

```sh
# Inspect and compare the legacy source without writing PostgreSQL.
bun run db:sqlite-import --source /path/state/ngertiin.sqlite --state /path/state

# Create a new verified backup and import to an empty PostgreSQL schema.
# The URL is supplied privately through NGERTIIN_DATABASE_URL.
bun run db:sqlite-import --source /path/state/ngertiin.sqlite --state /path/state --schema ngertiin_app --backup /path/backups/pre-postgres --include-private-state --apply

# Rehearse restoring the complete backup into a new, empty directory.
bun run db:sqlite-import --backup /path/backups/pre-postgres --restore /path/restored-state
```

Inspection opens SQLite read-only in a consistent transaction and validates its application/schema IDs. Import preserves entity IDs/order, event cursors/payloads, receipts, public positions, trace identities and native binding references. It compares each imported table before committing and verifies immutable artifact hashes/lengths in both the source and target state directory. It refuses a populated target. SQL import does not transfer artifact bytes or credentials.

The report retains the legacy owner and an explicit unbound user/organization mapping manifest. NMA-073/074 establish the account/organization; NMA-075 applies that guarded mapping before multi-user access. Native binding references retain their old owner/account identity; the importer performs no native resume or provider login.

Backups include a serialized consistent SQLite database and hash-verified state files. Credentials, connection-native homes and `installation.json` are copied only with `--include-private-state`. Without that option, the manifest records hashes of external private files, and restore requires a verified unchanged source reference; those private files still require explicit operator binding. Symlinks, special files, destination reuse, missing artifacts and changed hashes fail verification.

Serialized WAL snapshots normalize only the copied image's read/write format bytes to rollback mode, following [SQLite's standalone-image guidance](https://www.sqlite.org/c3ref/deserialize.html). `source_sha256` identifies this portable serialized image. The source file and its WAL are never edited. A dedicated regression retains an uncheckpointed commit and opens the restored file read-only without sidecars.

Restore writes a new directory and verifies bytes. It does not redirect a running installation or combine divergent database writers. A real switch stops the old authority and selects one consistent database/blob/credential/configuration set and matching Git revision. NMA-082 owns final operational cutover, PostgreSQL backup/restore, provider refresh-state coordination, RPO/RTO and deployment rehearsal. Live provider, browser/Tauri and distribution acceptance remain separate.

## Development verification

`bun run test:server` creates an isolated, loopback-only disposable PostgreSQL container when `NGERTIIN_TEST_DATABASE_URL` is unset and removes that container on completion. Docker must be available. To use an already provisioned disposable database, set that explicit variable. Fixtures allocate and remove their own schemas and state directories; they never fall back to `NGERTIIN_DATABASE_URL`.

`compose.postgres.yml` is an optional fixed-port disposable setup. `bun run verify:foundation` runs lifecycle, PostgreSQL race/crash/import/restore and bootstrap tests. Current web verification server helpers require `NGERTIIN_TEST_DATABASE_URL`. Historical SQLite-native probes remain pinned to their captured revision; consult [the inventory](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-072/inventory.md at 043f7c9") before reusing them.

For persistent local development through OrbStack, `compose.postgres.local.yml` uses the separate `ngertiin_postgres18_data` volume and binds port 55472 to loopback. Set `NGERTIIN_POSTGRES_PASSWORD` privately, keep it consistent with `NGERTIIN_DATABASE_URL`, then run `docker --context orbstack compose -f compose.postgres.local.yml up -d`. This configuration is separate from the disposable test database and retired PostgreSQL volumes. It does not establish the NMA-082 central-server deployment gate.
