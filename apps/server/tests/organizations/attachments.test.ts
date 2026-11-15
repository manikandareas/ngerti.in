import { expect, test } from "bun:test";
import { readinessFixture } from "./readiness-helpers";

test("a scoped attachment-bearing admission reaches the harness with its private document context", async () => {
  const f = await readinessFixture();
  try {
    const lane = await f.lane(f.alice.cookie, "codex");
    const submission = crypto.randomUUID();
    const artifact = await f.success(
      f.request(
        lane.cookie,
        "/v1/message-uploads",
        {
          submission_id: submission,
          thread_id: lane.thread.id,
          agent_id: lane.agent.id,
          name: "private-context.txt",
          media_type: "text/plain",
          content_base64: Buffer.from("Private scoped text fixture").toString("base64"),
        },
        undefined,
        submission,
      ),
    );
    const admission = await f.success(
      f.request(
        lane.cookie,
        "/v1/runs",
        {
          submission_id: submission,
          thread_id: lane.thread.id,
          agent_id: lane.agent.id,
          text: "Read the attached file",
          artifact_ids: [artifact.id],
        },
        undefined,
        submission,
      ),
    );
    await f.background.tick();
    await f.background.idle();
    const run = await f.success(f.request(lane.cookie, `/v1/entities/run/${admission.run.id}`));
    expect(run.status, JSON.stringify(run.diagnostic)).toBe("succeeded");
    expect(
      run.attachment_observations.some(
        (entry: { operation: string }) => entry.operation === "context",
      ),
    ).toBe(true);
    expect(f.calls).toHaveLength(1);
  } finally {
    await f.close();
  }
}, 45000);
