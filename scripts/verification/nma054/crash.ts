import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Artifacts } from "../../../apps/server/src/artifacts";
import type { Entity } from "../../../apps/server/src/contracts";
import { Connections } from "../../../apps/server/src/harness/connections";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const root = resolve(process.argv[2] ?? ".dev/nma054/crash-state");
mkdirSync(root, { recursive: true, mode: 0o700 });
if (process.argv[3] === "child") {
  const owner = process.argv[4];
  const store = new Store(join(root, "state.sqlite"), owner);
  const lifecycle = new Lifecycle(store);
  const connection = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = lifecycle.createAgent({
    name: "Crash fixture",
    connection_id: connection.id,
    harness: "codex",
  });
  const thread = lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  }) as Entity<"thread">;
  const files = new Artifacts(lifecycle);
  const workspace = files.workspaces.ensure(thread.id, agent.id);
  lifecycle.bind(thread.id, agent.id, "fixture-session", workspace);
  const admitted = lifecycle.admit({
    thread_id: thread.id,
    agent_id: agent.id,
    text: "Fixture: publish local output.",
  });
  const run = lifecycle.claimNext(thread.id, agent.id);
  assert(run?.dispatch_token);
  lifecycle.started(run.id, run.dispatch_token, "fixture-turn");
  writeFileSync(join(files.workspaces.path(workspace), "result.txt"), "durable result\n");
  writeFileSync(join(files.workspaces.path(workspace), "untouched.txt"), "keep\n");
  const artifact = files.publish(
    crypto.randomUUID(),
    { workspace_id: workspace.id, run_id: run.id, path: "result.txt" },
    () => lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
  console.log(
    JSON.stringify({
      artifact_id: artifact.id,
      workspace_id: workspace.id,
      run_id: admitted.run.id,
      cursor: store.cursor,
    }),
  );
  await new Promise(() => {});
} else {
  const owner = crypto.randomUUID();
  const child = Bun.spawn([process.execPath, import.meta.path, root, "child", owner], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  let buffered = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        while (!buffered.includes("\n")) {
          const chunk = await reader.read();
          assert(!chunk.done, "Fixture exited before publishing its receipt.");
          buffered += new TextDecoder().decode(chunk.value);
        }
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Crash fixture deadline expired.")), 15_000);
      }),
    ]);
    const receipt = JSON.parse(buffered.split("\n")[0]);
    child.kill("SIGKILL");
    await child.exited;
    const store = new Store(join(root, "state.sqlite"), owner);
    try {
      const lifecycle = new Lifecycle(store);
      const files = new Artifacts(lifecycle);
      assert.equal(store.get("run", receipt.run_id).status, "unknown");
      assert.equal(
        files.download(receipt.artifact_id, receipt.workspace_id).bytes.toString(),
        "durable result\n",
      );
      lifecycle.cancel(receipt.run_id);
      assert.equal(store.list("artifact").length, 1);
      assert.equal(
        files.workspaces.files(receipt.workspace_id).read("untouched.txt").toString(),
        "keep\n",
      );
      assert.equal(
        store.events(0, 1000).filter((event) => event.entity_kind === "artifact").length,
        1,
      );
      const report = {
        status: "pass",
        evidence_level: "process_fixture_not_provider_crash",
        checks: 5,
        receipt,
        outcome: "unknown",
        replayed_native_requests: 0,
        artifacts: 1,
      };
      await Bun.write("docs/verification/nma-054/crash.json", JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
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
