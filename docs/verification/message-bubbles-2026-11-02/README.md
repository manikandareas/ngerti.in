# Message bubble metadata · 2026-11-02

Group agent messages show the clickable agent name at the top of the bubble and a
24-hour timestamp at the bottom right, with the avatar outside the left edge. Plain
and rich replies retain one author/time container; native interaction boundaries
remain in their original order. Name color follows the identity with foreground mixing
for contrast. Code blocks inside group bubbles use the theme background for readable
syntax colors in the light theme.

Agent messages in DMs and user messages in both DMs and groups also show timestamps.
Every timestamp comes from the message's stored `created_at`, uses the browser's local
timezone and Indonesian `HH.mm` formatting, and keeps the full date in a tooltip and
machine-readable `datetime`. Refresh/streaming never replace it with the current clock.
User timestamps inherit the bubble foreground; agent timestamps use the muted text token.

Final main browser cohort: **34 passed, zero failed**, desktop/mobile. This covers the
four author/channel combinations, persisted user timestamps, group author/profile clicks,
long names, rich tables/code, light/dark contrast, 320px overflow, activity, creation,
queue/replay and rich-message regressions. Typecheck, isolated Vite build, scoped Biome
checks and `git diff --check` pass. A shared-fixture queue assumption was corrected by
using a fresh DM per timestamp scenario. The initial code-block contrast issue is fixed.

Tests used separate ports 4367/8367 and a frozen build in `/tmp/ngertiin-group-bubble-dist`
because unrelated sidebar/settings work was running concurrently. Its changes were
preserved. API/SQLite/SSE are real isolated services; assistant/native output is fixture
content. This is local UI evidence, not a provider/native-inference or release claim.
The earlier avatar integration evidence remains unchanged.

An additional **4/4 native protocol-fixture browser cases** pass on desktop/mobile:
lost acknowledgement, completion/reload/revocation, and Markdown anchor chronology. The
first attempt stopped at a stale sidebar selector tied to the former harness subtitle;
the helper now locates the exact agent-name child independently of the live preview.
The chronology assertion also targets message text independently of its new timestamp.
Final total: **38 browser checks passed**, zero failures in the final cohorts. These
use controlled native protocol fixtures, not live provider inference.

Reproduce when the standard test ports are free:

```sh
cd apps/web-client
bun run build
bunx playwright test --config playwright.conversation.config.ts agent-avatar.spec.ts conversation.spec.ts rich-answer.spec.ts
bunx playwright test --config playwright.work.config.ts --grep 'native acknowledgements survive|unsafe Markdown cuts'
```

- [Group desktop](group-desktop.png)
- [Group at 320px](group-320.png)
- [DM timestamps for both authors](dm-times.png)
- [Dark group with rich content](group-rich-dark.png)
- [Results](verification.json)
