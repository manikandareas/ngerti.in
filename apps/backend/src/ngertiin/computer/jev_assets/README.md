Snapshot adapted from browser-use/jev-ultrafast, commit
1231850a0bf1a0c0341fe408ef1668dbbfdfac46 (MIT; adjacent LICENSE).
Changes: private-field barrier, 1280x720 viewport supplied by Ngertiin, and
host-owned prepare/approval/receipt lifecycle instead of upstream Agent.run.
Browser Harness 0.1.13 is pinned in the desktop template. No model credentials
are uploaded to the sandbox. Raw page snapshots are transient.

`target_context.js` is Ngertiin's fixed metadata inspector shared by DOM and
screenshot targeting. It exports semantic attributes/labels, never input values.
The backend classifies routine reads/search versus approval/private takeover;
the model cannot grant itself permission through an Action field.
