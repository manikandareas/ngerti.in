import { afterEach, expect, test } from "bun:test";
import { Pool } from "pg";
import { defaultAgentNames, randomAgentName } from "../../src/agents/names";
import { AttachmentDocuments } from "../../src/attachments/documents";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Groups } from "../../src/groups/service";
import { Memories } from "../../src/learning/memories";
import { ScopedData } from "../../src/organizations/data";
import { Store } from "../../src/store";
import { organizationFixture } from "./helpers";

let f: Awaited<ReturnType<typeof organizationFixture>>;
afterEach(async () => {
  if (f) await f.close();
});
async function dataFixture() {
  const fixture = await organizationFixture();
  await fixture.success(
    fixture.write(fixture.owner.cookie, "/v1/data/legacy-binding", {
      organization_id: fixture.initial.organization.id,
      legacy_owner_id: fixture.domain.owner,
    }),
  );
  return fixture;
}
function request(
  cookie: string,
  path: string,
  body?: unknown,
  key = crypto.randomUUID(),
  org = f.initial.organization.id,
  extra: Record<string, string> = {},
) {
  return f.http(path, body, cookie, {
    "X-Ngertiin-Organization": org,
    "Idempotency-Key": key,
    ...extra,
  });
}
async function scope(cookie: string, org = f.initial.organization.id) {
  const req = new Request(`${f.origin}/v1/entities/agent`, {
    headers: { Cookie: cookie, "X-Ngertiin-Organization": org },
  });
  await f.auth.authenticate(req);
  return new ScopedData(f.domain.lifecycle, f.auth).context(req);
}
async function team() {
  const audience = await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }),
  );
  return f.success(
    request(f.owner.cookie, "/v1/data/team-agents", {
      name: "Team helper",
      harness: "codex",
      instructions: "Published directions",
      audience_id: audience.audience.id,
    }),
  );
}
test("random default names come from the single-syllable library subset and exhaust unused names first", () => {
  expect(defaultAgentNames.length).toBeGreaterThan(20);
  const used: string[] = [];
  for (let i = 0; i < defaultAgentNames.length; i++) {
    const name = randomAgentName(used);
    expect(defaultAgentNames).toContain(name);
    expect(used).not.toContain(name);
    used.push(name);
  }
  expect(randomAgentName(used)).toMatch(/ \d+$/);
});
test("membership provisioning creates one private randomly named default agent, DM and authored welcome without inference", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const results = await Promise.all(
    Array.from({ length: 3 }, () => f.success(request(alice.cookie, "/v1/data/provision", {}))),
  );
  expect(new Set(results.map((x) => x.agent_id)).size).toBe(1);
  const agents = await f.success(request(alice.cookie, "/v1/entities/agent"));
  expect(agents).toHaveLength(1);
  expect(defaultAgentNames).toContain(agents[0].name);
  const snapshot = await f.success(
    request(alice.cookie, `/v1/threads/${results[0].thread_id}/snapshot`),
  );
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.messages[0].run_id).toBeNull();
  expect(snapshot.messages[0].text).toContain(agents[0].name);
  expect(snapshot.runs).toHaveLength(0);
  expect((await request(f.owner.cookie, `/v1/entities/agent/${agents[0].id}`)).status).toBe(404);
  expect(
    (await f.success(f.http(`${f.path}/provisioning`, undefined, alice.cookie))).provisioning
      .status,
  ).toBe("materialized");
});
test("two users share Team configuration while their DM, memory, uploads and receipts stay private even from an administrator", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const agent = await team();
  expect(agent.ownership).toBe("organization");
  const a = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const b = await f.success(request(f.owner.cookie, `/v1/agents/${agent.id}/dm`, {}));
  expect(a.id).not.toBe(b.id);
  const context = await scope(alice.cookie);
  const memory = await f.domain.store.withDataContext(context, () =>
    new Memories(f.domain.lifecycle).write(
      { agent_id: agent.id, thread_id: a.id },
      {
        memory_id: crypto.randomUUID(),
        expected_revision: 0,
        visibility: "shared",
        text: "Alice secret fact",
      },
    ),
  );
  const submission = crypto.randomUUID();
  const upload = await f.success(
    request(
      alice.cookie,
      "/v1/message-uploads",
      {
        submission_id: submission,
        thread_id: a.id,
        agent_id: agent.id,
        name: "private.txt",
        media_type: "text/plain",
        content_base64: Buffer.from("Alice secret file").toString("base64"),
      },
      submission,
    ),
  );
  for (const [kind, entity] of [
    ["thread", a],
    ["memory", memory],
    ["attachment_upload", upload],
  ] as const) {
    expect((await request(f.owner.cookie, `/v1/entities/${kind}/${entity.id}`)).status).toBe(404);
    expect(
      (await f.success(request(f.owner.cookie, `/v1/entities/${kind}`))).some(
        (x: { id: string }) => x.id === entity.id,
      ),
    ).toBe(false);
  }
  expect((await request(f.owner.cookie, `/v1/threads/${a.id}/snapshot`)).status).toBe(404);
  expect((await request(f.owner.cookie, `/v1/threads/${a.id}/history`)).status).toBe(404);
  const ownerContext = await scope(f.owner.cookie);
  expect(
    await f.domain.store.withDataContext(ownerContext, () => f.domain.store.receipt(submission)),
  ).toBeNull();
  const events = await f.success(request(f.owner.cookie, "/v1/events"));
  expect(JSON.stringify(events)).not.toContain("Alice secret");
  expect(
    (
      await request(alice.cookie, `/v1/agents/${agent.id}/configuration`, {
        expected_revision: agent.revision,
        changes: { instructions: "Overwrite" },
      })
    ).status,
  ).toBe(403);
});
test("personal preference overlays and explicit published knowledge cannot rewrite or automatically publish private context", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const agent = await team();
  await f.success(
    request(alice.cookie, `/v1/data/agents/${agent.id}/preferences`, {
      instructions: "Answer briefly",
    }),
  );
  expect(
    (await f.success(request(f.owner.cookie, `/v1/entities/agent/${agent.id}`))).instructions,
  ).toBe("Published directions");
  expect(await f.success(request(f.owner.cookie, "/v1/entities/agent_preference"))).toEqual([]);
  expect(
    (await request(alice.cookie, `/v1/data/agents/${agent.id}/knowledge`, { text: "Private fact" }))
      .status,
  ).toBe(403);
  await f.success(
    request(f.owner.cookie, `/v1/data/agents/${agent.id}/knowledge`, {
      text: "Explicitly published fact",
    }),
  );
  const knowledge = await f.success(request(alice.cookie, "/v1/entities/published_knowledge"));
  expect(knowledge).toHaveLength(1);
  expect(knowledge[0].text).toBe("Explicitly published fact");
  expect(knowledge[0].actor_id).toBeNull();
});
test("RLS uses a non-owner role and transaction-local settings across pooled users and organization boundaries", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const a = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const b = await f.success(request(f.owner.cookie, "/v1/data/provision", {}));
  const contexts = await Promise.all([scope(alice.cookie), scope(f.owner.cookie)]);
  for (let i = 0; i < 12; i++) {
    const result = await f.domain.store.withDataContext(contexts[i % 2], () =>
      f.domain.store.query(
        "SELECT current_user AS role,rolsuper,rolbypassrls,(SELECT count(*) FROM entities WHERE kind='agent')::int AS count,(SELECT actor_id FROM entities WHERE id=$1) AS foreign_actor FROM pg_roles WHERE rolname=current_user",
        [i % 2 ? a.agent_id : b.agent_id],
      ),
    );
    expect(result.rows[0]).toEqual({
      role: "ngertiin_runtime",
      rolsuper: false,
      rolbypassrls: false,
      count: i % 2 ? 2 : 1,
      foreign_actor: null,
    });
  }
  await f.organizations.grantCreation("owner@example.test", 2);
  const second = await f.success(
    f.write(f.owner.cookie, "/v1/organizations", { name: "Second", slug: "second" }),
  );
  const secondOrg = second.organization.id;
  expect(
    await f.success(
      request(f.owner.cookie, "/v1/entities/agent", undefined, crypto.randomUUID(), secondOrg),
    ),
  ).toEqual([]);
  expect(
    (
      await request(
        f.owner.cookie,
        `/v1/entities/agent/${b.agent_id}`,
        undefined,
        crypto.randomUUID(),
        secondOrg,
      )
    ).status,
  ).toBe(404);
  expect(
    (await request(alice.cookie, "/v1/entities/agent", undefined, crypto.randomUUID(), secondOrg))
      .status,
  ).toBe(403);
});
test("context-bound replay rejects cross-user cursors and permission changes close old event access", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  const joined = await f.join(alice);
  await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const response = await request(alice.cookie, "/v1/events");
  const page = await response.json();
  const token = response.headers.get("X-Ngertiin-Event-Context") ?? "";
  expect(page.events.length).toBeGreaterThan(0);
  expect((await request(alice.cookie, `/v1/events?after=${page.next_cursor}`)).status).toBe(403);
  expect(
    (
      await request(
        f.owner.cookie,
        `/v1/events?after=${page.next_cursor}`,
        undefined,
        crypto.randomUUID(),
        f.initial.organization.id,
        { "X-Ngertiin-Event-Context": token },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        alice.cookie,
        `/v1/events?after=${page.next_cursor}`,
        undefined,
        crypto.randomUUID(),
        f.initial.organization.id,
        { "X-Ngertiin-Event-Context": token },
      )
    ).status,
  ).toBe(200);
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${joined.membership.id}/remove`));
  expect((await request(alice.cookie, "/v1/events")).status).toBe(403);
});

test("private file publication, immutable downloads, parsed data and command replay stay in the initiating organization", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const setup = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const submission = crypto.randomUUID();
  const bytes = Buffer.from("A private upload");
  const upload = await f.success(
    request(
      alice.cookie,
      "/v1/message-uploads",
      {
        submission_id: submission,
        thread_id: setup.thread_id,
        agent_id: setup.agent_id,
        name: "private.txt",
        media_type: "text/plain",
        content_base64: bytes.toString("base64"),
      },
      submission,
    ),
  );
  const send = {
    submission_id: submission,
    thread_id: setup.thread_id,
    agent_id: setup.agent_id,
    text: "Keep this private",
    artifact_ids: [upload.id],
  };
  const admitted = await f.success(request(alice.cookie, "/v1/runs", send, submission));
  expect(admitted.run.status).toBe("queued");
  const artifact = await f.success(request(alice.cookie, `/v1/entities/artifact/${upload.id}`));
  const download = await request(
    alice.cookie,
    `/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
  );
  expect(download.status).toBe(200);
  expect(await download.text()).toBe(bytes.toString());
  expect(
    (
      await request(
        f.owner.cookie,
        `/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
      )
    ).status,
  ).toBe(404);
  const actor = await scope(alice.cookie);
  await f.domain.store.withDataContext(actor, () =>
    new AttachmentDocuments(f.domain.lifecycle).prepare(artifact, () => {}),
  );
  const documents = await f.success(request(alice.cookie, "/v1/entities/attachment_document"));
  expect(documents).toHaveLength(1);
  expect(await f.success(request(f.owner.cookie, "/v1/entities/attachment_document"))).toEqual([]);
  const replay = await f.success(request(alice.cookie, "/v1/runs", send, submission));
  expect(replay.run.id).toBe(admitted.run.id);
  expect((await request(f.owner.cookie, "/v1/runs", send, submission)).status).toBe(404);
  expect(
    (await request(alice.cookie, `/v1/workspaces/${artifact.workspace_id}/file?path=private.txt`))
      .status,
  ).toBe(403);
});

test("Workgroup invocation is distinct from administration and Team ownership survives creator offboarding", async () => {
  f = await dataFixture();
  const admin = await f.account("admin@example.test");
  const joined = await f.join(admin, "admin");
  const group = await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Selected" }),
  );
  const audience = await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences`, {
      mode: "workgroups",
      workgroup_ids: [group.workgroup.id],
    }),
  );
  const agent = await f.success(
    request(admin.cookie, "/v1/data/team-agents", {
      name: "Retained team",
      harness: "codex",
      audience_id: audience.audience.id,
    }),
  );
  expect((await request(admin.cookie, `/v1/agents/${agent.id}/dm`, {})).status).toBe(403);
  const publicationKey = crypto.randomUUID();
  const publicationPath = `/v1/data/agents/${agent.id}/knowledge`;
  const published = await f.success(
    request(admin.cookie, publicationPath, { text: "Managed publication" }, publicationKey),
  );
  expect(
    (
      await f.success(
        request(admin.cookie, publicationPath, { text: "Managed publication" }, publicationKey),
      )
    ).id,
  ).toBe(published.id);
  const all = await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }),
  );
  await f.success(
    f.write(f.owner.cookie, `${f.path}/agent-access/${agent.id}`, { audience_id: all.audience.id }),
  );
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${joined.membership.id}/remove`));
  expect(
    (await f.success(request(f.owner.cookie, `/v1/entities/agent/${agent.id}`))).ownership,
  ).toBe("organization");
  expect((await request(f.owner.cookie, `/v1/agents/${agent.id}/dm`, {})).status).toBe(200);
  expect((await request(admin.cookie, `/v1/entities/agent/${agent.id}`)).status).toBe(403);
});

test("removed/rejoined membership cannot replay prior receipts or resume its private work implicitly", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  const joined = await f.join(alice);
  const setup = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const key = crypto.randomUUID();
  const body = { thread_id: setup.thread_id, agent_id: setup.agent_id, text: "Original work" };
  await f.success(request(alice.cookie, "/v1/runs", body, key));
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${joined.membership.id}/remove`));
  await f.join(alice);
  expect((await request(alice.cookie, "/v1/runs", body, key)).status).toBe(403);
  await f.success(f.write(alice.cookie, `${f.path}/private-work/resume`));
  const before = await f.success(request(alice.cookie, "/v1/entities/run"));
  expect([403, 409]).toContain((await request(alice.cookie, "/v1/runs", body, key)).status);
  const after = await f.success(request(alice.cookie, "/v1/entities/run"));
  expect(after).toHaveLength(before.length);
  const again = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  expect(again.agent_id).toBe(setup.agent_id);
  expect(again.thread_id).toBe(setup.thread_id);
});

test("database references reject cross-user scope and concurrent organization tabs retain independent commands", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  await f.organizations.grantCreation(alice.email, 1);
  const second = await f.success(
    f.write(alice.cookie, "/v1/organizations", { name: "Other", slug: "other" }),
  );
  const org = second.organization.id;
  const [one, two] = await Promise.all([
    f.success(request(alice.cookie, "/v1/data/provision", {})),
    f.success(request(alice.cookie, "/v1/data/provision", {}, crypto.randomUUID(), org)),
  ]);
  const key = crypto.randomUUID();
  const [first, other] = await Promise.all([
    f.success(request(alice.cookie, `/v1/agents/${one.agent_id}/dm`, {}, key)),
    f.success(request(alice.cookie, `/v1/agents/${two.agent_id}/dm`, {}, key, org)),
  ]);
  expect(first.id).toBe(one.thread_id);
  expect(other.id).toBe(two.thread_id);
  expect(
    (await f.success(request(alice.cookie, `/v1/agents/${one.agent_id}/dm`, {}, key))).id,
  ).toBe(first.id);
  const actor = await scope(alice.cookie);
  const bad = {
    kind: "memory",
    id: crypto.randomUUID(),
    owner_id: f.domain.owner,
    organization_id: actor.organizationId,
    actor_id: actor.userId,
    thread_id: two.thread_id,
  };
  await expect(
    f.domain.store.withDataContext(actor, () =>
      f.domain.store.query(
        "INSERT INTO entities(kind,id,owner_id,organization_id,actor_id,body) VALUES($1,$2,$3,$4,$5,$6)",
        [bad.kind, bad.id, bad.owner_id, bad.organization_id, bad.actor_id, JSON.stringify(bad)],
      ),
    ),
  ).rejects.toMatchObject({ code: "23503" });
});

test("SSE retains its captured private context outside the request and closes on membership revocation", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  const joined = await f.join(alice);
  await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const controller = new AbortController();
  const stream = await fetch(`${f.origin}/v1/events/stream`, {
    headers: { Cookie: alice.cookie, "X-Ngertiin-Organization": f.initial.organization.id },
    signal: controller.signal,
  });
  const reader = stream.body?.getReader();
  if (!reader) throw new Error("Missing event stream");
  let received = "";
  for (let i = 0; i < 12 && !received.includes("event: domain"); i++) {
    const chunk = await reader.read();
    received += new TextDecoder().decode(chunk.value);
  }
  expect(received).toContain("event: domain");
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${joined.membership.id}/remove`));
  let closed = false;
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    for (let i = 0; i < 30; i++) {
      const chunk = await reader.read();
      if (chunk.done) {
        closed = true;
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
    reader.releaseLock();
  }
  expect(closed).toBe(true);
});

test("guarded legacy binding backfills retained private entities/events and blocks old owner-wide routes", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const body = { organization_id: f.initial.organization.id, legacy_owner_id: f.domain.owner };
  expect((await f.write(alice.cookie, "/v1/data/legacy-binding", body)).status).toBe(403);
  expect((await request(alice.cookie, "/v1/entities/agent")).status).toBe(403);
  const before = await f.domain.store.get("agent", f.domain.agent.id);
  await f.domain.admit("Retained unfinished work");
  await f.domain.bind();
  const claimed = await f.domain.lifecycle.claimNext(f.domain.thread.id, f.domain.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Missing fixture dispatch");
  const unknown = await f.domain.lifecycle.settle(claimed.id, claimed.dispatch_token, "unknown");
  expect((await f.write(f.owner.cookie, "/v1/data/legacy-binding", body)).status).toBe(409);
  await f.domain.lifecycle.reconcile(unknown.id, unknown.revision, "failed", crypto.randomUUID());
  await f.success(f.write(f.owner.cookie, "/v1/data/legacy-binding", body));
  await f.success(f.write(f.owner.cookie, "/v1/data/legacy-binding", body));
  const after = await f.success(request(f.owner.cookie, `/v1/entities/agent/${before.id}`));
  expect(after.name).toBe(before.name);
  expect(after.organization_id).toBe(body.organization_id);
  expect((await request(alice.cookie, `/v1/entities/agent/${before.id}`)).status).toBe(404);
  expect((await f.http("/v1/entities/agent", undefined, f.owner.cookie)).status).toBe(403);
});

test("scoped application SQL also works through a real non-owner, non-superuser database login", async () => {
  f = await dataFixture();
  await f.success(request(f.owner.cookie, "/v1/data/provision", {}));
  const actor = await scope(f.owner.cookie);
  const role = `login_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const admin = new Pool({ connectionString: f.domain.options.connectionString });
  let runtime: Store | undefined;
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await admin.query(`GRANT ngertiin_runtime TO "${role}"`);
    const url = new URL(f.domain.options.connectionString ?? "");
    url.username = role;
    url.password = password;
    await f.domain.store.close();
    runtime = await Store.open(f.domain.store.path, f.domain.owner, {
      ...f.domain.options,
      runtimeConnectionString: url.toString(),
    });
    const current = runtime;
    const result = await current.withDataContext(actor, () =>
      current.query(
        "SELECT current_user,session_user,(SELECT count(*)::int FROM entities WHERE kind='agent') AS count",
      ),
    );
    expect(result.rows[0]).toEqual({
      current_user: "ngertiin_runtime",
      session_user: role,
      count: 2,
    });
  } finally {
    await runtime?.close();
    await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
  }
});

test("private Goals/Routine schedule under their retained execution principal without borrowing a UI session or shared native resources", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const setup = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const actor = await scope(alice.cookie);
  const [goal, routine] = await f.domain.store.withDataContext(actor, async () => [
    await f.domain.lifecycle.create("goal", {
      thread_id: setup.thread_id,
      agent_id: setup.agent_id,
      title: "Private responsibility",
    }),
    await f.domain.lifecycle.create("routine", {
      thread_id: setup.thread_id,
      agent_id: setup.agent_id,
      instruction: "Private scheduled check",
      schedule: { type: "once", at: new Date(Date.now() - 1000).toISOString() },
      timezone: "UTC",
    }),
  ]);
  for (const entity of [goal, routine]) {
    expect((await request(f.owner.cookie, `/v1/entities/${entity.kind}/${entity.id}`)).status).toBe(
      404,
    );
    expect((await request(alice.cookie, `/v1/entities/${entity.kind}/${entity.id}`)).status).toBe(
      200,
    );
  }
  let executed = false;
  const background = new Background(f.domain.lifecycle, {
    codex: {
      execute: async () => {
        executed = true;
        return "succeeded";
      },
    },
  });
  await background.tick();
  const runs = await f.success(request(alice.cookie, "/v1/entities/run"));
  expect(runs.some((run: { routine_id: string }) => run.routine_id === routine.id)).toBe(true);
  expect(executed).toBe(false);
  await expect(
    f.domain.store.withDataContext(actor, () =>
      f.domain.lifecycle.claimNext(setup.thread_id, setup.agent_id),
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await background.stop();
});

test("private groups and routing cannot enroll another user's agent or another organization's Team agent", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const setup = await f.success(request(alice.cookie, "/v1/data/provision", {}));
  const agent = await team();
  const actor = await scope(alice.cookie);
  const group = await f.domain.store.withDataContext(actor, () =>
    f.domain.lifecycle.create("thread", {
      type: "group",
      member_agent_ids: [setup.agent_id, agent.id],
    }),
  );
  expect((await request(f.owner.cookie, `/v1/entities/thread/${group.id}`)).status).toBe(404);
  await expect(
    f.domain.store.withDataContext(actor, () =>
      new Groups(f.domain.lifecycle).membership(group.id, {
        expected_revision: group.revision,
        member_agent_ids: [setup.agent_id, f.domain.agent.id],
      }),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    f.domain.store.withDataContext(actor, () =>
      new Groups(f.domain.lifecycle).send(group.id, {
        text: "Route outside my grants",
        agent_id: f.domain.agent.id,
      }),
    ),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
});

test("Team-agent native-binding metadata is actor-private and cannot reference another user's connection", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const setups = await Promise.all([
    f.success(request(alice.cookie, "/v1/data/provision", {})),
    f.success(request(f.owner.cookie, "/v1/data/provision", {})),
  ]);
  const agent = await team();
  const actors = await Promise.all([scope(alice.cookie), scope(f.owner.cookie)]);
  const connections: string[] = [];
  const bindings: Entity<"binding">[] = [];
  for (const [index, cookie] of [alice.cookie, f.owner.cookie].entries()) {
    const dm = await f.success(request(cookie, `/v1/agents/${agent.id}/dm`, {}));
    const personal = await f.success(
      request(cookie, `/v1/entities/agent/${setups[index].agent_id}`),
    );
    connections.push(personal.connection_id);
    const now = new Date().toISOString();
    bindings.push(
      await f.domain.store.withDataContext(actors[index], () =>
        f.domain.store.put({
          kind: "binding",
          id: crypto.randomUUID(),
          owner_id: f.domain.owner,
          revision: 1,
          created_at: now,
          updated_at: now,
          thread_id: dm.id,
          agent_id: agent.id,
          connection_id: personal.connection_id,
          harness: "codex",
          native_session_id: `fixture-session-${index}`,
          generation: 1,
          active: true,
          agent_revision: agent.revision,
          workspace_id: null,
          workspace_revision: null,
        }),
      ),
    );
  }
  expect((await request(f.owner.cookie, `/v1/entities/binding/${bindings[0].id}`)).status).toBe(
    404,
  );
  expect((await request(alice.cookie, `/v1/entities/binding/${bindings[0].id}`)).status).toBe(200);
  await expect(
    f.domain.store.withDataContext(actors[0], () =>
      f.domain.store.put({ ...bindings[0], connection_id: connections[1], revision: 2 }, 1),
    ),
  ).rejects.toMatchObject({ code: "23503" });
});

test("immutable command receipts recheck current Team-agent invocation grants before replay", async () => {
  f = await dataFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const agent = await team();
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const key = crypto.randomUUID();
  const body = { thread_id: dm.id, agent_id: agent.id, text: "One authorized request" };
  const original = await f.success(request(alice.cookie, "/v1/runs", body, key));
  const denied = await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "workgroups", workgroup_ids: [] }),
  );
  await f.success(
    f.write(f.owner.cookie, `${f.path}/agent-access/${agent.id}`, {
      audience_id: denied.audience.id,
    }),
  );
  expect([403, 404]).toContain((await request(alice.cookie, "/v1/runs", body, key)).status);
  const allowed = await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }),
  );
  await f.success(
    f.write(f.owner.cookie, `${f.path}/agent-access/${agent.id}`, {
      audience_id: allowed.audience.id,
    }),
  );
  const replay = await f.success(request(alice.cookie, "/v1/runs", body, key));
  expect(replay.run.id).toBe(original.run.id);
  expect(await f.success(request(alice.cookie, "/v1/entities/run"))).toHaveLength(1);
});
