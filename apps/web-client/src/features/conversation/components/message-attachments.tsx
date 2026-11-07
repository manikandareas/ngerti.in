import type { Artifact } from "@/types/work";
import { AssistantMessageAuthor } from "./assistant-message";
import { FileActionChip } from "./file-action-chip";
import { MessageTime } from "./message-time";

/** File-only replies retain message attribution and a clock without an empty text bubble. */
export function MessageAttachments({
  ids,
  files,
  at,
  standalone,
  author,
  open,
}: {
  ids: string[];
  files: Artifact[];
  at: string;
  standalone: boolean;
  author: string;
  open: (id: string) => void;
}) {
  if (!ids.length) return null;
  return (
    <div data-message-attachments className="flex w-fit min-w-0 max-w-full flex-col gap-1.5">
      {standalone && <AssistantMessageAuthor name={author} />}
      {ids.map((id) => {
        const file = files.find((file) => file.id === id);
        return (
          <FileActionChip
            key={id}
            name={file?.name ?? "Buka lampiran"}
            mediaType={file?.media_type}
            open={() => open(id)}
          />
        );
      })}
      {standalone && <MessageTime at={at} />}
    </div>
  );
}
