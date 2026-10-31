import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Groups } from "../../../apps/server/src/groups/service";
import { Connections } from "../../../apps/server/src/harness/connections";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const mode = process.argv[2];
const directory = resolve(process.argv[3] ?? ".dev/nma056/crash-state");
if (mode === "seed") {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const owner = crypto.randomUUID();
  const store = new Store(join(directory, "state.sqlite"), owner);
  const lifecycle = new Lifecycle(store);
  const groups = new Groups(lifecycle);
  const connection = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agents = ["Coordinator", "Reviewer"].map((name) =>
    lifecycle.createAgent({ name, harness: "codex", connection_id: connection.id }),
  );
  const thread = lifecycle.create("thread", {
    type: "group",
    member_agent_ids: agents.map((a) => a.id),
  });
  const send = { text: "Review a result and ask me for input.", agent_id: agents[0].id };
  const sendKey = crypto.randomUUID();
  const handoffKey = crypto.randomUUID();
  const askKey = crypto.randomUUID();
  const route = store.command(sendKey, send, () => groups.send(thread.id, send));
  const root = store.get("peer_task", route.task_id as string);
  const run = (agentId: string) => {
    lifecycle.bind(thread.id, agentId, crypto.randomUUID());
    const item = lifecycle.claimNext(thread.id, agentId);
    assert(item?.dispatch_token);
    lifecycle.started(item.id, item.dispatch_token, crypto.randomUUID());
    return store.get("run", item.id);
  };
  const source = run(agents[0].id);
  const handoff = {
    agent_id: agents[1].id,
    instruction: "Independently review the calculation.",
    purpose: "review",
  };
  const child = store.command(handoffKey, handoff, () => groups.handoff(source.id, handoff));
  lifecycle.appendAnswer(source.id, "Waiting for peer.");
  lifecycle.settle(source.id, source.dispatch_token as string, "succeeded");
  const peer = run(agents[1].id);
  const ask = { purpose: "input", question: "Short or detailed?" };
  const request = store.command(askKey, ask, () => groups.askUser(peer.id, ask));
  lifecycle.appendAnswer(peer.id, "Reviewed result; waiting for input.");
  lifecycle.settle(peer.id, peer.dispatch_token as string, "succeeded");
  groups.advance();
  await Bun.write(
    join(directory, "probe.json"),
    JSON.stringify({
      owner,
      thread: thread.id,
      root: root.id,
      child: child.id,
      request: request.id,
      sendKey,
      send,
      handoffKey,
      handoff,
      askKey,
      ask,
      source: source.id,
      peer: peer.id,
      cursor: store.cursor,
    }),
  );
  console.log("committed");
  await new Promise(() => {});
} else {
  assert.equal(mode, "verify", "Usage: bun crash.ts verify <fresh-state-directory> [report-path]");
  assert(!existsSync(directory), "Use a fresh directory; this probe never resets existing state.");
  const child = Bun.spawn([process.execPath, import.meta.path, "seed", directory], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  let output = "";
  while (!output.includes("committed")) {
    const chunk = await reader.read();
    assert(!chunk.done);
    output += new TextDecoder().decode(chunk.value);
  }
  child.kill("SIGKILL");
  await child.exited;
  const probe = await Bun.file(join(directory, "probe.json")).json();
  let store = new Store(join(directory, "state.sqlite"), probe.owner);
  let lifecycle = new Lifecycle(store);
  let groups = new Groups(lifecycle);
  const checks: string[] = [];
  assert.equal(store.get("peer_task", probe.root).state, "waiting_peer");
  assert.equal(store.get("peer_task", probe.child).state, "waiting_user");
  assert.equal(store.get("human_request", probe.request).state, "pending");
  checks.push("committed_handoff_and_hitl_survive_sigkill");
  const count = store.list("message").length;
  assert.equal(
    store.command(probe.sendKey, probe.send, () => groups.send(probe.thread, probe.send)).task_id,
    probe.root,
  );
  assert.equal(
    store.command(probe.handoffKey, probe.handoff, () =>
      groups.handoff(probe.source, probe.handoff),
    ).id,
    probe.child,
  );
  assert.equal(
    store.command(probe.askKey, probe.ask, () => groups.askUser(probe.peer, probe.ask)).id,
    probe.request,
  );
  assert.equal(store.list("message").length, count);
  assert.equal(store.cursor, probe.cursor);
  checks.push("three_command_receipts_replay_without_events_or_duplicates");
  const key = crypto.randomUUID();
  const reply = { expected_revision: 1, text: "Short." };
  store.command(key, reply, () => groups.reply(probe.request, reply));
  groups.advance();
  groups.advance();
  const resumed = store.get("peer_task", probe.child);
  assert.equal(resumed.continuation, 1);
  assert.equal(
    store.get("human_request", probe.request).continuation_run_id,
    resumed.current_run_id,
  );
  checks.push("exact_request_reply_admits_one_child_continuation");
  const after = store.list("run").length;
  store.close();
  store = new Store(join(directory, "state.sqlite"), probe.owner);
  lifecycle = new Lifecycle(store);
  groups = new Groups(lifecycle);
  store.command(key, reply, () => groups.reply(probe.request, reply));
  groups.advance();
  groups.advance();
  assert.equal(store.list("run").length, after);
  checks.push("restart_and_lost_reply_ack_do_not_enqueue_again");
  const queued = store.get("run", resumed.current_run_id);
  const next = lifecycle.claimNext(queued.thread_id, queued.agent_id);
  assert(next?.dispatch_token);
  lifecycle.started(next.id, next.dispatch_token, crypto.randomUUID());
  // Simulate a lost native completion. Normal recovery holds this lane until a matching native receipt exists.
  store.close();
  store = new Store(join(directory, "state.sqlite"), probe.owner);
  lifecycle = new Lifecycle(store);
  groups = new Groups(lifecycle);
  groups.advance();
  groups.advance();
  assert.equal(store.get("run", next.id).status, "unknown");
  assert.equal(store.list("run").length, after);
  assert.equal(store.get("peer_task", probe.root).state, "waiting_peer");
  checks.push("unknown_native_outcome_keeps_parent_held_without_replay");
  store.close();
  const report = process.argv[4] ?? "docs/verification/nma-056/logs/crash.json";
  await Bun.write(
    report,
    `${JSON.stringify({ planned: 5, passed: checks.length, failed: 0, skipped: 0, checks, scope: "application SIGKILL/SQLite recovery fixture; no provider crash or power-loss claim" }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ report, checks: checks.length }));
}
