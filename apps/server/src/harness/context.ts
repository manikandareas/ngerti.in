import { chmodSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Entity } from "../contracts";
import { HarnessError } from "./contracts";

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
  env: Record<string, string>;
  state_directory: string;
  redactor: Redactor;
  signal?: AbortSignal;
};
export class CredentialContexts {
  constructor(
    readonly root: string,
    private readonly readSecret?: (reference: string) => string,
  ) {}
  create(connection: Entity<"connection">): LaunchContext {
    const directory = join(this.root, "connections", connection.id);
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
    });
    const redactor = new Redactor();
    if (connection.authentication.method === "api_key") {
      let secret: string;
      try {
        const reference = connection.authentication.credential_ref;
        if (this.readSecret) secret = this.readSecret(reference);
        else {
          const file = join(this.root, "credentials", reference);
          const info = lstatSync(file);
          if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 16384)
            throw new Error("Invalid credential file.");
          secret = readFileSync(file, "utf8").trim();
        }
        if (!secret || secret.length > 16384 || /[\r\n\0]/.test(secret))
          throw new Error("Invalid credential.");
      } catch {
        throw new HarnessError("CREDENTIAL_MISSING");
      }
      redactor.add(secret);
      env[connection.harness === "codex" ? "OPENAI_API_KEY" : "META_API_KEY"] = secret;
    }
    return { env, state_directory: directory, redactor };
  }
}
