import { z } from "zod";
import { base, id } from "../contracts/base";
import { uploadInput } from "../workspaces/contracts";

export const stagedUploadInput = uploadInput.extend({
  submission_id: id,
  thread_id: id,
  agent_id: id,
});
export const stagedUpload = z.strictObject({
  ...base,
  kind: z.literal("attachment_upload"),
  submission_id: id,
  thread_id: id,
  agent_id: id,
  name: uploadInput.shape.name,
  media_type: uploadInput.shape.media_type,
  size_bytes: z.int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["staged", "committed", "expired"]),
  expires_at: z.iso.datetime(),
});
export const documentState = z.enum(["ready", "partial", "empty", "unsupported", "failed"]);
export const attachmentDocument = z.strictObject({
  ...base,
  kind: z.literal("attachment_document"),
  artifact_id: id,
  thread_id: id,
  agent_id: id,
  workspace_id: id,
  source_sha256: z.string().length(64),
  parser_version: z.string(),
  state: documentState,
  page_count: z.int().nonnegative(),
  extracted_pages: z.array(z.int().positive()).max(300),
  error_code: z
    .enum(["UNSUPPORTED_FORMAT", "NO_TEXT", "INVALID_DOCUMENT", "EXTRACTION_LIMIT"])
    .nullable(),
});
export const attachmentObservation = z.strictObject({
  artifact_id: id,
  source_sha256: z.string().length(64),
  operation: z.enum(["context", "read", "search"]),
  pages: z.array(z.int().positive()).max(300),
  truncated: z.boolean(),
  created_at: z.iso.datetime(),
});
export const attachmentList = z.strictObject({
  after: id.optional(),
  limit: z.int().min(1).max(50).default(20),
});
export const attachmentRead = z
  .strictObject({
    artifact_id: id,
    start_page: z.int().min(1).max(100_000).default(1),
    end_page: z.int().min(1).max(100_000).optional(),
    offset: z.int().min(0).max(2_000_000).default(0),
    max_chars: z.int().min(100).max(30_000).default(12_000),
  })
  .refine(
    (v) =>
      v.end_page === undefined || (v.end_page >= v.start_page && v.end_page - v.start_page < 20),
    "Read at most twenty consecutive pages.",
  );
export const attachmentSearch = z.strictObject({
  artifact_id: id,
  query: z.string().trim().min(1).max(200),
  limit: z.int().min(1).max(30).default(10),
});
