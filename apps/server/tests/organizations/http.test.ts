import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { nativeAuthorization } from "../../src/auth/native-client";
import { Authentication } from "../../src/auth/service";
import { Organizations } from "../../src/organizations/service";
import { organizationFixture } from "./helpers";

let f: Awaited<ReturnType<typeof organizationFixture>>;
afterEach(async () => {
  if (f) await f.close();
});

test("one account has independent roles in two organizations and membership grants no legacy private-data access", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  await f.organizations.grantCreation(alice.email, 2);
  const second = await f.success(
    f.write(alice.cookie, "/v1/organizations", { name: "Second", slug: "second" }),
  );
  const secondPath = `/v1/organizations/${second.organization.id}`;
  const invitation = await f.invite(alice.cookie, "owner@example.test", "member", [], secondPath);
  await f.success(f.write(f.owner.cookie, `/v1/invitations/${invitation.id}/accept`));
  expect((await f.context(f.owner.cookie)).role).toBe("owner");
  expect((await f.context(f.owner.cookie, secondPath)).role).toBe("member");
  expect(
    (await f.write(f.owner.cookie, `${secondPath}/workgroups`, { name: "Forbidden" })).status,
  ).toBe(403);
  expect((await f.http(f.path, undefined, alice.cookie)).status).toBe(403);
  expect((await f.http("/v1/entities/agent", undefined, alice.cookie)).status).toBe(403);
  expect((await f.http("/v1/events/stream", undefined, alice.cookie)).status).toBe(403);
  expect(
    (await f.http(`/v1/organizations/${crypto.randomUUID()}`, undefined, f.owner.cookie)).status,
  ).toBe(403);
  expect(
    (await f.success(f.http("/v1/organizations", undefined, f.owner.cookie))).organizations,
  ).toHaveLength(2);
});

test("creation entitlement is separate from role and concurrent creations cannot exceed its limit", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  expect(
    (
      await f.write(alice.cookie, "/v1/organizations", {
        name: "No entitlement",
        slug: "not-entitled",
      })
    ).status,
  ).toBe(403);
  await f.organizations.grantCreation(alice.email, 1);
  const results = await Promise.all(
    ["alpha", "beta"].map((slug) =>
      f.write(alice.cookie, "/v1/organizations", { name: slug, slug }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 403]);
  expect((await f.context(alice.cookie)).role).toBe("member");
  expect((await f.http(`${f.path}/members`, undefined, alice.cookie)).status).toBe(403);
  await f.organizations.grantCreation(alice.email, 0);
  expect(
    (await f.success(f.http("/v1/organizations", undefined, alice.cookie))).creation_limit,
  ).toBe(0);
});

test("Owner/Admin/Member matrix protects elevation, peer administrators and the last Owner", async () => {
  f = await organizationFixture();
  const admin = await f.account("admin@example.test");
  const member = await f.account("member@example.test");
  const a = await f.join(admin, "admin");
  const m = await f.join(member);
  expect((await f.write(admin.cookie, `${f.path}/workgroups`, { name: "Operations" })).status).toBe(
    200,
  );
  expect((await f.write(member.cookie, `${f.path}/workgroups`, { name: "Denied" })).status).toBe(
    403,
  );
  expect(
    (await f.write(admin.cookie, `${f.path}/members/${m.membership.id}/role`, { role: "admin" }))
      .status,
  ).toBe(403);
  expect(
    (
      await f.write(admin.cookie, `${f.path}/invitations`, {
        email: "future@example.test",
        role: "admin",
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.write(admin.cookie, `${f.path}/members/${f.initial.membership.id}/remove`)).status,
  ).toBe(403);
  expect(
    (
      await f.write(f.owner.cookie, `${f.path}/members/${f.initial.membership.id}/role`, {
        role: "member",
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.write(f.owner.cookie, `${f.path}/members/${f.initial.membership.id}/remove`)).status,
  ).toBe(409);
  expect((await f.write(member.cookie, `${f.path}/members/${a.membership.id}/remove`)).status).toBe(
    403,
  );
  expect((await f.write(admin.cookie, `${f.path}/members/${m.membership.id}/remove`)).status).toBe(
    200,
  );
  expect((await f.context(admin.cookie)).capabilities.read_private_context).toBe(false);
});

test("concurrent Owner demotions serialize and always retain one Owner", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const member = await f.join(alice);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/members/${member.membership.id}/role`, { role: "owner" }),
  );
  const results = await Promise.all([
    f.write(f.owner.cookie, `${f.path}/members/${f.initial.membership.id}/role`, {
      role: "member",
    }),
    f.write(alice.cookie, `${f.path}/members/${member.membership.id}/role`, { role: "member" }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const count = await f.auth.pool.query(
    "SELECT count(*) FROM member WHERE \"organizationId\"=$1 AND role='owner'",
    [f.initial.organization.id],
  );
  expect(Number(count.rows[0].count)).toBe(1);
});

test("multiple Workgroups form a union; All members is explicit and removed or deleted groups revoke effective access", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const member = await f.join(alice);
  const groups = await Promise.all(
    ["Research", "Operations"].map((name) =>
      f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name })),
    ),
  );
  const groupIds = groups.map((result) => result.workgroup.id);
  for (const group of groupIds)
    await f.success(
      f.write(f.owner.cookie, `${f.path}/workgroups/${group}/members`, {
        membership_id: member.membership.id,
        present: true,
      }),
    );
  expect((await f.context(alice.cookie)).workgroup_ids.sort()).toEqual([...groupIds].sort());
  const audience = (
    await f.success(
      f.write(f.owner.cookie, `${f.path}/audiences`, {
        mode: "workgroups",
        workgroup_ids: groupIds,
      }),
    )
  ).audience;
  const everyone = (
    await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
  ).audience;
  const access = async (id: string, cookie = alice.cookie) =>
    (await f.success(f.http(`${f.path}/audiences/${id}/access`, undefined, cookie))).allowed;
  expect(await access(audience.id)).toBe(true);
  expect(await access(audience.id, f.owner.cookie)).toBe(false);
  expect(await access(everyone.id)).toBe(true);
  const stale = await f.context(alice.cookie);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups/${groupIds[0]}/members`, {
      membership_id: member.membership.id,
      present: false,
    }),
  );
  await expect(f.organizations.assertCurrent(stale)).rejects.toThrow("SCOPE_DENIED");
  expect(await access(audience.id)).toBe(true);
  await f.success(f.write(f.owner.cookie, `${f.path}/workgroups/${groupIds[1]}/delete`));
  expect(await access(audience.id)).toBe(false);
  expect(await access(everyone.id)).toBe(true);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/audiences/${audience.id}`, {
      mode: "workgroups",
      workgroup_ids: [],
    }),
  );
  expect(await access(audience.id)).toBe(false);
});

test("cross-organization Workgroup and membership references fail in both API and database", async () => {
  f = await organizationFixture();
  await f.organizations.grantCreation("owner@example.test", 2);
  const other = await f.success(
    f.write(f.owner.cookie, "/v1/organizations", { name: "Other", slug: "other" }),
  );
  const group = (
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Local" }))
  ).workgroup;
  expect(
    (
      await f.write(f.owner.cookie, `${f.path}/workgroups/${group.id}/members`, {
        membership_id: other.membership.id,
        present: true,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.write(f.owner.cookie, `/v1/organizations/${other.organization.id}/audiences`, {
        mode: "workgroups",
        workgroup_ids: [group.id],
      })
    ).status,
  ).toBe(403);
  await expect(
    f.auth.pool.query(
      'INSERT INTO "teamMember"(id,"teamId","userId",organization_id) VALUES($1,$2,$3,$4)',
      [crypto.randomUUID(), group.id, other.membership.user_id, other.organization.id],
    ),
  ).rejects.toThrow();
});

test("invitation acceptance is email-bound and rejects expired or canceled invitations", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const bob = await f.account("bob@example.test");
  const first = await f.invite(f.owner.cookie, alice.email);
  expect((await f.http(`/v1/invitations/${first.id}`, undefined, bob.cookie)).status).toBe(403);
  expect(
    (await f.success(f.http(`/v1/invitations/${first.id}`, undefined, alice.cookie))).organization
      .id,
  ).toBe(f.initial.organization.id);
  expect((await f.write(bob.cookie, `/v1/invitations/${first.id}/accept`)).status).toBe(403);
  await f.auth.pool.query(
    "UPDATE invitation SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1",
    [first.id],
  );
  expect((await f.write(alice.cookie, `/v1/invitations/${first.id}/accept`)).status).toBe(403);
  const second = await f.invite(f.owner.cookie, alice.email);
  await f.success(f.write(f.owner.cookie, `${f.path}/invitations/${second.id}/cancel`));
  expect((await f.write(alice.cookie, `/v1/invitations/${second.id}/accept`)).status).toBe(403);
  expect((await f.http(f.path, undefined, alice.cookie)).status).toBe(403);
  expect(f.emails.find((email) => email.purpose === "invitation")?.to).toBe(alice.email);
});

test("invitation acceptance rechecks inviter role/generation and deleted Workgroups", async () => {
  f = await organizationFixture();
  const admin = await f.account("admin@example.test");
  const alice = await f.account("alice@example.test");
  const member = await f.join(admin, "admin");
  const first = await f.invite(admin.cookie, alice.email);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/members/${member.membership.id}/role`, { role: "member" }),
  );
  expect((await f.write(alice.cookie, `/v1/invitations/${first.id}/accept`)).status).toBe(403);
  await f.success(f.write(f.owner.cookie, `${f.path}/invitations/${first.id}/cancel`));
  const group = (
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Temporary" }))
  ).workgroup;
  const second = await f.invite(f.owner.cookie, alice.email, "member", [group.id]);
  await f.success(f.write(f.owner.cookie, `${f.path}/workgroups/${group.id}/delete`));
  expect((await f.write(alice.cookie, `/v1/invitations/${second.id}/accept`)).status).toBe(403);
});

test("concurrent acceptance and retries commit exactly one membership and provisioning intent without model calls", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const invitation = await f.invite(f.owner.cookie, alice.email);
  const agentsBefore = await f.domain.store.list("agent");
  const key = crypto.randomUUID();
  const results = await Promise.all(
    [key, key, crypto.randomUUID(), crypto.randomUUID()].map((id) =>
      f.success(f.write(alice.cookie, `/v1/invitations/${invitation.id}/accept`, {}, id)),
    ),
  );
  expect(new Set(results.map((result) => result.membership.id)).size).toBe(1);
  expect(new Set(results.map((result) => result.provisioning.id)).size).toBe(1);
  expect(
    Number(
      (
        await f.auth.pool.query(
          "SELECT count(*) FROM ngertiin_membership_provisioning WHERE organization_id=$1 AND user_id=$2",
          [f.initial.organization.id, alice.userId],
        )
      ).rows[0].count,
    ),
  ).toBe(1);
  expect(await f.domain.store.list("agent")).toEqual(agentsBefore);
  expect(results[0].provisioning.status).toBe("pending");
  expect((await f.http("/v1/entities/agent", undefined, alice.cookie)).status).toBe(403);
});

test("offboarding retains attribution, suspends private work and fences old contexts/receipts across rejoin", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const member = await f.join(alice);
  const before = await f.domain.store.list("agent");
  const stale = await f.context(alice.cookie);
  const oldKey = crypto.randomUUID();
  await f.success(f.write(alice.cookie, `${f.path}/private-work/resume`, {}, oldKey));
  const formerContext = await f.context(alice.cookie);
  await f.success(f.write(f.owner.cookie, `${f.path}/members/${member.membership.id}/remove`));
  expect((await f.http(f.path, undefined, alice.cookie)).status).toBe(403);
  await expect(f.organizations.assertCurrent(stale, true)).rejects.toThrow("SCOPE_DENIED");
  expect(
    (await f.write(alice.cookie, `/v1/invitations/${member.invitation.id}/accept`)).status,
  ).toBe(403);
  const state = (
    await f.auth.pool.query("SELECT * FROM ngertiin_membership_state WHERE user_id=$1", [
      alice.userId,
    ])
  ).rows[0];
  expect(state.private_work_suspended).toBe(true);
  expect(state.status).toBe("removed");
  const again = await f.join(alice);
  expect(again.provisioning.id).toBe(member.provisioning.id);
  expect(again.membership.generation).toBeGreaterThan(member.membership.generation);
  expect(again.membership.private_work_suspended).toBe(true);
  await expect(f.organizations.assertCurrent(formerContext)).rejects.toThrow("SCOPE_DENIED");
  await expect(f.organizations.assertCurrent(await f.context(alice.cookie), true)).rejects.toThrow(
    "SCOPE_DENIED",
  );
  expect((await f.write(alice.cookie, `${f.path}/private-work/resume`, {}, oldKey)).status).toBe(
    403,
  );
  await f.success(f.write(alice.cookie, `${f.path}/private-work/resume`));
  await f.organizations.assertCurrent(await f.context(alice.cookie), true);
  expect(await f.domain.store.list("agent")).toEqual(before);
  const audit = (await f.success(f.http(`${f.path}/audit`, undefined, f.owner.cookie))).audit;
  expect(
    audit.some(
      (row: { action: string; target_id: string }) =>
        row.action === "member.removed" && row.target_id === member.membership.id,
    ),
  ).toBe(true);
});

test("organization export contains administration only and organization deletion remains unavailable", async () => {
  f = await organizationFixture();
  const admin = await f.account("admin@example.test");
  await f.join(admin, "admin");
  const response = await f.http(`${f.path}/export`, undefined, f.owner.cookie);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.retention.private_data).toBe("excluded");
  expect(body.retention.team_ownership).toBe("organization");
  expect(body).not.toHaveProperty("transcripts");
  expect(body).not.toHaveProperty("connections");
  expect((await f.http(`${f.path}/export`, undefined, admin.cookie)).status).toBe(403);
  expect(
    (
      await fetch(`${f.origin}${f.path}`, {
        method: "DELETE",
        headers: { Cookie: f.owner.cookie, Origin: f.origin, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
});

test("raw Better Auth organization routes cannot bypass transactional product policy or select active context", async () => {
  f = await organizationFixture();
  for (const operation of [
    "create",
    "add-member",
    "update-member-role",
    "accept-invitation",
    "set-active",
    "delete",
    "create-team",
  ]) {
    const response = await f.http(`/api/auth/organization/${operation}`, {}, f.owner.cookie);
    expect(response.status).toBe(404);
  }
  expect(
    (
      await f.http(`${f.path}/workgroups`, { name: "Denied" }, f.owner.cookie, {
        Origin: "https://foreign.example",
        "Idempotency-Key": crypto.randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.http("/v1/organizations", undefined, undefined, {
        Authorization: `Bearer ${"o".repeat(64)}`,
      })
    ).status,
  ).toBe(401);
});

test("organization commands require stable IDs and reject changed payloads without leaking inputs", async () => {
  f = await organizationFixture();
  expect((await f.http(`${f.path}/workgroups`, { name: "No ID" }, f.owner.cookie)).status).toBe(
    422,
  );
  const key = crypto.randomUUID();
  const first = await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Same" }, key),
  );
  expect(
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Same" }, key)),
  ).toEqual(first);
  const conflict = await f.write(
    f.owner.cookie,
    `${f.path}/workgroups`,
    { name: "secret-never-echo" },
    key,
  );
  expect(conflict.status).toBe(409);
  expect(await conflict.text()).not.toContain("secret-never-echo");
  expect(
    (await f.success(f.http(`${f.path}/workgroups`, undefined, f.owner.cookie))).workgroups,
  ).toHaveLength(1);
});

test("membership and provisioning survive interruption/reopen with no provider configuration", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const member = await f.join(alice);
  const reopened = await Authentication.open(
    f.config,
    f.domain.options.connectionString,
    f.domain.owner,
    async () => {},
  );
  try {
    const request = new Request(`${f.origin}${f.path}`, { headers: { Cookie: alice.cookie } });
    await reopened.authenticate(request);
    const orgs = new Organizations(reopened);
    expect((await orgs.context(request, f.initial.organization.id)).membership_id).toBe(
      member.membership.id,
    );
    expect((await orgs.list(request)).organizations).toHaveLength(1);
    const intent = (await f.success(f.http(`${f.path}/provisioning`, undefined, alice.cookie)))
      .provisioning;
    expect(intent.id).toBe(member.provisioning.id);
    expect(intent.status).toBe("pending");
  } finally {
    await reopened.close();
  }
});

test("failed invitation delivery retains durable state and explicit retry uses the same delivery identity", async () => {
  let failDelivery = true;
  f = await organizationFixture(async (message) => {
    if (message.purpose === "invitation" && failDelivery)
      throw new Error("Private provider diagnostic");
  });
  const alice = await f.account("alice@example.test");
  const invitation = await f.invite(f.owner.cookie, alice.email);
  expect(invitation.delivery).toBe("failed");
  const first = f.emails.find((message) => message.purpose === "invitation");
  failDelivery = false;
  const sent = await f.success(
    f.write(f.owner.cookie, `${f.path}/invitations/${invitation.id}/send`),
  );
  expect(sent.invitation.delivery).toBe("sent");
  expect(
    f.emails
      .filter((message) => message.purpose === "invitation")
      .map((message) => message.idempotencyKey),
  ).toEqual([first?.idempotencyKey, first?.idempotencyKey]);
  await f.success(f.write(f.owner.cookie, `${f.path}/invitations/${invitation.id}/send`));
  expect(f.emails.filter((message) => message.purpose === "invitation")).toHaveLength(2);
  expect(
    (await f.success(f.write(alice.cookie, `/v1/invitations/${invitation.id}/accept`))).provisioning
      .status,
  ).toBe("pending");
});

test("an interrupted acceptance rolls back membership, Workgroups, audit, receipt and provisioning together", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  const group = (
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Engineering" }))
  ).workgroup;
  const invitation = await f.invite(f.owner.cookie, alice.email, "member", [group.id]);
  await f.auth.pool.query(`CREATE FUNCTION reject_acceptance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.action='invitation.accepted' THEN RAISE EXCEPTION 'fixture interrupted transaction'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_acceptance BEFORE INSERT ON ngertiin_organization_audit FOR EACH ROW EXECUTE FUNCTION reject_acceptance_audit()`);
  const key = crypto.randomUUID();
  expect(
    (await f.write(alice.cookie, `/v1/invitations/${invitation.id}/accept`, {}, key)).status,
  ).toBe(500);
  expect(
    Number(
      (await f.auth.pool.query('SELECT count(*) FROM member WHERE "userId"=$1', [alice.userId]))
        .rows[0].count,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await f.auth.pool.query('SELECT count(*) FROM "teamMember" WHERE "userId"=$1', [
          alice.userId,
        ])
      ).rows[0].count,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await f.auth.pool.query(
          "SELECT count(*) FROM ngertiin_membership_provisioning WHERE user_id=$1",
          [alice.userId],
        )
      ).rows[0].count,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await f.auth.pool.query(
          "SELECT count(*) FROM ngertiin_organization_commands WHERE user_id=$1",
          [alice.userId],
        )
      ).rows[0].count,
    ),
  ).toBe(0);
  expect(
    (await f.auth.pool.query("SELECT status FROM invitation WHERE id=$1", [invitation.id])).rows[0]
      .status,
  ).toBe("pending");
  await f.auth.pool.query("DROP TRIGGER reject_acceptance ON ngertiin_organization_audit");
  const result = await f.success(
    f.write(alice.cookie, `/v1/invitations/${invitation.id}/accept`, {}, key),
  );
  expect(result.provisioning.status).toBe("pending");
  expect((await f.context(alice.cookie)).workgroup_ids).toEqual([group.id]);
});

test("the installed account contract enumerates organization request, response and command semantics", async () => {
  f = await organizationFixture();
  const document = await f.success(f.http("/v1/contracts", undefined, f.owner.cookie));
  expect(document.organizations.version).toBe("nma-074.1");
  const routes = document.http.filter(
    (route: { path: string }) =>
      route.path.startsWith("/v1/organizations") || route.path.startsWith("/v1/invitations"),
  );
  expect(routes).toHaveLength(28);
  for (const route of routes) {
    expect(route.authentication).toBe("user_session_or_oauth_access_token");
    expect(route.response.status).toBe(route.method === "DELETE" ? 403 : 200);
    if (route.method === "POST")
      expect(route.idempotency).toBe(
        route.path.endsWith("/send") ? "not_applicable" : "required_uuid",
      );
  }
});

test("version-1 authentication upgrades additively and preserves users, sessions and owner binding", async () => {
  f = await organizationFixture();
  const schema = `upgrade_${crypto.randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: f.domain.options.connectionString,
    options: `-c search_path=${schema},pg_catalog`,
  });
  let reopened: Authentication | undefined;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const sql = await readFile(new URL("../../src/auth/schema.sql", import.meta.url), "utf8");
    await pool.query(sql);
    await pool.query(
      "CREATE TABLE ngertiin_auth_migrations(version integer PRIMARY KEY,sha256 text NOT NULL)",
    );
    await pool.query("INSERT INTO ngertiin_auth_migrations VALUES(1,$1)", [
      createHash("sha256").update(sql).digest("hex"),
    ]);
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await pool.query(
      "INSERT INTO \"user\"(id,name,email,\"emailVerified\") VALUES($1,'Existing account','existing@example.test',true)",
      [userId],
    );
    await pool.query(
      'INSERT INTO session(id,"userId",token,"updatedAt","expiresAt","deviceKind") VALUES($1,$2,$3,now(),now()+interval \'1 day\',\'web\')',
      [sessionId, userId, token],
    );
    await pool.query("INSERT INTO ngertiin_owner_binding VALUES(1,$1,$2,now())", [
      f.domain.owner,
      userId,
    ]);
    reopened = await Authentication.open(
      { ...f.config, schema },
      f.domain.options.connectionString,
      f.domain.owner,
      async () => {},
    );
    expect(
      (await pool.query("SELECT version FROM ngertiin_auth_migrations ORDER BY version")).rows,
    ).toEqual([{ version: 1 }, { version: 2 }]);
    expect(
      (await pool.query("SELECT token FROM session WHERE id=$1", [sessionId])).rows[0].token,
    ).toBe(token);
    expect(
      (await pool.query("SELECT user_id,legacy_owner_id FROM ngertiin_owner_binding")).rows[0],
    ).toEqual({ user_id: userId, legacy_owner_id: f.domain.owner });
    expect(Number((await pool.query("SELECT count(*) FROM organization")).rows[0].count)).toBe(0);
    await pool.query("UPDATE ngertiin_auth_migrations SET sha256='modified' WHERE version=1");
    await expect(
      Authentication.open(
        { ...f.config, schema },
        f.domain.options.connectionString,
        f.domain.owner,
        async () => {},
      ),
    ).rejects.toThrow("initialization failed");
  } finally {
    await reopened?.close();
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});

test("a public native PKCE client uses the same organization roles and explicit scope", async () => {
  f = await organizationFixture();
  const alice = await f.account("alice@example.test");
  await f.join(alice);
  const flow = nativeAuthorization(f.origin, f.config.nativeRedirectUri);
  const authorize = await fetch(flow.authorizeUrl, {
    headers: { Cookie: alice.cookie },
    redirect: "manual",
  });
  const callback = authorize.headers.get("location");
  if (!callback) throw new Error("Missing native callback.");
  const tokens = await (
    await fetch(`${f.origin}/api/auth/oauth2/token`, {
      method: "POST",
      body: flow.exchange(callback),
    })
  ).json();
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  expect((await f.success(f.http(f.path, undefined, undefined, headers))).role).toBe("member");
  expect(
    (
      await f.http(`${f.path}/workgroups`, { name: "Denied native escalation" }, undefined, {
        ...headers,
        "Idempotency-Key": crypto.randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.http(`/v1/organizations/${crypto.randomUUID()}`, undefined, undefined, headers))
      .status,
  ).toBe(403);
});
