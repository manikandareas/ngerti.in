import { FileText } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFiles } from "@/features/diagnostics/hooks/use-files";
import type { StoredObject } from "@/features/diagnostics/types";
import { FileUploadForm } from "./file-upload-form";
import { StoredFileRow } from "./stored-file-row";

export function FilePanel() {
  const { input, file, setFile, files, upload, remove, download, selectExample } = useFiles();
  const [deleteTarget, setDeleteTarget] = useState<StoredObject | null>(null);
  const error = upload.error || remove.error || download.error || files.error;
  return (
    <section className="min-w-0 rounded-2xl border bg-card px-5 pb-3 [&>div:first-child]:px-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2">
        <h2>
          <FileText size={18} />
          File milik akunmu
        </h2>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Coba upload, unduh dengan signed URL, lalu hapus. File dan artifact hanya terlihat oleh
        pemiliknya.
      </p>
      <FileUploadForm
        inputRef={input}
        file={file}
        uploading={upload.isPending}
        onFileChange={setFile}
        onSelectExample={selectExample}
        onUpload={() => upload.mutate()}
      />
      {error ? (
        <p className="my-6 rounded-xl bg-danger-subtle px-5 py-4 text-sm text-danger" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="file-list" aria-live="polite">
        {files.data?.length ? (
          files.data.map((item) => (
            <StoredFileRow
              key={item.id}
              item={item}
              downloading={download.isPending}
              removing={remove.isPending}
              onDownload={(id) => download.mutate(id)}
              onDelete={setDeleteTarget}
            />
          ))
        ) : (
          <p className="border-t py-6 text-[13px] text-muted-foreground">
            File yang kamu upload dan hasil pekerjaan akan muncul di sini.
          </p>
        )}
      </div>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus file ini?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">
              {deleteTarget?.filename} akan dihapus dari penyimpanan akunmu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget.id);
              }}
            >
              Hapus file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
