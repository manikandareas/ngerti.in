# Persistence discovery and migration inventory

Baseline: `1a024950c94bd54a2c1c911fc96b7557627c77d1`, inspected on 2026-11-12. The baseline contained approximately 632 Store-operation references across backend services. Knowledge-graph tools were unavailable in the session; targeted source searches and TypeScript analysis were used.

| Surface | Baseline | NMA-072 treatment |
| --- | --- | --- |
| `apps/server/src/store.ts` | `bun:sqlite`, synchronous callbacks, SQLite sidecar authority lock, JSON text indexes | Async `pg` store, versioned/checksummed schema, bound clients/savepoints, clock-row ordering, dedicated advisory authority session and durable epochs |
| `apps/server/src/conversations/journal.ts` | Direct SQLite queries and synchronous historical readers | Async transaction-bound PostgreSQL projection/replay and keyset public pages; historical nullable fields retained |
| `apps/server/src/machines/import.ts` | Direct read-only SQLite workspace inventory | Explicit PostgreSQL Store initialization and scoped workspace read; managed-file import retains its existing hash checks |
| Lifecycle, conversations/creation, queue/controls, Goals/Routine, groups, learning, attachments/artifacts, interactions, integrations, machine services and harness gateway | Synchronous Store use and synchronous recovery constructors | Awaited operations and asynchronous factories; sequential collection helpers prevent Promise-valued predicates and preserve savepoint order |
| HTTP/event stream and product tools | Immediate reads and synchronous receipt callbacks | Awaited queries, consistent snapshots, commit notifications, scoped receipt reauthorization and ordered native observations |
| Backend regression SQL observers | Direct SQLite access in lifecycle, conversation-parts, provider-key and machine tests | PostgreSQL observers; SQLite remains only in explicitly named legacy import/refusal fixtures |
| Web Playwright server helpers | `new Store`/`new Lifecycle`, selected SQLite test state | Async PostgreSQL initialization; explicit disposable database and per-owner test schemas |
| Immutable artifact bytes and provider/native private homes | Files outside SQL, rooted next to the SQLite database path | Remain outside SQL, rooted next to the PostgreSQL state marker; no implicit credential copy or native reassignment |

SQL uniqueness mappings preserve active lanes, native session identity, active thread bindings, agent handle/system role, primary DM, Routine occurrence identity, one conversational answer per run, active lane workspace, immutable native publication identity, skill names/versions and inherited inventory binding. Owner/kind, thread, agent, state/status, run, workspace, connection, binding and event history/scope queries have explicit indexes. Current owner identity is preserved independently of the future organization ID.

## Historical probes

The native/crash/evaluation scripts below capture older SQLite/API proof and must be run with their recorded source revision, not treated as current PostgreSQL verification:

- `scripts/verification/nma047/foundation.ts` and the NMA-054–058 `crash.ts`/`unknown.ts` probes.
- Native/receipt probes under `nma055`, `nma056`, `nma057`, `nma060` and `conversation`.
- SQLite-native inspection and quality probes under `jev-routing-v2`, `jev-routing-v3`, `conversation-latency`, `group-responsibilities`, `group-attachments`, `attachments`, `goal-capture` and `machine/harnesses.ts`.

Their captured evidence is unchanged. Historical source is available at the baseline revision above and in each retained report's exact revision. The root `verify:foundation` command now selects current PostgreSQL lifecycle/bootstrap and dedicated persistence probes. Active `nma061`, `nma062`, machine and Jev web-server helpers are ported separately. Legacy probe compatibility is not a runtime SQLite fallback.
