import { useAuth } from "@clerk/tanstack-react-start";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { command, submit } from "./client";
import type { Artifact } from "./state";

export function FileUpload({
  threadId,
  disabled,
  onReady,
}: {
  threadId: string;
  disabled: boolean;
  onReady: (file: Artifact) => void;
}) {
  const { getToken, userId } = useAuth();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  async function upload(file: File) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setProgress("Menyiapkan file…");
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error("Ukuran file maksimal 32 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const sha256 = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
      const key = `nma-upload:v1:${userId}:${threadId}:${sha256}:${file.name}`;
      let identity: string = crypto.randomUUID();
      try {
        identity = sessionStorage.getItem(key) || identity;
        sessionStorage.setItem(key, identity);
      } catch {
        /* Uploads also deduplicate within this attempt. */
      }
      const token = await getToken();
      const begin = await submit<{ status: string }>(
        command("file.begin", {
          artifact_id: identity,
          thread_id: threadId,
          filename: file.name,
          media_type: /^[\w.+-]+\/[\w.+-]+$/.test(file.type)
            ? file.type
            : "application/octet-stream",
          sha256,
          byte_count: file.size,
        }),
        token,
      );
      if (begin.status !== "ready") {
        for (let offset = 0; offset < bytes.length; offset += 512 * 1024) {
          const part = bytes.subarray(offset, offset + 512 * 1024);
          let binary = "";
          for (const byte of part) binary += String.fromCharCode(byte);
          await submit(
            command("file.part", {
              artifact_id: identity,
              index: offset / (512 * 1024),
              data_base64: btoa(binary),
            }),
            token,
          );
          setProgress(
            `Mengunggah ${Math.round((Math.min(offset + part.length, bytes.length) / bytes.length) * 100)}%`,
          );
        }
      }
      const ready = await submit<Artifact>(
        command("file.finalize", { artifact_id: identity }),
        token,
      );
      onReady(ready);
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "Upload belum selesai."} Pilih file yang sama untuk melanjutkan.`,
      );
    } finally {
      lock.current = false;
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="space-y-1">
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Pilih lampiran"
        disabled={disabled || !!progress}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !!progress}
        onClick={() => input.current?.click()}
      >
        {progress ?? "Lampirkan file"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
