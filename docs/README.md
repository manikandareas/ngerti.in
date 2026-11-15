# Ngertiin documentation

This repository is the authority for product decisions, local backlog, implementation and acceptance. Start with [PRODUCT.md](../PRODUCT.md) for scope and [the repository guide](../README.md) for setup. [The local workflow](development/workflow.md) explains how to maintain these documents and milestones together.

## Product and work

- [Central server, PostgreSQL and organizations plan](architecture/server-organizations-plan-2026-11-12.md): the main November 12 design and diagrams, with [NMA-072–083](backlog/README.md#server-organizations-plan) covering auth, roles/Workgroups, private/Team agents, scoped data/execution/connections and web/Tauri delivery. NMA-072 is Done for its [verified single-owner PostgreSQL/import scope](verification/nma-072/README.md); NMA-073 is Done for its [verified backend authentication/headless native scope](verification/nma-073/README.md); NMA-074 is Done for its [verified organization-administration scope](verification/nma-074/README.md); NMA-075 is Done for [scoped application data](architecture/scoped-agent-data.md); NMA-076 is Done for [execution-domain isolation](verification/nma-076/README.md); NMA-077 is Done for verified provider connections; NMA-078 is Done for [scoped app accounts and Team skills](verification/nma-078/README.md); NMA-079 is Done for its verified API/isolation gate; NMA-080 is Done for its verified web-client scope; NMA-081 is Done for its verified Tauri remote scope; NMA-082 is Done for the [deployment/recovery profile](architecture/server-deployment.md); NMA-083 is Done for its [focused integrated acceptance](verification/nma-083/README.md). Further desktop-rs work is paused.
- [Server organizations consumer contract](architecture/server-organizations-api.md): current 2.0.0 account-mode API, authenticated scope, onboarding, switching, connection choice and the [NMA-079 gate evidence](verification/nma-079/README.md).

- [All 83 feature decisions](product/feature-decisions.md), [agents/conversations/groups](product/conversations.md), [Goals and Routine](product/goals-routine.md), and [current interface](product/interface.md).
- [Local backlog and delivery status](backlog/README.md), [feature ownership](backlog/feature-coverage.md), and [acceptance/readiness gates](development/acceptance.md).
- [Desktop Rust observation and parity plan](architecture/desktop-rs-plan-2026-11-07.md): six ordered GPUI milestones targeting `apps/desktop-rs`; NMA-066/NMA-067 are Done under the [2026-11-08 owner decision](development/nma-066-067-closure-2026-11-08.md), with remaining technical verification non-blocking. NMA-068–071 are also Done for their retained scope; further desktop-rs work is paused. [Component evidence](verification/nma-067/README.md) records the native avatar, composer and rich-content components. See the [native workspace](../apps/desktop-rs/README.md) and [foundation evidence](verification/nma-066/README.md).
- [Conversation content viewer prototype](product/conversation-viewer-prototype-2026-11-07.md): archived comparison of three layouts; Focus is implemented in the conversation.
- [Source adoption and upgrades](development/source-adoption.md), [decision handoff provenance](development/decision-record.json), and [historical evidence/Git recovery](development/history.md).

The handoff reconciled eleven decision documents and nineteen milestone records, including the deferred runtime reference. Six Desktop Rust planning milestones were added on 2026-11-07. Current implementation amendments take precedence over the older planning sections they replace. The provenance record identifies the captured source/version and reconciliation boundaries; ongoing work updates this repository directly.

## Architecture and API

- [PostgreSQL persistence and offline import](architecture/postgresql-persistence.md): async transaction/authority model, schema, backups and controlled SQLite import.

- [Current architecture and trust boundaries](architecture/overview.md).
- [Foundation ADR](architecture/adr-0001-harness-first-foundation.md), [lifecycle contract](architecture/harness-first-contract.md), and [consumer contract](architecture/api-consumer-contract.md).
- [Harness broker](architecture/harness-broker-contract.md), [Codex adapter](architecture/codex-adapter.md), and [Muse adapter](architecture/muse-adapter.md).
- [Agents/conversations API](architecture/agent-conversation-api.md), [queue/control/recovery](architecture/conversation-control-api.md), and [group collaboration](architecture/group-collaboration-api.md).
- [Goals/Routine API](architecture/goals-routines-api.md), [memory/skills](architecture/memory-skills-api.md), [workspace/artifacts](architecture/workspace-artifact-api.md), and [app connections/research/visual input](architecture/apps-research-visual-api.md).
- [Current checked-in contract 1.33.0](contracts/1.33.0.json). Earlier bundles and versioned guides retain their original scope; authenticated `/v1/contracts` identifies the installed server's export.

- [Scoped application accounts and published Team skills](architecture/scoped-apps-skills.md): separate Composio identity, current grants, durable effect holds and immutable shared skill revisions.
- [User authentication and device sessions](architecture/user-authentication.md): account-mode setup, guarded Owner bootstrap, browser HTTP/session APIs and the native OAuth/PKCE contract.
- [Organizations, roles and Workgroups](architecture/organization-access.md): creation entitlements, protected administrative roles, explicit audiences, email-bound invitations, provisioning intents and generation-fenced offboarding.

## Machine, desktop and evidence

- [Organization/user execution domains](architecture/execution-domains.md): lazy retained environments, private working files/browser/processes, session-bound viewing, explicit operator capacity and missing-domain recovery.
- [Shared-machine architecture](architecture/shared-machine-cua-plan-2026-11-04.md), [setup/native verification](verification/shared-machine/README.md), and [task-window cleanup](verification/shared-machine/cleanup-2026-11-04.md).
- [Tauri development/packaging/lifecycle](architecture/tauri-development.md), [design rationale](architecture/tauri-desktop-design-2026-11-04.md), and [native verification](verification/tauri-development/README.md).
- [Separate GPUI visual experiment](../apps/gpui-experiment/README.md) and [retained native evidence](verification/gpui-experiment-2026-11-07/README.md): fixture UI and read-only Computer viewing; no active-host migration or distribution acceptance.
- [Conversation/Computer plan](architecture/conversation-interactions-and-computer-plan-2026-11-06.md), [implementation evidence](verification/conversation-implementation-2026-11-06/README.md), and [later refinements](verification/conversation-followup-2026-11-06/report.html).
- [Focus content viewer implementation](verification/conversation-content-viewer-2026-11-07/README.md).
- [Working files tree, local file icons and source viewer](verification/working-files-tree-2026-11-07/README.md).
- [Research index](research/README.md), [initial NMA-060 API gate](verification/nma-060/final-cohort/README.md), [NMA-061 UI](verification/nma-061/README.md), and [NMA-062 UI](verification/nma-062/README.md).

Sixteen earlier active milestones and six Desktop Rust milestones are Done for their recorded scope. NMA-072 adds the verified PostgreSQL/import foundation; NMA-073 adds the [verified account/device-session backend](architecture/user-authentication.md); NMA-074 adds verified organization administration; NMA-075 implements scoped application data; NMA-076 adds verified execution domains; NMA-077 adds verified provider connections and NMA-078 adds [scoped app accounts and Team skills](verification/nma-078/README.md); NMA-079 verifies the 2.0.0 API/isolation gate; NMA-080 implements the verified web-client scope at contract 2.1.0; NMA-081 is Done for its verified Tauri remote scope; NMA-082 is Done for deployment/recovery and NMA-083 is Done for focused integrated acceptance; NMA-063 full-product acceptance now depends on its focused acceptance, and NMA-064 remains distribution. Further desktop-rs work is paused. Native/provider, billing, API, browser/Tauri and installation claims retain separate evidence boundaries.

Run `make docs-check` or `bun run docs:check` to validate local links and backlog consistency. Only byte-identical registered historical captures may resolve missing targets in pinned Git trees. Current guides resolve against the working tree.
