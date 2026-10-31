import { z } from "zod";
import { agentInput, agentUpdate, id } from "../contracts";
import { relativePath, uploadInput } from "../workspace-contracts";

export const productToolSchemas = {
  "ngertiin.read_run_context": z.strictObject({}),
  "ngertiin.describe_tools": z.strictObject({}),
  "ngertiin.list_agents": z.strictObject({}),
  "ngertiin.create_agent": z.strictObject({ command_id: id, profile: agentInput }),
  "ngertiin.update_agent": agentUpdate.extend({ command_id: id, agent_id: id }),
  "ngertiin.get_workspace": z.strictObject({}),
  "ngertiin.list_files": z.strictObject({ path: z.string().max(1000).default("") }),
  "ngertiin.read_file": z.strictObject({ path: relativePath }),
  "ngertiin.create_file": z.strictObject({
    command_id: id,
    path: relativePath,
    text: z.string().max(100_000),
  }),
  "ngertiin.publish_artifact": z.strictObject({
    command_id: id,
    path: relativePath,
    media_type: uploadInput.shape.media_type,
  }),
};
export const productToolNames = Object.keys(productToolSchemas);
export function productToolCatalog() {
  return Object.entries(productToolSchemas).map(([name, schema]) => ({
    name,
    inputSchema: z.toJSONSchema(schema),
  }));
}
