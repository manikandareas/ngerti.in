import { createHmac, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { z } from "zod";
import { routeAccess } from "../api-access";
import { isAuthenticationRoute } from "../auth/http";
import type { Authentication, Principal } from "../auth/service";
import { DomainError, id } from "../contracts";
import { Conversations } from "../conversations";
import type { Lifecycle } from "../lifecycle";
import type { DataContext } from "../persistence/access-context";
import { databaseDomainError } from "../persistence/errors";
import type { AccessContext } from "./contracts";
import { preferenceChanges, teamAgentWrite } from "./data-contracts";
import { accessContext, audit, deny } from "./database";
import { isOrganizationPath } from "./paths";
import { Organizations } from "./service";
import { audienceAllows } from "./workgroups";

export class ScopedData {
  readonly organizations: Organizations;
  readonly requests = new WeakSet<Request>();
  constructor(
    readonly lifecycle: Lifecycle,
    readonly auth: Authentication,
  ) {
    this.organizations = new Organizations(auth);
    lifecycle.store.scopeRunner = (action) => this.backgroundScopes(action);
  }
  async context(request: Request): Promise<DataContext> {
    const organizationId = id.parse(request.headers.get("X-Ngertiin-Organization"));
    const principal = this.auth.principal(request);
    const access = await this.organizations.context(request, organizationId);
    return this.resolve(access, principal.validate, principal);
  }
  private async resolve(
    access: AccessContext,
    validatePrincipal: () => Promise<unknown> = async () => {},
    principal?: Principal,
  ): Promise<DataContext> {
    const organizationId = access.organization_id;
    const grants = await this.lifecycle.store.teamGrants(organizationId);
    const invocable: string[] = [];
    const allowedConnections: string[] = [];
    const allowedAppConnections: string[] = [];
    const tx = await this.auth.pool.connect();
    try {
      for (const grant of await this.lifecycle.store.connectionGrants(organizationId))
        if (
          grant.audience_id &&
          (await audienceAllows(tx, organizationId, access.user_id, grant.audience_id))
        )
          allowedConnections.push(grant.id);
      for (const grant of await this.lifecycle.store.connectionGrants(
        organizationId,
        "app_connection",
      ))
        if (
          grant.audience_id &&
          (await audienceAllows(tx, organizationId, access.user_id, grant.audience_id))
        )
          allowedAppConnections.push(grant.id);
      for (const grant of grants)
        if (await audienceAllows(tx, organizationId, access.user_id, grant.audience_id))
          invocable.push(grant.agent_id);
    } finally {
      tx.release();
    }
    const managed = access.role === "member" ? [] : grants.map((grant) => grant.agent_id);
    const acquire = async (session: boolean) => {
      if (session) await validatePrincipal();
      const connection = await this.auth.pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [
          organizationId,
        ]);
        const validate = async (privateWork = false) => {
          if (session && principal) {
            const current = await connection.query(
              'SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">now() AND u."emailVerified"=true FOR SHARE OF s,u',
              [principal.sessionId, principal.userId],
            );
            if (!current.rowCount || Date.now() >= principal.expires)
              throw new DomainError("UNAUTHORIZED", 401);
          }
          return this.organizations.assertCurrent(access, !session || privateWork, connection);
        };
        await validate();
        const release = async () => {
          try {
            await connection.query("ROLLBACK");
          } finally {
            connection.release();
          }
        };
        return Object.assign(release, { validate });
      } catch (error) {
        await connection.query("ROLLBACK");
        connection.release();
        throw error;
      }
    };
    return {
      organizationId,
      userId: access.user_id,
      membershipGeneration: access.membership_generation,
      authorizationGeneration: access.authorization_generation,
      readableAgents: [...new Set([...invocable, ...managed])],
      invocableAgents: invocable,
      managedAgents: managed,
      canManage: access.role !== "member",
      allowedConnections,
      allowedAppConnections,
      validateAudience: async (id) => {
        if (
          !(
            await this.auth.pool.query(
              "SELECT 1 FROM ngertiin_audiences WHERE organization_id=$1 AND id=$2",
              [organizationId, id],
            )
          ).rowCount
        )
          throw deny();
      },
      validateResources: async () => this.organizations.assertCurrent(access, true),
      acquire: () => acquire(true),
      acquireResources: () => acquire(false),
      validate: async (privateWork = false) => {
        await validatePrincipal();
        return this.organizations.assertCurrent(access, privateWork);
      },
    };
  }
  private async backgroundScopes(action: () => Promise<void>) {
    const rows = (
      await this.auth.pool.query(
        "SELECT organization_id,user_id FROM ngertiin_membership_state WHERE status='active' AND private_work_suspended=false ORDER BY organization_id,user_id",
      )
    ).rows;
    for (const row of rows) {
      try {
        const tx = await this.auth.pool.connect();
        let access: AccessContext;
        try {
          access = await accessContext(tx, row.user_id, row.organization_id);
        } finally {
          tx.release();
        }
        const context = await this.resolve(access);
        await context.validate(true);
        await this.lifecycle.store.withDataContext(context, action);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "SCOPE_DENIED") throw error;
      }
    }
  }
  eventContext(context: DataContext) {
    const payload = Buffer.from(
      JSON.stringify([
        context.organizationId,
        context.userId,
        context.membershipGeneration,
        context.authorizationGeneration,
      ]),
    ).toString("base64url");
    return `${payload}.${createHmac("sha256", this.auth.config.secret).update(payload).digest("base64url")}`;
  }
  checkCursor(request: Request, context: DataContext) {
    const url = new URL(request.url);
    if (
      !["/v1/events", "/v1/events/stream"].includes(url.pathname) &&
      !/\/threads\/[^/]+\/(snapshot|history|timeline)$/.test(url.pathname)
    )
      return;
    const cursor =
      request.headers.get("Last-Event-ID") ??
      url.searchParams.get("after") ??
      url.searchParams.get("before") ??
      "0";
    if (cursor === "0") return;
    const expected = Buffer.from(this.eventContext(context));
    const supplied = Buffer.from(request.headers.get("X-Ngertiin-Event-Context") ?? "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw deny();
  }
  register(api: Elysia) {
    const store = this.lifecycle.store;
    const command = async <T>(request: Request, body: unknown, action: () => Promise<T>) =>
      store.command(
        id.parse(request.headers.get("Idempotency-Key")),
        { method: request.method, path: new URL(request.url).pathname, body },
        action,
      );
    api
      .post(
        "/v1/data/provision",
        async ({ request, body }) => {
          const result = await command(request, body, async () => {
            const scope = store.dataContext;
            if (!scope) throw deny();
            const old = (
              await store.query(
                "SELECT agent_id,thread_id,welcome_message_id FROM private_provisioning WHERE organization_id=$1 AND actor_id=$2",
                [scope.organizationId, scope.userId],
              )
            ).rows[0];
            if (old) return old;
            const result = await new Conversations(this.lifecycle).setup();
            await store.query(
              "INSERT INTO private_provisioning(organization_id,actor_id,agent_id,thread_id,welcome_message_id) VALUES($1,$2,$3,$4,$5)",
              [
                scope.organizationId,
                scope.userId,
                result.agent_id,
                result.thread_id,
                result.welcome_message_id,
              ],
            );
            return result;
          });
          const scope = store.dataContext;
          if (!scope) throw deny();
          await this.auth.pool.query(
            "UPDATE ngertiin_membership_provisioning SET status='materialized',updated_at=now() WHERE organization_id=$1 AND user_id=$2 AND membership_generation=$3 AND status='pending'",
            [scope.organizationId, scope.userId, scope.membershipGeneration],
          );
          return result;
        },
        { body: z.strictObject({}) },
      )
      .post(
        "/v1/data/team-agents",
        async ({ request, body }) =>
          store.publishShared(() =>
            command(request, body, async () => {
              const scope = store.dataContext;
              if (!scope?.canManage) throw deny();
              const audience = await this.auth.pool.query(
                "SELECT 1 FROM ngertiin_audiences WHERE organization_id=$1 AND id=$2",
                [scope.organizationId, body.audience_id],
              );
              if (!audience.rowCount) throw deny();
              const { audience_id: audienceId, ...profile } = body;
              const agent = await this.lifecycle.createAgent({ ...profile, connection_id: null });
              await store.query(
                "INSERT INTO team_agent_grants(organization_id,agent_id,audience_id) VALUES($1,$2,$3)",
                [scope.organizationId, agent.id, audienceId],
              );
              return agent;
            }),
          ),
        { body: teamAgentWrite },
      )
      .post(
        "/v1/organizations/:organizationId/agent-access/:id",
        async ({ request, params, body }) =>
          this.organizations.database.command(
            request,
            params.organizationId,
            body,
            "manage",
            async (tx, actor) => {
              const audience = await tx.query(
                "SELECT 1 FROM ngertiin_audiences WHERE organization_id=$1 AND id=$2",
                [params.organizationId, body.audience_id],
              );
              if (!audience.rowCount) throw deny();
              const result = await tx.query(
                `UPDATE "${store.schema}".team_agent_grants SET audience_id=$3 WHERE organization_id=$1 AND agent_id=$2`,
                [params.organizationId, params.id, body.audience_id],
              );
              if (!result.rowCount) throw deny();
              await audit(tx, params.organizationId, actor, "agent.audience_saved", params.id);
              return { updated: true };
            },
          ),
        { params: z.object({ organizationId: id, id }), body: z.strictObject({ audience_id: id }) },
      )
      .post(
        "/v1/data/team-agents/:id/configuration",
        async ({ request, params, body }) =>
          store.publishShared(() =>
            command(request, body, async () => {
              if (!store.dataContext?.managedAgents.includes(params.id)) throw deny();
              return this.lifecycle.updateAgent(params.id, body);
            }),
          ),
        {
          params: z.object({ id }),
          body: z.strictObject({
            expected_revision: z.int().positive(),
            changes: z.strictObject({
              name: z.string().min(1).max(200).optional(),
              instructions: z.string().max(100_000).optional(),
              soul: z.string().max(100_000).optional(),
            }),
          }),
        },
      )
      .post(
        "/v1/data/agents/:id/preferences",
        async ({ request, params, body }) =>
          command(request, body, async () => {
            await store.assertInvocation(params.id);
            const previous = (await store.list("agent_preference", { agent_id: params.id }))[0];
            const now = new Date().toISOString();
            return store.put(
              {
                id: previous?.id ?? crypto.randomUUID(),
                owner_id: store.ownerId,
                kind: "agent_preference",
                agent_id: params.id,
                revision: (previous?.revision ?? 0) + 1,
                created_at: previous?.created_at ?? now,
                updated_at: now,
                changes: body,
              },
              previous?.revision ?? null,
            );
          }),
        { params: z.object({ id }), body: preferenceChanges },
      )
      .post(
        "/v1/data/agents/:id/knowledge",
        async ({ request, params, body }) =>
          store.publishShared(() =>
            command(request, body, async () => {
              if (!store.dataContext?.managedAgents.includes(params.id)) throw deny();
              const now = new Date().toISOString();
              return store.put({
                id: crypto.randomUUID(),
                owner_id: store.ownerId,
                kind: "published_knowledge",
                agent_id: params.id,
                revision: 1,
                created_at: now,
                updated_at: now,
                text: body.text,
                state: "active",
              });
            }),
          ),
        {
          params: z.object({ id }),
          body: z.strictObject({ text: z.string().min(1).max(100_000) }),
        },
      )
      .post(
        "/v1/data/legacy-binding",
        async ({ request, body }) => {
          await this.auth.assertOwner(request);
          return this.organizations.database.transaction(
            this.auth.principal(request),
            true,
            async (tx) => {
              await tx.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [
                body.organization_id,
              ]);
              const access = await accessContext(
                tx,
                this.auth.principal(request).userId,
                body.organization_id,
              );
              if (access.role !== "owner" || body.legacy_owner_id !== store.ownerId) throw deny();
              return store.bindLegacyScope(
                body.organization_id,
                access.user_id,
                access.membership_generation,
              );
            },
          );
        },
        { body: z.strictObject({ organization_id: id, legacy_owner_id: id }) },
      );
  }
  wrap(api: Elysia) {
    const store = this.lifecycle.store;
    const edge = new Elysia()
      .onError(({ error: source, set }) => {
        const error = databaseDomainError(source) ?? source;
        let status = 500;
        let code = "INTERNAL_ERROR";
        if (error instanceof DomainError) {
          status = error.status;
          code = error.code;
        } else if (error instanceof z.ZodError) {
          status = 422;
          code = "INVALID_REQUEST";
        }
        set.status = status;
        return {
          error: {
            code,
            message: "Request could not be completed.",
          },
        };
      })
      .all(
        "*",
        async ({ request }) => {
          const path = new URL(request.url).pathname;
          const policy = routeAccess(path);
          if (
            ["public", "authentication_protocol"].includes(policy.authentication_class) ||
            policy.scope === "authenticated_account" ||
            policy.scope === "guarded_installation" ||
            path === "/v1/harness/tools"
          )
            return api.handle(request);
          // Viewer URLs are session-bound capabilities checked by the viewer gateway on every frame/RPC.
          if (path.startsWith("/v1/machine/viewer/")) return api.handle(request);
          if (
            !request.headers.has("X-Ngertiin-Organization") ||
            isAuthenticationRoute(request) ||
            isOrganizationPath(path) ||
            path === "/v1/data/legacy-binding"
          ) {
            if (path.startsWith("/v1/data/") && path !== "/v1/data/legacy-binding") throw deny();
            if (
              path.startsWith("/v1/") &&
              !isAuthenticationRoute(request) &&
              !isOrganizationPath(path) &&
              !["/v1/contracts", "/v1/data/legacy-binding", "/v1/harness/tools"].includes(path) &&
              (await store.legacyScopeMapped())
            )
              throw deny();
            return api.handle(request);
          }
          await this.auth.authenticate(request);
          if (!(await store.legacyScopeReady())) throw deny();
          const context = await this.context(request);
          // The retired browser controller is never an account-mode execution path.
          if (/^\/v1\/browser(\/|$)/.test(path)) throw deny();
          this.checkCursor(request, context);
          this.requests.add(request);
          return store.withDataContext(context, async () => {
            const response = await api.handle(request);
            await context.validate();
            response.headers.set("X-Ngertiin-Event-Context", this.eventContext(context));
            response.headers.set("Cache-Control", "no-store");
            return response;
          });
        },
        { parse: "none" },
      );
    const stop = edge.stop.bind(edge);
    edge.stop = async (force) => {
      await api.stop(force);
      return edge.server ? stop(force) : edge;
    };
    return edge;
  }
}
