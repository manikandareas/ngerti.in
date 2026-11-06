---
name: ngertiin-ticket
description: "Implement, brainstorm, audit, or explain a Ngertiin milestone using the repository's local scope, acceptance, dependencies and evidence."
---

# Ngertiin Ticket

Resolve a supplied NMA ID or local milestone path against `docs/backlog/README.md` and `docs/backlog/NMA-xxx.md`. A bare ID asks for a concise scope/status explanation. A free-form change can proceed under explicit user scope without creating a ticket. Do not select a different milestone when the identifier is missing or ambiguous.

Examples: `$ngertiin-ticket NMA-063 audit`, `$ngertiin-ticket NMA-056 explain routing`, or `$ngertiin-ticket NMA-064 brainstorm setup`.

## Resolve intent and local scope

1. Read repository `AGENTS.md`, working-tree state, `PRODUCT.md`, the selected milestone and its `Depends on` records. Use `docs/product/feature-decisions.md`, `docs/architecture/overview.md` and the relevant API guide when the request touches those boundaries.
2. Distinguish implementation from questions/audits and brainstorming. Questions and design discussion remain read-only unless changes or saving are requested; action requests authorize the selected implementation.
3. Read `docs/development/acceptance.md` and the relevant existing evidence before making readiness or completion claims. Deferred milestones require a scope decision before implementation; historical Done does not establish current acceptance.

The repository is the authority. `docs/development/decision-record.json` is handoff provenance, not a dependency for ordinary work. User decisions changing scope are recorded in the local specifications and milestone records.

## Inspect and implement

Prefer available knowledge-graph tools for code discovery, then targeted `rg` when unavailable/insufficient or for non-code/literals. Inspect actual implementation and checks. Source adoption uses exact module/revision and local adaptation records under `docs/development/source-adoption.md`.

For implementation, set the selected local milestone In Progress when work begins, preserve unrelated changes and follow backend/API → UI → product acceptance → installation gates. Verify affected API deltas before UI consumption. Optional/deferred scope does not become a hidden prerequisite.

Keep fixture/contract, native/provider, billing, browser/UI and distribution evidence separate. Record versions, setup, denominators, failures/skips/unknowns and remaining conditions. Preserve secrets and raw historical evidence. Backend names and authored technical/runtime text use English; preserve original user content.

## Maintain and finish locally

Update the selected milestone's scope/checklist/evidence/status, `docs/backlog/status.json`, the backlog table and affected product/API documents together. Mark Done only when acceptance and dependencies are fulfilled. Otherwise record the actual state and precise remaining condition. Run relevant checks plus `bun run docs:check` for documentation/status changes.

Report the outcome in the user's language, link the local milestone, and state meaningful verification and remaining limits. For questions/brainstorming, give the specific findings or proposal without status mutations.

This workflow updates repository records. Commits, pushes, deployment, publishing and messages to other people require their own authorization; a commit request covers a scoped local commit only.
