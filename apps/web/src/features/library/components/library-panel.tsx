import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AttachmentPicker } from "@/features/files/components/attachment-picker";
import { useAttachments } from "@/features/files/hooks/use-attachments";
import { SearchPanel } from "./search-panel";
export function LibraryPanel() {
  const uploads = useAttachments("file-management");
  const client = useQueryClient();
  useEffect(() => {
    if (uploads.items.length) void client.invalidateQueries({ queryKey: ["library"] });
  }, [uploads.items.length, client]);
  return (
    <div className="space-y-6">
      <SearchPanel library />
      <details className="border-t pt-4">
        <summary className="cursor-pointer py-2 text-sm">Tambahkan file</summary>
        <div className="space-y-3 py-3">
          <p className="text-sm text-muted-foreground">
            Kamu juga dapat melampirkan file langsung dari chat.
          </p>
          <AttachmentPicker state={uploads} />
        </div>
      </details>
    </div>
  );
}
