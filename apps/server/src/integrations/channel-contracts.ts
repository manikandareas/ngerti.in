import { z } from "zod";
import { base, id, text } from "../contracts/base";

export const channelId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const label = z.string().trim().min(1).max(120);
const externalId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const envName = z.string().regex(/^[A-Z][A-Z0-9_]+$/);
const channelInput = z.strictObject({
  id: channelId,
  label,
  organization_id: id,
  user_id: id,
  thread_id: id,
  remote_thread: externalId,
  sender: externalId,
  receive_key_env: envName,
  delivery_token_env: envName,
  endpoint: z.url(),
});
export type ManagedChannel = Omit<
  z.infer<typeof channelInput>,
  "receive_key_env" | "delivery_token_env"
> & { receiveKey: string; token: string };

export function parseChannels(env: Record<string, string | undefined>, development: boolean) {
  const raw = env.NGERTIIN_CHANNELS;
  if (!raw) return [];
  try {
    const routes = z.array(channelInput).max(128).parse(JSON.parse(raw));
    if (new Set(routes.map((item) => item.id)).size !== routes.length) throw new Error();
    return routes.map(({ receive_key_env, delivery_token_env, ...item }): ManagedChannel => {
      const url = new URL(item.endpoint);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(development && url.protocol === "http:" && url.hostname === "127.0.0.1"))
      )
        throw new Error();
      const token = z.string().regex(/^[\x21-\x7e]{24,1024}$/);
      return {
        ...item,
        receiveKey: token.parse(env[receive_key_env]),
        token: token.parse(env[delivery_token_env]),
      };
    });
  } catch {
    throw new Error("Invalid NGERTIIN_CHANNELS configuration.");
  }
}

export const channelEvent = z.strictObject({ event_id: id, text });
export const channelExchange = z.strictObject({
  ...base,
  kind: z.literal("channel_exchange"),
  channel_id: channelId,
  channel_label: label,
  route_hash: z.string().length(64),
  thread_id: id,
  run_id: id,
  event_id: id,
  membership_generation: z.int().positive(),
  state: z.enum(["pending", "sending", "retrying", "delivered", "failed", "unknown", "cancelled"]),
  attempts: z.int().nonnegative(),
  next_attempt_at: z.iso.datetime().nullable(),
});
export const channelStatus = channelExchange.pick({
  id: true,
  run_id: true,
  event_id: true,
  channel_label: true,
  state: true,
  attempts: true,
});
