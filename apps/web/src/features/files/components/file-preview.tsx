import { useAuth } from "@clerk/tanstack-react-start";
import { Download, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { downloadFile, fileContent } from "../api";
import { staticHtml } from "../static-html";
import type { ResultFile } from "../types";
import { fileSize } from "../types";
import { TextPreview } from "./text-preview";

export function FilePreview({ file }: { file: ResultFile }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const html = useMemo(
    () => (file.content_type === "text/html" ? staticHtml(body) : ""),
    [body, file.content_type],
  );
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl = "";
    setBody("");
    setImage("");
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const blob = await fileContent(file.revision_id, await getToken(), controller.signal);
        if (controller.signal.aborted) return;
        if (file.content_type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
        } else if (file.content_type !== "application/pdf") {
          const text = await blob.text();
          if (!controller.signal.aborted) setBody(text);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Preview gagal.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, file.revision_id, file.content_type, getToken]);

  async function download() {
    setDownloading(true);
    setError("");
    try {
      await downloadFile(file.revision_id, file.filename, await getToken());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download gagal.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border p-3">
        <div className="min-w-0 flex-1 basis-full wrap-anywhere min-[701px]:basis-0">
          <p className="text-sm font-medium">{file.filename}</p>
          <p className="text-xs text-muted-foreground">
            {fileSize(file.size)} · SHA-256 {file.sha256.slice(0, 12)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Eye /> Preview
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloading}
          onClick={() => void download()}
        >
          <Download /> Unduh
        </Button>
      </div>
      {error && !open ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
          <SheetHeader className="shrink-0 border-b pr-12">
            <SheetTitle className="wrap-anywhere">{file.filename}</SheetTitle>
            <SheetDescription>
              Preview file tersimpan. HTML ditampilkan terisolasi tanpa script atau jaringan
              eksternal.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {loading ? (
              <p role="status">Membuka file…</p>
            ) : error ? (
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : image ? (
              <img src={image} alt={`Isi ${file.filename}`} className="h-auto max-w-full" />
            ) : file.content_type === "text/html" ? (
              <iframe
                title={`Preview ${file.filename}`}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[70svh] w-full rounded-lg border bg-white"
                srcDoc={html}
              />
            ) : file.content_type === "application/pdf" ? (
              <p>Unduh PDF untuk membuka dokumen asli di pembaca PDF pilihanmu.</p>
            ) : (
              <TextPreview body={body} type={file.content_type} />
            )}
          </div>
          <div className="shrink-0 border-t p-4">
            <Button type="button" disabled={downloading} onClick={() => void download()}>
              <Download /> Unduh file
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
