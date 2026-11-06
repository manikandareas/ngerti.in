import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { Groups } from "../src/groups/service";
import { RunControls } from "../src/run-controls";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
test("retry retains original input and responder without another user message and hides only its failed attempt", () => {
  f = fixture();
  f.bind();
  const { message } = f.admit("Original request");
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  f.lifecycle.appendAnswer(run.id, "Incomplete output");
  f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  const failed = f.store.get("run", run.id);
  const next = new RunControls(f.lifecycle).retry(run.id, failed.revision);
  expect(next).toMatchObject({
    input_message_id: message.id,
    agent_id: f.agent.id,
    retry_of_run_id: run.id,
    status: "queued",
  });
  expect(f.store.list("message").filter((m) => m.author === "user")).toHaveLength(1);
  expect(f.store.get("run", run.id).retried_by_run_id).toBe(next.id);
  expect(() => new RunControls(f.lifecycle).retry(run.id, failed.revision)).toThrow("CONFLICT");
  expect(f.store.answer(run.id)?.text).toBe("Incomplete output");
});
test("successful and unknown runs cannot be retried", () => {
  for (const status of ["succeeded", "unknown"] as const) {
    f = fixture();
    f.bind();
    f.admit();
    const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
    assert(run?.dispatch_token);
    f.lifecycle.started(run.id, run.dispatch_token, "native");
    f.lifecycle.settle(run.id, run.dispatch_token, status);
    expect(() =>
      new RunControls(f.lifecycle).retry(run.id, f.store.get("run", run.id).revision),
    ).toThrow("CONFLICT");
    f.close();
  }
});

test("an unknown external receipt blocks retry even when the model reports failure", () => {
  f = fixture();
  f.bind();
  f.admit();
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  const now = new Date().toISOString();
  f.store.put({
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
  f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  const failed = f.store.get("run", run.id);
  expect(failed.retry_allowed).toBe(false);
  expect(() => new RunControls(f.lifecycle).retry(run.id, failed.revision)).toThrow(
    "RECONCILIATION_REQUIRED",
  );
});

test("group input can be edited before dispatch but retry never unlocks an already processed input", () => {
  f = fixture();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  const route = new Groups(f.lifecycle).send(group.id, { agent_id: f.agent.id, text: "Original" });
  const controls = new RunControls(f.lifecycle);
  const edited = controls.edit(route.message_id, {
    expected_revision: f.store.get("message", route.message_id).revision,
    text: "Queued correction",
  });
  f.lifecycle.bind(group.id, f.agent.id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(group.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  f.lifecycle.settle(run.id, run.dispatch_token, "failed");
  controls.retry(run.id, f.store.get("run", run.id).revision);
  expect(() =>
    controls.edit(route.message_id, {
      expected_revision: edited.revision,
      text: "Changed processed input",
    }),
  ).toThrow("CONFLICT");
  expect(f.store.get("message", route.message_id).text).toBe("Queued correction");
});
