import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { startGateway } from "../src/gateway";
import { fixture } from "./fixtures";

test("gateway guards origin and forwards authenticated uploads and streaming without buffering", async () => {
  const f = await fixture();
  let authorization: string | undefined;
  let finish: (() => void) | undefined;
  const backend = createServer((req, res) => {
    authorization = req.headers.authorization;
    if (req.url === "/v1/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: first\n\n");
      finish = () => res.end("data: last\n\n");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.concat(chunks));
    });
  });
  await new Promise<void>((ok) => backend.listen(0, "127.0.0.1", ok));
  const address = backend.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const gateway = await startGateway({
    port: f.profile.uiPort,
    assets: f.home,
    token: () => "private-installation-token",
    backend: () => `http://127.0.0.1:${address.port}`,
    status: () => ({ state: "ready", message: "Ready" }),
    retry: () => {},
    log: () => {},
  });
  try {
    expect(
      (await fetch(`${gateway.origin}/v1/echo`, { headers: { Origin: "https://untrusted.test" } }))
        .status,
    ).toBe(403);
    expect(
      (await fetch(`${gateway.origin}/v1/echo`, { headers: { "Sec-Fetch-Site": "cross-site" } }))
        .status,
    ).toBe(403);
    const bytes = Buffer.from([0, 1, 2, 255, 128]);
    const response = await fetch(`${gateway.origin}/v1/echo`, {
      method: "POST",
      body: bytes,
      headers: { Origin: gateway.origin, Authorization: "Bearer renderer-supplied" },
    });
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(authorization).toBe("Bearer private-installation-token");
    const controller = new AbortController();
    const stream = await fetch(`${gateway.origin}/v1/stream`, { signal: controller.signal });
    if (!stream.body) throw new Error("Missing stream");
    const reader = stream.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("first");
    finish?.();
    const last = await reader.read();
    expect(new TextDecoder().decode(last.value)).toContain("last");
    controller.abort();
  } finally {
    finish?.();
    await gateway.close();
    await new Promise<void>((ok) => backend.close(() => ok()));
    f.close();
  }
});

test("gateway serves SPA routes, denies traversal and keeps its origin on restart", async () => {
  const f = await fixture();
  mkdirSync(join(f.home, "assets"));
  writeFileSync(join(f.home, "index.html"), "<main>Workspace</main>");
  writeFileSync(join(f.home, "assets/app.js"), "console.log('app')");
  const options = {
    port: f.profile.uiPort,
    assets: f.home,
    token: () => "",
    backend: () => undefined,
    status: () => ({ state: "ready", message: "Ready" }),
    retry: () => {},
    log: () => {},
  };
  let gateway = await startGateway(options);
  try {
    expect(await (await fetch(`${gateway.origin}/settings`)).text()).toContain("Workspace");
    expect((await fetch(`${gateway.origin}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${gateway.origin}/%2e%2e%5cprivate`)).status).toBe(403);
    const origin = gateway.origin;
    await gateway.close();
    gateway = await startGateway(options);
    expect(gateway.origin).toBe(origin);
  } finally {
    await gateway.close();
    f.close();
  }
});
