import { z } from "zod";

// A computer call can start a driver session and then wait for its own native action.
export const productToolTimeoutMs = 75_000;

/** Native product-tool envelopes retain images as images; text limits belong to each tool. */
export const toolContentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image"),
    data: z.string().max(8_000_000),
    mimeType: z.literal("image/png"),
  }),
]);
