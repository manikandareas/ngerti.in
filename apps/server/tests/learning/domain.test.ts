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

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
const pkg = (text = "Use the attached checklist.") => ({
  description: "Write a clear report",
  instructions: text,
  assets: [{ path: "references/checklist.txt", text: "Verify facts before publishing." }],
});
function setup() {
  f = fixture();
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
function group() {
  return f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
}
function toolLane(threadId = f.thread.id) {
  const connections = new Connections(f.lifecycle);
  const connection = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  f.lifecycle.bind(threadId, f.agent.id, crypto.randomUUID());
  f.lifecycle.admit({ thread_id: threadId, agent_id: f.agent.id, text: "Use learning tools" });
  const run = f.lifecycle.claimNext(threadId, f.agent.id) as Entity<"run">;
  const tools = new ProductTools(f.lifecycle);
  return { tools, run, lease: tools.issue(run) };
}

test("scoped recall separates DM, each group, another agent and explicitly shared facts", () => {
  const { context, memories } = setup();
  const first = { ...context, thread_id: group().id };
  const second = { ...context, thread_id: group().id };
  memories.write(context, write("PRIVATE_DM"));
  memories.write(first, write("FIRST_GROUP", "group"));
  memories.write(second, write("SECOND_GROUP", "group"));
  memories.write(context, write("SHARED_PREFERENCE", "shared"));
  expect(memories.recall(context).memories.map((m) => m.text)).toEqual([
    "PRIVATE_DM",
    "SHARED_PREFERENCE",
  ]);
  expect(memories.recall(first).memories.map((m) => m.text)).toEqual([
    "FIRST_GROUP",
    "SHARED_PREFERENCE",
  ]);
  expect(memories.recall(second).memories.map((m) => m.text)).toEqual([
    "SECOND_GROUP",
    "SHARED_PREFERENCE",
  ]);
  const other = f.lifecycle.createAgent({
    name: "Other",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const dm = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [other.id] });
  expect(memories.recall({ agent_id: other.id, thread_id: dm.id }).memories).toEqual([]);
  expect(() => memories.recall({ agent_id: other.id, thread_id: f.thread.id })).toThrow(
    "SCOPE_DENIED",
  );
  expect(() => memories.write(first, write("Wrong visibility"))).toThrow("SCOPE_DENIED");
});

test("identity/revision corrections, permanent tombstones and immutable command receipts survive restart", () => {
  let { context, memories } = setup();
  const commandId = crypto.randomUUID();
  const input = write("Old preference");
  const saved = f.store.command(commandId, { context, input }, () =>
    memories.write(context, input),
  );
  const corrected = memories.write(context, {
    ...input,
    text: "Correct preference",
    expected_revision: 1,
  });
  expect(corrected.id).toBe(saved.id);
  expect(() => memories.write(context, { ...input, text: "Stale", expected_revision: 1 })).toThrow(
    "CONFLICT",
  );
  memories.remove(context, { memory_id: saved.id, expected_revision: corrected.revision });
  f.restart();
  memories = new Memories(f.lifecycle);
  expect(
    f.store.command(commandId, { context, input }, () => memories.write(context, input)),
  ).toEqual(saved);
  expect(memories.recall(context).memories).toEqual([]);
  expect(memories.recall(context, { include_deleted: true }).memories[0]).toMatchObject({
    revision: 3,
    state: "deleted",
    text: "",
  });
  expect(() => memories.write(context, input)).toThrow("CONFLICT");
  expect(() => memories.write(context, { ...input, expected_revision: 3 })).toThrow("CONFLICT");
  expect(() =>
    f.store.command(commandId, { context, input: write("Different") }, () => null),
  ).toThrow("IDEMPOTENCY_CONFLICT");
});

test("memory transaction failure rolls back identity, event and receipt before retry", () => {
  const { context, memories } = setup();
  const input = write("Atomic fact");
  const commandId = crypto.randomUUID();
  const cursor = f.store.cursor;
  expect(() =>
    f.store.command(commandId, input, () => {
      memories.write(context, input);
      throw new Error("power boundary");
    }),
  ).toThrow("power boundary");
  expect(f.store.cursor).toBe(cursor);
  expect(memories.recall(context).memories).toEqual([]);
  f.store.command(commandId, input, () => memories.write(context, input));
  expect(memories.recall(context).memories).toHaveLength(1);
});

test("bounded recall has stable pagination and refuses a foreign cursor", () => {
  const { context, memories } = setup();
  for (let i = 0; i < 8; i++) memories.write(context, write(`${i} ${"x".repeat(7900)}`));
  const first = memories.recall(context);
  expect(first.memories.length).toBeLessThan(8);
  expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(33_000);
  const second = memories.recall(context, { after: first.next_after });
  expect(new Set([...first.memories, ...second.memories].map((m) => m.id)).size).toBe(
    first.memories.length + second.memories.length,
  );
  const foreign = memories.write({ ...context, thread_id: group().id }, write("Foreign", "group"));
  expect(() => memories.recall(context, { after: foreign.id })).toThrow("SCOPE_DENIED");
});

test("private skill assets and assignments do not travel to another thread; explicit shared packages do", () => {
  const { context, skills } = setup();
  const foreign = { ...context, thread_id: group().id };
  const local = skills.create(context, {
    name: "private-report",
    visibility: "dm_private",
    package: pkg("DM_PRIVATE_ASSET"),
  });
  skills.assign(context, {
    skill_id: local.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  expect(() => skills.read(foreign, { skill_id: local.skill.id, version: 1 })).toThrow(
    "SCOPE_DENIED",
  );
  expect(() =>
    skills.assign(foreign, {
      skill_id: local.skill.id,
      version: 1,
      expected_revision: 0,
      enabled: true,
    }),
  ).toThrow("SCOPE_DENIED");
  expect(JSON.stringify(skills.inventory(foreign))).not.toContain("private-report");
  const shared = skills.create(context, {
    name: "shared-report",
    visibility: "shared",
    package: pkg(),
  });
  skills.assign(context, {
    skill_id: shared.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  expect(skills.inventory(foreign).application[0].assignment?.enabled).toBe(true);
  const grouped = skills.create(foreign, {
    name: "group-report",
    visibility: "group",
    package: pkg("GROUP_ONLY"),
  });
  expect(() => skills.read(context, { skill_id: grouped.skill.id, version: 1 })).toThrow(
    "SCOPE_DENIED",
  );
});

test("skill revisions are immutable, assignment updates are explicit and pinned versions survive restart", () => {
  let { context, skills } = setup();
  const original = skills.create(context, {
    name: "research",
    visibility: "dm_private",
    package: pkg("Version one"),
  });
  const input = { skill_id: original.skill.id, version: 1, expected_revision: 0, enabled: true };
  skills.assign(context, input);
  const revised = skills.revise(context, {
    skill_id: original.skill.id,
    expected_revision: 1,
    package: pkg("Version two"),
  });
  expect(() => f.store.put({ ...original.revision, revision: 2 }, 1)).toThrow("CONFLICT");
  expect(skills.inventory(context).application[0].assignment?.version).toBe(1);
  expect(skills.read(context, { skill_id: original.skill.id, version: 1 }).revision).toEqual(
    original.revision,
  );
  expect(() =>
    skills.revise(context, { skill_id: original.skill.id, expected_revision: 1, package: pkg() }),
  ).toThrow("CONFLICT");
  f.restart();
  skills = new ApplicationSkills(f.lifecycle);
  expect(skills.read(context, { skill_id: original.skill.id, version: 2 }).revision).toEqual(
    revised.revision,
  );
  expect(skills.assign(context, { ...input, version: 2, expected_revision: 1 }).version).toBe(2);
  expect(() => skills.assign(context, input)).toThrow("CONFLICT");
  expect(
    skills.assign(context, { ...input, version: 2, expected_revision: 2, enabled: false }).enabled,
  ).toBe(false);
});

test("duplicate names, asset path injection and ambiguous asset casing fail without partial revisions", () => {
  const { context, skills } = setup();
  const input = { name: "research", visibility: "dm_private", package: pkg() };
  skills.create(context, input);
  expect(() => skills.create(context, input)).toThrow("CONFLICT");
  for (const path of ["../../secret", "/tmp/host", "a/../b", "a\\b", "SKILL.md", "a//b", "a\0b"])
    expect(() =>
      skills.create(context, {
        ...input,
        name: "invalid",
        package: { ...pkg(), assets: [{ path, text: "bad" }] },
      }),
    ).toThrow();
  expect(() =>
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
    }),
  ).toThrow();
  expect(f.store.list("skill_revision")).toHaveLength(1);
});

test("a new shared assignment cannot introduce a same-name conflict in another conversation", () => {
  const { context, skills } = setup();
  const privateSkill = skills.create(context, {
    name: "report",
    visibility: "dm_private",
    package: pkg(),
  });
  skills.assign(context, {
    skill_id: privateSkill.skill.id,
    version: 1,
    expected_revision: 0,
    enabled: true,
  });
  const other = { ...context, thread_id: group().id };
  const shared = skills.create(other, { name: "report", visibility: "shared", package: pkg() });
  expect(() =>
    skills.assign(other, {
      skill_id: shared.skill.id,
      version: 1,
      expected_revision: 0,
      enabled: true,
    }),
  ).toThrow("CONFLICT");
  expect(
    skills.inventory(context).application.find((item) => item.id === shared.skill.id)?.assignment,
  ).toBeNull();
});

test("group members share group facts but retain separate private memory and skill write ownership", () => {
  const { context, skills, memories } = setup();
  const peer = f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const thread = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const own = { ...context, thread_id: thread.id };
  const other = { agent_id: peer.id, thread_id: thread.id };
  memories.write(context, write("PRIVATE_OWNER_FACT"));
  memories.write(own, write("GROUP_FACT", "group"));
  expect(memories.recall(other).memories.map((item) => item.text)).toEqual(["GROUP_FACT"]);
  const created = skills.create(own, { name: "team-report", visibility: "group", package: pkg() });
  expect(skills.read(other, { skill_id: created.skill.id, version: 1 }).revision.sha256).toBe(
    created.revision.sha256,
  );
  expect(() =>
    skills.revise(other, {
      skill_id: created.skill.id,
      expected_revision: 1,
      package: pkg("Peer overwrite"),
    }),
  ).toThrow("SCOPE_DENIED");
  const current = f.store.get("thread", thread.id);
  f.store.put(
    { ...current, revision: current.revision + 1, member_agent_ids: [f.agent.id] },
    current.revision,
  );
  expect(() => skills.read(other, { skill_id: created.skill.id, version: 1 })).toThrow(
    "SCOPE_DENIED",
  );
  expect(() => memories.recall(other)).toThrow("SCOPE_DENIED");
});

test("harness inventory is read-only, qualified name collisions are visible and app writes preserve native bytes", () => {
  const { context, skills } = setup();
  const launch = new CredentialContexts(f.dir).create(
    f.store.get("connection", f.store.get("agent", f.agent.id).connection_id),
  );
  const root = join(launch.env.HOME, ".agents/skills/research");
  mkdirSync(root, { recursive: true });
  const file = join(root, "SKILL.md");
  const bytes =
    "---\nname: research\ndescription: Native research skill\n---\nKeep native skills unchanged.\n";
  writeFileSync(file, bytes);
  const binding = f.lifecycle.bind(context.thread_id, context.agent_id, "native");
  persistInheritedSkills(f.lifecycle, launch, binding.id);
  const app = skills.create(context, {
    name: "research",
    visibility: "dm_private",
    package: pkg(),
  });
  const inventory = skills.inventory(context);
  expect(inventory.collisions).toEqual(["research"]);
  expect(inventory.harness[0].writable).toBe(false);
  const inherited = skills.readHarness(context, inventory.harness[0].key);
  expect(inherited.package.instructions).toContain("Keep native skills unchanged.");
  skills.revise(context, {
    skill_id: app.skill.id,
    expected_revision: 1,
    package: pkg("App-only revision"),
  });
  expect(readFileSync(file, "utf8")).toBe(bytes);
  expect(() =>
    skills.revise(context, { skill_id: inherited.key, expected_revision: 1, package: pkg() }),
  ).toThrow();
  const other = { ...context, thread_id: group().id };
  expect(() => skills.readHarness(other, inherited.key)).toThrow("SCOPE_DENIED");
  persistInheritedSkills(f.lifecycle, launch, binding.id, {
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
  expect(skills.inventory(context).harness).toEqual([]);
  expect(() => skills.readHarness(context, inherited.key)).toThrow("SCOPE_DENIED");
});

test("native discovery refuses symlink ancestors and hardlinked content instead of exposing foreign assets", () => {
  setup();
  const launch = new CredentialContexts(f.dir).create(
    f.store.get("connection", f.store.get("agent", f.agent.id).connection_id),
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
    f.store.get("connection", f.store.get("agent", f.agent.id).connection_id),
  );
  mkdirSync(join(second.env.HOME, ".agents"), { recursive: true });
  symlinkSync(join(launch.env.HOME, ".agents/skills"), join(second.env.HOME, ".agents/skills"));
  expect(inheritedSkills(second).skills).toEqual([]);
});

test("learning tools bind command receipts to the lease context and deny effects after grant revocation", async () => {
  const { context } = setup();
  const lane = toolLane();
  const payload = { ...write("Only this DM"), command_id: crypto.randomUUID() };
  await lane.tools.call(lane.lease.token, lane.lease.scope, "ngertiin.write_memory", payload);
  const other = toolLane(group().id);
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
  new Connections(f.lifecycle).revoke(f.store.get("agent", f.agent.id).connection_id);
  await expect(
    lane.tools.call(lane.lease.token, lane.lease.scope, "ngertiin.write_memory", payload),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(new Memories(f.lifecycle).recall(context).memories).toHaveLength(1);
});

test("HTTP learning commands authenticate, deduplicate concurrent retries and expose reviewable revisions", async () => {
  const { context } = setup();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "t".repeat(64));
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
  expect(f.store.list("memory")).toHaveLength(1);
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
