/** Disposable API process for the NMA-068 native recovery walkthrough.
 * Uses the real store, contract and command handlers with no model executor.
 * Test controls are loopback-only and require this process's private bearer.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApi } from "../../../../apps/server/src/api";
import { Background } from "../../../../apps/server/src/background";
import { Connections } from "../../../../apps/server/src/harness/connections";
import { Machines } from "../../../../apps/server/src/machines/service";
import { fixture } from "../../../../apps/server/tests/helpers";

const f = fixture();
const directory = resolve(process.argv[2] ?? ".dev/nma068-recovery");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const token = crypto.randomUUID() + crypto.randomUUID();
writeFileSync(`${directory}/token`, token, { mode: 0o600 });
const agent = f.store.get("agent", f.agent.id);
f.store.put(
  { ...agent, name: "Tobi", system_role: "tobi", revision: agent.revision + 1 },
  agent.revision,
);
const connection = new Connections(f.lifecycle).get(agent.connection_id);
new Connections(f.lifecycle).update(connection, {
  login: "authenticated",
  effective_billing_source: "subscription",
});
function application() {
  new Machines(f.lifecycle, null);
  return createApi(f.lifecycle, new Background(f.lifecycle), token);
}
let api = application();
let dropNext = false;
const receipts: {
  method: string;
  path: string;
  key: string | null;
  body: string;
  acknowledged: boolean;
}[] = [];
function evidence() {
  return {
    counts: Object.fromEntries(
      (["agent", "thread", "message", "run", "group_route", "artifact"] as const).map((kind) => [
        kind,
        f.store.list(kind).length,
      ]),
    ),
    messages: f.store
      .list("message")
      .map(({ id, text, state, revision, artifact_ids }) => ({
        id,
        text,
        state,
        revision,
        artifact_ids,
      })),
    runs: f.store
      .list("run")
      .map(({ id, status, input_message_id, cancellation }) => ({
        id,
        status,
        input_message_id,
        cancellation,
      })),
    receipts,
  };
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 90,
  async fetch(request) {
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    if (url.pathname === "/_proof") return Response.json(evidence());
    if (url.pathname === "/_drop-next" && request.method === "POST") {
      dropNext = true;
      return Response.json({ armed: true });
    }
    if (url.pathname === "/_restart" && request.method === "POST") {
      f.restart();
      api = application();
      return Response.json({ restarted: true });
    }
    const body = request.method === "POST" ? await request.clone().text() : "";
    const response = await api.handle(request);
    if (request.method === "POST") {
      const dropped = dropNext && response.ok;
      receipts.push({
        method: request.method,
        path: url.pathname,
        key: request.headers.get("Idempotency-Key"),
        body,
        acknowledged: !dropped,
      });
      if (dropped) {
        dropNext = false;
        return Response.json(
          {
            error: {
              code: "PROOF_ACK_LOST",
              message: "The test proxy withheld the committed acknowledgement.",
            },
          },
          { status: 502 },
        );
      }
    }
    return response;
  },
});
writeFileSync(
  `${directory}/attachment.json`,
  JSON.stringify({
    origin: server.url.origin,
    token_file: `${directory}/token`,
    thread_id: f.thread.id,
  }),
  { mode: 0o600 },
);
chmodSync(`${directory}/attachment.json`, 0o600);
console.log(
  `Recovery API ready: ${server.url.origin}; private configuration: ${directory}/attachment.json`,
);
process.on("SIGTERM", () => {
  writeFileSync(`${directory}/result.json`, JSON.stringify(evidence(), null, 2));
  server.stop(true);
  f.close();
  process.exit(0);
});
