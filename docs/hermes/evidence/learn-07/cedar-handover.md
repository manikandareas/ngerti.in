# Cedar — Ticket Handover

Prepared: 18 November 2026
Sources: `cedar-tickets.txt`, `cedar-assignments.txt`

## Summary

| Ownership category | Count |
| --- | --- |
| Tickets with one agreed owner | 2 |
| Tickets with conflicting owners | 1 |
| Tickets with no owner | 1 |
| Assignments with no matching ticket | 1 |
| **Tickets tracked** | **4** |

## Tickets

Every tracked ticket appears once, with current status and owner where the records agree.

| Ticket | Summary | Status | Owner | Note |
| --- | --- | --- | --- | --- |
| C-41 | Confirm dock equipment delivery | Open | Inez | Assignment listed twice, same owner — not a conflict |
| C-42 | Validate the evening checklist | Waiting | — | No assignment record; owner missing |
| C-43 | Approve the fuel invoice | Open | — | Conflict: Robin and Jessie both listed |
| C-44 | Send the shift attendance report | Complete | Damar | — |

## Conflicts to resolve

**C-43 — Approve the fuel invoice (Open)**
Two different owners are listed for this open ticket: Robin and Jessie. No basis in the records to prefer either. Decide a single owner before handover, since approving a fuel invoice is an accountability-sensitive action.

## Missing owners

**C-42 — Validate the evening checklist (Waiting)**
The ticket exists in the tracker but has no assignment row at all. It cannot be handed over until an owner is named.

## Assignments with no matching ticket

**C-99 — Dana**
Dana is assigned to a ticket that does not appear in the tracker. Either the ticket is missing from the tracker export or the assignment is stale. Confirm which, and remove or add the record accordingly.

## Notes on data quality

- `C-41 | Inez` appears twice in the assignment file. This is a duplicate row with the same owner, so it is treated as a single agreed owner rather than a conflict.
- The two files were not otherwise reconciled beyond ticket ID matching.

## Open items at handover

- Resolve the C-43 owner conflict (Robin vs Jessie).
- Assign an owner to C-42.
- Reconcile C-99 / Dana with the tracker.
