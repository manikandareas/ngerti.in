import type { Agent, Connection } from "@/types/workspace";
import type { AISelection } from "./types";

/** Mirror the published selection order for presentation; authorization stays on the server. */
export function selectedAgent(
  agent: Agent,
  thread: string,
  selections: AISelection[],
  connections: Connection[],
): Agent {
  const rows = selections.filter((row) => row.harness === agent.harness);
  const selection = [
    rows.find(
      (row) =>
        row.scope === "conversation" && row.thread_id === thread && row.agent_id === agent.id,
    ),
    rows.find((row) => row.scope === "user"),
    rows.find((row) => row.scope === "organization"),
  ].find((row) => row?.selection)?.selection;
  const connection = connections.find((item) => item.id === selection?.connection_id);
  return {
    ...agent,
    connection_id: selection?.connection_id ?? null,
    model_id: selection?.model_id ?? null,
    reasoning: selection?.reasoning ?? null,
    billing_source: connection?.authentication.billing_source ?? null,
  };
}
