# Verification and limits

Date: 2026-11-01. Scope: retained research artifacts and the standalone local reference. No Ngertiin engine/backend/frontend application files changed. No Notion ticket status changed.

## Installed application

Eight captured states (R1–R8) are listed in [README](README.md). All eight were reached and captured through the installed OpenMausBot application using CUA. The app was already running at `http://127.0.0.1:8799/` inside its native window. The `/Applications` bundle, not the mounted installer copy, was selected.

This was visual/navigation observation. There was no live provider inference, message submission, agent/group creation, settings change, browser-agent launch, account linking, or data deletion in OpenMausBot. Its open menus/panels were closed at the end. Existing historical messages and an unsupported-model error were observed; those events were not reproduced.

REA static analysis: ASAR and a selected UI file set. UI denominator: 5 selected text files, 4 parsed JavaScript files, 0 parse failures; 147 other relevant files unselected. ASAR relationship expansion hit result constraints. No complete engine coverage, runtime registration, native behavior or provider result is claimed. Record IDs, limitations and parent coverage remain in retained JSON.

## Standalone reference browser review

Browser: Brave via connected CUA browser extension. Local server on loopback port8891. Default desktop screenshot1670×877; temporary phone viewport390×844. Phone override reset before handoff.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Initial Midnight desktop render with panel | Pass | screenshot09 |
| Switch to Daylight | Pass | screenshot10 and changed theme action label |
| Select Goals tab | Pass | selected tab + corresponding sample goal content |
| Phone contextual sheet | Pass | screenshot11 |
| Close phone sheet and return to chat | Pass | screenshot12 + collapsed profile control |
| Open phone navigation and select group | Pass | group header and matching sample opening |
| Restore desktop viewport | Pass | sidebar restored; viewport override reset |
| Create local group with name and selected Nara | Pass | local roster item + one automatic user opener; explicit no-backend message |
| Create local agent | Pass | one new sample identity + one automatic user opener |
| Attempt to submit sample draft | Pass | draft remains, local-only feedback appears |
| Console error/warning inspection | Pass | 0 returned entries for the observed window |

Denominator: **11/11 bounded scenarios passed**, 0 failed. No provider/API scenarios were attempted. This does not establish pixel equality, full accessibility/contrast compliance, real iOS keyboard behavior, production recovery, or Ngertiin UI acceptance. File/Routine content and placeholder settings actions are demonstration material; their complete interactions are not acceptance-tested. Local sample state resets on reload.

## Artifact checks

- HTML parser/unique ID check and JavaScript syntax check.
- Local Markdown link resolution, JSON parsing and gzip record parsing.
- Shipped CSS SHA-256 match and retained font/source attribution.
- 93/93 selected skin values match shipped CSS exactly. Against source, 92/93 match after whitespace/hex/leading-zero normalization; the remaining shadow alpha was minified to 8-bit hex and is retained as an explicit difference.
- Hash manifest verification and whitespace check for authored text; the exact copied minified shipped CSS, line-numbered source excerpts, and retained upstream notices are treated as immutable inputs.

Exact current check results are in [artifact-checks.json](evidence/artifact-checks.json). [SHA256SUMS](evidence/SHA256SUMS) covers the retained files, excluding itself. The manifest excludes itself and SHA256SUMS to avoid circular digests.

## Assets and provenance

Geist Latin and Geist Mono Latin WOFF2 files were copied unchanged from the selected installed app. [Geist OFL](assets/Geist-OFL.txt) was retrieved from the [official font repository](https://github.com/vercel/geist-font/blob/main/OFL.txt); its hash is retained. Fonts are optional reference assets with system fallback. [Upstream license](evidence/OpenMausBot-LICENSE.txt) and [notice](evidence/OpenMausBot-NOTICE.txt) were copied from the app. This preserves attribution; it does not represent a project-wide license audit.

The original full REA session export remains a temporary local file. The scoped UI Evidence record is retained completely as gzip within this package; ASAR findings are retained as a summary with explicit limits. No full source repository or user's application data directory was copied into Ngertiin.
