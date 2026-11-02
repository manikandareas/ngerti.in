import type { AvatarState } from "./catalog";
import type { AvatarConfig } from "./config";
import { renderAvatarSvg } from "./render";

export function downloadAvatarFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PNG and SVG exports are still portraits; motion remains in the runtime engine. */
export async function exportAvatar(
  config: AvatarConfig,
  format: "svg" | "png",
  state: AvatarState = "idle",
): Promise<void> {
  const source = renderAvatarSvg(config, { state }).replace(
    'width="200" height="200"',
    'width="512" height="512"',
  );
  const svg = new Blob([source], { type: "image/svg+xml" });
  const filename = `ngertiin-${config.shape}-${config.color}`;
  if (format === "svg") {
    downloadAvatarFile(svg, `${filename}.svg`);
    return;
  }
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is unavailable in this browser.");
    context.drawImage(image, 0, 0, 512, 512);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not export the avatar image."))),
        "image/png",
      ),
    );
    downloadAvatarFile(png, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
