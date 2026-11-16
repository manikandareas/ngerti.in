import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Entity } from "../contracts";
import { HarnessError } from "./contracts";
import { CredentialStorage } from "./credential-storage";
import { nativeStorageReady } from "./native-storage";

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
    let cut = Math.max(
      0,
      input.length - Math.max(8, ...[...this.#values].map((value) => value.length)),
    );
    for (const value of this.#values) {
      const index = input.lastIndexOf(value, cut);
      if (index >= 0 && index + value.length > cut) cut = index;
    }
    const open = /(?:Bearer\s+\S*|\bsk-[\w-]*)$/i.exec(input);
    if (open) cut = Math.min(cut, open.index);
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
  scoped?: boolean;
  ephemeralAuth?: boolean;
  codexAuth?: (
    refresh?: boolean,
  ) => Promise<{ accessToken: string; chatgptAccountId: string; chatgptPlanType?: string }>;
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
      MUSE_NO_AUTO_UPDATE: "1",
      MUSE_CONTRIBUTOR_MODE: "0",
    });
    const redactor = new Redactor();
    if (connection.authentication.method === "api_key") {
      let secret: string;
      try {
        const reference = connection.authentication.credential_ref;
        if (this.readSecret) secret = this.readSecret(reference);
        else {
          secret = new CredentialStorage(this.root).read(reference, !!binding);
        }
        if (!secret || secret.length > 16384 || /[\r\n\0]/.test(secret))
          throw new Error("Invalid credential.");
      } catch {
        throw new HarnessError("CREDENTIAL_MISSING");
      }
      redactor.add(secret);
      env[connection.harness === "codex" ? "OPENAI_API_KEY" : "META_API_KEY"] = secret;
    }
    if (
      binding &&
      connection.harness === "muse" &&
      connection.authentication.method === "native_login"
    )
      throw new HarnessError("CAPABILITY_UNKNOWN");
    if (
      binding &&
      connection.harness === "codex" &&
      connection.authentication.method === "native_login"
    ) {
      const provider = this.codexTokens;
      if (!provider || !nativeStorageReady(this.root))
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      return {
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
      scoped: !!binding,
      env,
      state_directory: directory,
      redactor,
      ephemeralAuth: !!binding || connection.authentication.method === "api_key",
    };
  }
}
