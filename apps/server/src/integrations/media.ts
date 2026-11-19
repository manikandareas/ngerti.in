import type { z } from "zod";
import { Artifacts } from "../artifacts";
import { Attachments } from "../attachments/service";
import { DomainError } from "../contracts";
import { publicFileReference } from "../conversations/references";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import { imageDecoder, normalizeImage } from "../multimodal";
import { MAX_FILE_BYTES } from "../workspaces/contracts";
import { mediaBackendsFor, type mediaInput, mediaObservation } from "./media-contracts";

async function responseBytes(response: Response | null, limit: number) {
  if (!response?.ok || !response.body) {
    await response?.body?.cancel().catch(() => {});
    throw new DomainError("MEDIA_BACKEND_FAILED");
  }
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw new Error("Media response exceeds the allowed size.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
  } catch {
    throw new DomainError("MEDIA_BACKEND_FAILED");
  }
}

function speechFile(bytes: Buffer, contentType: string) {
  if (
    ["audio/wav", "audio/x-wav"].includes(contentType) &&
    bytes.length >= 44 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  )
    return { name: "voice-reply.wav", bytes, media_type: "audio/wav" };
  if (
    contentType === "audio/mpeg" &&
    bytes.length >= 4 &&
    (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  )
    return { name: "voice-reply.mp3", bytes, media_type: "audio/mpeg" };
  throw new DomainError("MEDIA_BACKEND_FAILED");
}

async function generatedImageFile(bytes: Buffer, mediaType: string, revised: boolean) {
  try {
    const decoder = await imageDecoder(bytes, mediaType);
    await decoder.stats();
    const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.split("/")[1];
    return {
      name: `${revised ? "revised" : "generated"}-image.${extension}`,
      bytes,
      media_type: mediaType,
    };
  } catch {
    throw new DomainError("MEDIA_BACKEND_FAILED");
  }
}

function isMp4(bytes: Buffer, mediaType: string) {
  if (mediaType !== "video/mp4" || bytes.toString("latin1", 4, 8) !== "ftyp") return false;
  const required = new Set(["ftyp", "moov", "mdat"]);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      header = 16;
      if (offset + header > bytes.length) return false;
      size = Number(bytes.readBigUInt64BE(offset + 8));
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < header || offset + size > bytes.length) return false;
    if (size > header) required.delete(bytes.toString("latin1", offset + 4, offset + 8));
    offset += size;
  }
  return offset === bytes.length && required.size === 0;
}

export async function processMedia(
  lifecycle: Lifecycle,
  input: z.infer<typeof mediaInput>,
  access: ToolAccess,
) {
  const { store } = lifecycle;
  const backend = mediaBackendsFor(lifecycle, access.scope.thread_id, input.operation)[0];
  if (!backend) throw new DomainError("SCOPE_DENIED", 403);
  const run = await store.get("run", access.scope.run_id);
  const artifacts = new Artifacts(lifecycle);
  const source = input.artifact_id
    ? await new Attachments(lifecycle).get(run, input.artifact_id)
    : null;
  const speak = input.operation === "speak";
  const editImage = input.operation === "edit_image";
  const imageOutput = input.operation === "generate_image" || editImage;
  const videoOutput = input.operation === "generate_video";
  const producesFile = speak || imageOutput || videoOutput;
  const effect = speak ? `media:speak:${run.id}` : `media:${input.command_id}`;
  return await store.asyncCommand(
    effect,
    {
      run_id: run.id,
      backend: backend.id,
      operation: input.operation,
      artifact: source?.id ?? null,
      sha256: source?.sha256 ?? null,
      prompt: input.prompt,
    },
    async () => {
      const body = new FormData();
      body.set("operation", input.operation);
      body.set("prompt", input.prompt);
      if (source) {
        if (!source.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
        const { bytes } = await artifacts.download(source.id, source.workspace_id);
        if (input.operation === "inspect_image") {
          const image = await normalizeImage(bytes, source.media_type);
          body.set(
            "asset",
            new Blob([new Uint8Array(image.data)], { type: "image/png" }),
            "source.png",
          );
        } else {
          if (editImage) {
            try {
              await (await imageDecoder(bytes, source.media_type)).stats();
            } catch {
              throw new DomainError("INVALID_REQUEST", 422);
            }
          } else if (
            input.operation === "inspect_video"
              ? !isMp4(bytes, source.media_type)
              : !source.media_type.startsWith("audio/") || !bytes.length
          )
            throw new DomainError("INVALID_REQUEST", 422);
          body.set(
            "asset",
            new Blob([new Uint8Array(bytes)], { type: source.media_type }),
            source.name,
          );
        }
      }
      await access.authorize();
      const response = await fetch(backend.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${backend.token}`,
          "Idempotency-Key": speak ? run.id : input.command_id,
        },
        body,
        redirect: "error",
        signal: AbortSignal.any([store.signal, AbortSignal.timeout(45_000)]),
      }).catch(() => null);
      const bytes = await responseBytes(response, producesFile ? MAX_FILE_BYTES : 128_000);
      if (producesFile) {
        const contentType =
          response?.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (videoOutput && !isMp4(bytes, contentType))
          throw new DomainError("MEDIA_BACKEND_FAILED");
        const artifact = await artifacts.publishGenerated(
          run,
          speak ? run.id : input.command_id,
          speak
            ? speechFile(bytes, contentType)
            : videoOutput
              ? { name: "generated-video.mp4", bytes, media_type: contentType }
              : await generatedImageFile(bytes, contentType, editImage),
          access.authorize,
          source?.id,
        );
        return {
          backend: backend.label,
          artifact_id: artifact.id,
          reference: publicFileReference(artifact.name, artifact.id),
        };
      }
      try {
        const observation = mediaObservation.parse(JSON.parse(bytes.toString("utf8")));
        return {
          backend: backend.label,
          text: observation.text.replaceAll(backend.token, "[REDACTED]"),
          artifact_id: source?.id,
        };
      } catch {
        throw new DomainError("MEDIA_BACKEND_FAILED");
      }
    },
    (result) => result,
    access.authorize,
  );
}
