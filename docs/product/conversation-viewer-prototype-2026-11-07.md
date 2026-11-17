# Conversation content viewer prototype

Date: 2026-11-07. Status: retained interactive exploration. The user selected Focus for implementation; see the [current interface](interface.md#conversation-content-viewer). The throwaway simulation is archived on local branch `prototype/conversation-content-viewer-2026-11-07` at `2a182fe21b298deb041dcc421251e05589875c67` and removed from the production checkout.

## Question

How should a conversation open saved files, user attachments and maximized answer content while keeping feedback easy to compose?

The user requested a prototype before implementation. The agreed exploration uses a Back button, content title, actions menu and content-first body. A floating composer stays available and carries a removable reference to the visible file or table. Editing is an instruction to the agent in the same conversation: the agent can use its existing terminal/file capabilities and publish a new immutable artifact. This does not introduce an inline editor or a dedicated artifact-editing tool.

## Revisit the archived prototype

The current application opens the production Focus viewer. Revisit the comparison in a separate checkout of the local archive branch:

```sh
git worktree add /tmp/ngertiin-viewer-exploration prototype/conversation-content-viewer-2026-11-07
cd /tmp/ngertiin-viewer-exploration
bun install --frozen-lockfile
```

From that archived repository root:

```sh
bun run dev:web-client
```

Open `http://127.0.0.1:3001/assistant-studio?section=viewer&variant=focus`, or use the **Viewer prototype** link in Assistant Studio during development. Use the bottom arrows, or Left/Right outside text entry, to compare the layouts. The variant stays in the URL; demo messages, drafts and sample revisions stay in memory.

| Variant | Composition | Sending feedback |
| --- | --- | --- |
| `focus` | Viewer fills the conversation area; floating contextual composer below. | Return to the conversation and show the simulated response there. |
| `split` | Viewer and conversation are side by side on desktop; a Read file / Chat control switches them on mobile. | Keep the file available and show the response in the conversation. |
| `overlay` | A large viewer layer above the conversation, within its main area. | Return to the conversation and show the simulated response there. |

The user selected `focus` on 2026-11-07, with the filename centered in the header. The production viewer follows that composition and returns to the conversation after accepted feedback. Split and overlay remain comparison fixtures.

## Try the flow

1. Read `laporan-penjualan.md`; scroll while the header and composer stay available.
2. Choose **Try: “Ringkas kesimpulannya”** and send. Open `laporan-penjualan-revisi.md` from the simulated reply. Its summary has three points; the original file remains available.
3. Go Back and maximize **Penjualan per kanal**. Search or sort the expanded table in the same viewer.
4. Open **Library**, then the uploaded `penjualan-oktober.csv`. Inspect the actions menu and **File info**; Back returns to Library.
5. Remove the composer reference to send an ordinary message. A draft survives opening and closing the viewer.
6. Compare light/dark using the local theme control. It does not change the workspace theme preference. **Reset demo** clears the simulation; **Demo state** exposes the current local state.

Download and copy use fixture content. Responses are deterministic local simulations. There is no model call, resource authorization test, real revision, terminal use, backend mutation, persistent file versioning, new preview format or native-installation acceptance. Table view controls are local to the mounted table and may reset after closing it. Browser Back/refresh restoration and physical phone keyboard behavior remain outside this prototype.

## Source and verification

### HTML case

Open `http://127.0.0.1:3001/assistant-studio?section=viewer&state=html&variant=focus`, or choose **Case: HTML** in the prototype controls. The sample `dashboard-penjualan.html` renders a sales dashboard directly in the content area. Per the user's explicit refinement, there is no Preview/Source toolbar or HTML Document label. Download in the existing actions menu supplies the original HTML source.

The floating composer references that HTML file. The suggested request, **Ubah judul dashboard menjadi Ringkasan Oktober**, simulates publication of `dashboard-penjualan-revisi.html`; its visible heading changes while the original remains available. This is still an in-memory fixture interaction, not a real edit operation.

The HTML fixture renders inside an iframe with an empty sandbox and a restrictive document CSP. It has no scripts or external assets/network requests. This demonstrates static HTML artifacts only; interactive app previews and real user/agent HTML transport remain separate implementation work.

The prototype source at `prototype/conversation-content-viewer-2026-11-07:apps/web-client/src/features/conversation/prototypes/viewer/viewer-prototype.tsx` uses existing Ngertiin tokens, Hugeicons, avatars, Button/DropdownMenu, Lexical composer and Markdown/code renderers. All content is authored fixture data; Grok Bot inspired the interaction discussion, but no Grok Bot source was copied.

The archived prototype is development-only and uses fixtures. Its Assistant Studio entry and variant search parameter have been removed from the production checkout after the Focus decision. See [verification and screenshots](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/conversation-viewer-prototype-2026-11-07/README.md at 043f7c9").
