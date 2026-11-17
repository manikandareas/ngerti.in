import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Entity } from "../../../apps/server/src/contracts";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const harness = process.argv[4];
const phase = process.argv[5] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
assert(harness === "codex" || harness === "muse");
const { token } = await Bun.file(join(directory, "installation.json")).json();
const output = `.dev/verification/nma-055/native/native-${harness}-${phase}.json`;
const report: Record<string, any> = {
  harness,
  phase,
  started_at: new Date().toISOString(),
  results: [],
  runs: [],
};
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const save = () => Bun.write(output, JSON.stringify(report, null, 2));
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${data.error?.code}`);
  return data;
}
async function run(threadId: string, agentId: string, text: string) {
  const admitted = await api("/v1/runs", { thread_id: threadId, agent_id: agentId, text });
  const item: Record<string, any> = {
    id: admitted.run.id,
    prompt_sha256: hash(text),
    status: "queued",
  };
  report.runs.push(item);
  await save();
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const current = await api(`/v1/entities/run/${item.id}`);
    Object.assign(item, {
      status: current.status,
      diagnostic: current.diagnostic,
      product_tools: current.product_tools,
      binding_id: current.binding_id,
      native_run_id: current.native_run_id,
    });
    if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) {
      const snapshot = await api(`/v1/threads/${threadId}/snapshot`);
      item.answer = snapshot.messages.find(
        (m: Entity<"message">) => m.run_id === item.id && m.author === "agent",
      )?.text;
      await save();
      assert.equal(
        current.status,
        "succeeded",
        `Native outcome ${current.status}/${current.diagnostic?.code}`,
      );
      return item;
    }
    if (harness === "muse" && current.status === "running") {
      const pending = await api(`/v1/runs/${item.id}/interactions`);
      for (const approval of pending.approvals ?? []) {
        // Only this generated proof run has been authorized; never persist a native grant.
        assert.equal(approval.subject.kind, "tool");
        assert(approval.availableChoices.some((choice: any) => choice.choiceId === "allow_once"));
        await api(`/v1/runs/${item.id}/interactions`, {
          type: "approval",
          request_id: approval.approvalId,
          source_index: approval.currentRequirementId.sourceIndex,
          choice_id: "allow_once",
        });
        (item.native_approvals ??= []).push({
          approval_id: approval.approvalId,
          choice: "allow_once",
        });
      }
    }
    await Bun.sleep(250);
  }
  await api(`/v1/runs/${item.id}/cancel`, {});
  throw new Error("Verification deadline expired; stop intent sent without claiming confirmation.");
}
function nativeBytes(connectionId: string, workspaceId: string) {
  const roots = [
    join(directory, "connections", connectionId, "codex/skills"),
    join(directory, "connections", connectionId, "home/.agents/skills"),
    join(directory, "workspaces", workspaceId, "files/.agents/skills"),
  ];
  const hashes: Record<string, string> = {};
  const walk = (root: string, path: string, label: string) => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isDirectory()) walk(root, child, label);
      else if (item.isFile())
        hashes[`${label}/${child.slice(root.length + 1)}`] = hash(readFileSync(child));
    }
  };
  roots.forEach((root, index) => {
    if (existsSync(root)) walk(root, root, String(index));
  });
  return hashes;
}
try {
  if (phase === "resume") {
    const previous = await Bun.file(
      `.dev/verification/nma-055/native/native-${harness}-initial.json`,
    ).json();
    for (const key of [
      "agent_id",
      "thread_id",
      "group_id",
      "workspace_id",
      "connection_id",
      "memory_id",
      "correction_command",
      "skill_id",
      "binding_id",
      "native_session_id",
      "billing",
      "model",
    ])
      report[key] = previous[key];
    const context = { agent_id: report.agent_id, thread_id: report.thread_id };
    const before = await api(`/v1/entities/skill_revision`);
    const item = await run(
      report.thread_id,
      report.agent_id,
      `Verify learning after backend restart. Call ngertiin.write_memory with exactly ${JSON.stringify({ command_id: report.correction_command, memory_id: report.memory_id, expected_revision: 1, visibility: "dm_private", text: "Reports should be brief." })}. This is an intentional replay of an old receipt: it MUST NOT restore a deleted fact. Then call ngertiin.list_memories with include_deleted true and confirm the current fact is still deleted at revision 3. Read application skill ${report.skill_id}, version 1 and version 2 with ngertiin.read_skill; verify their different sum asset texts. Call ngertiin.list_skills and verify the assignment is still pinned to version 1. Make no new identities, changes, assignments or files. Reply briefly with the versioned sum results and tombstone status.`,
    );
    for (const name of ["write_memory", "list_memories", "read_skill", "list_skills"])
      assert(item.product_tools.includes(`ngertiin.${name}`));
    const after = await api(`/v1/entities/skill_revision`);
    assert.deepEqual(after, before);
    const memory = await api(`/v1/entities/memory/${report.memory_id}`);
    assert.equal(memory.state, "deleted");
    assert.equal(memory.revision, 3);
    const inventory = await api(
      `/v1/learning/skills?agent_id=${context.agent_id}&thread_id=${context.thread_id}`,
    );
    assert.equal(
      inventory.application.find((s: any) => s.id === report.skill_id).assignment.version,
      1,
    );
    const binding = await api(`/v1/entities/binding/${item.binding_id}`);
    assert.equal(binding.native_session_id, report.native_session_id);
    assert.deepEqual(
      nativeBytes(report.connection_id, report.workspace_id),
      previous.native_hashes,
    );
    report.results.push({
      case: "restart_resume_immutable_assets_pinned_assignment_and_stale_receipt_no_resurrection",
      status: "pass",
    });
  } else {
    const agents = await api("/v1/entities/agent");
    const connections = await api("/v1/entities/connection");
    const prior = agents.find(
      (a: Entity<"agent">) =>
        a.harness === harness &&
        a.model_id &&
        connections.some(
          (c: Entity<"connection">) =>
            c.id === a.connection_id &&
            c.state === "active" &&
            c.authentication.method === (harness === "codex" ? "native_login" : "api_key"),
        ),
    );
    assert(prior, "An explicitly provisioned connection is required.");
    const observed = await api(`/v1/connections/${prior.connection_id}/inspect`, {});
    assert.equal(observed.login, "authenticated");
    const agent = await api("/v1/agents", {
      name: `Learning proof ${harness} ${crypto.randomUUID().slice(0, 8)}`,
      harness,
      connection_id: prior.connection_id,
      model_id: prior.model_id,
      reasoning: "medium",
      instructions:
        "Use the structured Ngertiin learning tools for the requested task. Read exact schemas via ngertiin.describe_tools. Preserve native skills and private conversation boundaries. Do not start goals, schedules, external actions or background work.",
    });
    const thread = await api(`/v1/agents/${agent.id}/dm`, {});
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [agent.id] });
    const workspace = await api("/v1/workspaces", { agent_id: agent.id, thread_id: thread.id });
    Object.assign(report, {
      agent_id: agent.id,
      thread_id: thread.id,
      group_id: group.id,
      workspace_id: workspace.id,
      connection_id: prior.connection_id,
      billing: observed.effective_billing_source,
      model: prior.model_id,
    });
    const nativeRoot = join(
      directory,
      "workspaces",
      workspace.id,
      "files/.agents/skills/native-report",
    );
    mkdirSync(join(nativeRoot, "references"), { recursive: true });
    writeFileSync(
      join(nativeRoot, "SKILL.md"),
      "---\nname: native-report\ndescription: Read two integers from the bundled factors asset and write a concise sum report.\n---\nUse references/factors.txt to obtain the two integers. Compute their sum exactly. Preserve this harness-owned package.\n",
      { flag: "wx" },
    );
    writeFileSync(join(nativeRoot, "references/factors.txt"), "left=18437\nright=23569\n", {
      flag: "wx",
    });
    const context = { agent_id: agent.id, thread_id: thread.id };
    const memoryId = crypto.randomUUID();
    const correction = crypto.randomUUID();
    await api("/v1/learning/memories/write", {
      context,
      memory_id: memoryId,
      expected_revision: 0,
      visibility: "dm_private",
      text: "Reports should be long.",
    });
    await api("/v1/learning/memories/write", {
      context,
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: `PRIVATE_DM_CANARY_${harness}`,
    });
    await api("/v1/learning/memories/write", {
      context,
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "shared",
      text: "Use plain language.",
    });
    await api("/v1/learning/memories/write", {
      context: { ...context, thread_id: group.id },
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "group",
      text: "This group checks scoped learning.",
    });
    const binding = await api(`/v1/threads/${thread.id}/sessions`, { agent_id: agent.id });
    Object.assign(report, {
      memory_id: memoryId,
      correction_command: correction,
      binding_id: binding.id,
      native_session_id: binding.native_session_id,
      native_hashes: nativeBytes(prior.connection_id, workspace.id),
    });
    await save();
    const inventory = await api(`/v1/learning/skills?agent_id=${agent.id}&thread_id=${thread.id}`);
    report.initial_inventory = inventory;
    assert(
      inventory.harness.some((s: any) => s.name === "native-report"),
      "Scoped inherited skill is missing.",
    );
    assert.equal(
      inventory.native_state,
      "supported",
      "Native catalog query must succeed separately.",
    );
    const item = await run(
      thread.id,
      agent.id,
      `Complete this scoped learning exercise using actual tools. Read schemas with ngertiin.describe_tools, then list skills and read the inherited harness skill native-report using ngertiin.read_harness_skill. Compute the sum from its asset; do not guess it or use file/shell tools. List memories, then correct memory ${memoryId} using command_id ${correction}, expected_revision 1, visibility dm_private, and exact text "Reports should be brief.". Create an APPLICATION skill also named native-report (visibility dm_private) using ngertiin.create_skill, keeping the harness package unchanged. Give it useful concise sum-report instructions, description, and one asset at references/sum.txt: version 1 asset text must be only the computed decimal sum followed by a newline. Assign this new application skill to yourself using ngertiin.assign_skill with version 1, expected_revision 0, enabled true. Read it with ngertiin.read_skill, then revise it using ngertiin.revise_skill expected_revision 1: keep useful instructions and use asset text "Total: <computed sum>\\n" at the same path. Read both version 1 and version 2 to confirm immutable results. Leave the assignment pinned to version 1. Finally list skills and explicitly report that the name collision is qualified by source, the assignment is version 1, and the memory was corrected. Use UUID command_id values for distinct mutations. Do not modify or create any native files.`,
    );
    for (const name of [
      "describe_tools",
      "list_skills",
      "read_harness_skill",
      "list_memories",
      "write_memory",
      "create_skill",
      "assign_skill",
      "read_skill",
      "revise_skill",
    ])
      assert(item.product_tools.includes(`ngertiin.${name}`), `Missing successful tool ${name}`);
    const created = (
      await api(`/v1/learning/skills?agent_id=${agent.id}&thread_id=${thread.id}`)
    ).application.find((s: any) => s.name === "native-report");
    assert(created);
    report.skill_id = created.id;
    const one = await api("/v1/learning/skills/read", {
      context,
      skill_id: created.id,
      version: 1,
    });
    const two = await api("/v1/learning/skills/read", {
      context,
      skill_id: created.id,
      version: 2,
    });
    assert.equal(one.revision.package.assets[0].text, "42006\n");
    assert.equal(two.revision.package.assets[0].text, "Total: 42006\n");
    assert.equal(created.assignment.version, 1);
    const memory = await api(`/v1/entities/memory/${memoryId}`);
    assert.equal(memory.text, "Reports should be brief.");
    assert.equal(memory.revision, 2);
    assert.deepEqual(nativeBytes(prior.connection_id, workspace.id), report.native_hashes);
    report.results.push({
      case: "native_learning_round_trip_two_skill_sources_immutable_versions_collision_and_correction",
      status: "pass",
      revision_hashes: [one.revision.sha256, two.revision.sha256],
    });
    await save();
    const groupRun = await run(
      group.id,
      agent.id,
      `Check this group's learning boundary using ngertiin.list_memories and ngertiin.list_skills. Attempt ngertiin.read_skill for skill_id ${created.id}, version 1; it belongs to another private conversation and must be denied. Report that denial and the visible group's memory scope. Never copy content from another conversation and make no changes.`,
    );
    assert(groupRun.product_tools.includes("ngertiin.list_memories"));
    assert(groupRun.product_tools.includes("ngertiin.list_skills"));
    assert(!JSON.stringify(groupRun).includes(`PRIVATE_DM_CANARY_${harness}`));
    const groupInventory = await api(
      `/v1/learning/skills?agent_id=${agent.id}&thread_id=${group.id}`,
    );
    assert(!groupInventory.application.some((s: any) => s.id === created.id));
    report.results.push({ case: "native_group_recall_and_skill_asset_isolation", status: "pass" });
    const deletion = await run(
      thread.id,
      agent.id,
      `Delete memory ${memoryId} at expected_revision 2 using ngertiin.delete_memory with a new UUID command_id. List memories afterwards with include_deleted true and confirm its revision 3 tombstone. Do not delete other facts or change skills.`,
    );
    assert(deletion.product_tools.includes("ngertiin.delete_memory"));
    const tombstone = await api(`/v1/entities/memory/${memoryId}`);
    assert.equal(tombstone.state, "deleted");
    assert.equal(tombstone.revision, 3);
    assert.deepEqual(nativeBytes(prior.connection_id, workspace.id), report.native_hashes);
    report.results.push({
      case: "native_delete_tombstone_and_byte_stable_harness_packages",
      status: "pass",
      files_verified: Object.keys(report.native_hashes).length,
    });
  }
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = error instanceof Error ? error.message : "Verification failed";
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({
      harness,
      phase,
      status: report.status,
      error: report.error,
      runs: report.runs.map((r: any) => ({ id: r.id, status: r.status })),
      checks: report.results.length,
    }),
  );
}
