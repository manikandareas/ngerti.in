import { z } from "zod";

/** Native product-tool envelopes retain images as images; text limits belong to each tool. */
export const toolContentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image"),
    data: z.string().max(8_000_000),
    mimeType: z.literal("image/png"),
  }),
]);
