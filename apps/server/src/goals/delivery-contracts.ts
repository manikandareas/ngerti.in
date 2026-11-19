import { z } from "zod";
import { base, id } from "../contracts/base";

const targetId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const routineDeliveryTarget = z.strictObject({
  id: targetId,
  label: z.string().trim().min(1).max(100),
});
const destination = routineDeliveryTarget.extend({
  organization_id: id,
  user_id: id,
  endpoint: z.url(),
  token: z.string().regex(/^[\x21-\x7e]{16,4096}$/),
});
export type RoutineDeliveryDestination = z.infer<typeof destination>;

export function parseRoutineDeliveryDestinations(raw: string | undefined, development: boolean) {
  if (!raw) return [];
  try {
    return z
      .array(destination)
      .max(128)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length)
      .refine((items) =>
        items.every(({ endpoint }) => {
          const url = new URL(endpoint);
          return (
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            (url.protocol === "https:" ||
              (development &&
                url.protocol === "http:" &&
                ["127.0.0.1", "[::1]"].includes(url.hostname)))
          );
        }),
      )
      .parse(JSON.parse(raw));
  } catch {
    throw new Error("Invalid NGERTIIN_ROUTINE_DELIVERY_DESTINATIONS configuration.");
  }
}

export const routineDeliverySelection = routineDeliveryTarget.extend({
  endpoint_hash: z.string().length(64),
});
export const setRoutineDelivery = z.strictObject({
  target_id: targetId.nullable(),
  expected_revision: z.int().positive(),
});
export const routineDelivery = z.strictObject({
  ...base,
  kind: z.literal("routine_delivery"),
  thread_id: id,
  routine_id: id,
  run_id: id,
  message_id: id,
  target: routineDeliverySelection,
  state: z.enum(["queued", "sending", "retrying", "delivered", "failed", "unknown", "cancelled"]),
  attempts: z.int().nonnegative(),
  next_attempt_at: z.iso.datetime().nullable(),
  authority_epoch: id.nullable(),
});
export const routineDeliveryStatus = routineDelivery
  .pick({
    id: true,
    routine_id: true,
    run_id: true,
    state: true,
  })
  .extend({ destination: z.string() });
