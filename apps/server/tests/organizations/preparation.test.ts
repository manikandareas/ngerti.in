import { expect, test } from "bun:test";
import { readinessFixture } from "./readiness-helpers";

test("a blocked scoped preparation retries through HTTP and replays one JSON command receipt", async () => {
  const f = await readinessFixture();
  try {
    const lane = await f.lane(f.alice.cookie, "muse");
    const admission = await f.success(
      f.request(lane.cookie, "/v1/runs", {
        thread_id: lane.thread.id,
        agent_id: lane.agent.id,
        text: "Retry only this undispatched input",
      }),
    );
    const blocked = await f.domain.store.withDataContext(lane.scope, async () => {
      await f.domain.lifecycle.preparing(admission.run.id, "fixture-runtime");
      return f.domain.lifecycle.preparationFailed(admission.run.id, {
        code: "NATIVE_UNKNOWN",
        category: "unknown",
        outcome: "unknown",
      });
    });
    const key = crypto.randomUUID();
    const body = { expected_revision: blocked.revision };
    const retried = await f.success(
      f.request(lane.cookie, `/v1/runs/${blocked.id}/retry-preparation`, body, undefined, key),
    );
    const replay = await f.success(
      f.request(lane.cookie, `/v1/runs/${blocked.id}/retry-preparation`, body, undefined, key),
    );
    expect(retried.id).toBe(blocked.id);
    expect(retried.preparation).toBeUndefined();
    expect(replay).toEqual(retried);
    await f.background.tick();
    await f.background.idle();
    expect((await f.success(f.request(lane.cookie, `/v1/entities/run/${blocked.id}`))).status).toBe(
      "succeeded",
    );
    expect(f.calls).toHaveLength(1);
    expect((await f.success(f.request(lane.cookie, "/v1/entities/run"))).length).toBe(1);
  } finally {
    await f.close();
  }
}, 45000);
