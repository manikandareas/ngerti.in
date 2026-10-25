# Native Hermes seam and execution-boundary audit

Date: 2026-10-25. Scope: NMA-028 source/provenance investigation. This document
does not change the application runtime, approve a production backend, or claim
that source availability satisfies product acceptance. The live paired/native
measurements and their denominators are owned by the accompanying NMA-028
baseline report.

The authoritative requirements are [NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1)
and [the capability adoption plan](https://app.notion.com/p/404abdd6187381d48e0cf27220703a95).
The inspected Hermes revision is
`7489b22af47ce91b366dde81d5831ea422577498`. GitHub's commit API returned that
exact SHA and commit time `2026-10-23T09:22:46Z`; no newer runtime or dependency
pin is selected by this audit. Local source is the previously hash-verified
archive. Self-review verified all 14 upstream files cited for seams, execution,
plugins and executable provenance byte-for-byte against archive SHA-256
`8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`;
their hashes are in the packaging review. Application citations refer to the
current working tree, whose exact input digest belongs in the baseline manifest.

## Decision recommendation

Retain Hermes as the one session/admission/execution/cancellation/recovery and
scheduling authority. Use its canonical gateway commands and native tool
schemas/results. Keep Ngertiin's authenticated product identity, scopes,
immutable configuration revisions, grants and projections as domain extensions.
Prefer supported plugin/observer interfaces where their actual failure semantics
fit the requirement; use narrowly versioned adaptations where they do not.
Do not replace a fail-closed privacy boundary with an observer hook or
fail-open middleware merely to remove a monkey patch.

**Select Linux Docker as the disposable research backend** for native
browser+terminal experiments: it can co-locate Python, Chromium/CDP, terminal and
optional desktop/driver without giving model-written code a host Docker socket.
This is a concrete spike choice, not a claim that the current production worker
boundary is ready. Production adoption remains conditional on the measured
probe, a complete dependency notice set, and the scoped worker/credential broker
seam below. SSH and cloud/plugin variants remain supported-configuration
candidates, with no unmeasured latency/cost superiority claimed.

The exact current pin can be installed for a private disposable experiment, but
its published `fetch-use` notice gap is still a distribution blocker. A
successful research image must not be relabelled a releasable application image.

## What the existing interfaces actually provide

The native gateway exposes `session.create`, `session.resume`, `prompt.submit`,
`prompt.receipt`, `prompt.cancel`, `prompt.resolve_unknown`,
`session.interrupt`, `session.events.since`, configuration and other handlers in
one authority. Session creation/staging, immutable launch policy, native
admission identities and replay are reusable seams; no second Ngertiin prompt
queue is needed. Managed workers are admission-owned, and their bootstrap
contains the profile home, policy and route model key. A subprocess is therefore
an execution boundary but is not, by itself, an OS security boundary.
([Native command registry](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/session_controls.py#L173-L203),
[session staging](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/session_local.py#L202-L294),
[managed worker policy/bootstrap](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/session_managed_worker.py#L36-L85).)

Plugins expose lifecycle hooks, tool and LLM request/execution middleware,
and scoped provider registrars. These are real extension seams rather than a
promise that every Ngertiin identity/privacy requirement has an existing hook.
Execution middleware prevents calling its downstream callback twice, but if a
callback raises before calling downstream, the manager reports the failure and
continues to the next callback. Privacy authorization cannot depend solely on
raising an exception in that middleware.
([Plugin registrars](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/plugins.py#L943-L965),
[middleware execution semantics](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/middleware.py#L143-L214),
[pre-tool directives](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/plugins.py#L1941-L1960).)

## Seam disposition and implementation ownership

| Existing seam | Disposition and required behavior | Implementation owner |
| --- | --- | --- |
| Native SessionAuthority, immutable session creation, admission queue, cancellation and replay | Retain. Drive the canonical authority and reconcile durable receipts; never duplicate its lifecycle in an API worker. | NMA-029 |
| `Adapter.session` trusted policy, actor and binding IDs | Retain the domain mapping; narrowly version its private staging/commit integration until a suitable native extension exists. Preserve exact policy fingerprints and secret separation. | NMA-029; provider configuration NMA-030 |
| Blanket `agent.max_turns=8` in the adapter | Replace with supported native configuration, including provider limits and continuation behavior. The baseline keeps the old value to measure the current implementation. | NMA-029, NMA-030 |
| `EngineRunner._run_agent` admission/grant/context checks | Retain the live fences. Reduce the subclass to product scope binding; use a supported native seam only after queued/restart/revocation behavior is proven. | NMA-029, NMA-030 |
| `_run_scoped_agent` reconstruction of history as user/assistant text | Replace with authorized native session history/tool lineage and compression. Keep shared-result references as scoped data. Plain visible transcript cannot stand in for native tool-result history. | NMA-029; memory NMA-034; groups NMA-035 |
| `model_tools._execute_tool` wrapper and session-MCP `_borrowed` guard | Narrowly version until equivalent final-dispatch authorization and discovery redaction are proven for deferred/nested dispatch. Retain privacy/generation checks; broaden the capability catalog instead of removing these checks. | NMA-030, NMA-033 |
| Allowlist accepting only native `todo` plus custom workspace/computer | Replace the arbitrary feature restriction with an operation/configuration manifest and native toolsets. Reachability still depends on prerequisites and owner grants. | NMA-030; capability-specific tickets NMA-031–037 |
| Text-only server skill contents | Replace with native skill directories, progressive loading, references and scoped scripts; preserve existing authored skill contents and provenance. | NMA-034 |
| HTTP-only private MCP specifications | Adapt native transports, elicitation/sampling, account connection and secret ownership. Do not publish endpoint headers or rewrite native schemas to hide them. | NMA-033 |
| Custom `computer`/E2B browser action schema | Replace with native browser/computer contracts in the selected sandbox; retain historical resource/effect receipts and reconcile them before retirement. No automatic old-browser fallback. | NMA-032 |
| Text artifact publisher and no input attachments | Adapt native files/deliverables and uploads with immutable provenance, access and actual file bytes. Retain old artifact IDs. | NMA-031; media NMA-037; integrated UX NMA-038 |
| `TurnRunner._run_conversation_with_approval` usage wrapper | Prefer native receipt/observer integration for per-turn usage; preserve missing/unknown cost attribution. Keep a narrow versioned adaptation until observer payloads prove sufficient. | NMA-039 |
| Product goal/wake outbox, permanent peer discussion and handoff | Retain automatic goal capture and product identities; adapt native scheduling/delegation primitives under the same authority. Avoid activating both product and native schedulers for the same occurrence. | NMA-035, NMA-036 |
| UI projections and private command socket | Retain authenticated Ngertiin product contracts and add native clarification, streaming/tool/error/interrupt presentation. Do not import the complete Hermes client. | NMA-038; each capability ticket owns minimal usable API/UI |

Application evidence: [adapter](../../apps/engine/src/ngertiin_engine/adapter.py)
lines 186–285; [runner integration](../../apps/engine/src/ngertiin_engine/service.py)
lines 160–354; [capability resolution/dispatch](../../apps/engine/src/ngertiin_engine/capabilities.py)
lines 50–118 and 151–188;
[usage adaptation](../../apps/engine/src/ngertiin_engine/diagnostics.py) lines 49–80.
These are observed current seams, not newly implemented replacements.

**Candidate upstream contributions**, assigned to NMA-029/030/032: a documented,
versioned worker-launch transport that can place the whole tool execution
process in a scoped sandbox; a fail-closed final grant/credential dispatch gate
carrying owner/session/admission/tool identity; and a native browser execution
placement seam that moves harness Python together with its filesystem/terminal.
First prove the needed gap in the exact pin. These are proposals, not upstream
acceptance or a reason to fork the entire application.

## Execution map and isolation implications

| Component | Observed execution location at this pin | Consequence |
| --- | --- | --- |
| `browser_exec` model Python | `_find_cli()` returns the current Hermes interpreter and `browser_harness.run`; `Popen` executes it locally with supplied Python on stdin. | A remote CDP browser, terminal Docker setting, or remote browser service does not relocate this Python. |
| Harness daemon | Launched through that interpreter; profile-specific runtime/tmp directories distinguish daemon identity. | Directory/profile names prevent accidental collisions; they are not OS tenant isolation. |
| Chromium/CDP | Local launcher, terminal-hosted Bot Desktop, supplied endpoint or selected cloud provider. | CDP may be sandboxed while Python stays on the gateway/worker host. Its credentials and network access need independent scope. |
| Terminal/files | Selected local, Docker, SSH, cloud or plugin terminal environment. Docker supports resource/security args and labelled reconciliation. | Default persistent `/root` and `/workspace` mounts, explicit extra volumes and automatic cwd mounts require product scope binding. Never mount owner control state or the host Docker socket into model execution. |
| `computer_use` / cua-driver | `sandbox_mcp_invocation()` runs the driver through terminal environment stream placement for Docker/SSH or a suitable in-process plugin; gateway placement uses the local driver. | For a sandbox-backed desktop with missing display/runtime it refuses; it does not silently drive the host instead. |
| Native managed model worker | Admission-owned subprocess receiving profile home, frozen policy and route key. | Process ownership/recovery is useful; same UID/filesystem access still exposes available state and credentials to arbitrary code. |

Sources: [browser interpreter and workspace](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L252-L284),
[browser subprocess](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L577-L596),
[browser dispatch](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L677-L755),
[profile daemon directories](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_harness_dirs.py#L1-L99),
[Docker environment](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/environments/docker.py#L647-L708),
[Docker persistence mounts](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/environments/docker.py#L905-L929),
[desktop placement](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/bot_desktop/placement.py#L1-L86),
[cua sandbox invocation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/computer_use/cua_backend.py#L153-L172).

Native cua transport timeout handling explicitly keeps action outcomes unknown
and avoids replay of effectful tools after transport loss. That behavior should
remain visible in Ngertiin: action outcome, later observation, artifact delivery
and final text are distinct facts. A browser timeout message advising retry
cannot authorize blind repetition of a submitted form.
([cua unknown outcomes](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/computer_use/cua_backend_session.py#L468-L500),
[browser timeout result](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L735-L749).)

### Required product boundary

An owner partition needs an operator-owned control plane. Each authorized
agent/thread execution scope needs a separate model-code workspace with no
other-owner data, private DM/group data, raw control database, signing key,
provisioning registry or unrestricted connector credentials. The gateway owns
admissions and cancellation; an operator supervisor only maintains process and
volume availability. An authenticated broker supplies scoped provider/tool
operations and reconciles identities before effects. The sandbox must not be
able to mint another owner/thread credential or access its control socket.

Running the entire current gateway and browser in one owner container can prove
that host/other-owner mounts are absent. It cannot prove protection from that
gateway's own files or model/connector keys. That stronger requirement is an
open seam, not a property inferred from container UID, profile names or CDP
isolation. NMA-029/031/032 must prove it using canaries, denied cross-scope
operations, cancellation and restart before capability adoption is released.

## Backend comparison: source evidence versus measurements

| Candidate | Supported native behavior and persistence | Isolation and operational work still needed | Startup/latency/cost evidence |
| --- | --- | --- | --- |
| Linux Docker research backend | Native terminal environment, resource flags, persistent volumes, existing-container labels, Bot Desktop stream placement. Can put browser Python in the outer sandbox for a disposable probe. | Requires trusted supervisor, scope-labelled mounts/resources, no model access to Docker control, approved image notices and brokered secrets. The existing terminal backend alone does not move harness Python. | Measure image build, container start, warm tool, restart and task phases in the companion probe. No production capacity or dollar claim. |
| SSH isolated host/VM | Native SSH/scp, ControlMaster reuse, environment/cwd snapshots, file sync and desktop stream transport. | Per-owner/thread OS identity/VM and restricted key; prevent broad `.hermes` sync or shared remote home. Needs remote lifecycle/storage/egress management. | Not live-tested in this spike; no numerical ranking. |
| Modal/Daytona/Vercel terminal sandbox | Native remote terminal implementations; provider-specific persistence/snapshots/configuration. | At this pin automatic desktop placement refuses non-stream backends. Explicit gateway placement would cross the chosen boundary and is unsuitable as an isolation shortcut. Separate browser Python placement remains necessary. | No configured disposable environment in this audit; no measured cost/latency. |
| Terminal/browser provider plugin | Provider interfaces expose remote/container/session-isolation/credential-strip capabilities. `supports_streams` can enable desktop transport for in-process providers. | Actual plugin must implement the contract and its own image/credentials. Host-isolated plugin objects cannot currently supply the stream exec channel for desktop placement. | No selected E2B/native plugin and no measured equivalence. Existing custom E2B action evidence does not prove native-tool compatibility. |
| Cloud CDP/browser-only service | Native browser provider can supply a browser endpoint; useful for configured browser variants. | Isolates the browser, not harness Python/terminal/model worker. Adds service credential/network/privacy/persistence constraints. | No provider account selected by this audit; no numerical ranking. |

Sources: [SSH implementation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/environments/ssh.py#L45-L100),
[terminal provider contract](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/agent/terminal_env_provider.py#L20-L60),
[desktop placement resolution](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/bot_desktop/placement.py#L64-L86).
Rows marked unmeasured must not be counted as failed or successful experiments.

## Dependency and executable provenance

The live [packaging review](evidence/nma-028/packaging-review.json) records
exact metadata/archive URLs, SHA-256 hashes, license members, dependency metadata
and repository HTTP checks. Both wheel and sdist were downloaded and their bytes
verified against the corresponding PyPI digest.

- `browser-harness==0.1.13` declares MIT and includes a 1,068-byte LICENSE in
  both distributions, SHA-256
  `5afa3d97bf1e6f998d587fa101e3fe0d0c416840b7fe77bcd6ae97690a334631`.
  Its declared runtime requirements include exact `fetch-use==0.4.0`.
- `fetch-use==0.4.0` declares MIT in metadata, but neither wheel nor source
  archive includes a license/notice file. Wheel SHA-256:
  `b7885f2907e7920373fa75dcdb00afd6e603a25a9ee2151aa2881f5465e1a2c0`;
  sdist SHA-256:
  `9511987d4907ec6dac501e21d66946d10098f66b5d21bc2aba4189cd81ba189a`.
  The declared GitHub repository API and main/master LICENSE URLs returned 404
  during this review. A metadata classifier is not the missing copyright notice.
- Live PyPI metadata reported these same latest release versions at review time.
  This audit did not select or compatibility-test another version; the latest
  metadata field alone does not evaluate every prerelease or alternate upstream
  revision. Changing the Hermes pin or dropping `fetch-use` requires an explicit
  compatibility and provenance review; installing `browser-harness --no-deps`
  is not closure.
- Hermes `pm/lock.json` separately pins Chromium and cua-driver artifacts per
  platform. A Debian Chromium selected by a disposable image has different
  provenance from the PM artifact: record the actual Debian package version,
  repository/license set and executable hash. Do not claim PM validation for it.
  The headless browser probe does not verify cua-driver or desktop permissions.

Primary metadata: [browser-harness 0.1.13](https://pypi.org/pypi/browser-harness/0.1.13/json),
[fetch-use 0.4.0](https://pypi.org/pypi/fetch-use/0.4.0/json),
[Hermes executable lock](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/pm/lock.json).
No dependency notice was invented, and no production packaging exclusion is
silently waived by this experiment.

## Preservation, mapping and upgrade ownership

Keep existing owner/account UUIDs, persistent agent IDs, DM/group thread IDs,
configuration revisions, context generations, primary-DM mappings and native
admission/session bindings. The current binding key already includes
agent/thread/configuration/context identity; one agent's identity across DM and
group must not imply shared transcript context. NMA-029 owns native history and
session migration, and NMA-039 owns the disposable rehearsal and release manifest.

Before replacing any executor/resource seam, record native session/admission and
external resource/effect identity. Drain/fence the one active executor; snapshot
SQLite, PostgreSQL metadata and relevant workspace/object bytes; reconcile
unknown effects and resource ownership. Preserve old receipts and native tool
lineage read-only. Do not recreate historical goals, re-run old tool batches,
merge DM histories or assign an old native session to a new scope. NMA-031/032
own file/browser resource reconciliation; NMA-034 owns skill/memory preservation;
NMA-035/036 own group/handoff and goal/wake identity migration.

Use additive checksummed schema/config versions; retain old migration checksums.
If a new pin changes policy/schema/result contracts, add its source hashes,
dependency/executable notices, operation-manifest delta and paired failure/restart
evidence before activation. Rollback is an isolated Git revision plus verified
backup, with new state preserved for forward reconciliation. There is one active
executor per scope and no runtime fallback to the custom browser/old engine.
This audit performs no real-account data migration.

## Proposed exclusions: assigned, not accepted

The planning source marks eight additional exclusions as proposals. They stay
open in the contract; assigning a downstream owner satisfies traceability, not
product acceptance or permission to omit the feature.

| ID | Proposed boundary | Owner to resolve or implement |
| --- | --- | --- |
| V08 | Wake-word listener requires a client/device background execution surface. | NMA-037 |
| P03 | Managed local-model downloader differs from connection to an existing self-hosted endpoint. | NMA-030 |
| U10 | Pets and a dedicated language-pack framework are presentation capabilities. | NMA-038 |
| U11 | Desktop multi-gateway picker differs from operator partition management. | NMA-038 |
| O03 | Public Hermes MCP server distribution surface. | NMA-030 |
| O04 | Public compatible agent API distribution surface. | NMA-030 |
| O05 | IDE/ACP distribution surface. | NMA-038 |
| O06 | Raw subscription inference proxy distribution surface. | NMA-030 |

The already explicit exclusions for Nous service coupling, external messaging
channels and Ngertiin CLI/TUI/native clients remain as recorded in Notion.
Useful underlying native operations are still candidates for authenticated web
exposure. The [capability manifest](evidence/nma-028/capability-manifest.json)
must retain every inventory ID and these decision owners.

The frozen planning text for M05/M06 contains a leftover `NMA-029/054`
reference from the earlier work-package numbering. `NMA-054` is not a ticket in
the consolidated NMA-028–039 backlog. The explicit native owner relation is
NMA-031; native session/context integration belongs to NMA-029 and the integrated
web composer to NMA-038. Preserve the original planning snapshot as evidence;
use these effective owners for implementation rather than inventing a new
dependency or silently dropping either capability.

## Acceptance blockers this audit cannot close

1. Exact `fetch-use` copyright/license notice provenance for a distributable
   native browser profile.
2. A proven worker/sandbox/secret-broker seam protecting runtime secrets and
   private DM/group/other-owner state from arbitrary native Python.
3. Live measurements for the required authenticated application/browser and
   failure/restart/cancel cases, including action versus observation and effect
   denominators; fixed Python or deterministic fixtures cannot replace them.
4. Full scoped desktop/cua-driver execution and dependency provenance, which a
   Chromium-only probe does not establish.

These are explicit open gates, not reasons to suppress native capabilities or
count research/code presence as a completed feature.
