import { z } from "zod";
import { base, id } from "../contracts/base";
import { relativePath } from "../workspaces/contracts";

export const machineLease = z.strictObject({
  holder: z.enum(["none", "agent", "human"]),
  agent_id: id.nullable(),
  run_id: id.nullable(),
  revision: z.int().nonnegative(),
  state: z.enum(["active", "unknown"]),
  expires_at: z.iso.datetime().nullable(),
});
export const machine = z.strictObject({
  ...base,
  kind: z.literal("machine"),
  machine_key: id.nullable(),
  generation: z.int().positive(),
  state: z.enum(["unconfigured", "offline", "ready", "unknown"]),
  root: z.string(),
  service_version: z.string().nullable(),
  driver_version: z.string().nullable(),
  features: z.array(z.string()),
  lease: machineLease,
});
export const machineOperation = z.strictObject({
  ...base,
  kind: z.literal("machine_operation"),
  machine_id: id,
  generation: z.int().positive(),
  agent_id: id.nullable(),
  thread_id: id.nullable(),
  run_id: id.nullable(),
  name: z.string().max(100),
  fingerprint: z.string(),
  resource: z.string().nullable().default(null),
  expected_sha256: z.string().nullable().default(null),
  reconciled_at: z.iso.datetime().nullable().default(null),
  state: z.enum(["dispatched", "succeeded", "failed", "unknown"]),
  result: z.unknown(),
  error_code: z.string().nullable(),
});
export const machineProcess = z.strictObject({
  ...base,
  kind: z.literal("machine_process"),
  machine_id: id,
  generation: z.int().positive(),
  agent_id: id,
  thread_id: id,
  run_id: id,
  tag: z.string(),
  state: z.enum(["starting", "running", "exited", "unknown"]),
  pid: z.int().positive().nullable(),
  stdout: z.string().max(131_072),
  stderr: z.string().max(131_072),
  output_truncated: z.boolean(),
  output_offset: z.string().regex(/^\d+$/).default("0"),
  exit_code: z.int().nullable(),
  exit_signal: z.string().nullable(),
  lost: z.boolean(),
});
export const machineTarget = z.strictObject({
  ...base,
  kind: z.literal("machine_target"),
  machine_id: id,
  generation: z.int().positive(),
  agent_id: id,
  run_id: id,
  target_id: z.string(),
  tab_id: z.string().nullable(),
  active: z.boolean(),
});
export const machineWindow = z.strictObject({
  ...base,
  kind: z.literal("machine_window"),
  machine_id: id,
  generation: z.int().positive(),
  agent_id: id,
  thread_id: id,
  run_id: id,
  task_key: id,
  application: z.enum(["browser", "terminal"]),
  native_ref: z.strictObject({ id: z.string(), epoch: z.string() }).nullable(),
  pid: z.int().positive().nullable(),
  keep_open: z.boolean(),
  state: z.enum(["opening", "open", "closing", "closed", "blocked", "unknown"]),
  close_operation_id: id,
  error_code: z.string().nullable(),
});
export const machineWindowInput = z
  .strictObject({
    operation: z.enum(["open_browser", "open_terminal", "retain", "list"]),
    command_id: id.optional(),
    url: z
      .string()
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
      .optional(),
    keep_open: z.boolean().default(false),
    resource_id: id.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.operation !== "list" && !data.command_id)
      ctx.addIssue({
        code: "custom",
        path: ["command_id"],
        message: "A command ID is required for a mutation.",
      });
    if ((data.operation === "open_browser") !== (data.url !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "A URL is required only for open_browser.",
      });
    if ((data.operation === "retain") !== (data.resource_id !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["resource_id"],
        message: "A resource ID is required only for retain.",
      });
  });
export const machineCommand = z.strictObject({
  command_id: id,
  command: z.string().min(1).max(32_000),
  cwd: relativePath.optional(),
  pty: z.boolean().default(false),
  timeout_ms: z.int().min(1000).max(86_400_000).default(120_000),
  wait_ms: z.int().min(0).max(10_000).default(1000),
});
export const machineProcessInput = z.strictObject({
  command_id: id,
  process_id: id,
  operation: z.enum(["read", "input", "interrupt", "terminate"]),
  text: z.string().max(16_000).default(""),
  wait_ms: z.int().min(0).max(10_000).default(0),
});
export const computerCall = z.strictObject({
  command_id: id,
  name: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).default({}),
});
export const machineControl = z.strictObject({
  command_id: id,
  operation: z.enum(["acquire", "release", "reconcile"]),
  expected_revision: z.int().nonnegative(),
});
export const machineWrite = z.strictObject({
  command_id: id,
  path: relativePath,
  text: z.string().max(100_000),
  expected_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
