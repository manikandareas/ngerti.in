import { describe, expect, test } from "bun:test";
import {
  type AvatarAction,
  type AvatarColor,
  type AvatarFace,
  type AvatarShape,
  type AvatarState,
  avatarActions,
  avatarColors,
  avatarFaces,
  avatarShapes,
  avatarStates,
} from "../src/features/avatar/engine/catalog";
import { createAvatar, parseAvatarConfig } from "../src/features/avatar/engine/config";
import { sampleAvatarPose } from "../src/features/avatar/engine/motion";
import { faceForState, renderAvatarSvg } from "../src/features/avatar/engine/render";

describe("Ngertiin avatar engine", () => {
  test("seeded identities and persisted recipes reproduce exactly", () => {
    expect(Object.keys(avatarShapes)).toEqual([
      "circle",
      "oval",
      "squircle",
      "capsule",
      "triangle",
      "diamond",
      "pentagon",
      "hexagon",
    ]);
    const config = createAvatar("agent-42");
    expect(createAvatar("agent-42")).toEqual(config);
    expect(parseAvatarConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(renderAvatarSvg(config)).toBe(renderAvatarSvg(createAvatar("agent-42")));
    const identities = Array.from({ length: 400 }, (_, i) => createAvatar(`agent-${i}`));
    expect(new Set(identities.map((value) => value.shape)).size).toBe(8);
    expect(new Set(identities.map((value) => value.color)).size).toBe(20);
  });

  test("rejects unsupported versions and malformed recipes at import boundaries", () => {
    const config = createAvatar("agent");
    for (const input of [
      null,
      [],
      {},
      { ...config, version: 2 },
      { ...config, seed: "" },
      { ...config, seed: "a".repeat(129) },
      { ...config, shape: "__proto__" },
      { ...config, shape: "cat" },
      { ...config, color: "unknown" },
      { ...config, face: "unknown" },
    ]) {
      expect(parseAvatarConfig(input)).toBeNull();
    }
    expect(() => createAvatar("")).toThrow("Invalid avatar recipe.");
    expect(parseAvatarConfig({ ...config, extra: "ignored" })).toEqual(config);
  });

  test("renders all 1280 shape/color/face combinations without invalid coordinates", () => {
    let count = 0;
    for (const shape of Object.keys(avatarShapes) as AvatarShape[]) {
      for (const color of Object.keys(avatarColors) as AvatarColor[]) {
        for (const face of Object.keys(avatarFaces) as AvatarFace[]) {
          const svg = renderAvatarSvg(createAvatar("render-cohort", { shape, color, face }));
          expect(svg).toContain('viewBox="0 0 200 200"');
          expect(svg).toContain(avatarShapes[shape].path);
          expect(svg).toContain(avatarColors[color].base);
          expect(svg).not.toMatch(/NaN|Infinity|undefined/);
          expect(svg).not.toContain("-blush");
          expect(svg).toContain("-sheen");
          count++;
        }
      }
    }
    expect(count).toBe(1280);
    expect(new Set(Object.values(avatarShapes).map((value) => value.path)).size).toBe(8);
  });

  test("arbitrary seeds stay outside markup and rendering can use unique gradient IDs", () => {
    const config = createAvatar('<tag>"& seed');
    expect(renderAvatarSvg(config)).not.toContain('<tag>"& seed');
    expect(renderAvatarSvg(config, { id: 'one-"<>' })).toContain('id="one--clay"');
    expect(renderAvatarSvg(config, { id: "one" })).not.toContain('id="two-clay"');
    expect(renderAvatarSvg(config)).not.toContain("data-avatar-shadow");
  });

  test("all states and actions have finite poses and honor reduced motion", () => {
    const neutral = sampleAvatarPose(0, "idle", undefined, true);
    for (const state of Object.keys(avatarStates) as AvatarState[]) {
      for (const type of Object.keys(avatarActions) as AvatarAction[]) {
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const pose = sampleAvatarPose(2000, state, { type, progress });
          expect(Object.values(pose).every(Number.isFinite)).toBe(true);
          expect(pose.scaleX).toBeGreaterThan(0);
          expect(pose.scaleY).toBeGreaterThan(0);
          expect(sampleAvatarPose(2000, state, { type, progress }, true)).toEqual(neutral);
        }
        expect(sampleAvatarPose(2000, state, { type, progress: 1 })).toEqual(
          sampleAvatarPose(2000, state),
        );
      }
    }
    expect(faceForState("happy", "idle")).toBe("happy");
    expect(faceForState("happy", "sleeping")).toBe("sleepy");
    expect(faceForState("calm", "celebrating")).toBe("excited");
  });
});
