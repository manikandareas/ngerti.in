import { useAuth } from "@clerk/tanstack-react-start";
import { Mic, Paperclip, Square } from "lucide-react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { command, submit } from "./client";
import type { Artifact } from "./state";

export type UploadHandle = { upload: (file: File) => Promise<void> };

export function FileUpload({
  threadId,
  disabled,
  onReady,
  onTranscript,
  uploadRef,
  compact = false,
}: {
  threadId: string;
  disabled: boolean;
  onReady: (file: Artifact) => void;
  onTranscript?: (text: string, artifactId: string) => void;
  uploadRef?: Ref<UploadHandle>;
  compact?: boolean;
}) {
  const { getToken, userId } = useAuth();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const micLock = useRef(false);
  const alive = useRef(true);
  const discard = useRef(false);
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      discard.current = true;
      recorder.current?.stream.getTracks().forEach((track) => {
        track.stop();
      });
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (micLock.current) return;
    micLock.current = true;
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("Rekaman suara tidak tersedia pada browser ini.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recordingStream = stream;
      if (!alive.current) {
        recordingStream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      const device = new MediaRecorder(stream);
      recorder.current = device;
      discard.current = false;
      const chunks: Blob[] = [];
      device.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const timer = setTimeout(() => {
        if (device.state === "recording") device.stop();
      }, 600000);
      device.onstop = () => {
        clearTimeout(timer);
        recordingStream.getTracks().forEach((track) => {
          track.stop();
        });
        if (!alive.current) return;
        setRecording(false);
        if (!discard.current) {
          const mime = device.mimeType.split(";")[0] || "audio/webm";
          const extension = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
          void upload(new File(chunks, `voice-${Date.now()}.${extension}`, { type: mime }));
        }
      };
      device.onerror = () => {
        discard.current = true;
        device.stop();
        setError("Rekaman terhenti. Kamu tetap bisa mengetik pesan.");
      };
      device.start();
      setError("");
      setRecording(true);
    } catch {
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      setError(
        "Mikrofon belum dapat digunakan. Izinkan akses mikrofon atau lanjutkan dengan teks.",
      );
    } finally {
      micLock.current = false;
    }
  }
  async function upload(file: File) {
    if (lock.current || disabled) return;
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
      if (!alive.current) return;
      onReady(ready);
      if (file.type.startsWith("audio/") && onTranscript) {
        setProgress("Mentranskripsikan suara…");
        const result = await submit<{ success?: boolean; transcript?: string; error?: string }>(
          command("media.transcribe", {
            artifact_id: ready.artifact_id,
            thread_id: threadId,
            request_key: identity,
          }),
          token,
        );
        if (alive.current && result.success && result.transcript)
          onTranscript(result.transcript, ready.artifact_id);
        else if (alive.current)
          setError(
            "Transkripsi belum tersedia. Rekaman tetap tersimpan sebagai lampiran; kamu bisa mengetik pesan.",
          );
      }
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
  useImperativeHandle(uploadRef, () => ({ upload }));
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Pilih lampiran"
        disabled={disabled || !!progress || recording}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact && !progress ? "icon" : "sm"}
        disabled={disabled || !!progress || recording}
        aria-label={progress ?? "Lampirkan file"}
        title={progress ?? "Lampirkan file"}
        onClick={() => input.current?.click()}
      >
        {compact && !progress ? <Paperclip className="size-4" /> : (progress ?? "Lampirkan file")}
      </Button>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        disabled={disabled || !!progress}
        aria-label={recording ? "Selesai rekam" : "Rekam suara"}
        title={recording ? "Selesai rekam" : "Rekam suara"}
        onClick={() => void record()}
      >
        {compact ? (
          recording ? (
            <Square className="size-4" />
          ) : (
            <Mic className="size-4" />
          )
        ) : recording ? (
          "Selesai rekam"
        ) : (
          "Rekam suara"
        )}
      </Button>
      {recording && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            discard.current = true;
            recorder.current?.stop();
          }}
        >
          Batal rekam
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
