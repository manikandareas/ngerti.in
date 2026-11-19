import { z } from "zod";

const responseSchema = z.strictObject({
  event_id: z.uuid(),
  status: z.enum(["delivered", "retry", "rejected"]),
});

export async function sendDelivery(
  destination: { endpoint: string; token: string },
  payload: { event_id: string; text: string; [field: string]: unknown },
  authority: AbortSignal,
): Promise<"delivered" | "retrying" | "failed" | "unknown"> {
  try {
    const response = await fetch(destination.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([authority, AbortSignal.timeout(5000)]),
      headers: {
        authorization: `Bearer ${destination.token}`,
        "content-type": "application/json",
        "idempotency-key": payload.event_id,
      },
      body: JSON.stringify(payload),
    });
    if (!response.body) return "unknown";
    let size = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 4096) return "unknown";
      chunks.push(chunk);
    }
    const receipt = responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (receipt.event_id !== payload.event_id) return "unknown";
    if (response.ok && receipt.status === "delivered") return "delivered";
    if (response.status === 503 && receipt.status === "retry") return "retrying";
    if (response.status >= 400 && response.status < 500 && receipt.status === "rejected")
      return "failed";
  } catch {
    // Timeouts, unclear failures and lost acknowledgements can follow a successful send.
  }
  return "unknown";
}
