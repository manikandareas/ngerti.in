import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApplicationSkills } from "../../../apps/server/src/learning/application-skills";
import { Connections } from "../../../apps/server/src/harness/connections";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Memories } from "../../../apps/server/src/learning/memories";
import { Store } from "../../../apps/server/src/store";

const root = resolve(process.argv[2]);
mkdirSync(root, { recursive: true, mode: 0o700 });
if (process.argv[3] === "child") {
  const store = new Store(join(root, "state.sqlite"), process.argv[4]);
  const lifecycle = new Lifecycle(store);
  const connections = new Connections(lifecycle);
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const agent = lifecycle.createAgent({
    name: "Learning crash fixture",
    connection_id: connection.id,
    harness: "codex",
  });
  const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
  lifecycle.bind(thread.id, agent.id, "fixture-native-session");
  lifecycle.admit({
    thread_id: thread.id,
    agent_id: agent.id,
    text: "Persist local learning changes.",
  });
  const run = lifecycle.claimNext(thread.id, agent.id);
  assert(run?.dispatch_token);
  lifecycle.started(run.id, run.dispatch_token, "fixture-native-turn");
  const tools = new ProductTools(lifecycle);
  const lease = tools.issue(store.get("run", run.id));
  const context = { agent_id: agent.id, thread_id: thread.id };
  const memoryId = crypto.randomUUID();
  const write = {
    memory_id: memoryId,
    expected_revision: 0,
    visibility: "dm_private",
    text: "Original fact",
  };
  const memoryCommand = crypto.randomUUID();
  await tools.call(lease.token, lease.scope, "ngertiin.write_memory", {
    ...write,
    command_id: memoryCommand,
  });
  await tools.call(lease.token, lease.scope, "ngertiin.delete_memory", {
    command_id: crypto.randomUUID(),
    memory_id: memoryId,
    expected_revision: 1,
  });
  const input = {
    name: "crash-report",
    visibility: "dm_private",
    package: {
      description: "Durable report",
      instructions: "Read the immutable asset.",
      assets: [{ path: "references/value.txt", text: "durable asset\n" }],
    },
  };
  const commandId = crypto.randomUUID();
  const saved = (await tools.call(lease.token, lease.scope, "ngertiin.create_skill", {
    ...input,
    command_id: commandId,
  })) as { skill: { id: string } };
  await tools.call(lease.token, lease.scope, "ngertiin.assign_skill", {
    command_id: crypto.randomUUID(),
    skill_id: saved.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  console.log(
    JSON.stringify({
      context,
      run_id: run.id,
      skill_id: saved.skill.id,
      command_id: commandId,
      input,
      memory_id: memoryId,
      memory_command: memoryCommand,
      memory_input: write,
    }),
  );
  await new Promise(() => {});
} else {
  const reportPath = process.argv[3] ?? "docs/verification/nma-055/crash.json";
  const owner = crypto.randomUUID();
  const child = Bun.spawn([process.execPath, import.meta.path, root, "child", owner], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let data = "";
    await Promise.race([
      (async () => {
        while (!data.includes("\n")) {
          const item = await reader.read();
          assert(!item.done);
          data += new TextDecoder().decode(item.value);
        }
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Crash fixture deadline expired.")), 15_000);
      }),
    ]);
    const receipt = JSON.parse(data.split("\n")[0]);
    child.kill("SIGKILL");
    await child.exited;
    const store = new Store(join(root, "state.sqlite"), owner);
    try {
      const lifecycle = new Lifecycle(store);
      const skills = new ApplicationSkills(lifecycle);
      const before = store.cursor;
      const replay = store.command(
        receipt.command_id,
        { operation: "ngertiin.create_skill", ...receipt.context, input: receipt.input },
        () => {
          throw new Error("Must not replay an already committed mutation.");
        },
      );
      assert.equal(replay.skill.id, receipt.skill_id);
      store.command(
        receipt.memory_command,
        { operation: "ngertiin.write_memory", ...receipt.context, input: receipt.memory_input },
        () => {
          throw new Error("Must not restore deleted memory.");
        },
      );
      assert.equal(store.cursor, before);
      assert.equal(new Memories(lifecycle).recall(receipt.context).memories.length, 0);
      assert.equal(store.get("memory", receipt.memory_id).state, "deleted");
      assert.equal(
        skills.read(receipt.context, { skill_id: receipt.skill_id, version: 1 }).revision.package
          .assets[0].text,
        "durable asset\n",
      );
      assert.equal(skills.inventory(receipt.context).application[0].assignment?.version, 1);
      assert.equal(store.list("skill_revision").length, 1);
      assert.equal(store.list("skill_assignment").length, 1);
      assert.equal(store.get("run", receipt.run_id).status, "unknown");
      const report = {
        status: "pass",
        evidence_level: "sigkill_process_fixture_not_provider_crash_or_power_loss",
        checks: 9,
        receipt,
        replayed_native_requests: 0,
        extra_events_on_retry: 0,
      };
      await Bun.write(reportPath, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          status: report.status,
          checks: report.checks,
          replayed_native_requests: 0,
        }),
      );
    } finally {
      store.close();
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await child.exited;
    }
  }
}
