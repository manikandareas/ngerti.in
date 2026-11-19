import { createHash } from "node:crypto";
import sharp from "sharp";
import { Artifacts } from "./artifacts";
import type { Entity } from "./contracts";
import { DomainError } from "./contracts";
import { HarnessError } from "./harness/contracts";
import { mediaBackendsFor } from "./integrations/media-contracts";
import type { Lifecycle } from "./lifecycle";

export async function prepareVisualInputs(
  lifecycle: Lifecycle,
  run: Entity<"run">,
  connection: Entity<"connection">,
  modelId: string,
) {
  const artifacts = new Artifacts(lifecycle);
  const message = await lifecycle.store.get("message", run.input_message_id);
  const images: string[] = [];
  const alternate: { artifactId: string; operation: "inspect_image" | "inspect_video" }[] = [];
  const receipts: {
    artifact_id: string;
    source_sha256: string;
    normalized_sha256: string;
    width: number;
    height: number;
  }[] = [];
  for (const id of message.artifact_ids) {
    const item = await lifecycle.store.get("artifact", id);
    const video = item.media_type.startsWith("video/");
    const image = item.media_type.startsWith("image/");
    if (!video && !image) continue;
    // Video goes through an authorized media backend until an active adapter accepts native video.
    if (video) {
      if (!mediaBackendsFor(lifecycle, run.thread_id, "inspect_video").length)
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      if (item.media_type !== "video/mp4") throw new DomainError("INVALID_REQUEST", 422);
      alternate.push({ artifactId: id, operation: "inspect_video" });
      continue;
    }
    const capability = connection.capabilities.image_input;
    const modalities = connection.models.find((m) => m.id === modelId)?.input_modalities;
    if (
      (capability !== "supported" || !modalities?.includes("image")) &&
      mediaBackendsFor(lifecycle, run.thread_id, "inspect_image").length
    ) {
      alternate.push({ artifactId: id, operation: "inspect_image" });
      continue;
    }
    if (capability !== "supported")
      throw new HarnessError(
        capability === "unknown" ? "CAPABILITY_UNKNOWN" : "CAPABILITY_UNSUPPORTED",
      );
    if (!modalities) throw new HarnessError("CAPABILITY_UNKNOWN");
    if (!modalities.includes("image")) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if (images.length >= 4 || !run.workspace_id) throw new DomainError("INVALID_REQUEST", 422);
    const { bytes } = await artifacts.download(id, run.workspace_id);
    const { data, info } = await normalizeImage(bytes, item.media_type);
    images.push(`data:image/png;base64,${data.toString("base64")}`);
    receipts.push({
      artifact_id: id,
      source_sha256: item.sha256,
      normalized_sha256: createHash("sha256").update(data).digest("hex"),
      width: info.width,
      height: info.height,
    });
  }
  return { images, receipts, alternate };
}

export async function imageDecoder(bytes: Uint8Array, mediaType: string) {
  const decoder = sharp(bytes, {
    limitInputPixels: 40_000_000,
    animated: false,
    failOn: "warning",
  });
  const metadata = await decoder.metadata();
  const declared = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[mediaType];
  if (!declared || metadata.format !== declared || (metadata.pages ?? 1) > 1)
    throw new Error("Unsupported image format.");
  return decoder;
}

export async function normalizeImage(bytes: Uint8Array, mediaType: string) {
  try {
    const decoder = await imageDecoder(bytes, mediaType);
    const image = await decoder
      .autoOrient()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (image.data.length > 6_000_000) throw new Error("Image exceeds the normalized size limit.");
    return image;
  } catch {
    throw new DomainError("INVALID_REQUEST", 422);
  }
}
