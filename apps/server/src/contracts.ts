import { z } from "zod";
import { agent, agentInput, agentSnapshot, agentUpdate } from "./agents/contracts";
import { attachmentDocument, stagedUpload } from "./attachments/contracts";
import {
  browserAction,
  browserCommands,
  browserProfile,
  browserSession,
} from "./browser/contracts";
import { harness, id } from "./contracts/base";
import { DomainError, errorCodes } from "./contracts/errors";
import { message, thread, threadInput } from "./conversations/contracts";
import {
  goal,
  goalCommands,
  goalInput,
  occurrence,
  routine,
  routineInput,
  schedule,
} from "./goals/contracts";
import { groupCommands, groupRoute, humanRequest, peerTask } from "./groups/contracts";
import { binding, connection } from "./harness/contracts";
import { aiSelection } from "./harness/selection-contracts";
import {
  appConnection,
  appEffect,
  appSession,
  integrationCommands,
} from "./integrations/contracts";
import {
  harnessInventory,
  learningCommands,
  memory,
  skill,
  skillAssignment,
  skillRevision,
} from "./learning/contracts";
import {
  executionDomain,
  machine,
  machineOperation,
  machineProcess,
  machineTarget,
  machineWindow,
} from "./machines/contracts";
import { agentPreference, publishedKnowledge } from "./organizations/data-contracts";
import {
  admissionInput,
  control,
  queueDelete,
  queueEdit,
  run,
  runStatus,
  steerInput,
} from "./runs/contracts";
import {
  artifact,
  artifactInput,
  publicationInput,
  uploadInput,
  workspace,
  workspaceInput,
} from "./workspaces/contracts";

export {
  admissionInput,
  agent,
  agentInput,
  agentSnapshot,
  agentUpdate,
  artifact,
  artifactInput,
  binding,
  browserAction,
  browserProfile,
  browserSession,
  connection,
  control,
  DomainError,
  errorCodes,
  goal,
  goalInput,
  groupRoute,
  harness,
  harnessInventory,
  humanRequest,
  id,
  memory,
  message,
  occurrence,
  peerTask,
  queueDelete,
  queueEdit,
  routine,
  routineInput,
  run,
  runStatus,
  schedule,
  skill,
  skillAssignment,
  skillRevision,
  steerInput,
  thread,
  threadInput,
  workspace,
};

export const CONTRACT_VERSION = "2.2.0";
export const API_READINESS_GATE = "ready" as const;
export const SCOPED_API_READINESS_GATE = "ready" as const;

export const schemas = {
  ai_selection: aiSelection,
  execution_domain: executionDomain,
  agent_preference: agentPreference,
  published_knowledge: publishedKnowledge,
  attachment_upload: stagedUpload,
  attachment_document: attachmentDocument,
  app_connection: appConnection,
  app_session: appSession,
  app_effect: appEffect,
  browser_profile: browserProfile,
  browser_session: browserSession,
  browser_action: browserAction,
  machine,
  machine_operation: machineOperation,
  machine_process: machineProcess,
  machine_target: machineTarget,
  machine_window: machineWindow,
  group_route: groupRoute,
  peer_task: peerTask,
  human_request: humanRequest,
  memory,
  skill,
  skill_revision: skillRevision,
  skill_assignment: skillAssignment,
  harness_inventory: harnessInventory,
  connection,
  agent,
  thread,
  run,
  message,
  goal,
  routine,
  artifact,
  binding,
  occurrence,
  control,
  workspace,
};
export type Kind = keyof typeof schemas;
export type Entity<K extends Kind = Kind> = z.infer<(typeof schemas)[K]>;
export const kindSchema = z.enum(Object.keys(schemas) as [Kind, ...Kind[]]);
export const domainEvent = z.strictObject({
  conversation_thread_id: z.uuid().optional(),
  schema_version: z.literal(1),
  cursor: z.int().positive(),
  owner_id: id,
  type: z.string(),
  entity_kind: kindSchema,
  entity_id: id,
  revision: z.int().positive(),
  created_at: z.iso.datetime(),
  data: z.discriminatedUnion(
    "kind",
    Object.values(schemas) as [(typeof schemas)[Kind], ...(typeof schemas)[Kind][]],
  ),
});
export type DomainEvent = z.infer<typeof domainEvent>;
export function contractDocument() {
  return {
    version: CONTRACT_VERSION,
    entities: Object.fromEntries(
      Object.entries(schemas).map(([key, value]) => [key, z.toJSONSchema(value)]),
    ),
    event: z.toJSONSchema(domainEvent, { io: "input" }),
    commands: Object.fromEntries(
      Object.entries({
        ...integrationCommands,
        ...browserCommands,
        ...groupCommands,
        ...goalCommands,
        ...learningCommands,
        agent: agentInput,
        update_agent: agentUpdate,
        thread: threadInput,
        goal: goalInput,
        routine: routineInput,
        artifact: publicationInput,
        workspace: workspaceInput,
        upload: uploadInput,
        publish_artifact: publicationInput,
        admit: admissionInput,
        edit_queued_message: queueEdit,
        delete_queued_message: queueDelete,
        steer: steerInput,
      }).map(([key, value]) => [key, z.toJSONSchema(value, { io: "input" })]),
    ),
    errors: errorCodes,
  };
}
