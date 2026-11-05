import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CANVAS_SIZE = 1024;
const TILE_SIZE = 824;
const TILE_INSET = (CANVAS_SIZE - TILE_SIZE) / 2;

/** Generate application and template icons for the native host. */
export async function generateIcons(desktop: string): Promise<void> {
  const sharp = (await import("sharp")).default;
  const iconSource = join(desktop, "assets/app-icon-macos.png");
  const metadata = await sharp(iconSource).metadata();
  if (!metadata.width || metadata.width !== metadata.height)
    throw new Error("Application artwork must be square.");
  // Normalize the generated tile into one platform silhouette; alpha outside it never enters ICNS.
  const inset = Math.round(metadata.width * 0.09375);
  const edge = Math.round(metadata.width * 0.78125);
  const artwork = await sharp(iconSource)
    .extract({ left: inset, top: inset, width: edge, height: edge })
    .resize(TILE_SIZE, TILE_SIZE)
    .png()
    .toBuffer();
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"><rect x="${TILE_INSET}" y="${TILE_INSET}" width="${TILE_SIZE}" height="${TILE_SIZE}" rx="185" fill="#f5f1ea"/></svg>`,
  );
  const icon = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: "#00000000" },
  })
    .composite([
      { input: tile },
      { input: artwork, left: TILE_INSET, top: TILE_INSET },
      { input: join(desktop, "assets/macos-icon-mask.svg"), blend: "dest-in" },
    ])
    .png()
    .toBuffer();
  await writeFile(join(desktop, "dist/app-icon.png"), icon);
  if (process.platform === "darwin") {
    const iconset = join(desktop, "dist/app.iconset");
    await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await sharp(icon)
          .resize(size * scale, size * scale)
          .png()
          .toFile(join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`));
      }
    }
    const convert = Bun.spawn(
      [
        "/usr/bin/iconutil",
        "--convert",
        "icns",
        "--output",
        join(desktop, "dist/app.icns"),
        iconset,
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (await convert.exited) throw new Error("The macOS application icon could not be generated.");
  }
  // The menu bar uses a monochrome template in both system appearances.
  await writeFile(
    join(desktop, "dist/tray.png"),
    await sharp(
      Buffer.from(
        '<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg"><path d="M6 29V7h5l14 15V7h5v22h-5L11 14v15z" fill="black"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
  );
}
