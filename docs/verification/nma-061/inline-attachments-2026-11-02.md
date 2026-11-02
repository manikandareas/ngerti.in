# Inline attachment composer

Implemented and verified on 2026-11-02, based on `fd0778a8d9c5607e0e46bff1d716c5e2b313d705` and the conversation queue repair in this working tree. The user reviewed the running UI, requested alignment and tighter spacing, and then authorized a local commit. NMA-060/NMA-061/NMA-062 were fetched as Done before the UI follow-up.

## Behavior

- DM drafts support attachment chips at the cursor between text segments. Lexical and its React bindings are pinned to 0.53.0; the existing composer styling and shadcn Tooltip/Popover primitives are reused.
- Chips appear immediately, shimmer while uploading, and leave text editing available. Sending waits for all referenced uploads. Failed uploads retain the draft and offer retry/removal; a lost upload reply reuses the original workspace, body and idempotency key.
- Hover/focus shows the full name, type and size, plus a preview for supported images. Tap opens the same preview on mobile. Removal appears on hover/focus and remains available on touch devices. Reduced motion disables shimmer animation.
- The editor supports atomic deletion, undo and clipboard operations. Existing uploaded files can also be inserted from the File panel. Only files known in the current conversation resolve to attachment nodes.
- The existing API text field carries escaped `[filename](ngertiin://file/artifact-id)` references in sentence order, paired with authoritative `artifact_ids`. Distinct files with identical names retain different IDs. Pending message retries restore those references after reload and reuse the exact operation. Sent messages render matching chips without exposing the serialized link syntax.
- File size/count/image capability checks remain in effect. Group routed messages retain their existing API attachment limitation. Queued-message editing continues to use the existing text-edit contract.

## Corrections from live review

Chips align with surrounding text and add one ordinary space when needed, with no extra chip margin. A long filename previously left its decorator host about 405 px wider than the visible truncated chip. The host now shares the chip width limit. Browser checks require the host and visible chip to agree within one pixel, normal same-line gaps no larger than five pixels, and text/chip vertical centers within three pixels.

Cursor insertion now observes the actual DOM selection before inserting an attachment. Returning from a queue edit restores focus after the editor's editable state has reached the DOM. Queue-edit focus/selection uses mount lifecycle hooks rather than a delayed selection override. Temporary debugging instrumentation was removed. Concurrent browser suites use separate output directories to avoid deleting each other's traces.

## Verification

| Check | Result |
| --- | --- |
| Final conversation suite, desktop/mobile | 28 passed, zero failures/skips |
| Final attachment/native-interaction cohort, desktop/mobile | 18 passed, zero failures/skips |
| Settings draft continuity, desktop/mobile | 2 passed |
| Existing messenger geometry, light/dark and desktop/mobile | 4 passed |
| Backend workspace/multimodal regression | 19 passed, zero failures, 123 assertions |
| Web-client lint, typecheck and production build | Passed |
| Staged whitespace check | Passed |

The attachment cohort covers file-only sends, multiple uploads, long filenames, duplicate names with stable IDs, cursor position, live upload typing, send fencing, lost upload acknowledgement, reduced motion, image previews, remove/undo/clipboard behavior, pending message reload/replay, ordinary-file versus image count, hidden tool calls and preserved native interaction UI. HTTP, storage and the broker are real; native execution uses the existing controlled fixture. No fresh Codex/Muse provider inference or production acceptance is claimed.

Run from `apps/web-client`:

```sh
bun run build
bun run lint
bun run typecheck
bunx playwright test --config playwright.conversation.config.ts --output ../../.dev/inline-attachments-final-conversation
bunx playwright test --config playwright.work.config.ts --grep 'inline chips align|long filenames|files stay inline|upload shimmer|image chips|pending sends|four ordinary file attachments|tool calls stay|native acknowledgements survive'
bunx playwright test --config playwright.settings.config.ts --grep 'settings navigation' --output ../../.dev/inline-attachments-settings
bunx playwright test --grep 'source messenger geometry' --output ../../.dev/inline-attachments-visual
```

Backend checks: `bun test tests/workspaces.test.ts tests/multimodal.test.ts` from `apps/server`. Generated reports are `apps/web-client/test-results/conversation-report.json` and `work-report.json`; screenshots and traces use the configured output directories. Review upgrades against the installed Lexical node/selection/clipboard interfaces and [official decorator guidance](https://lexicaljs.org/docs/concepts/decorators), then rerun these editor and recovery cases.

Backend lifecycle and schemas remain unchanged. The earlier queue repair is included in the authorized commit. No unrelated user data, credentials, provider configuration, historical verification bytes, push or deployment was changed.
