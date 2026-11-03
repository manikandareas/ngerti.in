import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION, type Entity } from "../../../apps/server/src/contracts";
import { detectHarness } from "../../../apps/server/src/harness/availability";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";
import { type Expectation, type Scenario, scenarios } from "./cases";

const output = resolve(process.argv[2] ?? "docs/verification/goal-capture/native.json");
const families = (process.argv[3] ?? "codex,muse").split(",");
assert(families.every((family) => family === "codex" || family === "muse"));
const selected = process.argv[4]?.split(",");
const source = resolve(process.env.NGERTIIN_AUTH_SOURCE ?? ".dev/harness-first");
const root = mkdtempSync(join(tmpdir(), "ngertiin-goal-capture-"));
const sourceDb = new Database(join(source, "ngertiin.sqlite"), { readonly: true });
const sourceConnection = sourceDb
  .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'")
  .all()
  .map(({ body }) => JSON.parse(body) as Entity<"connection">)
  .find(
    (c) =>
      c.harness === "codex" &&
      c.login === "authenticated" &&
      c.authentication.method === "native_login" &&
      c.authentication.billing_source === "subscription",
  );
function sourceRecords() {
  return sourceDb
    .query<{ kind: string; id: string; body: string }, []>(
      "SELECT kind,id,body FROM entities WHERE kind IN ('goal','routine','message','artifact') ORDER BY seq",
    )
    .all();
}
const original = sourceRecords();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const report: {
  contract: string;
  started_at: string;
  finished_at?: string;
  prompt_sha256: string;
  source_sha256: Record<string, string>;
  lanes: { harness: string; version: string | null; billing_source: string; model: string }[];
  results: {
    harness: string;
    scenario: string;
    category: string;
    pass: boolean;
    turns: object[];
    tool_calls?: object[];
    runs?: object[];
    error?: string;
  }[];
  summary?: object;
  original_records?: object;
  error?: string;
} = {
  contract: CONTRACT_VERSION,
  started_at: new Date().toISOString(),
  prompt_sha256: digest(await Bun.file("apps/server/src/goals/instructions.ts").text()),
  source_sha256: Object.fromEntries(
    await Promise.all(
      [
        "apps/server/src/goals/instructions.ts",
        "apps/server/src/goals/contracts.ts",
        "apps/server/src/harness/instructions.ts",
        "apps/server/src/harness/product-tool-contracts.ts",
        "scripts/verification/goal-capture/cases.ts",
      ].map(async (path) => [path, digest(await Bun.file(path).text())]),
    ),
  ),
  lanes: [],
  results: [],
};
let writes = Promise.resolve();
const save = () => {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  writes = writes.then(() => Bun.write(output, text)).then(() => {});
  return writes;
};
const terminal = new Set(["succeeded", "failed", "cancelled", "unknown", "steered"]);

async function evaluate(harness: "codex" | "muse", scenario: Scenario) {
  const directory = join(root, harness, scenario.id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const store = new Store(join(directory, "state.sqlite"), crypto.randomUUID());
  const lifecycle = new Lifecycle(store);
  const tools = new ProductTools(lifecycle);
  const toolCalls: object[] = [];
  const invoke = tools.call.bind(tools);
  tools.call = async (leaseToken, scope, name, input) => {
    const observation: { name: string; input: unknown; error?: string } = { name, input };
    toolCalls.push(observation);
    try {
      return await invoke(leaseToken, scope, name, input);
    } catch (error) {
      observation.error = error instanceof Error ? error.message : "Tool failed";
      throw error;
    }
  };
  const credentials = new CredentialContexts(directory, () => {
    assert(process.env.MUSE_API_KEY, "Explicit Muse API key unavailable.");
    return process.env.MUSE_API_KEY;
  });
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  let app!: ReturnType<typeof createApi>;
  const broker = new HarnessBroker(
    lifecycle,
    credentials,
    tools,
    {
      codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
      muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    },
    (family) =>
      detectHarness(
        family,
        family === "muse"
          ? (process.env.NGERTIIN_MUSE_EXECUTABLE ?? resolve(".dev/nma050/muse"))
          : undefined,
      ),
  );
  const background = new Background(lifecycle, broker.executors());
  const result: (typeof report.results)[number] = {
    harness,
    scenario: scenario.id,
    category: scenario.category,
    pass: false,
    turns: [],
  };
  report.results.push(result);
  async function api<T>(path: string, body: object): Promise<T> {
    const response = await fetch(`http://127.0.0.1:${app.server?.port}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  async function finish(threadId: string, admittedAt: string) {
    const deadline = Date.now() + 180_000;
    let stable = 0;
    while (Date.now() < deadline) {
      const runs = store
        .list("run")
        .filter((r) => r.thread_id === threadId && r.created_at >= admittedAt);
      const tasks = store.list("peer_task").filter((t) => t.thread_id === threadId);
      const unsettled =
        runs.some((r) => !terminal.has(r.status)) ||
        tasks.some((t) => !["completed", "failed", "cancelled", "waiting_user"].includes(t.state));
      if (runs.length && !unsettled && background.activeCount === 0) {
        // Allow the application to finalize evidence and admit any unintended continuation.
        if (++stable >= 5) return;
      } else stable = 0;
      await Bun.sleep(200);
    }
    throw new Error("Native evaluation deadline exceeded; no automatic retry.");
  }
  function check(expected: Expectation, previousGoal?: Entity<"goal">) {
    const goals = store.list("goal"),
      routines = store.list("routine"),
      artifacts = store.list("artifact");
    assert.equal(goals.length, expected.goals, "Goal count");
    assert.equal(routines.length, expected.routines, "Routine identity count");
    assert.equal(artifacts.length, expected.artifacts, "Published artifact count");
    for (const goal of goals) {
      if (expected.work_state)
        assert.equal(goal.work_state, expected.work_state, "Goal work state");
      assert.equal(goal.state, expected.state ?? "active", "Goal lifecycle state");
    }
    if (!expected.goals)
      assert(
        routines.every((r) => r.goal_id === null),
        "Schedules must stand alone",
      );
    if (expected.same_goal) assert.equal(goals[0]?.id, previousGoal?.id, "Preserve Goal identity");
    if (expected.objective_changed) {
      assert(previousGoal, "Correction requires an existing Goal");
      assert(
        (goals[0]?.generation ?? 0) > previousGoal.generation,
        "Correction must advance objective generation",
      );
    }
    if (expected.handoff)
      assert(
        store.list("peer_task").some((t) => t.parent_task_id !== null && t.state === "completed"),
        "Requested peer handoff must complete",
      );
    assert(
      store.list("run").every((r) => r.status === "succeeded"),
      "Every admitted inference must succeed",
    );
  }
  try {
    const connection = new Connections(lifecycle).create({
      harness,
      authentication:
        harness === "codex"
          ? { method: "native_login", billing_source: "subscription" }
          : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() },
    });
    if (harness === "codex") {
      assert(sourceConnection, "Authenticated Codex subscription connection unavailable.");
      const destination = join(directory, "connections", connection.id, "codex");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyFileSync(
        join(source, "connections", sourceConnection.id, "codex", "auth.json"),
        join(destination, "auth.json"),
      );
      chmodSync(join(destination, "auth.json"), 0o600);
    }
    const profile = {
      harness,
      connection_id: connection.id,
      model_id: harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
      billing_source: harness === "codex" ? "subscription" : "api_key",
      reasoning: "medium",
    };
    const agent = lifecycle.createAgent({ ...profile, name: "Coordinator", handle: "coordinator" });
    const peer = scenario.group
      ? lifecycle.createAgent({ ...profile, name: "Reviewer", handle: "reviewer" })
      : null;
    const thread = lifecycle.create("thread", {
      type: scenario.group ? "group" : "dm",
      member_agent_ids: [agent.id, ...(peer ? [peer.id] : [])],
    });
    app = createApi(lifecycle, background, token, {
      connections: broker.connections,
      tools,
      broker,
    }).listen({ hostname: "127.0.0.1", port: 0 });
    background.start(100);
    let previousGoal: Entity<"goal"> | undefined;
    for (const turn of scenario.turns) {
      const admittedAt = new Date().toISOString();
      if (scenario.group)
        await api(`/v1/groups/${thread.id}/messages`, { text: turn.text, agent_id: agent.id });
      else await api("/v1/runs", { thread_id: thread.id, agent_id: agent.id, text: turn.text });
      await finish(thread.id, admittedAt);
      const goals = store.list("goal"),
        routines = store.list("routine");
      const observed = {
        input: turn.text,
        expected: turn.expected,
        goals,
        routines,
        artifacts: store
          .list("artifact")
          .map((a) => ({ id: a.id, name: a.name, size_bytes: a.size_bytes, run_id: a.run_id })),
        messages: store
          .list("message")
          .filter((m) => m.thread_id === thread.id && m.purpose === "conversation")
          .map((m) => ({ author: m.author, text: m.text, run_id: m.run_id })),
      };
      result.turns.push(observed);
      check(turn.expected, previousGoal);
      previousGoal = goals[0];
    }
    result.pass = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Evaluation failed";
  } finally {
    await background.stop();
    await broker.close();
    await tools.browsers.shutdown();
    if (app?.server) await app.stop(true);
    result.runs = store.list("run").map((r) => ({
      id: r.id,
      status: r.status,
      outcome: r.outcome,
      goal_id: r.goal_id,
      routine_id: r.routine_id,
      task_id: r.task_id,
      product_tools: r.product_tools,
      diagnostic: r.diagnostic,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    result.tool_calls = toolCalls;
    store.close();
    rmSync(directory, { recursive: true, force: true });
    await save();
    console.log(
      JSON.stringify({ harness, scenario: scenario.id, pass: result.pass, error: result.error }),
    );
  }
}

try {
  const reminderDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const cases = scenarios(reminderDate).filter((c) => !selected || selected.includes(c.id));
  assert(cases.length, "No scenarios selected");
  await Promise.all(
    families.map(async (family) => {
      const harness = family as "codex" | "muse";
      const availability = await detectHarness(
        harness,
        harness === "muse"
          ? (process.env.NGERTIIN_MUSE_EXECUTABLE ?? resolve(".dev/nma050/muse"))
          : undefined,
      );
      assert.equal(availability.state, "supported", `${harness} availability`);
      if (harness === "muse") assert(process.env.MUSE_API_KEY, "Explicit Muse API key unavailable");
      report.lanes.push({
        harness,
        version: availability.version,
        billing_source: harness === "codex" ? "subscription" : "api_key",
        model: harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
      });
      const pending = [...cases];
      await Promise.all(
        Array.from({ length: 2 }, async () => {
          for (let scenario = pending.shift(); scenario; scenario = pending.shift()) {
            await evaluate(harness, scenario);
          }
        }),
      );
    }),
  );
} catch (error) {
  report.error = error instanceof Error ? error.message : "Evaluation failed";
} finally {
  const after = new Map(sourceRecords().map((r) => [`${r.kind}:${r.id}`, r.body]));
  report.original_records = {
    checked: original.length,
    changed_or_missing: original
      .filter((r) => after.get(`${r.kind}:${r.id}`) !== r.body)
      .map((r) => ({ kind: r.kind, id: r.id })),
    before_sha256: digest(JSON.stringify(original)),
  };
  sourceDb.close();
  report.finished_at = new Date().toISOString();
  const falsePositives = report.results.filter(
    (r) =>
      !r.pass &&
      r.turns.some((t) => {
        const turn = t as { expected: Expectation; goals: Entity<"goal">[] };
        return turn.expected.goals === 0 && turn.goals.length > 0;
      }),
  );
  const falseNegatives = report.results.filter(
    (r) =>
      !r.pass &&
      r.turns.some((t) => {
        const turn = t as { expected: Expectation; goals: Entity<"goal">[] };
        return turn.expected.goals > 0 && turn.goals.length === 0;
      }),
  );
  report.summary = {
    scenarios: report.results.length,
    passed: report.results.filter((r) => r.pass).length,
    failed: report.results.filter((r) => !r.pass).length,
    false_positive_scenarios: falsePositives.map((r) => `${r.harness}/${r.scenario}`),
    false_negative_scenarios: falseNegatives.map((r) => `${r.harness}/${r.scenario}`),
    admitted_runs: report.results.flatMap((r) => r.runs ?? []).length,
  };
  await save();
  rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify(report.summary));
if (report.error || report.results.some((r) => !r.pass)) process.exitCode = 1;
