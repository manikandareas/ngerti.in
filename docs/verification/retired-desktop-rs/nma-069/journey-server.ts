/** Disposable real-API contextual journeys. No executor, scheduler or external apps. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApi } from "../../../server/src/api";
import { Artifacts } from "../../../server/src/artifacts";
import { Background } from "../../../server/src/background";
import { Connections } from "../../../server/src/harness/connections";
import { ApplicationSkills } from "../../../server/src/learning/application-skills";
import { Memories } from "../../../server/src/learning/memories";
import { Machines } from "../../../server/src/machines/service";
import { fixture } from "../../../server/tests/helpers";
import { treeProofResponse } from "./tree-proof";

const f = fixture();
const directory = resolve(process.argv[2] ?? ".dev/nma069-journey");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const token = crypto.randomUUID() + crypto.randomUUID();
writeFileSync(`${directory}/token`, token, { mode: 0o600 });
const connections = new Connections(f.lifecycle);
const connection = connections.get(f.agent.connection_id);
connections.update(connection, {
  login: "authenticated",
  discovery: "succeeded",
  effective_billing_source: "subscription",
  models: [{ id: "native-context-proof", reasoning: ["low", "high"], input_modalities: ["text"] }],
});
const agent = f.store.get("agent", f.agent.id);
f.store.put(
  {
    ...agent,
    name: "Tobi",
    system_role: "tobi",
    model_id: "native-context-proof",
    revision: agent.revision + 1,
  },
  agent.revision,
);
const other = f.lifecycle.createAgent({
  name: "Researcher",
  harness: "codex",
  connection_id: connection.id,
});
const group = f.lifecycle.create("thread", {
  type: "group",
  member_agent_ids: [agent.id, other.id],
});
const context = { thread_id: f.thread.id, agent_id: agent.id };
new Memories(f.lifecycle).write(context, {
  memory_id: crypto.randomUUID(),
  expected_revision: 0,
  visibility: "dm_private",
  text: "Keep contextual verification private to this direct conversation.",
});
const skills = new ApplicationSkills(f.lifecycle);
const skill = skills.create(context, {
  name: "context-review",
  visibility: "dm_private",
  package: {
    description: "Review a contextual result",
    instructions: "Inspect the original result and explain the evidence.",
    assets: [],
  },
});
skills.assign(context, {
  skill_id: skill.skill.id,
  version: 1,
  expected_revision: 0,
  enabled: true,
});
const files = new Artifacts(f.lifecycle);
const workspace = files.workspaces.ensure(f.thread.id, agent.id);
files.workspaces.ensure(group.id, agent.id);
f.lifecycle.bind(f.thread.id, agent.id, "native-context-fixture", workspace);
f.admit("Prepare files for the contextual native journey.");
const claimed = f.lifecycle.claimNext(f.thread.id, agent.id);
if (!claimed?.dispatch_token) throw new Error("Missing fixture dispatch");
const dispatchToken = claimed.dispatch_token;
f.lifecycle.started(claimed.id, dispatchToken, "context-fixture-turn");
const run = f.store.get("run", claimed.id);
const originals: Record<string, string> = {};
for (const [name, type, bytes] of [
  [
    "Context report.md",
    "text/markdown",
    Buffer.from(
      "# Context report\n\nNative contextual workflow.\n\n| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n",
    ),
  ],
  ["Results.csv", "text/csv", Buffer.from("Name,Value\r\nAlpha,42\r\nBeta,7\r\n")],
  [
    "Example.ts",
    "text/plain",
    Buffer.from("export const result = { ready: true, value: 42 };\n".repeat(700)),
  ],
  [
    "Document.html",
    "text/html",
    Buffer.from("<h1>Context document</h1><p>Static document body.</p><script>throw 1</script>"),
  ],
  [
    "Reference.pdf",
    "application/pdf",
    readFileSync(resolve(import.meta.dir, "../../assets/probe.pdf")),
  ],
] as const) {
  files.workspaces.files(workspace.id).create(name, bytes);
  const artifact = await files.publish(
    crypto.randomUUID(),
    { workspace_id: workspace.id, run_id: run.id, path: name, media_type: type },
    () => f.lifecycle.authorizeDispatch(run.id, dispatchToken),
  );
  if (!artifact.sha256) throw new Error("Published bytes have no hash");
  originals[name] = artifact.sha256;
}
f.lifecycle.appendAnswer(
  run.id,
  "Prepared the contextual report.\n\n| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n",
);
f.lifecycle.settle(run.id, claimed.dispatch_token, "succeeded");
f.lifecycle.create("goal", {
  thread_id: f.thread.id,
  agent_id: agent.id,
  title: "Review the context report",
});
f.lifecycle.create("routine", {
  thread_id: f.thread.id,
  agent_id: agent.id,
  instruction: "Review the report tomorrow",
  schedule: { type: "once", at: "2027-01-01T01:00:00.000Z" },
  timezone: "Asia/Makassar",
});
// Domain-only runs omit machine projection: sharing exercises the retained
// artifact-copy path. Native runs retain the unavailable-machine capability gate.
if (!process.argv.includes("--domain-only")) new Machines(f.lifecycle, null);
const api = createApi(f.lifecycle, new Background(f.lifecycle), token);
const requests: unknown[] = [];
let withhold = false;
let reject = false;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 90,
  async fetch(request) {
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response(null, { status: 401 });
    const path = new URL(request.url).pathname;
    if (path === "/_drop-next") {
      withhold = true;
      return Response.json({ armed: true });
    }
    if (path === "/_reject-next") {
      reject = true;
      return Response.json({ armed: true });
    }
    if (path === "/_proof")
      return Response.json({
        requests,
        originals,
        counts: Object.fromEntries(
          ["agent", "thread", "message", "artifact", "run"].map((kind) => [
            kind,
            f.store.list(kind as "agent").length,
          ]),
        ),
        messages: f.store
          .list("message")
          .map(({ id, text, artifact_ids }) => ({ id, text, artifact_ids })),
        goals: f.store.list("goal"),
        routines: f.store.list("routine"),
      });
    const body = request.method === "POST" ? await request.clone().text() : null;
    if (reject && path === "/v1/runs") {
      reject = false;
      return Response.json(
        {
          error: { code: "INPUT_TOO_LARGE", message: "The disposable test rejected this message." },
        },
        { status: 413 },
      );
    }
    const response =
      (process.argv.includes("--tree-proof") ? await treeProofResponse(request) : undefined) ??
      (await api.handle(request));
    requests.push({
      method: request.method,
      path,
      status: response.status,
      key: request.headers.get("Idempotency-Key"),
      body,
    });
    if (withhold && request.method === "POST" && response.ok) {
      withhold = false;
      return Response.json(
        {
          error: {
            code: "PROOF_ACK_LOST",
            message: "The disposable proxy withheld a committed acknowledgement.",
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
  JSON.stringify({
    thread: f.thread.id,
    group: group.id,
    agent: agent.id,
    workspace: workspace.id,
    originals,
  }),
  { mode: 0o600 },
);
console.log(
  `Context API ready at ${server.url.origin}; private attachment ${directory}/attachment.json`,
);
process.on("SIGTERM", () => {
  server.stop(true);
  f.close();
  process.exit(0);
});
