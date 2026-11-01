import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FileView = { name: string; url: string; mediaType?: string };
export function FileViewer({ file, close }: { file: FileView | null; close: () => void }) {
  const [content, setContent] = useState<{
    url: string;
    text?: string;
    image?: string;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!file) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    void fetch(file.url, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("File tidak dapat dibuka. Periksa akses folder dan coba lagi.");
        const blob = await response.blob();
        const raster =
          /^(image\/(png|jpeg|webp))$/.test(file.mediaType ?? "") ||
          /\.(png|jpe?g|webp)$/i.test(file.name);
        const text =
          file.mediaType?.startsWith("text/") ||
          /\.(txt|md|json|csv|log|ts|tsx|js|py|html|css|yaml|yml)$/i.test(file.name);
        if (abort.signal.aborted) return;
        if (raster) {
          objectUrl = URL.createObjectURL(blob);
          setContent({ url: file.url, image: objectUrl });
        } else if (text) {
          const value = await blob.slice(0, 128_000).text();
          if (!abort.signal.aborted)
            setContent({
              url: file.url,
              text:
                value +
                (blob.size > 128_000
                  ? "\n… Pratinjau dibatasi. Unduh untuk membaca seluruh file."
                  : ""),
            });
        } else
          setContent({
            url: file.url,
            text: "Pratinjau belum tersedia untuk format ini. Unduh file untuk membukanya.",
          });
      })
      .catch((e) => {
        if (!abort.signal.aborted) setContent({ url: file.url, error: e.message });
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  const view = content?.url === file?.url ? content : null;
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-all">{file?.name}</DialogTitle>
          <DialogDescription>File dari folder percakapan yang dipilih.</DialogDescription>
        </DialogHeader>
        {view?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {view.error}
          </p>
        ) : view?.image ? (
          <img
            src={view.image}
            alt={file?.name ?? "File"}
            className="max-h-[65svh] w-full object-contain"
          />
        ) : (
          <pre className="max-h-[60svh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">
            {view?.text ?? "Membuka file…"}
          </pre>
        )}
        <Button asChild variant="outline">
          <a href={file?.url} download={file?.name}>
            Unduh file
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
