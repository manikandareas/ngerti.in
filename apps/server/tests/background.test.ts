import { afterEach, expect, test } from "bun:test";
import { Background } from "../src/background";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function setup() {
  f = await fixture();
  return f;
}
async function routine(at: string, interval = false) {
  return await f.lifecycle.create("routine", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    instruction: "Inspect updates",
    schedule: interval ? { type: "interval", anchor_at: at, every_ms: 1000 } : { type: "once", at },
    timezone: "UTC",
  });
}

test("scheduler atomically persists one occurrence/run and survives repeated ticks and restart", async () => {
  const f = await setup();
  const at = "2026-10-30T00:00:00.000Z";
  await routine(at);
  await new Background(f.lifecycle).tick(new Date(at));
  await new Background(f.lifecycle).tick(new Date(at));
  await f.restart();
  await new Background(f.lifecycle).tick(new Date(at));
  expect(await f.store.list("occurrence")).toHaveLength(1);
  expect(await f.store.list("run")).toHaveLength(1);
  expect((await f.store.list("run"))[0].status).toBe("queued");
  expect((await f.store.list("message"))[0].author).toBe("routine");
  expect((await f.store.list("routine"))[0].next_run_at).toBeNull();
});

test("interval recovery collapses missed occurrences and holds overlapping work", async () => {
  const f = await setup();
  await routine("2026-10-30T00:00:00.000Z", true);
  const bg = new Background(f.lifecycle);
  await bg.tick(new Date("2026-10-30T00:00:10.500Z"));
  expect((await f.store.list("occurrence"))[0].scheduled_for).toBe("2026-10-30T00:00:10.000Z");
  expect((await f.store.list("routine"))[0].next_run_at).toBe("2026-10-30T00:00:11.000Z");
  await bg.tick(new Date("2026-10-30T01:00:00.000Z"));
  expect(await f.store.list("run")).toHaveLength(1);
});

test("paused responsibilities do not fire routines after restart", async () => {
  const f = await setup();
  const goal = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Research",
  });
  await f.lifecycle.create("routine", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    instruction: "Inspect updates",
    schedule: { type: "once", at: "2026-10-30T00:00:00.000Z" },
    timezone: "UTC",
  });
  await f.lifecycle.controlGoal(goal.id, "paused");
  await f.restart();
  await new Background(f.lifecycle).tick(new Date("2026-10-31T00:00:00Z"));
  expect(await f.store.list("occurrence")).toHaveLength(0);
});

test("dispatcher waits for a registered adapter and has no implicit executor", async () => {
  const f = await setup();
  const { run } = await f.admit();
  const bg = new Background(f.lifecycle);
  await bg.tick();
  expect(bg.executorCount).toBe(0);
  expect(bg.activeCount).toBe(0);
  expect((await f.store.get("run", run.id)).status).toBe("queued");
});

test("dispatcher uses one lane at a time and records native acknowledgement before completion", async () => {
  const f = await setup();
  await f.bind();
  const first = await f.admit();
  const second = await f.admit();
  const visited: string[] = [];
  const bg = new Background(f.lifecycle, {
    codex: {
      async execute(run, context) {
        visited.push(run.id);
        await context.started();
        expect((await f.store.get("run", run.id)).status).toBe("running");
        return "succeeded";
      },
    },
  });
  await bg.tick();
  await bg.idle();
  await bg.tick();
  await bg.idle();
  expect(visited).toEqual([first.run.id, second.run.id]);
  expect((await f.store.get("run", second.run.id)).outcome).toBe("succeeded");
});

test("adapter exceptions become unknown and are never automatically retried", async () => {
  const f = await setup();
  await f.bind();
  const { run } = await f.admit();
  let calls = 0;
  const errors: string[] = [];
  const bg = new Background(
    f.lifecycle,
    {
      codex: {
        async execute() {
          calls++;
          throw new Error("secret-example");
        },
      },
    },
    (code) => errors.push(code),
  );
  await bg.tick();
  await bg.idle();
  await bg.tick();
  expect(calls).toBe(1);
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
  expect(errors).toEqual(["EXECUTION_UNKNOWN"]);
});

test("native stop confirmation differs from shutdown timeout and late completion is fenced", async () => {
  const f = await setup();
  await f.bind();
  const first = await f.admit();
  const confirmed = new Background(f.lifecycle, {
    codex: {
      async execute(_run, context) {
        await context.started();
        if (context.signal.aborted) return "cancelled";
        return new Promise((resolve) =>
          context.signal.addEventListener("abort", () => resolve("cancelled")),
        );
      },
    },
  });
  await confirmed.tick();
  await confirmed.stop();
  expect((await f.store.get("run", first.run.id)).cancellation).toBe("confirmed");
  const second = await f.admit();
  let complete: (value: "succeeded") => void = () => {};
  const unresponsive = new Background(f.lifecycle, {
    codex: {
      execute() {
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
  });
  await unresponsive.tick();
  await unresponsive.stop(1);
  expect((await f.store.get("run", second.run.id)).status).toBe("unknown");
  complete("succeeded");
  await unresponsive.idle();
  expect((await f.store.get("run", second.run.id)).status).toBe("unknown");
});
