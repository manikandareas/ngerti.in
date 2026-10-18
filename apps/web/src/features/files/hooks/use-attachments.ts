import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { uploadFile } from "../api";
import type { Attachment, FileRevision } from "../types";

export function useAttachments(scope: string) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const storageKey = `file-draft:${userId}:${scope}`;
  const [items, setItems] = useState<Attachment[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const retry = useRef<{ file: File; key: string; fileId?: string } | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      const values = Array.isArray(saved)
        ? saved
            .filter((v) => typeof v?.file?.id === "string" && typeof v.start === "number")
            .slice(0, 5)
        : [];
      setItems(values);
      itemsRef.current = values;
    } catch {
      setItems([]);
      itemsRef.current = [];
    }
    return () => abort.current?.abort();
  }, [storageKey]);

  function save(values: Attachment[]) {
    setItems(values);
    itemsRef.current = values;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      /* Optional draft storage. */
    }
  }

  function add(file: FileRevision) {
    if (itemsRef.current.some((item) => item.file.id === file.id)) return;
    if (itemsRef.current.length >= 5) return setError("Maksimal lima lampiran.");
    if (itemsRef.current.reduce((n, item) => n + item.file.size, file.size) > 25 * 1024 * 1024)
      return setError("Total lampiran maksimal 25 MiB.");
    save([...itemsRef.current, { file, start: 1, end: null }]);
  }

  async function upload(file: File, fileId?: string) {
    if (abort.current || !userId) return;
    if (!file.size || file.size > 10 * 1024 * 1024)
      return setError("Ukuran file harus 1 byte sampai 10 MiB.");
    if (!fileId && itemsRef.current.length >= 5) return setError("Maksimal lima lampiran.");
    const pending =
      retry.current?.file === file ? retry.current : { file, fileId, key: crypto.randomUUID() };
    retry.current = pending;
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    setError("");
    try {
      const result = await uploadFile(
        file,
        await getToken(),
        pending.key,
        setProgress,
        controller.signal,
        fileId,
      );
      const revision = result.revisions.find((value) => value.id === result.uploaded_revision_id);
      if (!revision) throw new Error("Revision upload belum ditemukan. Coba upload lagi.");
      if (fileId) save(itemsRef.current.filter((item) => item.file.file_id !== fileId));
      add(revision);
      retry.current = null;
      void client.invalidateQueries({ queryKey: ["files", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload belum selesai.");
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  return {
    items,
    progress,
    error,
    add,
    upload,
    clear: () => save([]),
    remove: (id: string) => save(itemsRef.current.filter((v) => v.file.id !== id)),
    select: (id: string, start: number, end: number | null) =>
      save(itemsRef.current.map((v) => (v.file.id === id ? { ...v, start, end } : v))),
    cancel: () => {
      retry.current = null;
      abort.current?.abort();
    },
    retry: () => {
      if (retry.current) void upload(retry.current.file, retry.current.fileId);
    },
    canRetry: Boolean(retry.current),
  };
}

export type AttachmentsState = ReturnType<typeof useAttachments>;
