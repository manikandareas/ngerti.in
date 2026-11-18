import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import type { Entity } from "../contracts";
import { type HarnessId, requireAvailable } from "./availability";
import type { HarnessAdapter, HarnessClient } from "./client";
import { CredentialContexts } from "./context";
import {
  type apiKeyCheckInput,
  type apiKeyCheckResult,
  HarnessError,
  unknownCapabilities,
} from "./contracts";
import { connectionProvider, credentialEnvironment } from "./providers";
import type { HarnessDetector } from "./runtime";

export class ApiKeyChecks {
  #active = 0;
  constructor(
    private readonly adapters: Partial<Record<HarnessId, HarnessAdapter>>,
    private readonly detect: HarnessDetector,
    private readonly http: (url: string, init: RequestInit) => Promise<Response> = fetch,
  ) {}

  async checkCandidate(input: z.infer<typeof apiKeyCheckInput>, signal?: AbortSignal) {
    if (this.#active >= 4) throw new HarnessError("ADAPTER_UNAVAILABLE");
    this.#active++;
    try {
      return await this.inspect(input, signal);
    } finally {
      this.#active--;
    }
  }

  private async inspect(
    input: z.infer<typeof apiKeyCheckInput>,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof apiKeyCheckResult>> {
    const provider = connectionProvider(input.harness, input.provider_id);
    credentialEnvironment(input.harness, provider);
    const adapter = this.adapters[input.harness];
    if (!adapter) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const available = requireAvailable(await this.detect(input.harness));
    const abort = AbortSignal.any([AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]);
    abort.throwIfAborted();
    const requiresProviderCatalogCheck = provider === "openai" || provider === "anthropic";
    if (requiresProviderCatalogCheck) {
      const response = await this.http(
        provider === "openai"
          ? "https://api.openai.com/v1/models"
          : "https://api.anthropic.com/v1/models",
        {
          method: "GET",
          redirect: "error",
          signal: abort,
          headers:
            provider === "openai"
              ? { Authorization: `Bearer ${input.api_key}` }
              : { "x-api-key": input.api_key, "anthropic-version": "2023-06-01" },
        },
      );
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        throw new HarnessError("AUTH_REJECTED");
      if (response.status === 429) throw new HarnessError("PROVIDER_LIMIT");
      if (!response.ok) throw new HarnessError("PROTOCOL_ERROR");
    }
    const root = mkdtempSync(join(tmpdir(), "ngertiin-key-check-"));
    const now = new Date().toISOString();
    const candidate: Entity<"connection"> = {
      id: crypto.randomUUID(),
      kind: "connection",
      owner_id: crypto.randomUUID(),
      actor_id: null,
      revision: 1,
      grant_revision: 1,
      created_at: now,
      updated_at: now,
      harness: input.harness,
      provider_id: provider,
      ownership: "personal",
      audience_id: null,
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
      state: "active",
      account_id: null,
      effective_billing_source: "unknown",
      login: "unknown",
      discovery: "not_attempted",
      models: [],
      inference: "not_attempted",
      capabilities: { ...unknownCapabilities },
    };
    let client: HarnessClient | undefined;
    const stop = () => {
      void client?.close().catch(() => {});
    };
    abort.addEventListener("abort", stop, { once: true });
    try {
      const launch = new CredentialContexts(root, () => input.api_key).create(candidate);
      client = await adapter.connect({
        ...launch,
        scoped: true,
        signal: abort,
        purpose: "routing",
        executable: available.executable,
        connection_id: candidate.id,
        agent_id: candidate.id,
        thread_id: candidate.id,
        workspace: {
          id: candidate.id,
          root: join(launch.state_directory, "account-check"),
          revision: 1,
        },
      });
      abort.throwIfAborted();
      const account = await client.inspect();
      abort.throwIfAborted();
      if (account.auth_method !== "api_key" || account.billing_source !== "api_key")
        throw new HarnessError("BILLING_MISMATCH");
      if (account.login !== "authenticated") throw new HarnessError("AUTH_REJECTED");
      const models = await client.discoverModels();
      abort.throwIfAborted();
      if (!models.length) throw new HarnessError("MODEL_UNAVAILABLE");
      return { checked: true, model_count: models.length };
    } finally {
      abort.removeEventListener("abort", stop);
      try {
        await client?.close();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
}
