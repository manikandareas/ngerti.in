import {
  type AvatarColor,
  type AvatarFace,
  type AvatarShape,
  avatarColors,
  avatarFaces,
  avatarShapes,
} from "./catalog";

export interface AvatarConfig {
  version: 1;
  seed: string;
  shape: AvatarShape;
  color: AvatarColor;
  face: AvatarFace;
}

export function seedHash(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seedRandom(seed: string): () => number {
  let value = seedHash(seed);
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function isKey<T extends object>(object: T, value: unknown): value is keyof T {
  return typeof value === "string" && Object.hasOwn(object, value);
}

/** Read a versioned recipe at storage/import boundaries. Unknown versions are rejected. */
export function parseAvatarConfig(value: unknown): AvatarConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (
    config.version !== 1 ||
    typeof config.seed !== "string" ||
    config.seed.length < 1 ||
    config.seed.length > 128 ||
    !isKey(avatarShapes, config.shape) ||
    !isKey(avatarColors, config.color) ||
    !isKey(avatarFaces, config.face)
  )
    return null;
  return {
    version: 1,
    seed: config.seed,
    shape: config.shape,
    color: config.color,
    face: config.face,
  };
}

/** The same seed always makes the same identity, including its subtle face proportions. */
export function createAvatar(
  seed: string,
  overrides: Partial<Pick<AvatarConfig, "shape" | "color" | "face">> = {},
): AvatarConfig {
  const random = seedRandom(seed);
  const pick = <T extends string>(values: T[]) => values[Math.floor(random() * values.length)];
  const config = parseAvatarConfig({
    version: 1,
    seed,
    shape: pick(Object.keys(avatarShapes) as AvatarShape[]),
    color: pick(Object.keys(avatarColors) as AvatarColor[]),
    face: pick(Object.keys(avatarFaces) as AvatarFace[]),
    ...overrides,
  });
  if (!config) throw new Error("Invalid avatar recipe.");
  return config;
}
