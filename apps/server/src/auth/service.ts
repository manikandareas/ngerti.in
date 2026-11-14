import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { DomainError } from "../contracts";
import type { AuthenticationConfig } from "./config";
import { initializeAuthentication } from "./database";
import { type EmailDelivery, resendDelivery } from "./email";
import {
  AUTH_PATH,
  type AuthenticationProvider,
  createAuthenticationProvider,
  hashAuthenticationToken,
  NATIVE_CLIENT_ID,
} from "./provider";

export type Principal = {
  userId: string;
  sessionId: string;
  expires: number;
  kind: "web" | "native";
  validate: () => Promise<void>;
};
export type SessionLease = {
  userId?: string;
  organizationId?: string;
  sessionId: string;
  assert: () => Promise<void>;
  authorizeRequest?: (request: Request) => Promise<void>;
  signal: AbortSignal;
  release: () => void;
};
const denied = () => new DomainError("UNAUTHORIZED", 401);

export class Authentication {
  readonly provider: AuthenticationProvider;
  readonly pool: Pool;
  readonly #requests = new WeakMap<Request, Principal>();
  readonly #leases = new Map<string, Set<AbortController>>();
  private constructor(
    readonly config: AuthenticationConfig,
    connectionString: string,
    readonly legacyOwnerId: string,
    readonly deliver: EmailDelivery,
  ) {
    this.pool = new Pool({
      connectionString,
      max: 8,
      connectionTimeoutMillis: 5000,
      options: `-c search_path=${config.schema},pg_catalog`,
      application_name: "ngertiin-auth",
    });
    this.pool.on("error", () => {});
    this.provider = createAuthenticationProvider(config, this.pool, deliver, (id) =>
      this.retire(id),
    );
  }
  static async open(
    config: AuthenticationConfig,
    connectionString: string,
    legacyOwnerId: string,
    deliver: EmailDelivery = resendDelivery(config.email),
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(config.schema))
      throw new Error("Invalid authentication schema.");
    const service = new Authentication(config, connectionString, legacyOwnerId, deliver);
    try {
      await initializeAuthentication(service.pool, service.provider, config, legacyOwnerId);
      return service;
    } catch (error) {
      await service.close();
      throw new Error(
        "Authentication initialization failed; inspect the pinned schema and configuration.",
        { cause: error },
      );
    }
  }
  retire(sessionId: string) {
    for (const controller of this.#leases.get(sessionId) ?? []) controller.abort();
    this.#leases.delete(sessionId);
  }
  async close() {
    for (const sessionId of this.#leases.keys()) this.retire(sessionId);
    await this.pool.end();
  }
  checkOrigin(request: Request, cookieMutation = false) {
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== this.config.origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site" ||
      (cookieMutation && origin !== this.config.origin)
    )
      throw new DomainError("SCOPE_DENIED", 403);
  }
  private async active(userId: string, sessionId: string) {
    const result = await this.pool.query(
      'SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">now() AND u."emailVerified"=true',
      [sessionId, userId],
    );
    if (!result.rowCount) throw denied();
  }
  async authenticate(request: Request): Promise<Principal> {
    this.checkOrigin(request);
    const supplied = request.headers.get("Authorization");
    let principal: Principal;
    if (supplied !== null) {
      if (!/^Bearer ng_at_[A-Za-z0-9_-]+$/.test(supplied)) throw denied();
      const token = supplied.slice(7);
      const validate = async () => {
        let payload: Awaited<ReturnType<typeof this.provider.api.verifyNativeAccess>>;
        try {
          payload = await this.provider.api.verifyNativeAccess({ body: { token } });
        } catch {
          throw denied();
        }
        const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (
          payload.iss !== `${this.config.origin}${AUTH_PATH}` ||
          !audience.includes(this.config.origin) ||
          payload.client_id !== NATIVE_CLIENT_ID ||
          typeof payload.sub !== "string" ||
          typeof payload.sid !== "string" ||
          typeof payload.exp !== "number" ||
          payload.exp * 1000 <= Date.now() ||
          typeof payload.scope !== "string" ||
          !payload.scope.split(" ").includes("ngertiin")
        )
          throw denied();
        await this.active(payload.sub, payload.sid);
        return { userId: payload.sub, sessionId: payload.sid, expires: payload.exp * 1000 };
      };
      const identity = await validate();
      principal = {
        ...identity,
        kind: "native",
        validate: async () => {
          await validate();
        },
      };
    } else {
      let result: Awaited<ReturnType<typeof this.provider.api.getSession>>;
      try {
        result = await this.provider.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true, disableRefresh: true },
        });
      } catch {
        throw denied();
      }
      if (!result?.user.emailVerified) throw denied();
      const { user, session } = result;
      principal = {
        userId: user.id,
        sessionId: session.id,
        expires: new Date(session.expiresAt).getTime(),
        kind: "web",
        validate: async () => this.active(user.id, session.id),
      };
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) this.checkOrigin(request, true);
    }
    this.#requests.set(request, principal);
    return principal;
  }
  principal(request: Request) {
    const principal = this.#requests.get(request);
    if (!principal) throw denied();
    return principal;
  }
  async assertOwner(request: Request) {
    const principal = this.principal(request);
    await principal.validate();
    const result = await this.pool.query(
      "SELECT 1 FROM ngertiin_owner_binding WHERE id=1 AND user_id=$1 AND legacy_owner_id=$2",
      [principal.userId, this.legacyOwnerId],
    );
    if (!result.rowCount) throw new DomainError("SCOPE_DENIED", 403);
  }
  lease(request: Request): SessionLease {
    const principal = this.principal(request);
    const controller = new AbortController();
    const controllers = this.#leases.get(principal.sessionId) ?? new Set<AbortController>();
    controllers.add(controller);
    this.#leases.set(principal.sessionId, controllers);
    const assert = async () => {
      if (controller.signal.aborted || Date.now() >= principal.expires) throw denied();
      await principal.validate();
    };
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        await assert();
      } catch {
        controller.abort();
      } finally {
        checking = false;
      }
    }, 500);
    timer.unref();
    const release = () => {
      clearInterval(timer);
      controllers.delete(controller);
      if (!controllers.size) this.#leases.delete(principal.sessionId);
    };
    controller.signal.addEventListener("abort", release, { once: true });
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      assert,
      signal: controller.signal,
      release,
      authorizeRequest: async (candidate) => {
        const current = await this.authenticate(candidate);
        if (current.userId !== principal.userId || current.sessionId !== principal.sessionId)
          throw denied();
        await assert();
      },
    };
  }
  async self(request: Request) {
    const principal = this.principal(request);
    const user = (
      await this.pool.query('SELECT id,name,email,"emailVerified" FROM "user" WHERE id=$1', [
        principal.userId,
      ])
    ).rows[0];
    return {
      user: { id: user.id, name: user.name, email: user.email, email_verified: user.emailVerified },
      session_id: principal.sessionId,
      authentication: principal.kind,
      expires_at: new Date(principal.expires).toISOString(),
    };
  }
  async sessions(request: Request) {
    const principal = this.principal(request);
    const rows = (
      await this.pool.query(
        'SELECT id,"createdAt","updatedAt","expiresAt","userAgent","deviceKind" FROM session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "createdAt",id LIMIT 100',
        [principal.userId],
      )
    ).rows;
    return {
      sessions: rows.map((row) => ({
        id: row.id,
        current: row.id === principal.sessionId,
        kind: row.deviceKind,
        user_agent: row.userAgent ?? null,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        expires_at: row.expiresAt.toISOString(),
      })),
    };
  }
  async revoke(request: Request, sessionId: string) {
    const principal = this.principal(request);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await client.query(
        'SELECT id FROM session WHERE id=$1 AND "userId"=$2 FOR UPDATE',
        [sessionId, principal.userId],
      );
      if (!session.rowCount) throw new DomainError("NOT_FOUND", 404);
      await client.query('UPDATE "oauthRefreshToken" SET revoked=now() WHERE "sessionId"=$1', [
        sessionId,
      ]);
      await client.query('UPDATE "oauthAccessToken" SET revoked=now() WHERE "sessionId"=$1', [
        sessionId,
      ]);
      await client.query('DELETE FROM session WHERE id=$1 AND "userId"=$2', [
        sessionId,
        principal.userId,
      ]);
      await client.query("COMMIT");
      this.retire(sessionId);
      return { revoked: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async issueBootstrap(email: string, seconds = 900) {
    if (
      !Number.isInteger(seconds) ||
      seconds < 1 ||
      seconds > 3600 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new Error("Invalid owner bootstrap input.");
    const token = randomBytes(32).toString("base64url");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const binding = (
        await client.query("SELECT user_id FROM ngertiin_owner_binding WHERE id=1 FOR UPDATE")
      ).rows[0];
      if (binding.user_id) throw new Error("The initial Owner is already bound.");
      await client.query(
        "INSERT INTO ngertiin_owner_bootstrap VALUES(1,$1,$2,now()+$3*interval '1 second',NULL) ON CONFLICT(id) DO UPDATE SET token_hash=$1,email=$2,expires_at=now()+$3*interval '1 second',consumed_at=NULL",
        [hashAuthenticationToken(token), email.trim().toLowerCase(), seconds],
      );
      await client.query("COMMIT");
      return { token, expires_in: seconds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async claimBootstrap(request: Request, token: string) {
    const principal = this.principal(request);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const binding = (
        await client.query("SELECT user_id FROM ngertiin_owner_binding WHERE id=1 FOR UPDATE")
      ).rows[0];
      const grant = await client.query(
        'UPDATE ngertiin_owner_bootstrap b SET consumed_at=now() FROM "user" u WHERE b.id=1 AND b.token_hash=$1 AND b.email=lower(u.email) AND u.id=$2 AND u."emailVerified"=true AND b.consumed_at IS NULL AND b.expires_at>now() AND $3::boolean=false RETURNING b.id',
        [hashAuthenticationToken(token), principal.userId, Boolean(binding.user_id)],
      );
      if (!grant.rowCount) throw new DomainError("SCOPE_DENIED", 403);
      await client.query("UPDATE ngertiin_owner_binding SET user_id=$1,bound_at=now() WHERE id=1", [
        principal.userId,
      ]);
      await client.query("COMMIT");
      return { owner_bound: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async assertRenewal(token: string) {
    if (!/^ng_rt_[A-Za-z0-9_-]+$/.test(token)) throw denied();
    const result = await this.pool.query(
      'SELECT r.id FROM "oauthRefreshToken" r JOIN session s ON s.id=r."sessionId" JOIN "user" u ON u.id=r."userId" AND u.id=s."userId" WHERE r.token=$1 AND r."clientId"=$2 AND r.revoked IS NULL AND r."expiresAt">now() AND s."expiresAt">now() AND u."emailVerified"=true',
      [hashAuthenticationToken(token.slice("ng_rt_".length)), NATIVE_CLIENT_ID],
    );
    if (!result.rowCount) throw denied();
  }
  /** Each OAuth code exchange gets a device session separate from its authorizing browser. */
  async bindNativeDevice(accessToken: string) {
    const payload = await this.provider.api.verifyNativeAccess({ body: { token: accessToken } });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw denied();
    const context = await this.provider.$context;
    const session = await context.internalAdapter.createSession(payload.sub, false, {
      deviceKind: "native",
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    });
    if (!session) throw denied();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const source = await client.query(
        'SELECT id FROM session WHERE id=$1 AND "userId"=$2 AND "expiresAt">now() FOR UPDATE',
        [payload.sid, payload.sub],
      );
      if (!source.rowCount) throw denied();
      // Use the same explicit token hash configured on the provider, excluding the public prefix.
      const rebound = await client.query(
        'UPDATE "oauthAccessToken" SET "sessionId"=$1 WHERE token=$2 AND "sessionId"=$3 AND revoked IS NULL RETURNING "refreshId"',
        [session.id, hashAuthenticationToken(accessToken.slice("ng_at_".length)), payload.sid],
      );
      if (!rebound.rowCount || !rebound.rows[0].refreshId) throw denied();
      await client.query(
        'UPDATE "oauthRefreshToken" SET "sessionId"=$1 WHERE id=$2 AND "sessionId"=$3 AND revoked IS NULL',
        [session.id, rebound.rows[0].refreshId, payload.sid],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await context.internalAdapter.deleteSession(session.token);
      throw error;
    } finally {
      client.release();
    }
  }
}
