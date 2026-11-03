import { createHash } from "node:crypto";
import type { RoutingPacket } from "./router";

export const ROUTING_CONTEXT_VERSION = "conversation-facts-v3";
export type ContextScope = "focused" | "shared";
export const memberKey = (id: string) =>
  `agent_${createHash("sha256").update(id).digest("hex").slice(0, 12)}`;
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

function identityFacts(packet: RoutingPacket) {
  const references = packet.members.map((member) => {
    const words = member.name.trim().split(/\s+/u);
    return [
      ...new Set(
        [
          member.name,
          ...(member.handle ? [member.handle] : []),
          ...words.slice(0, -1).map((_, i) => words.slice(0, i + 1).join(" ")),
        ].map(normalize),
      ),
    ];
  });
  const counts = new Map<string, number>();
  for (const values of references)
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return {
    references: references.map((values) => values.filter((value) => counts.get(value) === 1)),
    ambiguous: Object.fromEntries(
      [...counts]
        .filter(([, count]) => count > 1)
        .map(([reference]) => [
          reference,
          packet.members
            .filter((_, i) => references[i].includes(reference))
            .map((member) => memberKey(member.agent_id)),
        ]),
    ),
  };
}

export function routingReferences(packet: RoutingPacket) {
  return identityFacts(packet).references;
}

/** Remove product-link transport syntax, retaining the author's visible words as evidence. */
function visibleText(text: string) {
  return text.replace(/\[([^\]]+)\]\(ngertiin:\/\/(?:agent|file|user)\/[^)]+\)/gu, "$1");
}

/** Focus is a projection of facts, not a linguistic guess about the current request. */
export function routingState(
  packet: RoutingPacket,
  scope: ContextScope = "focused",
  identityOnly = false,
) {
  const identities = identityFacts(packet);
  const references = identities.references;
  const keys = new Map(
    packet.members.map((member) => [member.agent_id, memberKey(member.agent_id)]),
  );
  const actor = (id: string | null) => (id ? (keys.get(id) ?? "former_member") : "user");
  const roleBudget = Math.min(
    640,
    Math.max(80, Math.floor(24_000 / Math.max(1, packet.members.length))),
  );
  return {
    latest_request: packet.request,
    origin: packet.origin
      ? {
          kind: packet.origin.kind,
          actor:
            packet.origin.kind === "system_selection" ? "system" : actor(packet.origin.actor_id),
          purpose: packet.origin.purpose,
        }
      : { kind: "user_request", actor: "user", purpose: "conversation" },
    group: {
      name: packet.group.name,
      shared_instructions: identityOnly ? "" : packet.group.shared_instructions.slice(0, 2000),
    },
    members: Object.fromEntries(
      packet.members.map((member, index) => [
        memberKey(member.agent_id),
        {
          name: member.name,
          references: references[index],
          responsibility: identityOnly
            ? ""
            : [member.soul, member.instructions].filter(Boolean).join("\n").slice(0, roleBudget) ||
              "General assistant; no specialized responsibility was supplied.",
        },
      ]),
    ),
    identity_ambiguities: identities.ambiguous,
    recent_turn_authors: packet.history
      .slice(-3)
      .map((message) => (message.agent_id ? actor(message.agent_id) : message.author)),
    recent_history:
      scope === "shared"
        ? packet.history.slice(-8).map((message) => ({
            author: message.agent_id ? actor(message.agent_id) : message.author,
            text: visibleText(message.text).slice(0, 900),
          }))
        : [],
    active_work: (packet.active_tasks ?? []).slice(-4).map((task) => ({
      member: actor(task.agent_id),
      state: task.state,
      summary: task.summary?.slice(0, 320) ?? null,
    })),
    observed_interactions:
      scope === "shared"
        ? (packet.interactions ?? []).slice(-6).map((task) => ({
            member: actor(task.agent_id),
            requested_by: task.source_agent_id ? actor(task.source_agent_id) : "user",
            state: task.state,
            request: visibleText(task.request).slice(0, 700),
            summary: task.summary?.slice(0, 240) ?? null,
          }))
        : [],
    attachments: packet.attachments.map((file) => ({
      name: file.name.slice(0, 160),
      media_type: file.media_type,
      size_bytes: file.size_bytes,
    })),
  };
}
