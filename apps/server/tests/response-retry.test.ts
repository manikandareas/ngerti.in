import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { Groups } from "../src/groups/service";
import { RunControls } from "../src/run-controls";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
test("retry retains original input and responder without another user message and hides only its failed attempt", async () => {
  f = await fixture();
  await f.bind();
  const { message } = await f.admit("Original request");
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  await f.lifecycle.appendAnswer(run.id, "Incomplete output");
  await f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  const failed = await f.store.get("run", run.id);
  const next = await new RunControls(f.lifecycle).retry(run.id, failed.revision);
  expect(next).toMatchObject({
    input_message_id: message.id,
    agent_id: f.agent.id,
    retry_of_run_id: run.id,
    status: "queued",
  });
  expect((await f.store.list("message")).filter((m) => m.author === "user")).toHaveLength(1);
  expect((await f.store.get("run", run.id)).retried_by_run_id).toBe(next.id);
  await expect(
    (async () => new RunControls(f.lifecycle).retry(run.id, failed.revision))(),
  ).rejects.toThrow("CONFLICT");
  expect((await f.store.answer(run.id))?.text).toBe("Incomplete output");
});
test("successful and unknown runs cannot be retried", async () => {
  for (const status of ["succeeded", "unknown"] as const) {
    f = await fixture();
    await f.bind();
    await f.admit();
    const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
    assert(run?.dispatch_token);
    await f.lifecycle.started(run.id, run.dispatch_token, "native");
    await f.lifecycle.settle(run.id, run.dispatch_token, status);
    await expect(
      (async () =>
        new RunControls(f.lifecycle).retry(run.id, (await f.store.get("run", run.id)).revision))(),
    ).rejects.toThrow("CONFLICT");
    await f.close();
  }
});

test("an unknown external receipt blocks retry even when the model reports failure", async () => {
  f = await fixture();
  await f.bind();
  await f.admit();
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  const now = new Date().toISOString();
  await f.store.put({
    id: crypto.randomUUID(),
    owner_id: f.owner,
    revision: 1,
    created_at: now,
    updated_at: now,
    kind: "machine_operation",
    machine_id: crypto.randomUUID(),
    generation: 1,
    agent_id: f.agent.id,
    thread_id: f.thread.id,
    run_id: run.id,
    name: "unknown-effect",
    fingerprint: "fixture",
    resource: null,
    expected_sha256: null,
    reconciled_at: null,
    state: "unknown",
    result: null,
    error_code: "MACHINE_UNKNOWN",
  });
  await f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  const failed = await f.store.get("run", run.id);
  expect(failed.retry_allowed).toBe(false);
  await expect(
    (async () => new RunControls(f.lifecycle).retry(run.id, failed.revision))(),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
});

test("group input can be edited before dispatch but retry never unlocks an already processed input", async () => {
  f = await fixture();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  const route = await new Groups(f.lifecycle).send(group.id, {
    agent_id: f.agent.id,
    text: "Original",
  });
  const controls = new RunControls(f.lifecycle);
  const edited = await controls.edit(route.message_id, {
    expected_revision: (await f.store.get("message", route.message_id)).revision,
    text: "Queued correction",
  });
  await f.lifecycle.bind(group.id, f.agent.id, crypto.randomUUID());
  const run = await f.lifecycle.claimNext(group.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  await f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  await controls.retry(run.id, (await f.store.get("run", run.id)).revision);
  await expect(
    (async () =>
      controls.edit(route.message_id, {
        expected_revision: edited.revision,
        text: "Changed processed input",
      }))(),
  ).rejects.toThrow("CONFLICT");
  expect((await f.store.get("message", route.message_id)).text).toBe("Queued correction");
});
