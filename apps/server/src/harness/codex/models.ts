import { z } from "zod";
import type { Entity } from "../../contracts";
import { HarnessError, model } from "../contracts";

/** Account-wide catalog conversion shared by the ACP execution hook and credential authority. */
export async function codexModels(read: (cursor: string | null) => Promise<unknown>) {
  const models: Entity<"connection">["models"] = [];
  const modality = model.shape.input_modalities.unwrap().element;
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = z
      .object({
        data: z
          .array(
            z.object({
              model: z.string().min(1).max(200),
              inputModalities: z.array(z.string().max(100)).max(20).optional(),
              supportedReasoningEfforts: z
                .array(z.object({ reasoningEffort: z.string().max(100) }))
                .max(50),
            }),
          )
          .max(100),
        nextCursor: z.string().max(1000).nullable(),
      })
      .parse(await read(cursor));
    models.push(
      ...page.data.map((entry) => ({
        id: entry.model,
        reasoning: entry.supportedReasoningEfforts.map((effort) => effort.reasoningEffort),
        input_modalities: entry.inputModalities?.filter(
          (value): value is z.infer<typeof modality> => modality.safeParse(value).success,
        ) ?? ["text"],
      })),
    );
    cursor = page.nextCursor;
    if (models.length > 1000 || (cursor && seen.has(cursor)))
      throw new HarnessError("PROTOCOL_ERROR");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return models;
}
