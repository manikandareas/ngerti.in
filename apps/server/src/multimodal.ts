import { createHash } from "node:crypto";
import sharp from "sharp";
import { Artifacts } from "./artifacts";
import type { Entity } from "./contracts";
import { DomainError } from "./contracts";
import { HarnessError } from "./harness/contracts";
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
    const capability = connection.capabilities[video ? "video_input" : "image_input"];
    if (capability !== "supported")
      throw new HarnessError(
        capability === "unknown" ? "CAPABILITY_UNKNOWN" : "CAPABILITY_UNSUPPORTED",
      );
    const modalities = connection.models.find((m) => m.id === modelId)?.input_modalities;
    if (!modalities) throw new HarnessError("CAPABILITY_UNKNOWN");
    if (!modalities.includes(video ? "video" : "image"))
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    // Neither active adapter has a native video input contract. Never silently substitute frames.
    if (video) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if (images.length >= 4 || !run.workspace_id) throw new DomainError("INVALID_REQUEST", 422);
    const { bytes } = await artifacts.download(id, run.workspace_id);
    try {
      const decoder = sharp(bytes, {
        limitInputPixels: 40_000_000,
        animated: false,
        failOn: "warning",
      });
      const metadata = await decoder.metadata();
      const declared = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[
        item.media_type
      ];
      if (!declared || metadata.format !== declared || (metadata.pages ?? 1) > 1)
        throw new Error("Unsupported image format.");
      const { data, info } = await decoder
        .autoOrient()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });
      if (data.length > 6_000_000) throw new Error("Image exceeds the normalized size limit.");
      images.push(`data:image/png;base64,${data.toString("base64")}`);
      receipts.push({
        artifact_id: id,
        source_sha256: item.sha256,
        normalized_sha256: createHash("sha256").update(data).digest("hex"),
        width: info.width,
        height: info.height,
      });
    } catch {
      throw new DomainError("INVALID_REQUEST", 422);
    }
  }
  return { images, receipts };
}
