import { Paperclip, Plus, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AttachmentsState } from "../hooks/use-attachments";
import { useFiles } from "../hooks/use-files";
import { fileSize } from "../types";

export function AttachmentPicker({
  state,
  disabled = false,
  compact = false,
}: {
  state: AttachmentsState;
  disabled?: boolean;
  compact?: boolean;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const files = useFiles(showFiles);
  return (
    <div className={compact ? "text-sm" : "space-y-2 text-sm"}>
      <div
        className={compact ? "absolute bottom-2 left-2 z-10" : "flex flex-wrap items-center gap-2"}
      >
        <input
          ref={upload}
          type="file"
          className="hidden"
          aria-label="Unggah lampiran"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.json"
          disabled={disabled || state.progress !== null}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void state.upload(file);
            event.target.value = "";
          }}
        />
        {compact ? (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Lampiran"
                disabled={disabled}
              >
                <Plus className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={disabled || state.progress !== null}
                onClick={() => upload.current?.click()}
              >
                Unggah file
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={disabled}
                onClick={() => {
                  setShowFiles(!showFiles);
                  setMenuOpen(false);
                }}
              >
                File tersimpan
              </Button>
            </PopoverContent>
          </Popover>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || state.progress !== null}
              onClick={() => upload.current?.click()}
            >
              <Paperclip /> Lampirkan file
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-expanded={showFiles}
              onClick={() => setShowFiles(!showFiles)}
            >
              File tersimpan
            </Button>
          </>
        )}
      </div>
      {state.progress !== null ? (
        <div className="flex items-center gap-3" role="status">
          <progress
            className="h-2 min-w-0 flex-1 accent-primary"
            max={100}
            value={state.progress}
            aria-label="Progres upload"
          />
          <span>{state.progress}%</span>
          <Button type="button" variant="ghost" size="sm" onClick={state.cancel}>
            Batalkan upload
          </Button>
        </div>
      ) : null}
      {showFiles ? (
        <div className="max-h-48 space-y-1 overflow-auto rounded-xl border bg-card p-2">
          {files.isLoading ? <p role="status">Memuat file…</p> : null}
          {files.isError ? (
            <Button type="button" variant="ghost" onClick={() => void files.refetch()}>
              Muat ulang file
            </Button>
          ) : null}
          {files.data?.files.length === 0 ? (
            <p className="p-2 text-muted-foreground">Belum ada file tersimpan.</p>
          ) : null}
          {files.data?.files.map((file) => (
            <div key={file.id} className="space-y-1">
              {file.revisions
                .filter((r) => r.status === "ready")
                .map((revision) => (
                  <Button
                    key={revision.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    disabled={disabled || state.items.some((v) => v.file.id === revision.id)}
                    onClick={() => {
                      state.add(revision);
                      setShowFiles(false);
                    }}
                  >
                    {revision.filename} · v{revision.revision} · {fileSize(revision.size)}
                  </Button>
                ))}
            </div>
          ))}
        </div>
      ) : null}
      {state.items.map(({ file, start, end }) => (
        <div key={file.id} className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 wrap-anywhere">
              <p>
                {file.filename}{" "}
                <span className="text-muted-foreground">
                  v{file.revision} · {fileSize(file.size)}
                </span>
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Lepas ${file.filename}`}
              onClick={() => state.remove(file.id)}
            >
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {file.content_type === "application/pdf" || file.content_type.startsWith("image/")
                ? "Halaman"
                : "Baris"}
            </span>
            <Input
              type="number"
              min={1}
              value={start}
              aria-label={`Awal ${file.filename}`}
              className="h-8 w-20"
              disabled={disabled}
              onChange={(event) =>
                state.select(file.id, Math.max(1, Number(event.target.value)), end)
              }
            />
            <span>sampai</span>
            <Input
              type="number"
              min={start}
              value={end ?? ""}
              placeholder="akhir"
              aria-label={`Akhir ${file.filename}`}
              className="h-8 w-20"
              disabled={disabled}
              onChange={(event) =>
                state.select(file.id, start, event.target.value ? Number(event.target.value) : null)
              }
            />
            <label className="cursor-pointer underline underline-offset-4">
              Unggah versi baru
              <input
                type="file"
                className="sr-only"
                disabled={disabled || state.progress !== null}
                accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.json"
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) void state.upload(next, file.file_id);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      ))}
      {state.error ? (
        <p role="alert" className="text-danger">
          {state.error}
          {state.canRetry ? (
            <Button type="button" variant="ghost" size="sm" onClick={state.retry}>
              <RefreshCw /> Coba upload lagi
            </Button>
          ) : null}
        </p>
      ) : null}
      {state.items.length || showFiles ? (
        <p className="text-xs text-muted-foreground">
          Maks. 10 MiB/file, 5 lampiran, total 25 MiB. PDF maks. 20 halaman/file dan 40 halaman
          OCR/task. OCR dimulai saat file digunakan.
        </p>
      ) : null}
    </div>
  );
}
