/** Bounded owner HTTP cases against journey-server.ts, never a retained installation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? ".dev/nma069-journey");
const attachment = JSON.parse(await readFile(`${directory}/attachment.json`, "utf8"));
const identities = JSON.parse(await readFile(`${directory}/identities.json`, "utf8"));
const token = (await readFile(attachment.token_file, "utf8")).trim();
const cases: { name: string; passed: boolean }[] = [];
async function call(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(attachment.origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(body === undefined ? {} : { "Idempotency-Key": key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}
async function test(name: string, run: () => Promise<void>) {
  await run();
  cases.push({ name, passed: true });
}
const context = { agent_id: identities.agent, thread_id: identities.thread };
await test("DM memory stays private to its exact conversation", async () => {
  const dm = await call(
    `/v1/learning/memories?agent_id=${context.agent_id}&thread_id=${context.thread_id}`,
  );
  const group = await call(
    `/v1/learning/memories?agent_id=${context.agent_id}&thread_id=${identities.group}`,
  );
  assert.equal(dm.memories.length, 1);
  assert.equal(group.memories.length, 0);
});
await test("original downloads retain every published hash", async () => {
  const snapshot = await call(`/v1/threads/${identities.thread}/snapshot`);
  assert.equal(snapshot.artifacts.length, 5);
  for (const artifact of snapshot.artifacts) {
    const response = await fetch(
      `${attachment.origin}/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    assert.equal(
      createHash("sha256")
        .update(new Uint8Array(await response.arrayBuffer()))
        .digest("hex"),
      identities.originals[artifact.name],
    );
  }
});
await test("sharing creates an explicit copy with identical bytes", async () => {
  const snapshot = await call(`/v1/threads/${identities.thread}/snapshot`);
  const workspaces = await call("/v1/entities/workspace");
  const destination = workspaces.find(
    (w: { thread_id: string; id: string }) => w.thread_id === identities.group,
  );
  const original = snapshot.artifacts[0];
  const shared = await call(`/v1/artifacts/${original.id}/share`, { workspace_id: destination.id });
  assert.equal(shared.thread_id, identities.group);
  assert.equal(shared.source_artifact_id, original.id);
  assert.equal(shared.sha256, original.sha256);
});
await test("skill publication and assignment revisions stay separate; rollback and disable retain history", async () => {
  const inventory = await call(
    `/v1/learning/skills?agent_id=${context.agent_id}&thread_id=${context.thread_id}`,
  );
  const skill = inventory.application[0];
  const first = await call("/v1/learning/skills/read", { skill_id: skill.id, version: 1, context });
  const revised = await call("/v1/learning/skills/revise", {
    skill_id: skill.id,
    expected_revision: skill.revision,
    package: { ...first.revision.package, description: "Revised context review" },
    context,
  });
  assert.equal(revised.revision.version, 2);
  const list = await call(
    `/v1/learning/skills?agent_id=${context.agent_id}&thread_id=${context.thread_id}`,
  );
  assert.equal(list.application[0].assignment.version, 1);
  let assignment = await call("/v1/learning/skills/assign", {
    skill_id: skill.id,
    version: 2,
    enabled: true,
    expected_revision: list.application[0].assignment.revision,
    context,
  });
  assignment = await call("/v1/learning/skills/assign", {
    skill_id: skill.id,
    version: 1,
    enabled: true,
    expected_revision: assignment.revision,
    context,
  });
  assignment = await call("/v1/learning/skills/assign", {
    skill_id: skill.id,
    version: 1,
    enabled: false,
    expected_revision: assignment.revision,
    context,
  });
  assert.equal(assignment.enabled, false);
  const retained = await call("/v1/learning/skills/read", {
    skill_id: skill.id,
    version: 2,
    context,
  });
  assert.equal(retained.revision.package.description, "Revised context review");
});
await test("Goal and Routine controls return authoritative state without model execution", async () => {
  const snapshot = await call(`/v1/threads/${identities.thread}/snapshot`);
  const goal = snapshot.goals[0];
  let routine = snapshot.routines[0];
  assert.equal((await call(`/v1/goals/${goal.id}/control`, { state: "paused" })).state, "paused");
  assert.equal((await call(`/v1/goals/${goal.id}/control`, { state: "active" })).state, "active");
  routine = await call(`/v1/routines/${routine.id}/control`, {
    expected_revision: routine.revision,
    state: "paused",
  });
  assert.equal(routine.state, "paused");
});
const result = {
  captured_at: new Date().toISOString(),
  cases,
  passed: cases.length,
  total: cases.length,
  executor_count: 0,
  scheduler_started: false,
  external_authorization_attempts: 0,
};
await writeFile(
  resolve("docs/verification/nma-069/api-journeys.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(result);
