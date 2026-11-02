import { Fragment } from "react";
import {
  attachmentParts,
  uploadedAttachment,
} from "@/features/conversation/lib/attachment-references";
import type { Artifact } from "@/types/work";
import type { Message } from "@/types/workspace";
import { AttachmentChip } from "./attachment-chip";

export function UserMessageText({
  message,
  artifacts,
}: {
  message: Message;
  artifacts: Artifact[];
}) {
  return attachmentParts(message.text).map((part) => {
    if ("text" in part) return <Fragment key={`text-${part.offset}`}>{part.text}</Fragment>;
    const artifact = message.artifact_ids?.includes(part.id)
      ? artifacts.find((file) => file.id === part.id)
      : undefined;
    return artifact ? (
      <AttachmentChip key={`${part.id}-${part.offset}`} file={uploadedAttachment(artifact)} />
    ) : (
      <Fragment key={`reference-${part.offset}`}>{part.reference}</Fragment>
    );
  });
}
