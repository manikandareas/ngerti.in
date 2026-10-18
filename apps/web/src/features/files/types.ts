export interface FileRevision {
  id: string;
  file_id: string;
  revision: number;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  page_count: number;
  status: "uploading" | "ready" | "failed" | "deleted";
  source: "upload" | "result";
}

export interface ProductFile {
  id: string;
  current_revision: number;
  revisions: FileRevision[];
}

export interface UploadedFile extends ProductFile {
  uploaded_revision_id: string;
}

export interface Attachment {
  file: FileRevision;
  start: number;
  end: number | null;
}

export interface FileInput {
  revision_id: string;
  start: number;
  end: number | null;
}

export interface OutputSpec {
  filename: string;
  format: "md" | "txt" | "csv" | "json" | "html";
}

export interface ResultFile {
  revision_id: string;
  file_id: string;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
}

export interface ResultManifest {
  previous_result?: { result_id: string; revision: number };
  summary: string;
  task_id: string;
  task_revision: number;
  files: ResultFile[];
  inputs: Array<{
    revision_id: string;
    filename: string;
    revision: number;
    sha256: string;
    selection: { start: number; end: number | null; unit: "page" | "line" };
  }>;
}

export interface ProductResult {
  id: string;
  thread_id: string;
  active_task_id: string;
  status: "constructing" | "ready" | "updating" | "failed" | "interrupted";
  current_revision: number | null;
  revisions: Array<{ revision: number; status: string }>;
  selected: { revision: number; status: string; manifest: ResultManifest } | null;
}

export interface FileDraft {
  summary: string;
  files: Array<{ filename: string; content: string }>;
}

export function readFileDraft(value: string): FileDraft | null {
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed?.summary === "string" &&
      Array.isArray(parsed.files) &&
      parsed.files.every(
        (file: { filename?: unknown; content?: unknown }) =>
          typeof file?.filename === "string" && typeof file?.content === "string",
      )
    )
      return parsed;
  } catch {
    /* Streaming drafts may be incomplete. */
  }
  return null;
}

export const attachmentInputs = (items: Attachment[]): FileInput[] =>
  items.map(({ file, start, end }) => ({ revision_id: file.id, start, end }));

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
