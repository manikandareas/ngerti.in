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
import {
  computerCall,
  machineCommand,
  machineControl,
  machineProcessInput,
  machineWindowInput,
  machineWrite,
} from "../machines/contracts";
import { relativePath, uploadInput } from "../workspaces/contracts";

export const productToolSchemas = {
  "ngertiin.machine_status": z.strictObject({}),
  "ngertiin.machine_exec": machineCommand.describe(
    "Run shell work on the shared persistent Linux machine. The returned process can keep running; use machine_process to read output or control it. A host-native terminal is not this machine.",
  ),
  "ngertiin.machine_process": machineProcessInput,
  "ngertiin.machine_window": machineWindowInput.describe(
    "Open a task-owned browser window (same persistent login profile) or GUI terminal. Temporary windows and their tabs close automatically only after the entire task/handoff chain succeeds and its processes exit. Use keep_open for a preview/result the user should inspect, or retain an existing resource_id before finishing. List returns this task's managed windows. Existing user windows, files and login data are preserved. Human takeover preserves managed windows because human edits cannot be attributed safely.",
  ),
  "ngertiin.machine_control": machineControl.describe(
    "Acquire or release input across a multi-step desktop interaction. Human takeover owns the same input. Reconcile an unknown input lease only after observing current state; this never repeats the uncertain action.",
  ),
  "ngertiin.computer_tools": z
    .strictObject({ names: z.array(z.string().min(1).max(100)).min(1).max(8).optional() })
    .describe(
      "List native Cua computer/browser capabilities, or pass names to retrieve exact upstream argument schemas. Ngertiin supplies session identity.",
    ),
  "ngertiin.computer_call": computerCall.describe(
    "Call an available native Cua tool using its exact schema from computer_tools. Distinct actions need fresh command_id. Session identity is server-owned; foreground input requires the shared input lease. Inspect structuredJson for refusal or unverifiable effects and observe before retrying.",
  ),
  "ngertiin.machine_receipts": z.strictObject({}),
  "ngertiin.machine_reconcile": z
    .strictObject({ command_id: id, operation_id: id })
    .describe(
      "Observe a file after an uncertain write and retain its unknown outcome. This does not repeat the write. Use the observed hash for a subsequent distinct edit.",
    ),
  "ngertiin.write_file": machineWrite.describe(
    "Atomically create or update a shared machine text file. Supply its current SHA-256 for an update; null requires a new path. Conflicting or unknown writes require a fresh read/reconciliation.",
  ),
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
  "ngertiin.group_handoff": handoffInput
    .extend({
      command_id: id,
      announcement: z
        .string()
        .trim()
        .min(1)
        .max(16_000)
        .describe(
          "Your concise public message explaining this handoff or sharing the useful result before asking the peer. Write naturally in your own words; keep private execution instructions in instruction.",
        ),
    })
    .describe(handoffDescription),
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
  "ngertiin.describe_tools": z
    .strictObject({ names: z.array(z.string().min(1).max(100)).max(20).optional() })
    .describe(
      "Read exact schemas. Supply names to retrieve only the tools needed for this step; omit names to inspect the complete catalog.",
    ),
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
export function productToolCatalog(mode: "all" | "machine" | "browser" = "all") {
  return Object.entries(productToolSchemas)
    .filter(
      ([name]) =>
        mode === "all" ||
        (mode === "machine"
          ? !name.startsWith("ngertiin.browser_")
          : !name.startsWith("ngertiin.machine_") &&
            !name.startsWith("ngertiin.computer_") &&
            name !== "ngertiin.write_file"),
    )
    .map(([name, schema]) => productToolDefinition(name, schema));
}
