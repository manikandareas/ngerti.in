import type { Elysia } from "elysia";
import { z } from "zod";
import { DomainError, id } from "../contracts";
import { detectHarness } from "../harness/availability";
import {
  apiKeyConnectionInput,
  brokerContract,
  connectionInput,
  HarnessError,
  harnessId,
} from "../harness/contracts";
import { piProviderConfiguration } from "../harness/native-configuration";
import { selectionInput } from "../harness/selection-contracts";
import type { ApiServices, Command } from "./services";

export function registerHarnessRoutes(api: Elysia, services: ApiServices, command: Command) {
  const retire = async (connection: Awaited<ReturnType<typeof services.connections.get>>) => {
    await services.accounts?.retire?.(connection.id);
    await services.broker?.retireConnection(connection.id);
    services.credentialStorage?.retire(
      connection.id,
      "credential_ref" in connection.authentication
        ? connection.authentication.credential_ref
        : undefined,
    );
  };
  return api
    .get("/v1/harness/contracts", () => brokerContract())
    .get("/v1/harnesses", async () =>
      Promise.all(harnessId.options.map(async (id) => (services.detect ?? detectHarness)(id))),
    )
    .get("/v1/harnesses/maintenance", async ({ request }) => {
      let canUpdate = false;
      try {
        await services.authentication.assertOwner(request);
        canUpdate = !!services.updater;
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "SCOPE_DENIED") throw error;
      }
      return {
        can_update: canUpdate,
        updating: services.updater?.updating ?? [],
        operations: services.updater?.jobs.operations ?? [],
        native_login: await Promise.all(
          harnessId.options.map(
            (harness) =>
              services.loginReadiness?.check(harness) ?? {
                harness,
                ready: false,
                reason: "The server cannot check account sign-in readiness yet.",
              },
          ),
        ),
      };
    })
    .post(
      "/v1/harnesses/:harness/update",
      async ({ request, params, body, set }) => {
        await services.authentication.assertOwner(request);
        const commandId = id.parse(request.headers.get("Idempotency-Key"));
        if (!services.updater) throw new HarnessError("ADAPTER_UNAVAILABLE");
        const lease = services.authentication.lease(request);
        try {
          await lease.assert();
          const result = await services.updater.start(
            params.harness,
            body.expected_version,
            commandId,
            lease.signal,
          );
          void result.completion.finally(lease.release).catch(() => {});
          set.status = 202;
          return result.job;
        } catch (error) {
          lease.release();
          throw error;
        }
      },
      {
        params: z.object({ harness: harnessId }),
        body: z.strictObject({ expected_version: z.string().max(100).nullable() }),
      },
    )
    .post(
      "/v1/connections",
      async ({ request, body }) =>
        await command(request, body, async () => {
          if (
            body.authentication.method === "local_config" ||
            (services.connections.lifecycle.store.dataContext &&
              "credential_ref" in body.authentication)
          )
            throw new DomainError("SCOPE_DENIED", 403);
          return services.connections.create(body);
        }),
      { body: connectionInput },
    )
    .post(
      "/v1/ai/selections",
      ({ request, body }) => command(request, body, () => services.connections.saveSelection(body)),
      { body: selectionInput },
    )
    .post(
      "/v1/connections/api-key",
      async ({ request, body }) => {
        const storage = services.credentialStorage;
        if (!storage) throw new HarnessError("ADAPTER_UNAVAILABLE");
        let reference: string | undefined;
        try {
          // The command store retains a SHA-256 fingerprint and secret-free receipt only.
          return await command(request, body, async () => {
            reference = storage.write(
              body.api_key,
              !!services.connections.lifecycle.store.dataContext,
            );
            return await services.connections.create({
              harness: body.harness,
              provider_id: body.provider_id,
              ownership: body.ownership,
              audience_id: body.audience_id,
              authentication: {
                method: "api_key",
                billing_source: "api_key",
                credential_ref: reference,
              },
            });
          });
        } catch (error) {
          if (reference) storage.remove(reference);
          throw error;
        }
      },
      { body: apiKeyConnectionInput },
    )
    .post(
      "/v1/connections/native-configuration",
      async ({ request, body }) => {
        const storage = services.credentialStorage;
        if (!storage) throw new HarnessError("ADAPTER_UNAVAILABLE");
        let reference: string | undefined;
        try {
          return await command(request, body, async () => {
            reference = storage.write(JSON.stringify(body.configuration), true);
            return services.connections.create({
              harness: body.harness,
              provider_id: body.provider_id,
              ownership: body.ownership,
              audience_id: body.audience_id,
              authentication: {
                method: "harness_config",
                billing_source: "api_key",
                credential_ref: reference,
              },
            });
          });
        } catch (error) {
          if (reference) storage.remove(reference);
          throw error;
        }
      },
      {
        body: z.strictObject({
          harness: z.literal("pi"),
          provider_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
          ownership: connectionInput.shape.ownership,
          audience_id: connectionInput.shape.audience_id,
          configuration: piProviderConfiguration,
        }),
      },
    )
    .post(
      "/v1/connections/:id/rotate-key",
      async ({ request, params, body }) => {
        const storage = services.credentialStorage;
        if (!storage) throw new HarnessError("ADAPTER_UNAVAILABLE");
        await services.connections.assertManagement(params.id);
        let reference: string | undefined;
        let result: {
          retired: Awaited<ReturnType<typeof services.connections.get>>;
          replacement: Awaited<ReturnType<typeof services.connections.get>>;
        };
        try {
          result = await command(request, body, async () => {
            const old = await services.connections.assertManagement(params.id);
            if (old.state !== "active" || old.authentication.method !== "api_key")
              throw new HarnessError("BILLING_MISMATCH");
            reference = storage.write(
              body.api_key,
              !!services.connections.lifecycle.store.dataContext,
            );
            const replacement = await services.connections.create({
              harness: old.harness,
              provider_id: old.provider_id,
              ownership: old.ownership,
              audience_id: old.audience_id,
              authentication: {
                method: "api_key",
                billing_source: "api_key",
                credential_ref: reference,
              },
            });
            return { retired: await services.connections.revoke(old.id), replacement };
          });
        } catch (error) {
          if (reference) storage.remove(reference);
          throw error;
        }
        await retire(result.retired);
        return { ...result, selection_action: "explicitly_select_replacement" as const };
      },
      { params: z.object({ id }), body: apiKeyConnectionInput.pick({ api_key: true }) },
    )
    .post(
      "/v1/connections/:id/revoke",
      async ({ request, params }) => {
        await services.connections.assertManagement(params.id);
        const connection = await command(
          request,
          {},
          async () => await services.connections.revoke(params.id),
        );
        await retire(connection);
        return connection;
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/local/refresh",
      async ({ request }) => {
        if (!services.localAccounts) return { available: false };
        try {
          await services.authentication.assertOwner(request);
        } catch (error) {
          if (error instanceof DomainError && error.code === "SCOPE_DENIED")
            return { available: false };
          throw error;
        }
        return services.localAccounts.refresh();
      },
      { body: z.strictObject({}) },
    )
    .post(
      "/v1/connections/:id/inspect",
      async ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        await services.connections.assertManagement(params.id);
        return services.accounts.inspect(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/:id/login",
      async ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        await services.connections.assertManagement(params.id);
        return services.accounts.login(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/:id/login/cancel",
      async ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        await services.connections.assertManagement(params.id);
        await services.accounts.cancel(params.id);
        return { status: "cancelled" };
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/threads/:id/prepare",
      async ({ params, body }) =>
        (await services.broker?.prewarm(params.id, body.agent_id)) ?? { state: "skipped" as const },
      { params: z.object({ id }), body: z.strictObject({ agent_id: id }) },
    )
    .post(
      "/v1/threads/:id/sessions",
      async ({ params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.openSession(params.id, body.agent_id);
      },
      { params: z.object({ id }), body: z.strictObject({ agent_id: id }) },
    )
    .post("/v1/harness/tools", async ({ request, body }) => {
      const result = await services.tools.rpc(
        (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        body,
      );
      if (result === null) return new Response(null, { status: 202 });
      return result;
    })
    .get("/v1/harness/tools", () => new Response(null, { status: 405 }));
}
