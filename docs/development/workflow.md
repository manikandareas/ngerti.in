# Local project workflow

The repository is the authority for product scope, decisions, backlog, acceptance and evidence. Work begins from [the documentation index](../README.md), [PRODUCT.md](../../PRODUCT.md), the relevant API guide, and the selected [local milestone](../backlog/README.md). The [decision handoff record](decision-record.json) is provenance, not a requirement to fetch an external tracker.

## Select work

Resolve a ticket ID to `docs/backlog/NMA-xxx.md`, then read its plan, status, scope, acceptance and `Depends on` list. ID is stable; order controls reading/delivery and may be fractional. NMA-065 is order 13.5 before NMA-060. NMA-051 is deferred; old NMA-001–046 are historical scope, not the active queue.

Requests to explain/audit or brainstorm are read-only unless implementation or saving is requested. An action request authorizes the selected work. A free-form change can proceed under explicit user scope without manufacturing a ticket. Scope ambiguities require only the missing decision; useful independent inspection can continue.

## Implement and verify

1. Inspect working-tree state and current implementation; preserve unrelated changes.
2. Check dependencies and relevant phase gates. Backend/API precedes UI, NMA-063 precedes distribution; reverify affected API deltas before UI consumption.
3. Record In Progress when work starts on a selected milestone. Implement within required or explicitly promoted scope. [Source adoption](source-adoption.md) records module/revision/reuse/upgrade expectations.
4. Run checks relevant to the change and the [acceptance criteria](acceptance.md). Keep fixture, native/provider, browser, billing and distribution proof separate.
5. Update the milestone's checklist/evidence/remaining conditions and status, `docs/backlog/status.json`, the backlog table, and affected product/API guides. Finish only when these records agree and local links/checks pass.

A user decision changing scope is recorded in the authoritative local product/feature page and all affected dependencies/contracts/UX guides. Replace conflicting old direction; put retained historical observations behind explicit history/version labels. Evidence is preserved for its captured scope rather than relabeled as a fresh acceptance run.

## Status meanings

| Status | Meaning |
| --- | --- |
| Backlog | Planned, with work or prerequisites still open. |
| Ready | Clear scope and completed prerequisites; not yet started. |
| In Progress | Work is actually underway. |
| Review | Implementation/evidence awaits review. |
| Blocked | A concrete impediment and reopening condition are recorded. |
| Done | Relevant scope, dependencies, acceptance and gates are fulfilled. |
| Retired | Scope was replaced/removed, not successfully implemented. |

Plan is independent of status: a deferred milestone can remain Backlog without entering the active queue. Never promote optional/deferred scope merely because source exists or its dependencies are Done. Owner and due date remain unset until explicitly assigned.

## Delivery boundaries

A local commit requires a commit request and exact staging of the responsibility slice. A commit request does not authorize push, deployment, publishing or messages to other people. Ordinary project work updates repository records; it does not synchronize an external workspace. Preserve evidence bytes, credentials and unrelated work. New-runtime data must survive ordinary restart/recovery even when historical development data can be reset.
