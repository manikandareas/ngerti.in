import { z } from "zod";
import { base, id } from "../contracts/base";

export const threadInput = z
  .strictObject({
    type: z.enum(["dm", "group"]),
    member_agent_ids: z.array(id).min(1).max(100),
  })
  .refine(
    (v) =>
      new Set(v.member_agent_ids).size === v.member_agent_ids.length &&
      (v.type !== "dm" || v.member_agent_ids.length === 1),
    "Invalid thread membership.",
  );
export const thread = threadInput.safeExtend({
  ...base,
  kind: z.literal("thread"),
  purpose: z.enum(["conversation", "routing"]).default("conversation"),
  group_thread_id: id.nullable().default(null),
  name: z.string().trim().min(1).max(200).nullable().default(null),
  shared_instructions: z.string().max(100_000).default(""),
  creation_operation_id: id.nullable().default(null),
});
export const message = z
  .strictObject({
    ...base,
    kind: z.literal("message"),
    thread_id: id,
    author: z.enum(["user", "agent", "routine"]),
    author_agent_id: id.nullable(),
    routine_id: id.nullable(),
    run_id: id.nullable(),
    purpose: z
      .enum(["conversation", "handoff", "review", "human_request", "human_reply", "continuation"])
      .default("conversation"),
    source_run_id: id.nullable().default(null),
    creation_operation_id: id.nullable().default(null),
    text: z.string().max(100_000),
    state: z.enum(["complete", "partial", "deleted"]),
    artifact_ids: z.array(id).max(20).default([]),
  })
  .refine(
    (value) =>
      (value.author === "agent") === (value.author_agent_id !== null) &&
      (value.author === "agent" || value.text.length > 0) &&
      (value.author !== "routine" || value.routine_id !== null),
    "Invalid message author.",
  );
