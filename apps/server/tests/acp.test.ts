import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AcpConnection } from "../src/harness/acp/connection";
import { elicitationForm } from "../src/harness/acp/elicitation";
import { AcpProjection, promptOutcome } from "../src/harness/acp/projection";
import { AcpSession } from "../src/harness/acp/session";
import type { ToolLease } from "../src/harness/client";
import { Redactor } from "../src/harness/context";
import type { NativeEvent } from "../src/harness/contracts";
import { SessionTools } from "../src/harness/session-tools";

const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup(root?: string, commands = true, nativeEvents = false, reusable = false) {
  const directory = root ?? mkdtempSync(join(tmpdir(), "ngertiin-acp-test-"));
  if (!root) cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "home"), { recursive: true });
  const forwarded: unknown[] = [];
  const gateway = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const frame = (await request.json()) as { id?: unknown; method: string };
      if (frame.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (frame.method === "tools/call")
        forwarded.push({ auth: request.headers.get("Authorization"), frame });
      return Response.json({
        jsonrpc: "2.0",
        id: frame.id,
        result:
          frame.method === "initialize"
            ? {}
            : { content: [{ type: "text", text: "useful scoped receipt" }], isError: false },
      });
    },
  });
  cleanups.push(() => gateway.stop(true));
  const tools = new SessionTools(
    () => `http://127.0.0.1:${gateway.port}/tools`,
    true,
    false,
    reusable,
  );
  const redactor = new Redactor();
  const prefix = nativeEvents ? `NATIVE_${crypto.randomUUID()}` : undefined;
  let session: AcpSession | undefined;
  const connection = new AcpConnection(
    process.execPath,
    [join(import.meta.dir, "fixtures/acp-agent.ts")],
    {
      state_directory: directory,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: join(directory, "home"),
        NGERTIIN_TEST_COMMANDS: commands ? "yes" : "no",
        NGERTIIN_TEST_CORRELATION: reusable ? "yes" : "no",
        ...(prefix ? { NGERTIIN_TEST_NATIVE_EVENTS: prefix } : {}),
      },
      redactor,
    },
    {
      nativeTurn: async (event) => {
        await session?.nativeTurn(event);
      },
      update: async (update) => {
        await session?.update(update);
      },
      permission: async (request, signal) =>
        session ? session.permission(request, signal) : { outcome: { outcome: "cancelled" } },
      elicitation: async (request, signal) =>
        session ? session.elicitation(request, signal) : { action: "cancel" },
    },
    undefined,
    prefix
      ? { prefix, failure: (sessionId, code) => session?.nativeFailure(sessionId, code) }
      : undefined,
  );
  cleanups.push(() => connection.close());
  cleanups.push(() => tools.close());
  const init = await connection.bounded(
    connection.agent.request("initialize", { protocolVersion: 1, clientCapabilities: {} }),
  );
  const opened = new AcpSession(
    connection,
    tools,
    init,
    redactor,
    directory,
    "Private application instructions",
    { reusable },
  );
  session = opened;
  const events: NativeEvent[] = [];
  const controller = new AbortController();
  const lease = {
    token: crypto.randomUUID(),
    scope: Object.freeze({ run_id: crypto.randomUUID() }),
    revoke() {},
  } as ToolLease;
  const prompt = (identity: { native_session_id: string }, text: string) =>
    opened.prompt({
      identity,
      text,
      run_id: lease.scope.run_id,
      settings: { model_id: "model-b", reasoning: "low" },
      tools: lease,
      signal: controller.signal,
      onEvent(event) {
        events.push(event);
      },
    });
  return { session, connection, tools, directory, forwarded, events, controller, lease, prompt };
}

test("ACP session applies advertised config, merges private tool updates and preserves nullable turn identity", async () => {
  const f = await setup();
  const identity = await f.session.open();
  expect(f.session.models().map((model) => model.id)).toEqual(["model-a", "model-b"]);
  await f.session.configure(identity, { model_id: "model-b", reasoning: "low" });
  expect(await f.prompt(identity, "hello")).toEqual({
    status: "succeeded",
    ...identity,
    native_run_id: null,
  });
  expect(f.events.filter((event) => event.type === "accepted")).toEqual([
    { type: "accepted", ...identity, native_run_id: null },
  ]);
  expect(f.events.at(-1)).toEqual({ type: "text_snapshot", text: "Hello world" });
  expect(f.events.filter((event) => event.type === "native_tool").at(-1)).toMatchObject({
    name: "Safe tool",
    state: "completed",
    command: null,
  });
  expect(JSON.stringify(f.events)).not.toContain("PRIVATE");
  await expect(f.prompt(identity, "again")).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
});

test("a first MCP call can establish processing before any native update without a turn ID", async () => {
  const f = await setup();
  const identity = await f.session.open();
  expect((await f.prompt(identity, "tool")).status).toBe("succeeded");
  expect(f.forwarded).toHaveLength(1);
  expect(f.forwarded[0]).toMatchObject({ auth: `Bearer ${f.lease.token}` });
  expect(f.events[0]).toMatchObject({ type: "accepted", native_run_id: null });
});

test("a process-bound native quota failure settles promptly and drains the owned process without fabricating a turn ID", async () => {
  const f = await setup(undefined, true, true);
  const identity = await f.session.open();
  expect(await f.prompt(identity, "native-limit")).toEqual({
    status: "failed",
    ...identity,
    native_run_id: null,
  });
  expect(f.events.filter((event) => event.type === "failure")).toEqual([
    { type: "failure", code: "PROVIDER_LIMIT" },
  ]);
  expect(f.events).toContainEqual({ type: "text_snapshot", text: "Still active" });
  expect(await f.connection.process.child.exited).toBeGreaterThan(0);
  expect(f.tools.active).toBeNull();
});

test("ordinary stderr and an unconfigured native marker cannot establish a provider failure", async () => {
  const f = await setup();
  const identity = await f.session.open();
  expect((await f.prompt(identity, "native-limit")).status).toBe("succeeded");
  expect(f.events.some((event) => event.type === "failure")).toBe(false);
});

test("native commands require advertised support and cannot change account or lifecycle authority", async () => {
  const unsupported = await setup(undefined, false);
  const identity = await unsupported.session.open();
  await expect(unsupported.prompt(identity, "/compact")).rejects.toMatchObject({
    code: "CAPABILITY_UNSUPPORTED",
  });
  for (const text of [
    "/login",
    "/not-advertised",
    "/model other",
    "/logout",
    "  /login",
    "/mcp:login",
  ]) {
    const f = await setup();
    const identity = await f.session.open();
    await expect(f.prompt(identity, text)).rejects.toMatchObject({
      code: "CAPABILITY_UNSUPPORTED",
    });
    expect(f.events).toEqual([]);
  }
  for (const text of ["/compact", "/review current work"]) {
    const f = await setup();
    const identity = await f.session.open();
    expect((await f.prompt(identity, text)).status).toBe("succeeded");
  }
});

test("reload suppresses historical output and receives a fresh MCP token and process generation", async () => {
  const first = await setup();
  const identity = await first.session.open();
  await first.prompt(identity, "hello");
  await first.session.close();
  const next = await setup(first.directory);
  expect(next.connection.generation).not.toBe(first.connection.generation);
  expect(next.tools.token).not.toBe(first.tools.token);
  expect(await next.session.open(identity)).toEqual(identity);
  expect(next.events).toEqual([]);
  expect((await next.prompt(identity, "tool")).status).toBe("succeeded");
  expect(JSON.stringify(next.events)).not.toContain("REPLAY");
});

test("cancel sends intent and waits for a native cancelled prompt response", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const pending = f.prompt(identity, "cancel");
  await until(() => f.events.some((event) => event.type === "accepted"));
  expect(await f.session.stop(identity, f.lease.scope.run_id)).toEqual({ confirmed: false });
  expect((await pending).status).toBe("cancelled");
});

test("negotiated steering joins the active nullable-ID attempt and refuses an idle fallback", async () => {
  const f = await setup();
  const identity = await f.session.open();
  expect(f.session.supportsSteering).toBe(true);
  const pending = f.prompt(identity, "steer");
  await until(() => f.events.some((event) => event.type === "text_snapshot"));
  await expect(f.session.steer(identity, "other-run", "correction")).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  await expect(f.session.steer(identity, f.lease.scope.run_id, "idle")).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  await f.session.steer(identity, f.lease.scope.run_id, "correction");
  expect((await pending).status).toBe("succeeded");
  await expect(f.session.steer(identity, f.lease.scope.run_id, "late")).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
});

test("burst streaming coalesces snapshots and flushes the trailing text before the turn ends", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const pending = f.prompt(identity, "stream");
  await until(() =>
    f.events.some((event) => event.type === "text_snapshot" && event.text.length === 19_992),
  );
  const streamed = f.events.filter((event) => event.type === "text_snapshot");
  expect(streamed.length).toBeLessThan(50);
  expect(streamed.length).toBeGreaterThan(0);
  await f.session.steer(identity, f.lease.scope.run_id, "finish");
  expect((await pending).status).toBe("succeeded");
  expect(f.events.at(-1)).toEqual({ type: "text_snapshot", text: "x".repeat(20_000) });
});

test("permission choices are bounded, run-scoped and cannot be answered twice", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const pending = f.prompt(identity, "permission");
  await until(() => f.session.interactions(f.lease.scope.run_id).approvals.length > 0);
  const view = f.session.interactions(f.lease.scope.run_id).approvals[0];
  const answer = {
    type: "approval",
    request_id: view.approvalId,
    source_index: 0,
    choice_id: "allow",
  };
  await expect(f.session.respond("wrong-run", answer)).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  await expect(
    f.session.respond(f.lease.scope.run_id, { ...answer, choice_id: "invented" }),
  ).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
  expect(JSON.stringify(view)).not.toContain("PRIVATE INPUT");
  await f.session.respond(f.lease.scope.run_id, answer);
  await expect(f.session.respond(f.lease.scope.run_id, answer)).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  expect((await pending).status).toBe("succeeded");
});

test("ACP form questions retain types, reject invalid answers and respond exactly once to the active run", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const pending = f.prompt(identity, "form");
  await until(() => f.session.interactions(f.lease.scope.run_id).user_inputs.length > 0);
  const input = f.session.interactions(f.lease.scope.run_id).user_inputs[0];
  expect(input.elicitation).toBe(true);
  expect(input.questions.map((question) => question.input?.type)).toEqual([
    "string",
    "integer",
    "boolean",
    "array",
    "string",
  ]);
  const answer = {
    type: "user_input",
    request_id: input.userInputId,
    answers: [
      { questionId: "field-0", freeText: "Sam" },
      { questionId: "field-1", freeText: "3" },
      { questionId: "field-2", selectedLabel: "No" },
      { questionId: "field-3", selectedLabels: ["Monday", "Tuesday"] },
    ],
  };
  await expect(f.session.respond("other-run", answer)).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
  await expect(
    f.session.respond(f.lease.scope.run_id, {
      ...answer,
      answers: answer.answers.filter((value) => value.questionId !== "field-0"),
    }),
  ).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
  for (const wrong of [
    { questionId: "field-1", freeText: "3.1" },
    { questionId: "field-1", freeText: "10" },
    { questionId: "field-2", selectedLabels: ["Yes", "No"] },
    { questionId: "field-3", selectedLabels: ["Wednesday"] },
    { questionId: "field-3", selectedLabels: ["Monday", "Monday"] },
  ])
    await expect(
      f.session.respond(f.lease.scope.run_id, {
        ...answer,
        answers: answer.answers.map((value) =>
          value.questionId === wrong.questionId ? wrong : value,
        ),
      }),
    ).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
  expect(f.session.interactions(f.lease.scope.run_id).user_inputs).toHaveLength(1);
  await f.session.respond(f.lease.scope.run_id, answer);
  expect((await pending).status).toBe("succeeded");
  expect(f.events.at(-1)).toEqual({
    type: "text_snapshot",
    text: JSON.stringify({
      action: "accept",
      content: { name: "Sam", count: 3, confirmed: false, days: ["Monday", "Tuesday"] },
    }),
  });
  await expect(f.session.respond(f.lease.scope.run_id, answer)).rejects.toMatchObject({
    code: "NATIVE_REJECTED",
  });
});

test("ACP form decline and stop resolve the request without inventing user input", async () => {
  for (const action of ["decline", "stop"] as const) {
    const f = await setup();
    const identity = await f.session.open();
    const pending = f.prompt(identity, "form");
    await until(() => f.session.interactions(f.lease.scope.run_id).user_inputs.length > 0);
    const input = f.session.interactions(f.lease.scope.run_id).user_inputs[0];
    if (action === "stop") await f.session.stop(identity, f.lease.scope.run_id);
    else
      await f.session.respond(f.lease.scope.run_id, {
        type: "user_input",
        request_id: input.userInputId,
        action,
        answers: [],
      });
    expect((await pending).status).toBe(action === "stop" ? "cancelled" : "succeeded");
    expect(f.session.interactions(f.lease.scope.run_id)).toEqual({
      approvals: [],
      user_inputs: [],
    });
  }
});

test("elicitation rejects unsupported schemas and validates enum labels independently of native keys", () => {
  const redactor = new Redactor();
  const schema = {
    mode: "form",
    sessionId: "s",
    message: "Choose",
    requestedSchema: {
      properties: {
        "native-private-key": {
          type: "string",
          oneOf: [{ const: "raw-value", title: "Display choice" }],
        },
      },
    },
  };
  const form = elicitationForm(schema, redactor);
  expect(JSON.stringify(form.view)).not.toContain("raw-value");
  expect(
    form.answer({
      type: "user_input",
      request_id: form.view.userInputId,
      answers: [{ questionId: "field-0", selectedLabel: "Display choice" }],
    }),
  ).toEqual({ action: "accept", content: { "native-private-key": "raw-value" } });
  expect(() =>
    elicitationForm(
      { ...schema, requestedSchema: { properties: { x: { type: "string", pattern: "(a+)+$" } } } },
      redactor,
    ),
  ).toThrow("CAPABILITY_UNSUPPORTED");
});

test("explicit errors/refusal are failure; process death remains unknown", async () => {
  for (const text of ["error", "refusal", "disconnect"]) {
    const f = await setup();
    const identity = await f.session.open();
    if (text === "disconnect")
      await expect(f.prompt(identity, text)).rejects.toMatchObject({ outcome: "unknown" });
    else expect((await f.prompt(identity, text)).status).toBe("failed");
  }
  expect(promptOutcome("max_tokens")).toBe("failed");
  expect(promptOutcome("max_turn_requests")).toBe("failed");
});

test("terminal failures and lost acknowledgements flush retained partial text without claiming success", async () => {
  for (const text of ["partial-error", "partial-disconnect"]) {
    const f = await setup();
    const identity = await f.session.open();
    if (text === "partial-disconnect")
      await expect(f.prompt(identity, text)).rejects.toMatchObject({ outcome: "unknown" });
    else expect((await f.prompt(identity, text)).status).toBe("failed");
    expect(f.events.filter((event) => event.type === "text_snapshot").at(-1)).toEqual({
      type: "text_snapshot",
      text: "Retained partial answer",
    });
  }
});

test("projection redacts split secrets and never publishes thoughts or raw tool content", () => {
  const redactor = new Redactor();
  redactor.add("test-super-secret");
  const projection = new AcpProjection(redactor);
  const events = [
    ...projection.update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Answer test-super-" },
    }),
    ...projection.update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "secret done" },
    }),
    ...projection.update({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "private" },
    }),
    projection.final(),
  ];
  expect(JSON.stringify(events)).not.toContain("test-super");
  expect(events.at(-1)).toEqual({ type: "text_snapshot", text: "Answer [REDACTED] done" });
});

test("negotiated native phases keep commentary out of live and canonical answers", () => {
  const projection = new AcpProjection(new Redactor(), [], true);
  const chunk = (messageId: string, text: string, phase?: string) =>
    projection.update({
      sessionUpdate: "agent_message_chunk",
      messageId,
      content: { type: "text", text },
      _meta: phase ? { ngertiin: { phase } } : {},
    });
  chunk("comment", "PRIVATE commentary", "commentary");
  expect(projection.flush()).toBeNull();
  chunk("legacy", "Legacy answer");
  expect(projection.final()).toMatchObject({ text: "Legacy answer" });
  chunk("answer", "Final ", "final_answer");
  chunk("answer", "answer", "final_answer");
  chunk("later-comment", "PRIVATE later commentary", "commentary");
  expect(projection.final()).toMatchObject({ text: "Final answer" });
});

test("native progress merges compactions in place, redacts split summaries and keeps file previews scoped", () => {
  const redactor = new Redactor();
  redactor.add("private-token");
  const projection = new AcpProjection(redactor, ["/authorized/work"]);
  const observed = (update: Parameters<AcpProjection["update"]>[0]) => {
    const event = projection.update(update).find((event) => event.type === "progress");
    if (event?.type !== "progress") throw new Error("Missing progress.");
    return event.progress;
  };
  observed({
    sessionUpdate: "compaction_summary_chunk",
    compactionId: "first",
    content: { type: "text", text: "Summary private-" },
  });
  observed({
    sessionUpdate: "compaction_update",
    compactionId: "second",
    status: "in_progress",
    summary: [],
  });
  let value = observed({
    sessionUpdate: "compaction_summary_chunk",
    compactionId: "first",
    content: { type: "text", text: "token after" },
  });
  expect(JSON.stringify(value)).not.toContain("private-");
  value = observed({
    sessionUpdate: "compaction_update",
    compactionId: "first",
    status: "completed",
  });
  expect(value.compactions.map((entry) => entry.id)).toEqual(["first", "second"]);
  expect(value.compactions[0].summary).toBe("Summary [REDACTED] after");
  value = observed({
    sessionUpdate: "compaction_update",
    compactionId: "first",
    status: "completed",
    summary: null,
  });
  expect(value.compactions[0].summary).toBeNull();
  const outside = projection.update({
    sessionUpdate: "tool_call_update",
    toolCallId: "call",
    content: [{ type: "diff", path: "/private/credentials", newText: "Must not be displayed" }],
  });
  expect(outside.some((event) => event.type === "progress")).toBe(false);
  value = observed({
    sessionUpdate: "tool_call_update",
    toolCallId: "call",
    content: [
      {
        type: "diff",
        path: "/authorized/work/result.txt",
        oldText: "before",
        newText: "after private-token",
      },
    ],
  });
  expect(value.file_changes).toEqual([
    {
      tool_id: "call",
      path: "result.txt",
      old_text: "before",
      new_text: "after [REDACTED]",
      truncated: false,
      provenance: "native_tool_preview",
    },
  ]);
  observed({
    sessionUpdate: "plan_update",
    plan: {
      type: "items",
      planId: "p",
      entries: [{ content: "A task", priority: "low", status: "pending" }],
    },
  });
  value = observed({
    sessionUpdate: "plan_update",
    plan: { type: "markdown", planId: "p", content: "Updated plan" },
  });
  expect(value.plans).toHaveLength(1);
  expect(value.plans[0].text).toBe("Updated plan");
  value = observed({ sessionUpdate: "plan_removed", planId: "p" });
  expect(value.plans).toHaveLength(0);
});

test("closing the owned ACP process terminates a surviving background descendant", async () => {
  const f = await setup();
  const identity = await f.session.open();
  await f.prompt(identity, "background");
  const pid = Number(readFileSync(join(f.directory, "background.pid"), "utf8"));
  const state = async () => {
    const ps = Bun.spawn(["ps", "-o", "stat=", "-p", String(pid)], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const status = (await new Response(ps.stdout).text()).trim();
    await ps.exited;
    return status;
  };
  expect(await state()).toMatch(/^[RSI]/);
  await f.session.close();
  expect(await state()).toMatch(/^(?:Z.*)?$/);
});

test("setup refuses to downgrade application instructions when system prompts are unsupported", async () => {
  const f = await setup();
  if (f.session.initialization.agentCapabilities?.sessionCapabilities)
    delete f.session.initialization.agentCapabilities.sessionCapabilities.systemPrompt;
  await expect(f.session.open()).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED" });
});

test("unsupported images and unavailable model settings fail before a prompt is sent", async () => {
  const f = await setup();
  const identity = await f.session.open();
  await expect(
    f.session.configure(identity, { model_id: "unavailable", reasoning: null }),
  ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  await expect(
    f.session.prompt({
      identity,
      text: "hello",
      images: ["data:image/png;base64,AAAA"],
      run_id: f.lease.scope.run_id,
      settings: { model_id: "model-a", reasoning: null },
      tools: f.lease,
      signal: f.controller.signal,
      onEvent(event) {
        f.events.push(event);
      },
    }),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED" });
  expect(f.events).toEqual([]);
});

async function until(check: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await Bun.sleep(5);
  }
  throw new Error("Expected fixture observation was not received.");
}

test("correlated ACP turns reuse one process, reject stale tool metadata and retire after cancellation", async () => {
  const f = await setup(undefined, true, false, true);
  const identity = await f.session.open();
  expect((await f.prompt(identity, "tool")).status).toBe("succeeded");
  expect(f.session.closeAfterRun).toBe(false);
  expect(f.tools.active).toBeNull();
  const first = f.events.find((event) => event.type === "dispatch");
  expect(first?.type).toBe("dispatch");
  const second = f.prompt(identity, "cancel");
  while (f.events.filter((event) => event.type === "dispatch").length < 2) await Bun.sleep(5);
  const dispatches = f.events.filter((event) => event.type === "dispatch");
  const call = async (metadata?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${f.tools.server.port}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${f.tools.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "ngertiin.read_run_context",
          arguments: {},
          _meta: metadata,
        },
      }),
    });
    return response.json();
  };
  for (const metadata of [
    undefined,
    {
      "x-codex-turn-metadata": {
        thread_id: identity.native_session_id,
        turn_id: dispatches[0].native_run_id,
      },
    },
    {
      "x-codex-turn-metadata": { thread_id: "other-session", turn_id: dispatches[1].native_run_id },
    },
  ])
    expect((await call(metadata)).error.data.code).toBe("NATIVE_REJECTED");
  expect(f.forwarded).toHaveLength(1);
  expect(
    (
      await call({
        "x-codex-turn-metadata": {
          thread_id: identity.native_session_id,
          turn_id: dispatches[1].native_run_id,
        },
      })
    ).result.isError,
  ).toBe(false);
  expect(f.forwarded).toHaveLength(2);
  await f.session.stop(identity, f.lease.scope.run_id);
  expect((await second).status).toBe("cancelled");
  expect(f.session.closeAfterRun).toBe(true);
  await expect(f.prompt(identity, "again")).rejects.toMatchObject({ code: "NATIVE_REJECTED" });
});

test("slow persistence coalesces a text burst instead of queuing one write per token", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const pending = f.session.prompt({
    identity,
    text: "stream",
    run_id: f.lease.scope.run_id,
    settings: { model_id: "model-b", reasoning: "low" },
    tools: f.lease,
    signal: f.controller.signal,
    async onEvent(event) {
      f.events.push(event);
      if (event.type === "text_snapshot") await Bun.sleep(60);
    },
  });
  try {
    await until(() =>
      f.events.some((event) => event.type === "text_snapshot" && event.text.length === 19_992),
    );
    expect(f.events.filter((event) => event.type === "text_snapshot").length).toBeLessThan(8);
  } finally {
    await f.session.steer(identity, f.lease.scope.run_id, "finish");
    await pending;
  }
  expect(f.events.at(-1)).toEqual({ type: "text_snapshot", text: "x".repeat(20_000) });
});

test("coalesced text stays on its side of an intervening tool update", async () => {
  const f = await setup();
  const identity = await f.session.open();
  const result = await f.session.prompt({
    identity,
    text: "stream-boundary",
    run_id: f.lease.scope.run_id,
    settings: { model_id: "model-b", reasoning: "low" },
    tools: f.lease,
    signal: f.controller.signal,
    async onEvent(event) {
      f.events.push(event);
      if (event.type === "text_snapshot") await Bun.sleep(60);
    },
  });
  expect(result.status).toBe("succeeded");
  const tool = f.events.findIndex(
    (event) => event.type === "tool_activity" && event.state === "started",
  );
  expect(tool).toBeGreaterThan(0);
  const before = f.events
    .slice(0, tool)
    .filter((event) => event.type === "text_snapshot")
    .at(-1);
  expect(before?.type === "text_snapshot" ? before.text : "").toBe("x".repeat(9992));
  expect(f.events.at(-1)).toEqual({
    type: "text_snapshot",
    text: "x".repeat(10_000) + "y".repeat(10_000),
  });
});
