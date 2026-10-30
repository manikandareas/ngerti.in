---
name: ngertiin-ticket
description: "Work on a Ngertiin Notion ticket: implement and verify it, brainstorm its design, or answer questions about its scope, dependencies, and code."
---

# Ngertiin Ticket

Handle one selected ticket using the current Notion decisions and repository evidence. Accept a ticket ID or URL followed by an action or a free-form request; Indonesian and English are both supported.

## Invocation and intent

In Codex, use `$ngertiin-ticket` or select the skill through `/skills`:

```text
$ngertiin-ticket NMA-047 implementasi
$ngertiin-ticket NMA-056 brainstorming flow routing grup
$ngertiin-ticket NMA-053 bagaimana mekanisme stop saat agent sedang sibuk?
```

Interpret the entire request, including qualifications such as "brainstorm dahulu" or "read only". A bare ticket ID calls for a brief scope/status summary, not implementation. If the ticket or requested action remains ambiguous, inspect the available context and ask only for the missing information before making dependent changes.

| Intent | Work and completion |
| --- | --- |
| Implementation, fix, or completion | Change the selected implementation, verify its acceptance, and update the ticket with evidence. Continue through completion when authorized and feasible. |
| Brainstorming or planning | Inspect the ticket and relevant code, compare practical options, recommend a design, and identify unresolved product decisions. Discuss changes without editing code, Notion, or statuses unless saving those changes was requested. |
| Questions, explanation, summary, review, or audit | Answer the specific request using relevant sources. Findings and proposals remain read-only unless the user requests a repair or update. |

Do not turn a question or brainstorming session into implementation. Conversely, an action request such as "can you implement this?" authorizes the requested work; do not stop at a plan.

## Resolve the current source of truth

1. Read the applicable `AGENTS.md` instructions and inspect the working-tree state before editing files.
2. Fetch the [main documentation](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), selected ticket in the [backlog](https://app.notion.com/p/116e1edcee864b5da91887466d728aac), and relevant [feature decisions](https://app.notion.com/p/409abdd61873813284bbf75698073d8e). Follow the relevant child documents and the ticket's `Depends on` relations. Reuse pages already fetched in this session unless their state may have changed.
3. Match the supplied identifier against the actual ticket ID/property or URL. IDs such as `A-1` are valid input formats but must resolve to a real ticket; feature IDs such as `A01` are not automatically backlog ticket IDs. Resolve a missing or ambiguous match instead of inventing an alias, creating a ticket, or selecting the next ticket.
4. Distinguish the current active plan from deferred and historical records. Read runtime requirements, phase gates, and acceptance from the current pages rather than assuming a fixed ticket count or copying old architecture rules. Explicit user instructions and newer Notion product decisions supersede historical product guidance; repository engineering conventions still apply.

If Notion is unavailable, state what could not be checked or saved. Continue only work whose scope is established by the user's instructions or supplied current evidence; do not present an old local mirror as verified current scope or claim an unsaved status update.

## Inspect evidence relevant to the request

Prefer MCP knowledge-graph tools for code discovery: `search_graph` → `trace_path` → `get_code_snippet` → `query_graph` → `get_architecture`. Use `rg` for literals, configuration, non-code files, or when graph tools are unavailable or insufficient.

Read the actual implementation and existing checks before proposing changes. For adopted Openbot modules or native SDK/protocol integrations, inspect the upstream sources linked by the ticket and record the revision, relevant behavior, and local adaptations. Source availability alone does not prove compatibility or acceptance.

For brainstorming, distinguish agreed requirements, observed behavior, and proposed engineering choices. Consider the current system, tradeoffs, a recommended approach, and any decision that actually needs user input. Answer narrower questions directly; do not force every request into a full design report.

## Implement and close the selected ticket

Apply this section only when implementation or a repair is requested.

1. Check the current scope, acceptance, and prerequisites. Implement the selected active ticket and its necessary technical changes. Optional or deferred features and additional runtimes require an explicit scope decision before becoming implementation commitments. A request to implement a deferred or historical ticket needs its intended scope resolved against the current plan first.
2. Follow the live engine/backend → API readiness → UI → installation sequence. For the current plan, UI work depends on NMA-060; verify that gate in Notion before proceeding. Dependencies that are still open are not silently implemented as extra tickets. Continue useful independent inspection while reporting a concrete prerequisite gap.
3. Update the ticket to `In Progress` when implementation actually starts. Preserve unrelated working-tree changes, historical evidence, and user data. Any development reset must be authorized and limited to the data necessary for this task. Keep all new or modified engine/backend code and authored runtime text in English; preserve user content in its original language.
4. Implement the change and run the checks needed to establish the acceptance criteria. Keep contract/fixture results separate from native provider and browser evidence. Account login, model discovery, completed inference, and a useful product-tool round trip are different outcomes. Missing credentials, failures, skips, and unknown outcomes remain visible; they do not become successful acceptance.
5. Update the selected Notion ticket's checklist, verification evidence, remaining work, and status. Record relevant code/config/source versions, commands or setup, actual results, and evidence locations. Use the existing evidence conventions without generating redundant artifacts. Verify writes when the tool reports warnings or an uncertain result.
6. Set `Done` only when all acceptance criteria and required dependencies are satisfied. Otherwise use the status supported by the actual work and record the precise remaining condition. A dependency gap before starting does not itself require changing status. Keep brainstorming proposals, historical Done records, API readiness, UI acceptance, and deployment claims distinct.

Handle routine engineering decisions autonomously. Ask for a product decision only when a real scope conflict or missing requirement prevents correct progress; explain the conflict and keep progressing independent work. Do not introduce a new approval checkpoint merely because a skill was invoked.

Implementation mode includes the selected ticket's progress/evidence updates. It does not authorize messages to other people, implementation of subsequent tickets, commits, pushes, or deployment unless the user separately requests those actions. If commits are requested, stage exact responsibility paths, preserve unrelated changes, and use descriptive messages without ticket numbers.

## Report the result

Respond in the user's language and link the selected ticket. Scale detail to the request:

- Implementation: what changed and why, meaningful verification results, unmet acceptance or limitations, and the actual final ticket status. Include commit details only if commits were requested.
- Brainstorming: the recommendation, material tradeoffs, and any unresolved decision; label proposals as proposals.
- Questions or review: the direct answer or findings, supporting Notion/code references, and relevant uncertainty.
