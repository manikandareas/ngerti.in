import { QueryClientProvider } from "@tanstack/react-query";
import { Navigate, useLocation } from "@tanstack/react-router";
import {
  createContext,
  Fragment,
  lazy,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushConversationDraft } from "@/features/conversation/lib/use-conversation-draft";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
import { PreferencesProvider } from "@/hooks/use-preferences";
import { ApiError, command, request } from "@/lib/api-client";
import {
  clearPrivateStorage,
  clientScope,
  onScopeChange,
  setClientScope,
} from "@/lib/client-scope";
import { refreshLocalModels } from "@/lib/local-models";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";
import {
  readProviderConnections,
  readWorkspaceAccess,
  workspaceQueries,
} from "@/lib/workspace-queries";
import { createOrganization as createOrganizationRecord } from "./account-forms";
import { availableAIConnections, connectionReady } from "./ai-integration";
import type { Organization, OrganizationAccess, OrganizationList, UserSession } from "./types";
import "./account.css";

const AccountScreen = lazy(async () => ({
  default: (await import("./account-screen")).AccountScreen,
}));
const Onboarding = lazy(() => import("./onboarding"));

interface AccountState {
  status: "loading" | "ready";
  server: string;
  session: UserSession | null;
  list: OrganizationList;
  organization: Organization | null;
  access: OrganizationAccess | null;
  hasAIIntegration: boolean | null;
  scopeEpoch: number | null;
  error: string;
}
const emptyList: OrganizationList = { organizations: [], creation_limit: 0, created_count: 0 };
const initial: AccountState = {
  status: "loading",
  server: "",
  session: null,
  list: emptyList,
  organization: null,
  access: null,
  hasAIIntegration: null,
  scopeEpoch: null,
  error: "",
};
type Account = AccountState & {
  refresh: () => Promise<void>;
  select: (id: string) => Promise<void>;
  createOrganization: (name: string) => Promise<Organization>;
  logout: () => Promise<void>;
  leaveWorkspace: () => void;
};
const AccountContext = createContext<Account | null>(null);
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("Account access requires the application provider.");
  return account;
}

const selectedKey = (server: string, user: string) =>
  `ngertiin:organization:${encodeURIComponent(server)}:${user}`;
const organizationStorage = () => (window.ngertiinDesktop?.remote ? localStorage : sessionStorage);

async function readSession() {
  const session = await request<UserSession>("/v1/auth/session");
  return session.authentication === "web" &&
    Date.parse(session.expires_at) - Date.now() < 48 * 60 * 60 * 1000
    ? request<UserSession>("/v1/auth/renew", {})
    : session;
}

async function readLegacyContractVersion() {
  const result = await request<unknown>("/v1/contracts");
  if (
    !result ||
    typeof result !== "object" ||
    !("version" in result) ||
    typeof result.version !== "string"
  )
    throw new Error("The server returned an invalid contract version.");
  return result.version;
}

function accessRejected(error: unknown) {
  return (
    error instanceof ApiError && ["UNAUTHORIZED", "SCOPE_DENIED", "NOT_FOUND"].includes(error.code)
  );
}

export default function WorkspaceEntry({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeScope = useSyncExternalStore(onScopeChange, clientScope);
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sequence = useRef(0);
  const mounted = useRef(true);
  const latestRefresh = useRef<Promise<void> | null>(null);
  const creatingOrganization = useRef(false);
  const legacyContract = useRef<{ server: string; version: string } | null>(null);
  const load = useCallback(async (choice?: string) => {
    const generation = ++sequence.current;
    const current = () => mounted.current && generation === sequence.current;
    let server = stateRef.current.server;
    try {
      let session: UserSession;
      try {
        [server, session] = await Promise.all([
          server ||
            request<{ audience: string }>("/v1/auth/native").then((value) => value.audience),
          readSession(),
        ]);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED") throw error;
        if (current()) {
          setClientScope(null);
          setState({ ...initial, status: "ready", server });
        }
        return;
      }
      let version = session.contract_version;
      if (version === undefined) {
        const cached = legacyContract.current;
        version = cached?.server === server ? cached.version : await readLegacyContractVersion();
        if (!current()) return;
        legacyContract.current = { server, version };
      } else {
        legacyContract.current = null;
      }
      if (!/^2\.\d+\./.test(version) || Number(version.split(".")[1]) < 4)
        throw new Error("This server needs a compatible Ngertiin update.");
      const list = await request<OrganizationList>("/v1/organizations");
      if (!current()) return;
      const previous = stateRef.current;
      const saved = organizationStorage().getItem(selectedKey(server, session.user.id));
      const requested =
        choice ??
        (previous.session?.user.id === session.user.id ? previous.organization?.id : null) ??
        saved;
      const organization =
        list.organizations.find((item) => item.id === requested) ??
        (!creatingOrganization.current && list.organizations.length === 1
          ? list.organizations[0]
          : null);
      const access = organization
        ? await request<OrganizationAccess>(`/v1/organizations/${organization.id}`)
        : null;
      if (!current()) return;
      const previousScope = clientScope();
      const scope = setClientScope(
        organization && access
          ? {
              server,
              user: session.user.id,
              organization: organization.id,
              session: session.session_id,
              generation: `${access.membership_generation}:${access.authorization_generation}`,
            }
          : null,
      );
      if (organization)
        organizationStorage().setItem(selectedKey(server, session.user.id), organization.id);
      let hasAIIntegration: boolean | null = null;
      let integrationError = "";
      if (scope) {
        try {
          const [connections, grants] = await Promise.all([
            readProviderConnections(scope),
            readWorkspaceAccess({ scope, revalidate: true }),
          ]);
          hasAIIntegration = availableAIConnections(
            connections,
            session.user.id,
            grants.allowed_organization_connection_ids,
          ).some(connectionReady);
        } catch (failure) {
          if (failure instanceof DOMException && failure.name === "AbortError") return;
          if (accessRejected(failure)) throw failure;
          if (scope === previousScope) hasAIIntegration = previous.hasAIIntegration;
          integrationError =
            failure instanceof Error
              ? failure.message
              : "Could not check your AI connections. Try again.";
        }
      }
      if (!current()) return;
      setState({
        status: "ready",
        server,
        session,
        list,
        organization,
        access,
        hasAIIntegration,
        scopeEpoch: scope?.epoch ?? null,
        error: integrationError,
      });
    } catch (error) {
      if (!current() || (error instanceof DOMException && error.name === "AbortError")) return;
      if (accessRejected(error)) {
        setClientScope(null);
        setState({
          ...initial,
          status: "ready",
          server,
          error: "Access changed. Sign in or choose an organization again.",
        });
      } else
        setState((previous) => ({
          ...previous,
          status: "ready",
          server,
          error: error instanceof Error ? error.message : "Could not connect. Try again.",
        }));
    }
  }, []);
  const refresh = useCallback(
    (choice?: string): Promise<void> => {
      const completion: Promise<void> = load(choice).then(() => {
        const latest = latestRefresh.current;
        if (latest && latest !== completion) return latest;
      });
      latestRefresh.current = completion;
      const finished = () => {
        if (latestRefresh.current === completion) latestRefresh.current = null;
      };
      void completion.then(finished, finished);
      return completion;
    },
    [load],
  );
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!state.session && !state.error && !window.ngertiinDesktop?.remote) return;
    const check = () => {
      if (isPageVisible() && !latestRefresh.current) void refresh();
    };
    const online = () => {
      legacyContract.current = null;
      check();
    };
    const changed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== "ngertiin:session-change") return;
      if (event instanceof CustomEvent && event.detail === 403) {
        void refresh();
        return;
      }
      // Remove private surfaces before rechecking the shared browser cookie.
      sequence.current++;
      setClientScope(null);
      setState((value) => ({ ...value, organization: null, access: null, hasAIIntegration: null }));
      void refresh();
    };
    const timer = setInterval(check, 15_000);
    const unsubscribeVisibility = subscribePageVisibility(check);
    window.addEventListener("focus", check);
    window.addEventListener("online", online);
    window.addEventListener("storage", changed);
    window.addEventListener("ngertiin:access-changed", changed);
    return () => {
      clearInterval(timer);
      unsubscribeVisibility();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", online);
      window.removeEventListener("storage", changed);
      window.removeEventListener("ngertiin:access-changed", changed);
    };
  }, [state.session, state.error, refresh]);
  const organizationId = state.organization?.id;
  const sessionId = state.session?.session_id;
  useEffect(() => {
    if (!organizationId || !sessionId) return;
    const scope = clientScope();
    if (!scope) return;
    const controller = new AbortController();
    const discover = () => {
      void refreshLocalModels({ signal: controller.signal, scope }).catch(() => {});
    };
    discover();
    window.addEventListener("online", discover);
    return () => {
      controller.abort();
      window.removeEventListener("online", discover);
    };
  }, [organizationId, sessionId]);
  useFeedbackToast(state.error, { retry: () => void refresh() });
  const account: Account = {
    ...state,
    refresh: () => refresh(),
    createOrganization: async (name) => {
      if (creatingOrganization.current)
        throw new Error("Organization creation is already in progress.");
      creatingOrganization.current = true;
      try {
        return (await createOrganizationRecord(name)).organization;
      } finally {
        creatingOrganization.current = false;
      }
    },
    select: async (id) => {
      flushConversationDraft();
      setClientScope(null);
      setState((value) => ({
        ...value,
        status: pathname === "/onboarding" ? "ready" : "loading",
        organization: null,
        access: null,
        hasAIIntegration: null,
        error: "",
      }));
      await refresh(id);
    },
    leaveWorkspace: () => {
      flushConversationDraft();
      sequence.current++;
      setClientScope(null);
      setState((value) => ({ ...value, organization: null, access: null, hasAIIntegration: null }));
    },
    logout: async () => {
      await command("/v1/auth/logout");
      if (state.session)
        organizationStorage().removeItem(selectedKey(state.server, state.session.user.id));
      sequence.current++;
      setClientScope(null);
      await clearPrivateStorage();
      localStorage.setItem("ngertiin:session-change", crypto.randomUUID());
      setState({ ...initial, status: "ready", server: state.server });
    },
  };
  const special = /^\/(invitations|sign-in|reset-password)(\/|$)/.test(pathname);
  const onboarding = pathname === "/onboarding";
  const active = !!state.session && !!state.organization && !!state.access;
  return (
    <QueryClientProvider client={workspaceQueries}>
      <AccountContext.Provider value={account}>
        {state.status === "loading" ? (
          <div className="account-loading" role="status" aria-label="Loading workspace" />
        ) : !state.session || special ? (
          <AccountScreen />
        ) : active && activeScope?.epoch !== state.scopeEpoch ? (
          <div className="account-loading" role="status" aria-label="Checking workspace access" />
        ) : onboarding ? (
          <Onboarding key={`${state.server}:${state.session.user.id}`} />
        ) : active && state.hasAIIntegration === null ? (
          <div className="account-loading" role="status" aria-label="Checking AI connections" />
        ) : active && !state.hasAIIntegration ? (
          <Navigate to="/onboarding" search={{ step: 2 }} replace />
        ) : active ? (
          <PreferencesProvider key={activeScope?.key ?? "account"}>
            <Fragment key={`${activeScope?.key ?? "account"}:${activeScope?.epoch ?? 0}`}>
              {children}
            </Fragment>
          </PreferencesProvider>
        ) : (
          <Navigate to="/onboarding" replace />
        )}
      </AccountContext.Provider>
    </QueryClientProvider>
  );
}
