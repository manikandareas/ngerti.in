# Scoped native tool execution proof

Date: 2026-10-25. This is the NMA-028 disposable execution-boundary proof, not
deployment of NMA-029/031/032. It supersedes the earlier whole-runtime-container
canary failure for the **selected tool execution seam**. The trusted Hermes
gateway/model process keeps its control database, provider route credentials,
product identity and admission authority. Native model-written browser Python,
terminal commands and file operations execute in a different scoped container.
No second model, admission queue, goal scheduler or recovery owner is introduced.

## Executable seam and exact profile

Implementation: [isolated_tools.py](../../scripts/spikes/nma028/isolated_tools.py),
[build_isolated.py](../../scripts/spikes/nma028/build_isolated.py),
[isolation.Dockerfile](../../scripts/spikes/nma028/isolation.Dockerfile) and
[real boundary tests](../../scripts/spikes/nma028/test_isolated_tools.py).

The clean image is `ngertiin-nma028-isolated:local`, tested as immutable image
`sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd`.
It imports unchanged Hermes source at
`7489b22af47ce91b366dde81d5831ea422577498`, with exact source/lock hash checks and
the normal PM dependency resolver/install/check. The explicit local-CDP profile
uses browser-harness `0.1.13+ngertiin.localcdp.1`: only distribution metadata is
adapted, native modules/resources and the exact MIT notice remain byte-identical.
The unused remote Fetch provider is an unselected extra and `fetch-use` is absent.
See the separate packaging resolution and `isolation-image.json`; this is not
an installation that ignores dependency validation.

The supported proof configuration is Linux Docker, native local terminal/files
inside the tool container, Chromium 156.0.8078.47 and native browser Python over
that container's loopback CDP. `--no-sandbox` applies to Chromium inside the outer
container boundary; it is not a claim of Chromium's inner sandbox. Model/provider
inference happens outside this image. The image has no inference keys or model
client connection to a trusted gateway.

## Binding, storage and dispatch

The trusted caller creates an immutable `Scope(owner_id, agent_id, thread_id,
generation)`. Canonical UUIDs and a positive generation form the resource key.
The supervisor is bound to one owner and refuses a different owner or a
controller directory previously registered to another owner. Tool arguments
cannot choose task/session scope. Native `browser_exec.session` remains the
unchanged native browser-session parameter within that already isolated scope.
Product grant/context checks still run at the parent dispatcher; the parent must
derive `Scope` from authenticated server-owned bindings, not a browser request.

Each scope gets one labelled container and one labelled Docker volume. The
supervisor journal and OS execution lock live in its private control directory,
which is never mounted in any tool container. A controller-owned POSIX lock
serializes native batches for that scope across threads and supervisor instances.
The tool worker receives neither the Docker socket nor a host filesystem mount.
Different agent/thread/generation scopes never share the workspace volume, even
when their persistent product agent identity is the same.

The trusted volume initializer is a separate, fixed-code helper with only CHOWN
and FOWNER capabilities, one scope volume and no network. It normalizes the
workspace owner/mode before model execution. The actual model-code container
runs as UID 10001, drops all capabilities, has `no-new-privileges`, private PID
and network namespaces, a read-only root, private temporary home and bounded
memory/CPU/process/shared-memory resources. This corpus uses `--network none`;
external web egress and connector-specific routes need separately verified
configurations in the capability tickets.

The scoped container has a persistent native registry dispatcher reached through
a private Unix socket. A `docker exec` client only transports one JSON request;
it does not recreate the native interpreter for each call. The registry receives
the original native schema/arguments and returns the native result unchanged.
No identity/model/control secret is sent to the worker. The supervisor's Docker
handle is trusted operator infrastructure, not a model-visible tool.

This persistence requirement was measured, not assumed: the first implementation
started a native interpreter per tool call. Native browser-session atexit
cleanup stopped the harness between calls, so navigation worked but the next
form call lost the page. The persistent tool worker preserves the upstream
browser/terminal lifecycle. Source: [native interpreter subprocess](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L577-L598),
[atexit registration](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_session.py#L377-L388),
[harness/session cleanup](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_session_lifecycle.py#L210-L247).

## Effects, stop, restart and preservation

The supervisor commits scope/resource identity before allocation and commits
operation identity, tool name and argument hash before dispatch. An exact retry
returns the saved native receipt; changed-body reuse conflicts. A saved receipt
has status `returned`, not `confirmed`: returning a tool response alone does not
prove external task success. DOM/server/file oracles prove action outcomes
separately.

A transport loss or a native browser error whose action outcome is uncertain
persists `indeterminate`, fences the scope and removes only its tool container.
The volume and journal remain available for trusted reconciliation. Neither an
exact replay nor a new operation ID can blindly rerun that batch. Cancellation
does not wait for the per-scope execution lock: it fences the scope, records any
active operation as unknown and force-stops only that container. A later result
cannot erase the cancellation fence or settle the unknown effect as confirmed.

`pause`/`retire` can stop an idle tool process while retaining its exact workspace
and receipts. `ensure` restarts the same resource identity. States distinguish
never-readied allocation from ready/paused/recovery-required state. Missing
previously readied storage is quarantined rather than replaced with an empty
volume. Read-only observation/export also checks existing volume identity before
mounting, so Docker cannot implicitly recreate a missing volume. Product history,
goals, skills and receipts outside the scope are never migrated by this proof.

Trusted `inspect` and bounded `file_bytes` use fixed code in a read-only scope
volume helper. They can inspect a cancelled/uncertain workspace without restarting
model execution, export actual file bytes for an authenticated artifact publisher,
and refuse foreign owner, path traversal and symlink escape. They are operator
methods, not additional model tools. Final cleanup deletes only the disposable
scope resources created by this proof; production resource reconciliation remains
an explicit later migration step.

## Real verification

The final corpus contains eight real Docker/native cases, with no skipped cases:

| Case | Measured oracle |
| --- | --- |
| Secret and cross-scope boundary | Browser Python in thread B reports no supervisor control file, control/provider environment canary, model key, Docker socket or thread A private file; UID is 10001. Foreign-owner scope, model-supplied task scope and traversal are refused. |
| Native form and browser download, repeats 1–3 | Navigate/follow link, fill and submit in a later native call, observe `NMA028_SAVED` in a separate call, use CDP Browser.setDownloadBehavior and click an attachment link, verify actual downloaded bytes through native terminal/read_file and trusted export. Exactly one synthetic POST per repeat. |
| Receipt and supervisor restart | Repeated operation ID before/after a new supervisor instance produces one byte of external file effect and the original receipt. Changed-body reuse is refused. |
| Pause/storage recovery | Stop/restart retains container/volume IDs and file bytes. Injected missing ready volume becomes recovery_required; neither ensure nor readonly observation/export creates an empty replacement. |
| Active cancellation | Observe a terminal barrier, cancel before delayed write, verify no delayed file, retain unknown receipt and refuse both old and new dispatches. |
| Lost acknowledgement after form submit | Execute a real form POST then lose the response transport. The durable fixture shows one POST; receipt is indeterminate and exact/new-ID replay cannot produce a second POST. |

The browser download is performed by Chromium, not urllib. The attachment
contains `name,total\nsynthetic,42\n`, SHA-256
`b611b0fafb38f99c14d214548fe8f89e1a7839670c66bb72e2824c9eb181dfb4`.
The fixture server ledger and exported file hashes are independent of model prose.
These are actual native tools driven by fixed Python; real-model/application
pairing is recorded separately by the main NMA-028 closure harness.

Evidence is in `docs/research/evidence/nma-028-closure/isolation-tests.json`,
`isolation-image.json` and `isolation-prior-attempts.json`. Prior failures are
retained: bare wheel paths rejected by PM's requirement parser, volume-init
capability/ownership mistakes, and the fresh-interpreter browser lifecycle loss.
They were engineering harness failures, not silently omitted product passes.

Reproduction, from the repository root:

```bash
docker build -f scripts/spikes/nma028/isolation.Dockerfile -t ngertiin-nma028-isolated:local .
NMA028_ISOLATION_TEST=1 NMA028_ISOLATION_OUTPUT=/tmp/nma028-isolation.json \
  .dev/nma-006-closure/runtime/bin/python -m pytest scripts/spikes/nma028/test_isolated_tools.py -q -s
```

## Native computer-use placement and remaining adoption work

At the exact pin, native cua-driver follows the selected Bot Desktop/terminal
placement. A terminal-backed display launches the driver inside that environment;
if its display/backend is absent it refuses rather than falling back to a host
desktop. For a native local backend inside this chosen tool container, local
placement means the tool container, not the trusted gateway host. The container
has no host display socket or external network. Source: [sandbox driver invocation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/computer_use/cua_backend.py#L153-L175).

This headless browser/terminal proof does not install a desktop/cua-driver or
claim native application control acceptance. A real Docker-only native
`computer_use(action=list_apps)` probe returned an explicit backend-unavailable
error: cua-driver is not installed and lazy installs are disabled. It confirmed
UID 10001, no DISPLAY/host X11 socket/Docker socket, native placement `gateway`
with local terminal **inside the tool container**, and no sandbox-driver override.
No desktop was controlled and no package install requested. The exact native
source hashes, raw error and variant classification are retained in
`isolation-cua-placement.json`; this is an unavailable variant observation, not a
computer-use capability pass. NMA-032 owns the versioned desktop
image, exact executable notices, live native application operations and takeover.
That remains an included capability with an implementation owner, not a silent
exclusion. The isolated tool seam is the selected placement for that later variant.

NMA-029 owns binding this transport to the sole native admission/cancel/recovery
authority and preserving complete session/tool lineage. NMA-030 owns native grants,
provider/connector credential-broker operations and final-dispatch revocation.
NMA-031 owns general workspace, background process and binary artifact lifetime.
NMA-032 owns native browser/computer contracts, vault, takeover and reconciliation
of existing custom-browser resources. No old browser fallback is selected. Every
replacement must snapshot/reconcile old resource/effect identity and retain
historical state; rollback stays isolated Git plus verified backups.

The canaries establish the boundary in this defined corpus. They are not a
universal container-escape guarantee, production capacity test or release decision.
The concrete seam and supported backend are now executable and measured rather
than inferred from profile names or remote CDP alone.
