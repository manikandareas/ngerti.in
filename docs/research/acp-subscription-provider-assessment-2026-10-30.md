# ACP and subscription-first provider integration

Date: 2026-10-30. Status: research and architecture proposal; no runtime change, provider login, live inference, backlog mutation, or release acceptance.

## Decision in brief

ACP can be one transport for integrating subscription-backed **agent harnesses**. It does not by itself create subscription entitlements, turn a harness into a general inference endpoint, or make every provider behave alike. Treat a connection's billing/authentication method, model access, and execution transport as separate properties.

For Ngertiin, the important choice is how much execution remains inside Hermes. A direct subscription inference API can preserve Hermes's normal model/tool loop. An ACP harness request ordinarily invokes a downstream agent loop. A constrained bridge can translate between those surfaces, but its tool-call, history, cancellation, and recovery behavior must be proven for each harness. This is an architectural inference from the protocol and provider surfaces below, not evidence that any candidate has passed Ngertiin acceptance.

The primary-source findings support a mixed transport approach: direct ChatGPT plan usage when deployment eligibility and required capabilities fit; native Muse MSP where harness access is required; ACP for providers with a supported ACP surface. Requiring ACP for every provider adds adapters without eliminating provider-specific behavior.

| Target | Preferred first candidate | ACP position |
| --- | --- | --- |
| ChatGPT plan with Hermes-owned loop | Existing direct SIWC/Responses route, subject to deployment eligibility and tool schema compatibility. [SIWC](https://developers.openai.com/siwc/token-sharing-open-source) | Optional when intentionally using Codex as a bounded harness; the current adapter wraps App Server. [Codex ACP](https://github.com/agentclientprotocol/codex-acp/blob/ac8d9251de43ab8648a89eb0520e0c606ad78be5/README.md) |
| Codex-specific harness capabilities | Compare direct App Server with ACP on the exact features required. [App Server](https://learn.chatgpt.com/docs/app-server) | Shared wire handling can be useful, but it adds a translation layer and adapter pin. |
| Muse Code subscription | Native MSP/official SDK as the first supported harness candidate. [Muse SDK](https://github.com/meta-models/muse-code-sdk/blob/33110fe570f9e71da4869beab06b803cb3fa9242/clients/sdk-ts/README.md) | Community ACP bridge is technically available; no supported first-party adapter is published. Test it as a separate candidate, not as equivalent support. |
| Additional ACP-capable subscriptions | Evaluate the existing pinned Hermes client/bridge and constrain downstream tools. | Adopt provider by provider, with evidence for billing identity, structured tool fidelity, cancellation and recovery. |

This is a research recommendation, not an approved change to the current lifecycle design.

## Current Ngertiin and Notion evidence

The root audit inspected checkout `052122ffddb0661d0746f7d1ce21933f5090387f` and preserved its unrelated uncommitted work. Knowledge-graph tools were unavailable, so discovery used the documented fallback. These are current source observations; historical provider acceptance is labeled separately.

- [`provider_manifest.py`](../../apps/engine/src/ngertiin_engine/provider_manifest.py) already declares ChatGPT public `/v1/models` and `/v1/responses` through `codex_responses`, with `local_loopback` deployment. Supported HTTP wire protocols remain `chat_completions`, `codex_responses`, and `anthropic_messages`; ACP is not an interchangeable value in that set.
- [`provider_auth.py`](../../apps/engine/src/ngertiin_engine/provider_auth.py) enforces `NMA_CHATGPT_LOCAL_OSS` and requests the SIWC plan-use scopes. [`connections.py`](../../apps/engine/src/ngertiin_engine/connections.py) handles serialized credential refresh, generation fencing and disconnect.
- [`provider_transport.py`](../../apps/engine/src/ngertiin_engine/provider_transport.py) is a credential-only HTTP relay. Its runtime route uses an HMAC; forwarding checks run authority and connection generation. ChatGPT forwarding forces `store: false` and `stream: true`. Replacing this relay with a subprocess harness would change its execution contract.
- [`media_provider.py`](../../apps/engine/src/ngertiin_engine/media_provider.py) currently uses a Meta API key for scoped media capabilities. This is separate from Muse Code subscription-backed conversation/harness integration.
- [`integration.py`](../../apps/engine/src/ngertiin_engine/integration.py) installs native signature guards around dispatch, sessions and authority.

The live [provider connection ticket NMA-040](https://app.notion.com/p/404abdd61873806db119ef3ee29739f7) records Hermes-first execution with one writer and an OpenCode exception. It is marked Done, with documented dependencies NMA-007/008/010/023 also Done. Its earlier ChatGPT catalog, native-tool, group and offline-goal acceptance is retained historical evidence, not a rerun in this research. A real rotating-refresh attempt timed out and was fenced; reauthentication subsequently succeeded. Do not turn that sequence into a fresh clean refresh claim.

The live [architecture decision](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f) keeps Hermes as the single lifecycle authority with outbox/receipts/reconciliation. An external harness can be a bounded executor under that authority, but adding a parallel top-level scheduler/session-recovery owner would depart from the accepted design.

Billing source is separate from authentication method. The current provider manifest's OpenCode Go connection is a subscription authenticated by a key. Consequently, product choices should track `billing_source` and `auth_method` independently; OAuth does not universally mean subscription, and an API key does not universally mean pay-as-you-go.

## Existing Hermes ACP support changes the feasibility question

The root audit checked exact Hermes pin `7489b22af47ce91b366dde81d5831ea422577498`. [`agent/acp_openai_bridge.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/agent/acp_openai_bridge.py) and [`agent/copilot_acp_client.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/agent/copilot_acp_client.py) exist at that pin. The generic `agent/acp_client.py` seen on newer upstream main does not exist there; do not claim newer-main functionality for the pinned installation.

The pinned bridge inserts inference tool schemas into prompt text and parses tool calls from response text. Its helper supports an allowlist of Hermes agent-level tools intended to avoid duplicated native actions with autonomous downstream agents; that helper is not proof that every provider activates the constraint. The pinned Copilot client documents forwarding the full toolset, starts a short-lived session per request, packages formatted history into one prompt, and synthesizes OpenAI-shaped streaming after the response. These mechanisms establish that an ACP-backed inference facade is possible; they do not establish native streaming fidelity, complete schema fidelity, or acceptance for a new provider.

The same pinned Copilot facade returns zero-valued token counters rather than measured usage. An integration must preserve that distinction: synthetic zero is unknown accounting, not evidence that no allowance was consumed. Process startup, repeated transcript serialization and prompt-based tool translation are plausible overheads, but this research contains no measured latency or quota comparison. [Pinned completion construction](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/agent/copilot_acp_client.py#L328-L351).

ACP does have structured `tool_call`, `tool_call_update`, and permission events. Those describe an agent's tool execution lifecycle. They are a different contract from passing OpenAI inference function schemas and receiving `tool_calls` for Hermes to execute before the next model request. The bridge's statement about a missing `tools/tool_calls` channel refers to that inference roundtrip, not an absence of structured ACP tool events.

Another route exposes scoped Ngertiin tools to the downstream harness through MCP. That can preserve structured tool invocation, but the harness owns the inner tool loop and every final effect dispatch must still enforce current owner/thread/grant/generation authority. It is a different execution integration from the existing HTTP credential relay. The pinned [`hermes_cli/runtime_provider_backends.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/runtime_provider_backends.py) includes external-process backends; that upstream surface alone does not wire one into Ngertiin.

Also distinguish a Hermes ACP **server**, which lets a client drive Hermes, from a Hermes ACP **client/bridge**, which drives an external harness. Only the latter addresses adding an ACP-backed provider to this question.

## ChatGPT: direct plan inference is an alternative to harness integration

OpenAI now documents Sign in with ChatGPT (SIWC) with optional ChatGPT plan usage. Eligible Plus and Pro users authorize the app; identity-only sign-in does not authorize inference. The OSS flow requests separate inference scopes, including `chatgpt.tokens.use.direct`, and registers a client bound to the selected user/workspace. This is an independent product integration rather than reuse of a Codex login cache. [SIWC quickstart](https://developers.openai.com/siwc/quickstart), [official cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).

The documented inference route is `GET /v1/models` for the account-specific catalog and `POST https://api.openai.com/v1/responses` with the granted bearer token. Each HTTP inference request uses `store: false`, `stream: true`, and the required context in `input`; success requires the terminal `response.completed` event. A stream can fail after emitting text. This route can leave the agent/tool loop in Hermes if its request adapter matches the contract. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Availability is conditional. The OSS documentation covers open-source and locally hosted apps; paid or remotely hosted app offerings must request access. Its host model explicitly includes a user's self-hosted VM: a laptop and personal VM can share a client registration for the same user/workspace while keeping distinct persistent host IDs. Do not equate a user's self-hosted VM with a commercial multi-tenant hosted product, and do not assume a public SaaS deployment is eligible. [SIWC overview](https://developers.openai.com/siwc/token-sharing-open-source).

The preview route supports client function/custom tools, with the documented namespace or `additional_tools` shape. It excludes hosted MCP/connectors, Responses `tool_search`, native computer use, image generation, file search, Code Interpreter, audio/video input, and transcription. HTTP history must be supplied explicitly; `previous_response_id` is unavailable in that flow. Many ordinary Responses parameters are unsupported. Model-driven local tools remain possible, but the adapter must not assume complete Responses API parity. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Operationally, identity, granted plan scope, model discovery, and completed inference are distinct states. A usage-limit response must pause plan-backed requests without guessing a reset time. A temporary availability failure preserves credentials; an unsupported capability requires changing the request rather than repeating OAuth. These conditions should not silently switch the user to paid API-key billing. [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).

## ChatGPT through Codex App Server or ACP

OpenAI documents Codex App Server for embedding authentication, conversation history, approvals, and streamed agent events in a custom product. It exposes Codex threads and turns, with local history and resume. The documented default transport is JSONL over stdio; the same page labels WebSocket transport experimental/unsupported and requires explicit transport authentication for non-local deployments. JSON-RPC transport authentication and the user's model-provider login are separate concerns. [Codex App Server](https://learn.chatgpt.com/docs/app-server).

Codex supports ChatGPT sign-in for subscription access and API-key sign-in for usage-based access. Its CLI can reuse cached credentials and refresh them during normal operation; device-code login is documented for headless environments, subject to availability/settings. This is specific Codex functionality, not a guarantee supplied by ACP to every harness. [Codex authentication](https://learn.chatgpt.com/docs/auth).

The current `agentclientprotocol/codex-acp` project wraps Codex App Server and translates its operations/events into ACP. It advertises ChatGPT, API-key, and negotiated gateway authentication; model/reasoning/approval/sandbox configuration; client MCP servers; history and tool events. It includes a compatible Codex dependency, so adopting it adds an adapter and a second version to pin. Its README says `NO_BROWSER=1` hides browser-based ChatGPT authentication; native Codex device login support must not be assumed to exist through this adapter's advertised login surface. The former `zed-industries/codex-acp` repository directs new installations to this project. [Current adapter README](https://github.com/agentclientprotocol/codex-acp/blob/ac8d9251de43ab8648a89eb0520e0c606ad78be5/README.md), [migration notice](https://github.com/zed-industries/codex-acp/blob/main/README.md).

Inference: direct App Server integration can expose Codex-specific functionality with fewer translation layers. ACP can reduce client-side implementation work across multiple ACP agents. Both routes invoke a Codex harness rather than merely supplying a raw completion to Hermes. The exact Ngertiin bridge can alter that tradeoff, but must demonstrate its constrained execution mode.

## Muse: official protocol is MSP; subscription is tied to Muse Code

Meta documents `muse serve` and `@muse-code/sdk` as its programmatic session interface. The official SDK drives Muse Session Protocol (MSP), opens/resumes sessions, streams turn items, handles approvals and user questions, and reconstructs state after delivery gaps. It has version/fingerprint compatibility rules and experimental surfaces that can change. Its README explicitly states that `@muse-code/acp` is not published and that there is no supported ACP adapter to install today. [Official Muse SDK](https://github.com/meta-models/muse-code-sdk/blob/33110fe570f9e71da4869beab06b803cb3fa9242/clients/sdk-ts/README.md), [Muse Code overview](https://dev.meta.ai/docs/muse-code).

Muse Code subscriptions apply to the credential automatically connected during CLI onboarding, for Muse Code use only. Additional API keys created under the Meta Model API account use pay-as-you-go billing. Meta describes subscription usage as available through the Muse Code CLI while signed in. Therefore an arbitrary Meta API key does not prove subscription billing, and extracting a Muse subscription credential for a direct custom-model adapter is not an established supported path. [Meta subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions).

Muse can authenticate through browser sign-in or an API key. Credential precedence is environment `META_API_KEY`, then stored API key, then stored browser session. Official CI guidance uses an API key. A subscription-first UI therefore needs to report which credential wins instead of labeling every authenticated Muse connection as subscription-backed. [Meta authentication](https://dev.meta.ai/docs/muse-code/auth).

An unofficial community adapter, `@bex-co/muse-code-acp`, wraps the official SDK/MSP. Its README documents ACP sessions, permissions, MCP and model configuration, but also unavailable token usage/delegated workers, unsupported features, client capability dependencies, and verified-host constraints. It is explicitly unaffiliated with Meta. This establishes technical feasibility of an ACP-to-MSP bridge, not first-party support, feature parity, or Ngertiin acceptance. [Community adapter](https://github.com/bex-co/muse-code-acp/blob/87259565e9fccdea7f6de1eec4cb0b55e93bd727/README.md).

Openbot corroborates the native route: its Muse client imports `spawnMspConnection` from `@muse-code/sdk` and its login helper runs `muse serve`. Device login and `account/read` explicitly opt into experimental MSP APIs; API-key variables are removed from the login process so an existing key cannot masquerade as a fresh browser login. This is first-party evidence of Openbot behavior, not an additional Meta compatibility promise. [Muse client](https://github.com/nightly-labs/openbot/blob/38a1666d8cea216fd0d4cef36cb9d1a2f63c8cd8/src/backend/muse-client.ts), [login helper](https://github.com/nightly-labs/openbot/blob/38a1666d8cea216fd0d4cef36cb9d1a2f63c8cd8/src/backend/agent/muse-login.ts).

## ACP capabilities and limits

The protocol repository states that stable wire protocol version is **1**. Version 2 docs/schema are present, but their existence does not establish stable adoption. Wire compatibility is negotiated with `protocolVersion`, while optional behavior is negotiated through capabilities; SDK/crate/schema artifact versions are separate. Newer v2 semantics such as prompt acceptance followed by idle state updates must not be assumed on a v1 connection. [ACP versioning](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/README.md), [v2 overview](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v2/overview.mdx).

| Surface | Standardized behavior | Remaining integration work |
| --- | --- | --- |
| Authentication | `initialize` advertises `authMethods`; agent-driven or terminal flows; optional logout. | Browser/device flow, token refresh, credential storage, subscription eligibility and key precedence remain harness-specific. [Authentication](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/authentication.mdx) |
| Models/settings | Session `configOptions` can expose model, reasoning and mode choices. | Choices need capability-aware mapping. A model setting can be process-wide in an implementation. [Config options](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/session-config-options.mdx) |
| Sessions | New sessions; optional history replay/load and optional resume without replay; MCP configuration. | Persist native session identifiers and capability checks; do not assume a resumable session on every agent. [Session setup](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/session-setup.mdx) |
| Prompt/tool cycle | Agent handles model calls and tool invocations, reporting updates to client. | A Hermes inference bridge must constrain downstream native tools and translate structured tool intent correctly. [Prompt turn](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/prompt-turn.mdx) |
| Usage | Optional `usage_update` reports context-window use and cumulative cost. | Account subscription quota/reset and complete token/cost reporting are not guaranteed by that event. Missing data remains unknown. [Usage updates](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/prompt-turn.mdx#session-usage-updates) |
| Cancellation | Prompt cancellation plus optional generic request cancellation. | Cancellation of nested terminal/tool work is not an automatic universal guarantee. Completed effects remain completed. [Cancellation](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/cancellation.mdx) |
| Transport | Stable v1 documentation defines stdio; custom transports allowed. | Remote transport RFD work does not supply a ready shared-host authentication/isolation implementation. [Transports](https://github.com/agentclientprotocol/agent-client-protocol/blob/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1/transports.mdx) |

Openbot is useful counterevidence to a one-adapter assumption. Its ACP flavor hooks address process-wide model selection, session/process lifetime, failed prompts presented as successful answer text, quota text interpretation, cancellation/reopen behavior, and per-directory MCP configuration. A shared ACP core reduces repeated wire handling but still requires provider-specific behavior and version acceptance. [Openbot flavors](https://github.com/nightly-labs/openbot/blob/38a1666d8cea216fd0d4cef36cb9d1a2f63c8cd8/src/backend/acp-flavor.ts).

## Pros and cons for subscription-first Ngertiin

| Benefit | Tradeoff |
| --- | --- |
| Reuse each harness's supported account login, token refresh, and provider model access. | The protocol cannot expand plan entitlements or make a subscription credential interchangeable with an API key. |
| Share session/prompt/progress/permission plumbing across ACP agents. | Optional features and agent-specific behavior still need adapters and compatibility tests. |
| Retain API-key use when the same harness supports it. | A key may override the subscription and change billing; authentication mode needs to be explicit. |
| Reuse an established harness's tools, context handling, and sandbox. | Those features overlap Hermes responsibilities if used as a model backend. Restricting them is harness-specific and can remove expected capabilities. |
| Keep credentials near a user-controlled host. | Web/mobile access and offline proactive work need an available host with persistent credentials, native history, process supervision and isolation. ACP is not that hosting layer. |
| Add new compatible harnesses without implementing every wire protocol. | Codex still has a richer native API and Muse's supported interface is MSP. An ACP-only requirement adds translation and version dependencies. |

These comparisons are architectural inferences from the sources above, not benchmark measurements. No latency, account isolation, rate-limit recovery, quota accuracy, tool-call fidelity, or restart/cancellation acceptance has been exercised here.

## Recommended transport selection

Recommendation: make the product subscription-first while keeping transport selection provider-specific. Do not replace the existing inference contract with ACP solely to obtain login. This is a proposal for the user's decision, not a new accepted ADR or authorization to change the runtime.

| Target | Recommended first evaluation | Why / unresolved condition |
| --- | --- | --- |
| ChatGPT plan as the reasoning model for Hermes | Keep and revalidate the existing official SIWC/public Responses path. | Preserves the current Hermes tool loop; requires the intended local/self-hosted/hosted deployment to be eligible and request features to match the SIWC contract. |
| Codex harness capabilities | Compare native App Server with `codex-acp` as a bounded delegated execution path. | ACP shares client plumbing; native App Server avoids an extra translation layer. Neither is automatically equivalent to a raw inference response. |
| Muse Code subscription | Start from the official SDK/MSP driving the Muse Code CLI, with a dedicated owner-scoped login and execution environment. | The subscription credential is tied to Muse Code; SDK availability does not by itself prove that the intended Ngertiin deployment is approved. A community ACP bridge adds a support/version dependency. |
| An additional genuinely ACP-compatible subscription harness | Reuse compatible pinned Hermes external-process primitives and prove one narrow provider integration. | A common ACP transport is useful only after model/tool behavior, credentials, cancellation and native session recovery satisfy Ngertiin's contract. |
| Optional API-key access | Retain an explicitly selected key-backed connection through its supported native or harness transport. | Display actual billing source independently of auth method; a key can represent subscription access or usage billing, depending on the provider. |

For an external-harness proposal, Hermes remains responsible for admitting work, persistent agent identity, DM/group scope, automatic goals, scheduling, publication, cancellation intent and recovery decisions. The harness owns only the bounded execution it receives and its native inner session. Ngertiin must retain the native session/operation identity and reconcile receipts; it must not assume a disconnected process stopped or replay an uncertain action. This boundary can accommodate a delegated harness without introducing a second top-level scheduler, but an ordinary ACP session alone does not implement it.

The first useful spike is a comparison of the same short workflow through the existing ChatGPT route and one ACP harness: receive a prompt, invoke one scoped Ngertiin tool, publish one result, stop, restart and resume. Test Muse MSP separately rather than declaring its subscription verified from the ACP spike. Record real first-progress/completion times, actual or unknown usage, tool-call fidelity and duplicate-effect outcomes. Retain failures and denominator counts. A logged-in account or advertised model list is insufficient acceptance.

## Provider eligibility is separate from protocol compatibility

Technical interoperability is not a provider's approval to offer a subscription in a third-party product. In particular, Anthropic's current legal/compliance documentation distinguishes end users running an unmodified Claude Code binary from third-party products/Agent SDK integrations, for which it directs developers toward API-key or supported cloud-provider authentication. Openbot's own provider-terms document acknowledges that its Claude subscription sign-in has not been confirmed as permitted by Anthropic. ACP cannot remove this distinction. [Anthropic legal/compliance](https://code.claude.com/docs/en/legal-and-compliance), [Openbot disclosure](https://github.com/nightly-labs/openbot/blob/38a1666d8cea216fd0d4cef36cb9d1a2f63c8cd8/docs/provider-terms.md).

## Suggested proof before selecting a transport

1. Prove one completed subscription-backed request, distinguishing identity, model catalog and inference; separately prove explicit API-key use where supported.
2. Prove that model/tool ownership matches the intended Hermes boundary, including malformed/parallel tool calls and native-tool suppression when acting as an inference bridge.
3. Prove owner/thread/grant isolation across concurrent DM, group and proactive runs; include model switching and credential changes.
4. Interrupt/restart during a model call, pending permission, and external effect. Recover using native identifiers/receipts without replaying an uncertain effect.
5. Observe token expiry, revoked consent, subscription limit and missing usage metadata; preserve credentials and report unknowns appropriately.
6. Exercise the deployment intended for users: local app, personal self-hosted VM, or paid hosted product have different login, availability and eligibility questions.

## Inspected external revisions

| Repository | HEAD observed during research |
| --- | --- |
| `agentclientprotocol/agent-client-protocol` | `ac765763d483dd92fb5b57aec154d45586be2717` |
| `agentclientprotocol/codex-acp` | `ac8d9251de43ab8648a89eb0520e0c606ad78be5` |
| `meta-models/muse-code-sdk` | `33110fe570f9e71da4869beab06b803cb3fa9242` |
| `bex-co/muse-code-acp` | `87259565e9fccdea7f6de1eec4cb0b55e93bd727` |
| `nightly-labs/openbot` | `38a1666d8cea216fd0d4cef36cb9d1a2f63c8cd8` |

Official documentation was fetched live on the research date. Repository heads and optional/experimental features can move; pin accepted runtime/adapter versions and retain the evidence for the chosen provider path.
