# Hermes feature inventory for Ngertiin comparison

> Source retirement (2026-11-05): references to `apps/web` and the Electron host under `apps/desktop/src` are historical paths available at Git revision `6de957e7145c0367a52b10f5fd19bbd91c50e458`. The active application uses Tauri and `apps/web-client`.

Date: 2026-10-24. Research baseline: Hermes Agent source revision `7489b22af47ce91b366dde81d5831ea422577498`, available in `.dev/nma-001/source`. This inventory describes upstream capabilities, not a statement that Ngertiin exposes them. No application code or runtime configuration was changed.

## Scope and evidence

The inventory covers documented product feature families, built-in toolsets, client surfaces, platform adapters, extension systems and operator workflows. It groups provider/channel variants where they share an integration boundary. It does not count every slash command, configuration knob or third-party plugin as a separate product feature. The open plugin/MCP/skill ecosystem has no permanently complete finite list.

Primary evidence is the pinned upstream documentation and source tree. Links below are immutable source permalinks at the pinned revision. Feature availability can be native, opt-in, client-specific, credential/dependency-gated or supplied by an external plugin. A document existing in the tree establishes a described upstream surface; it is not Ngertiin E2E evidence. No live provider, sandbox, channel, plugin or user interface was exercised in this research.

Current upstream README, feature overview, tools reference, plugin guide and messaging overview were fetched from official GitHub sources on 2026-10-24. The live `main` pages can differ from the pinned checkout (including different browser-tool shapes), and some responses carry crawl-cache dates. Accordingly this report does not claim every current-main change is in Ngertiin's pin, nor that cached public docs establish the exact newest commit. The pin is the precise comparison baseline.

An additional direct GitHub API check captured `main` at [`bda3a363e9695e3f63fce4a7ca85ba17b5fecb61`](https://github.com/NousResearch/hermes-agent/commit/bda3a363e9695e3f63fce4a7ca85ba17b5fecb61), committed 2026-10-24T07:04:49Z. The non-truncated recursive tree has the same 56 feature Markdown paths as the pin, with no additions/removals. Git-blob comparison found only `kanban.md` and `mcp.md` modified. Both current files were fetched and diffed: changes clarify dashboard card extension slots, MCP HTTP/SSE payload limits, spend-limit prompts and elicitation answers; they add no new feature family to this inventory. This establishes documented feature-family coverage for that captured snapshot, not complete implementation parity between two commits or future `main` updates. The latest behavior clarifications are not assumed present in Ngertiin's older pin.

Direct revision-qualified downloads also confirmed byte equality between that captured `main` snapshot and the pin for `toolsets.py`, `README.md`, the tools and toolsets references, both skill catalogs, and the messaging index. These direct checks resolve the public-page cache ambiguity for the feature taxonomy used here.

Stable row IDs support a separate Ngertiin status mapping. A native mechanism inherited through the runtime must not be called absent solely because Ngertiin has no UI setting. Conversely, source being present must not be counted as usable when the adapter cannot grant its tools.

## Upstream feature families

### Memory, learning, and context

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| M01 | Agent-managed long-term memory | Add, patch, and remove bounded MEMORY.md/USER.md knowledge between sessions. | Native memory tools; profile-scoped. | [memory] |
| M02 | Search and browse previous conversations | Full-text retrieval, time filters, session browsing and message scrolling from persisted transcripts. | Native session_search tool. | [sessions] |
| M03 | Learning Journey | Inspect how remembered knowledge and learning accumulate through /journey. | User-facing memory/history surface. | [memory] |
| M04 | External memory and deep user modeling | RetainDB/ByteRover plus catalog providers such as Honcho, Hindsight, Supermemory, Mem0, OpenViking, Holographic. | Provider plugin and service configuration; not every provider bundled. | [memory-providers] |
| M05 | Project instruction discovery | Load project instruction files and discover deeper directory-specific instructions during work. | Native context behavior; can be disabled or overridden by host policy. | [context-files] |
| M06 | Inline context references | Expand file, folder, git-diff and URL references into conversation context. | Client/composer feature. | [context-references] |
| M07 | Automatic and manual context compression | Prune old results, summarize history, preserve recent context, and support configurable/manual compression. | Native engine behavior; exact mode depends on route/config. | [compression] |
| M08 | Micro-compaction and context-engine plugins | Incremental rolling compaction and replaceable context management strategies. | Micro-compaction opt-in; alternate context engines are plugins. | [micro-compaction] |

### Skills and reusable workflows

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| S01 | On-demand skill discovery and loading | List skills, load SKILL.md, and open linked references/templates/scripts with progressive disclosure. | Native skills toolset. | [skills] |
| S02 | Autonomous skill creation and improvement | Create, update, patch and delete reusable skills after solving tasks. | Native skill_manage plus configured self-improvement nudges. | [skills] |
| S03 | Learn from sources | Use /learn to build a reusable skill from material provided by the user. | Client command plus native skill system. | [skills] |
| S04 | Skills Hub installation and updates | Discover and install official/third-party skills, update/reset bundled content, and preserve local edits. | CLI/Desktop/catalog workflow; install trust checks apply. | [skills] |
| S05 | External and project-local skill directories | Load skills from extra directories, project-local sources and bundles; choose a skill creation directory. | Native configured filesystem integration. | [skills] |
| S06 | Curator maintenance | Track usage, identify stale skills, consolidate/review, archive and restore agent-created skills with an audit ledger. | Configured background maintenance; archive is recoverable. | [curator] |
| S07 | Bundled domain skills | Shipped workflows for development, Office documents, research, Apple apps, email, media and other tasks. | 58 SKILL.md files in this pinned checkout; each workflow may need additional software. | [skills-catalog] |
| S08 | Optional domain skills | Install extra workflows covering ML/data, finance, security, payments, commerce, creative work and more. | 152 SKILL.md files in optional-skills; not activated by default. | [optional-skills] |
| S09 | Office and PDF document creation | Author and edit DOCX, XLSX, PowerPoint and PDF deliverables through bundled document workflows and their libraries/scripts. | Skill-driven document generation; separate from extracting uploaded document text. | [office-docx], [office-xlsx], [office-powerpoint], [office-pdf] |

### Web, browser, and computer interaction

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| W01 | Dedicated web search | Search ranked web results through selectable providers rather than driving a browser for every lookup. | Native web/search toolsets; provider credentials may be required. | [web-search] |
| W02 | URL extraction and long-page reading | Extract readable page content, handle long pages, and cache results. | Native web_extract. | [web-search] |
| W03 | Public X search | Read-only public X discovery using xAI search. | Opt-in x_search toolset and xAI credentials. | [x-search] |
| W04 | Native browser automation and backend choices | Navigate, click, fill, inspect, scrape and screenshot using local Chromium, existing CDP browsers, Browser Use/Browserbase and optional engines. | Native browser toolset; selected backend/dependencies required. | [browser] |
| W05 | Low-level browser control and dialogs | Use raw CDP and respond to blocking browser dialogs on an attached CDP endpoint. | CDP-gated companion tools. | [browser] |
| W06 | Encrypted browser credential vault | Save/fill logins, one-time codes, addresses and cards without revealing stored secrets to the model. | Vault/browser integration; host keychain or password-manager setup may apply. | [credential-vault] |
| W07 | Native application computer use | Drive macOS/Windows/Linux applications in the background using screenshots, accessibility and input actions. | cua-driver prerequisite; distinct from browser-only automation. | [computer-use] |
| W08 | Bot Screen and user handoff | Show and interact with the sandbox desktop/browser so humans can assist or take over. | Optional screen stack and environment integration. | [bot-screen] |

### Coding, terminals, files, and execution

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| C01 | General filesystem tools | Read/search/write/patch workspace files with paging and conflict-aware write behavior. | Native file toolset; not equivalent to a limited artifact publisher. | [tools-reference] |
| C02 | Document and database extraction | Read notebooks, DOCX, XLSX, SQLite schema previews, PDF and other Office/document formats. | Some formats stdlib; others need optional anydoc conversion. | [document-extraction] |
| C03 | Shell execution | Run shell commands and development tools in a configured terminal environment. | Native terminal toolset. | [tools] |
| C04 | Background process management | Start, poll, stream logs, write input, wait, kill, and receive process-completion/heartbeat notifications. | Native terminal/process_manage tools. | [tools-reference] |
| C05 | Programmatic tool calling | Execute Python that calls Hermes tools over RPC, including a persistent session kernel option. | Native execute_code; explicit resource and environment configuration. | [code-execution] |
| C06 | LSP diagnostics after editing | Combine syntax checking with workspace language-server diagnostics after file changes. | Opt-in/configured LSP and installed language servers. | [lsp] |
| C07 | Filesystem checkpoints and rollback | Snapshot work before destructive changes; inspect diffs and restore all or individual files. | Opt-in shadow-git checkpoints; not enabled by default. | [checkpoints] |
| C08 | Git worktree isolation | Create isolated worktrees for parallel sessions/subagents, inspect unfinished work and clean stale trees. | Git-backed workflow and automatic worktree mode. | [worktrees] |
| C09 | Delegated code review | Run /review and specialist review tasks with separate context and configurable model routes. | Delegation toolset; a review does not prove the patch is correct. | [delegation] |
| C10 | Alternative terminal environments | Execute using local, Docker, SSH, Modal, Daytona, Vercel Sandbox or plugin terminal backends. | Deployment backend choices, not simultaneous feature inheritance. | [tools] |

### Images, audio, and video

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| V01 | Image attachments and vision | Paste/attach images and route them to vision-capable models or an auxiliary vision tool. | Client upload support plus model/vision configuration. | [vision] |
| V02 | Image generation and editing | Generate, edit with references, choose aspect ratio, and opt into supported upscaling. | Native image_gen with configured provider/backend. | [image-generation] |
| V03 | Video understanding | Analyze video input through a model-callable video tool. | Opt-in video toolset and compatible provider. | [tools-reference] |
| V04 | Video generation, editing and extension | Generate video from text/images; edit or extend using provider-specific tools. | video_gen providers/plugins and credentials required. | [tools-reference] |
| V05 | Speech synthesis | Produce spoken output through cloud or local TTS providers and custom command providers. | Native TTS integration; platform delivery differs. | [tts] |
| V06 | Voice message transcription | Convert incoming audio/voice messages into text. | Transcription provider/local dependency plus channel/client integration. | [tts] |
| V07 | Interactive voice conversations | Microphone conversation, spoken replies and Discord voice-channel interaction. | Voice-mode feature with audio dependencies. | [voice-mode] |
| V08 | Wake-word interaction | Start a voice session hands-free with a configured phrase. | On-device hotword listener; CLI/TUI/Desktop surface. | [wake-word] |

### Automation and collaboration

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| A01 | Ephemeral parallel subagents | Spawn isolated child agents with separate context/tool access and concurrent workstreams. | Native delegate_task; different from persistent group members. | [delegation] |
| A02 | Subagent control and live inspection | Monitor, steer/interrupt, inspect transcripts and handle asynchronous completions. | Delegation lifecycle/client controls. | [delegation] |
| A03 | Structured subagent results and model overrides | Request schema-constrained results, choose child model/provider and control nesting/worktree behavior. | Native delegation options. | [delegation] |
| A04 | Persistent Kanban task boards | Coordinate tasks with dependencies, durable attempts, named profile workers, attachments and board views. | Explicit Kanban workflow/dispatcher; not enabled by wildcard toolsets. | [kanban] |
| A05 | Review and implementation handoffs | Request review, ask for changes, block/unblock tasks and preserve structured handoff context. | Kanban lifecycle tools; distinct from a chat mention. | [kanban] |
| A06 | Scheduled agent jobs | Create/edit/pause/resume/trigger one-shot or recurring jobs with skills and configurable delivery targets. | Native cron workflow. | [cron] |
| A07 | Script-only and chained scheduled jobs | Run scripts without an LLM and pass context/results from one scheduled job to another. | Native cron modes; arbitrary script execution has its own environment. | [cron] |
| A08 | Session heartbeats | Periodically wake an existing session to inspect state and continue work. | Native heartbeat; separate from cron. | [heartbeat] |
| A09 | In-session recurring loops | Repeat a prompt/command on a cadence while the current session remains active. | /loop; not a replacement for restart-safe cron. | [loops] |
| A10 | Judge-driven persistent goals | Continue until a completion contract and quality gates are satisfied; add subgoals and park on processes. | Native /goal mechanism; not automatic multi-goal capture by itself. | [goals] |
| A11 | Inbound webhook automation | Receive/filter/coalesce external events and route them to agent work. | Webhook adapter; event authentication and toolset restrictions apply. | [webhooks] |
| A12 | Automation blueprints | Instantiate reusable automation templates from dashboard or conversational commands. | Blueprint catalog creates cron jobs; plugin blueprints supported. | [blueprints] |

### Model and provider capabilities

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| P01 | Cloud model/provider selection | Choose supported hosted providers and models with provider-specific routing/configuration. | Provider integration; actual usable services require credentials. | [providers] |
| P02 | Custom and self-hosted endpoints | Connect OpenAI-compatible services such as Ollama, vLLM or other private endpoints. | Configured endpoint support. | [providers] |
| P03 | Managed local inference | Download/manage llama.cpp engines and compatible models with hardware-aware selection and memory management. | Desktop-managed local-model capability; distinct from connecting to an existing endpoint. | [local-models] |
| P04 | Subscription/OAuth provider login | Authenticate supported subscription providers and refresh credentials through provider-specific flows. | Integration and provider terms; not a right granted by the Hermes MIT license. | [providers] |
| P05 | Per-task auxiliary model routes | Use independent models/providers for vision, compression, background review and other auxiliary tasks. | Configured auxiliary routing. | [fallback-providers] |
| P06 | Provider ranking and selection policy | Use sorting, allow/deny lists and priority/cost/latency routing where supported. | Provider-routing configuration. | [provider-routing] |
| P07 | Inference-provider failover | Try backup providers for model/auxiliary capacity or availability failures. | Model-provider fallback; not a second agent engine. | [fallback-providers] |
| P08 | Credential pools and key rotation | Distribute requests across keys and rotate on quota/rate-limit failures. | Credential pools; provider account boundaries remain relevant. | [credential-pools] |
| P09 | Mixture of Agents | Use reference models to advise an acting aggregator model that performs the normal tool loop. | Virtual provider with named presets. | [mixture-of-agents] |
| P10 | Prompt caching and model catalogs | Reuse supported provider prompt caches and refresh curated model pickers with cached fallback. | Native/provider-specific behavior; not every route supports the same cache. | [model-catalog], [compression] |
| P11 | Model generation and service parameters | Configure reasoning effort, sampling/temperature and supported provider service tiers or custom request fields. | Provider/model-specific validation and billing behavior; not every route accepts every parameter. | [model-configuration] |
| P12 | Nous Tool Gateway | Route web search/extraction, images, TTS and cloud browser tools through a Nous Portal subscription instead of separate vendor keys. | Hosted paid service integration; not a capability or commercial entitlement bundled by the MIT source license. | [tool-gateway] |

### Channels and external communication

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| N01 | Main messaging channels | Telegram, Discord, Slack, WhatsApp, WhatsApp Cloud API, Signal, SMS and Email. | Per-channel adapter/dependency/credential setup. | [messaging] |
| N02 | Team and federated messaging | Microsoft Teams, Google Chat, Mattermost, Matrix, IRC and SimpleX. | Per-channel adapter/plugin configuration. | [messaging] |
| N03 | Regional messaging platforms | DingTalk, Feishu/Lark, WeCom, WeCom Callback, Weixin, QQ, Yuanbao and LINE. | Platform-specific adapters; capability coverage differs. | [messaging] |
| N04 | iMessage bridges | BlueBubbles and Photon for iMessage. | External bridge and supported host requirements. | [messaging] |
| N05 | Additional platform/relay connections | Buzz, Raft, relay and A2A integrations plus Open WebUI-compatible frontends. | Integration-specific protocol/plugin requirements; not all are ordinary chat adapters. | [messaging] |
| N06 | Notification channels | ntfy and configured cross-platform delivery targets. | Notification adapter and routing. | [messaging] |
| N07 | Channel actions and rich delivery | Discord administration, Feishu documents/drive, Yuanbao messages/stickers, attachments, reactions and threads. | Platform-specific tools and supported channel features. | [tools-reference] |
| N08 | Meetings and smart-home integrations | Teams meeting pipeline, Microsoft Graph notifications, Google Meet and Home Assistant. | Separate platform/plugin/skill/service configuration. | [messaging], [teams-meetings], [built-in-plugins] |
| N09 | Cross-platform session handoff | Resume/handoff work across supported surfaces while preserving session attribution. | Gateway session management; authenticated identity mapping required. | [sessions] |
| N10 | Silence, clarification and redirect controls | Suppress unwanted outbound replies, ask structured clarification questions and redirect active work. | Channel/client behavior and native clarify tool. | [messaging] |
| N11 | Spotify integration | Search and manage playback, queue, devices, playlists, library and listening history. | Official external Spotify plugin, OAuth app and active device; playback operations require Premium. | [spotify] |
| N12 | Managed app connections | Discover/connect/reconnect hosted app connectors, name multiple accounts and activate catalog MCP integrations through connection cards. | Hosted connector gateway/account plus client connection UI; distinct from merely assigning a preconfigured MCP endpoint. | [tools-reference], [tool-search], [tool-gateway] |

### User interfaces and interaction

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| U01 | Classic terminal CLI | Interactive terminal chat, slash commands, piped/script input and session continuation. | Standalone Hermes client. | [cli] |
| U02 | Modern TUI | Rich terminal interface with overlays, switcher, mouse-friendly layout, live input and status. | Separate TUI client over the same core. | [tui] |
| U03 | Native desktop app | macOS/Windows/Linux application with chat, files, tools, settings and remote connections. | Hermes Desktop client; not part of embedding only the runtime. | [desktop] |
| U04 | Web administration dashboard | Manage sessions/configuration/cron/skills and optionally embed terminal chat in a browser. | Hermes dashboard surface; not the same as Ngertiin web. | [web-dashboard] |
| U05 | Persistent Bot Mode | Named bots with role/model/memory/skills/avatar, permanent bot chat, routines and groups. | Desktop UI over Hermes profiles and native group authority. | [bot-mode] |
| U06 | Projects and workspace switching | Named multi-folder workspaces; create/list/switch the active project. | Desktop project tool/client. | [tools-reference] |
| U07 | Embedded preview and agent-guided UI | Read/interact with browser/file previews, annotate elements, focus panes and give UI tours/tips. | Desktop-only tools; most absent on non-Desktop sources. | [tools-reference] |
| U08 | Session history controls | Resume/name/manage/import sessions and use retry/undo/compress/usage commands where supported. | Client commands and persisted session APIs. | [sessions] |
| U09 | Themes, layouts and personality presets | Skins, dashboard/Desktop themes/layouts and session personality presets. | Client customization and SOUL configuration. | [skins], [personality], [dashboard-extensions] |
| U10 | Pets and language packs | Animated desktop companions and translated UI/language-pack extension surfaces. | Optional client presentation features. | [pets], [language-packs] |
| U11 | Many gateways in one desktop | Register local/SSH/URL/cloud connections and organize agents/sessions across instances. | Desktop remote connection and host registry. | [multi-connection] |
| U12 | Deliverable Mode | Attach produced files to final replies and completion notifications on supported messaging channels. | Configured deliverable discovery/delivery; distinct from generating the file or publishing a small text artifact. | [deliverable-mode] |

### Developer, extension, and operations surfaces

| ID | Feature | What it provides | Upstream availability boundary | Primary source |
|---|---|---|---|---|
| O01 | MCP client transports | Connect external tool servers over stdio or remote HTTP transports. | Configured MCP servers. | [mcp] |
| O02 | Advanced MCP interactions | Tool filtering/reload, sampling, elicitation, mTLS/identity headers, cost reporting and experimental events. | Protocol/server support varies; events explicitly experimental. | [mcp] |
| O03 | Hermes as an MCP server | Expose Hermes capabilities to another MCP client. | Separate server interface. | [mcp] |
| O04 | OpenAI-compatible agent API | Expose chat completions, Responses, runs/jobs/sessions, models and discovery to other frontends. | Optional API server; distinct from Ngertiin's private command socket. | [api-server] |
| O05 | ACP editor integration | Use Hermes inside compatible IDEs with editor MCP context, diffs, tools and approval controls. | ACP host integration: VS Code, Zed, JetBrains and others. | [acp] |
| O06 | Subscription inference proxy | Serve raw model inference through Hermes-managed subscription credentials to other applications. | Separate proxy; does not execute the full agent tool loop. | [subscription-proxy] |
| O07 | Plugins and reviewed catalog installation | Load tools, commands, integrations and catalog packages without modifying Hermes core. | Opt-in plugin installation and activation. | [plugins] |
| O08 | Event hooks and middleware | Run gateway/plugin/shell hooks and send signed outbound lifecycle events. | Hooks may observe or transform/control behavior; deployment code is trusted. | [hooks] |
| O09 | Pluggable provider interfaces | Extend memory, context, model, search, image/video, browser, delegation, terminal and secret-source backends. | Extension API categories; concrete plugins may be external. | [plugins] |
| O10 | Agent import/export and distributions | Import other-agent configurations/history; export profiles and distribute/update complete agents via Git. | Importers can be catalog plugins; excludes secrets unless explicitly supported. | [distributions], [agent-importers], [sessions] |
| O11 | Batch evaluation and trajectory data | Run JSONL task datasets in parallel with isolated environments, resume/checkpoint, filter quality and export training trajectories. | Research/evaluation workflow, not ordinary interactive chat. | [batch-processing] |
| O12 | Observability and usage insights | Token/usage history, session diagnostics, telemetry and tracing integrations including relay/Langfuse options. | Some integrations are separate plugins/services. | [built-in-plugins], [cli] |
| O13 | Managed deployment and isolation controls | Multiple profile/gateway layouts, managed configuration, egress/secret sources, maintenance/doctor and runtime update ownership. | Operator/deployment features; a profile is not an OS sandbox. | [managed-scope], [multi-profile], [egress], [secret-sources] |
| O14 | Codex app-server alternate runtime | Run selected Hermes workflows through the Codex app-server runtime with different built-in tools and tradeoffs. | Alternate runtime architecture; not automatic Hermes-native capability parity. | [codex-runtime] |
| O15 | Dynamic tool search and schema loading | Search a deferred tool catalog, load selected schemas and dispatch calls without sending every plugin/MCP schema on every turn. | Configured progressive disclosure; hosted connector and local tool batching have different dispatch paths. | [tool-search] |

## Catalog and channel completeness notes

The pinned checkout contains **58 bundled SKILL.md files** in 12 top-level categories and **152 optional SKILL.md files** in 22 categories. These are source-file counts obtained by traversing `skills/**/SKILL.md` and `optional-skills/**/SKILL.md`, not counts of installed, enabled, licensed-for-every-use or verified workflows. Bundled categories: apple, autonomous-ai-agents, creative, devops, email, media, note-taking, productivity, research, social-media, software-development, web. Optional categories: autonomous-ai-agents, blockchain, communication, creative, data-science, devops, dogfood, email, finance, gaming, health, mcp, mlops, payments, productivity, research, security, smart-home, social-media, software-development, web-development, yuanbao. Consult [skills-catalog] and [optional-skills] for each named workflow and prerequisite.

All 34 non-index messaging guide stems in the pinned tree are: `a2a`, `bluebubbles`, `buzz`, `dingtalk`, `discord`, `email`, `feishu`, `google_chat`, `homeassistant`, `irc`, `line`, `matrix`, `mattermost`, `msgraph-webhook`, `ntfy`, `open-webui`, `photon`, `qqbot`, `raft`, `relay`, `signal`, `simplex`, `slack`, `sms`, `teams-meetings`, `teams`, `telegram`, `webhooks`, `wecom-callback`, `wecom`, `weixin`, `whatsapp-cloud`, `whatsapp`, `yuanbao`. A guide is not necessarily a built-in messaging adapter: some describe a catalog plugin, meeting workflow, webhook ingress or compatibility frontend. See [messaging] and the individual guide before selecting an implementation.

## Built-in toolset appendix

The pinned `tools-reference.md` documents these 29 toolset headings: `browser`, `clarify`, `connections`, `code_execution`, `cronjob`, `delegation`, `feishu_doc`, `feishu_drive`, `file`, `computer_use`, `image_gen`, `kanban`, `project`, `memory`, `catalog`, `session_search`, `skills`, `terminal`, `desktop_ui`, `todo`, `vision`, `video`, `video_gen`, `web`, `x_search`, `tts`, `discord`, `discord_admin`, `hermes-yuanbao`. Toolset naming/aliases are not all identical between the generated reference headings and the `toolsets.py` selection layer (for example Yuanbao). The [toolset-reference] also documents core/composite/platform/dynamic sets, including `safe`, `search`, `context_engine`, generated `mcp-<server>` sets and plugin sets. These are configuration groupings, not independent user-facing feature promises.

Native tools that are important to distinguish from Ngertiin-specific tools include `delegate_task`, `execute_code`, `memory`, `session_search`, `skill_manage`, `skill_view`, `skills_list`, `terminal`, `process_manage`, `read_file`, `search_files`, `write_file`, `patch`, `web_search`, `web_extract`, `vision_analyze`, `image_generate`, `video_analyze`, `video_generate`, `text_to_speech`, `computer_use`, `cronjob_manage` and `todo_list`. The exact model-visible schema depends on source platform, configured toolsets and prerequisite checks. Desktop-only tools and catalog installers are not activated in ordinary messaging/CLI sessions simply by naming `all`. [tools-reference]

## Important adoption distinctions

- Persistent multi-agent group members and ephemeral `delegate_task` children are different primitives. A product may support one without exposing the other. [delegation] [bot-mode]
- Native `/goal`, cron, heartbeat and `/loop` have different lifetimes and ownership. Automatic conversational multi-goal capture is not implied by native `/goal`. [goals] [cron] [heartbeat] [loops]
- Native inference-provider failover is not an alternate execution engine. The Codex app-server runtime is an alternate runtime architecture and must be evaluated as such. [fallback-providers] [codex-runtime]
- Native Browser Use/CDP, native `cua-driver` computer use and an application-owned E2B browser integration are distinct implementations. A shared outcome does not establish inherited tool parity. [browser] [computer-use]
- Tools, context files, global memory and extension background tasks can cross identity/context boundaries if adopted without product-specific binding. Default upstream availability is not a sufficient SaaS isolation contract. [memory] [profiles] [mcp]
- Hosted provider subscriptions, optional packages, catalog plugins and skill scripts have separate availability, credentials, terms and license obligations. The root MIT license is not a complete dependency/third-party service audit. [plugins] [skills]

## Ngertiin comparison mapping

This is a static audit of the active product path on 2026-10-24, supported by existing acceptance reports and test source. It does not inspect a production account's private catalog or rerun live channels/models. A preconfigured HTTP MCP server may supply an equivalent external operation; that is not proof of a first-class native integration for that operation.

Status meanings:

- **Integrated**: the product already implements the relevant outcome, sometimes through an Ngertiin adaptation.
- **Partial**: a related foundation exists, but the listed upstream behavior, configuration or product surface is missing.
- **Unavailable**: the current product cannot grant/use the native feature or has no corresponding client/API contract.
- **Runtime**: the upstream implementation is still present in the engine; absence of product controls is not evidence the underlying mechanism is missing. Exact behavior is not independently verified in this audit.
- **Excluded**: dependencies for that implementation are deliberately omitted from the foundation environment.
- **Outside scope**: adoption would change an explicit current product/runtime decision rather than finish an accepted feature.

The strongest boundary is [capabilities.py](../../apps/engine/src/ngertiin_engine/capabilities.py): native tool grants accept only `todo`, plus Ngertiin's `nma_workspace` and `nma_computer`. Skills are server-catalog instruction strings, not executable skill directories. MCP grants accept private HTTP endpoint specifications. The final dispatch wrapper rechecks these grants. Native code being installed does not make every tool grantable.

Ngertiin evidence keys:

- **G1**: [capability resolver and dispatch guard](../../apps/engine/src/ngertiin_engine/capabilities.py), [capability tests](../../apps/engine/tests/test_capabilities.py), [local provisioning](../../scripts/dev_engine.py).
- **G2**: [agent configuration](../../apps/engine/src/ngertiin_engine/agents.py), [frozen native session policy](../../apps/engine/src/ngertiin_engine/adapter.py), [runtime pin](../../apps/engine/src/ngertiin_engine/runtime-pin.json).
- **G3**: [scoped memory/context](../../apps/engine/src/ngertiin_engine/context.py), [context isolation tests](../../apps/engine/tests/test_context.py), [gateway extension](../../apps/engine/src/ngertiin_engine/service.py). Product sessions use `ignore_rules=True`; native construction consequently skips profile-wide memory/context files. Product memory remains scoped and is injected separately.
- **G4**: [message preparation](../../apps/engine/src/ngertiin_engine/direct_messages.py), `apps/web/src/features/direct-messages/composer.tsx`, [public command allowlist](../../apps/backend/src/ngertiin/agent_engine/api.py). Input accepts text and requires an empty attachment list. Public commands do not expose the private memory/context mutation API.
- **G5**: [artifact publisher](../../apps/engine/src/ngertiin_engine/artifacts.py), `apps/web/src/features/direct-messages/artifact-results.tsx`. Artifacts are immutable UTF-8 text, at most 1 MiB, with explicit conversation sharing.
- **G6**: [computer tool](../../apps/engine/src/ngertiin_engine/computer.py), [trusted E2B bridge](../../apps/backend/src/ngertiin/agent_engine/computer_bridge.py), [integration evidence](nma-021-024-integration.md). Operations are observe, act, pause and delete; browser actions are navigate/click/type/select/scroll, not arbitrary scripts, raw CDP or host application control.
- **G7**: [responsibility tools](../../apps/engine/src/ngertiin_engine/goals.py), [goal lifecycle](../../apps/engine/src/ngertiin_engine/goal_lifecycle.py), [wake definitions](../../apps/engine/src/ngertiin_engine/wakes.py), [webhooks](../../apps/engine/src/ngertiin_engine/webhooks.py), [discussion integration](../../apps/engine/src/ngertiin_engine/discussions.py). Goal watches support once, fixed elapsed interval and idle heartbeat, not full calendar cron expressions.
- **G8**: `apps/web/src/features/agents/agents-page.tsx`, `apps/web/src/features/direct-messages/direct-message-page.tsx`, [active backend composition](../../apps/backend/src/ngertiin/api/app.py), [single-path acceptance](nma-025-026-acceptance-cutover.md).
- **G9**: [diagnostics](../../apps/engine/src/ngertiin_engine/diagnostics.py), [backup/restore](../../apps/engine/src/ngertiin_engine/backup.py), [engine operations](../../apps/engine/README.md), [packaging exclusions](nma-006-packaging-closure.md).
- **G10**: [active repository instructions](../../AGENTS.md), [current product authority](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a). One human owner, persistent identities, one Hermes lifecycle authority and the current E2B implementation are the comparison boundary. Old V1 modules and archived research are not counted as current implementations.

### Memory, learning and context mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| M01 | Partial | Scoped memory storage/retrieval exists. Agent-managed remember/update/forget and public memory management are not wired; native profile memory is intentionally skipped. | G1, G3, G4 |
| M02 | Unavailable | Add search across authorized past conversations, with agent/thread/source scope rather than unrestricted profile-wide history. | G1, G3 |
| M03 | Unavailable | Add a learning-history view showing learned facts, source conversations and subsequent corrections. | G3, G8 |
| M04 | Unavailable | Evaluate a scope-aware external memory provider; Honcho or another catalog service is not inherited merely by embedding Hermes. | G1, G3 |
| M05 | Partial | Persona instructions exist, but project instruction discovery is bypassed. Bind project/folder instructions explicitly before enabling native discovery. | G2, G3 |
| M06 | Unavailable | Add explicit file/folder/diff/URL context references to the text-only composer and context contract. | G3, G4 |
| M07 | Runtime | Native compression/cache machinery remains. Manual compression controls, product telemetry and long-history behavior need separate exposure/verification; do not label compression absent. | G2, G3 |
| M08 | Runtime | Native opt-in/plugin interfaces exist, but no product configuration or acceptance for micro-compaction/context-engine alternatives is established. | G2, G3 |

### Skill mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| S01 | Partial | Assigned skill text is already composed into the persona. Dynamic skills_list/skill_view and referenced executable assets are not grantable. | G1, G2 |
| S02 | Unavailable | Add agent-created and agent-improved persistent skills, with identity/provenance and reusable assets. | G1, G2 |
| S03 | Unavailable | Add conversational learn-from-source workflows that produce reusable skills rather than only a chat answer. | G1, G4 |
| S04 | Unavailable | Add catalog discovery, install/update and version handling for optional/third-party skills. | G1, G8 |
| S05 | Unavailable | Add isolated per-agent/project skill directories; raw host-directory access is not part of the current instruction-text contract. | G1, G2 |
| S06 | Unavailable | Add usage-aware skill maintenance, consolidation and recoverable archive/restore under the existing lifecycle owner. | G1, G7 |
| S07 | Partial | Catalog instruction text may reuse a workflow, but the bundled executable workflows are not automatically installed, grantable or verified. | G1, G5 |
| S08 | Unavailable | Select optional workflows individually; source presence is not an installed capability or blanket dependency/license clearance. | G1, G9 |
| S09 | Unavailable | Add a sandbox document-generation pipeline and binary artifact publishing for Word, Excel, PowerPoint and PDF. | G1, G4, G5 |

### Web, browser and computer mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| W01 | Unavailable | Dedicated search APIs/providers are not native-grantable; add search separately from driving the existing browser. | G1, G6 |
| W02 | Partial | Browser observation can read pages, but native web_extract/long-page extraction is not exposed as a dedicated tool. | G1, G6 |
| W03 | Unavailable | Add read-only public X search through an appropriate provider or scoped MCP integration. | G1 |
| W04 | Partial / Excluded | E2B browser work exists. Hermes native Browser Use dependencies are excluded; alternative browser backends are not inherited product options. | G1, G6, G9 |
| W05 | Unavailable | Raw CDP, programmable native browser execution and dedicated blocking-dialog controls are outside the narrow current browser action schema. | G1, G6 |
| W06 | Unavailable | Add a scoped credential vault/autofill flow for browser logins and OTPs without putting secrets in model context. | G1, G6 |
| W07 | Unavailable | Native OS application control via cua-driver is not the current browser-only E2B tool; it requires a separate actuator contract. | G1, G6 |
| W08 | Unavailable | Add a current-product screen viewer and human handoff/takeover interface; retained low-level assets are not a public feature. | G6, G8 |

### Coding, terminal and file mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| C01 | Partial | Text artifact publish/read exists; general workspace filesystem read/search/write/patch does not. | G1, G5 |
| C02 | Unavailable | Add uploads, conversion and authorized document/database inspection; installed conversion libraries alone do not expose read_file. | G1, G4, G5 |
| C03 | Unavailable | Add command execution inside the retained E2B sandbox, preserving the same run/effect authority. | G1, G6 |
| C04 | Unavailable | Add scoped background processes, stdin/log polling, completion events and lifetime ownership. | G1, G6 |
| C05 | Unavailable | Add Python/data/code execution and programmatic tool RPC inside a scoped execution environment. | G1, G6 |
| C06 | Unavailable | Add language-server setup and diagnostics to a future editable code workspace. | G1, G5 |
| C07 | Unavailable | Add file-change diffs/checkpoints and rollback UI; runtime receipt recovery is not file-content undo. | G1, G5, G9 |
| C08 | Unavailable | Add repository/worktree lifecycle for isolated coding tasks and parallel children. | G1, G6 |
| C09 | Partial | Group peers can review results, but native delegated code-review commands and their code context are not integrated. | G1, G7 |
| C10 | Outside scope | Upstream local/Docker/SSH/Modal/Daytona/Vercel/plugin terminal backends are reference options, not a proposal to replace or reintroduce providers in the current E2B path. | G6, G10 |

### Media mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| V01 | Unavailable | Add image paste/upload, image parts, storage and vision routing; computer observations do not make user image attachments supported. | G1, G4 |
| V02 | Unavailable | Add provider-backed image generation/editing and immutable image results. | G1, G5 |
| V03 | Unavailable | Add video uploads/URLs, analysis routing and media result presentation. | G1, G4 |
| V04 | Unavailable | Add provider-backed video generation/editing/extension and binary delivery. | G1, G5 |
| V05 | Unavailable | Add spoken answers/audio artifacts and a playback interface. | G1, G5, G8 |
| V06 | Unavailable | Add voice-message recording/upload and transcription before ordinary agent admission. | G4, G8 |
| V07 | Unavailable | Add microphone conversation and streaming audio interaction; Discord voice additionally depends on a channel integration. | G4, G8 |
| V08 | Unavailable | Add opt-in wake-word listening in a suitable local/mobile client; it is not a server-only web feature. | G8 |

### Automation and collaboration mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| A01 | Unavailable | Add ephemeral isolated child agents and parallel work within the same authority; persistent group membership already exists and is a different feature. | G1, G7 |
| A02 | Unavailable | Add subordinate-run inspection, steering/cancellation and completion projection for those children. | G1, G7, G8 |
| A03 | Unavailable | Add child-specific model/provider settings, schema-constrained results and worktree options. | G1, G2 |
| A04 | Partial | Product goals map to parked native cards, but a user-facing Kanban board/dispatcher with task dependencies is not exposed. | G7, G8 |
| A05 | Partial | Peer handoff/reviewer results exist; structured board review/request-changes/block/unblock workflows do not. | G7 |
| A06 | Partial | Once/elapsed interval/idle heartbeat are integrated. Full calendar cron, independent job management and per-job delivery/skill/model options are not. | G7 |
| A07 | Unavailable | Add no-LLM scheduled scripts and explicit chained job dependencies under the existing trigger owner. | G1, G7 |
| A08 | Integrated | Ngertiin has durable goal-scoped idle heartbeat. Reusing the outcome does not require activating a second native session heartbeat scheduler. | G7 |
| A09 | Partial | Repeated durable goal work is supported. A distinct foreground-only /loop interface is not exposed and may be unnecessary for the product. | G7, G8 |
| A10 | Integrated / Partial | Automatic multi-goal capture, continuation, evidence-based completion and stop already exist. Native /goal subgoal/judge-specific controls are not an exposed product feature. | G7 |
| A11 | Integrated | Signed durable webhook ingress/coalescing/restart reconciliation already exists; per-source setup UI can be a separate improvement. | G7 |
| A12 | Unavailable | Add reusable automation templates/blueprints mapped into existing goal and wake contracts. | G7, G8 |

### Model and provider mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| P01 | Partial | Per-agent selection from a trusted model catalog exists. Broad provider onboarding, credentials and model discovery are operator-managed. | G1, G2, G8 |
| P02 | Integrated / Partial | Server-configured custom base URLs are supported. Self-service local/private endpoint onboarding and connectivity checks are not product features. | G2, G8 |
| P03 | Unavailable | Hermes Desktop's local inference download/hardware/model management is not part of the current server/web product. | G2, G8 |
| P04 | Unavailable | Add provider-specific OAuth/login flows only where service terms and product credentials allow them. | G2, G8 |
| P05 | Runtime / Partial | Native auxiliary mechanisms remain, but per-agent/task auxiliary route configuration and acceptance are not exposed. | G2 |
| P06 | Runtime / Partial | Native routing options exist upstream; product catalogs currently bind model/provider/base_url rather than expose ranking policy. | G2 |
| P07 | Runtime / Partial | Native provider failover code remains, but product-specific fallback chains are not configurable through the public agent contract or verified here. This is not a second executor. | G2 |
| P08 | Runtime / Partial | Native credential-pool support is not a product key-management surface or an established account-scoped acceptance contract. | G2, G8 |
| P09 | Unavailable | Add a scoped Mixture-of-Agents preset/route if useful; independent model advice differs from group chat. | G1, G2 |
| P10 | Runtime / Partial | Provider prompt caching remains inherited. Automatic product catalog refresh and cache/config telemetry are separate improvements, not a claim caching is absent. | G2, G9 |
| P11 | Partial | The public agent config exposes identity/instructions/model/grants, not per-agent reasoning effort, sampling or service-tier controls. | G2, G8 |
| P12 | Unavailable | Nous Tool Gateway is an external paid service, not a self-hosted capability or subscription entitlement inherited from MIT source. Direct provider integrations are an alternative. | G1, G2, G9 |

### Channel and connection mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| N01 | Unavailable | Add selected Telegram/Discord/Slack/WhatsApp/Cloud API/Signal/SMS/Email adapters bound to the authenticated owner and existing admission path. | G4, G8, G10 |
| N02 | Unavailable | Teams/Google Chat/Mattermost/Matrix/IRC/SimpleX are not current Ngertiin channels; select per real product need. | G8, G10 |
| N03 | Unavailable | DingTalk/Feishu-Lark/WeCom/callback/Weixin/QQ/Yuanbao/LINE need individual connector and platform acceptance. | G8, G10 |
| N04 | Unavailable | iMessage needs BlueBubbles/Photon and suitable bridge infrastructure. | G8 |
| N05 | Unavailable | Buzz/Raft/relay/A2A/Open WebUI paths are not first-class product integrations; protocol and identity mapping require separate design. | G4, G8 |
| N06 | Unavailable | Offline work already persists, but ntfy/push/external delivery targets are not the current product notification contract. | G7, G8 |
| N07 | Unavailable | Native platform actions/moderation/Drive comments/stickers/rich attachments depend on chosen adapters and capabilities. | G1, G4, G5 |
| N08 | Unavailable | Meeting attendance/transcription, Graph source setup, Google Meet and smart-home operations need their specific integrations; generic webhook ingress alone is insufficient. | G1, G7 |
| N09 | Unavailable | Add authenticated channel-to-thread/session handoff; do not merge private contexts or add other human participants implicitly. | G3, G8, G10 |
| N10 | Partial | Intentional silent responses already work. Structured clarify cards and active-work redirect interfaces are not exposed beyond cancel/new-message behavior. | G1, G7, G8 |
| N11 | Unavailable | Spotify needs a selected plugin/API integration, user OAuth and the relevant service entitlements; it is not Hermes core. | G1, G8 |
| N12 | Partial | Assigned private HTTP MCP connectors work. Managed app discovery/OAuth/reconnect, named accounts and connection cards are not integrated; Nous hosted connectors are an external service. | G1, G8 |

### Client and user-interface mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| U01 | Unavailable | No Ngertiin terminal chat client/pipe workflow exists; running upstream Hermes CLI separately is not this product interface. | G4, G8 |
| U02 | Unavailable | No Ngertiin TUI client exists; it could be another authenticated frontend over the same engine. | G4, G8 |
| U03 | Unavailable | No native Ngertiin desktop application/remote host client exists. | G8 |
| U04 | Partial | Ngertiin already has its own web app. Full operator configuration, cron/skills administration and embedded terminal dashboard are missing surfaces. | G7, G8, G9 |
| U05 | Integrated / Partial | Persistent agent identity, soul/instructions/model/grants, DMs and groups already exist. Avatar/template/routine presentation and native Desktop parity are separate additions. | G2, G7, G8 |
| U06 | Unavailable | Add named multi-folder/project workspaces before exposing project filesystem or repository context. | G3, G6, G8 |
| U07 | Unavailable | Add embedded terminal/browser/live artifact previews, annotation and agent-guided interface actions; current artifacts are text downloads. | G5, G6, G8 |
| U08 | Partial | History/reopen/replay already work. Search, branching, rename/import/export and explicit undo/retry/compression controls are not complete product surfaces. | G4, G8 |
| U09 | Partial | Ngertiin has its own design tokens and persona editor. User-selectable skins/layout/theme/personality presets are not upstream UI inheritance. | G2, G8 |
| U10 | Unavailable | Animated pets and runtime language packs are optional client presentation additions, not engine capabilities needed for execution. | G8 |
| U11 | Unavailable | User-managed local/SSH/URL/cloud host connections are not part of the current account-partition deployment model. | G8, G9 |
| U12 | Partial | Authenticated scoped text downloads exist. Binary/media artifacts and native outbound-channel attachment delivery do not. | G4, G5, G8 |

### Developer and operator mapping

| ID | Ngertiin status | Missing product behavior or adoption direction | Evidence |
|---|---|---|---|
| O01 | Partial | Private HTTP MCP is implemented. Local stdio MCP and user-facing server onboarding require a new scoped integration. | G1, G2 |
| O02 | Partial / Runtime | Basic MCP discovery/auth/revocation is tested. Advanced protocol features have no comprehensive Ngertiin product contract/acceptance; do not imply the installed MCP library lacks them. | G1, G2 |
| O03 | Unavailable | Expose an authenticated Ngertiin agent/tool MCP server only through the current authority, not raw account-wide Hermes access. | G4, G8 |
| O04 | Unavailable | Add a public OpenAI-compatible agent API if needed; current nma.v1 commands/SSE are a different protocol. | G4, G8 |
| O05 | Unavailable | Add ACP/IDE sessions, scoped editor context and tool routing as a separate frontend integration. | G1, G3, G4 |
| O06 | Unavailable | Subscription inference proxy is a separate service/interface with provider terms; it is not necessary to commercialize Ngertiin. | G2, G4 |
| O07 | Partial / Runtime | The native plugin infrastructure remains in source, but arbitrary plugin tools are not grantable and there is no supported product catalog/install lifecycle. | G1, G2, G8 |
| O08 | Runtime / Partial | Native hooks/middleware exist. No current product authoring, configuration or scope-aware lifecycle acceptance is established; hooks should not become another run owner. | G2, G7 |
| O09 | Runtime / Partial | Upstream provider extension interfaces remain. Product-supported backends need explicit configuration, credentials, scope and tests; interface presence is not enabled functionality. | G1, G2, G6 |
| O10 | Partial | Whole-partition backup exists. Shareable agent templates/profile distributions and safe cross-product session import are separate missing workflows. | G2, G3, G9 |
| O11 | Partial | Ngertiin has engineering eval/live-test fixtures, not a product batch-dataset/trajectory export environment. | G8, G9 |
| O12 | Partial | Run correlation, token/cost receipts and diagnostics exist. Aggregate analytics, tracing integrations and full operator views are additional work. | G9 |
| O13 | Partial | Isolation, locks, pinned packaging and backup/restore procedures exist. Complete operator rollout/maintenance/UI and cross-host deployment acceptance remain separate release work. | G9, G10 |
| O14 | Outside scope | Codex app-server would be another execution runtime; current product instructions require the latest Hermes-based implementation as the sole runtime. Do not add it as a fallback engine. | G10 |
| O15 | Runtime / Partial | Native tool_search/deferred schemas are not evidence every tool is usable. Discovery/dispatch must remain limited to each agent's current grants; broader catalog onboarding is missing. | G1, G2 |

### Adoption opportunities, not an approved roadmap

The most direct product extensions are scoped automatic memory and history search; richer skill learning/loading; dedicated search/extraction; uploads, document processing and binary artifacts; E2B sandbox terminal/code tools; ephemeral parallel children; owner-bound app connector onboarding; and richer calendar schedules/templates. These are proposals inferred from existing integration boundaries, not newly accepted backlog items.

Do not turn this inventory into a second executor, activate overlapping native cron/heartbeat/goal dispatchers, import profile-wide private memory into groups, or reintroduce retired providers merely for upstream parity. Current Notion decisions and dependency/acceptance ordering remain authoritative. No work was deployed, no capability granted and no external message sent during this research.

Verification of this research artifact: 106 unique upstream IDs and 106 unique comparison IDs match exactly; all relative local links and pinned source paths resolve; all 56 feature documents have a coverage mapping. `python3 scripts/check_docs.py` passed (71 page hashes, 47 tickets, 4 views, 1,351 local links); Git whitespace checks passed. This is documentation/source verification, not a new execution test of any candidate feature.

## Feature-document coverage check

The pinned `website/docs/user-guide/features/` directory contains **56 Markdown feature documents** (plus `_category_.json` metadata). All are mapped below. The inventory contains **106 unique feature-family IDs** after review additions. This checks documentation-family coverage rather than runtime execution or completeness of external catalogs.

| Feature document stem (`.md`) | Inventory row IDs |
|---|---|
| acp | O05 |
| api-server | O04 |
| batch-processing | O11 |
| bot-screen | W08 |
| browser | W04, W05 |
| built-in-plugins | O07, O12 |
| code-execution | C05 |
| codex-app-server-runtime | O14 |
| computer-use | W07 |
| context-files | M05 |
| context-references | M06 |
| credential-pools | P08 |
| credential-vault | W06 |
| cron | A06, A07 |
| curator | S06 |
| delegation | A01, A02, A03, C09 |
| deliverable-mode | U12 |
| document-extraction | C02 |
| extending-the-dashboard | U09, O07 |
| fallback-providers | P05, P07 |
| goals | A10 |
| heartbeat | A08 |
| honcho | M04 |
| hooks | O08 |
| image-generation | V02 |
| kanban | A04, A05 |
| kanban-multi-gateway | A04, O13 |
| kanban-tutorial | A04, A05 |
| kanban-worker-lanes | A04, A05 |
| language-packs | U10 |
| loops | A09 |
| lsp | C06 |
| mcp | O01, O02, O03 |
| memory | M01, M02, M03 |
| memory-providers | M04 |
| mixture-of-agents | P09 |
| overview | Inventory umbrella; individual capabilities map to rows above |
| personality | U05, U09 |
| pets | U10 |
| plugin-catalog | O07 |
| plugins | O07, O09 |
| provider-routing | P06 |
| skills | S01, S02, S03, S04, S05 |
| skins | U09 |
| spotify | N11 |
| subscription-proxy | O06 |
| tool-gateway | P12, N12 |
| tool-search | O15, N12 |
| tools | C01, C03, C04, C10 |
| tts | V05, V06 |
| vision | V01 |
| voice-mode | V07 |
| wake-word | V08 |
| web-dashboard | U04 |
| web-search | W01, W02 |
| x-search | W03 |

## Source references

[memory]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/memory.md
[sessions]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/sessions.md
[memory-providers]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/memory-providers.md
[context-files]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/context-files.md
[context-references]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/context-references.md
[compression]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/developer-guide/context-compression-and-caching.md
[micro-compaction]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/developer-guide/micro-compaction.md
[skills]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/skills.md
[curator]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/curator.md
[skills-catalog]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/skills-catalog.md
[optional-skills]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/optional-skills-catalog.md
[web-search]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/web-search.md
[x-search]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/x-search.md
[browser]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/browser.md
[credential-vault]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/credential-vault.md
[computer-use]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/computer-use.md
[bot-screen]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/bot-screen.md
[tools-reference]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/tools-reference.md
[document-extraction]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/document-extraction.md
[tools]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/tools.md
[code-execution]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/code-execution.md
[lsp]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/lsp.md
[checkpoints]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/checkpoints-and-rollback.md
[worktrees]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/git-worktrees.md
[delegation]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/delegation.md
[vision]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/vision.md
[image-generation]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/image-generation.md
[tts]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/tts.md
[voice-mode]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/voice-mode.md
[wake-word]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/wake-word.md
[kanban]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/kanban.md
[cron]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/cron.md
[heartbeat]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/heartbeat.md
[loops]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/loops.md
[goals]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/goals.md
[webhooks]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/messaging/webhooks.md
[blueprints]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/automation-blueprints-catalog.mdx
[providers]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/integrations/providers.md
[local-models]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/local-models.md
[fallback-providers]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/fallback-providers.md
[provider-routing]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/provider-routing.md
[credential-pools]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/credential-pools.md
[mixture-of-agents]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/mixture-of-agents.md
[model-catalog]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/model-catalog.md
[messaging]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/messaging/index.md
[cli]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/cli.md
[tui]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/tui.md
[desktop]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/desktop.md
[web-dashboard]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/web-dashboard.md
[bot-mode]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/bot-mode.md
[skins]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/skins.md
[pets]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/pets.md
[multi-connection]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/multi-connection-desktop.md
[mcp]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/mcp.md
[api-server]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/api-server.md
[acp]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/acp.md
[subscription-proxy]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/subscription-proxy.md
[plugins]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/plugins.md
[hooks]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/hooks.md
[distributions]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/profile-distributions.md
[batch-processing]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/batch-processing.md
[built-in-plugins]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/built-in-plugins.md
[managed-scope]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/managed-scope.md
[codex-runtime]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/codex-app-server-runtime.md
[toolset-reference]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/reference/toolsets-reference.md
[profiles]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/profiles.md
[teams-meetings]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/messaging/teams-meetings.md
[personality]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/personality.md
[dashboard-extensions]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/extending-the-dashboard.md
[language-packs]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/language-packs.md
[agent-importers]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/import-from-other-agents.md
[multi-profile]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/multi-profile-gateways.md
[egress]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/egress/index.md
[secret-sources]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/secrets/index.md
[office-docx]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/skills/productivity/docx/SKILL.md
[office-xlsx]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/skills/productivity/xlsx/SKILL.md
[office-powerpoint]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/skills/productivity/powerpoint/SKILL.md
[office-pdf]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/skills/productivity/pdf/SKILL.md
[model-configuration]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/configuration.md
[tool-gateway]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/tool-gateway.md
[tool-search]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/tool-search.md
[spotify]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/spotify.md
[deliverable-mode]: https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/deliverable-mode.md

Current official pages fetched for temporal verification: [README](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md), [feature overview](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/overview.md), [tools reference](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/reference/tools-reference.md), [plugins](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/plugins.md), [messaging](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/messaging/index.md).
