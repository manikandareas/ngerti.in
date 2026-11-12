import type { Entity } from "../contracts";
import { asyncMap } from "../persistence/async-collections";
import type { Store } from "../store";

/** Refresh readable references per run, including sessions opened before these instructions. */
export async function publicReferences(store: Store, run: Entity<"run">) {
  const thread = await store.get("thread", run.thread_id);
  const agents = await asyncMap(thread.member_agent_ids, async (id) => {
    const agent = await store.get("agent", id);
    return { name: agent.name, mention: `[@${agent.name}](ngertiin://agent/${agent.id})` };
  });
  const files = (await store.list("artifact", { thread_id: thread.id }))
    .filter((file) => file.thread_id === thread.id && file.materialization === "ready")
    .map((file) => ({
      name: file.name,
      reference: `[${file.name.replace(/[\\[\]]/g, "\\$&")}](ngertiin://file/${file.id})`,
    }));
  return `Public conversation style applies to both DM and group messages. Address people using the supplied readable Markdown mentions. The owner is @user: use [@user](ngertiin://user/owner) when requesting their attention; no username or authentication is required. Use readable file links from the inventory or successful publish_artifact receipts. Do not expose artifact, run, task, goal or workspace UUIDs, checksums, revisions, tool names, protocol fields or internal handoff instructions in conversational prose. Keep such identifiers in structured tool arguments and private instructions. Explain progress and handoffs briefly in the user's language. Never invent a file link or claim an unpublished file is downloadable. Code, direct user quotations and explicitly requested diagnostics may retain technical content. Avoid repeating an activity announcement that the application already displays.\n${JSON.stringify({ agents, files })}`;
}
