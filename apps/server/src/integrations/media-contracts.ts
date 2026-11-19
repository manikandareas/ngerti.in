import { z } from "zod";
import { id } from "../contracts/base";
import type { Lifecycle } from "../lifecycle";

export const mediaOperation = z.enum([
  "inspect_image",
  "transcribe_audio",
  "speak",
  "generate_image",
  "edit_image",
  "inspect_video",
  "generate_video",
]);
const endpointConfig = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  organization_id: id,
  user_id: id,
  thread_id: id,
  endpoint: z.url(),
  token_env: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  operations: z.array(mediaOperation).min(1).max(8),
});
export type MediaBackend = Omit<z.infer<typeof endpointConfig>, "token_env"> & { token: string };
export type MediaOperation = z.infer<typeof mediaOperation>;

export function parseMediaBackends(env: Record<string, string | undefined>, development: boolean) {
  if (!env.NGERTIIN_MEDIA_BACKENDS) return [];
  try {
    const routes = z.array(endpointConfig).max(64).parse(JSON.parse(env.NGERTIIN_MEDIA_BACKENDS));
    const assignments = routes.flatMap((route) =>
      route.operations.map((action) =>
        JSON.stringify([route.organization_id, route.user_id, route.thread_id, action]),
      ),
    );
    if (
      new Set(routes.map((route) => route.id)).size !== routes.length ||
      new Set(assignments).size !== assignments.length
    )
      throw new Error();
    return routes.map(({ token_env, ...route }): MediaBackend => {
      const url = new URL(route.endpoint);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(development && url.protocol === "http:" && url.hostname === "127.0.0.1"))
      )
        throw new Error();
      return {
        ...route,
        token: z
          .string()
          .regex(/^[\x21-\x7e]{16,4096}$/)
          .parse(env[token_env]),
      };
    });
  } catch {
    throw new Error("Invalid NGERTIIN_MEDIA_BACKENDS configuration.");
  }
}

export const mediaInput = z
  .strictObject({
    operation: mediaOperation,
    artifact_id: id.optional(),
    prompt: z.string().trim().min(1).max(8000),
    command_id: id,
  })
  .refine(
    (input) =>
      Boolean(input.artifact_id) ===
      !["speak", "generate_image", "generate_video"].includes(input.operation),
    {
      path: ["artifact_id"],
      message: "Supply a source artifact only for inspection, transcription, or editing.",
    },
  );

export const mediaObservation = z.strictObject({ text: z.string().trim().min(1).max(20_000) });

export function mediaBackendsFor(
  lifecycle: Lifecycle,
  threadId: string,
  operation?: MediaOperation,
) {
  const actor = lifecycle.store.dataContext;
  return lifecycle.mediaBackends.filter(
    (route) =>
      route.thread_id === threadId &&
      actor?.userId === route.user_id &&
      actor.organizationId === route.organization_id &&
      (!operation || route.operations.includes(operation)),
  );
}
