# Ngertiin documentation

This repository is the authority for product decisions, local backlog, implementation and acceptance. Start with [PRODUCT.md](../PRODUCT.md) for scope and [the repository guide](../README.md) for setup. [The local workflow](development/workflow.md) explains how to maintain these documents and milestones together.

## Product and work

- [All 83 feature decisions](product/feature-decisions.md), [agents/conversations/groups](product/conversations.md), [Goals and Routine](product/goals-routine.md), and [current interface](product/interface.md).
- [Local backlog and delivery status](backlog/README.md), [feature ownership](backlog/feature-coverage.md), and [acceptance/readiness gates](development/acceptance.md).
- [Source adoption and upgrades](development/source-adoption.md), [decision handoff provenance](development/decision-record.json), and [historical evidence/Git recovery](development/history.md).

The handoff reconciles eleven decision documents and nineteen milestone records, including the deferred runtime reference. Current implementation amendments take precedence over the older planning sections they replace. The provenance record identifies the captured source/version and reconciliation boundaries; ongoing work updates this repository directly.

## Architecture and API

- [Current architecture and trust boundaries](architecture/overview.md).
- [Foundation ADR](architecture/adr-0001-harness-first-foundation.md), [lifecycle contract](architecture/harness-first-contract.md), and [consumer contract](architecture/api-consumer-contract.md).
- [Harness broker](architecture/harness-broker-contract.md), [Codex adapter](architecture/codex-adapter.md), and [Muse adapter](architecture/muse-adapter.md).
- [Agents/conversations API](architecture/agent-conversation-api.md), [queue/control/recovery](architecture/conversation-control-api.md), and [group collaboration](architecture/group-collaboration-api.md).
- [Goals/Routine API](architecture/goals-routines-api.md), [memory/skills](architecture/memory-skills-api.md), [workspace/artifacts](architecture/workspace-artifact-api.md), and [app connections/research/visual input](architecture/apps-research-visual-api.md).
- [Current checked-in contract 1.31.0](contracts/1.31.0.json). Earlier bundles and versioned guides retain their original scope; authenticated `/v1/contracts` identifies the installed server's export.

## Machine, desktop and evidence

- [Shared-machine architecture](architecture/shared-machine-cua-plan-2026-11-04.md), [setup/native verification](verification/shared-machine/README.md), and [task-window cleanup](verification/shared-machine/cleanup-2026-11-04.md).
- [Tauri development/packaging/lifecycle](architecture/tauri-development.md), [design rationale](architecture/tauri-desktop-design-2026-11-04.md), and [native verification](verification/tauri-development/README.md).
- [Conversation/Computer plan](architecture/conversation-interactions-and-computer-plan-2026-11-06.md), [implementation evidence](verification/conversation-implementation-2026-11-06/README.md), and [later refinements](verification/conversation-followup-2026-11-06/report.html).
- [Research index](research/README.md), [initial NMA-060 API gate](verification/nma-060/final-cohort/README.md), [NMA-061 UI](verification/nma-061/README.md), and [NMA-062 UI](verification/nma-062/README.md).

Sixteen active milestones are Done for their recorded scope. NMA-063 product-wide acceptance and NMA-064 distribution remain Backlog. Native/provider, billing, API, browser/UI and installation claims have separate evidence. Retained historical captures are evidence, not workflow instructions or a blanket production-readiness claim.

Run `make docs-check` or `bun run docs:check` to validate local links and backlog consistency. Only byte-identical registered historical captures may resolve missing targets in pinned Git trees. Current guides resolve against the working tree.
