import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DockerBrowserHost } from "../../../apps/server/src/browser/host";

const root = resolve(".dev/nma058/host-proof");
mkdirSync(root, { recursive: true, mode: 0o700 });
const proofPath = `${root}/identity.json`;
const proof = await Bun.file(proofPath).exists() ? await Bun.file(proofPath).json() : { owner: crypto.randomUUID(), profile: crypto.randomUUID() };
await Bun.write(proofPath, JSON.stringify(proof));
const host = new DockerBrowserHost(root, proof.owner);
const started = performance.now();
const report: any = { started_at: new Date().toISOString(), checks: [] };
try {
  await host.connect(proof.profile);
  report.setup_ms = performance.now() - started;
  report.navigation = await host.call(proof.profile, "browser_navigate", { url: "https://example.com" });
  report.state = await host.call(proof.profile, "browser_get_state", { include_screenshot: true });
  for (const item of report.state.content) if (item.type === "image") {
    await Bun.write(".dev/verification/nma-058/host-browser.png", Buffer.from(item.data, "base64"));
    item.data = "[retained as host-browser.png]";
  }
  assert(report.state.content.some((c: any) => c.type === "text" && JSON.parse(c.text).binding.target_id));
  report.vnc_port_bound = Number.isInteger(await host.vncPort(proof.profile));
  report.checks.push("direct_mcp_state_native_target", "managed_loopback_rfb");
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally { host.detach(proof.profile); await Bun.write(".dev/verification/nma-058/host-smoke.json", JSON.stringify(report, null, 2)); }
