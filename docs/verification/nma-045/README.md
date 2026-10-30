# Settings and connections redesign

Local scoped acceptance for NMA-045, 28 October 2026. Baseline: `12903c4`.
The live Notion task and its NMA-041/NMA-042 dependencies were read before implementation. `docs/agent.pen` remains the design authority and was not modified.

## Delivered design

The Settings shell follows the reference's 292 px sidebar, 10 px desktop inset, 16 px surface radius, 42/48 px content padding, Geist typography and existing semantic light/dark tokens. AI providers use 96 px rows, 44 px icon tiles, status badges and 44 px quick actions. Connections uses the reference heading/search/Add arrangement and a two-column directory. Mobile uses the shared shadcn Sheet; forms, focus handling and notices use the existing primitives.

| Reference | Implementation and evidence |
| --- | --- |
| EO5eO / ayvol | AI provider settings; `providers-{theme}-{width}.png` |
| Xhoqr / Bq1Ov | Searchable managed app directory; `apps-{theme}-{width}.png` |
| OzO6z / C44VK | Live app status, tool selection and local disconnect; `configured-app.png`, contextual panel captures |
| X8V64i / E1nbYS | Reconfiguration, OAuth pending/cancel, recovery and explicit unavailable states; `reconnect-app.png`, `login-restored.png` |
| P8HgX / V5MV55 | Connect provider, account status and configuration entry in conversation; provider dialogs and `context-{theme}-{width}.png` |

Contextual connections reuse the same app component and shared resource panel. They expose real account status, existing app tools/grants and interaction prompts without changing the conversation URL. Provider configuration opens the dedicated Settings surface. Secrets are never read back into inputs. OAuth session storage retains only the attempt ID; polling restores the durable attempt after reload. The status endpoint intentionally does not reissue a one-use launch URL.

## Preserved action coverage

`coverage.json` maps every existing action group to implementation and evidence. All five existing provider definitions, all three custom protocols and all four managed application definitions remain reachable. Source provider rows additionally select presets on the existing custom-endpoint path; they do not introduce a new provider engine. Existing account/registration identity, model catalog, unavailable model selection, key replacement, reconnect, disconnect, tool selection, Google setup, MCP profiles, app interactions, research, media and inference controls remain available.

Provider disconnect now distinguishes `not_requested` and `not_confirmed` from confirmed remote revocation. Save errors remain visible inside the active modal. Expired and denied login notices are explicit. Model catalog disappearance retains the selected model and renders its unavailable state.

## Verification

- Settings: 32 combinations (four sections × four widths × two themes), zero overflow and zero axe WCAG A/AA violations. Widths: 1440, 768, 390, 320.
- Contextual connections: eight theme/width combinations passed after waiting for theme colors to settle. Keyboard trapping and focus return passed.
- Authenticated local walkthrough: provider presets/protocol choices, app search/empty/Google setup, modal and mobile navigation focus, pending OAuth reload/cancel, real API key save/replace/disconnect, app configuration/reconfiguration/disconnect, advanced inference and unavailable model preservation.
- Explicit transport fault injection: permission denial, reload recovery and save errors inside both dialogs. These are presentation checks, not external provider acceptance.
- Engine regression: 21 passed, 1 skipped. The skip requires an opt-in pinned native image. Eight provider-auth cases include expiry, refresh, retry and identity boundaries; gateway/app cases cover restart, OAuth callbacks, tool selection and revocation.
- Web regression: 7 passed. Build and typecheck passed. Lint completed with three existing warnings in conversation files outside the substantive changes. Whitespace check passed.

Original failures remain in `*-first*` evidence and the environment failure log. The app tabs initially referenced absent tab panels; actual TabsContent panels fixed it. The first key-disconnect walkthrough exposed the `not_requested` wording defect and passed after repair. An initial OAuth test incorrectly expected the one-use authorization URL from status after reload; the corrected check verifies durable pending/cancel behavior. One app test tried a bearer method on OAuth-only Notion; it was corrected to the manifest-supported GitHub method. A dark desktop contrast measurement occurred during the theme transition; the settled-state check passed. Initial engine runner attempts used a relative interpreter path/missing test dependencies; the successful run uses the existing production interpreter with temporary test-only dependencies.

## Design adaptations and limits

Live application catalogs and account labels replace illustrative mockup names. The backend provides Notion, Linear, GitHub and Google Workspace; unsupported mockup apps and navigation destinations are not presented as working integrations. Account management remains the real Clerk user menu. Research/media and inference gaps use the same tokens, spacing, fields and progressive disclosure, rather than losing those existing controls. The existing Geist fallback remains in use; no Gellix asset was added.

This closes local redesign acceptance, not paid inference or OAuth consent on every external provider, remote revocation, native image acceptance, deployment or a manual screen-reader audit. Disposable QA connections were disconnected. No real user connection was changed. NMA-038 capability completeness and NMA-039/NMA-027 release gates remain separate. Screenshot comparisons establish visual evidence; runtime claims rely on the recorded functional checks and regressions.

Source design exports, screenshots, logs, results and their SHA-256 manifest are retained here. Browser runners are `scripts/verification/nma045-*.mjs` and require a private Clerk development storage state via `NMA045_STORAGE_STATE`.
