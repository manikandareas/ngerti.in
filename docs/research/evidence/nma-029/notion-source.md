Here is the result of "fetch" for the Page with URL https://app.notion.com/p/404abdd618738173a4dbeb0ef22a8308 as of 2026-10-26T04:41:17.904Z:
<page url="https://app.notion.com/p/404abdd618738173a4dbeb0ef22a8308">
<ancestor-path>
<parent-data-source url="collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a" name="Ngertiin Multi Agent · Backlog"/>
<ancestor-2-database url="https://app.notion.com/p/116e1edcee864b5da91887466d728aac" title="Ngertiin Multi Agent · Backlog"/>
<ancestor-3-page url="https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a" title="Ngertiin Multi Agent"/>
</ancestor-path>
<properties>
{"Depends on":["https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1","https://app.notion.com/p/402abdd61873818abd30d42ac276b671","https://app.notion.com/p/402abdd61873812aa2d9fae23a3f6399","https://app.notion.com/p/402abdd618738198bf32d60df304ab97"],"Fase":"Foundation","Jenis":"Implementasi","Name":"NMA-029 · Hermes runtime, session fidelity and durable recovery","Prioritas":"P0","Referensi":"https://app.notion.com/p/404abdd6187381d48e0cf27220703a95?pvs=204","Status":"Ready","Ticket":"NMA-029","Urutan":29,"url":"https://app.notion.com/p/404abdd618738173a4dbeb0ef22a8308"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
## Outcome

Preserve native Hermes execution and context behavior while making admission, tool outcomes and interrupted work durable and recoverable.

<b>Status:</b> Backlog. This ticket plans implementation; no delivery or test result is claimed. It groups 3 related work packages at the user's request. Complete the numbered units in the order below; acceptance is evaluated per unit and for the combined outcome.

## Scope and prerequisites

Inventory IDs: O08, O13, M05, M06, M07, M08, U08, O12.

Required predecessors: NMA-028, NMA-005, NMA-009, NMA-010. Read the native Depends on relations and current evidence before starting.

<mention url="https://app.notion.com/p/404abdd6187381d48e0cf27220703a95" /><br /><mention url="https://app.notion.com/p/402abdd61873818abd30d42ac276b671" /><br /><mention url="https://app.notion.com/p/402abdd61873812aa2d9fae23a3f6399" /><br /><mention url="https://app.notion.com/p/402abdd618738198bf32d60df304ab97" />

## Ordered implementation units

### 1. Implement the selected Hermes integration boundary and lifecycle

Make the selected Hermes gateway the authoritative execution path while reducing accidental coupling and preserving durable product identities.

<b>Implementation</b>

1. Implement the NMA-028 interface decision for create/resume/submit/interrupt/events. Map owner, agent, thread, logical session, config revision and operation ID explicitly; preserve native session lineage across restart.
2. Move integrations to documented hooks/plugins where adequate. For unavoidable internal wrappers, centralize installation, version-check signatures and behavior, and test wrapping order; remove obsolete wrappers only after parity evidence.
3. Keep product goal/context/membership extensions inside the one execution authority. API translates authenticated commands and projections; infrastructure supervisor only starts/stops isolated processes.
4. Preserve durable admission receipts and reconcile lost acknowledgements with the same operation ID. Establish startup readiness, graceful drain and generation/epoch fencing before accepting work.
5. Extend lifecycle events with structured, redacted failure phase and correlation IDs without changing native tool results or hiding useful errors from the agent.

<b>Acceptance</b>

- [ ] Create, resume, lost ACK, duplicate submit, queued/active cancel and hard restart preserve identity and do not duplicate admitted work.
- [ ] Closing all clients does not cancel accepted work; restarting API does not create a replacement agent/session.
- [ ] Stale workers cannot publish or dispatch after ownership loss.
- [ ] All integration seams are documented, tested against the selected pin, and no retired executor remains active.

<b>Verification:</b> Real gateway contract suite plus paired native/adapter runs; inject process death at admission/receipt boundaries and exercise existing DM/group/goals regressions.

<b>Data and rollback:</b> Additive, checksummed binding/receipt migrations; rehearse backup/restore and preserve old session mappings.

<b>Boundary:</b> Do not reimplement the model loop, introduce a competing queue owner or equate an accepted command with completed inference.

### 2. Preserve native session context, compression and conversation continuity

Let long and tool-rich conversations retain the useful native Hermes context behavior within Ngertiin's private DM/group boundaries.

<b>Implementation</b>

1. Compare the actual model request/history against direct Hermes. Remove redundant transcript injection and preserve authorized tool/result lineage, compression summaries and logical-session continuity rather than rebuilding all history as plain user/assistant text.
2. Define one scoped context assembly contract for persona, agent memory, thread transcript, shared artifacts and project instructions. Rehydrate only authorized generations; keep private DM content out of group prompts.
3. Replace the hard-coded max\_turns=8 with native-compatible validated configuration and explicit resource exhaustion/continuation behavior. Every remaining limit needs a documented operational reason and visible semantics, not an initiative score.
4. Connect automatic/manual compression, micro-compaction and supported context-engine configuration to native behavior. Make model/context metadata and compression receipts observable.
5. Define file/folder/diff/URL reference expansion and project instruction precedence against the workspace capability contract; implement core context contracts here and finish workspace/composer wiring in NMA-031/054.

<b>Acceptance</b>

- [ ] Multi-turn tool results and compressed context survive restart without duplicated transcript injection or cross-thread access.
- [ ] A long task exceeding eight native iterations can complete or continue according to the declared lifecycle; it is not silently truncated.
- [ ] Compression/reset preserve stable product identity and expose intentional context changes.
- [ ] Scope revoke removes future access while preserving already completed user-visible history; malformed references cannot select host paths.

<b>Verification:</b> Paired short/long sessions, tool-heavy histories, compression before/after restart, changed model/config, DM/group transitions and revoked context. Inspect redacted provider requests and token counts.

<b>Data and rollback:</b> Preserve transcripts and native compression lineage. Rebuild derived indexes, never overwrite original messages.

<b>Boundary:</b> Native profile-wide memory cannot be enabled across all agents simply to obtain parity.

### 3. Make tool outcomes and interrupted work recoverable without duplicate effects

Separate failed transport, rejected action, completed action and unknown outcome so recoverable tool faults do not unnecessarily kill conversations or cause repeated external actions.

<b>Implementation</b>

1. Define durable intent, dispatch, execution receipt and post-action observation states. Store stable operation identity and provider receipt references before/after the respective boundaries.
2. Correct the current computer path where a returned INDETERMINATE error may settle an unknown action as confirmed. Knowing that the model saw an error is not evidence that the action failed.
3. Separate act from observe outcomes. Query an actuator's durable dispatch receipt where available; re-observe relevant state and record evidence before deciding whether another action is safe.
4. Classify retry semantics per operation. Known pre-dispatch rejection can be repaired; reads can be repeated where safe; unknown writes must reconcile or surface a specific blocker. Batched browser\_exec/code blocks may contain multiple effects, so do not automatically replay the entire block.
5. Persist meaningful goal work-unit outcomes and continuation lineage. Recover never-started admissions natively; reconcile interrupted started work before creating a linked continuation. Preserve stop/pause and descendant fences.

<b>Acceptance</b>

- [ ] Crash before dispatch, after effect, before receipt and after receipt has an explicit tested outcome.
- [ ] A successful click followed by failed DOM observation is never reported as proof the click was rejected.
- [ ] Confirmed operations reuse receipts; unknown mutations are never blindly replayed or silently cleared.
- [ ] Recoverable failures return actionable tool context and can continue the same conversation; stops remain stopped after recovery.

<b>Verification:</b> Fault injection with a counting external test service and browser fixtures, including lost subprocess output, late receipts, authority loss, timeout and partial batched execution. Assert external counts, not only database flags.

<b>Data and rollback:</b> Add outcome/receipt metadata without rewriting old unknowns as success; inventory and reconcile existing unsettled operations before enabling replacement dispatch.

<b>Boundary:</b> No exactly-once guarantee for external services without idempotency; no permanent blanket block on safe observation needed for reconciliation.

## Combined definition of done

- [ ] All unit acceptance criteria are satisfied with linked evidence; an incomplete unit keeps this ticket open.
- [ ] Exact Hermes revision, dependencies/notices, configured capabilities and integration changes are recorded. Native source availability alone is not product acceptance.
- [ ] Real runtime/tool behavior, applicable authenticated web UI, failure/restart, scope isolation, cancellation and duplicate-effect behavior are verified. Required live tests cannot be silently skipped.
- [ ] Use NMA-028's pre-registered baseline/thresholds; record counts, denominators and limitations, including unsuccessful attempts.
- [ ] Versioned API/config/schema changes preserve existing identities, history, goals, skills, files and receipts; migration and rollback are rehearsed on disposable data where applicable.

Each capability includes its minimal usable API/UI and evidence here. NMA-038 integrates the complete user experience; it must not become a reason to defer all product verification until the end. Hermes remains the sole execution/scheduling/recovery authority. No mandatory goal activation form, multi-human group, arbitrary initiative gate or alternate engine is introduced.

## Implementation starting points

- <code>apps/engine/src/ngertiin_engine/service.py</code>
- <code>apps/engine/src/ngertiin_engine/adapter.py</code>
- <code>apps/engine/src/ngertiin_engine/runtime.py</code>
- <code>apps/backend/src/ngertiin/agent_engine/api.py</code>
- <code>apps/engine/src/ngertiin_engine/context.py</code>
- <code>apps/engine/src/ngertiin_engine/transcript.py</code>
- <code>apps/engine/src/ngertiin_engine/reliability.py</code>
- <code>apps/engine/src/ngertiin_engine/computer.py</code>
- <code>apps/engine/src/ngertiin_engine/goal_continuation.py</code>
- <code>apps/backend/src/ngertiin/agent_engine/computer_bridge.py</code>

These are current inspection entry points, not compulsory final module boundaries. Re-check live code with knowledge-graph tools when available. Preserve unrelated working-tree changes. New engine/backend code and authored technical text are English; preserve user content.

## Sources

<mention url="https://app.notion.com/p/403abdd61873817baf6af25d6636fe72" /><br /><mention url="https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f" />

- [Hermes: hooks](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/hooks.md)
- [Hermes: managed-scope](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/managed-scope.md)
- [Hermes: multi-profile](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/multi-profile-gateways.md)
- [Hermes: egress](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/egress/index.md)
- [Hermes: secret-sources](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/secrets/index.md)
- [Hermes: context-files](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/context-files.md)
- [Hermes: context-references](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/context-references.md)
- [Hermes: compression](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/developer-guide/context-compression-and-caching.md)
- [Hermes: micro-compaction](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/developer-guide/micro-compaction.md)
- [Hermes: sessions](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/sessions.md)
- [Hermes: built-in-plugins](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/built-in-plugins.md)
- [Hermes: cli](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/cli.md)
</content>
</page>

<parent-data-source-schema url="collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a">
The SQLite table definition for this page's parent data source. Use these column names and option values to set this page's properties, create sibling pages, or query the data source.
<sqlite-table>
CREATE TABLE IF NOT EXISTS "collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a" (
	url TEXT UNIQUE,
	createdTime TEXT, -- ISO-8601 datetime string, automatically set. This is the canonical time for when the page was created.
	"Owner" TEXT, -- JSON array of zero or more user IDs
	"Fase" TEXT, -- one of ["Discovery", "Foundation", "DM", "Goals", "Groups", "Integration", "Release"]
	"Referensi" TEXT,
	"Depends on" TEXT, -- JSON array of page URLs relating to {{collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a}} data source, you must "view" {{collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a}} to query this column
	"Jenis" TEXT, -- one of ["Spike", "Implementasi", "Validasi"]
	"Urutan" FLOAT,
	"Ticket" TEXT,
	"Prioritas" TEXT, -- one of ["P0", "P1"]
	"Status" TEXT, -- one of ["Backlog", "Ready", "In Progress", "Review", "Blocked", "Done"] Default: "Backlog".
	"Name" TEXT
)
</sqlite-table>
</parent-data-source-schema>
