import { resolve } from "node:path";
import { readinessFixture } from "../../../apps/server/tests/organizations/readiness-helpers";

const root = resolve(import.meta.dir, "../../..");
const cert = await Bun.file(resolve(root, ".dev/nma081/server.pem")).text();
const key = await Bun.file(resolve(root, ".dev/nma081/server-key.pem")).text();
const nativeCua = process.env.NGERTIIN_NMA081_NATIVE_CUA === "1";
const port = Number(process.env.NGERTIIN_NMA081_PORT ?? 44431);
const controlPort = Number(process.env.NGERTIIN_NMA081_CONTROL_PORT ?? 8441);
if (![port, controlPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535)) throw new Error("Invalid fixture port.");
const f = await readinessFixture(undefined, undefined, undefined, port, nativeCua, {
  tls: { cert, key }, nativeRedirectUri: "http://127.0.0.1:43119/callback",
});
await f.organizations.grantCreation("alice@example.test", 2);
const ownerLane = await f.lane(f.owner.cookie, "codex");
const aliceLane = await f.lane(f.alice.cookie, "codex", ownerLane.agent);
await f.success(f.request(f.alice.cookie, "/v1/data/provision", {}));
await f.background.start(100);
const dist = resolve(root, "apps/web-client/dist");
f.api.wrap(handler => async request => {
  const url = new URL(request.url);
  if (/^\/(v1|health|api\/auth)(\/|$)/.test(url.pathname)) return handler(request);
  const path = resolve(dist, `.${url.pathname}`);
  const asset = path.startsWith(`${dist}/`) ? Bun.file(path) : null;
  return new Response(asset && await asset.exists() ? asset : Bun.file(resolve(dist, "index.html")), {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
});
await f.listenApi(f.api);
const control = Bun.serve({ hostname: "127.0.0.1", port: controlPort, idleTimeout: 120, async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/state") {
    const browser = await f.http("/v1/auth/session", undefined, f.alice.cookie);
    return Response.json({ ready: true, origin: f.origin, nativeCua, organization: f.initial.organization.id,
      agent: ownerLane.agent.id, thread: aliceLane.thread.id, user: "alice@example.test", browserSessionAlive: browser.ok,
      completedFixtureTasks: f.calls.length });
  }
  if (url.pathname === "/contract") return f.request(f.alice.cookie, "/v1/contracts");
  if (url.pathname === "/warm-computer") {
    const scope = await f.context(f.alice.cookie);
    const state = await f.domain.store.withDataContext(scope, async () => {
      const machine = await f.domains.resolve(); await machine.ready(); return machine.snapshot();
    });
    return Response.json({ ready: state.state === "ready" });
  }
  if (url.pathname === "/revoke-native" && request.method === "POST") {
    const sessions = await f.success(f.http("/v1/auth/sessions", undefined, f.alice.cookie));
    let revoked = 0;
    for (const session of sessions.sessions) if (!session.current) {
      await f.success(f.http(`/v1/auth/sessions/${session.id}/revoke`, {}, f.alice.cookie)); revoked++;
    }
    return Response.json({ revoked });
  }
  return new Response(null, { status: 404 });
} });
console.log(`NMA-081 disposable HTTPS API ready at https://127.0.0.1:${port}; control at http://127.0.0.1:${controlPort}`);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await control.stop(true); await f.close(); process.exit(0); }
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
