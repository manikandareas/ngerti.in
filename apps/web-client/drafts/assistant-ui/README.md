# Conversation UI draft

Disposable, interactive UI exploration following the seven references and the subsequent retry/card corrections. The existing conversation implementation and Assistant Studio are untouched by this draft.

Run `bun run dev:web-client` from the repository root, then open:

`http://127.0.0.1:3001/drafts/assistant-ui/index.html`

Scenarios use `?case=composer|failed|question|text|approval|files|sources|computer`. The `mode=dm|group` and `theme=light|dark` parameters are shareable. State is otherwise in memory and resets on reload.

- Empty composer during a run shows Stop; any draft switches it to Send. Sending clears the draft and returns to Stop. Typing leaves the current run active.
- Message actions appear on hover or keyboard focus. The hit area joins the bubble to its actions, with a short close delay to keep diagonal pointer movement usable. Retry is neutral, including on failed responses. Tapping a message reveals actions on touch screens. Retry replaces the selected assistant response with agent activity in its position; retrying a user prompt replaces its associated response while preserving the prompt.
- Options and approvals share `interactionCard`, inline beside the assistant avatar, without a close action. The question may contain one or three steps, including a custom option. Approval uses explicit actions.
- Submission removes the card and continues the conversation without a saved-answer receipt. Text-only questions are answered through the normal composer.
- Neutral file chips use small SVG file type marks. Inline citations and a stacked source summary open local example previews.
- Approval footers leave the left side empty and provide only Reject and Approve on the right.
- Computer use starts as a compact preparation bubble. After four seconds, the same bubble expands with a simulated browser screen and moving agent cursor. Open computer shows a larger preview. Lab controls advance or finish the activity, and Stop works during preparation and after the screen appears. This is a UI simulation without a real machine connection.

There are no application API calls, real agent runs, file uploads, purchases, or persistent writes. Icons are local SVG paths from `@hugeicons/core-free-icons` 4.4.0. This folder is a Vite development page; it is outside the production entrypoint and `public` assets.
