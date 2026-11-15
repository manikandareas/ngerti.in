import { Connections } from "../../../apps/server/src/harness/connections";
import type { AppHost } from "../../../apps/server/src/integrations/host";
import { Conversations } from "../../../apps/server/src/conversations";
import { resolve } from "node:path";
import { authFixture } from "../../../apps/server/tests/auth/helpers";
import { readinessFixture } from "../../../apps/server/tests/organizations/readiness-helpers";

// Disposable HTTP/PostgreSQL product journeys. Harness, app and Cua transports are fixtures.
// This server is never imported by the application or exposed outside loopback.
const dist = resolve(import.meta.dir, "../../../apps/web-client/dist");
let current: Awaited<ReturnType<typeof authFixture>> | Awaited<ReturnType<typeof readinessFixture>>;
let metadata: Record<string, unknown> = {};
let ready = false;
function fixtureApps(): AppHost {
  const accounts = new Map<string, { id: string; toolkit: string; active: boolean }[]>();
  return {
    async catalog() { return { items: [{ slug: "github", name: "GitHub", connected: false, description: "Work with repositories", categories: [{ slug: "developer_tools", name: "Developer tools" }], tools_count: 1, no_auth: false }], metadata_complete: true }; },
    async connect(user, toolkit) { const account = { id: crypto.randomUUID(), toolkit, active: true }; accounts.set(user, [...(accounts.get(user) ?? []), account]); return { account_id: account.id, connect_url: "https://example.invalid/fixture-connect" }; },
    async accounts(user) { return accounts.get(user) ?? []; },
    async session(user) { return user; },
    async search() { return [{ slug: "GITHUB_READ_PROFILE", toolkit: "github", description: "Read profile" }]; },
    async execute(_session, _account, _tool, _args, authorize) { await authorize(); return { state: "succeeded", data: { fixture: true }, log_id: "fixture-log" }; },
  };
}
async function reset(empty = false) {
  ready = false;
  const started = performance.now();
  console.log("Resetting browser fixture: closing previous workspace.");
  await current?.close();
  console.log(`Previous browser workspace closed in ${Math.round(performance.now() - started)}ms.`);
  if (empty) {
    const f = await authFixture(undefined, 4320);
    current = f;
    await f.domain.administrativeQuery("TRUNCATE TABLE entities,events,commands,conversation_parts,routing_traces RESTART IDENTITY CASCADE");
    await f.signup(); await f.verify();
    const grant = await f.auth.issueBootstrap("owner@example.test");
    metadata = { grant: grant.token, owner: "owner@example.test" };
  } else {
    const f = await readinessFixture(undefined, fixtureApps(), undefined, 4320, process.env.NGERTIIN_NMA080_NATIVE_CUA === "1");
    current = f;
    await f.organizations.grantCreation("owner@example.test", 3);
    const second = await f.success(f.write(f.owner.cookie, "/v1/organizations", { name: "Second organization", slug: `second-${crypto.randomUUID().slice(0, 8)}` }));
    const bob = await f.account("bob@example.test"); await f.join(bob);
    const ownerLane = await f.lane(f.owner.cookie, "codex");
    const aliceLane = await f.lane(f.alice.cookie, "codex", ownerLane.agent);
    const bobLane = await f.lane(bob.cookie, "codex", ownerLane.agent);
    const alternative = await f.domain.store.withDataContext(await f.context(f.alice.cookie), async () => {
      const connections = new Connections(f.domain.lifecycle);
      const created = await connections.create({ harness: "codex", authentication: { method: "native_login", billing_source: "subscription" } });
      return connections.update(created, { login: "authenticated", account_id: "secondary-fixture-account", effective_billing_source: "subscription", discovery: "succeeded", models: [{ id: "alternative-model", reasoning: [] }] });
    });
    const defaults: Record<string, unknown> = {};
    for (const [name, cookie] of [["owner", f.owner.cookie], ["alice", f.alice.cookie], ["bob", bob.cookie]]) {
      try { defaults[name] = await f.success(f.request(cookie, "/v1/data/provision", {})); } catch (error) {
        const scope = await f.context(cookie);
        console.error("Provisioning fixture failed for", name);
        await f.domain.store.withDataContext(scope, () => new Conversations(f.domain.lifecycle).setup());
        throw error;
      }
    }
    const groups = [];
    for (const name of ["Engineering", "Marketing"]) groups.push((await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name }))).workgroup);
    await f.background.start();
    metadata = {
      owner: "owner@example.test", alice: "alice@example.test", bob: "bob@example.test",
      organization: f.initial.organization, second: second.organization, team: ownerLane.agent,
      ownerThread: ownerLane.thread.id, aliceThread: aliceLane.thread.id, bobThread: bobLane.thread.id,
      ownerConnection: ownerLane.connection.id, aliceConnection: aliceLane.connection.id, alternativeConnection: alternative.id,
      defaults, groups, aliceMembership: f.joined.membership.id,
    };
  }
  const api = current.api;
  current.serve(async request => {
    const url = new URL(request.url);
    if (/^\/(v1|health|api\/auth)\//.test(url.pathname)) return api.handle(request);
    const path = resolve(dist, `.${url.pathname}`);
    if (path.startsWith(`${dist}/`)) {
      const file = Bun.file(path);
      if (await file.exists()) return new Response(file, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response(Bun.file(resolve(dist, "index.html")), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  });
  ready = true;
  console.log(`Browser fixture reset completed in ${Math.round(performance.now() - started)}ms.`);
}
const control = Bun.serve({ hostname: "127.0.0.1", port: 8320, idleTimeout: 120, async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return Response.json({ ready }, { status: ready ? 200 : 503 });
  if (request.method === "POST" && url.pathname === "/reset") { await reset(url.searchParams.has("empty")); return Response.json(metadata); }
  if (url.pathname === "/state") return Response.json(metadata);
  if (url.pathname === "/email") {
    const message = current.emails.findLast(message => message.to === url.searchParams.get("to") && message.purpose === url.searchParams.get("purpose"));
    return Response.json({ url: message?.url ?? null });
  }
  if (url.pathname === "/warm-computer" && "domains" in current) {
    const f = current;
    const scope = await f.context(f.alice.cookie);
    const state = await f.domain.store.withDataContext(scope, async () => { const machine = await f.domains.resolve(); await machine.ready(); return machine.snapshot(); });
    return Response.json({ ready: state.state === "ready" });
  }
  if (url.pathname === "/remove-alice" && "joined" in current) {
    await current.success(current.write(current.owner.cookie, `${current.path}/members/${current.joined.membership.id}/remove`));
    return Response.json({ removed: true });
  }
  return new Response(null, { status: 404 });
} });
await reset();
console.log("NMA-080 disposable browser fixture ready at http://127.0.0.1:4320");
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await control.stop(true); await current.close(); process.exit(0); }
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
