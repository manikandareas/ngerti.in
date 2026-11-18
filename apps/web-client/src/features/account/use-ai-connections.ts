import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
import { durableCommand, request } from "@/lib/api-client";
import { reserveAuthorizationBrowser } from "@/lib/authorization-browser";
import { assertScope, clientScope } from "@/lib/client-scope";
import { refreshLocalModels } from "@/lib/local-models";
import type { Availability, Connection, Snapshot } from "@/types/workspace";
import { useAccountAction } from "./account-forms";
import { availableAIConnections, connectionReady } from "./ai-integration";
import type { Maintenance } from "./harness-maintenance";
import type { OnboardingHarness } from "./onboarding-harnesses";
import { useAccount } from "./session";
import type { WorkspaceAccess } from "./types";

type PendingLogin = {
  harness: OnboardingHarness;
  connection: string;
  url: string;
  code?: string;
  expires: number;
};
type Provisioned = { agent_id: string; thread_id: string };

export function useAIConnections({
  onboarding = false,
  ownership = "personal",
  prepareAudience,
  onChanged,
}: {
  onboarding?: boolean;
  ownership?: "personal" | "organization";
  prepareAudience?: () => Promise<string>;
  onChanged?: () => Promise<unknown>;
} = {}) {
  const account = useAccount();
  const callbacks = useRef({ prepareAudience, onChanged });
  callbacks.current = { prepareAudience, onChanged };
  const scope = useRef(clientScope()).current;
  const action = useAccountAction();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [allowedOrganizationConnections, setAllowedOrganizationConnections] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState<PendingLogin | null>(null);
  const provisioned = useRef<Provisioned | null>(null);
  const operation = useRef<{ signature: string; key: string; audienceId?: string }>({
    signature: "",
    key: crypto.randomUUID(),
  });
  const inspected = useRef(new Map<string, Promise<Connection>>());
  const connecting = useRef(false);
  const browser = useRef<ReturnType<typeof reserveAuthorizationBrowser> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      browser.current?.cancel();
    };
  }, []);

  const accept = useCallback((connection: Connection) => {
    setConnections((items) => [connection, ...items.filter((item) => item.id !== connection.id)]);
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      assertScope(scope);
      const [items, grants] = await Promise.all([
        request<Connection[]>(
          "/v1/entities/connection",
          undefined,
          undefined,
          signal,
          15000,
          scope,
        ),
        request<WorkspaceAccess>("/v1/data/access", undefined, undefined, signal, 15000, scope),
      ]);
      setConnections(items);
      setAllowedOrganizationConnections(grants.allowed_organization_connection_ids);
      setError("");
      return items;
    },
    [scope],
  );

  const refreshLocal = useCallback(
    async (signal?: AbortSignal) => {
      if (ownership !== "personal") return false;
      const available = await refreshLocalModels({ signal, scope });
      setLocal(available);
      return available;
    },
    [ownership, scope],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        assertScope(scope);
        if (onboarding)
          provisioned.current = await durableCommand<Provisioned>(
            "provision",
            "/v1/data/provision",
            {},
          );
        signal?.throwIfAborted();
        const [_, discovered] = await Promise.all([refresh(signal), refreshLocal(signal)]);
        if (discovered) await refresh(signal);
      } catch (failure) {
        if (!signal?.aborted && !(failure instanceof DOMException && failure.name === "AbortError"))
          setError(
            failure instanceof Error ? failure.message : "Could not load your AI connections.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [refresh, refreshLocal, scope, onboarding],
  );

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  useEffect(() => {
    const abort = new AbortController();
    const reconnect = () => void load(abort.signal);
    window.addEventListener("online", reconnect);
    return () => {
      abort.abort();
      window.removeEventListener("online", reconnect);
    };
  }, [load]);
  useFeedbackToast(error, { retry: () => void load() });

  const inspect = useCallback(
    (id: string, signal?: AbortSignal) => {
      const current = inspected.current.get(id);
      if (current) return current;
      const completion = request<Connection>(
        `/v1/connections/${id}/inspect`,
        {},
        undefined,
        signal,
        30000,
        scope,
      )
        .then((connection) => {
          accept(connection);
          return connection;
        })
        .finally(() => {
          inspected.current.delete(id);
        });
      inspected.current.set(id, completion);
      return completion;
    },
    [accept, scope],
  );

  useEffect(() => {
    if (!login) return;
    const abort = new AbortController();
    let checking = false;
    let failures = 0;
    const check = async () => {
      if (checking || abort.signal.aborted) return;
      if (Date.now() > login.expires) {
        setLogin(null);
        toast.warning("Sign in expired. Try again.");
        return;
      }
      checking = true;
      try {
        const updated = await inspect(login.connection, abort.signal);
        failures = 0;
        if (connectionReady(updated)) {
          setLogin(null);
          toast.success("AI account connected.");
          await callbacks.current.onChanged?.();
        } else if (updated.login === "rejected") {
          setLogin(null);
          toast.error("Sign in was not approved. Try again.");
        } else if (
          updated.login === "authenticated" &&
          updated.effective_billing_source !== updated.authentication.billing_source
        ) {
          setLogin(null);
          toast.warning(
            "This account uses a different billing method. Choose the matching connection method.",
          );
        }
      } catch (failure) {
        if (!abort.signal.aborted && ++failures >= 3) {
          setLogin(null);
          toast.error(
            failure instanceof Error ? failure.message : "Could not check sign in. Try again.",
          );
        }
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => void check(), 5000);
    const focused = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", focused);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focused);
    };
  }, [inspect, login]);

  const personal = connections.filter(
    (connection) =>
      connection.state === "active" && connection.actor_id === account.session?.user.id,
  );
  const owned =
    ownership === "personal"
      ? personal
      : connections.filter(
          (connection) => connection.state === "active" && connection.ownership === "organization",
        );
  const available = onboarding
    ? availableAIConnections(
        connections,
        account.session?.user.id ?? "",
        allowedOrganizationConnections,
      )
    : owned;
  function connectionFor(harness: OnboardingHarness) {
    return (
      available.find(
        (connection) => connection.harness === harness && connectionReady(connection),
      ) ?? owned.find((connection) => connection.harness === harness)
    );
  }

  async function connect(harness: OnboardingHarness, connectionId?: string) {
    if (connecting.current || action.busy || login) return false;
    let success = false;
    connecting.current = true;
    const reserved = reserveAuthorizationBrowser();
    browser.current = reserved;
    try {
      await action.run(async () => {
        assertScope(scope);
        const availability = await request<Availability[]>(
          "/v1/harnesses",
          undefined,
          undefined,
          undefined,
          15000,
          scope,
        );
        const runtime = availability.find((item) => item.harness === harness);
        if (runtime?.state !== "supported")
          throw new Error("Update this harness to a supported version before connecting.");
        if (!runtime.manifest.authentication_methods.includes("native_login"))
          throw new Error(
            "Account sign in is not available for this harness. API keys can be added in Settings.",
          );
        const readiness = await request<Maintenance>(
          "/v1/harnesses/maintenance",
          undefined,
          undefined,
          undefined,
          15000,
          scope,
        );
        const nativeLogin = readiness.native_login.find((item) => item.harness === harness);
        if (!nativeLogin?.ready)
          throw new Error(nativeLogin?.reason ?? "Account sign-in is not ready on this server.");
        let connection = owned.find(
          (item) =>
            item.harness === harness &&
            item.authentication.method === "native_login" &&
            (!connectionId || item.id === connectionId),
        );
        if (connectionId && !connection)
          throw new Error("This connection is no longer available. Refresh and try again.");
        if (!connection) {
          const signature = harness;
          if (operation.current.signature !== signature)
            operation.current = { signature, key: crypto.randomUUID() };
          const audienceId =
            ownership === "organization"
              ? (operation.current.audienceId ?? (await callbacks.current.prepareAudience?.()))
              : null;
          if (ownership === "organization" && !audienceId)
            throw new Error("Choose who can use this connection before connecting.");
          if (audienceId) operation.current.audienceId = audienceId;
          assertScope(scope);
          connection = await request<Connection>(
            "/v1/connections",
            {
              harness,
              ownership,
              audience_id: audienceId,
              authentication: { method: "native_login", billing_source: "subscription" },
            },
            operation.current.key,
            undefined,
            30000,
            scope,
          );
          operation.current = { signature: "", key: crypto.randomUUID() };
          accept(connection);
        }
        const observed = await inspect(connection.id);
        if (connectionReady(observed)) {
          toast.success("AI account connected.");
          await callbacks.current.onChanged?.();
          success = true;
          return;
        }
        const result = await request<{
          auth_url?: string;
          user_code?: string;
          expires_in_seconds?: number;
        }>(`/v1/connections/${connection.id}/login`, {}, undefined, undefined, 30000, scope);
        const url = new URL(result.auth_url ?? "");
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error("The sign in link is invalid. Try again.");
        if (!mounted.current) return;
        setLogin({
          harness,
          connection: connection.id,
          url: url.href,
          code: result.user_code,
          expires: Date.now() + Math.min(result.expires_in_seconds ?? 600, 600) * 1000,
        });
        success = true;
        if (!(await reserved.open(url.href)))
          toast.warning("Could not open the browser. Use Open browser to finish signing in.");
      });
      return success;
    } finally {
      reserved.cancel();
      if (browser.current === reserved) browser.current = null;
      connecting.current = false;
    }
  }

  async function openLogin() {
    if (!login || action.busy || !mounted.current) return;
    const reserved = reserveAuthorizationBrowser();
    try {
      await action.run(async () => {
        assertScope(scope);
        if (Date.now() > login.expires) {
          setLogin(null);
          throw new Error("Sign in expired. Try connecting again.");
        }
        if (!(await reserved.open(login.url)))
          throw new Error("Could not open the browser. Allow popups and try again.");
      });
    } finally {
      reserved.cancel();
    }
  }

  async function checkConnection(connection: Connection) {
    await action.run(async () => {
      if (connectionReady(await inspect(connection.id))) {
        setLogin(null);
        toast.success("AI account connected.");
      } else toast.info("This account still needs to finish signing in.");
    });
  }

  async function cancelLogin() {
    if (!login) return;
    await action.run(async () => {
      await request(
        `/v1/connections/${login.connection}/login/cancel`,
        {},
        undefined,
        undefined,
        15000,
        scope,
      );
      setLogin(null);
    });
  }

  async function finish(connection: Connection, done: () => Promise<unknown>) {
    if (!connectionReady(connection)) return;
    await action.run(async () => {
      assertScope(scope);
      const model = connection.models[0];
      await durableCommand(`default-provider:${connection.harness}`, "/v1/ai/selections", {
        scope: "user",
        harness: connection.harness,
        selection: { connection_id: connection.id, model_id: model.id, reasoning: null },
      });
      const workspace = provisioned.current;
      if (workspace) {
        const snapshot = await request<Snapshot>(
          `/v1/threads/${workspace.thread_id}/snapshot`,
          undefined,
          undefined,
          undefined,
          15000,
          scope,
        );
        const primary = snapshot.agents.find((agent) => agent.id === workspace.agent_id);
        if (primary && snapshot.runs.length === 0 && primary.harness !== connection.harness)
          await durableCommand(
            `onboarding-harness:${primary.id}`,
            `/v1/agents/${primary.id}/configuration`,
            {
              expected_revision: primary.revision,
              changes: {
                harness: connection.harness,
                connection_id: connection.id,
                model_id: model.id,
                reasoning: null,
                billing_source: connection.authentication.billing_source,
              },
            },
          );
      }
      await done();
    });
  }

  return {
    personal,
    owned,
    available,
    refresh: async () => {
      await action.run(async () => {
        await load();
        await callbacks.current.onChanged?.();
      });
    },
    loading,
    local,
    error,
    busy: action.busy,
    login,
    connectionFor,
    connect,
    openLogin,
    checkConnection,
    cancelLogin,
    finish,
    savedKey: async (connection: Connection) => {
      accept(connection);
      await action.run(async () => {
        await inspect(connection.id);
        await refresh();
        await callbacks.current.onChanged?.();
      });
    },
  };
}
