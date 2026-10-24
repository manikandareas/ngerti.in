# Agent discovery and direct-message experience

Date: 2026-10-24. Authority: [NMA-012](https://app.notion.com/p/402abdd618738171a512ed2f408422ce), live product documents 01–05, 07–08 and the completed NMA-011 dependency. The existing product/design notes are historical where they conflict with the pivot.

## Delivered behavior

The existing `/agents` page now offers **Buka DM** beside each active agent. It opens an existing DM for that stable agent or creates one using the saved configuration. Explicitly named additional conversations remain available through the existing creation dialog. Existing group configuration remains intact; group messaging is still its separate ticket. The agent/thread list adds only `dm_agent_id`, an owner-scoped identifier, to avoid fetching every complete profile merely to find a DM.

`/conversations/$threadId` is a reloadable, authenticated conversation. Desktop has a conversation navigation rail; mobile has a back link to the agent/conversation list. The header identifies the persistent agent, messages name their author, and each unfinished or failed response shows its activity/outcome. Existing Soft Matcha tokens and UI primitives are reused. Streaming Markdown, a visible stop control, user interruption through a new message, terminal errors, empty/loading states and older-history loading use the NMA-011 API. The composer remains visible while the transcript scrolls and does not pull readers to the bottom when they are reading earlier messages.

Route update, 2026-10-24: private and group conversations share this URL. The previous route and any redirect alias are removed. Thread IDs, authentication, persisted drafts and the HTTP/SSE contracts are unchanged. Earlier verification manifests and captured fixture sources remain immutable historical evidence; the active browser harness uses the current route.

Snapshots establish the replay cursor. SSE renews authentication on reconnect, deduplicates event sequences with BigInt, merges committed messages by stable ID, and replaces per-run drafts without duplicating final responses. Native informational `message.completed` is not treated as a second message. Cursor conflicts trigger a fresh snapshot; offline/online events close stale transport and resnapshot. A lost connection does not cancel work. Terminal run states reject late draft deltas.

The composer retains the exact pending command and request key in owner/thread-scoped session storage before sending. An uncertain response offers an explicit retry of the same intent, including after reload. Authentication failures retain that intent because they cannot establish whether an earlier request committed. Storage-unavailable browsers retain intent in memory only. Draft/intent storage is per browser tab, not cross-device storage. Accepted transcript and run recovery remain server-authoritative.

## Original implementation verification

Evidence: [verification.json](evidence/nma-012/verification.json), [browser-proof.json](evidence/nma-012/browser-proof.json), screenshots and accessibility snapshots in the same directory.

- Six projection tests pass: stable message replacement, cancellation/failure/indeterminate fencing, decimal sequence ordering above JavaScript's safe integer limit, and cross-thread event rejection.
- Three real native-runtime thread tests pass, including additive listing identity, owner/target validation, existing restart/configuration and migration-preservation cases.
- Nine backend authentication/HTTP boundary tests pass.
- `make check`, `make build`, engine Ruff/format, documentation validation and `git diff --check` pass. Build emits existing bundler warnings about third-party `use client` directives and chunk size; it exits successfully.
- Real authenticated Chromium walkthrough at 1440×1000 and 390×844: create Researcher, open DM, send, observe streaming, reload during streaming with partial text restored, cancel, observe a synthetic provider failure, recover offline/online, then receive a completed response.
- A browser fetch fault drops the first command response **after the real server accepts it**. Reload restores the pending intent; retry returns the same operation. The authoritative snapshot contains exactly one matching user message and one run.
- Create Writer on mobile, open its separate empty DM, and send a message. Researcher's prompt is absent from Writer's transcript. A transport process is SIGKILLed while Writer streams; the UI shows reconnecting, then automatically replays to one completed answer after API restart. A subsequent user correction cancels its preceding unfinished run.
- No horizontal overflow at either tested viewport. The browser proof records two DMs, stable identities/config revisions, unique message IDs and explicit author attribution.

The model is a deterministic loopback HTTP fixture; the engine is the real pinned Hermes process on a disposable owner volume. Clerk development authentication and the real backend HTTP/SSE transport are used. This is local integrated UI acceptance, not paid-provider, production, native mobile/Safari or release acceptance. The early offline experiment exposed missing browser offline-event handling; it was fixed and re-exercised. An initial old listing assertion was updated for the additive identifier. An initial fixture incorrectly matched a failure marker in merged prior user text; it was corrected to match only the final turn. These preliminary failures are not counted as passing acceptance.

## Conversation URL verification (2026-10-24)

`make check`, `make build`, `make docs-check` and `git diff --check` passed after the route change. Local application HTTP checks returned 200 for the new conversation URL and 404 without a redirect for the removed route. No removed-route references remain in active application code, scripts, browser harnesses or current documentation.

A disposable browser harness using the real engine and backend verified opening the seeded writer DM, retaining two history messages and its composer draft after reload, and creating and reloading a group with two agents at the shared route. This follow-up used fixture authentication and a controlled model. It does not replace the original Clerk acceptance evidence or claim a new production deployment.

## Review and provenance

Author self-review covered dependency scope, stable identity, stale/unmounted responses, snapshot/replay ordering, uncertain writes, authorization retry, state transitions, keyboard/composition input, mobile overflow and preservation of existing group setup. No independent review is claimed.

The pinned Nakama profile service at `ac0643f8196fdf9133e66f5a13eef86103c45d0c` (MIT) was reread for stable reusable profile identity. A fresh download matches the prior local source SHA-256 `924240e1866bc0c1d517812e518dc524b2aab454712243eed40a5f04c071709d`. No upstream UI/source was copied and no dependency was added. Hermes remains pinned at `7489b22af47ce91b366dde81d5831ea422577498`; its gateway continues to own execution and recovery.

No schema migration, production deployment, cutover, commit or push was performed. Original implementation changes are on base `2198958f32dbeba54a34e194526895003d6e8f27`, identified by the original source manifest. Deploy the additive engine listing before the matching web client. Rollback restores the previous UI/API code without deleting any agent, thread, message or native receipt. At the original ticket closure, goals, group messaging, attachments and executor capability expansion remained downstream work.
