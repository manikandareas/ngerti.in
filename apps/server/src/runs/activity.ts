import { z } from "zod";
import type { Lifecycle } from "../lifecycle";

export const activityKind = z.enum([
  "working",
  "searching",
  "reading",
  "updating",
  "creating",
  "browsing",
  "asking_agent",
]);
export const activeTool = z.strictObject({
  call_id: z.string().min(1).max(1200),
  kind: activityKind,
  target_agent_id: z.uuid().nullable().default(null),
});
export type ActiveTool = z.infer<typeof activeTool>;

/** Only known structured tool identities select specific public activity. Never inspect arguments. */
export function toolActivityKind(name: string): z.infer<typeof activityKind> {
  switch (name) {
    case "webSearch":
    case "web_search":
      return "searching";
    case "ngertiin.search_attachment":
    case "ngertiin.read_attachment":
    case "ngertiin.read_file":
    case "read_file":
      return "reading";
    case "fileChange":
    case "ngertiin.write_file":
    case "write_file":
    case "edit_file":
      return "updating";
    case "ngertiin.create_file":
      return "creating";
    case "ngertiin.browser_open":
    case "ngertiin.browser_action":
      return "browsing";
    default:
      return "working";
  }
}

/** Call identities keep overlapping operations from clearing each other's activity. */
export function observeToolActivity(
  lifecycle: Lifecycle,
  runId: string,
  token: string,
  operation: ActiveTool,
  state: "started" | "completed" | "failed",
) {
  return lifecycle.store.transaction(() => {
    const run = lifecycle.store.get("run", runId);
    const existing = run.active_tools.find((tool) => tool.call_id === operation.call_id);
    if (state !== "started" && !existing) return;
    if (
      state === "started" &&
      existing &&
      existing.kind === operation.kind &&
      existing.target_agent_id === operation.target_agent_id
    )
      return;
    const tools =
      existing && state === "started"
        ? run.active_tools.map((tool) =>
            tool.call_id === operation.call_id ? activeTool.parse(operation) : tool,
          )
        : run.active_tools.filter((tool) => tool.call_id !== operation.call_id);
    if (state === "started" && !existing) tools.push(activeTool.parse(operation));
    lifecycle.observe(runId, token, {
      active_tools: tools.slice(-200),
      activity:
        run.cancellation === "requested"
          ? "stopping"
          : tools.length
            ? "tool_running"
            : "generating",
    });
  });
}
