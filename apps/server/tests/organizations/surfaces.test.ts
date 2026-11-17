import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Groups } from "../../src/groups/service";
import type { AppHost } from "../../src/integrations/host";
import { resolvedMachine } from "../../src/machines/domains";
import { readinessFixture } from "./readiness-helpers";

let f: Awaited<ReturnType<typeof readinessFixture>>;
const cases: {
  method: string;
  path: string;
  own_status: number;
  foreign_status: number | null;
  cross_organization_status?: number | null;
  behavior: string;
}[] = [];
const contract = JSON.parse(
  readFileSync(resolve(import.meta.dir, "fixtures/http-contract.json"), "utf8"),
);
function template(method: string, path: string): string {
  const found = contract.http.find(
    (route: { method: string; path: string }) =>
      route.method === method &&
      new RegExp(`^${route.path.replace(/:[A-Za-z]+/g, "[^/]+").replaceAll("*", ".*")}$`).test(
        path.split("?")[0],
      ),
  );
  if (!found) throw new Error(`Unregistered verification case: ${method} ${path}`);
  return found.path;
}
afterEach(async () => {
  await f?.close();
  secondOrganization = undefined;
  const directory = process.env.NGERTIIN_NMA079_REPORT_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "access-cases.json"), `${JSON.stringify(cases, null, 2)}\n`);
  }
});
let secondOrganization: string | undefined;
async function otherOrganization() {
  if (secondOrganization) return secondOrganization;
  await f.organizations.grantCreation("owner@example.test", 2);
  const second = await f.success(
    f.write(f.owner.cookie, "/v1/organizations", { name: "Second scope", slug: "second-scope" }),
  );
  await f.join(f.alice, "member", [], `/v1/organizations/${second.organization.id}`);
  secondOrganization = second.organization.id;
  return secondOrganization as string;
}
async function call(
  path: string,
  body?: unknown,
  options: {
    owner?: boolean;
    private?: boolean;
    status?: number;
    method?: string;
    behavior?: string;
  } = {},
) {
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const invoke = (cookie: string, organization = f.initial.organization.id) =>
    f.api.handle(
      new Request(`${f.origin}${path}`, {
        method,
        headers: {
          Cookie: cookie,
          Origin: f.origin,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-Ngertiin-Organization": organization,
        },
        body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(body ?? {}),
      }),
    );
  let foreign: number | null = null;
  let crossOrganization: number | null = null;
  if (options.private) {
    foreign = (await invoke(options.owner ? f.alice.cookie : f.owner.cookie)).status;
    expect([401, 403, 404], `Foreign actor ${method} ${path}`).toContain(foreign);
    if (path !== "/health/ready") {
      crossOrganization = (
        await invoke(options.owner ? f.owner.cookie : f.alice.cookie, await otherOrganization())
      ).status;
      expect([401, 403, 404], `Other organization ${method} ${path}`).toContain(crossOrganization);
    }
  }
  const response = await invoke(options.owner ? f.owner.cookie : f.alice.cookie);
  const value = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  expect(response.status, `${method} ${path}: ${JSON.stringify(value)}`).toBe(
    options.status ?? 200,
  );
  cases.push({
    method,
    path: template(method, path),
    own_status: response.status,
    foreign_status: foreign,
    cross_organization_status: crossOrganization,
    behavior:
      options.behavior ??
      (response.status < 300 ? "authorized_success" : "authorized_resource_state_error"),
  });
  return value;
}

test("account consumers exercise administrative metadata, conversation creation and private learning surfaces", async () => {
  f = await readinessFixture();
  await call("/v1/auth/native");
  await call(f.path, { name: "Updated organization", slug: "first-organization" }, { owner: true });
  const group = await call(`${f.path}/workgroups`, { name: "First group" }, { owner: true });
  await call(
    `${f.path}/workgroups/${group.workgroup.id}`,
    { name: "Renamed group" },
    { owner: true },
  );
  await call(`${f.path}/audiences`, undefined, { owner: true });
  await call(`${f.path}/invitations`, undefined, { owner: true });
  await call(
    f.path,
    {},
    {
      owner: true,
      method: "DELETE",
      status: 403,
      behavior: "organization_deletion_explicitly_disabled",
    },
  );
  await call("/health/ready", undefined, { owner: true, private: true });
  const lane = await f.lane(f.alice.cookie, "codex");
  await call("/v1/setup", {});
  await call("/v1/agents/activity");
  await call("/v1/conversations/previews");
  const created = await call("/v1/creation/agents", {
    harness: "codex",
    connection_id: lane.connection.id,
    model_id: "fixture-model",
    billing_source: "subscription",
  });
  await call(`/v1/threads/${created.thread.id}/opening`, undefined, { private: true });
  await call(
    `/v1/threads/${created.thread.id}/opening/retry`,
    { expected_run_id: created.run.id },
    { private: true, status: 409 },
  );
  await call(`/v1/threads/${created.thread.id}/history`, undefined, { private: true });
  await call(`/v1/threads/${created.thread.id}/timeline`, undefined, { private: true });
  const agent = await call("/v1/agents", {
    name: "Private case helper",
    harness: "codex",
    connection_id: null,
  });
  await call(
    `/v1/agents/${agent.id}/configuration`,
    { expected_revision: agent.revision, changes: { name: "Private renamed helper" } },
    { private: true },
  );
  const thread = await call("/v1/threads", { type: "dm", member_agent_ids: [agent.id] });
  const context = { agent_id: agent.id, thread_id: thread.id };
  const query = new URLSearchParams(context).toString();
  const memory = await call(
    "/v1/learning/memories/write",
    {
      context,
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: "Private learning fact",
    },
    { private: true },
  );
  await call(`/v1/learning/memories?${query}`, undefined, { private: true });
  await call(
    "/v1/learning/memories/delete",
    { context, memory_id: memory.id, expected_revision: memory.revision },
    { private: true },
  );
  const skill = await call(
    "/v1/learning/skills/create",
    {
      context,
      name: "private-cases",
      visibility: "dm_private",
      package: { description: "Fixture", instructions: "Read authorized data." },
    },
    { private: true },
  );
  await call(`/v1/learning/skills?${query}`, undefined, { private: true });
  await call(
    "/v1/learning/skills/read",
    { context, skill_id: skill.skill.id, version: 1 },
    { private: true },
  );
  const revision = await call(
    "/v1/learning/skills/revise",
    {
      context,
      skill_id: skill.skill.id,
      expected_revision: skill.skill.revision,
      package: { description: "Updated fixture", instructions: "Read authorized data only." },
    },
    { private: true },
  );
  await call(
    "/v1/learning/skills/assign",
    {
      context,
      skill_id: skill.skill.id,
      version: revision.revision.version,
      expected_revision: 0,
      enabled: true,
    },
    { private: true },
  );
  const team = await call(`/v1/entities/agent/${lane.agent.id}`, undefined, { owner: true });
  await call(
    `/v1/data/team-agents/${team.id}/configuration`,
    { expected_revision: team.revision, changes: { instructions: "Published configuration" } },
    { owner: true },
  );
});

test("account consumers exercise private group routing, Team publication and assignment", async () => {
  f = await readinessFixture();
  const lane = await f.lane(f.alice.cookie, "codex");
  const created = await call("/v1/creation/groups", {
    name: "Private group",
    member_agent_ids: [lane.agent.id],
  });
  let group = await call(
    `/v1/groups/${created.thread.id}/configuration`,
    {
      expected_revision: created.thread.revision,
      changes: { shared_instructions: "Private group instructions" },
    },
    { private: true },
  );
  group = await call(
    `/v1/groups/${group.id}/membership`,
    { expected_revision: group.revision, member_agent_ids: [lane.agent.id] },
    { private: true },
  );
  const route = await call(
    `/v1/groups/${group.id}/messages`,
    { text: "Inspect the private group" },
    { private: true },
  );
  await call(`/v1/groups/${group.id}/routes/${route.id}/decision`, undefined, { private: true });
  await call(
    `/v1/groups/${group.id}/routes/${route.id}/retry`,
    { expected_revision: route.revision },
    { private: true, status: 409 },
  );
  const goal = await call("/v1/goals", {
    thread_id: group.id,
    agent_id: lane.agent.id,
    title: "Group responsibility",
  });
  await call(
    `/v1/goals/${goal.id}/assignment`,
    { expected_revision: goal.revision, agent_id: lane.agent.id },
    { private: true },
  );
  const published = await call(
    `/v1/data/team-agents/${lane.agent.id}/skills/publish`,
    {
      expected_revision: 0,
      name: "published-fixture",
      package: { description: "Published fixture", instructions: "Read authorized data." },
    },
    { owner: true },
  );
  await call(
    `/v1/data/team-agents/${lane.agent.id}/skills/assign`,
    {
      skill_id: published.skill.id,
      version: 1,
      expected_revision: published.assignment?.revision ?? 1,
      enabled: false,
    },
    { owner: true },
  );
});

async function runningLane() {
  const lane = await f.lane(f.alice.cookie, "codex");
  const admission = await call("/v1/runs", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Explicitly track this durable responsibility.",
  });
  const run = await f.domain.store.withDataContext(lane.scope, async () => {
    await f.broker.openSession(lane.thread.id, lane.agent.id);
    const claimed = await f.domain.lifecycle.claimNext(lane.thread.id, lane.agent.id);
    if (!claimed?.dispatch_token) throw new Error("The fixture run was not claimed.");
    return f.domain.lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
  });
  return { ...lane, run, message: admission.message };
}

test("account consumers exercise run-owned publication and durable responsibility commands", async () => {
  f = await readinessFixture();
  const lane = await runningLane();
  const workspace = await call(`/v1/entities/workspace/${lane.run.workspace_id}`);
  await f.domain.store.withDataContext(lane.scope, async () => {
    const machine = await resolvedMachine(f.domain.lifecycle);
    if (!machine) throw new Error("The fixture domain was not resolved.");
    await machine.files().create("result.txt", Buffer.from("Verified fixture result"));
  });
  const artifact = await call(
    "/v1/artifacts",
    {
      workspace_id: workspace.id,
      run_id: lane.run.id,
      path: "result.txt",
      media_type: "text/plain",
    },
    { private: true },
  );
  const goal = await call("/v1/goals/capture", {
    run_id: lane.run.id,
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Durable scope proof",
    objective: "Keep the explicit tracked responsibility private.",
    source_message_id: lane.message.id,
  });
  await call("/v1/routines/write", {
    run_id: lane.run.id,
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Private scheduled check",
    schedule: { type: "once", at: new Date(Date.now() + 60000).toISOString() },
    timezone: "UTC",
  });
  await call(
    `/v1/goals/${goal.id}/recover-completion`,
    {
      expected_revision: goal.revision,
      evidence_artifact_ids: [artifact.id],
      progress: "Recovery is not eligible before completion.",
    },
    { private: true, status: 409 },
  );
  await call(
    `/v1/goals/${goal.id}/progress`,
    {
      run_id: lane.run.id,
      expected_revision: goal.revision,
      progress: "Waiting for the requested follow-up.",
      disposition: "wait",
    },
    { private: true },
  );
  const submission = crypto.randomUUID();
  await call(`/v1/message-submissions/${submission}`);
});

test("account consumers exercise private human replies and device-bound Computer renewal", async () => {
  f = await readinessFixture();
  const lane = await runningLane();
  const question = await f.domain.store.withDataContext(lane.scope, () =>
    new Groups(f.domain.lifecycle).askUser(lane.run.id, {
      purpose: "input",
      question: "Which scope should continue?",
    }),
  );
  await call(
    `/v1/human-requests/${question.id}/reply`,
    { expected_revision: question.revision, text: "Continue this private scope." },
    { private: true },
  );
  const viewer = await call("/v1/machine/view", { interactive: false });
  await call(`/v1/machine/views/${viewer.viewer_id}/renew`, {}, { private: true });
  await call(`/v1/machine/views/${viewer.viewer_id}`, {}, { private: true, method: "DELETE" });
  const process = await f.domain.store.withDataContext(lane.scope, async () => {
    const machine = await resolvedMachine(f.domain.lifecycle);
    if (!machine) throw new Error("The fixture domain was not resolved.");
    const state = await machine.snapshot();
    const now = new Date().toISOString();
    return f.domain.store.put({
      id: crypto.randomUUID(),
      owner_id: f.domain.owner,
      kind: "machine_process",
      revision: 1,
      created_at: now,
      updated_at: now,
      machine_id: state.id,
      generation: state.generation,
      agent_id: lane.agent.id,
      thread_id: lane.thread.id,
      run_id: lane.run.id,
      tag: "fixture",
      state: "exited",
      pid: null,
      stdout: "",
      stderr: "",
      output_truncated: false,
      output_offset: "0",
      exit_code: 0,
      exit_signal: null,
      lost: false,
    });
  });
  await call("/v1/machine/processes/control", {
    command_id: crypto.randomUUID(),
    process_id: process.id,
    operation: "read",
  });
});

test("account consumers exercise selected-provider metadata, preparation and private run controls", async () => {
  f = await readinessFixture();
  const lane = await f.lane(f.alice.cookie, "codex");
  await call("/v1/harness/contracts");
  await call("/v1/harnesses");
  await call(`/v1/connections/${lane.connection.id}/inspect`, {}, { private: true });
  await call(`/v1/connections/${lane.connection.id}/login`, {}, { private: true });
  await call(`/v1/connections/${lane.connection.id}/login/cancel`, {}, { private: true });
  await call(
    `/v1/threads/${lane.thread.id}/prepare`,
    { agent_id: lane.agent.id },
    { private: true },
  );
  await f.background.idle();
  const admission = await call("/v1/runs", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Queued controls",
  });
  await call(
    `/v1/messages/${admission.message.id}/edit`,
    { expected_revision: admission.message.revision, text: "Edited queued input" },
    { private: true },
  );
  await call(
    `/v1/runs/${admission.run.id}/steer`,
    { text: "Steer" },
    { private: true, status: 409 },
  );
  await call(`/v1/runs/${admission.run.id}/interactions/history`, undefined, { private: true });
  await call(`/v1/runs/${admission.run.id}/interactions`, undefined, {
    private: true,
    status: 409,
  });
  await call(
    `/v1/runs/${admission.run.id}/interactions`,
    { type: "approval", request_id: "missing", choice_id: "accept", source_index: 0 },
    { private: true, status: 409 },
  );
  await call(`/v1/runs/${admission.run.id}/reconcile`, {}, { private: true });
  await call(
    `/v1/runs/${admission.run.id}/retry`,
    { expected_revision: admission.run.revision },
    { private: true, status: 409 },
  );
  await call(
    `/v1/runs/${admission.run.id}/retry-preparation`,
    { expected_revision: admission.run.revision },
    { private: true, status: 409 },
  );
  const edited = await call(`/v1/entities/message/${admission.message.id}`);
  await call(
    `/v1/messages/${edited.id}/delete`,
    { expected_revision: edited.revision },
    { private: true },
  );
  await call(`/v1/runs/${admission.run.id}/cancel`, {}, { private: true });
});

test("account consumers exercise private working-file, derived-artifact and responsibility surfaces", async () => {
  f = await readinessFixture();
  const lane = await f.lane(f.alice.cookie, "codex");
  const workspace = await call("/v1/workspaces", {
    agent_id: lane.agent.id,
    thread_id: lane.thread.id,
  });
  await call(`/v1/threads/${lane.thread.id}/workspace?agent_id=${lane.agent.id}`, undefined, {
    private: true,
  });
  const upload = await call(
    `/v1/workspaces/${workspace.id}/uploads`,
    {
      name: "private.txt",
      media_type: "text/plain",
      content_base64: Buffer.from("Private file").toString("base64"),
    },
    { private: true },
  );
  await call(`/v1/workspaces/${workspace.id}/files`, undefined, { private: true });
  await call(`/v1/workspaces/${workspace.id}/file?path=${upload.source_path}`, undefined, {
    private: true,
  });
  await call(`/v1/artifacts/${upload.id}/share`, { workspace_id: workspace.id }, { private: true });
  await call("/v1/machine/files");
  await call(`/v1/machine/file?path=${upload.source_path}`);
  for (const path of ["operations", "processes", "windows"]) await call(`/v1/machine/${path}`);
  const snapshot = await call("/v1/machine");
  await call("/v1/machine/control", {
    command_id: crypto.randomUUID(),
    operation: "release",
    expected_revision: snapshot.lease.revision,
  });
  const goal = await call("/v1/goals", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    title: "Private goal",
  });
  await call(`/v1/threads/${lane.thread.id}/goals?agent_id=${lane.agent.id}`, undefined, {
    private: true,
  });
  await call(`/v1/goals/${goal.id}/control`, { state: "paused" }, { private: true });
  const routine = await call("/v1/routines", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    instruction: "Private check",
    schedule: { type: "once", at: new Date(Date.now() + 60000).toISOString() },
    timezone: "UTC",
  });
  await call(
    `/v1/routines/${routine.id}/control`,
    { expected_revision: routine.revision, state: "paused" },
    { private: true },
  );
  await call(`/v1/workspaces/${workspace.id}/revoke`, {}, { private: true });
});

test("account consumers exercise app discovery, reconnect and private revocation without ambient app identity", async () => {
  const accounts = new Map<string, { id: string; toolkit: string; active: boolean }[]>();
  const host: AppHost = {
    catalog: async () => ({ items: [{ slug: "github", name: "GitHub", connected: false }] }),
    connect: async (user, toolkit) => {
      const account = { id: `ca-${crypto.randomUUID()}`, toolkit, active: true };
      accounts.set(user, [...(accounts.get(user) ?? []), account]);
      return { account_id: account.id, connect_url: "https://example.test/connect" };
    },
    accounts: async (user) => accounts.get(user) ?? [],
    session: async () => crypto.randomUUID(),
    search: async () => [
      { slug: "GITHUB_READ_PROFILE", toolkit: "github", input_schema: { type: "object" } },
    ],
    execute: async (_session, _account, _tool, _input, authorize) => {
      await authorize();
      return { data: {}, state: "succeeded", log_id: null };
    },
  };
  f = await readinessFixture(undefined, host);
  await call("/v1/apps/catalog");
  const connected = await call("/v1/apps/connect", { toolkit: "github" });
  await call("/v1/apps/connections");
  await call(`/v1/apps/connections/${connected.connection.id}/refresh`, {}, { private: true });
  await call(
    "/v1/apps/search",
    { connection_id: connected.connection.id, query: "Read profile" },
    { private: true },
  );
  await call(`/v1/apps/connections/${connected.connection.id}/reconnect`, {}, { private: true });
  await call(`/v1/apps/connections/${connected.connection.id}/revoke`, {}, { private: true });
});

test("only the issued live run lease enters the private MCP endpoint", async () => {
  f = await readinessFixture();
  const lane = await f.lane(f.alice.cookie, "codex");
  await f.domain.store.withDataContext(lane.scope, async () => {
    await f.broker.openSession(lane.thread.id, lane.agent.id);
    await f.domain.lifecycle.admit({
      thread_id: lane.thread.id,
      agent_id: lane.agent.id,
      text: "MCP authorization",
    });
    const run = await f.domain.lifecycle.claimNext(lane.thread.id, lane.agent.id);
    if (!run?.dispatch_token) throw new Error("The fixture run was not claimed.");
    await f.domain.lifecycle.started(run.id, run.dispatch_token, "fixture-native-run");
    const lease = await f.tools.issue(run);
    try {
      for (const method of ["GET", "POST"]) {
        const request = (token: string) =>
          new Request(`${f.origin}/v1/harness/tools`, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Origin: f.origin,
              "Content-Type": "application/json",
            },
            body:
              method === "GET"
                ? undefined
                : JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "initialize",
                    params: {
                      protocolVersion: "2025-06-18",
                      capabilities: {},
                      clientInfo: { name: "fixture", version: "1" },
                    },
                  }),
          });
        const own = await f.api.handle(request(lease.token));
        const foreign = await f.api.handle(request("r".repeat(64)));
        expect(own.status).toBe(method === "GET" ? 405 : 200);
        expect(foreign.status).toBe(401);
        cases.push({
          method,
          path: "/v1/harness/tools",
          own_status: own.status,
          foreign_status: 401,
          behavior:
            method === "GET"
              ? "authorized_run_lease_method_explicitly_disabled"
              : "authorized_run_lease_success",
        });
      }
    } finally {
      lease.revoke();
    }
  });
});
