import type { Artifact } from "@/types/work";

export interface ComposerAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number | null;
  state: "uploading" | "ready" | "failed";
  artifact?: Artifact;
  previewUrl?: string;
  error?: string;
}

export function attachmentReference(id: string, name: string) {
  const label = name.replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&");
  return `[${label}](ngertiin://file/${id})`;
}

export type ComposerPart =
  | { offset: number; text: string }
  | { offset: number; id: string; name: string; reference: string };

/** References travel in the existing text field; artifact_ids still determines actual file access. */
export function attachmentParts(text: string): ComposerPart[] {
  const pattern = /\[((?:\\.|[^\]\\\r\n])*)\]\(ngertiin:\/\/file\/([a-zA-Z0-9_-]+)\)/g;
  const parts: ComposerPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) parts.push({ offset, text: text.slice(offset, match.index) });
    parts.push({
      offset: match.index,
      id: match[2],
      name: match[1].replace(/\\(.)/g, "$1"),
      reference: match[0],
    });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ offset, text: text.slice(offset) });
  return parts;
}

export function uploadedAttachment(artifact: Artifact): ComposerAttachment {
  return {
    id: artifact.id,
    name: artifact.name,
    mediaType: artifact.media_type,
    size: artifact.size_bytes,
    state: "ready",
    artifact,
  };
}
