import { expect, test } from "bun:test";
import { Connections } from "../../src/harness/connections";
import { readinessFixture } from "./readiness-helpers";

test("Muse's selected-process model catalog cannot invalidate the frozen account selection during preparation", async () => {
  const f = await readinessFixture();
  try {
    const lane = await f.lane(f.alice.cookie, "muse");
    const connection = await f.domain.store.withDataContext(lane.scope, () =>
      new Connections(f.domain.lifecycle).update(lane.connection, {
        models: [
          { id: "fixture-model", reasoning: [] },
          { id: "another-account-model", reasoning: [] },
        ],
      }),
    );
    const admission = await f.success(
      f.request(lane.cookie, "/v1/runs", {
        thread_id: lane.thread.id,
        agent_id: lane.agent.id,
        text: "First Muse task after account catalog discovery",
      }),
    );
    expect(admission.run.provider_selection.connection_generation).toBe(connection.grant_revision);
    await f.background.tick();
    await f.background.idle();
    const run = await f.success(f.request(lane.cookie, `/v1/entities/run/${admission.run.id}`));
    expect(run.status, JSON.stringify(run.diagnostic)).toBe("succeeded");
    const after = await f.success(
      f.request(lane.cookie, `/v1/entities/connection/${connection.id}`),
    );
    expect(after.models).toEqual(connection.models);
    expect(after.grant_revision).toBe(connection.grant_revision);
    expect(run.provider_selection).toEqual(admission.run.provider_selection);
    expect(f.calls).toHaveLength(1);
  } finally {
    await f.close();
  }
}, 45000);

test("retaining Muse account choices never broadens the native session's reasoning support", async () => {
  const f = await readinessFixture();
  try {
    const lane = await f.lane(f.alice.cookie, "muse");
    await f.domain.store.withDataContext(lane.scope, () =>
      new Connections(f.domain.lifecycle).update(lane.connection, {
        models: [
          { id: "fixture-model", reasoning: ["max"] },
          { id: "another-account-model", reasoning: [] },
        ],
      }),
    );
    await f.success(
      f.request(lane.cookie, "/v1/ai/selections", {
        scope: "user",
        harness: "muse",
        selection: {
          connection_id: lane.connection.id,
          model_id: "fixture-model",
          reasoning: "max",
        },
      }),
    );
    const admission = await f.success(
      f.request(lane.cookie, "/v1/runs", {
        thread_id: lane.thread.id,
        agent_id: lane.agent.id,
        text: "Use only the explicitly selected reasoning",
      }),
    );
    await f.background.tick();
    await f.background.idle();
    const run = await f.success(f.request(lane.cookie, `/v1/entities/run/${admission.run.id}`));
    expect(run.status).toBe("queued");
    expect(run.preparation.state).toBe("blocked");
    expect(run.diagnostic.code).toBe("MODEL_UNAVAILABLE");
    expect(run.provider_selection.reasoning).toBe("max");
    expect(f.calls).toHaveLength(0);
  } finally {
    await f.close();
  }
}, 45000);
