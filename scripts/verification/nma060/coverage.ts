import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import type { consumerContract, httpContract } from "../../../apps/server/src/api-contract";
import type { contractDocument } from "../../../apps/server/src/contracts";

type Mapping = {
  ids: string;
  owner: string;
  routes: string[];
  tools?: string[];
  events: string[];
  tests: string[];
  limits?: string[];
};
const mappings: Mapping[] = [
  {
    ids: "A04 E01 E02 E03 E04 E06 E07 E08",
    owner: "NMA-057",
    routes: [
      "GET /v1/threads/:id/goals",
      "POST /v1/goals/capture",
      "POST /v1/goals/:id/progress",
      "POST /v1/routines/write",
      "POST /v1/routines/:id/control",
      "POST /v1/goals/:id/control",
    ],
    tools: [
      "ngertiin.capture_goal",
      "ngertiin.report_goal",
      "ngertiin.write_routine",
      "ngertiin.routine_no_update",
    ],
    events: ["goal", "routine", "occurrence", "run", "message"],
    tests: ["goals/domain.test.ts", "goals/adapters.test.ts"],
    limits: [
      "Muse uses explicit API-key/developer credits; subscription is open on NMA-050.",
      "Earlier behavioral failures remain retained; native inference success is separate.",
    ],
  },
  {
    ids: "B01 B04 B06 T02",
    owner: "NMA-048",
    routes: [
      "GET /v1/harnesses",
      "GET /v1/harness/contracts",
      "POST /v1/connections",
      "POST /v1/agents/:id/configuration",
    ],
    events: ["connection", "agent", "binding"],
    tests: ["harness.test.ts"],
    limits: ["Runtime support is capability-specific; unsupported/unknown remain valid."],
  },
  {
    ids: "B02 B03 PR02",
    owner: "NMA-050",
    routes: [
      "POST /v1/connections/:id/login",
      "POST /v1/connections/:id/inspect",
      "POST /v1/threads/:id/sessions",
    ],
    tools: ["ngertiin.read_run_context"],
    events: ["connection", "binding", "run"],
    tests: ["muse.test.ts"],
    limits: [
      "OPEN: no Muse subscription-backed request/tool round trip or live native permission decision. Key-backed evidence does not close these criteria.",
    ],
  },
  {
    ids: "PR01",
    owner: "NMA-049",
    routes: ["POST /v1/connections/:id/inspect", "POST /v1/threads/:id/sessions", "POST /v1/runs"],
    tools: ["ngertiin.read_run_context"],
    events: ["connection", "binding", "run"],
    tests: ["codex.test.ts"],
  },
  {
    ids: "C01 C02 C03 C04",
    owner: "NMA-052",
    routes: [
      "POST /v1/setup",
      "POST /v1/agents",
      "POST /v1/agents/:id/configuration",
      "POST /v1/agents/:id/dm",
      "GET /v1/threads/:id/snapshot",
      "GET /v1/threads/:id/history",
    ],
    tools: ["ngertiin.create_agent", "ngertiin.update_agent"],
    events: ["agent", "thread", "message", "binding"],
    tests: ["agents.test.ts"],
  },
  {
    ids: "C05 C06 C07 H01 H02 H05",
    owner: "NMA-053",
    tools: ["ngertiin.cancel_run", "ngertiin.control_goal"],
    routes: [
      "GET /v1/events",
      "GET /v1/events/stream",
      "POST /v1/messages/:id/edit",
      "POST /v1/messages/:id/delete",
      "POST /v1/runs/:id/steer",
      "POST /v1/runs/:id/cancel",
      "POST /v1/runs/:id/reconcile",
      "GET /v1/runs/:id/interactions",
    ],
    events: ["run", "message", "control", "binding"],
    tests: ["controls.test.ts", "background.test.ts"],
    limits: [
      "Muse single-turn steer remains unknown and is not dispatched. Unknown effects are never blindly replayed.",
    ],
  },
  {
    ids: "D01 D02 D03 D05",
    owner: "NMA-056",
    routes: [
      "POST /v1/threads",
      "POST /v1/groups/:id/membership",
      "POST /v1/groups/:id/messages",
      "POST /v1/human-requests/:id/reply",
    ],
    tools: ["ngertiin.group_handoff", "ngertiin.group_ask_user", "ngertiin.group_read_task"],
    events: ["group_route", "peer_task", "human_request", "message"],
    tests: ["groups/domain.test.ts", "groups/adapters.test.ts"],
    limits: [
      "Retained cross-runtime group evidence uses Codex subscription and Muse explicit key. Muse live router selection was not separately claimed.",
    ],
  },
  {
    ids: "F01 F02 F03 F04",
    owner: "NMA-054",
    routes: [
      "POST /v1/workspaces",
      "GET /v1/workspaces/:id/files",
      "GET /v1/workspaces/:id/file",
      "POST /v1/workspaces/:id/uploads",
      "GET /v1/artifacts/:id/content",
      "POST /v1/artifacts/:id/share",
    ],
    tools: [
      "ngertiin.get_workspace",
      "ngertiin.read_file",
      "ngertiin.create_file",
      "ngertiin.publish_artifact",
    ],
    events: ["workspace", "artifact", "run"],
    tests: ["workspaces.test.ts"],
    limits: [
      "Native coding/Git demonstrated on Codex; Muse uses scoped file product tools and native shell is unsupported in this adapter.",
    ],
  },
  {
    ids: "F05 F08 F09",
    owner: "NMA-059",
    routes: [
      "GET /v1/apps/catalog",
      "GET /v1/apps/connections",
      "POST /v1/apps/connect",
      "POST /v1/apps/connections/:id/assign",
      "POST /v1/apps/search",
      "POST /v1/runs",
    ],
    tools: ["ngertiin.list_apps", "ngertiin.search_app_tools", "ngertiin.execute_app_tool"],
    events: ["app_connection", "app_session", "app_effect", "run"],
    tests: ["integrations.test.ts", "multimodal.test.ts"],
    limits: [
      "Retained Codex image, sourced web research and Linear read succeeded. Two app effects remain unknown. Muse visual/search and native video are unsupported; no silent fallback.",
    ],
  },
  {
    ids: "F06",
    owner: "NMA-058",
    routes: [
      "GET /v1/browser/contracts",
      "POST /v1/browser/profiles",
      "POST /v1/browser/profiles/:id/grants",
      "POST /v1/browser/profiles/:id/open",
      "GET /v1/browser/sessions/:id",
      "GET /v1/browser/sessions/:id/receipts",
      "POST /v1/browser/sessions/:id/view",
      "POST /v1/browser/sessions/:id/control",
    ],
    tools: ["ngertiin.browser_sessions", "ngertiin.browser_open", "ngertiin.browser_action"],
    events: ["browser_profile", "browser_session", "browser_action"],
    tests: ["browser/domain.test.ts"],
    limits: [
      "Direct browser-use MCP and view-only RFB/VNC; retained real browser evidence is not new product UI acceptance. Arbitrary-site auth detection is unknown.",
    ],
  },
  {
    ids: "G01 G02 G03 G04 T03",
    owner: "NMA-055",
    routes: [
      "GET /v1/learning/memories",
      "POST /v1/learning/memories/write",
      "POST /v1/learning/memories/delete",
      "GET /v1/learning/skills",
      "POST /v1/learning/skills/create",
      "POST /v1/learning/skills/revise",
      "POST /v1/learning/skills/assign",
      "POST /v1/harness/tools",
    ],
    tools: [
      "ngertiin.list_memories",
      "ngertiin.write_memory",
      "ngertiin.delete_memory",
      "ngertiin.read_harness_skill",
      "ngertiin.create_skill",
      "ngertiin.revise_skill",
    ],
    events: ["memory", "skill", "skill_revision", "skill_assignment", "harness_inventory"],
    tests: ["learning/domain.test.ts", "learning/adapters.test.ts"],
  },
  {
    ids: "T01 T04 H03 T06",
    owner: "NMA-060",
    routes: ["GET /health/ready", "GET /v1/contracts", "GET /v1/events"],
    events: ["run", "control", "browser_action", "app_effect"],
    tests: ["contracts.test.ts", "lifecycle.test.ts", "api.test.ts"],
    limits: [
      "Gate pending NMA-050. Current contract checks plus retained native reports are not a fresh full native cohort.",
      "Historical Python source remains quarantined behind retired entry points; full remaining dead-source cleanup is not claimed closed.",
    ],
  },
];

const contract = (await Bun.file("docs/contracts/1.12.0.json").json()) as ReturnType<
  typeof contractDocument
> &
  ReturnType<typeof consumerContract> & { http: ReturnType<typeof httpContract> };
const scope = (await Bun.file("docs/verification/nma-060/scope.json").json()) as {
  decisions: { id: string; disposition: string }[];
};
const seen = new Set<string>(),
  routes = new Set(contract.http.map((r) => `${r.method} ${r.path}`));
const tools = new Set(contract.product_tools.map((t) => t.name));
const coverage = mappings.flatMap((mapping) => {
  for (const route of mapping.routes) assert(routes.has(route), route);
  for (const tool of mapping.tools ?? []) assert(tools.has(tool), tool);
  for (const kind of mapping.events) assert(kind in contract.entities, kind);
  for (const test of mapping.tests) assert(existsSync(`apps/server/tests/${test}`), test);
  const evidence = `docs/verification/${mapping.owner.toLowerCase()}/README.md`;
  assert(existsSync(evidence), evidence);
  return mapping.ids.split(" ").map((id) => {
    assert(!seen.has(id), `Duplicate feature ${id}`);
    seen.add(id);
    return {
      id,
      owner: mapping.owner,
      routes: mapping.routes,
      tools: mapping.tools ?? [],
      event_entities: mapping.events,
      tests: mapping.tests.map((t) => `apps/server/tests/${t}`),
      retained_evidence: evidence,
      ...(id === "C07" ? {
        current_evidence: "docs/verification/nma-060/cancellation/README.md",
        decision_amendment: "docs/verification/nma-060/cancellation/decision.json",
      } : {}),
      limits: mapping.limits ?? [],
      acceptance: "mapped_gate_pending",
    };
  });
});
assert.deepEqual(
  [...seen].sort(),
  scope.decisions
    .filter((d) => d.disposition === "backend_required")
    .map((d) => d.id)
    .sort(),
);
await Bun.write(
  "docs/verification/nma-060/cancellation/coverage.json",
  `${JSON.stringify(
    {
      contract_version: contract.version,
      requirement_count: seen.size,
      coverage,
      note: "Mapping and reference validation do not establish native acceptance. Read each retained report and its denominator/limits.",
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify({
    decisions: scope.decisions.length,
    backend_requirements: seen.size,
    mappings: mappings.length,
    unresolved_dependency: "NMA-050",
  }),
);
