import { expect, test } from "bun:test";
import { workspaceAccess } from "../../src/organizations/workspace-access";
import { organizationFixture } from "./helpers";

test("workspace choices distinguish management visibility from current invocation grants", async () => {
  const f = await organizationFixture();
  const read = (cookie?: string, organization = f.initial.organization.id) =>
    f.http("/v1/data/access", undefined, cookie, { "X-Ngertiin-Organization": organization });
  const write = (cookie: string, path: string, body: unknown) =>
    f.http(path, body, cookie, {
      "X-Ngertiin-Organization": f.initial.organization.id,
      "Idempotency-Key": crypto.randomUUID(),
    });
  try {
    await f.success(
      f.write(f.owner.cookie, "/v1/data/legacy-binding", {
        organization_id: f.initial.organization.id,
        legacy_owner_id: f.domain.owner,
      }),
    );
    const alice = await f.account("alice@example.test");
    const member = await f.join(alice);
    const outsider = await f.account("outsider@example.test");
    const group = (
      await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "Engineering" }))
    ).workgroup;
    await f.success(
      f.write(f.owner.cookie, `${f.path}/workgroups/${group.id}/members`, {
        membership_id: member.membership.id,
        present: true,
      }),
    );
    const audience = (
      await f.success(
        f.write(f.owner.cookie, `${f.path}/audiences`, {
          mode: "workgroups",
          workgroup_ids: [group.id],
        }),
      )
    ).audience;
    const agent = await f.success(
      write(f.owner.cookie, "/v1/data/team-agents", {
        name: "Engineering helper",
        harness: "codex",
        audience_id: audience.id,
      }),
    );
    const connection = await f.success(
      write(f.owner.cookie, "/v1/connections", {
        harness: "codex",
        ownership: "organization",
        audience_id: audience.id,
        authentication: { method: "native_login", billing_source: "subscription" },
      }),
    );
    const owner = await f.success(read(f.owner.cookie));
    expect(workspaceAccess.parse(owner)).toEqual({
      invocable_team_agent_ids: [],
      allowed_organization_connection_ids: [],
    });
    const managed = await f.success(
      f.http("/v1/entities/agent", undefined, f.owner.cookie, {
        "X-Ngertiin-Organization": f.initial.organization.id,
      }),
    );
    expect(managed.some((item: { id: string }) => item.id === agent.id)).toBe(true);
    const response = await read(alice.cookie);
    expect(response.headers.get("X-Ngertiin-Event-Context")).toBeTruthy();
    expect(workspaceAccess.parse(await response.json())).toEqual({
      invocable_team_agent_ids: [agent.id],
      allowed_organization_connection_ids: [connection.id],
    });
    expect((await read()).status).toBe(401);
    expect((await read(outsider.cookie)).status).toBe(403);
    expect((await read(alice.cookie, crypto.randomUUID())).status).toBe(403);
    expect((await f.http("/v1/data/access", undefined, alice.cookie)).status).toBe(403);
    const contract = await f.success(f.http("/v1/contracts", undefined, f.owner.cookie));
    expect(contract.version).toBe("2.1.0");
    const route = contract.http.find(
      (item: { method: string; path: string }) =>
        item.method === "GET" && item.path === "/v1/data/access",
    );
    expect(route.access.authentication_class).toBe("user");
    expect(route.response).toBeDefined();
    if (process.env.NGERTIIN_NMA080_EXPORT)
      await Bun.write(process.env.NGERTIIN_NMA080_EXPORT, `${JSON.stringify(contract, null, 2)}\n`);
    await f.success(f.write(f.owner.cookie, `${f.path}/members/${member.membership.id}/remove`));
    expect((await read(alice.cookie)).status).toBe(403);
  } finally {
    await f.close();
  }
});
