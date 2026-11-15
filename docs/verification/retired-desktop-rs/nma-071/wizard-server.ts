/** Actual API/broker/journal, with a deterministic local harness transport only. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApi } from "../../../server/src/api";
import { Background } from "../../../server/src/background";
import { manifests } from "../../../server/src/harness/availability";
import { HarnessBroker } from "../../../server/src/harness/broker";
import type { HarnessClient } from "../../../server/src/harness/client";
import { CredentialContexts } from "../../../server/src/harness/context";
import { HarnessError, unknownCapabilities } from "../../../server/src/harness/contracts";
import { ProductTools } from "../../../server/src/harness/tools";
import { Machines } from "../../../server/src/machines/service";
import { InteractionJournal } from "../../../server/src/runs/interaction-journal";
import { fixture } from "../../../server/tests/helpers";

const f = fixture();
const directory = resolve(process.argv[2] ?? ".dev/nma071-wizard");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const token = crypto.randomUUID() + crypto.randomUUID();
writeFileSync(`${directory}/token`, token, { mode: 0o600 });
new Machines(f.lifecycle, null);
let pending = {
  approvals: [],
  user_inputs: [
    {
      userInputId: "nma071-two-questions",
      questions: [
        {
          id: "format",
          header: "Format",
          question: "Choose the result format.",
          options: [{ label: "Summary" }, { label: "Checklist" }],
          selection: { mode: "single" },
        },
        {
          id: "context",
          header: "Context",
          question: "Add a short note through the composer.",
          options: [],
          selection: { mode: "single" },
        },
      ],
    },
  ],
};
const responses: unknown[] = [];
const native: HarnessClient = {
  async inspect() {
    return {
      login: "authenticated",
      account_id: "local-wizard-fixture",
      auth_method: "native_login",
      billing_source: "subscription",
      capabilities: {
        ...unknownCapabilities,
        product_tools: "supported",
        settings: "supported",
        resume: "supported",
        permission_requests: "supported",
      },
    };
  },
  async discoverModels() {
    return [{ id: "wizard-fixture", reasoning: [] }];
  },
  async start() {
    return { native_session_id: "wizard-fixture-session" };
  },
  async resume(identity) {
    return identity;
  },
  async settings() {},
  async close() {},
  async stop() {
    return { confirmed: false };
  },
  async prompt() {
    throw new HarnessError("CAPABILITY_UNSUPPORTED");
  },
  interactions() {
    return pending;
  },
  async respond(run, answer) {
    responses.push({ run, answer });
    pending = { approvals: [], user_inputs: [] };
  },
};
const tools = new ProductTools(f.lifecycle);
const broker = new HarnessBroker(
  f.lifecycle,
  new CredentialContexts(f.dir),
  tools,
  {
    codex: {
      harness: "codex",
      async connect() {
        return native;
      },
    },
  },
  async () => ({
    harness: "codex",
    executable: process.execPath,
    version: "0.166.0",
    state: "supported",
    manifest: manifests.codex,
  }),
  undefined,
  { request_ms: 1000, close_ms: 100 },
);
const agent = f.store.get("agent", f.agent.id);
f.store.put(
  {
    ...agent,
    name: "Native question fixture",
    model_id: "wizard-fixture",
    revision: agent.revision + 1,
  },
  agent.revision,
);
await broker.openSession(f.thread.id, f.agent.id);
const admitted = f.lifecycle.admit({
  thread_id: f.thread.id,
  agent_id: f.agent.id,
  text: "Inspect a two-step native question.",
});
const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
if (!run?.dispatch_token) throw new Error("Missing fixture dispatch");
f.lifecycle.started(run.id, run.dispatch_token, "wizard-native-run");
f.lifecycle.appendAnswer(run.id, "I have two questions before continuing.");
await broker.interactions(run.id);
const api = createApi(f.lifecycle, new Background(f.lifecycle), token, {
  connections: broker.connections,
  tools,
  broker,
});
const receipts: unknown[] = [];
let dropNext = false;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 90,
  async fetch(request) {
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response(null, { status: 401 });
    const path = new URL(request.url).pathname;
    if (path === "/_drop-next") {
      dropNext = true;
      return Response.json({ armed: true });
    }
    if (path === "/_proof")
      return Response.json({
        transport: "deterministic local harness fixture",
        responses,
        receipts,
        history: new InteractionJournal(f.store).history(run.id),
      });
    const body = request.method === "POST" ? await request.clone().text() : null;
    const response = await api.handle(request);
    receipts.push({ method: request.method, path, status: response.status, body });
    if (dropNext && request.method === "POST" && response.ok) {
      dropNext = false;
      return Response.json(
        {
          error: {
            code: "PROOF_ACK_LOST",
            message: "Committed acknowledgement withheld by the fixture.",
          },
        },
        { status: 502 },
      );
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
writeFileSync(
  `${directory}/identities.json`,
  JSON.stringify({ thread: f.thread.id, run: admitted.run.id }),
  { mode: 0o600 },
);
console.log(
  `Two-step native-question fixture ready at ${server.url.origin}; no real provider inference`,
);
process.on("SIGTERM", async () => {
  server.stop(true);
  await broker.close();
  f.close();
  process.exit(0);
});
