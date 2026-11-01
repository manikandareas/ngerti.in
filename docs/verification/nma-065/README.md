# Creation and personalization acceptance

NMA-065 implementation and selected backend acceptance are complete. NMA-060 API readiness, UI, installer and production remain separate.

## Behavior

`POST /v1/creation/agents` accepts explicit connection/model/billing selection and an optional localized opener. With `connection_id: null`, an explicit harness is required: the agent, DM, human-owned opener and queued admission persist without choosing credentials or a model. Configure the same agent through its configuration endpoint to unblock the existing queue. Billing selection is retained on the agent and checked against its selected connection. Native model/reasoning/capability validation remains in the broker immediately before dispatch.

Names use pinned `unique-names-generator` 4.7.1. Within the authority transaction, case-insensitive occupied names receive an available numeric suffix. The default avatar is 🤖. One UUID Idempotency-Key binds agent/group creation, conversation, opener and run/router receipt. Exact retries return the original receipt; reads return current state. Changed input under the same key conflicts. The opener has user authorship and creation-operation provenance; supplied text is preserved. Tobi bootstrap remains independent.

`POST /v1/creation/groups` accepts name and owned members, and uses the existing model router to select one speaker. `POST /v1/groups/:id/configuration` and `ngertiin.update_group` update only the current group's name/shared instructions with revision checks. Group leases cannot invoke `update_agent` to rewrite global profiles. Existing scoped memory, file and membership fences remain active.

`GET /v1/threads/:id/opening` returns the opener, current run/route/task, connection capabilities/billing and recovery action. Queued preparation failures expose diagnostics on the run and remain in the same conversation. `POST /v1/threads/:id/opening/retry` requires `expected_run_id` and the usual Idempotency-Key. Only failed/cancelled work is retryable; retries reuse the original message. Unknown runs and unknown/dispatched app or browser effects cannot be replayed. Existing native reconcile resolves unknowns before any retry. Old commands cannot target a later attempt.

Personalization guidance asks one necessary question and permits immediate useful work. It does not require a questionnaire or create goals/Routine merely from personalization.

## Verification

- Final backend suite: **242/242 passed**, zero failures/skips, 1537 assertions; `logs/tests-final.log`. Initial checkpoint: 238/238, retained separately.
- Seven creation tests cover forced name collision, restart/idempotency, missing connection, failed/unknown recovery, billing rollback, 12 concurrent identical HTTP requests and 12 distinct creations, read-only reopening, human authorship, group configuration and actual scoped-tool profile denial.
- Server lint/typecheck passed. Generic consumer probe **6/6**; dedicated creation consumer examples/reference assertions **5/5**. Contract: `docs/contracts/1.13.0.json`. `creation-consumer.json` includes a localized opener and missing-connection projection.
- Native cohort: **6/6 succeeded**, zero failed/skipped/unknown: one DM opening, one router and one group response per harness. Codex CLI 0.166.0 / gpt-6.1-sol used ChatGPT subscription; Muse CLI 1.4.14-R7309.1 / SDK 1.4.14 / muse-spark-1.3 used explicit API-key developer credits. Both DMs read/update profiles via actual tools and calculate 3151. Both groups update shared name/instructions via tools and calculate 323; global profiles stay revision 2 and only one member answer is published. No goals/Routine were created.
- The service was stopped/restarted; read-only verification and original admission replay preserved identities, run counts and event cursor. `native-verified.json` retains all six run outcomes; `native.json` retains snapshots. Native groups use one member per harness; multi-member/cross-harness routing and broader privacy remain covered by existing NMA-056 evidence and the full regression suite, not claimed as a new multi-member cohort.
- Temporary proof Muse connection revoked and only its copied credential deleted. Original ChatGPT connection and user data preserved. Verification services/native clients stopped.

Initial new-test failures (invalid synthetic run state and too-short fixture token) were corrected before the final run. An initial formatter invocation from the monorepo root rejected nested config; server-directory lint was used. No native attempt failed. Native requests preceded the final nullable-default and retry-effect fences; final-build coverage for those changes is fixture/typecheck evidence, and post-change process restart verified retained native projections without new inference.

## Source and mapping

Openbot pinned revision `01e4b18e238e5de72a3570162c9f4275bb585786`: exact `src/backend/agent-service.ts` creation/initial-message/model-selection/failure cleanup flow and `src/backend/agent/profile-tools.ts` initialMessage/profile schema were inspected locally. Ngertiin reuses its existing NMA-052 identity/configuration and NMA-056 router/tool boundaries. Unlike upstream deletion after initialization failure, local creation and queued opener survive unavailable setup. No upstream default-model/provider fallback is adopted. Source hashes, dependency pins and upgrade boundary are in `provenance.json`.

`gate-amendment.json` maps the creation/personality delta to NMA-060 with route/tool/event/test references validated against 1.13.0. It supplements the immutable historical 1.11.0/1.12.0 mappings; it does not close the full gate. All five NMA-065 dependencies were fetched live and were Done.

## Reproduction

- `bun run test:server`
- Server directory: `bun run lint`, `bun run typecheck`
- `bun scripts/verification/nma060/consumer.ts docs/verification/nma-065`
- `bun scripts/verification/nma065/consumer.ts`
- Native service: `PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49959 bun apps/server/src/main.ts`
- Native verifier phases: `provision`, `codex`, `muse`, `group-codex`, `group-muse`, `observe`, `verify`, then restart/read-only `verify`, and `cleanup`. Private command identities are retained in `.dev/nma065-proof.json`; do not reprovision or replay cleaned-up connections as a new cohort.

No commit, push, deployment, UI edit or data reset. Muse subscription is not required by the user's gate amendment and is not claimed verified.
