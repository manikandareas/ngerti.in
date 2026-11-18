import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Entity } from "../contracts";
import { HarnessError } from "./contracts";
import { CredentialStorage } from "./credential-storage";
import {
  type LocalProfiles,
  type LocalProvider,
  localHarness,
  localProviderKey,
} from "./local-profile";
import { type PiProviderConfiguration, piProviderConfiguration } from "./native-configuration";
import { nativeStorageReady } from "./native-storage";
import { connectionProvider, credentialEnvironment } from "./providers";

export class Redactor {
  readonly #values = new Set<string>();
  add(value: string) {
    if (value) {
      this.#values.add(value);
      this.#values.add(JSON.stringify(value).slice(1, -1));
      this.#values.add(encodeURIComponent(value));
    }
  }
  text(input: string) {
    let output = input;
    for (const value of [...this.#values].sort((a, b) => b.length - a.length))
      output = output.split(value).join("[REDACTED]");
    return output.replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]").replace(/\bsk-[\w-]+/g, "[REDACTED]");
  }
  /** Withhold possible secret prefixes across native chunks before publishing a text snapshot. */
  stream(input: string, final = false) {
    if (final) return this.text(input);
    let cut = Math.max(0, input.length - 8);
    for (const value of this.#values) {
      for (let size = Math.min(value.length, input.length); size > input.length - cut; size--) {
        if (input.endsWith(value.slice(0, size))) {
          cut = input.length - size;
          break;
        }
      }
    }
    const open = /(?:Bearer\s+\S*|\bsk-[\w-]*)$/i.exec(input);
    if (open) cut = Math.min(cut, open.index);
    let previous: number;
    do {
      previous = cut;
      for (const value of this.#values) {
        const index = input.lastIndexOf(value, cut);
        if (index >= 0 && index + value.length > cut) cut = index;
      }
    } while (cut !== previous);
    return this.text(input.slice(0, cut));
  }
}
/** Buffer complete records before redaction; discard oversized records rather than expose fragments. */
export class Diagnostics {
  #pending = "";
  #dropping = false;
  readonly #decoder = new TextDecoder();
  constructor(
    private readonly redactor: Redactor,
    private readonly emit: (text: string) => void,
  ) {}
  push(chunk: Uint8Array) {
    this.accept(this.#decoder.decode(chunk, { stream: true }));
  }
  private accept(text: string) {
    for (const part of text.split(/(?<=\n)/)) {
      if (!this.#dropping) this.#pending += part;
      if (this.#pending.length > 16_384) {
        this.#pending = "";
        this.#dropping = true;
      }
      if (part.endsWith("\n")) {
        if (!this.#dropping) this.emit(this.redactor.text(this.#pending.trimEnd()));
        this.#pending = "";
        this.#dropping = false;
      }
    }
  }
  flush() {
    this.accept(this.#decoder.decode());
    if (this.#pending && !this.#dropping) this.emit(this.redactor.text(this.#pending));
    this.#pending = "";
  }
}
export type LaunchContext = {
  connection?: {
    harness: Entity<"connection">["harness"];
    provider_id: string;
    authentication: Entity<"connection">["authentication"]["method"];
    account_id: string | null;
    billing_source: Entity<"connection">["authentication"]["billing_source"];
  };
  ownedProcessTree?: boolean;
  scoped?: boolean;
  ephemeralAuth?: boolean;
  codexAuth?: (
    refresh?: boolean,
  ) => Promise<{ accessToken: string; chatgptAccountId: string; chatgptPlanType?: string }>;
  nativeConfiguration?: PiProviderConfiguration;
  localProvider?: LocalProvider;
  purpose?: "conversation" | "routing";
  env: Record<string, string>;
  state_directory: string;
  redactor: Redactor;
  signal?: AbortSignal;
  workspace?: { id: string; root: string; revision: number; shared?: boolean };
  machine?: { id: string; root: string };
};
export class CredentialContexts {
  codexTokens?: (
    connectionId: string,
    refresh: boolean,
  ) => Promise<{ accessToken: string; chatgptAccountId: string; chatgptPlanType?: string }>;
  constructor(
    readonly root: string,
    private readonly readSecret?: (reference: string) => string,
    private readonly keyFile = process.env.NGERTIIN_PROVIDER_MASTER_KEY_FILE,
    readonly localProfiles?: LocalProfiles,
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.root = realpathSync(root);
  }
  create(
    connection: Entity<"connection">,
    binding?: {
      organization_id: string;
      actor_id: string;
      agent_id: string;
      thread_id: string;
      generation: number;
    },
    options: { externalCodexTokens?: boolean } = {},
  ): LaunchContext {
    new CredentialStorage(this.root).assertActive(connection.id);
    const authority = join(this.root, "connections", connection.id);
    const directory = binding
      ? join(
          authority,
          "bindings",
          createHash("sha256").update(JSON.stringify(binding)).digest("hex"),
        )
      : authority;
    const home = join(directory, "home");
    const provider = connectionProvider(connection.harness, connection.provider_id);
    const selection: NonNullable<LaunchContext["connection"]> = {
      harness: connection.harness,
      provider_id: provider,
      authentication: connection.authentication.method,
      billing_source: connection.authentication.billing_source,
      account_id: connection.account_id,
    };
    const codexHome = join(directory, "codex");
    for (const path of [
      directory,
      home,
      codexHome,
      join(home, ".config"),
      join(home, ".local", "share"),
    ]) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
      chmodSync(path, 0o700);
    }
    // A small OS allowlist prevents inherited keys, endpoints and provider config from changing billing.
    const env: Record<string, string> = {};
    for (const name of ["PATH", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "LANG", "LC_ALL"]) {
      const value = process.env[name];
      if (value) env[name] = value;
    }
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      XDG_CONFIG_HOME: join(home, ".config"),
      XDG_DATA_HOME: join(home, ".local", "share"),
      XDG_CACHE_HOME: join(home, ".cache"),
      XDG_STATE_HOME: join(home, ".local", "state"),
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
      PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
      MUSE_NO_AUTO_UPDATE: "1",
      MUSE_CONTRIBUTOR_MODE: "0",
    });
    const redactor = new Redactor();
    let nativeConfiguration: PiProviderConfiguration | undefined;
    if (connection.authentication.method === "local_config") {
      const harness = localHarness.safeParse(connection.harness);
      if (
        !this.localProfiles ||
        this.localProfiles.deviceId !== connection.authentication.device_id ||
        connection.ownership !== "personal" ||
        !harness.success
      )
        throw new HarnessError("ADAPTER_UNAVAILABLE");
      if (connection.authentication.billing_source === "free") {
        if (
          connection.harness !== "opencode" ||
          provider !== "opencode" ||
          !this.localProfiles.openCodeFreeEnabled()
        )
          throw new HarnessError("MODEL_UNAVAILABLE");
        return { connection: selection, scoped: true, env, state_directory: directory, redactor };
      }
      const localProvider = this.localProfiles.read(harness.data).get(provider);
      if (!localProvider) throw new HarnessError("CREDENTIAL_MISSING");
      redactor.add(localProviderKey(localProvider));
      if (localProvider.kind === "key") env[localProvider.environment] = localProvider.key;
      return {
        connection: selection,
        scoped: true,
        env,
        state_directory: directory,
        redactor,
        localProvider,
        nativeConfiguration:
          localProvider.kind === "configured" && localProvider.harness === "pi"
            ? localProvider.configuration
            : undefined,
      };
    } else if (connection.authentication.method === "harness_config") {
      try {
        const reference = connection.authentication.credential_ref;
        const value = this.readSecret
          ? this.readSecret(reference)
          : new CredentialStorage(this.root, this.keyFile).read(
              reference,
              !!binding || !!connection.organization_id,
            );
        if (value.length > 40_000) throw new Error("Native configuration is oversized.");
        nativeConfiguration = piProviderConfiguration.parse(JSON.parse(value));
        redactor.add(nativeConfiguration.apiKey);
      } catch {
        throw new HarnessError("CREDENTIAL_MISSING");
      }
    } else if (connection.authentication.method === "api_key") {
      let secret: string;
      try {
        const reference = connection.authentication.credential_ref;
        if (this.readSecret) secret = this.readSecret(reference);
        else {
          secret = new CredentialStorage(this.root, this.keyFile).read(
            reference,
            !!binding || !!connection.organization_id,
          );
        }
        if (!secret || secret.length > 16384 || /[\r\n\0]/.test(secret))
          throw new Error("Invalid credential.");
      } catch {
        throw new HarnessError("CREDENTIAL_MISSING");
      }
      redactor.add(secret);
      env[credentialEnvironment(connection.harness, provider)] = secret;
    }
    if (nativeConfiguration)
      return {
        connection: selection,
        scoped: !!binding,
        env,
        state_directory: directory,
        redactor,
        nativeConfiguration,
      };
    if (
      binding &&
      connection.harness === "muse" &&
      connection.authentication.method === "native_login"
    )
      throw new HarnessError("CAPABILITY_UNKNOWN");
    if (
      connection.harness === "codex" &&
      connection.authentication.method === "native_login" &&
      (binding || options.externalCodexTokens)
    ) {
      const provider = this.codexTokens;
      if (!provider || (binding && !nativeStorageReady(this.root)))
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      return {
        connection: selection,
        scoped: !!binding,
        env,
        ephemeralAuth: true,
        state_directory: directory,
        redactor,
        codexAuth: async (refresh = false) => {
          const tokens = await provider(connection.id, refresh);
          redactor.add(tokens.accessToken);
          return tokens;
        },
      };
    }
    return {
      connection: selection,
      scoped: !!binding,
      env,
      state_directory: directory,
      redactor,
      ephemeralAuth: !!binding || connection.authentication.method === "api_key",
    };
  }
}
