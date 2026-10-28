# Native delegation and persistent collaboration

Implementation for [NMA-035](https://app.notion.com/p/404abdd6187381ffa00ee1b6394ba51f), authorized by the user's implementation/continuation instructions. The live main design, ticket and all eight predecessors were read before implementation. This is local implementation and acceptance evidence; deployment and release reliability remain separate.

## Runtime and ownership

Hermes remains the model, session, admission, execution, stop and recovery authority. Its revision remains `7489b22af47ce91b366dde81d5831ea422577498`, archive SHA-256 `8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`, MIT. No upstream source file is edited. [runtime-pin.json](../../apps/engine/src/ngertiin_engine/runtime-pin.json) records source hashes, exact integration seams and dependency versions. Existing notices and packaging restrictions remain applicable.

The native delegation provider extension selects frozen owner-local model references through per-child credential relay leases. Narrow dispatch/construction/conversation seams preserve native parallelism, schema validation/repair, list/steer/stop controls and parent lineage. They also preserve the existing authority and final tool fences. Temporary children cannot mutate persistent memory, goals, skills or peer tasks. They never become `nma_agents` or group members.

Every native child gets its own isolated resource identity, derived from owner, permanent parent and native child session. This resource identity is not a product agent. The native resource watcher resolves it back to the permanent owner and checks current grants. Model/control credentials remain outside tool capsules. Host worktree/profile discovery is disabled for product children; actual Git worktrees use the existing scoped `coding` tool inside the child's capsule. Parent workspace content crosses only through explicit context/artifact transfer.

The provider vault lock orders credential revoke against actual request-body dispatch, then releases before response headers. Independent child inference no longer serializes behind another child's first token. `provider.attempt` retains actual connection/model/usage and child identity under the parent run, including late billable receipts without authorizing late content delivery. Missing provider usage is not invented or priced again.

Native asynchronous results re-enter through the existing gateway admission outbox with one stable completion identity and the original user-message scope. Known results are never respawned. Native dead-owner recovery retains partial results and truthful unknowns; host-only transcript/Git recovery hints are excluded from product model input. Internal continuations do not create synthetic user messages.

## Persistent peers

The `collaboration` domain tool supports `list`, `handoff`, `submit`, `review`, `block` and `unblock`. Handoffs retain identity, expected result, original implementer, assignee, scoped source/result artifacts, dependencies, optional goal and membership revision. Existing mutations require the latest revision; operation receipts and semantic handoff keys make retries idempotent. A submission or review is verified only after its actual native turn succeeds. Requested changes return to the original implementer; independent review cannot approve its own submission.

Verified transitions project into the pinned native Kanban kernel. The Kanban dispatcher is not activated. Explicit pending task/review revisions can continue after the native informal discussion envelope settles, through the same gateway outbox and native execution path. A turn that produces no verified task transition becomes blocked rather than repeatedly running. Dependencies advance only from verified completed receipts. Cancellation, incoming user interruption and membership changes fence pending work and late publication.

Existing canonical-room routing remains authoritative. Sentence-ending punctuation on mentions is normalized only in the routing projection; the original user/agent transcript remains unchanged. Stable peer personas/models and separate DM/group histories remain intact. One human owner per group remains the boundary.

## Product surface and configuration

Conversation snapshots/events add temporary child progress/results and durable peer task progress. The production conversation page labels temporary assistants separately, shows expected results/responsible peers/reviewers and stored evidence, and lets the user stop subordinate work through its parent. Desktop and mobile use the same component.

Delegation requires an enabled operator catalog grant and an explicit agent grant. New partition catalogs and the version-2 example expose:

```json
{
  "execution_surfaces": {
    "children": {"kind": "scoped_delegation", "ready": true}
  },
  "tool_grants": {
    "delegation": {
      "enabled": true,
      "toolset": "delegation",
      "execution_surface": "children"
    }
  }
}
```

Agent configuration selects `tool_grants: ["delegation"]` alongside any other explicit grants. Per-child `model_ref` selects an available owner-local model; `allowed_toolsets` can only narrow the parent, and `[]` means zero tools. Workspace/coding grants still require the reviewed native Linux image. Frozen native delegation resource knobs remain operator-controlled. Existing operator catalogs and real agent selections are not overwritten or automatically enabled.

## Verification and evidence

Final feature/context acceptance passes 24/24 cases in two batches (23 plus the
additional mid-submission peer crash case), with no failures or skips. Backend
tests pass 28/28; the final real-model cohort passes 3/3. Broad regression raw
failures, their verified repairs and remaining opt-in skips stay explicit below.

The machine-readable [verification manifest](evidence/nma-035/verification.json) records final commands/counts, source/evidence hashes, unsuccessful attempts, skipped denominators and limits. Evidence is divided by oracle rather than combined into a release success rate:

| Contract | Evidence |
| --- | --- |
| Real parallel structured results and parent combination | [Live provider cases](evidence/nma-035/live/live.json); deterministic HTTP concurrency barrier in `test_delegation.py` |
| Specialist review of the supplied disposable diff | Real model detects the zero-count division defect and returns schema-validated findings |
| Real Researcher → Writer → Reviewer task | Writer publishes actual report bytes; Reviewer reads the exact stored artifact and approves the durable task |
| Native controls, nested cancel/revoke, distinct connection/model and usage | `test_delegation_controls.py` |
| Lost completion event, known/unknown partial recovery and no replay | `test_delegation_recovery.py` |
| Separate child workspaces, actual Git worktrees and artifact lineage | Opt-in `test_delegation_workspaces.py` with the reviewed Docker image |
| Request changes, dependencies, block/unblock, duplicate/restart, cancel/member revoke and private-DM canary | `test_collaboration.py`, `test_collaboration_safety.py` and existing group/context suites |
| Additive schema upgrade, complete restore and previous Git runtime rollback | `test_collaboration_migration.py` plus historical migration suites |
| Actual authenticated desktop/mobile UI | [Walkthrough and limitations](evidence/nma-035/ui/walkthrough.json), [Clerk evidence](evidence/nma-035/ui/authentication.json), [desktop](evidence/nma-035/ui/final/group-desktop.png), [mobile](evidence/nma-035/ui/final/group-mobile.png), [mobile stop](evidence/nma-035/ui/final/delegation-stopped-mobile.png) |

The real-model cohort uses the existing OpenRouter OAuth connection with exactly `openai/gpt-6-luna`. It is separate from ChatGPT plan acceptance: the original ChatGPT gateway was absent, so its refresh was not attempted through another writer. The configured OpenAI Sol route returned `429 credit_balance_exhausted`; that unsuccessful probe remains recorded. The successful provider cohort is not a substitute for either unavailable route. Original credential journals were hash-checked unchanged.

The UI imports actual production conversation components and uses actual ClerkJS development sessions through unmodified production `current_account` and the production API. Its model HTTP and frontend router/bootstrap are controlled fixtures. It verifies mobile stop status without reload, persisted stop after reload, no late child publication, group-message send/answer, preview and exact downloaded artifact bytes. It is not hosted login/deployment acceptance. Recorded disposable users/sessions/database/gateways/listeners are cleaned; unrelated resources and account data are preserved.

All initial failures remain retained, including the real parallel credential-lock defect, shared child resource identity/watcher defect, cancellation notification/late-result defects, historical migration ordering defect, and fixture errors involving native deferred tools, repeat guards, timing and multi-board expectations. A failed probe, skipped native test or screenshot alone is never counted as a passing runtime oracle.

## Data, rollback and reliability boundary

Extension schema 18 adds five owner-scoped tables for native child/batch projections and peer task/operation/unit receipts. Versions 1–17 and their checksums remain unchanged. Original persistent agent/group IDs, history, goals, memory, skills, files and receipts are preserved. Historical migration fixtures remove later extensions when reconstructing old versions; schema-4 backfill does not query delegation tables before they exist.

The disposable rehearsal upgrades a real schema-17 snapshot, restores a schema-18 snapshot containing known child results, native Kanban state, verified reviews and shared files, and verifies no repeated model calls. Rollback restores the verified schema-17 backup under the previous Git runtime, with the forward state retained separately. Restore quarantine is cleared only within that stopped disposable rehearsal. No second engine runs concurrently and no real account is migrated by these tests.

[NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1) remains the baseline. Its historical main corpus is 99 attempted cells: 70 successful tasks, 20 failed tasks and nine verified stops; separate role-bound group evidence is 6/6. This ticket's feature-specific useful-task cohort remains separate. No causal latency-overhead comparison is claimed for different providers/prompts/tool settings. The unchanged 95% task-success release target and at least 100 representative tasks per supported configuration remain with NMA-039; operator/release readiness remains with NMA-027.

## Reproduction

Use the pinned source and the reviewed production interpreter, with no other native gateway suite running:

```sh
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-033/production/bin/python" \
uv run --python .dev/nma-033/production/bin/python --with pytest --with pytest-asyncio \
python -m pytest apps/engine/tests -q
```

For the child workspace test, additionally set `NMA_TEST_NATIVE_IMAGE=sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d`. Native/private-provider tests without their explicit prerequisites remain skipped, not passed.

`scripts/verification/nma035_live.py` runs the three real-provider cases using an existing owner connection; private bootstrap files are removed afterward. `scripts/verification/nma035_ui.py` seeds reproducible native task/review data behind the disposable real Clerk/API fixture. Follow the existing browser harness dependency-link instructions, then use `apps/engine/tests/browser/collaboration.config.ts`; keep the separate ClerkJS session open for renewable tokens and perform recorded fixture cleanup afterward.
