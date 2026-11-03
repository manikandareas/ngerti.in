import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import type { Entity } from "../../../apps/server/src/contracts";
import { routeResult } from "../../../apps/server/src/groups/contracts";
import { nativeRoutingPrompt } from "../../../apps/server/src/groups/native-routing";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";
import { datasetHash, perturb, routingCases } from "./cases";

const historical = process.argv[2] === "historical";
const output = historical
  ? "docs/verification/jev-routing-v3/historical-fallback.json"
  : "docs/verification/jev-routing-v3/fallback-quality.json";
const source = resolve(".dev/harness-first");
const directory = mkdtempSync(join(tmpdir(), "ngertiin-semantic-fallback-"));
const sourceDb = new Database(join(source, "ngertiin.sqlite"), { readonly: true });
const sourceCodex = sourceDb
  .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'")
  .all()
  .map((row) => JSON.parse(row.body) as Entity<"connection">)
  .find(
    (connection) =>
      connection.harness === "codex" &&
      connection.state === "active" &&
      connection.login === "authenticated" &&
      connection.authentication.billing_source === "subscription",
  );
assert(sourceCodex);
const store = new Store(join(directory, "state.sqlite"), crypto.randomUUID());
const lifecycle = new Lifecycle(store);
const toolCalls: { run_id: string; name: string }[] = [];
const tools = new ProductTools(lifecycle, (scope, name) =>
  toolCalls.push({ run_id: scope.run_id, name }),
);
const runtime = new HarnessRuntime({ codex: "/opt/homebrew/bin/codex" });
let app!: ReturnType<typeof createApi>;
const broker = new HarnessBroker(
  lifecycle,
  new CredentialContexts(directory),
  tools,
  { codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`) },
  runtime.detect,
);
const background = new Background(lifecycle, broker.executors(), () => {}, 3);
const base = routingCases().filter((sample) => sample.split === "test");
const synthetic = [
  ...base,
  ...base
    .filter((sample) => sample.expected.length === 1)
    .flatMap((sample) => [
      perturb(sample, "reverse"),
      perturb(sample, "rename"),
      perturb(sample, "irrelevant_history"),
    ]),
];
const historicalPackets = historical
  ? await Bun.file(".dev/jev-routing-v3/historical-packets.json").json()
  : [];
const all: {
  id: string;
  family: string;
  expected: string[];
  packet: import("../../../apps/server/src/groups/router").RoutingPacket;
}[] = historical ? historicalPackets : synthetic;
type FastRow = {
  id: string;
  expected: string[];
  actual: string | null;
  accepted: boolean;
  correct: boolean;
  duration_ms: number;
};
const fastReports = await Promise.all(
  (historical
    ? ["historical-replay", "historical-replay-renamed"]
    : ["semantic-test", "semantic-invariance"]
  ).map((name) => Bun.file(`docs/verification/jev-routing-v3/${name}.json`).json()),
);
const fast = fastReports
  .flatMap((report, index) =>
    report.results.filter(
      (row: { variant?: string }) =>
        !historical || index === 1 || row.variant !== "renamed_members",
    ),
  )
  .map((row) =>
    historical
      ? {
          ...row,
          id: row.variant,
          expected: all.find((sample) => sample.id === row.variant)!.expected,
        }
      : row,
  ) as FastRow[];
const pending = fast.filter((row) => !row.accepted);
const results: object[] = [];
const report: Record<string, unknown> = {
  captured_at: new Date().toISOString(),
  dataset_sha256: historical ? null : datasetHash(),
  scope: historical
    ? "Classification-only native fallback for unaccepted historical replay decisions; original database read-only, no user group writes."
    : "Classification-only native Codex subscription fallback for every unaccepted final-test and invariance input. Exact production prompt helper; synthetic metadata only, no task execution, no uploaded files, no user group writes.",
  cases: pending.length,
  results,
};
report.source_sha256 = Object.fromEntries(
  await Promise.all(
    [
      "apps/server/src/groups/native-routing.ts",
      "apps/server/src/groups/routing-judgments.ts",
      "apps/server/src/groups/routing-context.ts",
      "apps/server/src/groups/service.ts",
    ].map(async (path) => [
      path,
      createHash("sha256")
        .update(await Bun.file(path).text())
        .digest("hex"),
    ]),
  ),
);
const save = () => Bun.write(output, JSON.stringify(report, null, 2) + "\n");
let cursor = 0;
try {
  const connection = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const home = join(directory, "connections", connection.id, "codex");
  mkdirSync(home, { recursive: true, mode: 0o700 });
  copyFileSync(
    join(source, "connections", sourceCodex.id, "codex", "auth.json"),
    join(home, "auth.json"),
  );
  chmodSync(join(home, "auth.json"), 0o600);
  app = createApi(lifecycle, background, crypto.randomUUID().replaceAll("-", "").repeat(2), {
    broker,
    tools,
    connections: broker.connections,
    detect: runtime.detect,
  }).listen({ hostname: "127.0.0.1", port: 0 });
  report.runtime = await runtime.detect("codex");
  background.start();
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        const sample = all.find((sample) => sample.id === row.id)!;
        assert(sample);
        const packet = structuredClone(sample.packet);
        const identities = new Map(
          packet.members.map((member) => [
            member.agent_id,
            lifecycle.createAgent({
              name: member.name,
              soul: member.soul,
              instructions: member.instructions,
              harness: "codex",
              connection_id: connection.id,
              model_id: "gpt-6.1-sol",
              reasoning: "medium",
              billing_source: "subscription",
            }).id,
          ]),
        );
        const mapId = (id: string | null) => (id ? (identities.get(id) ?? id) : null);
        for (const member of packet.members) member.agent_id = mapId(member.agent_id)!;
        for (const message of packet.history) message.agent_id = mapId(message.agent_id);
        for (const task of packet.active_tasks ?? []) task.agent_id = mapId(task.agent_id)!;
        for (const task of packet.interactions ?? []) {
          task.agent_id = mapId(task.agent_id)!;
          task.source_agent_id = mapId(task.source_agent_id);
        }
        if (packet.origin) packet.origin.actor_id = mapId(packet.origin.actor_id);
        const group = lifecycle.create("thread", {
          type: "group",
          member_agent_ids: packet.members.map((member) => member.agent_id),
        });
        assert(group.kind === "thread");
        const thread = store.put({
          ...group,
          id: crypto.randomUUID(),
          revision: 1,
          purpose: "routing",
          group_thread_id: group.id,
          member_agent_ids: [packet.members[0].agent_id],
        });
        const started = performance.now();
        const admitted = lifecycle.admit({
          thread_id: thread.id,
          agent_id: packet.members[0].agent_id,
          text: nativeRoutingPrompt(packet),
        }).run;
        const deadline = Date.now() + 120_000;
        while (
          !["succeeded", "failed", "cancelled", "unknown"].includes(
            store.get("run", admitted.id).status,
          ) &&
          Date.now() < deadline
        )
          await Bun.sleep(50);
        const run = store.get("run", admitted.id);
        const answer = store.answer(run.id)?.text;
        let actual: string | null = null;
        let parseError: string | null = null;
        let clarification: string | null = null;
        try {
          assert.equal(run.status, "succeeded");
          const parsed = routeResult.parse(JSON.parse(answer ?? "null"));
          if ("agent_id" in parsed) {
            actual = [...identities].find(([, id]) => id === parsed.agent_id)?.[0] ?? null;
            assert(actual, "Fallback must select a current member.");
          } else clarification = parsed.question ?? null;
        } catch (error) {
          parseError = error instanceof Error ? error.message : "Invalid native result";
        }
        const correct =
          !parseError && (actual ? row.expected.includes(actual) : row.expected.length === 0);
        results.push({
          id: row.id,
          family: sample.family,
          expected: row.expected,
          actual,
          correct,
          status: run.status,
          error: parseError,
          clarification,
          duration_ms: Math.round(performance.now() - started),
          timings: run.timings,
          tools: run.product_tools,
          answer,
        });
        await save();
        console.log(
          JSON.stringify({
            completed: results.length,
            total: pending.length,
            id: row.id,
            correct,
            status: run.status,
          }),
        );
        assert(
          !["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
          "Reconcile uncertain native work; never replay blindly.",
        );
      }
    }),
  );
  report.tool_calls = toolCalls;
  assert.equal(toolCalls.length, 0);
  assert.equal(store.list("peer_task").length, 0);
  assert.equal(store.list("goal").length, 0);
  assert.equal(store.list("routine").length, 0);
  report.summary = {
    cases: results.length,
    correct: results.filter((row) => (row as { correct: boolean }).correct).length,
    tool_calls: toolCalls.length,
    executed_tasks: 0,
  };
} catch (error) {
  report.error = error instanceof Error ? error.message : "Fallback verification failed.";
  process.exitCode = 1;
} finally {
  await background.stop();
  await broker.close();
  await tools.browsers.shutdown();
  if (app) await app.stop(true);
  const active = store
    .list("run")
    .filter((run) =>
      ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
    ).length;
  report.finished_at = new Date().toISOString();
  report.cleanup = {
    active_runs: active,
    isolated_credentials_removed: active === 0,
    source_database_mode: "readonly",
  };
  await save();
  store.close();
  sourceDb.close();
  if (active === 0) rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ output, summary: report.summary, error: report.error }));
}
