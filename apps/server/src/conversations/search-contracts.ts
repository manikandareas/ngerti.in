import { z } from "zod";

export const historySearchInput = z.strictObject({
  query: z.string().trim().min(1).max(300),
  limit: z.int().min(1).max(8).default(4),
});
export const historySourceInput = z.strictObject({
  thread_id: z.uuid(),
  message_id: z.uuid(),
});
export const historyReference = historySourceInput.extend({
  conversation: z.string(),
  author: z.enum(["user", "agent"]),
  created_at: z.iso.datetime(),
  reference: z.string(),
});
export const historySearchResult = z.strictObject({
  matches: z.array(historyReference.extend({ excerpt: z.string() })).max(8),
});
export const historySourceResult = historyReference.extend({
  text: z.string(),
  truncated: z.boolean(),
});
