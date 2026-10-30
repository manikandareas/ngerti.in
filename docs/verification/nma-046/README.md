# Integrated web redesign acceptance

Local redesign delivery for NMA-046, 29 October 2026 (Asia/Makassar). Planning baseline: `41da6eb`; implementation started at `12903c4` with the existing uncommitted NMA-045 delivery. Those changes and their evidence were preserved. No deployment or push was performed.

The live Notion ticket, redesign coverage specification and all four dependency tickets were read. NMA-042–045 were Done. Knowledge-graph tools were unavailable; discovery used local source and the retained dependency evidence. The active design source remains `docs/agent.pen`, read through Pencil. Its 89 top-level boards were inventoried live: 15 foundation boards and 74 application/component screens. The artifact was not modified. A later export attempt hit the Pen plan limit; no workaround was attempted. Previously retained source exports are linked per screen in `coverage.json`.

## Design corrections

- Restored the quiet conversation header: centered identity, two icon actions, and the existing resources behind an accessible Opsi disclosure. Goals, memory/skills, workspace, computer, connections, session controls and artifacts remain reachable. Resource dialogs remain siblings rather than nested modal layers, preserving focus return.
- Matched the inspected desktop dimensions: 344 px sidebar, 1086 px inset surface, 92 px header, 66 px conversation rows, 766 × 68 px composer. Mobile retains the 58 px header and 48 px composer, with the separate attachment affordance and centered identity. Geist, the active neutral palette, shell gradient and dark tokens are retained.
- Matched 15 px message typography, 10 px conversation spacing and 12 px bubbles. DMs omit repeated visible author avatars/names; accessible author labels remain. Groups retain visible author identity.
- Preserved drafts, multiline input, mentions, upload/recording, attachments, send/steer guards, pending command identities and recovery. Send appears when there is content to send; idle microphone and attachment controls follow the canvas. Long text grows up to the existing 192 px ceiling.
- Repaired the component catalog's server-side `document` access. Repaired Clerk footer contrast without removing branding or its development notice. Kept the default Streamdown code controls while making overflowing code and tables keyboard accessible.

`visual-comparison-results.json` records browser geometry against the inspected canvas. `final-dm-{theme}-{width}.png` is the final visual set. Compare with `../nma-042/design-reference/eIiDQ.png`, `JNgIa.png`, `cgLON.png`, and `Su5O0.png`. Other feature comparisons retain their NMA-042–045 source exports and scoped walkthroughs. Screenshots contain real QA account state, so illustrative copy and message lengths differ; a pixel-difference score would not establish fidelity or runtime correctness.

## Coverage and verification

`coverage.json` maps all 8 route files, 107 inherited action rows and 89 design boards to their owner, implementation/entry and evidence. There are zero unmapped rows. The route/action inventory was refreshed from `41da6eb`; all 25 baseline command/event literals remain present. Literal retention is a supplementary static check, not proof that every action executed. Existing HTTP/provider forms and domain sub-actions are covered by the detailed NMA-042–045 mappings and scoped evidence, rather than by a fabricated new denominator.

- `browser-results.json`: integrated authenticated route/resource matrix at 1440/390/320/768 in both themes, real upload/preview/removal, drafts, mobile search, keyboard trapping and focus return, and 720 px reflow equivalent to a 1440 px viewport at 200% zoom. The broad run retains one navigation transition-time contrast failure and one catalog SSR error; both have passing targeted rechecks. Physical browser zoom and manual assistive-technology certification were not performed.
- `states-results.json`: real signed-out Clerk sign-in/sign-up and explicitly labelled empty/loading/permission/long-content presentation fixtures. Forty checks passed; eight long-code checks initially failed. `long-content-recheck-results.json` contains all eight passing repairs. Accessibility trees are retained for auth and long content.
- `ssr-navigation-recheck-results.json`: 13 passing checks, including the catalog on all theme/width combinations and settled mobile navigation; no browser/SSR errors.
- `visual-comparison-results.json`: final theme/width geometry, overflow and axe checks after the last spacing correction.
- `presentation-results.json`: eight passing checks for uncertain results without blind retry, task/subagent disclosure, reduced motion, archived read-only state and permission recovery. These are transport fixtures, not provider execution evidence.
- `integration-results.json`: three passing checks for a real provider reply, convergence across two tabs without duplicate publication, refresh identity retention, and offline draft/reconnect behavior. Final verification reused the already completed QA message after correcting a selector; it did not replay the failed external intents.
- `runtime-regression.log`: 21 passed against the actual pinned local gateway with deterministic provider fixtures, covering conversations/read state, groups/privacy, replay/cancellation and files. `web-tests.log`: seven projection regressions passed. Build, typecheck, lint and whitespace checks passed.

Final acceptance is assembled from the broad runs and explicit passing rechecks in `acceptance-results.json`. Failed attempts are retained and are not counted as passes. The SHA-256 manifest covers retained evidence, including inherited evidence files referenced by the coverage map where present.

## Failures and recovery

Original upload selection used the visible label instead of the filename-qualified accessible label; it passed after correction. A navigation contrast check ran during the opening animation and passed after waiting for settled colors. Clerk's footer decoration produced an insufficient contrast background; the semantic surface and notice colors now pass. The long-code fixture identified a real keyboard scrolling defect, repaired through Streamdown's default component composition.

An initial provider check treated an unassigned run as matching the welcome message, then asserted before the reply completed. The runner now waits for a concrete run and terminal success. During later verification the local API/provisioner stopped; default restart regenerated the QA capability file without its earlier native-image/coding configuration. Admissions then failed with ACCESS_REVOKED/RUNTIME_FAILED. The exact prior isolated QA configuration was restored from the retained NMA-044 backup and original setup recipe, without changing product runtime code, agent revisions or data. `environment-recovery.json` records this boundary. A subsequent successful reply was initially reported as failed because the selector matched both sidebar preview and transcript; the final scoped selector recheck passed. Earlier failed messages and logs are preserved.

## Design adaptations and remaining boundaries

Live identities, account names, real provider/app catalogs, runtime-authored messages and user content replace illustrative canvas data. Header resource disclosure extends the canvas's compact settings action. Agent/group configuration, auth/root errors and advanced settings use shared shadcn primitives where dedicated screens are incomplete.

Calendar agendas, direct goal/date controls, unsupported integrations, group description/notification/privacy fields, webhook status and portable configuration are not fabricated. Existing conversational goal management remains automatic; missing contracts remain NMA-038 scope. Full source details and per-feature adaptations remain in the dependency reports. No new engine, lifecycle owner, approval gate or blind retry was introduced.

Local redesign acceptance does not prove all remote OAuth/provider consent, native tool families, microphone hardware/transcription providers, manual screen-reader use, production SLOs or deployment readiness. The inherited native-image skip and other original dependency limitations remain attached to their evidence. NMA-038 capability completion and NMA-039/NMA-027 operational/release gates remain separate.

Runners are `scripts/verification/nma046-*.mjs` and `nma046-coverage.py`. Browser runners require a private Clerk development storage state via `NMA046_STORAGE_STATE`; credentials and storage state are not retained in this directory. Use only an isolated QA account. The integration runner can recheck a completed QA publication with `NMA046_REUSE_MARKER`.
