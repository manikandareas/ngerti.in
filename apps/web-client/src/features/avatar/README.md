# Ngertiin avatar engine

A procedural SVG renderer and browser animation engine for persistent agent identities.
Open `/avatar-studio` in the web client to design, preview, save and export a character.

The catalog includes exactly eight silhouettes: circle, oval, rounded square, capsule,
triangle, diamond, pentagon and hexagon. Their contours are deliberately a little uneven,
with stable seeded tilt and proportions. There are 20 solid colors, eight expressions,
seven activity states and six temporary reactions.
White surface highlights and colored shading preserve volume; faces have no cheek blush.

## Engine API

The `engine/` modules are independent of React and require no animation dependencies.
The catalog and recipe functions live in the dependency-free `@ngertiin/avatar` workspace
package shared by server and browser; the engine paths re-export them for existing consumers.
`createAvatar` and `renderAvatarSvg` can run without a browser. Mounting, animation and
downloads require the DOM.

```ts
import { createAvatar } from "./engine/config";
import { mountAvatar } from "./engine/controller";

const config = createAvatar("persistent-agent-id", {
  shape: "circle",
  color: "lilac",
  face: "calm",
});
const avatar = mountAvatar(element, config, {
  state: "idle",
  followPointer: true,
  shadow: true,
});

avatar.setState("thinking");
avatar.play("wave");
avatar.lookAt(0.5, -0.5); // Normalized, bounded gaze.
avatar.setConfig(config);
avatar.dispose(); // Required before removing its host.
```

The engine owns the contents of its host. `followPointer` observes the document pointer;
enable it for a prominent avatar rather than every thumbnail. An idle avatar uses its
saved expression. Activity states temporarily choose an appropriate expression without
changing the recipe: `listening`, `thinking`, `working`, `celebrating`, `sleeping`, `error`.
Reactions are `boop`, `wave`, `hop`, `wiggle`, `spin`, and `wink`.

All visible animated instances share one 30fps animation clock. Offscreen instances stop
drawing, hidden documents suspend the clock, and reduced motion produces a static pose.
State/expression changes and configuration remain usable with reduced motion. Use
`animated: false` for static thumbnails. Disposal removes clock subscriptions, observers
and pointer listeners; the last subscriber also releases shared listeners.

## React integration

```tsx
import { useMemo } from "react";
import { AgentAvatar } from "./components/agent-avatar";
import { createAvatar } from "./engine/config";

function AgentPortrait({ agentId }: { agentId: string }) {
  const config = useMemo(() => createAvatar(agentId), [agentId]);
  return <AgentAvatar config={config} state="listening" size={64} label="Tobi" />;
}
```

Pass a React ref to access the controller's `play` and `lookAt` methods. Omit `label` when
the avatar is decorative or its parent already provides an accessible name. The React
wrapper owns mounting/disposal; animation updates SVG attributes without React renders.

Agent integration persists the complete versioned recipe in `agent.avatar_config`.
New agents receive a seeded identity; Tobi starts as the lilac circle. Existing records
without a recipe use the same deterministic defaults until a recipe is saved. No data reset
or inference is required. The former text/emoji `avatar` field remains a legacy field;
procedural identity uses `avatar_config`, including scoped product-tool updates.

Open `/avatar-studio?agent=<id>` directly to edit an agent avatar. The editor
loads that agent's current recipe and saves through the revision-checked configuration
command. Conflict or uncertain acknowledgement remains an explicit error; edits never
silently overwrite a newer profile. Without an agent target, the studio still stores its
standalone recipe in localStorage and supports the original import/export workflow.

Conversation identity uses the engine for Tobi, DM/group headers, sidebar entries, member
profiles, creation choices, browser placeholders and user-input/approval cards. Group agent
messages have a profile button outside the left edge of the reply. Completed-message portraits
stay still; active portraits follow activity. Prominent profile portraits follow the pointer
and respond to a click with `boop`; header/message clicks retain their navigation behavior.

Contract **1.19.0** adds authenticated `GET /v1/agents/activity`: a read-only owner projection
with at most one activity per current agent/thread membership, without transcript or native
question contents. Active work takes precedence over queued inputs. Routing-only threads and
removed memberships are excluded. The client refreshes it through the existing event/replay
connection, preserving the earlier cursor when a concurrent snapshot is newer.

Generation maps to `thinking`, tools to `working`, pending user requests to `listening`,
and failed/unknown outcomes to the attention pose with distinct text. Stop intent stays
`working` with “Stop diminta”; it never claims confirmed stop. A newly observed success
celebrates briefly once, while history/reload does not replay it. Typing into an idle
conversation produces a local listening pose. Activity remains thread-specific even when
the same identity appears in a DM and group. Closing the tab suspends rendering, not work;
it never puts a backend agent to sleep.

## Recipes and exports

`parseAvatarConfig(unknown)` validates imported/stored recipes and rejects unknown
versions and catalog entries. Recipes include `version: 1`, `seed`, `shape`, `color`,
and `face`. The seed determines stable face proportions, freckles and character body
variations. Each silhouette remains recognizable while its contour and seeded proportions
avoid perfect symmetry.

`renderAvatarSvg(config, { state, id })` generates a transparent standalone SVG. Supply
distinct `id` values when embedding several generated SVGs in one document. User seeds
are hashed and never interpolated into SVG markup. The mounted renderer assigns its
own unique gradient IDs.

`exportAvatar(config, "png" | "svg", state)` downloads a transparent 512px still portrait
of the current state. Motion runs in the engine; these exports are static. Studio recipe
downloads/imports preserve the identity and remain separate from image exports.

## Verification

From `apps/web-client`:

```sh
bun run lint
bun run typecheck
bun run test:avatar
```

The five engine tests cover deterministic identities, recipe validation, all 1,280
shape/color/face combinations, safe SVG construction, state expressions and finite
motion samples. The browser suite covers desktop/mobile editing and keyboard control,
state/reaction behavior, reload/import round trips, PNG dimensions/transparency, SVG
exports, reduced motion, offscreen suspension, light/dark accessibility and overflow at
320/390/768/1440px. Screenshots/report are written under `.dev/avatar-playwright*`.

## Reference and scope

Interaction reference: [Grok Bots Studio](https://grokbots.ai/studio), observed on
2026-11-02 for shape/face/color controls, pointer response, motion and image export.
All engine source and silhouette paths here are authored locally; no Grok source code
or assets are reused. Existing OpenMausBot avatar source remains retained as reference; product identities now
use this engine. The studio is lazy-loaded and adds no third-party animation dependencies.

The active [product scope](https://app.notion.com/p/402abdd61873816e871ae24804345b56)
and [NMA-060 gate](https://app.notion.com/p/409abdd61873819b80c4dd2b3e593834) were read
live before implementation; the gate was Done. This work verifies a local avatar engine,
not harness inference, installation or production release. Agent integration evidence and
the distinction between real HTTP persistence and simulated native activity are recorded in
`docs/verification/avatar-agents-2026-11-02/README.md`.
