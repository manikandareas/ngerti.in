import assert from "node:assert/strict";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { CuaMachine } from "../../../apps/server/src/machines/cua";

const config = readMachineConfiguration(".dev/harness-first"); assert(config);
const host = new CuaMachine(config);
const marker = crypto.randomUUID();
const file = `.ngertiin-verification/persistent-${marker}.txt`;
const systemFile = `/usr/local/share/ngertiin-persistence-${marker}.txt`;
const port = 18766;
const cookieLog = `/tmp/ngertiin-cookie-proof-${marker}`;
const command = `python3 -u - <<'PY'\nfrom http.server import HTTPServer, BaseHTTPRequestHandler\nclass Handler(BaseHTTPRequestHandler):\n def do_GET(self):\n  open('${cookieLog}','w').write(self.headers.get('Cookie','NO_COOKIE'))\n  self.send_response(200)\n  self.send_header('Content-Type','text/html')\n  self.send_header('Set-Cookie','ngertiin_proof=${marker}; Max-Age=3600; Path=/; SameSite=Lax')\n  self.end_headers()\n  self.wfile.write(('<html><body><h1>Persistent session check</h1><p>'+self.headers.get('Cookie','NO_COOKIE')+'</p></body></html>').encode())\n def log_message(self,*args): pass\nopen('${cookieLog}','w').write('RESET')\nHTTPServer(('127.0.0.1',${port}),Handler).serve_forever()\nPY`;
const spawned: Awaited<ReturnType<CuaMachine["spawn"]>>[] = [];
async function server() { const child = await host.spawn(command, { requestId: crypto.randomUUID(), tag: `ngertiin-persistence-${crypto.randomUUID()}`, timeoutMs: 180_000 }); spawned.push(child); await Bun.sleep(500); }
async function call(name: string, args: Record<string, unknown> = {}) { const result = await host.call(name, { ...args, session: `persistence-${marker}` }); assert(!result.isError, result.structuredJson); return JSON.parse(result.structuredJson ?? "{}"); }
async function cookie() {
  const child = await host.spawn(`cat '${cookieLog}'`, { requestId: crypto.randomUUID(), tag: `cookie-read-${crypto.randomUUID()}` });
  let text = "";
  for (;;) { const event = await child.nextEvent(); if (!event || event.exit) break; text += new TextDecoder().decode(event.data); }
  return text;
}
async function attach() {
  await call("start_session");
  let window: { pid: number; window_id: string } | undefined;
  const deadline = Date.now() + 45_000;
  while (!window && Date.now() < deadline) {
    const desktop = await call("get_desktop_state");
    window = desktop.windows.find((item: { app_name: string }) => item.app_name === "Chromium");
    if (!window) await Bun.sleep(1000);
  }
  assert(window, "Chromium did not finish starting after machine restart.");
  await call("browser_prepare", { pid: window.pid, window_id: Number(window.window_id), strategy: { kind: "existing_profile" }, delivery_mode: "foreground" });
  return call("get_browser_state", { pid: window.pid, window_id: Number(window.window_id) });
}
async function navigate(state: Record<string, any>) {
  const tab = state.tabs?.[0] ?? (state.tab_id ? { tab_id: state.tab_id } : null); assert(tab, JSON.stringify(state));
  await call("browser_navigate", { target_id: state.target_id, tab_id: tab.tab_id, url: `http://127.0.0.1:${port}/` });
  await Bun.sleep(500);
  return call("get_browser_state", { target_id: state.target_id, tab_id: tab.tab_id });
}
try {
  await host.files().create(file, Buffer.from(marker));
  const system = await host.spawn(`printf '%s' '${marker}' | sudo tee '${systemFile}' >/dev/null`, { requestId: crypto.randomUUID(), tag: `ngertiin-os-proof-${marker}` });
  for (;;) { const event = await system.nextEvent(); if (!event || event.exit) { assert.equal(event?.exit?.code, 0); break; } }
  await server();
  let state = await attach();
  state = await navigate(state); state = await navigate(state);
  assert((await cookie()).includes(marker), JSON.stringify(state));
  await call("end_session");
  // Stop/start only this installation-owned retained container; never recreate/delete its volume.
  const restart = Bun.spawn(["docker", "restart", "--time", "15", `${config.project}-desktop-1`], { stdout: "ignore", stderr: "pipe" });
  assert.equal(await restart.exited, 0);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) { try { const r = await fetch(`${config.endpoint}/health`); if (r.ok) break; } catch {} await Bun.sleep(500); }
  assert.equal((await host.files().read(file)).toString(), marker);
  const check = await host.spawn(`cat '${systemFile}'`, { requestId: crypto.randomUUID(), tag: `ngertiin-os-read-${marker}` });
  let systemBytes = "";
  for (;;) { const event = await check.nextEvent(); if (!event) break; if (event.exit) { assert.equal(event.exit.code, 0); break; } systemBytes += new TextDecoder().decode(event.data); }
  assert.equal(systemBytes, marker);
  await server();
  state = await attach(); state = await navigate(state);
  assert((await cookie()).includes(marker), "Persistent browser cookie was lost.");
  await Bun.write("docs/verification/shared-machine/persistence.json", JSON.stringify({ date: "2026-11-04", same_retained_container: true, shared_file_hash_verified: true, os_writable_layer_retained: true, owned_test_site_persistent_cookie_retained: true, external_account_login_tested: false, machine_recreation_tested: false, running_jobs_survive_reboot: false }, null, 2));
  console.log("Retained file, OS layer and owned-site browser cookie survived container restart.");
} finally {
  await call("end_session").catch(() => {});
  for (const child of spawned) { await child.signal("term", true).catch(() => {}); await child.detach().catch(() => {}); }
}
