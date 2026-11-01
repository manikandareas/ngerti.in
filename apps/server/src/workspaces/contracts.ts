import { z } from "zod";
import { base, id } from "../contracts/base";

export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const relativePath = z
  .string()
  .min(1)
  .max(1000)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.startsWith("/") &&
      [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Use a workspace-relative path without traversal.",
  );
export const workspaceInput = z.strictObject({
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  name: z.string().trim().min(1).max(200).default("Workspace"),
  project_path: z.string().min(1).max(2000).nullable().default(null),
});
export const workspaceFields = {
  ...workspaceInput.shape,
  state: z.enum(["active", "revoked"]),
  root_device: z.string(),
  root_inode: z.string(),
};
export const uploadInput = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (v) =>
        !v.includes("/") &&
        !v.includes("\\") &&
        [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    )
    .refine((v) => v !== "." && v !== ".."),
  media_type: z
    .string()
    .max(200)
    .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/)
    .default("application/octet-stream"),
  content_base64: z
    .string()
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const publicationInput = z.strictObject({
  workspace_id: z.uuid(),
  path: relativePath,
  run_id: z.uuid(),
  media_type: uploadInput.shape.media_type,
});
export const artifactContentFields = {
  workspace_id: z.uuid().nullable().default(null),
  name: z.string().max(200).default("artifact"),
  size_bytes: z.int().min(0).max(MAX_FILE_BYTES).nullable().default(null),
  source_path: relativePath.nullable().default(null),
  origin: z.enum(["metadata", "upload", "native_output", "shared_copy"]).default("metadata"),
  source_artifact_id: z.uuid().nullable().default(null),
  native_session_id: z.string().max(1000).nullable().default(null),
  native_run_id: z.string().max(1000).nullable().default(null),
};
export const fileQuery = z.strictObject({
  path: z.string().max(1000).default(""),
  after: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const artifactInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  run_id: id.nullable().default(null),
  media_type: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storage_key: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(200),
});
export const artifact = artifactInput.extend({
  ...base,
  ...artifactContentFields,
  kind: z.literal("artifact"),
});
export const workspace = z.strictObject({
  ...base,
  ...workspaceFields,
  kind: z.literal("workspace"),
});
