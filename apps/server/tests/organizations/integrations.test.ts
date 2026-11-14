import { afterEach, expect, test } from "bun:test";
import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import type { AppHost, AppSessionConfig } from "../../src/integrations/host";
import { Applications } from "../../src/integrations/service";
import { ApplicationSkills, packageHash } from "../../src/learning/application-skills";
import { ScopedData } from "../../src/organizations/data";
import { organizationFixture } from "./helpers";

class Host implements AppHost {
  accountsByUser = new Map<string, { id: string; toolkit: string; active: boolean }[]>();
  sessions: { user: string; config: AppSessionConfig }[] = [];
  calls = 0;
  beforeConnect?: () => Promise<void>;
  beforeAccounts?: () => Promise<void>;
  beforeDispatch?: () => Promise<void>;
  afterDispatch?: () => Promise<void>;
  result: "succeeded" | "unknown" = "succeeded";
  async catalog() {
    return { items: [] };
  }
  async connect(user: string, toolkit: string) {
    await this.beforeConnect?.();
    const account = { id: `ca-${crypto.randomUUID()}`, toolkit, active: true };
    this.accountsByUser.set(user, [...(this.accountsByUser.get(user) ?? []), account]);
    return { account_id: account.id, connect_url: "https://connect.composio.dev/fixture" };
  }
  async accounts(user: string) {
    await this.beforeAccounts?.();
    return this.accountsByUser.get(user) ?? [];
  }
  async session(user: string, config: AppSessionConfig) {
    this.sessions.push({ user, config });
    return `session-${this.sessions.length}`;
  }
  async search() {
    return [
      { slug: "GITHUB_READ_PROFILE", toolkit: "github", input_schema: { type: "object" } },
      { slug: "GITHUB_DELETE_REPOSITORY", toolkit: "github" },
    ];
  }
  async execute(
    _session: string,
    _account: string,
    _tool: string,
    _args: Record<string, unknown>,
    authorize: () => void | Promise<void>,
  ) {
    await this.beforeDispatch?.();
    await authorize();
    this.calls++;
    await this.afterDispatch?.();
    return {
      state: this.result,
      data: { name: "Safe fixture" },
      log_id: this.result === "succeeded" ? "log-fixture" : null,
    };
  }
}
let f: Awaited<ReturnType<typeof organizationFixture>>;
let api: Awaited<ReturnType<typeof createApi>>;
afterEach(async () => {
  await api?.stop(true);
  await f?.close();
});
async function setup() {
  f = await organizationFixture();
  await f.success(
    f.write(f.owner.cookie, "/v1/data/legacy-binding", {
      organization_id: f.initial.organization.id,
      legacy_owner_id: f.domain.owner,
    }),
  );
  const alice = await f.account("alice@example.test");
  const member = await f.join(alice);
  const audience = (
    await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
  ).audience;
  const host = new Host();
  const tools = await ProductTools.open(f.domain.lifecycle, undefined, undefined, host);
  api = await createApi(f.domain.lifecycle, new Background(f.domain.lifecycle), "p".repeat(64), {
    authentication: f.auth,
    connections: new Connections(f.domain.lifecycle),
    tools,
  });
  const agent = await f.success(
    request(f.owner.cookie, "/v1/data/team-agents", {
      name: "App team",
      harness: "codex",
      audience_id: audience.id,
    }),
  );
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const context = async (cookie = alice.cookie) => {
    const req = new Request(`${f.origin}/v1/entities/agent`, {
      headers: { Cookie: cookie, "X-Ngertiin-Organization": f.initial.organization.id },
    });
    await f.auth.authenticate(req);
    return new ScopedData(f.domain.lifecycle, f.auth).context(req);
  };
  const apps = tools.applications;
  const lane = { agent_id: agent.id, thread_id: dm.id };
  const as = async <T>(cookie: string, action: () => Promise<T>) =>
    f.domain.store.withDataContext(await context(cookie), action);
  const shared = async (resources: Record<string, (string | number | boolean)[]> = {}) => {
    let connection = (
      await f.success(
        request(f.owner.cookie, "/v1/apps/connect", {
          toolkit: "github",
          ownership: "organization",
          audience_id: audience.id,
        }),
      )
    ).connection;
    connection = await f.success(
      request(f.owner.cookie, `/v1/apps/connections/${connection.id}/refresh`, {}),
    );
    return f.success(
      request(f.owner.cookie, `/v1/apps/connections/${connection.id}/assign`, {
        expected_revision: connection.revision,
        grants: [
          { agent_id: agent.id, thread_id: null, tools: ["GITHUB_READ_PROFILE"], resources },
        ],
      }),
    );
  };
  const execution = async (connectionId: string, args: Record<string, unknown> = {}) => {
    const admitted = await f.success(
      request(alice.cookie, "/v1/runs", { ...lane, text: "Read the selected application." }),
    );
    const scope = await context();
    const input = {
      command_id: crypto.randomUUID(),
      connection_id: connectionId,
      tool: "GITHUB_READ_PROFILE",
      arguments: args,
    };
    const access = {
      scope: { ...lane, run_id: admitted.run.id },
      authorize: () => scope.validate(true),
    };
    // A controlled accepted-run seam; native adapter execution is verified separately.
    return {
      input,
      scope,
      call: () =>
        f.domain.store.withDataContext(scope, () =>
          apps.execute(input, access as Parameters<typeof apps.execute>[1]),
        ),
    };
  };
  return {
    alice,
    member,
    audience,
    host,
    apps,
    tools,
    agent,
    dm,
    lane,
    context,
    as,
    shared,
    execution,
  };
}
function request(
  cookie: string,
  path: string,
  body?: unknown,
  organizationId = f.initial.organization.id,
) {
  return api.handle(
    new Request(`${f.origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: f.origin,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "X-Ngertiin-Organization": organizationId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

test("organization accounts require management; personal identity and account routing stay private", async () => {
  const s = await setup();
  expect(
    (
      await request(s.alice.cookie, "/v1/apps/connect", {
        toolkit: "github",
        ownership: "organization",
        audience_id: s.audience.id,
      })
    ).status,
  ).toBe(403);
  const shared = await s.shared();
  const personal = (
    await f.success(request(s.alice.cookie, "/v1/apps/connect", { toolkit: "github" }))
  ).connection;
  expect(shared.actor_id).toBeNull();
  expect(personal.actor_id).toBe(s.alice.userId);
  expect(personal.integration_identity).not.toBe(shared.integration_identity);
  expect((await request(f.owner.cookie, `/v1/entities/app_connection/${personal.id}`)).status).toBe(
    404,
  );
  expect(
    (await request(s.alice.cookie, `/v1/apps/connections/${shared.id}/reconnect`, {})).status,
  ).toBe(403);
  await f.organizations.grantCreation("owner@example.test", 2);
  const second = await f.success(
    f.write(f.owner.cookie, "/v1/organizations", { name: "Second", slug: "second-org" }),
  );
  expect(
    (
      await request(
        f.owner.cookie,
        `/v1/entities/app_connection/${shared.id}`,
        undefined,
        second.organization.id,
      )
    ).status,
  ).toBe(404);
  const tools = await s.as(s.alice.cookie, () =>
    s.apps.search({ connection_id: shared.id, query: "profile" }, s.lane),
  );
  expect(tools).toHaveLength(1);
  expect(s.host.sessions.at(-1)?.user).toBe(shared.integration_identity);
  expect(s.host.sessions.at(-1)?.config.account_id).toBe(shared.account_id);
});

test("shared app execution enforces resource arguments and persists actor-attributed receipts", async () => {
  const s = await setup();
  const shared = await s.shared({ "repository.owner": ["approved-team"] });
  await expect(
    (await s.execution(shared.id, { repository: { owner: "other" } })).call(),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  const e = await s.execution(shared.id, { repository: { owner: "approved-team" } });
  const result = await e.call();
  expect(result.receipt).toMatchObject({
    actor_id: s.alice.userId,
    organization_id: f.initial.organization.id,
    state: "succeeded",
    account_id: shared.account_id,
  });
  expect(await e.call()).toEqual(result);
  expect(s.host.calls).toBe(1);
  expect(
    (await request(f.owner.cookie, `/v1/entities/app_effect/${e.input.command_id}`)).status,
  ).toBe(404);
});

test("OAuth completion cannot publish after the initiating member is removed", async () => {
  const s = await setup();
  s.host.beforeConnect = async () => {
    await f.success(f.write(f.owner.cookie, `${f.path}/members/${s.member.membership.id}/remove`));
  };
  expect((await request(s.alice.cookie, "/v1/apps/connect", { toolkit: "github" })).status).toBe(
    403,
  );
  expect(
    (
      await f.domain.administrativeQuery(
        "SELECT id FROM entities WHERE kind='app_connection' AND actor_id=$1",
        [s.alice.userId],
      )
    ).rowCount,
  ).toBe(0);
});

test("revocation after async native preflight blocks dispatch; stale sessions cannot expose disabled schemas", async () => {
  const s = await setup();
  const shared = await s.shared();
  await s.as(s.alice.cookie, () =>
    s.apps.search({ connection_id: shared.id, query: "profile" }, s.lane),
  );
  const e = await s.execution(shared.id);
  s.host.beforeDispatch = async () => {
    await f.success(
      request(f.owner.cookie, `/v1/apps/connections/${shared.id}/assign`, {
        expected_revision: shared.revision,
        grants: [],
      }),
    );
  };
  await expect(e.call()).rejects.toMatchObject({ code: "STALE_DISPATCH" });
  expect(s.host.calls).toBe(0);
  await expect(
    s.as(s.alice.cookie, () =>
      s.apps.search({ connection_id: shared.id, query: "profile" }, s.lane),
    ),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
});

test("membership revocation suppresses the result while retaining a known completed external effect", async () => {
  const s = await setup();
  const shared = await s.shared();
  const e = await s.execution(shared.id);
  s.host.afterDispatch = async () => {
    await f.success(f.write(f.owner.cookie, `${f.path}/members/${s.member.membership.id}/remove`));
  };
  await expect(e.call()).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  const receipt = (
    await f.domain.administrativeQuery(
      "SELECT body FROM entities WHERE kind='app_effect' AND id=$1",
      [e.input.command_id],
    )
  ).rows[0].body;
  expect(receipt.state).toBe("succeeded");
  expect(receipt.actor_id).toBe(s.alice.userId);
  expect((await request(s.alice.cookie, `/v1/entities/app_effect/${receipt.id}`)).status).toBe(403);
});

test("unknown effects hold a shared account across different members and command identities", async () => {
  const s = await setup();
  const shared = await s.shared();
  s.host.result = "unknown";
  expect((await (await s.execution(shared.id)).call()).receipt.state).toBe("unknown");
  await expect((await s.execution(shared.id)).call()).rejects.toMatchObject({
    code: "RECONCILIATION_REQUIRED",
  });
  const dm = await f.success(request(f.owner.cookie, `/v1/agents/${s.agent.id}/dm`, {}));
  const admitted = await f.success(
    request(f.owner.cookie, "/v1/runs", {
      thread_id: dm.id,
      agent_id: s.agent.id,
      text: "A second actor must not bypass the account hold.",
    }),
  );
  const owner = await s.context(f.owner.cookie);
  await expect(
    f.domain.store.withDataContext(owner, () =>
      s.apps.execute(
        {
          command_id: crypto.randomUUID(),
          connection_id: shared.id,
          tool: "GITHUB_READ_PROFILE",
          arguments: {},
        },
        {
          scope: { agent_id: s.agent.id, thread_id: dm.id, run_id: admitted.run.id },
          authorize: () => owner.validate(true),
        } as Parameters<typeof s.apps.execute>[1],
      ),
    ),
  ).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
  const hold = await f.domain.administrativeQuery(
    "SELECT effect_id FROM app_account_holds WHERE account_id=$1",
    [shared.account_id],
  );
  expect(hold.rowCount).toBe(1);
  expect(s.host.calls).toBe(1);
  await f.domain.administrativeQuery(
    "UPDATE entities SET body=jsonb_set(body,'{state}','\"dispatched\"') WHERE kind='app_effect' AND id=$1",
    [hold.rows[0].effect_id],
  );
  await Applications.open(f.domain.lifecycle, s.host);
  expect(
    (
      await f.domain.administrativeQuery(
        "SELECT body->>'state' AS state FROM entities WHERE kind='app_effect' AND id=$1",
        [hold.rows[0].effect_id],
      )
    ).rows[0].state,
  ).toBe("unknown");
  expect(
    (
      await f.domain.administrativeQuery(
        "SELECT effect_id FROM app_account_holds WHERE account_id=$1",
        [shared.account_id],
      )
    ).rowCount,
  ).toBe(1);
});

test("pending OAuth stays bound to its initiator even after an unsuccessful refresh", async () => {
  const s = await setup();
  const admin = await f.account("admin@example.test");
  await f.join(admin, "admin");
  const connection = (
    await f.success(
      request(f.owner.cookie, "/v1/apps/connect", {
        toolkit: "github",
        ownership: "organization",
        audience_id: s.audience.id,
      }),
    )
  ).connection;
  s.host.accountsByUser.set(connection.integration_identity, []);
  expect(
    (await f.success(request(f.owner.cookie, `/v1/apps/connections/${connection.id}/refresh`, {})))
      .state,
  ).toBe("auth_required");
  s.host.accountsByUser.set(connection.integration_identity, [
    { id: connection.account_id, toolkit: "github", active: true },
  ]);
  expect(
    (await request(admin.cookie, `/v1/apps/connections/${connection.id}/refresh`, {})).status,
  ).toBe(403);
  expect(
    (await f.success(request(f.owner.cookie, `/v1/apps/connections/${connection.id}/refresh`, {})))
      .state,
  ).toBe("active");
});

test("Workgroup removal invalidates retained app sessions and new requests cannot see the account", async () => {
  const s = await setup();
  const group = (
    await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name: "App users" }))
  ).workgroup;
  await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups/${group.id}/members`, {
      membership_id: s.member.membership.id,
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
  let connection = (
    await f.success(
      request(f.owner.cookie, "/v1/apps/connect", {
        toolkit: "github",
        ownership: "organization",
        audience_id: audience.id,
      }),
    )
  ).connection;
  connection = await f.success(
    request(f.owner.cookie, `/v1/apps/connections/${connection.id}/refresh`, {}),
  );
  connection = await f.success(
    request(f.owner.cookie, `/v1/apps/connections/${connection.id}/assign`, {
      expected_revision: connection.revision,
      grants: [{ agent_id: s.agent.id, tools: ["GITHUB_READ_PROFILE"] }],
    }),
  );
  const old = await s.context();
  await f.domain.store.withDataContext(old, () =>
    s.apps.search({ connection_id: connection.id, query: "profile" }, s.lane),
  );
  await f.success(
    f.write(f.owner.cookie, `${f.path}/workgroups/${group.id}/members`, {
      membership_id: s.member.membership.id,
      present: false,
    }),
  );
  await expect(
    f.domain.store.withDataContext(old, () =>
      s.apps.search({ connection_id: connection.id, query: "profile" }, s.lane),
    ),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  expect(
    (await request(s.alice.cookie, `/v1/entities/app_connection/${connection.id}`)).status,
  ).toBe(404);
});

test("refresh refuses another connected account and never falls back to an active account of the same toolkit", async () => {
  const s = await setup();
  const connection = await s.shared();
  s.host.accountsByUser.set(connection.integration_identity, [
    { id: "ca-other", toolkit: "github", active: true },
  ]);
  const refreshed = await f.success(
    request(f.owner.cookie, `/v1/apps/connections/${connection.id}/refresh`, {}),
  );
  expect(refreshed.state).toBe("auth_required");
  expect(refreshed.account_id).toBe(connection.account_id);
  await expect((await s.execution(connection.id)).call()).rejects.toMatchObject({
    code: "APP_AUTH_REQUIRED",
  });
  expect(s.host.calls).toBe(0);
});

test("selected provider bindings isolate inherited packages and do not change app account routing", async () => {
  const s = await setup();
  const shared = await s.shared();
  const skills = new ApplicationSkills(f.domain.lifecycle);
  const create = async (label: string) => {
    let provider = await f.success(
      request(s.alice.cookie, "/v1/connections", {
        harness: "codex",
        authentication: { method: "native_login", billing_source: "subscription" },
      }),
    );
    provider = await s.as(s.alice.cookie, () =>
      new Connections(f.domain.lifecycle).update(provider, {
        login: "authenticated",
        account_id: `account-${label}`,
        effective_billing_source: "subscription",
        models: [{ id: "model-a", reasoning: [] }],
      }),
    );
    await f.success(
      request(s.alice.cookie, "/v1/ai/selections", {
        scope: "user",
        harness: "codex",
        selection: { connection_id: provider.id, model_id: "model-a" },
      }),
    );
    return s.as(s.alice.cookie, async () => {
      const old = (await f.domain.store.list("binding", { thread_id: s.dm.id })).find(
        (item) => item.active,
      );
      if (old)
        await f.domain.store.put(
          { ...old, active: false, revision: old.revision + 1 },
          old.revision,
        );
      const binding = await f.domain.lifecycle.bind(s.dm.id, s.agent.id, `native-${label}`);
      const value = {
        description: `Private ${label}`,
        instructions: `private-${label}-bytes`,
        assets: [],
      };
      const key = `harness:private:${label}`;
      await f.domain.store.put({
        ...skills.base(),
        kind: "harness_inventory",
        ...s.lane,
        connection_id: provider.id,
        binding_id: binding.id,
        harness: "codex",
        state: "supported",
        skills: [
          {
            key,
            name: `private-${label}`,
            location: `codex/private-${label}`,
            package: value,
            sha256: packageHash(value),
          },
        ],
        native_catalog: [
          {
            key: `native:${label}`,
            name: `private-${label}`,
            description: "Private native catalog",
            native_source: "USER",
            enabled: true,
          },
        ],
        native_state: "supported",
        rejected_packages: 0,
      });
      return { binding, key };
    });
  };
  const first = await create("first");
  expect(
    (await s.as(s.alice.cookie, () => skills.readHarness(s.lane, first.key))).package.instructions,
  ).toBe("private-first-bytes");
  await create("second");
  await expect(
    s.as(s.alice.cookie, () => skills.readHarness(s.lane, first.key)),
  ).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  const inventory = await s.as(s.alice.cookie, () => skills.inventory(s.lane));
  expect(inventory.harness.map((item) => item.name)).toEqual(["private-second"]);
  await s.as(s.alice.cookie, () =>
    s.apps.search({ connection_id: shared.id, query: "profile" }, s.lane),
  );
  expect(s.host.sessions.at(-1)?.config.account_id).toBe(shared.account_id);
  expect(s.host.sessions.at(-1)?.user).toBe(shared.integration_identity);
});

test("Team skill publication is management-only, immutable and pinned; private overlays cannot replace it", async () => {
  const s = await setup();
  const path = `/v1/data/team-agents/${s.agent.id}/skills/publish`;
  const body = {
    name: "team-report",
    expected_revision: 0,
    package: {
      description: "Team report",
      instructions: "Read only granted resources.",
      assets: [],
    },
  };
  expect((await request(s.alice.cookie, path, body)).status).toBe(403);
  const published = await f.success(request(f.owner.cookie, path, body));
  expect(published.skill.actor_id).toBeNull();
  expect(published.skill.thread_id).toBeNull();
  await expect(
    f.domain.administrativeQuery(
      "UPDATE entities SET body=jsonb_set(body,'{sha256}',to_jsonb(repeat('0',64))) WHERE kind='skill_revision' AND id=$1",
      [published.revision.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const skills = new ApplicationSkills(f.domain.lifecycle);
  const first = await s.as(s.alice.cookie, () =>
    skills.read(s.lane, { skill_id: published.skill.id, version: 1 }),
  );
  expect(first.revision.sha256).toBe(published.revision.sha256);
  expect(
    (
      await request(s.alice.cookie, "/v1/learning/skills/revise", {
        context: s.lane,
        skill_id: published.skill.id,
        expected_revision: 1,
        package: body.package,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(s.alice.cookie, "/v1/learning/skills/assign", {
        context: s.lane,
        skill_id: published.skill.id,
        version: 1,
        expected_revision: 1,
        enabled: false,
      })
    ).status,
  ).toBe(403);
  const privateSkill = await f.success(
    request(s.alice.cookie, "/v1/learning/skills/create", {
      context: s.lane,
      ...body,
      expected_revision: undefined,
      visibility: "shared",
    }),
  );
  expect(privateSkill.skill.actor_id).toBe(s.alice.userId);
  expect(
    (await request(f.owner.cookie, `/v1/entities/skill/${privateSkill.skill.id}`)).status,
  ).toBe(404);
  const revised = await f.success(
    request(f.owner.cookie, path, {
      ...body,
      skill_id: published.skill.id,
      expected_revision: 1,
      package: { ...body.package, instructions: "Second pinned revision." },
    }),
  );
  expect(revised.assignment.version).toBe(2);
  expect(
    (
      await s.as(s.alice.cookie, () =>
        skills.read(s.lane, { skill_id: published.skill.id, version: 1 }),
      )
    ).revision.sha256,
  ).toBe(first.revision.sha256);
  const ownerDm = await f.success(request(f.owner.cookie, `/v1/agents/${s.agent.id}/dm`, {}));
  for (const [cookie, lane] of [
    [s.alice.cookie, s.lane],
    [f.owner.cookie, { agent_id: s.agent.id, thread_id: ownerDm.id }],
  ] as const) {
    const inventory = await s.as(cookie, () => skills.inventory(lane));
    expect(
      inventory.application.find((item) => item.id === published.skill.id)?.assignment?.version,
    ).toBe(2);
  }
});
