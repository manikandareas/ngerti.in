import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createApi } from "../src/api";
import { operationResponse } from "../src/api-responses";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import type { HarnessClient } from "../src/harness/client";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { HarnessError, unknownCapabilities } from "../src/harness/contracts";
import { ProductTools } from "../src/harness/tools";
import { InteractionJournal } from "../src/runs/interaction-journal";
import { fixture } from "./helpers";

const token = "a".repeat(64);
const question = {
  userInputId: "question-1",
  questions: [
    {
      id: "q",
      header: "Storage",
      question: "Which database for this private DM?",
      options: [{ label: "SQLite" }],
      selection: { mode: "single" },
    },
  ],
};
const approval = {
  approvalId: "approval-1",
  toolName: "read_file",
  rawArgs: "sk-fixture-secret",
  currentRequirementId: { approvalId: "approval-1", sourceIndex: 2 },
  availableChoices: [{ choiceId: "deny", decision: "deny", scope: "once", label: "Deny" }],
  subject: { kind: "tool", path: "private.txt" },
};
const questionAnswer = {
  type: "user_input",
  request_id: "question-1",
  answers: [{ questionId: "q", selectedLabel: "SQLite" }],
};
const approvalAnswer = {
  type: "approval",
  request_id: "approval-1",
  source_index: 2,
  choice_id: "deny",
};
let f: ReturnType<typeof fixture>;
let broker: HarnessBroker;
afterEach(async () => {
  await broker?.close();
  f?.close();
});
async function setup(
  options: {
    respond?: HarnessClient["respond"];
    pending?: HarnessClient["interactions"];
    timeout?: number;
  } = {},
) {
  f = fixture();
  let snapshots: unknown = { approvals: [approval], user_inputs: [question] };
  let calls = 0;
  const caps = {
    ...unknownCapabilities,
    product_tools: "supported",
    settings: "supported",
    resume: "supported",
    permission_requests: "supported",
  } as const;
  const native: HarnessClient = {
    async inspect() {
      return {
        login: "authenticated",
        account_id: "fixture-account",
        auth_method: "native_login",
        billing_source: "subscription",
        capabilities: caps,
      };
    },
    async discoverModels() {
      return [{ id: "model-a", reasoning: [] }];
    },
    async start() {
      return { native_session_id: "fixture-session" };
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
    interactions: options.pending ?? (() => snapshots),
    async respond(runId, answer) {
      calls++;
      return options.respond?.(runId, answer);
    },
  };
  const agent = f.lifecycle.create("agent", {
    name: "Native history",
    harness: "codex",
    connection_id: (f.agent as Entity<"agent">).connection_id,
    model_id: "model-a",
  }) as Entity<"agent">;
  const thread = f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  }) as Entity<"thread">;
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir),
    new ProductTools(f.lifecycle),
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
    { request_ms: options.timeout ?? 1000, close_ms: 100 },
  );
  await broker.openSession(thread.id, agent.id);
  const admitted = f.lifecycle.admit({
    thread_id: thread.id,
    agent_id: agent.id,
    text: "Inspect the private request.",
  });
  const claimed = f.lifecycle.claimNext(thread.id, agent.id);
  if (!claimed?.dispatch_token) throw new Error("Fixture dispatch was not claimed.");
  f.lifecycle.started(claimed.id, claimed.dispatch_token, "native-run");
  return {
    run: f.store.get("run", admitted.run.id),
    thread,
    agent,
    native,
    journal: new InteractionJournal(f.store),
    calls: () => calls,
    snapshots: (value: unknown) => {
      snapshots = value;
    },
  };
}
function api(active = false) {
  return createApi(f.lifecycle, new Background(f.lifecycle), token, {
    connections: new Connections(f.lifecycle),
    tools: new ProductTools(f.lifecycle),
    ...(active ? { broker } : {}),
  });
}
async function call(
  app: ReturnType<typeof createApi>,
  path: string,
  body?: unknown,
  authorization = `Bearer ${token}`,
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

test("normalized observations persist once, redact key shapes and remain conversation scoped", async () => {
  const lane = await setup();
  const pending = await broker.interactions(lane.run.id);
  expect(pending.approvals[0]?.rawArgs).toBe("[REDACTED]");
  expect(lane.journal.history(lane.run.id).records).toHaveLength(2);
  const cursor = f.store.cursor;
  await broker.interactions(lane.run.id);
  expect(f.store.cursor).toBe(cursor);
  expect(
    JSON.stringify(await (await call(api(), `/v1/threads/${f.thread.id}/snapshot`)).json()),
  ).not.toContain(question.questions[0]?.question);
  expect(JSON.stringify(f.store.events(0, 1000))).not.toContain("sk-fixture-secret");
});
for (const answer of [questionAnswer, approvalAnswer])
  test(`${answer.type} acknowledgement survives completion/restart without asserting action completion`, async () => {
    const lane = await setup();
    expect(await broker.respond(lane.run.id, answer)).toEqual({ status: "submitted" });
    expect(f.store.get("run", lane.run.id).status).toBe("running");
    const record = lane.journal
      .history(lane.run.id)
      .records.find((entry) => entry.type === answer.type);
    expect(record).toMatchObject({
      observed_state: "pending",
      submission: { state: "submitted", answer },
    });
    lane.snapshots({ approvals: [], user_inputs: [] });
    await broker.interactions(lane.run.id);
    expect(
      lane.journal.history(lane.run.id).records.find((entry) => entry.id === record?.id),
    ).toMatchObject({ observed_state: "not_pending", submission: { state: "submitted" } });
    expect(f.store.get("run", lane.run.id).outcome).toBe("none");
    f.lifecycle.settle(lane.run.id, lane.run.dispatch_token as string, "succeeded");
    await broker.close();
    f.restart();
    const value = await (await call(api(), `/v1/runs/${lane.run.id}/interactions/history`)).json();
    expect(value).toMatchObject({
      run_status: "succeeded",
      cancellation: "none",
      coverage: "observed_requests_only",
    });
    expect(value.records.find((entry: { id: string }) => entry.id === record?.id)).toMatchObject({
      submission: { state: "submitted" },
    });
    const published = operationResponse("GET", "/v1/runs/:id/interactions/history");
    if (!("schema" in published) || !published.schema)
      throw new Error("History response schema is missing.");
    expect(z.fromJSONSchema(published.schema).safeParse(value).success).toBe(true);
    expect(lane.calls()).toBe(1);
  });
test("lost HTTP acknowledgement and concurrent retries dispatch once; changed answers conflict", async () => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lane = await setup({ respond: async () => waiting });
  const app = api(true);
  const first = call(app, `/v1/runs/${lane.run.id}/interactions`, questionAnswer);
  for (let index = 0; index < 100 && !lane.calls(); index++) await Bun.sleep(1);
  expect(lane.calls()).toBe(1);
  expect(lane.journal.history(lane.run.id).records[1]?.submission?.state).toBe("submitting");
  expect((await call(app, `/v1/runs/${lane.run.id}/interactions`, questionAnswer)).status).toBe(
    409,
  );
  release();
  expect((await first).status).toBe(200); // Deliberately discard the acknowledgement body.
  f.lifecycle.settle(lane.run.id, lane.run.dispatch_token as string, "succeeded");
  expect(
    await (await call(app, `/v1/runs/${lane.run.id}/interactions`, questionAnswer)).json(),
  ).toEqual({ status: "submitted" });
  expect(
    (
      await call(app, `/v1/runs/${lane.run.id}/interactions`, {
        ...questionAnswer,
        answers: [{ questionId: "q", freeText: "Changed answer" }],
      })
    ).status,
  ).toBe(409);
  expect(
    (await call(api(), `/v1/runs/${lane.run.id}/interactions/history`, undefined, "Bearer invalid"))
      .status,
  ).toBe(401);
  expect(lane.calls()).toBe(1);
});
test("ambiguous errors fence retries and do not store opaque native failures", async () => {
  const lane = await setup({
    respond: async () => {
      throw new Error("private raw native failure");
    },
  });
  await expect(broker.respond(lane.run.id, questionAnswer)).rejects.toMatchObject({
    code: "NATIVE_UNKNOWN",
    outcome: "unknown",
  });
  await expect(broker.respond(lane.run.id, questionAnswer)).rejects.toMatchObject({
    code: "NATIVE_UNKNOWN",
    outcome: "unknown",
  });
  expect(lane.calls()).toBe(1);
  expect(lane.journal.history(lane.run.id).records[1]?.submission).toMatchObject({
    state: "unknown",
    diagnostic: { code: "NATIVE_UNKNOWN", outcome: "unknown" },
  });
  expect(JSON.stringify(f.store.events(0, 1000))).not.toContain("private raw native failure");
});
test("timeout stays unknown until the same attempt receives a late acknowledgement without retransmission", async () => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lane = await setup({ timeout: 25, respond: async () => waiting });
  await expect(broker.respond(lane.run.id, questionAnswer)).rejects.toMatchObject({
    code: "NATIVE_UNKNOWN",
    outcome: "unknown",
  });
  const attempt = lane.journal.history(lane.run.id).records[1]?.submission?.attempt_id;
  await expect(broker.respond(lane.run.id, questionAnswer)).rejects.toMatchObject({
    code: "NATIVE_UNKNOWN",
  });
  release();
  await Bun.sleep(0);
  expect(lane.journal.history(lane.run.id).records[1]?.submission).toMatchObject({
    attempt_id: attempt,
    state: "submitted",
  });
  expect(await broker.respond(lane.run.id, questionAnswer)).toEqual({ status: "submitted" });
  expect(lane.calls()).toBe(1);
});
test("restart turns persisted in-flight responses unknown even with no live broker", async () => {
  const lane = await setup();
  await broker.interactions(lane.run.id);
  lane.journal.begin(lane.run.id, questionAnswer, (value) => value);
  await broker.close();
  const run = f.store.get("run", lane.run.id);
  // Model abrupt exit before graceful close could fence the persisted attempt.
  const records = run.native_interactions.map((record) =>
    record.submission
      ? { ...record, submission: { ...record.submission, state: "submitting" as const } }
      : record,
  );
  f.store.put({ ...run, revision: run.revision + 1, native_interactions: records }, run.revision);
  f.restart();
  const journal = new InteractionJournal(f.store);
  expect(journal.history(run.id)).toMatchObject({ run_status: "unknown" });
  expect(journal.history(run.id).records[1]?.submission?.state).toBe("unknown");
  expect(() => journal.replay(run.id, questionAnswer)).toThrow("NATIVE_UNKNOWN");
  expect((await call(api(), `/v1/runs/${run.id}/interactions/history`)).status).toBe(200);
  expect(lane.calls()).toBe(0);
});
test("definitive non-dispatch may retry; run cancellation remains a separate observation", async () => {
  let rejected = true;
  const lane = await setup({
    respond: async () => {
      if (rejected) throw new HarnessError("NATIVE_REJECTED");
    },
  });
  await expect(broker.respond(lane.run.id, questionAnswer)).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  expect(lane.journal.history(lane.run.id).records[1]?.submission?.state).toBe("not_dispatched");
  rejected = false;
  expect(await broker.respond(lane.run.id, questionAnswer)).toEqual({ status: "submitted" });
  f.lifecycle.cancel(lane.run.id);
  f.lifecycle.settle(lane.run.id, lane.run.dispatch_token as string, "cancelled");
  expect(lane.journal.history(lane.run.id)).toMatchObject({
    run_status: "cancelled",
    cancellation: "confirmed",
  });
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject({
    observed_state: "pending",
    submission: { state: "submitted" },
  });
});
test("revocation during a pending read fences observation persistence and response dispatch", async () => {
  let finish: (value: unknown) => void = () => {};
  const waiting = new Promise((resolve) => {
    finish = resolve;
  });
  const lane = await setup({ pending: () => waiting });
  const result = broker.respond(lane.run.id, questionAnswer);
  await Bun.sleep(0);
  new Connections(f.lifecycle).revoke(lane.agent.connection_id as string);
  finish({ approvals: [], user_inputs: [question] });
  await expect(result).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  expect(lane.calls()).toBe(0);
  expect(lane.journal.history(lane.run.id).records).toHaveLength(0);
});
test("approval stages are distinct; disappearance without a response never means completion", async () => {
  const lane = await setup();
  await broker.respond(lane.run.id, approvalAnswer);
  lane.snapshots({
    approvals: [
      { ...approval, currentRequirementId: { approvalId: approval.approvalId, sourceIndex: 3 } },
    ],
    user_inputs: [],
  });
  await broker.interactions(lane.run.id);
  expect(
    lane.journal.history(lane.run.id).records.filter((record) => record.type === "approval"),
  ).toHaveLength(2);
  expect(await broker.respond(lane.run.id, approvalAnswer)).toEqual({ status: "submitted" });
  lane.snapshots({ approvals: [], user_inputs: [] });
  await broker.interactions(lane.run.id);
  expect(
    lane.journal.history(lane.run.id).records.find((record) => record.source_index === 3),
  ).toMatchObject({ observed_state: "not_pending", submission: null });
  await expect(
    broker.respond(lane.run.id, { ...approvalAnswer, source_index: 3 }),
  ).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
  expect(lane.calls()).toBe(1);
  expect(f.store.get("run", lane.run.id).status).toBe("running");
});

test("response fingerprints use original input while persisted answer displays redact secrets", async () => {
  let nativeAnswer: unknown;
  const lane = await setup({
    respond: async (_runId, answer) => {
      nativeAnswer = answer;
    },
  });
  const answer = {
    type: "user_input",
    request_id: "question-1",
    answers: [{ questionId: "q", freeText: "sk-private-fixture-answer" }],
  };
  await broker.respond(lane.run.id, answer);
  expect(nativeAnswer).toEqual(answer);
  const submission = lane.journal.history(lane.run.id).records[1]?.submission;
  expect(submission).toMatchObject({
    answer: { answers: [{ freeText: "[REDACTED]" }] },
    state: "submitted",
  });
  expect(await broker.respond(lane.run.id, answer)).toEqual({ status: "submitted" });
  expect(lane.calls()).toBe(1);
  expect(JSON.stringify(f.store.events(0, 1000))).not.toContain("sk-private-fixture-answer");
});

test("oversized observations fail explicitly without truncating retained history or dispatching", async () => {
  const lane = await setup();
  await broker.interactions(lane.run.id);
  const before = lane.journal.history(lane.run.id);
  const options = Array.from({ length: 100 }, (_, index) => ({
    label: `${index}`.padEnd(1000, "x"),
  }));
  lane.snapshots({
    approvals: [],
    user_inputs: [
      {
        ...question,
        questions: [
          { ...question.questions[0], options },
          { ...question.questions[0], id: "q2", options },
        ],
      },
    ],
  });
  await expect(broker.interactions(lane.run.id)).rejects.toMatchObject({ code: "PROTOCOL_ERROR" });
  expect(lane.journal.history(lane.run.id)).toEqual(before);
  expect(lane.calls()).toBe(0);
});

test("a changed request payload cannot overwrite the question associated with a settled answer", async () => {
  const lane = await setup();
  await broker.respond(lane.run.id, questionAnswer);
  lane.snapshots({
    approvals: [],
    user_inputs: [
      {
        ...question,
        questions: [{ ...question.questions[0], question: "An unrelated replacement" }],
      },
    ],
  });
  await expect(broker.interactions(lane.run.id)).rejects.toMatchObject({
    code: "PROTOCOL_ERROR",
    outcome: "unknown",
  });
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject({
    request: question,
    submission: { state: "submitted" },
  });
  expect(lane.calls()).toBe(1);
});

test("first observed transcript anchor uses UTF-16 offset and immutable prefix hash through append, replacement and restart", async () => {
  const lane = await setup();
  const prefix = "Before the 🧠 question. ";
  f.lifecycle.appendAnswer(lane.run.id, prefix, "partial");
  const message = f.store.answer(lane.run.id);
  await broker.interactions(lane.run.id);
  const first = lane.journal.history(lane.run.id).records[1];
  const anchor = {
    anchor_message_id: message?.id,
    anchor_text_offset: prefix.length,
    anchor_prefix_sha256: createHash("sha256").update(prefix).digest("hex"),
  };
  expect(prefix.length).toBeGreaterThan(Array.from(prefix).length);
  expect(first).toMatchObject(anchor);
  f.lifecycle.appendAnswer(lane.run.id, `${prefix}Continued after observation.`, "partial");
  await broker.respond(lane.run.id, questionAnswer);
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject(anchor);
  const appended = f.store.answer(lane.run.id)?.text ?? "";
  expect(createHash("sha256").update(appended.slice(0, prefix.length)).digest("hex")).toBe(
    anchor.anchor_prefix_sha256,
  );
  const replaced = `X${appended.slice(1)}`;
  f.lifecycle.appendAnswer(lane.run.id, replaced, "complete");
  await broker.interactions(lane.run.id);
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject(anchor);
  expect(createHash("sha256").update(replaced.slice(0, prefix.length)).digest("hex")).not.toBe(
    anchor.anchor_prefix_sha256,
  );
  f.lifecycle.settle(lane.run.id, lane.run.dispatch_token as string, "succeeded");
  await broker.close();
  f.restart();
  expect(new InteractionJournal(f.store).history(lane.run.id).records[1]).toMatchObject({
    ...anchor,
    submission: { state: "submitted" },
  });
});

test("a request observed before agent output stays anchored to input with no invented text position", async () => {
  const lane = await setup();
  await broker.interactions(lane.run.id);
  const fallback = {
    anchor_message_id: lane.run.input_message_id,
    anchor_text_offset: null,
    anchor_prefix_sha256: null,
  };
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject(fallback);
  f.lifecycle.appendAnswer(lane.run.id, "Agent output arrived later.", "partial");
  await broker.interactions(lane.run.id);
  await broker.respond(lane.run.id, questionAnswer);
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject(fallback);
  lane.snapshots({ approvals: [], user_inputs: [{ ...question, userInputId: "question-later" }] });
  await broker.interactions(lane.run.id);
  expect(
    lane.journal
      .history(lane.run.id)
      .records.find((record) => record.request_id === "question-later"),
  ).toMatchObject({
    anchor_message_id: f.store.answer(lane.run.id)?.id,
    anchor_text_offset: "Agent output arrived later.".length,
  });
});

test("a later message in another conversation is never selected as this run's question anchor", async () => {
  const lane = await setup();
  f.bind();
  const other = f.admit("A different private conversation.");
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Other fixture dispatch was not claimed.");
  f.lifecycle.started(claimed.id, claimed.dispatch_token, "native-other");
  f.lifecycle.appendAnswer(other.run.id, "Other-thread private output.", "partial");
  await broker.interactions(lane.run.id);
  const history = lane.journal.history(lane.run.id);
  expect(history.records[1]).toMatchObject({
    anchor_message_id: lane.run.input_message_id,
    anchor_text_offset: null,
    anchor_prefix_sha256: null,
  });
  expect(history.records[1]?.anchor_message_id).not.toBe(f.store.answer(other.run.id)?.id);
  expect(JSON.stringify(history)).not.toContain("Other-thread private output.");
});

test("old journal records default anchor metadata to null and are never retroactively positioned", async () => {
  const lane = await setup();
  await broker.interactions(lane.run.id);
  const run = f.store.get("run", lane.run.id);
  const old = JSON.parse(JSON.stringify(run.native_interactions));
  for (const record of old) {
    delete record.anchor_message_id;
    delete record.anchor_text_offset;
    delete record.anchor_prefix_sha256;
  }
  f.store.put({ ...run, native_interactions: old, revision: run.revision + 1 }, run.revision);
  f.lifecycle.appendAnswer(lane.run.id, "New output after an older journal record.", "partial");
  await broker.interactions(lane.run.id);
  expect(lane.journal.history(lane.run.id).records[1]).toMatchObject({
    anchor_message_id: null,
    anchor_text_offset: null,
    anchor_prefix_sha256: null,
  });
});
