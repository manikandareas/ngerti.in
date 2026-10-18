import { Download, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoredObject } from "@/features/diagnostics/types";

interface StoredFileRowProps {
  item: StoredObject;
  downloading: boolean;
  removing: boolean;
  onDownload: (id: string) => void;
  onDelete: (file: StoredObject) => void;
}

export function StoredFileRow({
  item,
  downloading,
  removing,
  onDownload,
  onDelete,
}: StoredFileRowProps) {
  return (
    <article className="flex items-center gap-3 border-t py-4">
      <FileText size={20} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] [&>span]:text-xs [&>span]:text-muted-foreground [&_strong]:truncate">
        <strong title={item.filename}>{item.filename}</strong>
        <span>{item.size < 1024 ? `${item.size} B` : `${(item.size / 1024).toFixed(1)} KB`}</span>
      </div>
      <Button
        variant="outline"
        size="icon"
        type="button"
        aria-label={`Unduh ${item.filename}`}
        disabled={downloading}
        onClick={() => onDownload(item.id)}
      >
        <Download size={17} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-danger"
        type="button"
        aria-label={`Hapus ${item.filename}`}
        disabled={removing}
        onClick={() => {
          onDelete(item);
        }}
      >
        <Trash2 size={17} />
      </Button>
    </article>
  );
}
