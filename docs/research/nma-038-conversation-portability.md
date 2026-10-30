# NMA-038: conversation controls and portable agents

Date: 2026-10-30. Source: [NMA-038](https://app.notion.com/p/404abdd6187381a7a777eaec09644fc7).

Implemented and verified locally. Hermes remains the execution, session, scheduling,
interruption and recovery authority. No deployment, original-account migration,
commit, push, independent review or representative release-SLO acceptance is claimed.

## Scope and prerequisites

The primary multi-agent specification, acceptance document, capability adoption plan,
redesign coverage and native Depends on relations were read live. NMA-029 through
NMA-037 were Done with their recorded feature-specific evidence and limitations.
The NMA-037 user waivers for video generation/edit/extension and TTS remain unchanged.

The existing DM/group shell, composer steering, cancellation, reconnect, app
elicitation, goals, workspaces, computer controls, learning, media and artifact
surfaces are retained. This work integrates those entry points and supplies the
missing native clarification, history, usage, personality and portability behavior.
Unrelated working-tree design changes were preserved.

## Delivered behavior

### Conversation and agent configuration

- **Native clarification:** the native `clarify` tool remains the source of question,
  choices, timeout and resolution. Authenticated web polling projects the active
  Hermes control by owner/thread/session/generation/prompt identity. Answering uses
  native attach/respond/detach and its original blocking waiter. Reload and a second
  tab see the same question; cancellation makes the old response stale. No second
  scheduler, artificial approval gate or parallel clarification lifecycle is added.
  MCP elicitation retains its existing scoped application interaction surface.
- **Capability assignment:** `scoped_conversation` admits only native `clarify`,
  without host process/file/network access. New local account templates receive this
  grant alongside tasks/files. Existing agent grants and identities are preserved;
  existing agents can select the available clarification capability in their editor.
  Pinned native hosted rooms retain their own text-question behavior rather than
  inventing a separate blocking group-clarify implementation.
- **History:** literal, paginated message/title search, optimistic-revision rename,
  and explicitly selected text branches. Renamed primary DMs and branch names appear
  in navigation and the conversation header. Native primary-DM mappings never change.
- **Branch semantics:** preserve the same persistent agents and selected text through
  the chosen sequence. Create a fresh native session on the next message. Do not copy
  goals, schedules, files, workspaces, tool calls or sharing grants. Existing private
  agent memory continues to apply only within its normal DM boundary. Copied messages
  are visibly historical and native context explicitly treats them as inactive data.
- **Retry:** a failed DM run may be retried only before any effect, delegated child,
  tool-progress receipt or published file exists. Completed actions are also refused.
  A deterministic retry identity deduplicates different tabs and lost acknowledgments.
  Unknown and cancelled work cannot use this shortcut; users inspect results and send
  a new instruction when continuation needs an explicit decision.
- **Usage:** page through native per-run token/cost observations without summing
  cumulative session totals or substituting zero for missing receipts. The editor
  exposes the native turn limit and automatic compression setting; admitted runs
  retain their frozen configuration.
- **Personality:** native pinned presets populate the ordinary persistent soul editor
  only when explicitly applied and saved. Custom names, souls and primary DMs remain.
- **Accessibility:** historical message labels inherit bubble contrast. The transcript
  is a named, keyboard-focusable scroll region so long conversations remain scrollable
  at 320 px. New controls use existing semantic tokens and shared primitives.

### Portable agent configurations and history

The format is `ngertiin.agent.v1`, bounded to **1 MiB of canonical JSON**. It carries
soul/instructions, source configuration and Hermes revisions, native session settings,
model/inference/capability references, and explicitly selected messages, memories,
skill assets and artifacts. Ordinary export selects no history/memory/skills/files
by default. Missing or forbidden references produce errors rather than silently
exporting another scope.

Native profile distributions were inspected at the pinned source revision. Their
whole-profile archives contain host configuration, schedules and client state which
are incompatible with this owner-scoped web product. The manifest adapts native soul
content and relative, hashed skill assets; it does not extract arbitrary profile
archives or run installer scripts. Original skill file hashes and executable metadata
are retained, but imported skills start archived pending explicit review/restoration.

- Runtime model objects, endpoints, credential stores, cookies, vaults, active goals,
  schedules, native sessions and external effect receipts are not exported.
- Known runtime credentials are redacted from authored text and rejected in binary
  assets. Credential-bearing paths and traversal/absolute/normalized-path conflicts
  are rejected. Every included asset must match its SHA-256.
- Preview reports source revisions, selected counts, requirements, handle conflicts,
  model mapping and configuration-review readiness. The user selects a target-owned
  model or connects it later. Model references from the source account never resolve
  implicitly in the target account; live tool/MCP grants are reviewed separately.
- Import creates deterministic **target-owned** identities and source-to-target
  revision/identity mappings. The existing command journal supplies atomic receipts
  and cross-command import deduplication. A repeat cannot overwrite later customization.
- Selected **DM** text becomes visibly historical messages in the new agent's primary
  DM, with no run identity or automatic execution. Selected private memories follow
  the new agent. Selected **group** messages and shared memory become a read-only
  `group-history.json` artifact retaining the original author names and scope; they
  do not become new private responsibilities, group membership or shared grants.
- Binary artifacts use the existing hashed object store. Content-addressed staging
  may precede the atomic database commit, but failed import cannot publish partial
  agent identities or ready-file metadata. An unreferenced staged object is inactive.
- Pending web import/rename/branch commands retain their exact identity in
  owner-scoped session storage across reload and transport errors. Native clarify
  answer deduplication remains bound to the original native prompt/generation.

Portable packages are distinct from complete partition backup. A selected package
is not an automatic activation mechanism or a full native profile backup.

## Acceptance and fresh evidence

| Requirement | Evidence |
| --- | --- |
| Tobi, existing DM identities, real artifacts and no mandatory setup form | `browser-delivery-results.json`; actual Clerk production account authentication and actual gateway artifact publication; account/DM regressions |
| Correct DM/group scope and peer identity | `integrated-final-results.json`; private DM artifact absent in group, actual peer-authored reply; gateway cross-owner fixtures |
| Native clarification, two tabs, reload and cancellation | `test_clarifications.py`; `native-clarify-mobile.png`; integrated browser results |
| Steering, reconnect, cancellation and unknown-result protection | complete direct-message/session/context regressions; authenticated offline/draft/reload and clarify-stop walkthrough |
| Every adopted capability discoverable on desktop/mobile | 24 authenticated panel checks: Goals, learning, workspace, computer, connections and context/files in light/dark at 1440/390 px; history/export/import browser checks |
| History, branch, usage and personality | authenticated interaction, persisted native teacher soul after reload; primary-DM, revision-conflict and restart tests |
| Selected export/import round trip and actual viewer/download | DM package download and selected binary bytes; `archive-results.json`, original group authors and six selected messages preserved |
| Deduplicated import without overwriting customization | parallel gateway imports, restart, cross-owner identity mapping; browser drops the completed import response, reloads and checks the same command |
| Secrets, unsafe paths/version/hash conflicts and partial failure | malformed bundle, forbidden credential fields/paths, invalid configuration, hash conflict, handle conflict and repaired retry fixtures |
| Dependency readiness and inactive historical work | explicit configuration-review state; model reconnection/selection; archived skills; no imported runs/goals/schedules; group memory remains an archive |
| Preservation and rollback boundary | no DDL/schema changes; complete disposable partition backup/restore below; restored state remains quarantined |

All raw files are in [the verification directory](../verification/nma-038/).

- **Configured-profile engine regression:** **77 passed**, zero failed, zero skipped,
  220.38 seconds. Includes native clarify, portability, messaging, conversation setup,
  session fidelity, context boundaries, complete backups, capability authorization,
  real loopback MCP and native inference routing fixtures.
- **Final retry hardening:** **26 passed**, zero failed, zero skipped, 55.53 seconds.
  This affected-suite rerun follows the 77-case batch and adds the legacy tool-progress
  refusal regression. These are separate invocations, not 103 unique cases or a fresh
  78-case broad invocation.
- **Backend:** **22 passed**, zero failed, 12.84 seconds. **Web:** **7 passed**.
  The existing Alembic configuration warning is retained; it is not a failed test.
- **Authenticated browser:** **7/7** core workflows, **7/7** integrated workflows and
  **1/1** archive viewer/download workflow. Thirty-five accessibility/reflow snapshots
  across the core/integrated cohorts have zero reported violations or horizontal
  overflow. Desktop 1440, mobile 390, long-conversation 320, light/dark, keyboard focus,
  empty group, reload, offline/reconnect and two-tab clarification are included.
- **Static/package:** `make check`, `make build`, affected-source Ruff/format,
  whitespace and documentation checks pass. No check substitutes for browser evidence.

The browser uses actual development ClerkJS sessions verified by the unmodified
production `current_account`, an isolated PostgreSQL database, two isolated real
Hermes gateways and controlled loopback inference. The initial report file is
published by the actual gateway/tool path; exports, previews and downloads use the
production application API. No hosted signup, paid model/media inference or physical
microphone hardware is claimed freshly tested by this ticket. Predecessor live
provider/native-workspace/media evidence is retained rather than relabeled as new.

### Unsuccessful attempts and repairs

Original logs and failed screenshots are retained. Early implementation exposed a
missing `re` import after splitting portable validation from its writer. The first
related broad run recorded 49 passes and two failures; the corrected runs are separate.
An initial extended run recorded 74 passes and three MCP setup failures because the
older `.dev/nma-001/runtime` lacked `acp.schema`; the configured production profile
contains ACP and passes all 77 cases without relaxing authorization.

Browser setup initially encountered the stopped Docker/PostgreSQL stack, a server
without explicitly loaded Clerk environment, premature startup, a virtualenv symlink
resolved to the base interpreter, and strict/early-hydration selectors. These are
harness failures, not provider or product acceptance. Actual product corrections
include historical-bubble contrast, keyboard access to the long transcript, explicit
labels for preset/group-export selects and the final conservative legacy-tool retry
check. No unsuccessful cohort is overwritten or counted as a pass.

## Preservation, provenance and limits

Hermes stays at **7489b22af47ce91b366dde81d5831ea422577498**, MIT; all **195** pinned
source hashes match. The configured gateway Python is **3.14.9**. No upstream Hermes
file or historical migration is changed. Extension schema remains **20**; the new
commands use existing owner-partition tables and hashed file storage. The report's
source/evidence manifest records the exact delivered integration files and dependency
inputs. The initial browser fixture used the earlier 3.14.9 profile; native MCP
regression explicitly uses `.dev/nma-033/production` with its configured ACP extras.

The stopped disposable acceptance partition was backed up and restored using existing
operator tooling: **380 files**, matching database counts, five agents and primary DMs,
33 messages, two retained files, 66 commands and two import receipts. Native control
and import provenance survive. The restored partition is quarantined and never
activated. Private backups and credential ledgers are not included in public evidence.
No original user partition or external workspace was migrated, replaced or restored.

Rollback remains the prior Git runtime plus a verified stopped partition backup;
there is no second engine or fallback runtime. This change adds no schema transition.
The full-partition backup regression and the disposable selected-content restore
exercise existing backup integrity without importing or replaying active work.

NMA-028's baseline and thresholds remain unchanged: task success at least 95%, at
most 2% integration-attributable failure, p95 first progress at most 10 seconds,
settlement at most 180 seconds and recovery at most 60 seconds, with zero observed
duplicate effects, cross-scope leaks, stop violations or unresolved release effects.
NMA-039 must execute at least 100 representative tasks per supported configuration.
This ticket's deterministic feature tests and small browser cohorts are not that
sample. New representative progress/recovery percentiles are **unmeasured**, not zero.
Operational release and deployment remain NMA-039/NMA-027.
