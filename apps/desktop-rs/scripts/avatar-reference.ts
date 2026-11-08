// Development-only oracle; never imported by the native runtime.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  avatarActions,
  avatarColors,
  avatarFaces,
  avatarShapes,
  avatarStates,
} from "../../../packages/avatar/src/catalog";
import {
  type AvatarConfig,
  createAvatar,
  parseAvatarConfig,
  seedHash,
  seedRandom,
} from "../../../packages/avatar/src/config";
import { sampleAvatarLoading } from "../../web-client/src/features/avatar/engine/loading";
import { sampleAvatarPose } from "../../web-client/src/features/avatar/engine/motion";
import { faceForState, renderAvatarSvg } from "../../web-client/src/features/avatar/engine/render";

const root = resolve(import.meta.dir, "../../..");
const directory = resolve(root, "apps/desktop-rs/verification/nma-067");
await mkdir(directory, { recursive: true });
const sources = [
  "packages/avatar/src/catalog.ts",
  "packages/avatar/src/config.ts",
  ...["render", "motion", "loading", "controller", "texture"].map(
    (s) => `apps/web-client/src/features/avatar/engine/${s}.ts`,
  ),
];
const hashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (p) => [
      p,
      createHash("sha256")
        .update(await readFile(resolve(root, p)))
        .digest("hex"),
    ]),
  ),
);
const recipes: AvatarConfig[] = [
  "tobi-circle",
  "🌿a",
  "é",
  "é",
  "日本語",
  "<script>&\"'",
  "a".repeat(128),
  "🦊".repeat(64),
].map((seed) => createAvatar(seed));
for (const shape of Object.keys(avatarShapes))
  recipes.push(createAvatar(`shape-${shape}`, { shape: shape as AvatarConfig["shape"] }));
for (const color of Object.keys(avatarColors))
  recipes.push(createAvatar(`color-${color}`, { color: color as AvatarConfig["color"] }));
for (const face of Object.keys(avatarFaces))
  recipes.push(createAvatar(`face-${face}`, { face: face as AvatarConfig["face"] }));
const cases = recipes.map((recipe) => {
  const random = seedRandom(recipe.seed);
  const samples = Array.from({ length: 16 }, () => random());
  const source = renderAvatarSvg(recipe, { id: "avatar" });
  const fibers = [
    ...source.matchAll(
      /<path d="M([\d.-]+) ([\d.-]+)q([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)" stroke="([^"]+)" stroke-opacity="([^"]+)" stroke-width="([^"]+)" stroke-linecap="round"\/>/g,
    ),
  ].map((m) => ({
    x: +m[1],
    y: +m[2],
    cx: +m[3],
    cy: +m[4],
    dx: +m[5],
    dy: +m[6],
    light: m[7] === "#fff7e8",
    opacity: +m[8],
    width: +m[9],
  }));
  if (fibers.length !== 8500) throw new Error("Oracle fiber count changed");
  // Spacing is independent of the face; obtain it directly from the same seeded contract.
  const r = seedRandom(recipe.seed);
  const identity = {
    spacing: +(16 + r() * 5).toFixed(2),
    lean: +((r() - 0.5) * 5).toFixed(2),
    width: +(0.96 + r() * 0.08).toFixed(3),
    height: +(0.97 + r() * 0.06).toFixed(3),
  };
  const canonical = fibers
    .map(
      (f) =>
        `${[
          f.x.toFixed(2),
          f.y.toFixed(2),
          f.cx.toFixed(2),
          f.cy.toFixed(2),
          f.dx.toFixed(2),
          f.dy.toFixed(2),
          f.light ? "1" : "0",
          f.opacity.toFixed(10),
          f.width.toFixed(2),
        ].join(",")}\n`,
    )
    .join("");
  const fiberDigest = createHash("sha256").update(canonical).digest("hex");
  return {
    recipe,
    created: createAvatar(recipe.seed),
    hash: seedHash(recipe.seed),
    samples,
    identity,
    fiberDigest,
    fibers: [0, 1, 5499, 5500, 8499].map((index) => ({ index, ...fibers[index] })),
  };
});
const base = createAvatar("parse");
const invalid = [
  null,
  {},
  { ...base, version: 2 },
  { ...base, seed: "" },
  { ...base, seed: "a".repeat(129) },
  { ...base, seed: "🦊".repeat(65) },
  { ...base, shape: "__proto__" },
  { ...base, color: "unknown" },
  { ...base, face: "unknown" },
];
const parseCases = [...recipes, { ...base, version: 1.0 }, ...invalid].map((value) => ({
  value,
  valid: parseAvatarConfig(value) !== null,
}));
const times = [0, 1, 2100, 2155, 2163, 2290, 3599, 3600, 3620, 6200, 10000, 12000, 18200, 25990];
const poses = Object.keys(avatarStates).flatMap((state) =>
  times.flatMap((time) =>
    [false, true].map((reduced) => ({
      time,
      state,
      reduced,
      pose: sampleAvatarPose(time, state as keyof typeof avatarStates, undefined, reduced),
    })),
  ),
);
const actions = Object.keys(avatarActions).flatMap((action) =>
  [-0.1, 0, 0.25, 0.5, 0.999, 1].map((progress) => ({
    action,
    progress,
    pose: sampleAvatarPose(3400, "idle", { type: action as keyof typeof avatarActions, progress }),
  })),
);
const loading = [
  -1, 0, 2999, 3000, 4559, 4560, 5400, 7800, 8160, 9600, 11999, 12000, 24000,
].flatMap((time) =>
  [false, true].map((reduced) => ({ time, reduced, sample: sampleAvatarLoading(time, reduced) })),
);
await writeFile(
  resolve(directory, "avatar-reference.json"),
  `${JSON.stringify({
    version: 1,
    catalog: { shapes: avatarShapes, colors: avatarColors },
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sources: hashes,
    cases,
    parseCases,
    poses,
    actions,
    loading,
    faceMapping: Object.keys(avatarStates).flatMap((state) =>
      Object.keys(avatarFaces).map((face) => ({
        state,
        face,
        result: faceForState(face as keyof typeof avatarFaces, state as keyof typeof avatarStates),
      })),
    ),
  })}\n`,
);
// Original transparent exports supplement numeric vectors and carry all original filters.
await writeFile(
  resolve(directory, "reference-tobi.svg"),
  renderAvatarSvg(createAvatar("tobi-circle", { shape: "circle", color: "lilac", face: "calm" }), {
    id: "avatar",
  }),
);
console.log(
  `Recorded ${cases.length} recipes / ${cases.length * 8500} fibers, ${poses.length} poses, ${actions.length} actions, ${loading.length} loading samples.`,
);
