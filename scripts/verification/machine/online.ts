import assert from "node:assert/strict";
import { CuaMachine } from "../../../apps/server/src/machines/cua";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";

// Owner-controlled smoke check on the live local installation; no provider call or login.
const base = "http://127.0.0.1:3001";
async function control(body?: unknown) {
  const response = await fetch(`${base}/v1/machine${body ? "/control" : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json(); assert(response.ok, JSON.stringify(value)); return value;
}
const current = await control(); assert.equal(current.lease.holder, "none", "Keep an active owner/agent desktop interaction intact.");
const owned = await control({ command_id: crypto.randomUUID(), operation: "acquire", expected_revision: current.lease.revision });
const config = readMachineConfiguration(".dev/harness-first"); assert(config);
const host = new CuaMachine(config);
const session = `online-${crypto.randomUUID()}`;
async function call(name: string, args: Record<string, unknown> = {}) {
  const reply = await host.call(name, { ...args, session });
  const state = JSON.parse(reply.structuredJson ?? "{}");
  assert(!reply.isError && state.status !== "refused", reply.structuredJson); return state;
}
try {
  await call("start_session");
  const desktop = await call("get_desktop_state");
  const window = desktop.windows.find((item: { app_name: string }) => item.app_name === "Chromium"); assert(window);
  await call("browser_prepare", { pid: window.pid, window_id: Number(window.window_id), strategy: { kind: "existing_profile" }, delivery_mode: "foreground" });
  const bound = await call("get_browser_state", { pid: window.pid, window_id: Number(window.window_id) });
  assert.equal(bound.binding_quality, "exact");
  const tab = bound.tabs[0]; assert(tab);
  await call("browser_navigate", { target_id: bound.target_id, tab_id: tab.tab_id, url: "https://example.com" });
  const deadline = Date.now() + 10_000;
  let observed;
  do { observed = await call("get_browser_state", { pid: window.pid, window_id: Number(window.window_id) }); if (observed.tabs.some((item: { title?: string }) => item.title?.includes("Example Domain"))) break; await Bun.sleep(500); } while (Date.now() < deadline);
  assert(observed.tabs.some((item: { title?: string }) => item.title?.includes("Example Domain")), JSON.stringify(observed));
  await Bun.write("docs/verification/shared-machine/online.json", JSON.stringify({ date: "2026-11-04", local_runtime: base, machine_state: current.state, exact_browser_binding: true, url: "https://example.com/", observed_title: "Example Domain", login_tested: false, provider_inference: false }, null, 2));
  console.log("Live installation: exact retained browser reached https://example.com and observed Example Domain.");
} finally {
  await call("end_session").catch(() => {});
  await control({ command_id: crypto.randomUUID(), operation: "release", expected_revision: owned.lease.revision });
}
