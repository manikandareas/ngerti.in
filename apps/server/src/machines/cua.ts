import { createHash } from "node:crypto";
import { posix } from "node:path";
import {
  embedded,
  type FileEntry,
  type SpacesdClientLike,
  SpacesdCommand,
  UploadOptions,
} from "@trycua/cua";
import { z } from "zod";
import { DomainError } from "../contracts/errors";
import { MAX_FILE_BYTES, relativePath } from "../workspaces/contracts";
import type { MachineConfiguration } from "./config";

export const driverTool = z.object({
  name: z.string(),
  description: z.string().default(""),
  inputSchemaJson: z.string(),
  readOnly: z.boolean().default(false),
  destructive: z.boolean().default(false),
});
export type DriverTool = z.infer<typeof driverTool>;
export const driverResult = z.object({
  content: z
    .array(
      z.object({
        text: z.string().optional(),
        json: z.string().optional(),
        image: z.object({ data: z.string(), mimeType: z.string() }).optional(),
      }),
    )
    .default([]),
  structuredJson: z.string().optional(),
  isError: z.boolean().default(false),
});
export type DriverResult = z.infer<typeof driverResult>;
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Native Cua protocols, with one retained endpoint and bounded working-file access. */
export class CuaMachine {
  #client: Promise<SpacesdClientLike> | undefined;
  constructor(readonly configuration: MachineConfiguration) {}

  client() {
    this.#client ??= embedded()
      .spacesd(this.configuration.endpoint, this.configuration.token)
      .catch((error) => {
        this.#client = undefined;
        throw error;
      });
    return this.#client;
  }
  async rpc(
    method: string,
    input: unknown = {},
    signal = AbortSignal.timeout(20_000),
  ): Promise<unknown> {
    const client = await this.client();
    return JSON.parse(await client.callJson(method, JSON.stringify(input), undefined, { signal }));
  }
  async tools() {
    return z
      .object({ contractVersion: z.string(), tools: z.array(driverTool) })
      .parse(await this.rpc("DriverService/ListTools"));
  }
  async call(tool: string, args: unknown, signal = AbortSignal.timeout(30_000)) {
    return driverResult.parse(
      await this.rpc(
        "DriverService/CallTool",
        { name: tool, argumentsJson: JSON.stringify(args), timeout: "25s" },
        signal,
      ),
    );
  }
  files() {
    return new MachineFiles(this);
  }
  async spawn(
    command: string,
    options: { cwd?: string; requestId: string; tag: string; pty?: boolean; timeoutMs?: number },
  ) {
    const client = await this.client();
    return client.spawn(
      SpacesdCommand.create({
        program: "/bin/bash",
        args: ["-lc", command],
        cwd: options.cwd ?? this.configuration.root,
        requestId: options.requestId,
        tag: options.tag,
        timeoutMs: options.timeoutMs,
        stdin: options.pty ?? false,
        pty: options.pty ? { cols: 120, rows: 30 } : undefined,
        scrollbackBytes: 131_072n,
        killOnDisconnect: false,
      }),
      { signal: AbortSignal.timeout(20_000) },
    );
  }
}

/** Machine-authorized agents share these bytes; paths do not establish private OS lanes. */
export class MachineFiles {
  constructor(readonly machine: CuaMachine) {}
  path(relative: string) {
    relativePath.parse(relative);
    return posix.join(this.machine.configuration.root, relative);
  }
  private async inspect(relative: string, allowMissing = false): Promise<FileEntry | null> {
    const client = await this.machine.client();
    const root = this.machine.configuration.root;
    const parts = relative ? relativePath.parse(relative).split("/") : [];
    let path: string = root;
    let entry: FileEntry | null = null;
    for (let index = -1; index < parts.length; index++) {
      if (index >= 0) path = posix.join(path, parts[index] as string);
      try {
        entry = await client.stat(path, undefined, undefined, true, {
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        if (allowMissing && /not.?found|no such file/i.test(String(error))) return null;
        if (/not.?found|no such file/i.test(String(error))) throw new DomainError("NOT_FOUND", 404);
        throw new DomainError("MACHINE_UNAVAILABLE", 503);
      }
      if (entry.kind === "symlink" || (index < parts.length - 1 && entry.kind !== "directory"))
        throw new DomainError("SCOPE_DENIED", 403);
    }
    return entry;
  }
  async read(relative: string): Promise<Buffer<ArrayBuffer>> {
    const path = this.path(relative);
    const before = await this.inspect(relative);
    if (before?.kind !== "file" || before.size > BigInt(MAX_FILE_BYTES))
      throw new DomainError("SCOPE_DENIED", 403);
    const client = await this.machine.client();
    const download = await client.openDownload(path, 65_536, undefined);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await download.nextChunk({ signal: AbortSignal.timeout(20_000) });
        if (!chunk) break;
        size += chunk.byteLength;
        if (size > MAX_FILE_BYTES) throw new DomainError("INVALID_REQUEST", 413);
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      download.cancel();
    }
    const after = await this.inspect(relative);
    if (
      !after ||
      before.size !== after.size ||
      before.modifiedMs !== after.modifiedMs ||
      BigInt(size) !== after.size
    )
      throw new DomainError("CONFLICT");
    return Buffer.concat(chunks, size);
  }
  async create(relative: string, bytes: Uint8Array) {
    await this.write(relative, bytes, true);
  }
  async write(relative: string, bytes: Uint8Array, createNew = false) {
    if (bytes.length > MAX_FILE_BYTES) throw new DomainError("INVALID_REQUEST", 413);
    const path = this.path(relative);
    await this.inspect(relative, true);
    const client = await this.machine.client();
    try {
      await client.upload(
        path,
        Uint8Array.from(bytes).buffer,
        UploadOptions.create({ createNew, createParents: true, permissions: 0o600 }),
        { signal: AbortSignal.timeout(30_000) },
      );
    } catch (error) {
      if (/already.?exists|file exists/i.test(String(error))) throw new DomainError("CONFLICT");
      throw error;
    }
    if (sha256(await this.read(relative)) !== sha256(bytes)) throw new DomainError("CONFLICT");
  }
  async list(relative: string, after = "", limit = 200) {
    await this.inspect(relative);
    const client = await this.machine.client();
    const root = relative ? this.path(relative) : this.machine.configuration.root;
    const entries = (await client.listDir(root, 1, undefined, undefined))
      .filter(
        (entry) =>
          entry.path !== root &&
          entry.name > after &&
          relativePath.safeParse(entry.name).success &&
          entry.kind !== "symlink",
      )
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const page = entries.slice(0, limit).map((entry) => ({
      name: entry.name,
      path: relative ? `${relative}/${entry.name}` : entry.name,
      type:
        entry.kind === "directory" ? "directory" : entry.kind === "file" ? "file" : "unsupported",
      size_bytes: Number(entry.size),
    }));
    return {
      entries: page,
      next_after: entries.length > limit ? (page.at(-1)?.name ?? null) : null,
    };
  }
}
