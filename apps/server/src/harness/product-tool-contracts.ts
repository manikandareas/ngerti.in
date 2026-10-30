import { z } from "zod";
import { agentInput, agentUpdate, id } from "../contracts";

export const productToolSchemas = {
  "ngertiin.read_run_context": z.strictObject({}),
  "ngertiin.describe_tools": z.strictObject({}),
  "ngertiin.list_agents": z.strictObject({}),
  "ngertiin.create_agent": z.strictObject({ command_id: id, profile: agentInput }),
  "ngertiin.update_agent": agentUpdate.extend({ command_id: id, agent_id: id }),
};
export const productToolNames = Object.keys(productToolSchemas);
export function productToolCatalog() {
  return Object.entries(productToolSchemas).map(([name, schema]) => ({
    name,
    inputSchema: z.toJSONSchema(schema),
  }));
}
