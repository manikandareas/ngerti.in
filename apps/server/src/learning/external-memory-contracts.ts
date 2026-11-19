import { z } from "zod";
import { base } from "../contracts/base";

const backendId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const backendOption = z.strictObject({ id: backendId, label: z.string().trim().min(1).max(80) });
const backend = backendOption.extend({
  endpoint: z.url(),
  access_token: z.string().regex(/^[\x21-\x7e]{16,4096}$/),
  namespace_key: z.string().min(32),
});
export type MemoryBackend = z.infer<typeof backend>;

export function parseMemoryBackends(raw: string | undefined, development: boolean) {
  if (!raw) return [];
  try {
    return z
      .array(backend)
      .max(16)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length)
      .refine((items) =>
        items.every(({ endpoint }) => {
          const url = new URL(endpoint);
          return (
            !url.username &&
            !url.password &&
            !url.hash &&
            !url.search &&
            (url.protocol === "https:" ||
              (development &&
                url.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
          );
        }),
      )
      .parse(JSON.parse(raw));
  } catch {
    throw new Error("Invalid NGERTIIN_MEMORY_BACKENDS configuration.");
  }
}

export const externalMemoryConnection = z.strictObject({
  ...base,
  kind: z.literal("external_memory_connection"),
  backend_id: backendId.nullable(),
});
export const externalMemoryStatus = z.strictObject({
  backend_id: backendId.nullable(),
  revision: z.int().nonnegative(),
  options: z.array(backendOption),
});
export const externalMemoryChange = externalMemoryStatus.pick({ backend_id: true }).extend({
  expected_revision: z.int().nonnegative(),
});
export const externalMemoryQuery = z.strictObject({ query: z.string().trim().min(1).max(280) });
export const externalMemoryMatches = z.strictObject({
  memories: z.array(z.strictObject({ text: z.string().trim().min(1).max(1600) })).max(8),
});
