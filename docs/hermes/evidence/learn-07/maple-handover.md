# Maple Handover — Tickets and Ownership

Prepared 18 November 2026 from `maple-tickets.txt` and `maple-assignments.txt`.

## Overview

| Metric | Count |
| --- | --- |
| Tracked tickets | 4 |
| Ownership agreed | 2 |
| Ownership conflicts | 1 |
| Missing owners | 1 |
| Assignments with no matching ticket | 1 |

All four tracked tickets appear exactly once below. Agreed + conflict + missing (2 + 1 + 1) equals the tracked total of 4.

## Tracked tickets

| Ticket | Summary | Status | Owner | Ownership |
| --- | --- | --- | --- | --- |
| M-10 | Restore maintenance log | Open | Nadiya | Agreed |
| M-11 | Confirm the dispatch handover | Complete | Isaac | Agreed |
| M-12 | Validate the mirror copy | Waiting | Tania, Santi | **Conflict** |
| M-13 | Review the safety briefing | Open | — | **Missing** |

## Ownership conflicts

### M-12 — Validate the mirror copy

- Status: Waiting
- Competing owners: **Tania** and **Santi**
- Source: two distinct rows in the assignments file (`M-12 | Tania`, `M-12 | Santi`). The records disagree, so no single owner can be confirmed.

## Tickets with no owner

### M-13 — Review the safety briefing

- Status: Open
- No assignment row exists for this ticket. It is tracked but currently unowned.

## Assignments with no matching ticket

| Assignment | Owner | Note |
| --- | --- | --- |
| M-88 | Mira | Ticket M-88 does not appear in the tracker. |

## Duplicate assignments (not conflicts)

M-10 is listed twice in the assignments file, both times as **Nadiya**. Identical names were de-duplicated, so this is an agreed owner rather than a conflict.

## Highest-risk items

1. **M-12** — contested ownership between Tania and Santi while the ticket is in Waiting. Needs a decision on the accountable owner before handover completes.
2. **M-13** — Open work with no owner assigned; nothing indicates who is responsible.
3. **M-88 / Mira** — an assignment pointing at a ticket outside the tracked set; either the ticket is missing from the tracker or the assignment is stale.
