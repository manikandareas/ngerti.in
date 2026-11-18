import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { piProviderConfiguration } from "./native-configuration";
import { providerEnvironments } from "./providers";

const providerId = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const keyValue = z
  .string()
  .min(1)
  .max(16384)
  .regex(/^[^!$\r\n\0][^\r\n\0]*$/);
const localPiProvider = piProviderConfiguration.extend({
  models: piProviderConfiguration.shape.models.element.array().min(1).max(1000),
});
const endpoint = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password;
});
const openCodeProvider = z.object({
  name: z.string().max(200).optional(),
  npm: z.literal("@ai-sdk/openai-compatible"),
  options: z.object({ baseURL: endpoint, apiKey: z.string() }),
  models: z
    .record(
      z.string().min(1).max(190),
      z.object({
        name: z.string().max(200),
        reasoning: z.boolean().optional(),
        limit: z.object({ context: z.int().positive(), output: z.int().positive() }).optional(),
      }),
    )
    .refine((models) => Object.keys(models).length > 0 && Object.keys(models).length <= 1000),
});

export const localHarness = z.enum(["codex", "pi", "opencode"]);
export type LocalHarness = z.infer<typeof localHarness>;
export type LocalProvider =
  | { kind: "configured"; harness: "pi"; configuration: z.infer<typeof localPiProvider> }
  | { kind: "configured"; harness: "opencode"; configuration: z.infer<typeof openCodeProvider> }
  | { kind: "key"; harness: LocalHarness; environment: string; key: string };

const configurationRecord = z.record(z.string(), z.unknown());

function record(value: unknown) {
  return configurationRecord.safeParse(value).data ?? {};
}

function readConfiguration(
  path: string,
  parse: (text: string) => unknown = Bun.JSONC.parse,
): Record<string, unknown> | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 262_144) return null;
    return configurationRecord.safeParse(parse(readFileSync(descriptor, "utf8"))).data ?? null;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? {} : null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function localKey(value: unknown, environment: NodeJS.ProcessEnv) {
  if (typeof value !== "string") return undefined;
  const reference = /^(?:\$([A-Za-z_]\w*)|\$\{([A-Za-z_]\w*)\}|\{env:([A-Za-z_]\w*)\})$/.exec(
    value,
  );
  return keyValue.safeParse(
    reference ? environment[reference[1] ?? reference[2] ?? reference[3]] : value,
  ).data;
}

export class LocalProfiles {
  constructor(
    readonly deviceId: string,
    private readonly environment = process.env,
    private readonly home = homedir(),
  ) {}

  read(harness: LocalHarness) {
    const providers = new Map<string, LocalProvider>();
    if (harness === "codex") {
      const directory = this.environment.CODEX_HOME || join(this.home, ".codex");
      const config = readConfiguration(join(directory, "config.toml"), Bun.TOML.parse);
      const auth = readConfiguration(join(directory, "auth.json"));
      if (
        config &&
        auth &&
        (config.model_provider === undefined || config.model_provider === "openai") &&
        config.openai_base_url === undefined &&
        config.profile === undefined &&
        config.forced_login_method !== "chatgpt" &&
        !this.environment.OPENAI_BASE_URL &&
        (auth.auth_mode === undefined || auth.auth_mode === "apikey") &&
        !auth.tokens
      ) {
        const key = keyValue.safeParse(auth.OPENAI_API_KEY).data;
        if (key)
          providers.set("openai", { kind: "key", harness, environment: "OPENAI_API_KEY", key });
      }
    } else if (harness === "pi") {
      const directory = this.environment.PI_CODING_AGENT_DIR || join(this.home, ".pi", "agent");
      const config = readConfiguration(join(directory, "models.json"));
      const auth = readConfiguration(join(directory, "auth.json"));
      if (!config || !auth) return providers;
      const entries = record(config.providers);
      this.readKeys(providers, harness, entries, auth, "api_key");
      for (const [id, raw] of Object.entries(entries)) {
        if (!providerId.test(id)) continue;
        const data = record(raw);
        const stored = record(auth[id]);
        if (stored.type !== undefined && stored.type !== "api_key") continue;
        const apiKey =
          localKey(stored.key ?? data.apiKey, this.environment) ??
          (stored.key === undefined && data.apiKey === undefined
            ? this.key(id, auth, "api_key")
            : undefined);
        const result = localPiProvider.safeParse({
          baseUrl: endpoint.safeParse(data.baseUrl).data,
          api: data.api,
          apiKey,
          models: data.models,
        });
        if (result.success)
          providers.set(id, { kind: "configured", harness, configuration: result.data });
      }
    } else {
      const { entries, allowed } = this.openCodeConfiguration();
      const auth = readConfiguration(
        join(
          this.environment.XDG_DATA_HOME || join(this.home, ".local", "share"),
          "opencode",
          "auth.json",
        ),
      );
      if (!auth) return providers;
      this.readKeys(providers, harness, entries, auth, "api", allowed);
      for (const [id, raw] of Object.entries(entries)) {
        if (id === "opencode" || !providerId.test(id) || !allowed(id)) continue;
        const data = record(raw);
        const options = record(data.options);
        const stored = record(auth[id]);
        if (stored.type !== undefined && stored.type !== "api") continue;
        const apiKey =
          localKey(options.apiKey, this.environment) ??
          (options.apiKey === undefined ? this.key(id, auth, "api") : undefined);
        const result = openCodeProvider.safeParse({ ...data, options: { ...options, apiKey } });
        if (result.success && !/\{(?:env|file):/.test(JSON.stringify(result.data)))
          providers.set(id, { kind: "configured", harness, configuration: result.data });
      }
    }
    return providers;
  }

  openCodeFreeEnabled() {
    const { allowed, entries } = this.openCodeConfiguration();
    return allowed("opencode") && !Object.hasOwn(entries, "opencode");
  }

  private openCodeConfiguration() {
    const directory = join(
      this.environment.XDG_CONFIG_HOME || join(this.home, ".config"),
      "opencode",
    );
    const json = readConfiguration(join(directory, "opencode.json"));
    const jsonc = readConfiguration(join(directory, "opencode.jsonc"));
    if (!json || !jsonc) return { entries: {}, allowed: () => false };
    const config = { ...json, ...jsonc };
    const enabled = Array.isArray(config.enabled_providers) ? config.enabled_providers : null;
    const disabled = Array.isArray(config.disabled_providers) ? config.disabled_providers : [];
    return {
      entries: { ...record(json.provider), ...record(jsonc.provider) },
      allowed: (id: string) => !disabled.includes(id) && (!enabled || enabled.includes(id)),
    };
  }

  private key(id: string, auth: Record<string, unknown>, kind: "api" | "api_key") {
    const stored = record(auth[id]);
    if (stored.type !== undefined && stored.type !== kind) return undefined;
    const environment = Object.hasOwn(providerEnvironments, id)
      ? providerEnvironments[id]
      : undefined;
    return localKey(
      stored.key ?? (environment ? this.environment[environment] : undefined),
      this.environment,
    );
  }

  private readKeys(
    providers: Map<string, LocalProvider>,
    harness: LocalHarness,
    configured: Record<string, unknown>,
    auth: Record<string, unknown>,
    kind: "api" | "api_key",
    allowed: (id: string) => boolean = () => true,
  ) {
    for (const [id, environment] of Object.entries(providerEnvironments)) {
      if (Object.hasOwn(configured, id) || !allowed(id) || record(auth[id]).type !== kind) continue;
      const key = this.key(id, auth, kind);
      if (key) providers.set(id, { kind: "key", harness, environment, key });
    }
  }
}

export function localProviderKey(provider: LocalProvider) {
  if (provider.kind === "key") return provider.key;
  return provider.harness === "pi"
    ? provider.configuration.apiKey
    : provider.configuration.options.apiKey;
}
