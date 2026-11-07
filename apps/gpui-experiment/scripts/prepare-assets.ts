import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as icons from "../../web-client/node_modules/@hugeicons/core-free-icons";
import { createAvatar } from "../../../packages/avatar/src/config";
import { renderAvatarSvg } from "../../web-client/src/features/avatar/engine/render";

const directory = resolve(import.meta.dir, "..");
const assets = resolve(directory, "assets");
const require = createRequire(resolve(directory, "../desktop/package.json"));
const sharp = require("sharp");
await mkdir(resolve(assets, "icons"), { recursive: true });
await mkdir(resolve(assets, "avatars"), { recursive: true });
await mkdir(resolve(assets, "fonts"), { recursive: true });

const selected = {
  search: "Search01Icon",
  plus: "Add01Icon",
  computer: "ComputerIcon",
  close: "Cancel01Icon",
  folder: "Folder01Icon",
  user: "UserIcon",
  plug: "Plug01Icon",
  up: "ArrowUp02Icon",
  down: "ArrowDown01Icon",
  right: "ArrowRight01Icon",
  left: "ArrowLeft01Icon",
  file: "File01Icon",
  sun: "Sun03Icon",
  moon: "Moon02Icon",
  more: "MoreHorizontalIcon",
  copy: "Copy01Icon",
  check: "Tick02Icon",
  stop: "StopIcon",
  code: "SourceCodeIcon",
  settings: "Settings01Icon",
  refresh: "RefreshIcon",
};
for (const [name, exported] of Object.entries(selected)) {
  const data = (icons as Record<string, unknown>)[exported] as [string, Record<string, unknown>][];
  if (!data) throw new Error(`Missing Hugeicons asset: ${exported}`);
  const body = data
    .map(
      ([tag, properties]) =>
        `<${tag} ${Object.entries(properties)
          .filter(([key]) => key !== "key")
          .map(
            ([key, value]) =>
              `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${String(value).replaceAll('"', "&quot;")}"`,
          )
          .join(" ")}/>`,
    )
    .join("");
  await writeFile(
    resolve(assets, `icons/${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  );
}

const configs = {
  tobi: createAvatar("tobi-circle", { shape: "circle", color: "lilac", face: "calm" }),
  kira: createAvatar("gpui-kira", { shape: "capsule", color: "seafoam", face: "curious" }),
  nara: createAvatar("gpui-nara", { shape: "squircle", color: "rose", face: "calm" }),
};
// Export the existing procedural identities. Runtime rendering and animation are native.
// These cached images do not prove a Rust reimplementation of the procedural generator.
for (const [name, config] of Object.entries(configs)) {
  for (const state of ["idle", "thinking", "working", "listening"] as const) {
    // librsvg's nested inset filter erases eye interiors. Keep the original eye
    // geometry/gradient and omit only that filter for the native cached portrait.
    const source = renderAvatarSvg(config, { state }).replaceAll(
      ' filter="url(#ngertiin-avatar-eye-shadow)"',
      "",
    );
    await sharp(Buffer.from(source))
      .resize(384, 384)
      .png()
      .toFile(resolve(assets, `avatars/${name}-${state}.png`));
  }
}
for (const [name, source] of [
  ["Geist.woff2", "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"],
  ["GeistMono.woff2", "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"],
  ["Geist-OFL.txt", "@fontsource-variable/geist/LICENSE"],
  ["GeistMono-OFL.txt", "@fontsource-variable/geist-mono/LICENSE"],
] as const)
  await copyFile(
    resolve(directory, "../web-client/node_modules", source),
    resolve(assets, "fonts", name),
  );
await writeFile(resolve(assets, "avatar-recipes.json"), JSON.stringify(configs, null, 2) + "\n");
console.log("Prepared client-derived avatars, Hugeicons and Geist font assets.");
