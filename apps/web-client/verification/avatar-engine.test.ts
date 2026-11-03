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
import { sampleAvatarLoading } from "../src/features/avatar/engine/loading";
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
    expect(new Set(identities.map((value) => value.color)).size).toBe(14);
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
  }, 30000);

  test("arbitrary seeds stay outside markup and rendering can use unique gradient IDs", () => {
    const config = createAvatar('<tag>"& seed');
    expect(renderAvatarSvg(config)).not.toContain('<tag>"& seed');
    expect(renderAvatarSvg(config, { id: 'one-"<>' })).toContain('id="one--clay"');
    expect(renderAvatarSvg(config, { id: "one" })).not.toContain('id="two-clay"');
    expect(renderAvatarSvg(config)).not.toContain("data-avatar-shadow");
  });

  test("default portraits use mouthless eyes and reject untrusted texture markup", () => {
    const config = createAvatar("fur-default");
    const svg = renderAvatarSvg(config);
    expect(svg).toContain('mask="url(#ngertiin-avatar-fur-mask)"');
    expect(svg).toContain('data-avatar-eye="left"');
    expect(svg).not.toContain("#293239");
    expect(() => renderAvatarSvg(config, { textureHref: '"><script/>' })).toThrow(
      "Invalid avatar texture.",
    );
    const expressions = Object.keys(avatarFaces).map((face) =>
      renderAvatarSvg({ ...config, face: face as AvatarFace }, { textureHref: "" }),
    );
    expect(new Set(expressions).size).toBe(8);
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

describe("Gravity overthinking loading", () => {
  test("one local timeline coordinates calm, intensity, recovery and reduced motion", () => {
    const calm = sampleAvatarLoading(1000);
    const peak = sampleAvatarLoading(6000);
    const recovered = sampleAvatarLoading(11000);
    expect(calm.face).toBe("calm");
    expect(peak.face).toBe("focused");
    expect(peak.veinOpacity).toBeGreaterThan(0.7);
    expect(recovered.face).toBe("calm");
    expect(recovered.veinOpacity).toBe(0);
    expect(sampleAvatarLoading(0)).toEqual(sampleAvatarLoading(12000));
    expect(sampleAvatarLoading(1000, true)).toEqual(sampleAvatarLoading(6000, true));
  });
  test("loading SVG includes both depth layers and veins without modifying the recipe", () => {
    const config = createAvatar("loading-test");
    const before = JSON.stringify(config);
    const svg = renderAvatarSvg(config, { loading: true });
    expect(svg).toContain('data-avatar-loading-rings="back"');
    expect(svg).toContain('data-avatar-loading-rings="front"');
    expect(svg).toContain('data-avatar-loading-veins=""');
    expect(renderAvatarSvg(config)).not.toContain("data-avatar-loading-veins");
    expect(JSON.stringify(config)).toBe(before);
  });
});
