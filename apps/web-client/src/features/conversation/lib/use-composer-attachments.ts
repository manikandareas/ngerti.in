import { type RefObject, useEffect, useRef, useState } from "react";
import { attachmentIssue } from "@/features/conversation/components/attach-input";
import type { ComposerInputHandle } from "@/features/conversation/components/composer-input";
import { ensureWorkspace, uploadFile } from "@/lib/workspace-files";
import type { Artifact, Workspace } from "@/types/work";
import type { Connection, Snapshot } from "@/types/workspace";
import {
  attachmentParts,
  attachmentReference,
  type ComposerAttachment,
  uploadedAttachment,
} from "./attachment-references";

interface Options {
  threadId: string | null;
  snapshot: Snapshot | null;
  connection?: Connection;
  draft: string;
  input: RefObject<ComposerInputHandle | null>;
  disabled: boolean;
  report: (message: string) => void;
  refresh: () => Promise<unknown>;
  attached: () => void;
}
type Upload = { file: File; key: string; controller?: AbortController; workspaceId?: string };

export function useComposerAttachments(options: Options) {
  const [entries, setEntries] = useState<Record<string, ComposerAttachment>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const latest = useRef(options);
  latest.current = options;
  const uploads = useRef(new Map<string, Upload>());
  const urls = useRef(new Map<string, string>());
  const workspace = useRef<Promise<Workspace> | null>(null);
  const entryScope = useRef(options.threadId);
  useEffect(() => {
    entryScope.current = options.threadId;
    setEntries({});
    entriesRef.current = {};
    workspace.current = null;
    const tasks = uploads.current;
    const previews = urls.current;
    return () => {
      for (const upload of tasks.values()) upload.controller?.abort();
      for (const url of previews.values()) URL.revokeObjectURL(url);
      tasks.clear();
      previews.clear();
    };
  }, [options.threadId]);

  function update(id: string, file: ComposerAttachment) {
    entriesRef.current = { ...entriesRef.current, [id]: file };
    setEntries(entriesRef.current);
  }
  function lookup(id: string): ComposerAttachment | undefined {
    if (entryScope.current !== latest.current.threadId) return undefined;
    const entry =
      entriesRef.current[id] ??
      Object.values(entriesRef.current).find((file) => file.artifact?.id === id);
    if (entry?.artifact && entry.artifact.thread_id !== latest.current.threadId) return undefined;
    if (entry) return entry;
    const artifact = latest.current.snapshot?.artifacts.find(
      (file) => file.id === id && file.thread_id === latest.current.threadId,
    );
    return artifact ? uploadedAttachment(artifact) : undefined;
  }
  function referenced(text: string) {
    const ids = new Set<string>();
    return attachmentParts(text).flatMap((part) => {
      if (!("id" in part) || ids.has(part.id)) return [];
      ids.add(part.id);
      const file = lookup(part.id);
      return file ? [file] : [];
    });
  }
  function allowed(mediaType: string, count: number, images: number) {
    const current = latest.current;
    const issue = attachmentIssue(
      mediaType,
      current.connection,
      current.snapshot?.agents[0]?.model_id,
    );
    if (issue || count >= 20 || (mediaType.startsWith("image/") && images >= 4)) {
      current.report(issue ?? "Batas lampiran pesan tercapai (20 file atau 4 gambar).");
      return false;
    }
    return true;
  }
  async function upload(id: string) {
    const source = uploads.current.get(id);
    const entry = entriesRef.current[id];
    const current = latest.current;
    const snapshot = current.snapshot;
    if (!source || !entry || !snapshot || current.disabled || source.controller) return;
    const scope = current.threadId;
    const controller = new AbortController();
    source.controller = controller;
    update(id, { ...entry, state: "uploading", error: undefined });
    try {
      if (!source.workspaceId) {
        const preparing =
          workspace.current ??
          ensureWorkspace(snapshot.agents[0].id, snapshot.thread.id, snapshot.workspaces);
        workspace.current = preparing;
        try {
          source.workspaceId = (await preparing).id;
        } catch (error) {
          if (workspace.current === preparing) workspace.current = null;
          throw error;
        }
      }
      controller.signal.throwIfAborted();
      const artifact = await uploadFile(source.workspaceId, source.file, {
        key: source.key,
        signal: controller.signal,
      });
      if (latest.current.threadId !== scope || controller.signal.aborted) return;
      update(id, { ...uploadedAttachment(artifact), id });
      const preview = urls.current.get(id);
      if (preview) URL.revokeObjectURL(preview);
      urls.current.delete(id);
      uploads.current.delete(id);
      void latest.current.refresh().catch(() => {});
    } catch (error) {
      if (latest.current.threadId !== scope || controller.signal.aborted) return;
      update(id, {
        ...entry,
        state: "failed",
        error: error instanceof Error ? error.message : "File belum terunggah.",
      });
    } finally {
      source.controller = undefined;
    }
  }
  function addFiles(files: File[]) {
    const current = latest.current;
    if (
      current.disabled ||
      !current.snapshot ||
      current.snapshot.thread.id !== current.threadId ||
      current.snapshot.thread.type === "group"
    )
      return;
    const active = referenced(current.draft);
    let count = active.length;
    let images = active.filter((file) => file.mediaType.startsWith("image/")).length;
    const added: ComposerAttachment[] = [];
    for (const file of files) {
      if (!allowed(file.type, count, images)) continue;
      if (file.size > 16 * 1024 * 1024) {
        current.report("Ukuran file maksimal 16 MB.");
        continue;
      }
      const id = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) urls.current.set(id, previewUrl);
      const entry: ComposerAttachment = {
        id,
        name: file.name,
        mediaType: file.type || "application/octet-stream",
        size: file.size,
        state: "uploading",
        previewUrl,
      };
      uploads.current.set(id, { file, key: crypto.randomUUID() });
      update(id, entry);
      added.push(entry);
      count++;
      if (file.type.startsWith("image/")) images++;
    }
    if (!added.length) return;
    current.input.current?.insertAttachments(added);
    current.attached();
    for (const file of added) void upload(file.id);
  }
  function attachArtifact(artifact: Artifact) {
    const current = latest.current;
    if (
      current.disabled ||
      artifact.thread_id !== current.threadId ||
      current.snapshot?.thread.type === "group"
    )
      return;
    const active = referenced(current.draft);
    if (
      !allowed(
        artifact.media_type,
        active.length,
        active.filter((file) => file.mediaType.startsWith("image/")).length,
      )
    )
      return;
    const entry = uploadedAttachment(artifact);
    update(entry.id, entry);
    current.input.current?.insertAttachments([entry]);
    current.attached();
  }
  function message(text: string) {
    const ids = new Set<string>();
    const body = attachmentParts(text)
      .map((part) => {
        if ("text" in part) return part.text;
        const file = lookup(part.id);
        if (!file) return part.reference;
        if (file.state !== "ready" || !file.artifact)
          throw new Error("Tunggu lampiran selesai diunggah atau hapus lampiran yang gagal.");
        ids.add(file.artifact.id);
        return attachmentReference(file.artifact.id, file.name);
      })
      .join("");
    return { text: body, artifact_ids: [...ids] };
  }
  return {
    lookup,
    referenced,
    addFiles,
    attachArtifact,
    message,
    retry: (id: string) => {
      void upload(id);
    },
  };
}
