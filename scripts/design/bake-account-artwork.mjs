import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Authoring only: uses the existing desktop image dependency, never the application runtime.
const require = createRequire(new URL("../../apps/desktop/package.json", import.meta.url));
const sharp = require("sharp");
const directory = fileURLToPath(
  new URL("../../apps/web-client/public/images/sign-in/", import.meta.url),
);
const width = 768,
  height = 1152,
  cell = 7,
  fps = 24,
  frames = 60;
const photo = await sharp(`${directory}/retro-office.webp`)
  .resize(width, height)
  .removeAlpha()
  .raw()
  .toBuffer();
const columns = Math.ceil(width / cell),
  rows = Math.ceil(height / cell);
const samples = new Float32Array(columns * rows * 3);
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    const sum = [0, 0, 0];
    let count = 0;
    for (let y = row * cell; y < Math.min(height, (row + 1) * cell); y++) {
      for (let x = column * cell; x < Math.min(width, (column + 1) * cell); x++) {
        const offset = (y * width + x) * 3;
        for (let channel = 0; channel < 3; channel++) sum[channel] += photo[offset + channel];
        count++;
      }
    }
    for (let channel = 0; channel < 3; channel++)
      samples[(row * columns + column) * 3 + channel] = sum[channel] / count;
  }
}

// Rounded sampled cells, soft bloom and a clear photographic underlay preserve the office.
const base = Buffer.alloc(photo.length);
const vignette = new Float32Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pixel = y * width + x,
      offset = pixel * 3;
    const sample = (Math.floor(y / cell) * columns + Math.floor(x / cell)) * 3;
    const dx = Math.max(Math.abs((x % cell) + 0.5 - cell / 2) - 1.3, 0);
    const dy = Math.max(Math.abs((y % cell) + 0.5 - cell / 2) - 1.3, 0);
    const mask = Math.max(0, Math.min(1, 2 - Math.hypot(dx, dy)));
    const nx = (x / width - 0.5) * 2,
      ny = (y / height - 0.5) * 2;
    vignette[pixel] = 1 - 0.18 * (nx * nx + ny * ny);
    for (let channel = 0; channel < 3; channel++) {
      const color = samples[sample + channel] * 0.9 + photo[offset + channel] * 0.1;
      base[offset + channel] = color * mask + (photo[offset + channel] * 0.22 + 4) * (1 - mask);
    }
  }
}
const glow = await sharp(base, { raw: { width, height, channels: 3 } })
  .blur(2.4)
  .raw()
  .toBuffer();
const encoder = spawn(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    `${directory}/vignette-bloom-office.mp4`,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const completion = once(encoder, "close");
for (let frame = 0; frame < frames; frame++) {
  const phase = (frame / frames) * Math.PI * 2;
  const raster = Buffer.alloc(base.length);
  for (let y = 0; y < height; y++) {
    // A periodic exposure/bloom wave loops seamlessly, without flashes or geometric distortion.
    const exposure = 0.99 + Math.sin(phase + (y / height) * Math.PI * 2) * 0.035;
    const bloom = 0.16 + Math.sin(phase - (y / height) * Math.PI) * 0.04;
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x,
        offset = pixel * 3;
      const grain = (((pixel * 31 + frame * 7) % 19) / 19 - 0.5) * 1.5;
      for (let channel = 0; channel < 3; channel++) {
        const value = base[offset + channel];
        const screen = 255 - ((255 - value) * (255 - glow[offset + channel])) / 255;
        raster[offset + channel] = Math.max(
          0,
          Math.min(
            255,
            ((1 - bloom) * value + bloom * screen) * vignette[pixel] * exposure + grain,
          ),
        );
      }
    }
  }
  if (frame === 0)
    await sharp(raster, { raw: { width, height, channels: 3 } })
      .webp({ quality: 88 })
      .toFile(`${directory}/vignette-bloom-office.webp`);
  if (!encoder.stdin.write(raster)) await once(encoder.stdin, "drain");
}
encoder.stdin.end();
const [code] = await completion;
if (code !== 0) throw new Error(`Artwork encoder failed (${code}).`);
console.log(`Baked ${frames} frames at ${fps}fps, ${width}x${height}, with a matching poster.`);
