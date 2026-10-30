# ADR 0001: harness-first application foundation

Accepted for development on 2026-10-30. The user explicitly approved **Bun + SQLite + Elysia with background scheduler and dispatcher** during NMA-047. Product scope remains governed by [the active Notion architecture](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f) and [NMA-047](https://app.notion.com/p/409abdd6187381bab741d401c8031f67). This ADR records an implemented foundation, not completed native adapters or API readiness.

## Decision and executable boundary

Use TypeScript 7.0.2 on Bun 1.3.10, Elysia 1.4.30 for HTTP, Zod 4.4.3 for runtime schemas, and Bun's bundled SQLite 3.51.0 binding. `make dev` starts `apps/server/src/main.ts` through the Bun workspace command. It opens one owner-bound database and starts the HTTP server, background scheduler and dispatcher in the same process. The authority lock is a lifetime SQLite exclusive transaction on a separate lock database; a second authority is refused and OS process death releases the lock. The domain database uses WAL and `synchronous=FULL`.

Ngertiin owns identities, admission, durable queue state, command receipts, events, cancellation intent and recovery decisions. Native harnesses own their inner execution loops. The dispatcher port accepts native observations; it does not implement another model/tool loop. A logical authority can later coordinate additional processes, but there is no second authority or historical fallback today.

The API uses Elysia for routing, lifecycle hooks and standard-schema validation. It delegates decisions to `Lifecycle`. State mutations, idempotency receipts and events commit together in SQLite. Native network/process operations happen outside database transactions. Event delivery in this ticket is cursor-based HTTP replay; full streaming and the UI contract are owned by later tickets and NMA-060.

## Source audit and local adaptations

Primary observed source: [Openbot](https://github.com/nightly-labs/openbot/tree/01e4b18e238e5de72a3570162c9f4275bb585786), exact revision `01e4b18e238e5de72a3570162c9f4275bb585786`. Source hashes and module paths are recorded in [provenance.json](../verification/nma-047/provenance.json).

| Observed module/flow | Adoption and changes |
| --- | --- |
| `docs/architecture/structure.md` | Adopt separation of application projections, provider-owned sessions and API projections. Omit Electron, central cloud accounts, billing and remote teams. |
| `src/backend/agent-service.ts` | Use one application facade as the composition boundary; avoid importing its large desktop/cloud/browser dependency graph wholesale. |
| `src/backend/mailbox-store.ts`, `enqueue` | Port the persist-before-dispatch and idempotent enqueue flow. Local command fingerprints also reject reuse with different input; records/events/receipts commit in one SQLite transaction. |
| `src/backend/agent/boot-recovery.ts` | Adopt reconciliation before repeating unresolved work. Local orphaned `dispatching/running/cancel_requested` runs become `unknown`, retain native binding and stop intent, and block their lane. Native reconciliation is an internal adapter seam, not an HTTP override. |
| `src/backend/agent/turn-lifecycle.ts` | Adopt native event observations flowing back through application lifecycle. Do not adopt automatic provider failover, advanced backup models or permission defaults. |
| `src/backend/agent/routine-scheduler.ts`, `routine-timer.ts` | Adopt persisted due state, occurrence identity and enqueue through the common queue. This foundation uses a one-second wake loop with one-time/fixed-interval schedules, missed-interval collapse and no overlapping live occurrence. Full Routine policies and conversational goals remain NMA-057. |
| `src/backend/agent-client.ts`, `app-server-client.ts` | Adopt separate process/protocol/native identity boundary. Probe Codex JSONL initialization from Bun without credentials. Broker and full adapter belong to NMA-048/049. |
| `src/backend/muse-client.ts`, `package.json` | Follow the official SDK/MSP seam and upstream SDK pin `@muse-code/sdk@1.4.12`. Verify Bun can import it, spawn an owned child, negotiate initialization and complete a request against an explicitly labeled fixture. Full Muse integration remains NMA-050. |

This is a small behavioral port with Ngertiin-specific contracts, not vendoring the Openbot application. No upstream cloud account services, UI, generic ACP provider, model fallback or installer are brought into scope. License handling remains with the user; provenance is retained independently.

## Compatibility evidence and limits

- Bun 1.3.10 runs Elysia routes, Zod validation, SQLite transactions, background work, native child processes and the official Muse SDK. The backend contract tests and real HTTP/process probe exercise these together.
- Installed `codex-cli 0.165.0` completed `initialize`/`initialized` through App Server stdio with an isolated temporary `CODEX_HOME` and no inherited API keys. This establishes a process/protocol seam, not a supported minimum version, login, model discovery, inference or tool round trip.
- `@muse-code/sdk@1.4.12` completed its real spawn/handshake/request/close path under Bun against an MSP protocol fixture. This proves SDK runtime compatibility; native Muse Code, login, subscriptions, inference, resume and product-tools are unverified here.
- No native executor is registered by the default bootstrap. Queued work remains queued. NMA-048–050 establish supported versions, capabilities, billing/credential ownership and the native adapters.

See [retained evidence](../verification/nma-047/README.md). SDK/protocol fixtures and native handshakes are labeled separately.

## Storage and background execution

SQLite matches the current single-owner, single-host development boundary and removes a required database server. It allows atomic local state and event publication without a second queue service. Multiple native agents can execute asynchronously; database writes remain short and serialized. The choice is not based on measured production capacity. If the product later requires multiple backend replicas, many concurrent writers or a database across hosts, revisit PostgreSQL with explicit acceptance rather than claiming the current design already supports it.

Scheduler, queue and dispatcher are distinct responsibilities within the service. The scheduler commits an occurrence and admitted run atomically, then advances the due timestamp. The dispatcher claims a lane, persists a dispatch token/authority epoch, rechecks membership/grants/responsibility and invokes a registered executor. Unknown runs block the lane until a trusted native receipt resolves them. A stop signal is intent; only native confirmation records a stopped native run. A shutdown deadline records unknown outcomes and fences late completions.

Heavy model/tool execution belongs to the native harness processes. Dedicated worker services, Redis, distributed schedulers and OS service installation are not dependencies of this foundation. Their absence does not remove durable queue/recovery requirements. Work continues without a browser while the service and host are alive; it cannot run while the host is asleep or powered off.

## Historical runtime retirement and data

The root launcher, Makefile, dependency installation, CI, `.env.example`, README and PRODUCT guide use the new stack. The old Python API entry point is replaced by a retirement error. Hermes engine and provisioner `main()` functions reject startup before calling the retained implementation. The obsolete `scripts/dev_engine.py` rejects startup while preserving historical source links. `scripts/dev.py` and `scripts/check.py` only forward to their active Bun commands.

Historical Python modules are retained for targeted audit and reuse where their replacement is not implemented yet. Their dependency manifests and older reports are historical; the active workspace does not load them. They must not be described as new harness-first features. Continue cleanup under the relevant replacement ticket; NMA-060 rechecks the complete retirement boundary.

No existing `.env`, historical partitions, PostgreSQL/MinIO volumes, user content or evidence were reset. A fresh `NGERTIIN_STATE_DIR` is the development reset boundary. The new installation persists owner identity and a private local token, and refuses an existing database from another owner/application/schema. No development data compatibility migration or runtime mode switch is provided. New data must survive ordinary shutdown and crash recovery. Rollback uses a prior Git revision plus a verified backup.

## Upgrade procedure

Keep the Openbot revision and inspected module hashes in provenance. On a proposed upstream upgrade, compare those exact flows and the SDK/protocol dependencies, then adapt only the locally selected seams. Do not copy new upstream features into scope automatically. Pin runtime/framework/schema/SDK changes, regenerate the contract when it changes and rerun affected contract/process/native probes. Future schema versions require a deliberate upgrade path for new-runtime data; do not silently reuse a different schema under version 1.
