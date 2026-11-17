import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync } from "node:fs";
import { choice } from "../../../apps/server/node_modules/@typesafe-ai/sdk/dist/index.mjs";
import { JevRouter, type RoutingPacket } from "../../../apps/server/src/groups/router";
import { routingEvidence } from "../../../apps/server/src/groups/routing-policy";
import { initialActorInstructions, routingInputHash, routingState } from "./legacy/routing-policy";

const db = new Database(".dev/harness-first/ngertiin.sqlite", { readonly: true });
const routeId = "25fc1830-15ef-4cd7-8f38-c1f495016a70";
const persisted = JSON.parse(
  (
    db.query("SELECT body FROM entities WHERE kind='group_route' AND id=?").get(routeId) as {
      body: string;
    }
  ).body,
);
const cursor = (
  db
    .query(
      "SELECT cursor FROM events WHERE json_extract(body,'$.entity_id')=? AND json_extract(body,'$.revision')=2",
    )
    .get(routeId) as { cursor: number }
).cursor;
const entities = new Map<string, any>();
for (const row of db
  .query("SELECT body FROM events WHERE cursor<=? ORDER BY cursor")
  .all(cursor) as { body: string }[]) {
  const e = JSON.parse(row.body);
  entities.set(`${e.entity_kind}:${e.entity_id}`, e.data);
}
db.close();
const get = (kind: string, id: string) => {
  const value = entities.get(`${kind}:${id}`);
  assert(value, `${kind} must exist at routing time`);
  return value;
};
const group = get("thread", persisted.thread_id),
  message = get("message", persisted.message_id);
const excerpt = (text: string, budget: number) => {
  let v = text;
  while (JSON.stringify(v).length > budget) v = v.slice(0, Math.floor(v.length * 0.75));
  return v;
};
const history: RoutingPacket["history"] = [];
let budget = 32000;
for (const m of [...entities.values()]
  .filter(
    (e) =>
      e.kind === "message" &&
      e.thread_id === group.id &&
      e.id !== message.id &&
      e.state === "complete" &&
      !["continuation", "handoff", "review"].includes(e.purpose),
  )
  .toReversed()) {
  const entry = { id: m.id, author: m.author, agent_id: m.author_agent_id, text: m.text };
  const size = JSON.stringify(entry).length;
  if (size > budget) break;
  history.unshift(entry);
  budget -= size;
}
const packet: RoutingPacket = {
  group: { name: group.name, shared_instructions: group.shared_instructions },
  request: excerpt(message.text, 16000),
  request_message_id: message.id,
  attachments: message.artifact_ids.map((id: string) => {
    const a = get("artifact", id);
    return {
      id,
      name: a.name,
      media_type: a.media_type,
      size_bytes: a.size_bytes,
      sha256: a.sha256,
    };
  }),
  members: group.member_agent_ids
    .filter((id: string) => id in persisted.routing.candidate_revisions)
    .map((id: string) => {
      const a = get("agent", id);
      assert.equal(a.revision, persisted.routing.candidate_revisions[id]);
      const limit = Math.floor(20000 / group.member_agent_ids.length) / 2;
      return {
        agent_id: id,
        name: a.name,
        handle: a.handle,
        soul: excerpt(a.soul, limit),
        instructions: excerpt(a.instructions, limit),
      };
    }),
  history: history.slice(-16),
  active_tasks: [...entities.values()]
    .filter(
      (e) =>
        e.kind === "peer_task" &&
        e.thread_id === group.id &&
        !["completed", "failed", "cancelled"].includes(e.state),
    )
    .slice(-8)
    .map((t) => ({ agent_id: t.agent_id, state: t.state, summary: t.summary })),
};
assert(process.env.TYPESAFE_API_KEY);
const legacyCandidates = Object.fromEntries(
  packet.members.map((member, index) => [`member_${index}`, member]),
);
const originalRequest = {
  model: "jev-1.14.0",
  state: routingState(packet),
  questions: {
    responder: choice(initialActorInstructions, {
      ...Object.fromEntries(
        Object.entries(legacyCandidates).map(([key, member]) => [
          key,
          `The member ${member.name}, described in members.${key}.`,
        ]),
      ),
      unresolved:
        "No supplied group member is a supported initial recipient, or the initial recipient is ambiguous.",
    }),
  },
};
assert.equal(
  routingInputHash(originalRequest),
  persisted.routing.input_sha256,
  "The historical packet must reproduce the original application request.",
);
const router = new JevRouter(process.env.TYPESAFE_API_KEY);
const expected = packet.members.find((m) => m.name === "Tobi")!.agent_id;
const variants = [
  { name: "exact_historical", packet, expected },
  {
    name: "reversed_candidate_order",
    packet: { ...packet, members: [...packet.members].reverse() },
    expected,
  },
  {
    name: "opposite_delegation",
    packet: { ...packet, request: "skinny suruh tobi say hi juga ke aku" },
    expected: packet.members.find((member) => member.name !== "Tobi")!.agent_id,
  },
  {
    name: "renamed_members",
    packet: (() => {
      const replace = (text: string) =>
        text
          .replaceAll("Skinny Vicuna", "Bayu")
          .replace(/\bskinny\b/gi, "Bayu")
          .replace(/\btobi\b/gi, "Aruna");
      return {
        ...packet,
        request: replace(packet.request),
        history: packet.history.map((message) => ({ ...message, text: replace(message.text) })),
        members: packet.members.map((member) => ({
          ...member,
          name: member.name === "Tobi" ? "Aruna" : "Bayu",
          handle: member.handle ? replace(member.handle) : null,
          soul: replace(member.soul),
          instructions: replace(member.instructions),
        })),
      };
    })(),
    expected,
  },
];
const results: object[] = [];
const report: any = {
  captured_at: new Date().toISOString(),
  scope:
    "Read-only source database, historical event replay and pure classification only; no task admission, message submission or application configuration changes.",
  event_cursor: cursor,
  original_route_id: routeId,
  original_routing: persisted.routing,
  expected_name: "Tobi",
  request: packet.request,
  legacy_request_sha256: routingInputHash(originalRequest),
  results,
};
for (const variant of variants.filter(
  (variant) => process.argv[2] !== "rename" || variant.name === "renamed_members",
))
  for (let repetition = 0; repetition < 3; repetition++) {
    const started = performance.now();
    try {
      const decision = await router.choose(variant.packet, new AbortController().signal);

      results.push({
        variant: variant.name,
        repetition,
        selected_name: packet.members.find((m) => m.agent_id === decision.agent_id)?.name ?? null,
        correct: decision.agent_id === variant.expected,
        accepted: routingEvidence(decision).reason === "accepted",
        model_calls: decision.model_calls,
        confidence: decision.confidence,
        probabilities: decision.probabilities,
        input_sha256: decision.input_sha256,
        duration_ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      results.push({
        variant: variant.name,
        repetition,
        error: error instanceof Error ? error.message : "Failed",
      });
    }
  }
report.finished_at = new Date().toISOString();
report.source_sha256 = Object.fromEntries(
  await Promise.all(
    [
      "apps/server/src/groups/router.ts",
      "apps/server/src/groups/routing-policy.ts",
      "apps/server/src/groups/routing-context.ts",
      "apps/server/src/groups/routing-judgments.ts",
    ].map(async (path) => [
      path,
      createHash("sha256")
        .update(await Bun.file(path).text())
        .digest("hex"),
    ]),
  ),
);
const output =
  process.argv[2] === "rename"
    ? ".dev/verification/jev-routing-v3/historical-replay-renamed.json"
    : ".dev/verification/jev-routing-v3/historical-replay.json";
await Bun.write(
  ".dev/jev-routing-v3/historical-packets.json",
  JSON.stringify(
    variants.map((variant) => ({
      id: variant.name,
      family: "historical_replay",
      expected: [variant.expected],
      packet: variant.packet,
    })),
    null,
    2,
  ) + "\n",
);
chmodSync(".dev/jev-routing-v3/historical-packets.json", 0o600);
await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
chmodSync(output, 0o600);
console.log(
  JSON.stringify(
    {
      event_cursor: cursor,
      original_input_hash: persisted.routing.input_sha256,
      request: packet.request,
      results,
    },
    null,
    2,
  ),
);
