import { z } from "zod";

export const id = z.uuid();
export const text = z.string().min(1).max(100_000);
export const base = {
  id,
  owner_id: id,
  organization_id: id.optional(),
  actor_id: id.nullable().optional(),
  revision: z.int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
};
export const harness = z.enum(["codex", "muse"]);
