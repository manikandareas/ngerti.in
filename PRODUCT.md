# Ngertiin product direction

The authority for product decisions is [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), updated for harness-first development on 2026-10-30.

- One human owner works with persistent agents through private DMs and groups. Agent identity persists while conversation context and native sessions remain separate.
- Ngertiin owns admission, queues, domain persistence, event publication, goals/Routine, stop intent and recovery decisions. Each harness owns its inner agent/model/tool loop.
- Required runtimes are Codex/ChatGPT through App Server and Muse Code through SDK/MSP. Subscription and explicitly selected API-key billing remain distinct. Hermes and additional runtimes are deferred.
- Agents capture goals from conversation. Stopping a run differs from pausing/stopping the responsibility and its continuations. Unknown external outcomes require reconciliation before replay.
- Composio supplies app connections. The approved shared-machine amendment provides one persistent local Linux desktop per installation/owner through Cua SDK, spacesd and Driver. Browser, terminal and working files share that machine; Computer supports viewing and human takeover. Private history/memory/provider credentials and saved artifact metadata stay in Ngertiin. Remote/VPS attachment and native Ngertiin clients remain future scope. See docs/architecture/shared-machine-cua-plan-2026-11-04.md.
- Backend/API implementation precedes the NMA-060 readiness gate, UI NMA-061–063, and installation NMA-064. Historical results do not satisfy these gates.

The approved foundation stack is Bun + TypeScript + Elysia + SQLite with background scheduler and dispatcher modules under one application authority. See the [ADR](docs/architecture/adr-0001-harness-first-foundation.md) and [contract](docs/architecture/harness-first-contract.md). Foundation completion does not imply provider, UI, installer or production acceptance.

Historical development data may be reset without a compatibility migration. Unrelated work and historical evidence remain preserved; new runtime data must persist and recover correctly during normal operation.
