# Avatar/chat scoped commit verification · 2026-11-02

Scope: persistent procedural agent avatars, activity projection, per-agent studio saves,
group portraits/author labels, and stored local timestamps for both authors in DM/group.
The pending conversation-preview/sidebar/drawer changes and API 1.20.0 are excluded.

A separate checkout at a62cb93 containing only the selected changes passed server lint,
typecheck and 273 tests; frontend lint/build; six engine/activity tests; six in-process
HTTP/SSE/replay/restart checks; 38 desktop/mobile conversation/model/rich-answer cases;
and four native-protocol-fixture chronology/recovery cases. The 1.19.0 contract regenerated
byte-identically and both retained evidence manifests were verified.

During verification, the existing settings-dialog change was independently committed as
2db64ff. It is preserved as the final parent. The scoped checkout was updated to that
parent without including pending sidebar work; frontend lint/build and the four
model/provider browser cases passed again. The backend slice is unchanged by that parent.

Global docs-check fails on 88 historical broken links on both a62cb93 and the selected
changes, with no added or removed failures. These retired-runtime/archive references were
left outside this commit. Existing evidence captures remain byte-for-byte unchanged.
No fresh provider inference, deployment, data reset or push is claimed.
