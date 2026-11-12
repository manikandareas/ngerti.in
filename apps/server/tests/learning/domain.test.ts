import { afterEach, expect, test } from "bun:test";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts } from "../../src/harness/context";
import { inheritedSkills, persistInheritedSkills } from "../../src/harness/inherited-skills";
import { ProductTools } from "../../src/harness/tools";
import { ApplicationSkills } from "../../src/learning/application-skills";
import { Memories } from "../../src/learning/memories";
import { fixture } from "../helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
const pkg = (text = "Use the attached checklist.") => ({
  description: "Write a clear report",
  instructions: text,
  assets: [{ path: "references/checklist.txt", text: "Verify facts before publishing." }],
});
async function setup() {
  f = await fixture();
  return {
    context: { agent_id: f.agent.id, thread_id: f.thread.id },
    memories: new Memories(f.lifecycle),
    skills: new ApplicationSkills(f.lifecycle),
  };
}
const write = (text: string, visibility = "dm_private") => ({
  memory_id: crypto.randomUUID(),
  expected_revision: 0,
  visibility,
  text,
});
async function group() {
  return await f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
}
async function toolLane(threadId = f.thread.id) {
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  await f.lifecycle.bind(threadId, f.agent.id, crypto.randomUUID());
  await f.lifecycle.admit({
    thread_id: threadId,
    agent_id: f.agent.id,
    text: "Use learning tools",
  });
  const run = (await f.lifecycle.claimNext(threadId, f.agent.id)) as Entity<"run">;
  const tools = await ProductTools.open(f.lifecycle);
  return { tools, run, lease: await tools.issue(run) };
}

test("scoped recall separates DM, each group, another agent and explicitly shared facts", async () => {
  const { context, memories } = await setup();
  const first = { ...context, thread_id: (await group()).id };
  const second = { ...context, thread_id: (await group()).id };
  await memories.write(context, write("PRIVATE_DM"));
  await memories.write(first, write("FIRST_GROUP", "group"));
  await memories.write(second, write("SECOND_GROUP", "group"));
  await memories.write(context, write("SHARED_PREFERENCE", "shared"));
  expect((await memories.recall(context)).memories.map((m) => m.text)).toEqual([
    "PRIVATE_DM",
    "SHARED_PREFERENCE",
  ]);
  expect((await memories.recall(first)).memories.map((m) => m.text)).toEqual([
    "FIRST_GROUP",
    "SHARED_PREFERENCE",
  ]);
  expect((await memories.recall(second)).memories.map((m) => m.text)).toEqual([
    "SECOND_GROUP",
    "SHARED_PREFERENCE",
  ]);
  const other = await f.lifecycle.createAgent({
    name: "Other",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const dm = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [other.id] });
  expect((await memories.recall({ agent_id: other.id, thread_id: dm.id })).memories).toEqual([]);
  await expect(
    (async () => memories.recall({ agent_id: other.id, thread_id: f.thread.id }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect((async () => memories.write(first, write("Wrong visibility")))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});

test("identity/revision corrections, permanent tombstones and immutable command receipts survive restart", async () => {
  let { context, memories } = await setup();
  const commandId = crypto.randomUUID();
  const input = write("Old preference");
  const saved = await f.store.command(
    commandId,
    { context, input },
    async () => await memories.write(context, input),
  );
  const corrected = await memories.write(context, {
    ...input,
    text: "Correct preference",
    expected_revision: 1,
  });
  expect(corrected.id).toBe(saved.id);
  await expect(
    (async () => memories.write(context, { ...input, text: "Stale", expected_revision: 1 }))(),
  ).rejects.toThrow("CONFLICT");
  await memories.remove(context, { memory_id: saved.id, expected_revision: corrected.revision });
  await f.restart();
  memories = new Memories(f.lifecycle);
  expect(
    await f.store.command(
      commandId,
      { context, input },
      async () => await memories.write(context, input),
    ),
  ).toEqual(saved);
  expect((await memories.recall(context)).memories).toEqual([]);
  expect((await memories.recall(context, { include_deleted: true })).memories[0]).toMatchObject({
    revision: 3,
    state: "deleted",
    text: "",
  });
  await expect((async () => memories.write(context, input))()).rejects.toThrow("CONFLICT");
  await expect(
    (async () => memories.write(context, { ...input, expected_revision: 3 }))(),
  ).rejects.toThrow("CONFLICT");
  await expect(
    (async () => f.store.command(commandId, { context, input: write("Different") }, () => null))(),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});

test("memory transaction failure rolls back identity, event and receipt before retry", async () => {
  const { context, memories } = await setup();
  const input = write("Atomic fact");
  const commandId = crypto.randomUUID();
  const cursor = await f.store.cursor;
  await expect(
    (async () =>
      f.store.command(commandId, input, async () => {
        await memories.write(context, input);
        throw new Error("power boundary");
      }))(),
  ).rejects.toThrow("power boundary");
  expect(await f.store.cursor).toBe(cursor);
  expect((await memories.recall(context)).memories).toEqual([]);
  await f.store.command(commandId, input, async () => await memories.write(context, input));
  expect((await memories.recall(context)).memories).toHaveLength(1);
});

test("bounded recall has stable pagination and refuses a foreign cursor", async () => {
  const { context, memories } = await setup();
  for (let i = 0; i < 8; i++) await memories.write(context, write(`${i} ${"x".repeat(7900)}`));
  const first = await memories.recall(context);
  expect(first.memories.length).toBeLessThan(8);
  expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(33_000);
  const second = await memories.recall(context, { after: first.next_after });
  expect(new Set([...first.memories, ...second.memories].map((m) => m.id)).size).toBe(
    first.memories.length + second.memories.length,
  );
  const foreign = await memories.write(
    { ...context, thread_id: (await group()).id },
    write("Foreign", "group"),
  );
  await expect((async () => memories.recall(context, { after: foreign.id }))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});

test("private skill assets and assignments do not travel to another thread; explicit shared packages do", async () => {
  const { context, skills } = await setup();
  const foreign = { ...context, thread_id: (await group()).id };
  const local = await skills.create(context, {
    name: "private-report",
    visibility: "dm_private",
    package: pkg("DM_PRIVATE_ASSET"),
  });
  await skills.assign(context, {
    skill_id: local.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  await expect(
    (async () => skills.read(foreign, { skill_id: local.skill.id, version: 1 }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    (async () =>
      skills.assign(foreign, {
        skill_id: local.skill.id,
        version: 1,
        expected_revision: 0,
        enabled: true,
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(JSON.stringify(await skills.inventory(foreign))).not.toContain("private-report");
  const shared = await skills.create(context, {
    name: "shared-report",
    visibility: "shared",
    package: pkg(),
  });
  await skills.assign(context, {
    skill_id: shared.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  expect((await skills.inventory(foreign)).application[0].assignment?.enabled).toBe(true);
  const grouped = await skills.create(foreign, {
    name: "group-report",
    visibility: "group",
    package: pkg("GROUP_ONLY"),
  });
  await expect(
    (async () => skills.read(context, { skill_id: grouped.skill.id, version: 1 }))(),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("skill revisions are immutable, assignment updates are explicit and pinned versions survive restart", async () => {
  let { context, skills } = await setup();
  const original = await skills.create(context, {
    name: "research",
    visibility: "dm_private",
    package: pkg("Version one"),
  });
  const input = { skill_id: original.skill.id, version: 1, expected_revision: 0, enabled: true };
  await skills.assign(context, input);
  const revised = await skills.revise(context, {
    skill_id: original.skill.id,
    expected_revision: 1,
    package: pkg("Version two"),
  });
  await expect(
    (async () => f.store.put({ ...original.revision, revision: 2 }, 1))(),
  ).rejects.toThrow("CONFLICT");
  expect((await skills.inventory(context)).application[0].assignment?.version).toBe(1);
  expect(
    (await skills.read(context, { skill_id: original.skill.id, version: 1 })).revision,
  ).toEqual(original.revision);
  await expect(
    (async () =>
      skills.revise(context, {
        skill_id: original.skill.id,
        expected_revision: 1,
        package: pkg(),
      }))(),
  ).rejects.toThrow("CONFLICT");
  await f.restart();
  skills = new ApplicationSkills(f.lifecycle);
  expect(
    (await skills.read(context, { skill_id: original.skill.id, version: 2 })).revision,
  ).toEqual(revised.revision);
  expect(
    (await skills.assign(context, { ...input, version: 2, expected_revision: 1 })).version,
  ).toBe(2);
  await expect((async () => skills.assign(context, input))()).rejects.toThrow("CONFLICT");
  expect(
    (await skills.assign(context, { ...input, version: 2, expected_revision: 2, enabled: false }))
      .enabled,
  ).toBe(false);
});

test("duplicate names, asset path injection and ambiguous asset casing fail without partial revisions", async () => {
  const { context, skills } = await setup();
  const input = { name: "research", visibility: "dm_private", package: pkg() };
  await skills.create(context, input);
  await expect((async () => skills.create(context, input))()).rejects.toThrow("CONFLICT");
  for (const path of ["../../secret", "/tmp/host", "a/../b", "a\\b", "SKILL.md", "a//b", "a\0b"])
    await expect(
      (async () =>
        skills.create(context, {
          ...input,
          name: "invalid",
          package: { ...pkg(), assets: [{ path, text: "bad" }] },
        }))(),
    ).rejects.toThrow();
  await expect(
    (async () =>
      skills.create(context, {
        ...input,
        name: "invalid",
        package: {
          ...pkg(),
          assets: [
            { path: "a.txt", text: "a" },
            { path: "A.txt", text: "b" },
          ],
        },
      }))(),
  ).rejects.toThrow();
  expect(await f.store.list("skill_revision")).toHaveLength(1);
});

test("a new shared assignment cannot introduce a same-name conflict in another conversation", async () => {
  const { context, skills } = await setup();
  const privateSkill = await skills.create(context, {
    name: "report",
    visibility: "dm_private",
    package: pkg(),
  });
  await skills.assign(context, {
    skill_id: privateSkill.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  const other = { ...context, thread_id: (await group()).id };
  const shared = await skills.create(other, {
    name: "report",
    visibility: "shared",
    package: pkg(),
  });
  await expect(
    (async () =>
      skills.assign(other, {
        skill_id: shared.skill.id,
        version: 1,
        expected_revision: 0,
        enabled: true,
      }))(),
  ).rejects.toThrow("CONFLICT");
  expect(
    (await skills.inventory(context)).application.find((item) => item.id === shared.skill.id)
      ?.assignment,
  ).toBeNull();
});

test("group members share group facts but retain separate private memory and skill write ownership", async () => {
  const { context, skills, memories } = await setup();
  const peer = await f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const thread = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const own = { ...context, thread_id: thread.id };
  const other = { agent_id: peer.id, thread_id: thread.id };
  await memories.write(context, write("PRIVATE_OWNER_FACT"));
  await memories.write(own, write("GROUP_FACT", "group"));
  expect((await memories.recall(other)).memories.map((item) => item.text)).toEqual(["GROUP_FACT"]);
  const created = await skills.create(own, {
    name: "team-report",
    visibility: "group",
    package: pkg(),
  });
  expect(
    (await skills.read(other, { skill_id: created.skill.id, version: 1 })).revision.sha256,
  ).toBe(created.revision.sha256);
  await expect(
    (async () =>
      skills.revise(other, {
        skill_id: created.skill.id,
        expected_revision: 1,
        package: pkg("Peer overwrite"),
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  const current = await f.store.get("thread", thread.id);
  await f.store.put(
    { ...current, revision: current.revision + 1, member_agent_ids: [f.agent.id] },
    current.revision,
  );
  await expect(
    (async () => skills.read(other, { skill_id: created.skill.id, version: 1 }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect((async () => memories.recall(other))()).rejects.toThrow("SCOPE_DENIED");
});

test("harness inventory is read-only, qualified name collisions are visible and app writes preserve native bytes", async () => {
  const { context, skills } = await setup();
  const launch = new CredentialContexts(f.dir).create(
    await f.store.get("connection", (await f.store.get("agent", f.agent.id)).connection_id),
  );
  const root = join(launch.env.HOME, ".agents/skills/research");
  mkdirSync(root, { recursive: true });
  const file = join(root, "SKILL.md");
  const bytes =
    "---\nname: research\ndescription: Native research skill\n---\nKeep native skills unchanged.\n";
  writeFileSync(file, bytes);
  const binding = await f.lifecycle.bind(context.thread_id, context.agent_id, "native");
  await persistInheritedSkills(f.lifecycle, launch, binding.id);
  const app = await skills.create(context, {
    name: "research",
    visibility: "dm_private",
    package: pkg(),
  });
  const inventory = await skills.inventory(context);
  expect(inventory.collisions).toEqual(["research"]);
  expect(inventory.harness[0].writable).toBe(false);
  const inherited = await skills.readHarness(context, inventory.harness[0].key);
  expect(inherited.package.instructions).toContain("Keep native skills unchanged.");
  await skills.revise(context, {
    skill_id: app.skill.id,
    expected_revision: 1,
    package: pkg("App-only revision"),
  });
  expect(readFileSync(file, "utf8")).toBe(bytes);
  await expect(
    (async () =>
      skills.revise(context, { skill_id: inherited.key, expected_revision: 1, package: pkg() }))(),
  ).rejects.toThrow();
  const other = { ...context, thread_id: (await group()).id };
  await expect((async () => skills.readHarness(other, inherited.key))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
  await persistInheritedSkills(f.lifecycle, launch, binding.id, {
    native_state: "supported",
    native_catalog: [
      {
        key: "native:codex:user:research",
        name: "research",
        description: "Disabled native package",
        native_source: "user",
        enabled: false,
      },
    ],
  });
  expect((await skills.inventory(context)).harness).toEqual([]);
  await expect((async () => skills.readHarness(context, inherited.key))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});

test("native discovery refuses symlink ancestors and hardlinked content instead of exposing foreign assets", async () => {
  await setup();
  const launch = new CredentialContexts(f.dir).create(
    await f.store.get("connection", (await f.store.get("agent", f.agent.id)).connection_id),
  );
  const root = join(launch.env.HOME, ".agents/skills/research");
  mkdirSync(root, { recursive: true });
  const secret = join(f.dir, "foreign.txt");
  writeFileSync(secret, "FOREIGN_NATIVE_ASSET");
  writeFileSync(
    join(root, "SKILL.md"),
    "---\nname: research\ndescription: Native research\n---\nRead the guide.\n",
  );
  linkSync(secret, join(root, "foreign.txt"));
  expect(inheritedSkills(launch).rejected_packages).toBe(1);
  expect(JSON.stringify(inheritedSkills(launch))).not.toContain("FOREIGN_NATIVE_ASSET");
  const second = new CredentialContexts(join(realpathSync(f.dir), "other-state")).create(
    await f.store.get("connection", (await f.store.get("agent", f.agent.id)).connection_id),
  );
  mkdirSync(join(second.env.HOME, ".agents"), { recursive: true });
  symlinkSync(join(launch.env.HOME, ".agents/skills"), join(second.env.HOME, ".agents/skills"));
  expect(inheritedSkills(second).skills).toEqual([]);
});

test("learning tools bind command receipts to the lease context and deny effects after grant revocation", async () => {
  const { context } = await setup();
  const lane = await toolLane();
  const payload = { ...write("Only this DM"), command_id: crypto.randomUUID() };
  await lane.tools.call(lane.lease.token, lane.lease.scope, "ngertiin.write_memory", payload);
  const other = await toolLane((await group()).id);
  await expect(
    other.tools.call(other.lease.token, other.lease.scope, "ngertiin.write_memory", {
      ...payload,
      visibility: "group",
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(
    lane.tools.call(
      lane.lease.token,
      { ...lane.lease.scope, thread_id: other.run.thread_id },
      "ngertiin.list_memories",
      {},
    ),
  ).rejects.toThrow("SCOPE_DENIED");
  await new Connections(f.lifecycle).revoke((await f.store.get("agent", f.agent.id)).connection_id);
  await expect(
    lane.tools.call(lane.lease.token, lane.lease.scope, "ngertiin.write_memory", payload),
  ).rejects.toThrow("SCOPE_DENIED");
  expect((await new Memories(f.lifecycle).recall(context)).memories).toHaveLength(1);
});

test("HTTP learning commands authenticate, deduplicate concurrent retries and expose reviewable revisions", async () => {
  const { context } = await setup();
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), "t".repeat(64));
  const commandId = crypto.randomUUID();
  const input = { ...write("Prefer concise answers"), context };
  const request = (path: string, body?: unknown, key = commandId, token = "t".repeat(64)) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => request("/v1/learning/memories/write", input)),
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(await f.store.list("memory")).toHaveLength(1);
  expect((await request("/v1/learning/memories/write", input, commandId, "wrong")).status).toBe(
    401,
  );
  const response = await request(
    `/v1/learning/memories?agent_id=${context.agent_id}&thread_id=${context.thread_id}&query=concise`,
  );
  expect(response.status).toBe(200);
  expect((await response.json()).memories[0].text).toBe(input.text);
  const created = await request(
    "/v1/learning/skills/create",
    { context, name: "summary", visibility: "dm_private", package: pkg() },
    crypto.randomUUID(),
  );
  expect(created.status).toBe(200);
  const saved = await created.json();
  const read = await request(
    "/v1/learning/skills/read",
    { context, skill_id: saved.skill.id, version: 1 },
    crypto.randomUUID(),
  );
  expect((await read.json()).revision.sha256).toBe(saved.revision.sha256);
});
