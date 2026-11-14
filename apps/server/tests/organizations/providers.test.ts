import { afterEach, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts } from "../../src/harness/context";
import { CredentialStorage } from "../../src/harness/credential-storage";
import { ProductTools } from "../../src/harness/tools";
import { ScopedData } from "../../src/organizations/data";
import { organizationFixture } from "./helpers";

let f: Awaited<ReturnType<typeof organizationFixture>>;
afterEach(async () => {
  if (f) await f.close();
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
  await f.join(alice);
  const audience = (
    await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
  ).audience;
  const agent = await f.success(
    request(f.owner.cookie, "/v1/data/team-agents", {
      name: "Shared helper",
      harness: "codex",
      audience_id: audience.id,
    }),
  );
  return { alice, audience, agent };
}
function request(cookie: string, path: string, body?: unknown) {
  return f.http(path, body, cookie, {
    "X-Ngertiin-Organization": f.initial.organization.id,
    "Idempotency-Key": crypto.randomUUID(),
  });
}
async function context(cookie: string) {
  const request = new Request(`${f.origin}/v1/entities/agent`, {
    headers: {
      Cookie: cookie,
      "X-Ngertiin-Organization": f.initial.organization.id,
    },
  });
  await f.auth.authenticate(request);
  return new ScopedData(f.domain.lifecycle, f.auth).context(request);
}
async function connection(cookie: string, extra: Record<string, unknown> = {}) {
  return f.success(
    request(cookie, "/v1/connections", {
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
      ...extra,
    }),
  );
}
async function selection(
  cookie: string,
  connectionId: string | null,
  extra: Record<string, unknown> = {},
) {
  return f.success(
    request(cookie, "/v1/ai/selections", {
      scope: "user",
      harness: "codex",
      selection: connectionId ? { connection_id: connectionId, model_id: "model-a" } : null,
      ...extra,
    }),
  );
}

test("personal provider connections remain private; organization connections require management and an explicit audience", async () => {
  const { alice, audience } = await setup();
  const personal = await connection(alice.cookie);
  expect((await request(f.owner.cookie, `/v1/entities/connection/${personal.id}`)).status).toBe(
    404,
  );
  expect(
    (
      await request(alice.cookie, "/v1/connections", {
        harness: "codex",
        authentication: { method: "native_login", billing_source: "subscription" },
        ownership: "organization",
        audience_id: audience.id,
      })
    ).status,
  ).toBe(403);
  const shared = await connection(f.owner.cookie, {
    ownership: "organization",
    audience_id: audience.id,
  });
  expect(shared.actor_id).toBeNull();
  expect((await request(alice.cookie, `/v1/entities/connection/${shared.id}`)).status).toBe(200);
  expect((await request(alice.cookie, `/v1/connections/${shared.id}/revoke`, {})).status).toBe(403);
  expect(
    (
      await request(alice.cookie, "/v1/connections", {
        harness: "codex",
        authentication: {
          method: "api_key",
          billing_source: "api_key",
          credential_ref: crypto.randomUUID(),
        },
      })
    ).status,
  ).toBe(403);
});

test("private conversation and user choices inherit only when unset and freeze connection/model on admission", async () => {
  const { alice, audience, agent } = await setup();
  const shared = await connection(f.owner.cookie, {
    ownership: "organization",
    audience_id: audience.id,
  });
  const personal = await connection(alice.cookie);
  await selection(f.owner.cookie, shared.id, { scope: "organization" });
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const scope = await context(alice.cookie);
  const connections = new Connections(f.domain.lifecycle);
  const resolve = () =>
    f.domain.store.withDataContext(scope, () => connections.resolveSelection(agent, dm.id));
  expect((await resolve())?.connection_id).toBe(shared.id);
  await selection(alice.cookie, personal.id);
  expect((await resolve())?.connection_id).toBe(personal.id);
  await selection(alice.cookie, shared.id, {
    scope: "conversation",
    thread_id: dm.id,
    agent_id: agent.id,
  });
  const admitted = await f.success(
    request(alice.cookie, "/v1/runs", {
      thread_id: dm.id,
      agent_id: agent.id,
      text: "Use this account.",
    }),
  );
  expect(admitted.run.provider_selection.connection_id).toBe(shared.id);
  await selection(alice.cookie, personal.id, {
    scope: "conversation",
    thread_id: dm.id,
    agent_id: agent.id,
  });
  expect(
    (await f.success(request(alice.cookie, `/v1/entities/run/${admitted.run.id}`)))
      .provider_selection.connection_id,
  ).toBe(shared.id);
  expect(
    (await f.success(request(alice.cookie, `/v1/entities/agent/${agent.id}`))).connection_id,
  ).toBeNull();
  await f.success(request(alice.cookie, `/v1/connections/${personal.id}/revoke`, {}));
  await expect(resolve()).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  await selection(alice.cookie, null, {
    scope: "conversation",
    thread_id: dm.id,
    agent_id: agent.id,
  });
  await expect(resolve()).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  await selection(alice.cookie, null);
  expect((await resolve())?.connection_id).toBe(shared.id);
});

test("provider snapshots cannot be rewritten or forged across actors even through SQL-backed entity writes", async () => {
  const { alice, agent } = await setup();
  const personal = await connection(alice.cookie);
  await selection(alice.cookie, personal.id);
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const admitted = await f.success(
    request(alice.cookie, "/v1/runs", { thread_id: dm.id, agent_id: agent.id, text: "Pinned." }),
  );
  const scope = await context(alice.cookie);
  await expect(
    f.domain.store.withDataContext(scope, () =>
      f.domain.store.put(
        {
          ...admitted.run,
          revision: 2,
          provider_selection: { ...admitted.run.provider_selection, model_id: "other" },
        },
        1,
      ),
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const foreign = await connection(f.owner.cookie);
  await expect(
    f.domain.store.withDataContext(scope, () =>
      f.domain.store.put({
        ...admitted.run,
        id: crypto.randomUUID(),
        provider_selection: { ...admitted.run.provider_selection, connection_id: foreign.id },
      }),
    ),
  ).rejects.toMatchObject({ code: "23503" });
});

test("pre-provider scoped queued records can normalize a missing null snapshot without accepting a different selection", async () => {
  const { alice, agent } = await setup();
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const admitted = await f.success(
    request(alice.cookie, "/v1/runs", {
      thread_id: dm.id,
      agent_id: agent.id,
      text: "Await provider setup.",
    }),
  );
  // Reproduce a pre-NMA-077 payload at a test-only administrative boundary.
  await f.domain.administrativeQuery(
    "ALTER TABLE entities DISABLE TRIGGER provider_snapshot_guard",
  );
  try {
    await f.domain.administrativeQuery(
      "UPDATE entities SET body=body-'provider_selection' WHERE kind='run' AND id=$1",
      [admitted.run.id],
    );
  } finally {
    await f.domain.administrativeQuery(
      "ALTER TABLE entities ENABLE TRIGGER provider_snapshot_guard",
    );
  }
  const scope = await context(alice.cookie);
  await f.domain.store.withDataContext(scope, async () => {
    const run = await f.domain.store.get("run", admitted.run.id);
    expect(run.provider_selection).toBeNull();
    const stopped = await f.domain.store.put(
      {
        ...run,
        status: "cancelled",
        outcome: "cancelled",
        cancellation: "confirmed",
        revision: run.revision + 1,
      },
      run.revision,
    );
    expect(stopped.status).toBe("cancelled");
  });
});

test("same organization account has distinct native homes for each actor, conversation and connection generation", async () => {
  const { alice, audience, agent } = await setup();
  const shared = await connection(f.owner.cookie, {
    ownership: "organization",
    audience_id: audience.id,
  });
  const credentials = new CredentialContexts(f.domain.dir, () => "fixture-private-key");
  const keyConnection = {
    ...shared,
    authentication: {
      method: "api_key" as const,
      billing_source: "api_key" as const,
      credential_ref: crypto.randomUUID(),
    },
  };
  const binding = {
    organization_id: f.initial.organization.id,
    actor_id: alice.userId,
    agent_id: agent.id,
    thread_id: crypto.randomUUID(),
    generation: 1,
  };
  const first = credentials.create(keyConnection, binding);
  const second = credentials.create(keyConnection, { ...binding, actor_id: crypto.randomUUID() });
  const rotated = credentials.create(keyConnection, { ...binding, generation: 2 });
  expect(new Set([first.env.CODEX_HOME, second.env.CODEX_HOME, rotated.env.CODEX_HOME]).size).toBe(
    3,
  );
  expect(first.env.OPENAI_API_KEY).toBe("fixture-private-key");
  expect(first.env.NGERTIIN_DATABASE_URL).toBeUndefined();
  expect(first.redactor.text("fixture-private-key")).toBe("[REDACTED]");
});

test("scheduled responsibilities retain their selected connection after private preferences change", async () => {
  const { alice, agent } = await setup();
  const original = await connection(alice.cookie);
  const other = await connection(alice.cookie);
  await selection(alice.cookie, original.id);
  const dm = await f.success(request(alice.cookie, `/v1/agents/${agent.id}/dm`, {}));
  const scope = await context(alice.cookie);
  const routine = await f.domain.store.withDataContext(scope, () =>
    f.domain.lifecycle.create("routine", {
      thread_id: dm.id,
      agent_id: agent.id,
      instruction: "Check later.",
      timezone: "UTC",
      schedule: { type: "once", at: "2026-01-01T00:00:00.000Z" },
    }),
  );
  await selection(alice.cookie, other.id);
  const occurrence = await f.domain.store.withDataContext(scope, () =>
    f.domain.lifecycle.fireRoutine(routine.id, new Date()),
  );
  expect(occurrence?.run_id).toBeTruthy();
  const run = await f.domain.store.withDataContext(scope, () =>
    f.domain.store.get("run", occurrence?.run_id ?? null),
  );
  expect(run.provider_selection?.connection_id).toBe(original.id);
  expect(run.actor_id).toBe(alice.userId);
});

test("scoped API key submission and rotation retain encrypted bytes and secret-free receipts without selecting a replacement implicitly", async () => {
  const { alice } = await setup();
  const keyFile = join(f.domain.dir, "operator-key");
  writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const storage = new CredentialStorage(f.domain.dir, keyFile);
  const api = await createApi(
    f.domain.lifecycle,
    new Background(f.domain.lifecycle),
    "v".repeat(64),
    {
      authentication: f.auth,
      connections: new Connections(f.domain.lifecycle),
      tools: await ProductTools.open(f.domain.lifecycle),
      credentialStorage: storage,
    },
  );
  const invoke = (path: string, body: unknown, key = crypto.randomUUID()) =>
    api.handle(
      new Request(`${f.origin}${path}`, {
        method: "POST",
        headers: {
          Cookie: alice.cookie,
          Origin: f.origin,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          "X-Ngertiin-Organization": f.initial.organization.id,
        },
        body: JSON.stringify(body),
      }),
    );
  const originalResponse = await invoke("/v1/connections/api-key", {
    harness: "muse",
    api_key: "fixture-first-secret",
  });
  expect(originalResponse.status).toBe(200);
  const original = await originalResponse.json();
  expect(
    readFileSync(join(f.domain.dir, "credentials", original.authentication.credential_ref), "utf8"),
  ).not.toContain("fixture-first-secret");
  const operation = crypto.randomUUID();
  const rotatedResponse = await invoke(
    `/v1/connections/${original.id}/rotate-key`,
    { api_key: "fixture-replacement-secret" },
    operation,
  );
  expect(rotatedResponse.status).toBe(200);
  const rotated = await rotatedResponse.json();
  expect(rotated.retired.state).toBe("revoked");
  expect(rotated.replacement.id).not.toBe(original.id);
  expect(rotated.selection_action).toBe("explicitly_select_replacement");
  expect(storage.read(rotated.replacement.authentication.credential_ref, true)).toBe(
    "fixture-replacement-secret",
  );
  expect(() => storage.read(original.authentication.credential_ref)).toThrow();
  const replay = await invoke(
    `/v1/connections/${original.id}/rotate-key`,
    { api_key: "fixture-replacement-secret" },
    operation,
  );
  expect(await replay.json()).toEqual(rotated);
  const scope = await context(alice.cookie);
  const events = await f.domain.store.withDataContext(scope, () => f.domain.store.events(0));
  expect(JSON.stringify(events)).not.toContain("fixture-first-secret");
  expect(JSON.stringify(events)).not.toContain("fixture-replacement-secret");
});
