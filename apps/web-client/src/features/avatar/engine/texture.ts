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
  const source = renderAvatarSvg(config, { surfaceOnly: true }).replace(
    'width="200" height="200"',
    `width="${textureSize}" height="${textureSize}"`,
  );
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  let bitmap: ImageBitmap | undefined;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (typeof createImageBitmap === "function")
      bitmap = await createImageBitmap(image).catch(() => undefined);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = textureSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Avatar texture canvas unavailable.");
    context.drawImage(bitmap ?? image, 0, 0, textureSize, textureSize);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Avatar texture encoding failed."))),
        "image/png",
      ),
    );
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Avatar texture could not be read."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap?.close();
    URL.revokeObjectURL(url);
  }
}
