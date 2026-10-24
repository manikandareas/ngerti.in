# Production component browser walkthrough

Local Chromium via agent-browser. Real FastAPI/native gateway, fixed authenticated test account and controlled model. Production Clerk/login/deployment is not exercised.

- Created Researcher and Reviewer through the actual agent dialog; writer was seeded with a real scoped artifact. Saved list showed all three.
- Created Research collaboration with three checkboxes through the production group dialog and sent a multi-mention message. Author entries for all three appeared. Echo fixture intentionally produced long messages; native discussion bound became visible.
- Desktop 1440x1100 and mobile 390x844 had no horizontal overflow.
- Opened writer DM on mobile, expanded File hasil and downloaded laporan.md. Bytes match the gateway-published report.
- Sent BLOCK_STARTED, observed working state, clicked Hentikan jawaban and observed Dihentikan.
- Sent FAIL_PROVIDER, observed Jawaban gagal diselesaikan and the recovery instruction.
- Reloaded; the same six message/activity rows remained, with no duplicate user/agent messages.

Screenshots: agents-desktop.png, agent-create-desktop.png, group-desktop.png, group-mobile.png, artifact-mobile.png, artifact-desktop.png, stop-mobile.png, error-desktop.png. Download: downloaded-report.md.

Initial automation at 1280x720 did not save an off-screen dialog control. The interaction was repeated with the control visible at 1440x1100 and the persisted list was verified. The first automation daemon was closed; the final named session and both harness processes were stopped. No product bug was inferred from the automation miss.
