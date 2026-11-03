import type { AvatarConfig } from "./config";
import { renderAvatarSvg } from "./render";

// Keep fur off the animation paint path. Face/state changes reuse the same pixels.
const textures = new Map<string, Promise<string>>();
let rasterization: Promise<unknown> = Promise.resolve();

export function furTextureKey(config: AvatarConfig): string {
  return JSON.stringify([config.seed, config.shape, config.color]);
}

export function loadFurTexture(config: AvatarConfig, textureSize = 768): Promise<string> {
  const key = `${furTextureKey(config)}:${textureSize}`;
  const cached = textures.get(key);
  if (cached) return cached;
  // Yield before building the fur SVG and decode one surface at a time. A large
  // roster must not block the first conversation paint or flood the image decoder.
  const pending = rasterization
    .then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return rasterize(config, textureSize);
    })
    .catch((error) => {
      if (textures.get(key) === pending) textures.delete(key);
      throw error;
    });
  rasterization = pending.catch(() => {});
  textures.set(key, pending);
  const oldest = textures.keys().next().value;
  if (textures.size > 16 && oldest !== undefined) textures.delete(oldest);
  return pending;
}

async function rasterize(config: AvatarConfig, textureSize: number): Promise<string> {
  const source = renderAvatarSvg(config, { surfaceOnly: true });
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = textureSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Avatar texture canvas unavailable.");
    context.drawImage(image, 0, 0, textureSize, textureSize);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
