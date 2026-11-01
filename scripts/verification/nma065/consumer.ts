import assert from "node:assert/strict";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { fixture } from "../../../apps/server/tests/helpers";
const f = fixture();
const token = "c".repeat(64);
const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
 const response = await app.handle(new Request(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
 assert.equal(response.status, 200); return response.json();
}
try {
 const missing = await api("/v1/creation/agents", { connection_id: null, harness: "codex", billing_source: "subscription", model_id: null, opener: "Bantu saya menulis ringkasan." });
 const opening = await api(`/v1/threads/${missing.thread.id}/opening`);
 assert.equal(opening.recovery, "configure_or_wait"); assert.equal(opening.connection, null);
 assert.equal(opening.message.text, "Bantu saya menulis ringkasan.");
 const group = await api("/v1/creation/groups", { name: "Research", member_agent_ids: [f.agent.id] });
 const configured = await api(`/v1/groups/${group.thread.id}/configuration`, { expected_revision: group.thread.revision, changes: { shared_instructions: "Use primary sources." } });
 const contract = await api("/v1/contracts");
 const required = ["POST /v1/creation/agents", "POST /v1/creation/groups", "GET /v1/threads/:id/opening", "POST /v1/threads/:id/opening/retry", "POST /v1/groups/:id/configuration"];
 const routes = new Set(contract.http.map((r: any) => `${r.method} ${r.path}`));
 for (const route of required) assert(routes.has(route));
 assert(contract.product_tools.some((t: any) => t.name === "ngertiin.update_group"));
 await Bun.write("docs/verification/nma-065/creation-consumer.json", JSON.stringify({ missing, opening, group, configured, pass: 5, fail: 0 }, null, 2));
 await Bun.write("docs/verification/nma-065/gate-amendment.json", JSON.stringify({ gate: "NMA-060", prerequisite: "NMA-065", contract: contract.version, decisions: ["A03", "C02", "C03", "C04", "D01", "D02", "D05", "E01", "F01", "H01", "H02", "H03", "H06"], routes: required, tools: ["ngertiin.update_agent", "ngertiin.update_group"], events: ["agent", "thread", "message", "run", "group_route", "peer_task"], tests: ["apps/server/tests/creation.test.ts"], evidence: "docs/verification/nma-065/README.md", scope: "Creation/personalization amendment only; existing prerequisite mappings and API readiness gate remain separate." }, null, 2));
 console.log("Creation consumer examples and gate amendment references passed.");
} finally { f.close(); }
