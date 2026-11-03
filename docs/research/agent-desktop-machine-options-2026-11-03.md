# One persistent shared computer for Ngertiin

Research date: 2026-11-03. Revised for the user's clarification: **one long-lived machine per Ngertiin installation/workspace, shared by every agent**. The recommendation below supersedes the earlier assumption of a private machine per agent. This is research and a proposed integration; no application code, runtime, deployment, account, or Notion status was changed.

## Recommendation

Use **one persistent Linux desktop with a desktop driver and a viewer**, managed as a workspace resource. A conventional Debian/Ubuntu VM with a retained system disk is the clearest initial machine model. **LinuxServer Webtop/Selkies plus persistent storage and the MIT Cua Driver** is a concrete container-based alternative to evaluate. Keep terminal/file access on that same computer, and connect browser automation to the browser running there.

For the control service, **Cua SDK + `cua-spacesd` attached to that existing machine** is the most integrated reuse candidate found here: shell, files, desktop and media already share one service. Evaluate it first if its FSL-licensed service/viewer components are acceptable. If the whole selected control stack must use permissive open-source components, prefer **OpenSandbox for execution/files plus the MIT Cua Driver for GUI**, or the lean Driver-only composition. These choices concern which existing service to reuse, not a requirement to build an OS driver or general provider framework. [Attach an existing machine](https://cua.ai/docs/cua-sdk/guides/spacesd), [component licensing](https://github.com/trycua/cua/blob/main/legal/LICENSING.md).

**E2B Embed remains capable, but is no longer the default recommendation for this clarified requirement.** Its strongest benefits are programmable microVM creation, templates, pause/checkpoint/restore, forks and machine isolation. A single continuously used shared computer does not inherently need a sandbox fleet or frequent provisioning. E2B adds an expiry policy and several infrastructure services that must be operated. Prefer it if whole-machine RAM snapshots, reset/clone workflows or a future sandbox platform are intentional requirements.

**OpenSandbox is the better intermediate candidate when a standardized machine API is desired.** Its current TypeScript SDK explicitly supports a non-expiring sandbox, and Docker mode supplies commands/files without requiring E2B's Firecracker stack. It still needs a desktop driver/viewer integration and a deliberate persistence layout. This ranking is an engineering fit judgment, not measured proof of lower cost, better reliability or easier installation. [OpenSandbox SDK](https://github.com/opensandbox-group/OpenSandbox/blob/main/sdks/sandbox/javascript/README.md), [E2B Compose](https://github.com/e2b-dev/runtime/blob/main/embed/compose/compose.yaml).

## Corrected requirement and concurrency

All agents use the same installed applications, browser profile/logins and files. Agent identity, private conversation context and native harness sessions remain separate, even though the computer is shared. The computer can remain running while agents or browser tabs are idle; closing the Ngertiin tab does not destroy it.

| Resource | Proposed concurrency rule | Why |
| --- | --- | --- |
| Terminal | Multiple processes and named terminal sessions in parallel | Separate processes do not inherently require exclusive desktop focus |
| Browser DOM/CDP | Parallel actions on assigned tabs/targets, when the controller is focus-independent | Stable target IDs avoid global active-tab races; shared cookies/profile still need coordination |
| Files | Shared reads; coordinate conflicting writes and replacements | One shared directory is intentional; concurrent edits can still overwrite each other |
| Desktop mouse/keyboard | One controller owns an interaction lease at a time | Global focus, cursor, dialogs and clipboard are shared across the desktop |
| Human takeover | Human temporarily owns that same desktop lease | The agent should resume from fresh state after handback |
| Shutdown/pause/restore | Workspace-wide operation, coordinated against all active work | Every agent depends on the same computer |

This is the intended Ngertiin policy, not a claim that an upstream tool already enforces it. A driver serializing individual actions is insufficient to own a multi-step interaction such as focusing a dialog, typing, and confirming. Browser actions that actually use global keyboard/mouse input must join the desktop lease instead of being assumed parallel. Shell commands that drive the screen must obey it too.

Cua documents per-call window/desktop targets, focus-independent browser CDP operations, and shared desktop/input state. Its harness remains responsible for planning; the Driver is the observation/action layer. [Driver architecture](https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works).

## Current local boundary

The parent audit inspected [the browser image](../../infra/browser/Dockerfile): Chromium, Xvfb and x11vnc are installed, without a full desktop or computer-action driver. [The current browser API notes](../architecture/browser-session-api.md) describe direct browser-use MCP, profile-only persistence, no workspace mount and a view-only VNC surface. The existing Notion scope explicitly defers general computer use. The user's correction is the basis for this proposed amendment. [Product scope](https://app.notion.com/p/402abdd61873816e871ae24804345b56), [active architecture](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f).

Browser-use can remain an efficient browser tool **inside the shared computer**. Adding a desktop viewer while the agent's terminal/files still resolve to an unrelated host would leave an incomplete machine model. The model/harness process may remain elsewhere; relevant tools must explicitly dispatch to the workspace computer.

## Shortlist under the shared-machine requirement

| Option | What it contributes | Persistence/lifetime | Main decision |
| --- | --- | --- | --- |
| **Persistent Linux VM + driver + viewer** | Complete shared OS; native applications, shell, filesystem and browser | Retain system disk and home; ordinary restart keeps disk, not live RAM | Preferred simple architecture when one long-lived machine is the product |
| **Webtop/Selkies + MIT Cua Driver** | Packaged full Linux desktop and viewer, plus agent desktop controls | Persist home/workspace; define how applications survive image recreation | Concrete container composition to evaluate; integration still belongs to Ngertiin |
| **OpenSandbox Docker + desktop/driver** | Standard lifecycle, commands/files/SDK/MCP around desktop image | `timeoutSeconds: null` supports manual cleanup; mounts/metadata must persist | Best API-platform alternative if a common sandbox protocol is useful |
| **E2B Embed + Desktop** | Firecracker machine, command/file/desktop SDK, snapshots and restore | Retain one sandbox binding; configure expiry and pause; independent volumes in Embed are not established | Strong when snapshots/reset/fork/isolation justify the extra stack |
| **Cua SDK + attached `cua-spacesd`** | Existing unified shell/file/desktop/media service, typed clients and MCP | Attach to an existing persistent machine without creating or deleting it | Most integrated reuse candidate if FSL service/viewer components are acceptable |

A desktop container and a VM are different isolation choices. A container shares the host kernel; a VM has its own guest kernel. Shared-machine semantics do not require either one specifically. Choose the deployment boundary separately from the decision that agents share one computer.

## Reuse versus Ngertiin-owned integration

**Ngertiin does not need to implement computer-use primitives.** Cua already provides TypeScript/Python/Rust clients and protobuf contracts for shell/processes, files, screenshots, windows and desktop actions; the own-harness API invokes no model. The existing Codex/Muse harness can retain its inner loop. [Own-harness guide](https://cua.ai/docs/cua-sdk/guides/own-harness).

`cua-spacesd` can run on a container, an existing LAN machine or a machine reached through a relay. Its typed TypeScript client connects by address/token, without provisioning the host; an attachment record can be forgotten without deleting the machine. It also serves an integrated viewer. This supports local deployment now and attaching an existing remote computer later through the same native protocol. The service and integrated viewer are FSL-1.1-MIT; SDK and Cua Driver remain MIT. [Attachment/service guide](https://cua.ai/docs/cua-sdk/guides/spacesd), [licensing](https://github.com/trycua/cua/blob/main/legal/LICENSING.md).

The existing Cua MCP server exposes computer/file/shell operations with permission groups and a target sandbox; daemon mode explicitly supports several agents sharing the same resources. Reuse those native tools and typed responses. The broader platform also exposes machine creation/deletion tools, so the Ngertiin integration should expose only operations appropriate for its shared retained machine. [MCP guide](https://cua.ai/docs/cua-cli/guides/mcp-server).

Cua's protocol already supplies detached/reattachable PTY processes, replayable output, atomic file writes, and command records queried by request ID after interruption. Reuse these records rather than creating a parallel command-execution system. Ngertiin still associates upstream IDs/results with its own run/event records and reconciles outcomes before retry. Atomic writes alone do not resolve two agents editing the same file, and a command record does not prove an external application's effect. [Process/file protocol](https://cua.ai/docs/cua-sdk/reference/protocol/env-process).

For strict permissive-source adoption, OpenSandbox already supplies commands/files/lifecycle, and MIT Cua Driver supplies GUI control. Driver-only is a UI layer, not a replacement shell/file service. This split needs more integration than `cua-spacesd`, but does not require inventing either service. [OpenSandbox SDK](https://github.com/opensandbox-group/OpenSandbox/blob/main/sdks/sandbox/javascript/README.md), [Driver architecture](https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works).

Keep Ngertiin's added layer small: resolve the workspace's machine and agent/run identity, validate current grants, coordinate multi-step desktop ownership/human takeover, and publish/recover receipts. Connect those responsibilities to one chosen service's native API first. Do not add a generic provider factory or duplicate desktop/process protocols before a second actual integration needs a common seam. Availability of upstream tools is source evidence; both harnesses, local and remote attachment, and concurrent ownership still require integration proof.

## Persistent Linux desktop and Webtop/Selkies

Webtop packages a full Linux desktop accessible in the browser. Its source includes Dockerfiles and is GPL-3.0; the underlying Selkies project is MPL-2.0. Images are published for amd64 and arm64. Webtop's `/config` mount is the desktop user's home, providing a natural location for profile/settings persistence, while a separate shared workspace mount can serve product files. These are useful building blocks, rather than a full agent lifecycle/tool API. [Webtop documentation](https://docs.linuxserver.io/images/docker-webtop/), [Webtop source](https://github.com/linuxserver/docker-webtop), [Selkies source](https://github.com/selkies-project/selkies).

Persistence must cover **applications as well as home files**. Persisting `/config` does not retain arbitrary OS packages written into a container's root layer when that container is recreated. LinuxServer documents persistent proot applications and startup installation via Docker Mods; a reproducible custom image is another option. If the intended experience is unrestricted installation that remains part of the computer, a VM's retained root disk is easier to model. [Application installation](https://docs.linuxserver.io/selkies/user-guide/installing-apps/), [Docker volume lifecycle](https://docs.docker.com/engine/storage/volumes/).

Cua Driver can supply desktop observation/actions through MCP/CLI/SDK while the existing Codex/Muse harness owns the loop. The documented Linux quickstart targets **x86_64, X11 or XWayland, and AT-SPI 2**. Webtop ARM image availability does not establish ARM Driver compatibility. A selected Webtop image, its accessibility bus, its display, and the Driver must be proven together. On a conventional Linux VM, install the driver inside the desktop session being controlled. [Driver quickstart](https://cua.ai/docs/cua-driver/quickstart), [Driver model](https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works).

Only the MIT Driver is needed for this composition. Cua's SDK/CLI/Driver/Lume are MIT, while current Spaces, `cua-spacesd`, viewers and several related components are FSL-1.1-MIT. Do not label the complete modern Cua stack MIT, or accidentally introduce Spaces dependencies while describing a Driver-only deployment. [Component licensing](https://github.com/trycua/cua/blob/main/legal/LICENSING.md).

LinuxServer also documents **Pelorus**, with external-agent REST primitives for desktop state, windows, controls and screenshots, separate from its built-in autonomous run loop. This is an exploratory alternative driver, not an additional mandatory layer. Inspection found no root LICENSE or package license declaration in its current repository, and its API notes characterize non-run endpoints as utility/debug helpers. Licensing and API stability therefore remain unresolved; do not describe the whole Pelorus composition as verified open source merely because Webtop is GPL. [Pelorus docs](https://docs.linuxserver.io/selkies/components/pelorus/), [source](https://github.com/linuxserver/pelorus).

## OpenSandbox

OpenSandbox is Apache-2.0 and includes its self-hosted server, SDKs, Docker/Kubernetes integrations and an XFCE/VNC desktop example. The TypeScript SDK offers lifecycle, commands/files and terminal-related primitives. The desktop example installs XFCE, Xvfb, x11vnc and noVNC; it still needs an agent desktop-action layer rather than merely a viewer. [Repository](https://github.com/opensandbox-group/OpenSandbox), [desktop example](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/examples/desktop.md).

For one long-lived machine, a significant fit advantage is explicit **manual-cleanup mode**: the current JavaScript SDK documents `Sandbox.create({timeoutSeconds: null, ...})`, with `expiresAt: null`. Omitted timeout instead defaults to ten minutes. The server's optional `max_sandbox_timeout_seconds` caps the creation timeout, not total lifetime or later expiration renewal. This directly supports keeping one shared sandbox instead of recreating one per agent/run. [TypeScript lifetime behavior](https://github.com/opensandbox-group/OpenSandbox/blob/main/sdks/sandbox/javascript/README.md), [server configuration](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/configuration.md).

Keep a single workspace-to-sandbox binding, persist server metadata and the intended home/workspace data, and reconnect on backend restart. Docker pause freezes the current container and does not by itself provide a reboot-surviving memory checkpoint. Kubernetes rootfs snapshot mode recreates processes from disk; the opt-in QEMU path can retain guest memory. Those extra modes are optional for a shared always-on computer. [Pause/resume guide](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/guides/pause-resume.md), [runtime architecture](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/index.md).

If Ngertiin only needs one local desktop, an additional lifecycle server may add little beyond its existing resource authority. Choose OpenSandbox when its standardized execution API, supported storage/runtime choices or future orchestration are concrete benefits. That is a design judgment; no installation comparison was run.

## E2B Embed with Desktop: still suitable, with a different reason to choose it

E2B Runtime and Desktop are Apache-2.0. Embed packages the control plane and Firecracker runtime onto one operator-owned Linux host, without an E2B account/license key. Desktop adds a TypeScript/Python API for GUI actions, windows, files, commands and an interactive authenticated stream. All agents could connect to **one retained sandbox ID**, so E2B does not force a machine per agent. [Embed](https://github.com/e2b-dev/runtime/blob/main/embed/README.md), [Desktop](https://github.com/e2b-dev/desktop).

### Lifetime is deployment policy, not a Cloud-plan assumption

The inspected runtime API is still expiry-based. Its source fallback is 15 seconds on legacy create and five minutes on v2 create when no timeout is supplied; SDKs may explicitly supply a different timeout. `AutoPauseDefault` is false. The expiry worker kills an expired sandbox unless auto-pause is enabled and applicable. A shared machine must therefore explicitly set and verify lifecycle policy. [State defaults](https://github.com/e2b-dev/runtime/blob/main/packages/api/internal/sandbox/sandboxtypes/states.go), [expiry handling](https://github.com/e2b-dev/runtime/blob/main/packages/api/internal/orchestrator/evictor/evict.go).

Create validation uses the team's `MaxLengthHours`; keep-alive is capped by the machine execution's start time plus `MaxInstanceLength`. Authentication reads local `project_limits` or `default_limits` database rows. This is operator-controlled self-hosted state, so **Cloud Hobby/Pro maximum runtimes must not be applied to Embed by assumption**. Conversely, self-hosting does not make the current API a timeout-free VM automatically. No documented one-switch perpetual lifetime was established here; inspect the chosen image versions and actual local limits, then test the intended long-running/renewal or coordinated pause/resume policy. Zero is not established as an unlimited sentinel. [Timeout validation](https://github.com/e2b-dev/runtime/blob/main/packages/api/internal/handlers/timeout_helper.go), [keep-alive cap](https://github.com/e2b-dev/runtime/blob/main/packages/api/internal/orchestrator/keep_alive.go), [local limit lookup](https://github.com/e2b-dev/runtime/blob/main/packages/db/pkg/auth/sql_queries/teams/get_team.sql).

### Durable state and deletion are different

A normal memory pause preserves guest filesystem and RAM; resuming the same sandbox can recover installed software, home and processes. Killing it is a terminal operation. A retained sandbox snapshot is not the same abstraction as an independently backed-up shared disk, and restoring one shared computer affects every connected agent. Network/tool/viewer clients must reconnect and pending external outcomes must be reconciled. [Persistence contract](https://docs.e2b.dev/sandbox/persistence).

There is a material documentation discrepancy: the Embed hub says every feature is included and the general Runtime README describes persistent volumes, but the official **2026-09-30 Embed announcement explicitly excludes volumes, secrets, workload identity and bring-your-own proxy**. The shipped Compose sets `VOLUME_TOKEN_ENABLED=false` and does not include the volume-content service described in the general Runtime architecture. Therefore this research does **not** establish an independent persistent-volume API in stock Embed. Do not promise files survive killing the shared sandbox through that feature; select and prove a snapshot/export/backup design instead. [Embed announcement](https://e2b.dev/resources/introducing-e2b-embed), [Compose source](https://github.com/e2b-dev/runtime/blob/main/embed/compose/compose.yaml), [general architecture](https://github.com/e2b-dev/runtime/blob/main/docs/ARCHITECTURE.md).

### Operating weight and platform fit

The Compose stack includes PostgreSQL, Redis, ClickHouse, the API, orchestrator, client proxy, dashboard services and setup/build jobs. One install command does not turn those into one lightweight desktop process. The guide recommends 12 GiB RAM and 20 GiB disk and requires Linux KVM and suitable devices/kernel support. These are baseline stack requirements, not measured Ngertiin desktop sizing. [Compose guide](https://github.com/e2b-dev/runtime/blob/main/embed/compose/README.md).

The runtime supports ARM, but the official Desktop template configures Chrome/VS Code apt repositories with `arch=amd64`. Initial unchanged-template validation should target Linux x86_64; ARM requires its own desktop template proof. Running Embed on a Mac adds a nested-virtualization-capable Linux VM, documented as M3+ with macOS 15+. [Desktop template](https://github.com/e2b-dev/desktop/blob/main/template/template.py), [host requirements](https://github.com/e2b-dev/runtime/blob/main/embed/compose/README.md).

Choose E2B if retaining/restoring whole RAM state, API-driven reset/fork/template workflows and the microVM boundary justify these lifecycle/operations choices. For one long-lived shared desktop with durable disk and parallel tools, these are optional advantages rather than prerequisites.

## Lower-priority alternatives

**AIO Sandbox** offers real desktop APIs and can be injected into an existing environment, but its current public repository did not establish complete rebuildable source for the new daemon/desktop worker/image. Its lifecycle and isolation explicitly belong to the host platform. **AgentDesk/agentd** are MIT and conceptually suitable, but inspected default branches date to July/May 2025. **Daytona** has desktop/VNC APIs, but its current production core is closed source and the old public implementation is archived/unmaintained. None improves the default shared-machine choice on the evidence gathered. [AIO scope](https://sandbox.agent-infra.com/daemon/start/introduction), [AIO repository](https://github.com/agent-infra/sandbox), [AgentDesk](https://github.com/agentsea/agentdesk), [agentd](https://github.com/agentsea/agentd), [Daytona announcement](https://www.daytona.io/dotfiles/updates/daytona-is-going-closed-source).

## Proposed Ngertiin integration

Retain one stable `workspace → machine` binding. Every agent tool call carries its own agent/run identity and resolves that binding server-side; it does not provision a separate computer. Reconnect to the existing machine after backend restart. Keep private transcripts, goals and harness identities in Ngertiin even though machine state is intentionally shared.

Use the selected service's native process/PTY, file, browser-target and desktop interfaces and its compatible viewer for the same display. Ngertiin's thin integration owns tab assignments, conflicting file-write coordination, desktop interaction leases and human takeover. Parallel focus-independent browser tabs and shell sessions remain available while another agent owns a GUI interaction, except when they would mutate the leased application's state.

Use the existing scoped product-tool/MCP boundary and existing Codex/Muse model loop. Composio connections remain their own integration path. Host-side administration is explicit; the product's normal shell/browser/file tools operate inside the shared machine. The same filesystem paths should resolve from the terminal, GUI file manager, browser downloads/uploads and Ngertiin Files surface.

Define persistence separately for system-installed software, user home, browser profile, shared workspace, live processes and provider metadata. Prefer keeping the machine running initially; add automatic suspend only when workspace-wide activity can be assessed, including long-running shell jobs and every agent. A stopped agent run releases its own resources/leases without shutting down the shared computer or other agents' work.

## Proof required before selection

1. Two agents run separate shell jobs concurrently, use different browser tabs through focus-independent automation, and exchange one real file visible from the GUI, browser upload/download, terminal and Files surface.
2. Two agents contend for the desktop. One completes a multi-step interaction while the other waits; human takeover, cancellation, lease expiry and handback preserve coherent input ownership.
3. Install an actual desktop application, save its settings and retain a browser login. Restart Ngertiin, then restart the machine; prove software, home/profile and files survive. Test container image recreation separately from container restart.
4. Prove same-machine recovery after interruption: retained machine ID/disk, all agents reconnect, stale tabs/PTY handles are revalidated, and uncertain external actions are reconciled before retry.
5. For E2B, test expiry, configured max lifetime, keep-alive and auto-pause using the exact Embed images. Distinguish memory restore, filesystem-only restore, snapshot retention, explicit kill and independent backup. Do not substitute Cloud documentation limits for local measurements.
6. Measure idle/active footprint and practical parallelism on the intended host. Verify x86/ARM, display/accessibility integration and viewer/input interoperability on that exact image.

No checklist item above has been run in this research. These are acceptance targets for the clarified requirement, not reasons to delay a research recommendation.

## Evidence limits and provenance

Sources are official documentation, source repositories, LICENSE files and GitHub metadata read on 2026-11-03. Firecrawl search returned HTTP 402 during initial discovery, so reading continued through the web tool and official HTTP sources. No candidate was installed, benchmarked, connected to a Ngertiin harness or security-audited. The preferred VM/Webtop/Driver assembly is a composed integration proposal, not an upstream turnkey Ngertiin service.

Relevant source heads initially inspected were E2B Runtime `4ae0c6ddccf6c84c4664ce8440e407d415d96408`, E2B Desktop `91f23acaab7312e847596acc44e6f7763f56917f`, OpenSandbox `ebba8497a256b673733e89b821f8edce19625207` and Cua `4715a723a450610cdf77f688776c1fdd40660149`. Links using `main` can change, and an actual trial must record the exact deployed versions rather than equating current source with pinned release images.
