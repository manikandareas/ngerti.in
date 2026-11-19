import { z } from "zod";
import { toolkitSlug } from "./contracts";

const key = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const version = z.string().regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/);
const label = z.string().trim().min(1).max(120);
const prefix = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[^\r\n]+$/);
export const outputPluginSelection = z.strictObject({ id: key, version });
export const outputPluginSnapshot = outputPluginSelection.extend({
  name: label,
  match_prefix: prefix,
  replace_prefix: prefix,
});
const manifest = outputPluginSnapshot.extend({
  source: label,
  dependency: z.strictObject({ toolkit: toolkitSlug, name: label }),
});
export type OutputPluginManifest = z.infer<typeof manifest>;

export function parseOutputPlugins(value?: string): OutputPluginManifest[] {
  const plugins = z
    .array(manifest)
    .max(32)
    .parse(value ? JSON.parse(value) : []);
  if (
    new Set(plugins.map((plugin) => plugin.id)).size !== plugins.length ||
    plugins.some((plugin) => plugin.match_prefix === plugin.replace_prefix)
  )
    throw new Error("Managed output plugins require unique IDs and different text prefixes.");
  return plugins;
}

export const outputPluginInput = z.strictObject({
  id: key,
  enabled: z.boolean(),
  expected_revision: z.int().positive(),
});
export const outputPluginRegistry = z.strictObject({
  revision: z.int().positive(),
  plugins: z.array(
    outputPluginSelection.extend({
      name: label,
      source: label,
      dependency: label,
      state: z.enum(["inactive", "active", "dependency_missing", "version_changed"]),
      enabled: z.boolean(),
    }),
  ),
});
export const outputPluginStatus = z.enum(["applied", "failed"]);
