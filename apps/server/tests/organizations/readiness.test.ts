import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { CONTRACT_VERSION, schemas } from "../../src/contracts";
import { readinessFixture } from "./readiness-helpers";

let f: Awaited<ReturnType<typeof readinessFixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
function evidence(name: string, value: unknown) {
  const directory = process.env.NGERTIIN_NMA079_REPORT_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
}

test("every installed account surface declares authentication/scope and rejects missing credentials before input validation", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const response = await fixture.request(fixture.alice.cookie, "/v1/contracts");
  expect(response.status).toBe(200);
  const contract = await response.json();
  expect(contract.version).toBe(CONTRACT_VERSION);
  expect(CONTRACT_VERSION).toBe("2.0.0");
  expect(contract.access_model.surfaces).toHaveLength(contract.http.length);
  expect(Object.keys(contract.access_model.entities)).toHaveLength(
    Object.keys(contract.entities).length,
  );
  expect(contract.access_model.commands).toHaveLength(Object.keys(contract.commands).length);
  expect(contract.access_model.tools).toHaveLength(contract.product_tools.length);
  expect(contract.scoped_data.readiness_gate).toBe("ready");
  const results = [];
  for (const route of contract.http) {
    expect(route.access.authentication_class).toBeString();
    expect(route.access.scope).toBeString();
    if (["public", "authentication_protocol"].includes(route.access.authentication_class)) continue;
    const path = route.path
      .replace(/:[A-Za-z]+/g, crypto.randomUUID())
      .replaceAll("*", "untrusted");
    const denied = await fixture.api.handle(
      new Request(`${fixture.origin}${path}`, {
        method: route.method,
        headers: { Origin: fixture.origin, "Content-Type": "application/json" },
        body: ["GET", "HEAD"].includes(route.method) ? undefined : "{}",
      }),
    );
    expect([401, 403], `${route.method} ${route.path}`).toContain(denied.status);
    results.push({
      method: route.method,
      path: route.path,
      authentication: route.access.authentication_class,
      unauthenticated_status: denied.status,
    });
  }
  expect((await fixture.request(fixture.alice.cookie, "/health/ready")).status).toBe(403);
  expect((await fixture.request(undefined, "/health/live", undefined, "malformed")).status).toBe(
    200,
  );
  evidence("authentication-matrix", {
    contract: contract.version,
    registered: contract.http.length,
    tested: results.length,
    results,
  });
  evidence("contract", contract);
});

test("normal HTTP admission and both broker executors keep two users of one Team agent private", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  for (const harness of ["codex", "muse"] as const) {
    const alice = await fixture.lane(fixture.alice.cookie, harness);
    const owner = await fixture.lane(fixture.owner.cookie, harness, alice.agent);
    const admitted = [];
    for (const [index, lane] of [alice, owner].entries()) {
      const key = crypto.randomUUID();
      const body = {
        thread_id: lane.thread.id,
        agent_id: lane.agent.id,
        text: `private-${harness}-${index}`,
      };
      const first = await fixture.success(
        fixture.request(lane.cookie, "/v1/runs", body, undefined, key),
      );
      const replay = await fixture.success(
        fixture.request(lane.cookie, "/v1/runs", body, undefined, key),
      );
      expect(replay.run.id).toBe(first.run.id);
      admitted.push({ lane, run: first.run });
    }
    await fixture.background.tick();
    await fixture.background.idle();
    for (const { lane, run } of admitted) {
      const current = await fixture.success(
        fixture.request(lane.cookie, `/v1/entities/run/${run.id}`),
      );
      expect(current.status, JSON.stringify(current.diagnostic)).toBe("succeeded");
      expect(current.product_tools).toContain("ngertiin.read_run_context");
      expect(current.provider_selection.connection_id).toBe(lane.connection.id);
      const other = lane === alice ? owner : alice;
      expect((await fixture.request(other.cookie, `/v1/entities/run/${run.id}`)).status).toBe(404);
      expect(
        (await fixture.request(other.cookie, `/v1/threads/${lane.thread.id}/snapshot`)).status,
      ).toBe(404);
      expect(
        (
          await fixture.request(other.cookie, `/v1/threads/${lane.thread.id}/sessions`, {
            agent_id: lane.agent.id,
          })
        ).status,
      ).toBe(404);
    }
  }
  expect(fixture.calls).toHaveLength(4);
  expect(new Set(fixture.calls.map((call) => call.thread)).size).toBe(4);
  evidence("broker-dispatch", {
    lanes: fixture.calls,
    completed: 4,
    adapters: "protocol_fixtures_not_native_provider_evidence",
  });
});

for (const outcome of ["cancelled", "unknown"] as const)
  test(`revoking membership during native work retains the matching ${outcome} outcome without late publication`, async () => {
    const started = Promise.withResolvers<void>();
    const fixture = await readinessFixture(async (request) => {
      const nativeRun = crypto.randomUUID();
      await request.onEvent({
        type: "accepted",
        native_session_id: request.identity.native_session_id,
        native_run_id: nativeRun,
      });
      started.resolve();
      await new Promise<void>((resolve) => {
        if (request.signal.aborted) resolve();
        else request.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return {
        status: outcome,
        native_session_id: request.identity.native_session_id,
        native_run_id: nativeRun,
      };
    });
    f = fixture;
    const lane = await fixture.lane(fixture.alice.cookie, "codex");
    const body = {
      thread_id: lane.thread.id,
      agent_id: lane.agent.id,
      text: "Private revocable work",
    };
    const key = crypto.randomUUID();
    const admitted = await fixture.success(
      fixture.request(lane.cookie, "/v1/runs", body, undefined, key),
    );
    await fixture.background.tick();
    await Promise.race([
      started.promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Fixture native dispatch did not start.")), 5000),
      ),
    ]);
    await fixture.success(
      fixture.write(
        fixture.owner.cookie,
        `${fixture.path}/members/${fixture.joined.membership.id}/remove`,
      ),
    );
    await fixture.background.tick();
    await fixture.background.idle();
    expect((await fixture.request(lane.cookie, "/v1/runs", body, undefined, key)).status).toBe(403);
    const pool = new Pool({ connectionString: fixture.domain.options.connectionString });
    try {
      const result = await pool.query(
        `SELECT body FROM "${fixture.domain.store.schema}".entities WHERE id=$1`,
        [admitted.run.id],
      );
      expect(result.rows[0].body.cancellation).toBe(
        outcome === "cancelled" ? "confirmed" : "requested",
      );
      expect(result.rows[0].body.status).toBe(outcome);
      expect(result.rows[0].body.retry_allowed).toBe(false);
    } finally {
      await pool.end();
    }
  });

test("authority replacement fences accepted scoped work and preserves the queued lane without resubmitting", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  const first = await fixture.success(
    fixture.request(lane.cookie, "/v1/runs", {
      thread_id: lane.thread.id,
      agent_id: lane.agent.id,
      text: "Accepted before crash",
    }),
  );
  const second = await fixture.success(
    fixture.request(lane.cookie, "/v1/runs", {
      thread_id: lane.thread.id,
      agent_id: lane.agent.id,
      text: "Queued after crash",
    }),
  );
  await fixture.success(
    fixture.request(lane.cookie, `/v1/threads/${lane.thread.id}/sessions`, {
      agent_id: lane.agent.id,
    }),
  );
  await fixture.domain.store.withDataContext(lane.scope, async () => {
    const claimed = await fixture.domain.lifecycle.claimNext(lane.thread.id, lane.agent.id);
    expect(claimed?.id).toBe(first.run.id);
    if (!claimed) throw new Error("The fixture run was not claimed.");
    await fixture.domain.store.put(
      { ...claimed, authority_epoch: crypto.randomUUID(), revision: claimed.revision + 1 },
      claimed.revision,
    );
    await fixture.domain.lifecycle.recoverScopedRuns();
    expect((await fixture.domain.store.get("run", first.run.id)).status).toBe("unknown");
    expect(await fixture.domain.lifecycle.claimNext(lane.thread.id, lane.agent.id)).toBeNull();
    expect((await fixture.domain.store.get("run", second.run.id)).status).toBe("queued");
  });
  expect(fixture.calls).toHaveLength(0);
});

test("generic entity inventory and organization switches never grant another actor's private data", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const outsider = await fixture.account("outsider@example.test");
  const administrator = await fixture.account("admin@example.test");
  await fixture.join(administrator, "admin");
  const workgroups = await Promise.all(
    ["Engineering", "Research"].map((name) =>
      fixture.success(fixture.write(fixture.owner.cookie, `${fixture.path}/workgroups`, { name })),
    ),
  );
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  const results = [];
  await fixture.organizations.grantCreation("owner@example.test", 2);
  const second = await fixture.success(
    fixture.write(fixture.owner.cookie, "/v1/organizations", { name: "Second", slug: "second" }),
  );
  await fixture.join(fixture.alice, "admin", [], `/v1/organizations/${second.organization.id}`);
  for (const kind of Object.keys(schemas)) {
    const own = await fixture.request(lane.cookie, `/v1/entities/${kind}`);
    expect(own.status, kind).toBe(200);
    const otherOrg = await fixture.request(
      fixture.owner.cookie,
      `/v1/entities/${kind}`,
      undefined,
      second.organization.id,
    );
    expect(otherOrg.status, kind).toBe(200);
    expect(await otherOrg.json()).toEqual([]);
    expect((await fixture.request(outsider.cookie, `/v1/entities/${kind}`)).status).toBe(403);
    const administratorList = await fixture.success(
      fixture.request(administrator.cookie, `/v1/entities/${kind}`),
    );
    if (kind === "thread" || kind === "connection") expect(administratorList).toEqual([]);
    results.push({ kind, own_list: 200, other_organization_empty: true, outsider: 403 });
  }
  expect(
    (await fixture.request(fixture.owner.cookie, `/v1/entities/thread/${lane.thread.id}`)).status,
  ).toBe(404);
  evidence("entity-matrix", {
    organizations: 2,
    member_actors: 3,
    outsider_actors: 1,
    workgroups: workgroups.length,
    entity_kinds: results.length,
    results,
  });
});

test("concurrent scoped queries reuse their authorization fence without exhausting the auth pool", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  await fixture.domain.store.withDataContext(lane.scope, () =>
    Promise.all(
      Array.from({ length: 16 }, () =>
        fixture.domain.store.transaction(async () => {
          await fixture.domain.store.assertInvocation(lane.agent.id);
          return fixture.domain.store.get("thread", lane.thread.id);
        }),
      ),
    ),
  );
});

test("opening a fourth private transport cannot evict another actor's active native writer", async () => {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let started = 0;
  const fixture = await readinessFixture(async (request) => {
    const nativeRun = crypto.randomUUID();
    await request.onEvent({
      type: "accepted",
      native_session_id: request.identity.native_session_id,
      native_run_id: nativeRun,
    });
    if (++started === 4) ready.resolve();
    await release.promise;
    return {
      status: "succeeded",
      native_session_id: request.identity.native_session_id,
      native_run_id: nativeRun,
    };
  });
  f = fixture;
  for (const harness of ["codex", "muse"] as const) {
    const alice = await fixture.lane(fixture.alice.cookie, harness);
    const owner = await fixture.lane(fixture.owner.cookie, harness, alice.agent);
    for (const lane of [alice, owner])
      await fixture.success(
        fixture.request(lane.cookie, "/v1/runs", {
          thread_id: lane.thread.id,
          agent_id: lane.agent.id,
          text: "Keep this private writer active.",
        }),
      );
  }
  await fixture.background.tick();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Four fixture writers did not start.")), 15000);
      }),
    ]);
    const idle = await fixture.lane(fixture.alice.cookie, "codex");
    await fixture.domain.store.withDataContext(idle.scope, () =>
      fixture.broker.openSession(idle.thread.id, idle.agent.id),
    );
    expect(fixture.closedActiveConnections).toHaveLength(0);
  } finally {
    clearTimeout(timer);
    release.resolve();
  }
  await fixture.background.idle();
});

test("native credential callbacks retain current resource grants after the opening browser session logs out", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  await fixture.success(
    fixture.request(lane.cookie, `/v1/threads/${lane.thread.id}/sessions`, {
      agent_id: lane.agent.id,
    }),
  );
  const launch = fixture.launches.find((launch) => launch.codexAuth);
  if (!launch?.codexAuth) throw new Error("The private credential callback was not installed.");
  const request = new Request(`${fixture.origin}/v1/auth/session`, {
    headers: { Cookie: lane.cookie },
  });
  const principal = await fixture.auth.authenticate(request);
  await fixture.auth.revoke(request, principal.sessionId);
  expect((await fixture.request(lane.cookie, "/v1/auth/session")).status).toBe(401);
  expect(
    await fixture.domain.store.outsideDataContext(() => launch.codexAuth?.(true)),
  ).toMatchObject({ accessToken: "fixture-access-token" });
});

test("commit subscribers cannot borrow the writing user's request scope", async () => {
  const fixture = await readinessFixture();
  f = fixture;
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  const observed = Promise.withResolvers<boolean>();
  const unsubscribe = fixture.domain.store.subscribe(() =>
    observed.resolve(fixture.domain.store.dataContext !== undefined),
  );
  try {
    await fixture.success(
      fixture.request(lane.cookie, `/v1/data/agents/${lane.agent.id}/preferences`, {
        instructions: "Private preference",
      }),
    );
    expect(await observed.promise).toBe(false);
  } finally {
    unsubscribe();
  }
});

test("a native stop timeout still fences an unknown outcome after membership revocation", async () => {
  const accepted = Promise.withResolvers<void>();
  const fixture = await readinessFixture(
    async (request) => {
      await request.onEvent({
        type: "accepted",
        native_session_id: request.identity.native_session_id,
        native_run_id: crypto.randomUUID(),
      });
      accepted.resolve();
      return new Promise(() => {});
    },
    undefined,
    { request_ms: 1000, close_ms: 1000 },
  );
  f = fixture;
  const lane = await fixture.lane(fixture.alice.cookie, "codex");
  const admission = await fixture.success(
    fixture.request(lane.cookie, "/v1/runs", {
      thread_id: lane.thread.id,
      agent_id: lane.agent.id,
      text: "Stop this private native work when access is removed.",
    }),
  );
  await fixture.background.tick();
  await accepted.promise;
  await fixture.success(
    fixture.write(
      fixture.owner.cookie,
      `${fixture.path}/members/${fixture.joined.membership.id}/remove`,
    ),
  );
  await fixture.background.tick();
  await fixture.background.idle();
  const result = await fixture.domain.administrativeQuery("SELECT body FROM entities WHERE id=$1", [
    admission.run.id,
  ]);
  expect(result.rows[0].body).toMatchObject({
    status: "unknown",
    cancellation: "requested",
    retry_allowed: false,
  });
});
