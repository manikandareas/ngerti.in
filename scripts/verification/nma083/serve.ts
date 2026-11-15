import { resolve } from "node:path";
import { acceptanceFixture } from "./fixture";

const root = resolve(import.meta.dir, "../../..");
const f = await acceptanceFixture(44433, {
  tls: {
    cert: await Bun.file(resolve(root, ".dev/nma081/server.pem")).text(),
    key: await Bun.file(resolve(root, ".dev/nma081/server-key.pem")).text(),
  },
  nativeRedirectUri: "http://127.0.0.1:43119/callback",
});
const dist = resolve(root, "apps/web-client/dist");
f.serve(async (request) => {
  const url = new URL(request.url);
  if (/^\/(v1|health|api\/auth)(\/|$)/.test(url.pathname)) return f.api.handle(request);
  const path = resolve(dist, `.${url.pathname}`);
  const file = path.startsWith(`${dist}/`) ? Bun.file(path) : null;
  return new Response(
    file && (await file.exists()) ? file : Bun.file(resolve(dist, "index.html")),
    {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    },
  );
});
await f.background.start(100);
const control = Bun.serve({
  hostname: "127.0.0.1",
  port: 8343,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/state")
      return Response.json({
        ready: true,
        origin: f.origin,
        first: f.initial.organization,
        second: f.second,
        agent: f.aliceLane.agent.id,
        thread: f.aliceLane.thread.id,
        controlled_native_transport: true,
        completed_fixture_tasks: f.calls.length,
      });
    if (path === "/remove-alice" && request.method === "POST") {
      await f.success(f.write(f.bob.cookie, `${f.path}/members/${f.joined.membership.id}/remove`));
      return Response.json({ removed_from_first: true, second_membership_retained: true });
    }
    if (path === "/revoke-native" && request.method === "POST") {
      const sessions = await f.success(f.http("/v1/auth/sessions", undefined, f.alice.cookie));
      let revoked = 0;
      for (const session of sessions.sessions)
        if (!session.current) {
          await f.success(f.http(`/v1/auth/sessions/${session.id}/revoke`, {}, f.alice.cookie));
          revoked++;
        }
      return Response.json({ revoked });
    }
    return new Response(null, { status: 404 });
  },
});
console.log("NMA-083 disposable HTTPS actor matrix ready; control http://127.0.0.1:8343/state");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await control.stop(true);
  await f.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
