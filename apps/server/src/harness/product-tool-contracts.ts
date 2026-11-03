import { z } from "zod";
import { attachmentList, attachmentRead, attachmentSearch } from "../attachments/contracts";
import { browserActionInput } from "../browser/contracts";
import { agentInput, agentUpdate, id } from "../contracts";
import { groupConfiguration } from "../conversations/creation";
import {
  captureGoal,
  goalAssignment,
  goalControl,
  reportGoal,
  routineControl,
  routineWrite,
} from "../goals/contracts";
import {
  goalCaptureDescription,
  handoffDescription,
  routineWriteDescription,
} from "../goals/instructions";
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
  "ngertiin.list_attachments": attachmentList,
  "ngertiin.read_attachment": attachmentRead,
  "ngertiin.search_attachment": attachmentSearch,
  "ngertiin.update_group": groupConfiguration.extend({ command_id: id }),
  "ngertiin.cancel_run": z.strictObject({ command_id: id }),
  "ngertiin.list_apps": z.strictObject({}),
  "ngertiin.search_app_tools": appSearch,
  "ngertiin.execute_app_tool": appExecute,
  "ngertiin.browser_sessions": z.strictObject({}),
  "ngertiin.browser_open": z.strictObject({ profile_id: id }),
  "ngertiin.browser_action": browserActionInput,
  "ngertiin.list_goals": z.strictObject({}),
  "ngertiin.capture_goal": captureGoal.extend({ command_id: id }).describe(goalCaptureDescription),
  "ngertiin.report_goal": reportGoal
    .safeExtend({ command_id: id })
    .describe(
      "Report progress and the next disposition for an existing tracked Goal. Ordinary work and standalone Routine output do not need a Goal report. Completion requires useful published evidence and successful native settlement.",
    ),
  "ngertiin.control_goal": goalControl.extend({ command_id: id }),
  "ngertiin.assign_goal": goalAssignment.extend({ command_id: id }),
  "ngertiin.write_routine": routineWrite
    .extend({ command_id: id })
    .describe(routineWriteDescription),
  "ngertiin.control_routine": routineControl.extend({ command_id: id }),
  "ngertiin.routine_no_update": z.strictObject({ command_id: id }),
  "ngertiin.group_read_task": z
    .strictObject({
      task_id: id,
      offset: z.int().min(0).max(100_000).default(0),
    })
    .describe(
      "Read retained task context or results. This does not run a queued peer. After your handoff, finish the current turn instead of polling: group execution is serialized, so the peer cannot start until your turn ends. The application resumes the owner with the settled result.",
    ),
  "ngertiin.group_handoff": handoffInput.extend({ command_id: id }).describe(handoffDescription),
  "ngertiin.group_ask_user": askHumanInput
    .extend({ command_id: id })
    .describe(
      "Ask for input needed by the current group task and retain its existing continuation owner. A temporary question or wait alone does not require a Goal. End this turn after asking.",
    ),
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
  "ngertiin.create_file": z
    .strictObject({
      command_id: id,
      path: relativePath,
      text: z.string().max(100_000),
    })
    .describe(
      "Write requested text output within the granted application workspace. This scoped application tool is separate from native shell/filesystem write permissions. It does not require a Goal. Publish the result with publish_artifact when a downloadable file is requested.",
    ),
  "ngertiin.publish_artifact": z
    .strictObject({
      command_id: id,
      path: relativePath,
      media_type: uploadInput.shape.media_type,
    })
    .describe(
      "Publish an existing workspace file as an immutable downloadable artifact. Useful requested deliverables can be published without a Goal; do not create an otherwise unnecessary file solely as proof of an ordinary answer or reminder.",
    ),
};
export const productToolNames = Object.keys(productToolSchemas);
export function productToolDefinition(name: string, schema: z.ZodType) {
  return {
    name,
    ...(schema.description ? { description: schema.description } : {}),
    inputSchema: z.toJSONSchema(schema),
  };
}
export function productToolCatalog() {
  return Object.entries(productToolSchemas).map(([name, schema]) =>
    productToolDefinition(name, schema),
  );
}
