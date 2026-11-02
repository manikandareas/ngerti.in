import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { attachmentIssue } from "@/features/conversation/components/attach-input";
import type { ComposerInputHandle } from "@/features/conversation/components/composer-input";
import type { Artifact } from "@/types/work";
import type { Connection, Snapshot } from "@/types/workspace";
import {
  attachmentParts,
  attachmentReference,
  type ComposerAttachment,
  uploadedAttachment,
} from "./attachment-references";
import { referenceTarget } from "./inline-references";
import type { MessageSubmission } from "./message-submission";

interface Options {
  threadId: string | null;
  snapshot: Snapshot | null;
  connection?: Connection;
  connections: Connection[];
  draft: string;
  pending?: MessageSubmission | null;
  input: RefObject<ComposerInputHandle | null>;
  disabled: boolean;
  report: (message: string) => void;
  attached: () => void;
}

export function useComposerAttachments(options: Options) {
  const [entries, setEntries] = useState<Record<string, ComposerAttachment>>({});
  const entriesRef = useRef(entries);
  const latest = useRef(options);
  latest.current = options;
  const urls = useRef(new Map<string, string>());
  const entryScope = useRef(options.threadId);
  const update = useCallback((id: string, entry: ComposerAttachment) => {
    entriesRef.current = { ...entriesRef.current, [id]: entry };
    setEntries(entriesRef.current);
  }, []);
  const restore = useCallback(
    (operation: MessageSubmission) => {
      if (operation.body.thread_id !== latest.current.threadId) return;
      for (const source of operation.files) {
        let previewUrl = urls.current.get(source.id);
        if (!previewUrl && source.file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(source.file);
          urls.current.set(source.id, previewUrl);
        }
        update(source.id, {
          id: source.id,
          name: source.file.name,
          mediaType: source.file.type || "application/octet-stream",
          size: source.file.size,
          state: "local",
          file: source.file,
          previewUrl,
        });
      }
    },
    [update],
  );
  useEffect(() => {
    entryScope.current = options.threadId;
    entriesRef.current = {};
    setEntries({});
    const previews = urls.current;
    return () => {
      for (const url of previews.values()) URL.revokeObjectURL(url);
      previews.clear();
    };
  }, [options.threadId]);
  useEffect(() => {
    if (options.pending) restore(options.pending);
  }, [options.pending, restore]);
  useEffect(() => {
    const retained = new Set(
      attachmentParts(options.draft).flatMap((part) => ("id" in part ? [part.id] : [])),
    );
    let changed = false;
    const next = { ...entriesRef.current };
    for (const [id, url] of urls.current)
      if (!retained.has(id)) {
        URL.revokeObjectURL(url);
        urls.current.delete(id);
        if (next[id]) next[id] = { ...next[id], previewUrl: undefined };
        changed = true;
      }
    for (const id of retained) {
      const file = next[id]?.file;
      if (!file?.type.startsWith("image/") || urls.current.has(id)) continue;
      const previewUrl = URL.createObjectURL(file);
      urls.current.set(id, previewUrl);
      next[id] = { ...next[id], previewUrl };
      changed = true;
    }
    if (!changed) return;
    entriesRef.current = next;
    setEntries(next);
  }, [options.draft]);

  function lookup(id: string): ComposerAttachment | undefined {
    if (entryScope.current !== latest.current.threadId) return undefined;
    const entry = entriesRef.current[id];
    if (entry) return entry;
    const artifact = latest.current.snapshot?.artifacts.find(
      (file) => file.id === id && file.thread_id === latest.current.threadId,
    );
    if (artifact)
      return uploadedAttachment(
        artifact,
        latest.current.snapshot?.attachment_documents?.find((d) => d.artifact_id === id),
      );
    const source = latest.current.pending?.files.find((file) => file.id === id);
    return source
      ? {
          id,
          name: source.file.name,
          mediaType: source.file.type,
          size: source.file.size,
          state: "local",
          file: source.file,
        }
      : undefined;
  }
  function referenced(text: string) {
    const seen = new Set<string>();
    return attachmentParts(text).flatMap((part) => {
      if (!("id" in part) || seen.has(part.id)) return [];
      seen.add(part.id);
      const file = lookup(part.id);
      return file ? [file] : [];
    });
  }
  function issue(mediaType: string) {
    const current = latest.current;
    if (current.snapshot?.thread.type === "group" && mediaType.startsWith("image/")) {
      const mention = /^@([a-z][a-z0-9_-]{0,63})(?=\s|$)/u.exec(current.draft.trimStart());
      const target = referenceTarget(current.draft);
      const candidates = current.snapshot.agents.filter((a) =>
        target ? a.id === target : !mention || a.handle === mention[1],
      );
      return candidates.some(
        (a) =>
          !attachmentIssue(
            mediaType,
            current.connections.find((c) => c.id === a.connection_id),
            a.model_id,
          ),
      )
        ? null
        : "Belum ada anggota yang dituju dengan koneksi dan model yang mendukung gambar ini.";
    }
    return attachmentIssue(mediaType, current.connection, current.snapshot?.agents[0]?.model_id);
  }
  function allowed(mediaType: string, count: number, images: number) {
    const current = latest.current;
    const problem = issue(mediaType);
    if (problem || count >= 20 || (mediaType.startsWith("image/") && images >= 4)) {
      current.report(problem ?? "Batas lampiran pesan tercapai (20 file atau 4 gambar).");
      return false;
    }
    return true;
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
        state: "local",
        file,
        previewUrl,
      };
      update(id, entry);
      added.push(entry);
      count++;
      if (file.type.startsWith("image/")) images++;
    }
    if (added.length) {
      current.input.current?.insertAttachments(added);
      current.attached();
    }
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
        active.filter((f) => f.mediaType.startsWith("image/")).length,
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
    const sources: { id: string; file: File }[] = [];
    const body = attachmentParts(text)
      .map((part) => {
        if ("text" in part) return part.text;
        const file = lookup(part.id);
        if (!file || (!file.artifact && !file.file))
          throw new Error("Lampiran belum tersedia. Pilih ulang file tersebut.");
        const problem = issue(file.mediaType);
        if (problem) throw new Error(problem);
        const id = file.artifact?.id ?? file.id;
        if (!ids.has(id) && file.file) sources.push({ id, file: file.file });
        ids.add(id);
        return attachmentReference(id, file.name);
      })
      .join("");
    return { text: body, artifact_ids: [...ids], sources };
  }
  function progress(scope: string, id: string, state: "uploading" | "ready" | "failed") {
    if (scope !== latest.current.threadId) return;
    const entry = lookup(id);
    if (entry) update(id, { ...entry, state });
  }
  return {
    lookup,
    referenced,
    addFiles,
    attachArtifact,
    message,
    restore,
    progress,
    retry: (id: string) => {
      const file = lookup(id);
      if (file) update(id, { ...file, state: "local", error: undefined });
    },
  };
}
