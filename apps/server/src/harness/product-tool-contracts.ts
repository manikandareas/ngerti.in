import { z } from "zod";
import { browserActionInput } from "../browser/contracts";
import { agentInput, agentUpdate, id } from "../contracts";
import {
  captureGoal,
  goalControl,
  reportGoal,
  routineControl,
  routineWrite,
} from "../goals/contracts";
import { askHumanInput, handoffInput } from "../groups/contracts";
import { appExecute, appSearch } from "../integrations/contracts";
import {
  memoryDelete,
  memoryQuery,
  memoryWrite,
  skillAssign,
  skillCreate,
  skillRead,
  skillRevise,
} from "../learning/contracts";
import { relativePath, uploadInput } from "../workspaces/contracts";

export const productToolSchemas = {
  "ngertiin.cancel_run": z.strictObject({ command_id: id }),
  "ngertiin.list_apps": z.strictObject({}),
  "ngertiin.search_app_tools": appSearch,
  "ngertiin.execute_app_tool": appExecute,
  "ngertiin.browser_sessions": z.strictObject({}),
  "ngertiin.browser_open": z.strictObject({ profile_id: id }),
  "ngertiin.browser_action": browserActionInput,
  "ngertiin.list_goals": z.strictObject({}),
  "ngertiin.capture_goal": captureGoal.extend({ command_id: id }),
  "ngertiin.report_goal": reportGoal.safeExtend({ command_id: id }),
  "ngertiin.control_goal": goalControl.extend({ command_id: id }),
  "ngertiin.write_routine": routineWrite.extend({ command_id: id }),
  "ngertiin.control_routine": routineControl.extend({ command_id: id }),
  "ngertiin.routine_no_update": z.strictObject({ command_id: id }),
  "ngertiin.group_read_task": z.strictObject({
    task_id: id,
    offset: z.int().min(0).max(100_000).default(0),
  }),
  "ngertiin.group_handoff": handoffInput.extend({ command_id: id }),
  "ngertiin.group_ask_user": askHumanInput.extend({ command_id: id }),
  "ngertiin.list_memories": memoryQuery,
  "ngertiin.write_memory": memoryWrite.extend({ command_id: id }),
  "ngertiin.delete_memory": memoryDelete.extend({ command_id: id }),
  "ngertiin.list_skills": z.strictObject({}),
  "ngertiin.read_skill": skillRead,
  "ngertiin.read_harness_skill": z.strictObject({ key: z.string().min(1).max(200) }),
  "ngertiin.create_skill": skillCreate.extend({ command_id: id }),
  "ngertiin.revise_skill": skillRevise.extend({ command_id: id }),
  "ngertiin.assign_skill": skillAssign.extend({ command_id: id }),
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
