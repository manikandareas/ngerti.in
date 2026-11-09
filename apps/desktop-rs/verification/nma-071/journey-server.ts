/** Real disposable API authority for integrated native UI checks; no model executor. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApi } from "../../../server/src/api";
import { Artifacts } from "../../../server/src/artifacts";
import { Background } from "../../../server/src/background";
import { Connections } from "../../../server/src/harness/connections";
import { Interactions } from "../../../server/src/interactions/service";
import { Machines } from "../../../server/src/machines/service";
import { fixture } from "../../../server/tests/helpers";

const f = fixture();
const directory = resolve(process.argv[2] ?? ".dev/nma071-integrated");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const token = crypto.randomUUID() + crypto.randomUUID();
writeFileSync(`${directory}/token`, token, { mode: 0o600 });
const connections = new Connections(f.lifecycle);
const connection = connections.get(f.agent.connection_id);
connections.update(connection, {
  login: "authenticated",
  discovery: "succeeded",
  effective_billing_source: "subscription",
  models: [
    {
      id: "gpt-native-parity",
      reasoning: ["low", "medium", "high", "xhigh"],
      input_modalities: ["text"],
    },
    { id: "gpt-native-alternative", reasoning: ["low", "high"], input_modalities: ["text"] },
  ],
});
const agent = f.store.get("agent", f.agent.id);
f.store.put(
  {
    ...agent,
    name: "Tobi",
    system_role: "tobi",
    model_id: "gpt-native-parity",
    revision: agent.revision + 1,
  },
  agent.revision,
);
const peer = f.lifecycle.createAgent({
  name: "Bianca",
  harness: "codex",
  connection_id: connection.id,
});
const files = new Artifacts(f.lifecycle);
const interactions = new Interactions(f.lifecycle);
const identities: Record<string, string> = { dm: f.thread.id, agent: agent.id, peer: peer.id };
const running: Record<string, { id: string; token: string }> = {};
function group(name: string) {
  const thread = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [agent.id, peer.id],
  });
  return f.store.put({ ...thread, name, revision: thread.revision + 1 }, thread.revision);
}
function start(thread: typeof f.thread, text: string) {
  const workspace = files.workspaces.ensure(thread.id, agent.id);
  f.lifecycle.bind(thread.id, agent.id, `nma071-${thread.id}`, workspace);
  const admitted = f.lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text });
  const run = f.lifecycle.claimNext(thread.id, agent.id);
  if (!run?.dispatch_token) throw new Error("Missing disposable dispatch");
  f.lifecycle.started(run.id, run.dispatch_token, `native-${run.id}`);
  return {
    run: f.store.get("run", run.id),
    workspace,
    token: run.dispatch_token,
    message: admitted.message,
  };
}
function settle(value: ReturnType<typeof start>) {
  f.lifecycle.settle(value.run.id, value.token, "succeeded");
}
const rich = start(f.thread, "Show the native conversation components.");
const report =
  "# Review\n\n**Ready** with `typed` values.\n\n| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n\n```typescript\nexport const ready = true;\n```\n";
files.workspaces.files(rich.workspace.id).create("Review.md", Buffer.from(report));
const artifact = await files.publish(
  crypto.randomUUID(),
  {
    workspace_id: rich.workspace.id,
    run_id: rich.run.id,
    path: "Review.md",
    media_type: "text/markdown",
  },
  () => f.lifecycle.authorizeDispatch(rich.run.id, rich.token),
);
f.lifecycle.appendAnswer(
  rich.run.id,
  `The [review](ngertiin://file/${artifact.id}) is ready.\n\n${report}\nRead the [reference](https://example.org/reference).`,
);
const sourceRun = f.store.get("run", rich.run.id);
f.store.put(
  {
    ...sourceRun,
    sources: [
      {
        url: "https://example.org/reference",
        title: "Native parity reference",
        operation: "openPage",
      },
    ],
    revision: sourceRun.revision + 1,
  },
  sourceRun.revision,
);
settle(rich);
for (const [name, purpose, options] of [
  ["01 Question", "input", null],
  [
    "02 Single choice",
    "input",
    {
      choices: [
        { id: "short", label: "Short answer" },
        { id: "detail", label: "Detailed answer" },
      ],
      min: 1,
      max: 1,
      allow_custom: true,
    },
  ],
  [
    "03 Multiple choice",
    "input",
    {
      choices: [
        { id: "files", label: "Files" },
        { id: "sources", label: "Sources" },
        { id: "code", label: "Code" },
      ],
      min: 1,
      max: 2,
      allow_custom: true,
    },
  ],
  ["04 Approval", "approval", null],
  [
    "05 Answered",
    "input",
    { choices: [{ id: "a", label: "Ready" }], min: 1, max: 1, allow_custom: false },
  ],
] as const) {
  const thread = group(name);
  identities[name] = thread.id;
  const value = start(thread, `Inspect ${name.toLowerCase()}.`);
  const request = interactions.ask(value.run.id, {
    purpose,
    question: purpose === "approval" ? "Allow this local review?" : "Which result would you like?",
    options,
    action:
      purpose === "approval"
        ? {
            tool_name: "ngertiin.write_file",
            arguments: { path: "review.txt", text: "Local fixture only." },
          }
        : null,
  });
  settle(value);
  if (name === "05 Answered")
    interactions.reply(request.id, { expected_revision: request.revision, selected_ids: ["a"] });
}
for (const name of ["06 Working here", "07 Quiet group"]) {
  const thread = group(name);
  identities[name] = thread.id;
  const value = start(thread, "Check the activity scope.");
  if (name === "06 Working here") {
    running[name] = { id: value.run.id, token: value.token };
  } else {
    f.lifecycle.appendAnswer(value.run.id, "This conversation is idle.");
    settle(value);
  }
}
const status = group("08 Status and recovery");
identities.recovery = status.id;
const recovery = start(status, "Preserve this input identity.");
f.lifecycle.appendAnswer(recovery.run.id, "A retained partial answer.");
settle(recovery);
f.store.command("development:tobi:v1", { operation: "setup_tobi", version: 1 }, () => ({
  agent_id: agent.id,
  thread_id: f.thread.id,
  welcome_message_id: f.store.answer(rich.run.id)?.id,
}));
new Machines(f.lifecycle, null);
let api = createApi(f.lifecycle, new Background(f.lifecycle), token);
const receipts: unknown[] = [];
let dropNext = false;
let holdNext = false;
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
    if (path === "/_hold-next") {
      holdNext = true;
      return Response.json({ armed: true });
    }
    if (path === "/_proof")
      return Response.json({
        receipts,
        identities,
        counts: Object.fromEntries(
          ["agent", "thread", "message", "run", "human_request", "artifact"].map((kind) => [
            kind,
            f.store.list(kind as "agent").length,
          ]),
        ),
        requests: f.store.list("human_request"),
        runs: f.store.list("run").map(({ id, thread_id, status, input_message_id }) => ({
          id,
          thread_id,
          status,
          input_message_id,
        })),
      });
    if (path === "/_restart") {
      f.restart();
      new Machines(f.lifecycle, null);
      api = createApi(f.lifecycle, new Background(f.lifecycle), token);
      return Response.json({ restarted: true });
    }
    const body = request.method === "POST" ? await request.clone().text() : null;
    const response = await api.handle(request);
    receipts.push({
      method: request.method,
      path,
      status: response.status,
      key: request.headers.get("Idempotency-Key"),
      body,
    });
    if (request.method === "POST" && response.ok && dropNext) {
      dropNext = false;
      return Response.json(
        {
          error: {
            code: "PROOF_ACK_LOST",
            message: "The test withheld the committed acknowledgement.",
          },
        },
        { status: 502 },
      );
    }
    if (request.method === "POST" && holdNext) {
      holdNext = false;
      await Bun.sleep(1800);
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
writeFileSync(`${directory}/identities.json`, JSON.stringify(identities), { mode: 0o600 });
console.log(
  `Native parity API ready at ${server.url.origin}; ${Object.keys(identities).length} identity references; no provider executor`,
);
process.on("SIGTERM", () => {
  server.stop(true);
  f.close();
  process.exit(0);
});
