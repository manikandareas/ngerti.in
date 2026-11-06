# Source adoption and upgrades

Openbot revision `01e4b18e238e5de72a3570162c9f4275bb585786` is the primary reference for selected application/runtime logic and flow. Adoption does not import its whole UI, cloud accounts, marketplace, permissions or business platform. Record exact modules/revisions, reuse reasons, local changes, dependency versions and upgrade checks. License administration is handled separately by the user; retain attribution and source provenance.

| Area | Source acuan |
| --- | --- |
| Boundary dan persistence | [Repository structure](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/structure.md) |
| Provider abstraction | [AgentClient](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent-client.ts), [drivers](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/provider-drivers.ts), [providers guide](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/providers.md) |
| Native runtime wajib | [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Muse client](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/muse-client.ts) |
| Claude Code · ditunda | [Claude client](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/claude-client.ts); referensi perluasan, bukan acceptance aktif. |
| ACP · referensi perluasan | [ACP core client](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/acp-client.ts), [connection](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/acp-connection.ts), [flavor hooks](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/acp-flavor.ts) |
| Queue, stop dan recovery | [Mailbox store](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/mailbox-store.ts), [turn lifecycle](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/turn-lifecycle.ts), [boot recovery](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/boot-recovery.ts) |
| Routine dan grup | [Routine scheduler](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/routine-scheduler.ts), [channels](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/channels-and-messaging.md) |
| Browser/workspace/skills | [Browser](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/browser.md), [workspace](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/workspace-sandbox.ts), [skills/plugins](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/skills-and-plugins.md) |


## Current integrations

Codex App Server and Muse SDK/MSP are the required native seams. Their [adapter](../architecture/codex-adapter.md) [guides](../architecture/muse-adapter.md) and milestone provenance record minimum/tested versions, account ownership, capabilities and native proof. Generic ACP, additional runtimes and raw public inference paths are deferred references, not prerequisites.

Cua SDK 0.10.1, the pinned Linux image with observed spacesd 0.8.0, and bundled Driver contract 1 provide the active machine path. Exact reviewed Cua source is `33db0d554751b5f8b816d9c7deb7449d84278346`; [shared-machine evidence](../verification/shared-machine/README.md), [the trust/implementation plan](../architecture/shared-machine-cua-plan-2026-11-04.md) and [viewer provenance](../../apps/server/src/machines/protocol/UPSTREAM.md) record local adaptations. The former browser-use source pin belongs to NMA-058's original acceptance, not a second active controller. Upgrade native tools, profile/target binding, read-only/control tickets, scope/revocation, persistence and stop/unknown-outcome recovery together.

Composio is the selected app-connection integration. `unique-names-generator` is the implemented naming library; the server manifest and NMA-065 evidence supply its exact pin and owner-unique collision behavior. Tauri is the sole development desktop host; its [guide](../architecture/tauri-development.md), Rust/npm lockfiles and native evidence own platform and packaging claims.

## Evidence levels and upgrade procedure

Distinguish decisions, source observed, contract/fixture tests, native/live operation, API readiness, UI verification and distribution. A source benchmark or supported interface alone does not prove Ngertiin behavior. Login, discovery, inference and useful product-tool execution remain separate observations.

For an upgrade, compare the exact adopted modules/protocols and dependency pins, adapt only the selected seams, regenerate changed contracts, and rerun affected fixture/process/native/browser checks. New upstream features do not become scope automatically. Preserve versioned artifacts and failure/skip/unknown boundaries. Source and SDK changes do not justify silent billing fallback, overwriting inherited skills or importing private DM context into a group.

[The foundation ADR](../architecture/adr-0001-harness-first-foundation.md) and per-milestone provenance preserve original adoption facts; [history](history.md) explains retired source lookup.
