import { afterEach, expect, test } from "bun:test";
import { organizationFixture } from "./helpers";

let fixture: Awaited<ReturnType<typeof organizationFixture>> | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

test("members can read only their own workgroup names without the organization roster", async () => {
  const f = await organizationFixture();
  fixture = f;
  const member = await f.account("member@example.test");
  const joined = await f.join(member);
  const outside = await f.account("outside@example.test");
  const first = (
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Research" }))
  ).workgroup;
  await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Private team" }));
  await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups/${first.id}/members`, {
      membership_id: joined.membership.id,
      present: true,
    }),
  );
  expect(await f.success(f.http(`${f.path}/my-workgroups`, undefined, member.cookie))).toEqual({
    workgroups: [{ id: first.id, name: "Research" }],
  });
  expect((await f.http(`${f.path}/workgroups`, undefined, member.cookie)).status).toBe(403);
  expect((await f.http(`${f.path}/my-workgroups`, undefined, outside.cookie)).status).toBe(403);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups/${first.id}/members`, {
      membership_id: joined.membership.id,
      present: false,
    }),
  );
  expect(await f.success(f.http(`${f.path}/my-workgroups`, undefined, member.cookie))).toEqual({
    workgroups: [],
  });
});

test("saved shared-agent audience projections require current organization management access", async () => {
  const f = await organizationFixture();
  fixture = f;
  await f.success(
    f.write(f.owner.cookie, "/v1/data/legacy-binding", {
      organization_id: f.initial.organization.id,
      legacy_owner_id: f.domain.owner,
    }),
  );
  const member = await f.account("member@example.test");
  await f.join(member);
  const admin = await f.account("admin@example.test");
  const adminMembership = await f.join(admin, "admin");
  const audience = (
    await f.success(
      f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "workgroups", workgroup_ids: [] }),
    )
  ).audience;
  const agent = await f.success(
    f.http(
      "/v1/data/team-agents",
      { name: "Shared helper", harness: "codex", audience_id: audience.id },
      f.owner.cookie,
      {
        "X-Ngertiin-Organization": f.initial.organization.id,
        "Idempotency-Key": crypto.randomUUID(),
      },
    ),
  );
  const expected = { grants: [{ agent_id: agent.id, audience_id: audience.id }] };
  expect(await f.success(f.http(`${f.path}/agent-access`, undefined, f.owner.cookie))).toEqual(
    expected,
  );
  expect(await f.success(f.http(`${f.path}/agent-access`, undefined, admin.cookie))).toEqual(
    expected,
  );
  expect((await f.http(`${f.path}/agent-access`, undefined, member.cookie)).status).toBe(403);
  expect(
    (
      await f.http(
        `/v1/organizations/${crypto.randomUUID()}/agent-access`,
        undefined,
        f.owner.cookie,
      )
    ).status,
  ).toBe(403);
  await f.success(
    f.write(f.owner.cookie, `${f.path}/members/${adminMembership.membership.id}/role`, {
      role: "member",
    }),
  );
  expect((await f.http(`${f.path}/agent-access`, undefined, admin.cookie)).status).toBe(403);
});
