import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";

export const PARSER_VERSION = "pdfjs-6.5.438-text-1";
const extracted = z.strictObject({
  source_sha256: z.string().length(64),
  parser_version: z.literal(PARSER_VERSION),
  page_count: z.int().nonnegative(),
  pages: z
    .array(z.strictObject({ number: z.int().positive(), text: z.string().max(800_000) }))
    .max(300),
  truncated: z.boolean(),
  error_code: z
    .enum(["UNSUPPORTED_FORMAT", "NO_TEXT", "INVALID_DOCUMENT", "EXTRACTION_LIMIT"])
    .nullable(),
});
export type ExtractedDocument = z.infer<typeof extracted>;
const workerResult = extracted.omit({
  source_sha256: true,
  parser_version: true,
  error_code: true,
});
let active = 0;
const waiting: (() => void)[] = [];
const flights = new Map<string, Promise<ExtractedDocument>>();

async function parsePdf(bytes: Uint8Array, range?: { start_page: number; end_page: number }) {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  const child = Bun.spawn(
    [Bun.which("bun") ?? "bun", new URL("./extract.ts", import.meta.url).pathname],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: {
        PATH: globalThis.process.env.PATH ?? "",
        ...(globalThis.process.env.TMPDIR ? { TMPDIR: globalThis.process.env.TMPDIR } : {}),
      },
    },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 15_000);
  try {
    child.stdin.write(
      JSON.stringify({ content_base64: Buffer.from(bytes).toString("base64"), ...range }),
    );
    child.stdin.end();
    const reader = child.stdout.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > 2_000_000) {
          child.kill();
          throw new Error("EXTRACTION_LIMIT");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const code = await child.exited;
    if (timedOut || code !== 0) throw new Error("EXTRACTION_LIMIT");
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof result === "object" && result && "error_code" in result)
      throw new Error("INVALID_DOCUMENT");
    return workerResult.parse(result);
  } finally {
    clearTimeout(timer);
    child.kill();
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/** Immutable source bytes are revalidated before cached text is returned to any caller. */
export class AttachmentDocuments {
  readonly artifacts: Artifacts;
  readonly root: string;
  constructor(readonly lifecycle: Lifecycle) {
    this.artifacts = new Artifacts(lifecycle);
    this.root = join(this.artifacts.workspaces.root, "attachment-text");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }
  status(artifact: Entity<"artifact">) {
    return (
      this.lifecycle.store
        .list("attachment_document")
        .find(
          (item) =>
            item.artifact_id === artifact.id &&
            item.source_sha256 === artifact.sha256 &&
            item.parser_version === PARSER_VERSION,
        ) ?? null
    );
  }
  private path(item: Entity<"artifact">) {
    return join(this.root, `${item.id}-${item.sha256}-${PARSER_VERSION}.json`);
  }
  async prepare(item: Entity<"artifact">, authorize: () => void): Promise<ExtractedDocument> {
    authorize();
    if (!item.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
    const { bytes } = this.artifacts.download(item.id, item.workspace_id);
    const key = this.path(item);
    let result: ExtractedDocument;
    try {
      result = extracted.parse(
        JSON.parse(
          readFileSync(key, { encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW }),
        ),
      );
      if (result.source_sha256 !== item.sha256) throw new DomainError("CONFLICT");
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof SyntaxError) &&
        !(error instanceof z.ZodError)
      )
        throw error;
      let pending = flights.get(key);
      if (!pending) {
        pending = this.extract(item, bytes);
        flights.set(key, pending);
        void pending.finally(() => flights.delete(key)).catch(() => {});
      }
      result = await pending;
      authorize();
      const temporary = `${key}.${crypto.randomUUID()}.tmp`;
      const handle = openSync(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeFileSync(handle, JSON.stringify(result));
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      renameSync(temporary, key);
    }
    authorize();
    this.artifacts.download(item.id, item.workspace_id);
    const previous = this.lifecycle.store.list("attachment_document").find((d) => d.id === item.id);
    if (
      !previous ||
      previous.source_sha256 !== item.sha256 ||
      previous.parser_version !== PARSER_VERSION
    ) {
      const now = new Date().toISOString();
      this.lifecycle.store.put(
        {
          id: item.id,
          kind: "attachment_document",
          owner_id: item.owner_id,
          revision: (previous?.revision ?? 0) + 1,
          created_at: previous?.created_at ?? now,
          updated_at: now,
          artifact_id: item.id,
          thread_id: item.thread_id,
          agent_id: item.agent_id,
          workspace_id: item.workspace_id,
          source_sha256: item.sha256,
          parser_version: PARSER_VERSION,
          state:
            result.error_code === "UNSUPPORTED_FORMAT"
              ? "unsupported"
              : result.error_code === "NO_TEXT"
                ? "empty"
                : result.error_code
                  ? "failed"
                  : result.truncated
                    ? "partial"
                    : "ready",
          page_count: result.page_count,
          extracted_pages: result.pages.map((p) => p.number),
          error_code: result.error_code,
        },
        previous?.revision ?? null,
      );
    }
    return result;
  }
  private async extract(item: Entity<"artifact">, bytes: Uint8Array): Promise<ExtractedDocument> {
    const base = {
      source_sha256: item.sha256,
      parser_version: PARSER_VERSION as typeof PARSER_VERSION,
      page_count: 0,
      pages: [],
      truncated: false,
    };
    const pdf = item.media_type === "application/pdf" || /\.pdf$/i.test(item.name);
    const text = item.media_type.startsWith("text/") || /\.(txt|md|markdown|csv)$/i.test(item.name);
    if (!pdf && !text) return { ...base, error_code: "UNSUPPORTED_FORMAT" };
    try {
      const content = pdf
        ? await parsePdf(bytes)
        : {
            page_count: 1,
            pages: [
              {
                number: 1,
                text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).slice(0, 800_000),
              },
            ],
            truncated: bytes.length > 800_000,
          };
      return {
        ...base,
        ...content,
        error_code: content.pages.some((p) => p.text.trim()) ? null : "NO_TEXT",
      };
    } catch (error) {
      return {
        ...base,
        error_code:
          error instanceof Error && error.message === "EXTRACTION_LIMIT"
            ? "EXTRACTION_LIMIT"
            : "INVALID_DOCUMENT",
      };
    }
  }
  async range(
    item: Entity<"artifact">,
    document: ExtractedDocument,
    start: number,
    end: number,
    authorize: () => void,
  ) {
    if (end > document.page_count || start > end) throw new DomainError("INVALID_REQUEST", 422);
    const pages = document.pages.filter((page) => page.number >= start && page.number <= end);
    if (pages.length === end - start + 1) return { pages, truncated: document.truncated };
    authorize();
    if (!item.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
    const result = await parsePdf(this.artifacts.download(item.id, item.workspace_id).bytes, {
      start_page: start,
      end_page: end,
    });
    authorize();
    return result;
  }
}
