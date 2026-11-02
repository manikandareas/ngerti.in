import { Fragment } from "react";
import {
  attachmentParts,
  uploadedAttachment,
} from "@/features/conversation/lib/attachment-references";
import { referenceTarget } from "@/features/conversation/lib/inline-references";
import type { Artifact, AttachmentDocument } from "@/types/work";
import type { Message } from "@/types/workspace";
import { AttachmentChip } from "./attachment-chip";
import { InlineReferenceText } from "./inline-references";

export function UserMessageText({
  message,
  artifacts,
  documents,
  preparing,
}: {
  message: Message;
  artifacts: Artifact[];
  documents?: AttachmentDocument[];
  preparing?: boolean;
}) {
  return attachmentParts(message.text).map((part) => {
    if ("text" in part)
      return (
        <InlineReferenceText
          key={`text-${part.offset}`}
          text={part.text}
          agentId={referenceTarget(message.text)}
        />
      );
    const artifact = message.artifact_ids?.includes(part.id)
      ? artifacts.find((file) => file.id === part.id)
      : undefined;
    return artifact ? (
      <AttachmentChip
        key={`${part.id}-${part.offset}`}
        file={uploadedAttachment(
          artifact,
          documents?.find((document) => document.artifact_id === artifact.id),
          preparing,
        )}
      />
    ) : (
      <Fragment key={`reference-${part.offset}`}>{part.reference}</Fragment>
    );
  });
}
