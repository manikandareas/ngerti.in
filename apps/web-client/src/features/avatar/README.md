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

For product integration, persist the complete versioned `AvatarConfig` per agent and
reuse it in DM/group/sidebar contexts. Connect `state` to authoritative application
events. The studio currently stores its own recipe in browser localStorage; it does not
assign the recipe to an agent. Conversation integration and backend persistence are
future consumers of this engine, not implemented by the studio.

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
or assets are reused. Existing OpenMausBot avatar modules and workspace behavior remain
separate. The studio is a lazy-loaded route with no additional dependencies.

The active [product scope](https://app.notion.com/p/402abdd61873816e871ae24804345b56)
and [NMA-060 gate](https://app.notion.com/p/409abdd61873819b80c4dd2b3e593834) were read
live before implementation; the gate was Done. This work verifies a local avatar engine,
not harness inference, full conversation integration, installation or production release.
