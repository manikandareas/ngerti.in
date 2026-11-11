import { Composio } from "@composio/core";
import { DomainError } from "../contracts";
import { appOutput } from "./output";

export type AppSessionConfig = { toolkit: string; account_id?: string; tools?: string[] };
export type AppTool = {
  slug: string;
  toolkit: string;
  description?: string;
  input_schema?: Record<string, unknown>;
};
export type AppCatalogItem = {
  slug: string;
  name: string;
  connected: boolean;
  logo?: string;
  description?: string;
  website?: string;
  categories?: { slug: string; name: string }[];
  tools_count?: number;
  triggers_count?: number;
  no_auth?: boolean;
};

function publicUrl(value?: string) {
  if (!value || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export interface AppHost {
  catalog(
    user: string,
    search: string,
    cursor?: string,
  ): Promise<{ items: AppCatalogItem[]; cursor?: string; metadata_complete?: boolean }>;
  connect(user: string, toolkit: string): Promise<{ account_id: string; connect_url: string }>;
  accounts(user: string): Promise<{ id: string; toolkit: string; active: boolean }[]>;
  session(user: string, config: AppSessionConfig): Promise<string>;
  search(session: string, query: string): Promise<AppTool[]>;
  execute(
    session: string,
    account: string,
    tool: string,
    args: Record<string, unknown>,
    authorize: () => void,
  ): Promise<{
    data: unknown;
    state: "succeeded" | "failed" | "unknown";
    log_id: string | null;
    request_id?: string | null;
    sdk_error?: string | null;
  }>;
}

/** Credentials and SDK session credentials stay exclusively in the backend process. */
export class ComposioHost implements AppHost {
  #client: Composio | undefined;
  constructor(client?: Composio) {
    this.#client = client;
  }
  private client() {
    if (this.#client) return this.#client;
    if (!process.env.COMPOSIO_API_KEY) throw new DomainError("APP_UNAVAILABLE");
    if (!this.#client)
      this.#client = new Composio({
        allowTracking: false,
        disableVersionCheck: true,
        dangerouslyAllowAutoUploadDownloadFiles: false,
        fileUploadDirs: false,
        logLevel: "silent",
      });
    return this.#client;
  }
  private async safe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("APP_UNAVAILABLE");
    }
  }
  async catalog(user: string, search: string, cursor?: string) {
    return this.safe(async () => {
      const session = await this.client().sessions.create(user, {
        sandbox: { enable: false },
        manageConnections: false,
      });
      try {
        const result = await session.toolkits({
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(cursor ? { cursor } : {}),
          limit: 50,
        });
        // Session discovery owns availability/pagination. Enrich a whole page in one
        // SDK call; metadata failure must not hide otherwise available toolkits.
        const metadata = result.items.length
          ? await this.client()
              .toolkits.getMany(
                result.items.map((t) => t.slug),
                { limit: 50 },
              )
              .catch(() => null)
          : [];
        const bySlug = new Map((metadata ?? []).map((t) => [t.slug, t]));
        return {
          items: result.items.map((t): AppCatalogItem => {
            const detail = bySlug.get(t.slug);
            return {
              slug: t.slug,
              name: t.name,
              connected: t.connection?.isActive ?? false,
              logo: publicUrl(detail?.meta.logo ?? t.logo),
              description: detail?.meta.description,
              website: publicUrl(detail?.meta.appUrl),
              categories: detail?.meta.categories ?? [],
              tools_count: detail?.meta.toolsCount,
              triggers_count: detail?.meta.triggersCount,
              no_auth: detail?.noAuth ?? t.isNoAuth,
            };
          }),
          cursor: result.cursor,
          metadata_complete: metadata !== null && result.items.every((t) => bySlug.has(t.slug)),
        };
      } finally {
        await this.client()
          .sessions.delete(session.sessionId)
          .catch(() => {});
      }
    });
  }
  async connect(user: string, toolkit: string) {
    return this.safe(async () => {
      const session = await this.client().sessions.create(user, {
        toolkits: [toolkit],
        sandbox: { enable: false },
        manageConnections: true,
      });
      try {
        const link = await session.authorize(toolkit);
        if (!link.redirectUrl) throw new DomainError("APP_UNAVAILABLE");
        const url = new URL(link.redirectUrl);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new DomainError("APP_UNAVAILABLE");
        return { account_id: link.id, connect_url: link.redirectUrl };
      } finally {
        await this.client()
          .sessions.delete(session.sessionId)
          .catch(() => {});
      }
    });
  }
  async accounts(user: string) {
    return this.safe(async () => {
      const accounts: { id: string; toolkit: string; active: boolean }[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client().connectedAccounts.list({
          userIds: [user],
          limit: 100,
          cursor,
        });
        accounts.push(
          ...page.items.map((a) => ({
            id: a.id,
            toolkit: a.toolkit.slug,
            active: a.status === "ACTIVE" && !a.isDisabled,
          })),
        );
        cursor = page.nextCursor ?? undefined;
        if (accounts.length > 1000) throw new DomainError("APP_UNAVAILABLE");
      } while (cursor);
      return accounts;
    });
  }
  async session(user: string, config: AppSessionConfig) {
    return this.safe(
      async () =>
        (
          await this.client().sessions.create(user, {
            toolkits: [config.toolkit],
            ...(config.account_id
              ? { connectedAccounts: { [config.toolkit]: [config.account_id] } }
              : {}),
            ...(config.tools ? { tools: { [config.toolkit]: { enable: config.tools } } } : {}),
            sandbox: { enable: false },
            manageConnections: false,
            instant: false,
          })
        ).sessionId,
    );
  }
  async search(id: string, query: string) {
    return this.safe(async () => {
      const result = await (await this.client().sessions.use(id)).search({ query });
      if (!result.success) throw new DomainError("APP_UNAVAILABLE");
      return Object.values(result.toolSchemas)
        .filter((t) => t.hasFullSchema && t.inputSchema)
        .map((t) => ({
          slug: t.toolSlug,
          toolkit: t.toolkit.toLowerCase(),
          description: t.description,
          input_schema: t.inputSchema,
        }));
    });
  }
  async execute(
    id: string,
    account: string,
    tool: string,
    args: Record<string, unknown>,
    authorize: () => void,
  ) {
    // Attach/read is a preflight. A failure here proves execute was never submitted.
    const request = { signal: AbortSignal.timeout(25_000) };
    const session = await this.safe(() => this.client().sessions.use(id, undefined, request));
    const selected = Object.values(session.config.connected_accounts ?? {}).flat();
    if (selected.length !== 1 || selected[0] !== account)
      throw new DomainError("SCOPE_DENIED", 403);
    request.signal.throwIfAborted();
    authorize();
    let aborted = () => {};
    try {
      // The account is already pinned in the session. Some live projects reject a redundant
      // per-call account selector even though the current SDK reference advertises it.
      // The exported Session facade omits execute's request-options overload in 0.27.0.
      // Bound the acknowledgement wait without replaying or claiming native cancellation.
      const deadline = new Promise<never>((_resolve, reject) => {
        aborted = () => reject(new DomainError("APP_UNKNOWN"));
        request.signal.addEventListener("abort", aborted, { once: true });
      });
      const result = await Promise.race([session.execute(tool, args), deadline]);
      return {
        data: appOutput(result.data),
        state: result.resultType === "completed" ? ("succeeded" as const) : ("failed" as const),
        log_id: result.logId || null,
      };
    } catch (error) {
      // A timeout, parse failure or lost acknowledgement never authorizes a retry.
      const details = error as {
        name?: string;
        requestId?: string;
        request_id?: string;
        cause?: { requestId?: string; request_id?: string };
      };
      const request =
        details.requestId ??
        details.request_id ??
        details.cause?.requestId ??
        details.cause?.request_id;
      return {
        data: null,
        state: "unknown" as const,
        log_id: null,
        request_id: request && /^[a-zA-Z0-9_-]{1,200}$/.test(request) ? request : null,
        sdk_error:
          details.name && /^[a-zA-Z][a-zA-Z0-9_]{1,100}$/.test(details.name) ? details.name : null,
      };
    } finally {
      request.signal.removeEventListener("abort", aborted);
    }
  }
}
