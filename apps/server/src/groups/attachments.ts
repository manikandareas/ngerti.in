import { DomainError } from "../contracts";
import { HarnessError } from "../harness/contracts";
import type { Lifecycle } from "../lifecycle";
import { asyncMap } from "../persistence/async-collections";

/** Technical eligibility is authoritative code, not a routing-model judgment. */
export async function requireAttachmentSupport(
  lifecycle: Lifecycle,
  agentId: string,
  artifactIds: string[],
) {
  const items = await asyncMap(
    artifactIds,
    async (id) => await lifecycle.store.get("artifact", id),
  );
  if (items.length > 20 || items.filter((a) => a.media_type.startsWith("image/")).length > 4)
    throw new DomainError("INVALID_REQUEST", 422);
  if (items.some((a) => a.media_type.startsWith("video/")))
    throw new HarnessError("CAPABILITY_UNSUPPORTED");
  if (!items.some((a) => a.media_type.startsWith("image/"))) return;
  const agent = await lifecycle.store.get("agent", agentId);
  if (!agent.connection_id) throw new HarnessError("CAPABILITY_UNKNOWN");
  const connection = await lifecycle.store.get("connection", agent.connection_id);
  if (connection.state !== "active") throw new HarnessError("CAPABILITY_UNSUPPORTED");
  const capability = connection.capabilities.image_input;
  if (capability !== "supported")
    throw new HarnessError(
      capability === "unknown" ? "CAPABILITY_UNKNOWN" : "CAPABILITY_UNSUPPORTED",
    );
  const model = connection.models.find((m) => m.id === agent.model_id);
  if (!model?.input_modalities) throw new HarnessError("CAPABILITY_UNKNOWN");
  if (!model.input_modalities.includes("image")) throw new HarnessError("CAPABILITY_UNSUPPORTED");
  if (
    items.some(
      (a) =>
        a.media_type.startsWith("image/") &&
        !["image/png", "image/jpeg", "image/webp"].includes(a.media_type),
    )
  )
    throw new DomainError("INVALID_REQUEST", 422);
}
