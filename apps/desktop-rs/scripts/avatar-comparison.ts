// Development-only comparison; serves exactly two retained, non-private artifacts.
import { resolve } from "node:path";
import { directory, repository } from "./cargo";

const original = await Bun.file(
  resolve(directory, "verification/nma-067/reference-tobi.svg"),
).text();
const png = resolve(repository, "docs/verification/nma-067/rust-tobi.png");
Bun.serve({
  hostname: "127.0.0.1",
  port: 41167,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/rust.png") return new Response(Bun.file(png));
    if (path !== "/") return new Response("Not found", { status: 404 });
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>NMA-067 renderer comparison</title>
<style>body{font:16px system-ui;margin:32px;background:#fafafa;color:#222}.row{display:flex;gap:40px}.item{width:400px}svg,img{width:400px;height:400px}h2{font-size:18px}</style>
<h1>NMA-067: same original SVG / Rust export</h1><p>Fixed Tobi recipe, no motion. Renderer comparison only.</p>
<div class="row"><div class="item"><h2>Original SVG: browser</h2>${original}</div><div class="item"><h2>Rust resvg PNG: transparent export</h2><img src="/rust.png" alt="Rust-generated Tobi"></div></div>`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        },
      },
    );
  },
});
console.log("Avatar comparison on http://127.0.0.1:41167");
