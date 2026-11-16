import { Navigate, useLocation } from "@tanstack/react-router";
import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
import { PreferencesProvider } from "@/hooks/use-preferences";
import { ApiError, command, request } from "@/lib/api-client";
import { clearPrivateStorage, clientScope, setClientScope } from "@/lib/client-scope";
import type { Connection } from "@/types/workspace";
import { createOrganization as createOrganizationRecord } from "./account-forms";
import { AccountScreen } from "./account-screen";
import { availableAIConnections, connectionReady } from "./ai-integration";
import Onboarding from "./onboarding";
import type {
  Organization,
  OrganizationAccess,
  OrganizationList,
  UserSession,
  WorkspaceAccess,
} from "./types";
import "./account.css";

interface AccountState {
  status: "loading" | "ready";
  server: string;
  session: UserSession | null;
  list: OrganizationList;
  organization: Organization | null;
  access: OrganizationAccess | null;
  hasAIIntegration: boolean | null;
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

export default function WorkspaceEntry({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sequence = useRef(0);
  const mounted = useRef(true);
  const latestRefresh = useRef<Promise<void> | null>(null);
  const creatingOrganization = useRef(false);
  const load = useCallback(async (choice?: string) => {
    const generation = ++sequence.current;
    const current = () => mounted.current && generation === sequence.current;
    let server = stateRef.current.server;
    try {
      if (!server) {
        const metadata = await request<{ audience: string }>("/v1/auth/native");
        server = metadata.audience;
      }
      let session: UserSession;
      try {
        session = await request<UserSession>("/v1/auth/session");
        if (
          session.authentication === "web" &&
          Date.parse(session.expires_at) - Date.now() < 48 * 60 * 60 * 1000
        )
          session = await request<UserSession>("/v1/auth/renew", {});
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED") throw error;
        if (current()) {
          setClientScope(null);
          setState({ ...initial, status: "ready", server });
        }
        return;
      }
      const contract = await request<{ version: string }>("/v1/contracts");
      if (!contract.version.startsWith("2.") || Number(contract.version.split(".")[1]) < 1)
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
            request<Connection[]>(
              "/v1/entities/connection",
              undefined,
              undefined,
              undefined,
              15000,
              scope,
            ),
            request<WorkspaceAccess>(
              "/v1/data/access",
              undefined,
              undefined,
              undefined,
              15000,
              scope,
            ),
          ]);
          hasAIIntegration = availableAIConnections(
            connections,
            session.user.id,
            grants.allowed_organization_connection_ids,
          ).some(connectionReady);
        } catch (failure) {
          if (failure instanceof DOMException && failure.name === "AbortError") return;
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
        error: integrationError,
      });
    } catch (error) {
      if (!current() || (error instanceof DOMException && error.name === "AbortError")) return;
      if (
        error instanceof ApiError &&
        ["UNAUTHORIZED", "SCOPE_DENIED", "NOT_FOUND"].includes(error.code)
      ) {
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
      if (document.visibilityState === "visible") void refresh();
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
    window.addEventListener("focus", check);
    window.addEventListener("storage", changed);
    window.addEventListener("ngertiin:access-changed", changed);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", changed);
      window.removeEventListener("ngertiin:access-changed", changed);
      document.removeEventListener("visibilitychange", check);
    };
  }, [state.session, state.error, refresh]);
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
      setClientScope(null);
      setState((value) => ({
        ...value,
        organization: null,
        access: null,
        hasAIIntegration: null,
        error: "",
      }));
      await refresh(id);
    },
    leaveWorkspace: () => {
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
    <AccountContext.Provider value={account}>
      {state.status === "loading" ? (
        <div className="account-loading" role="status" aria-label="Loading workspace" />
      ) : !state.session || special ? (
        <AccountScreen />
      ) : onboarding ? (
        <Onboarding key={`${state.server}:${state.session.user.id}`} />
      ) : active && state.hasAIIntegration === null ? (
        <div className="account-loading" role="status" aria-label="Checking AI connections" />
      ) : active && !state.hasAIIntegration ? (
        <Navigate to="/onboarding" search={{ step: 2 }} replace />
      ) : active ? (
        <PreferencesProvider key={clientScope()?.key ?? "account"}>
          <Fragment key={`${clientScope()?.key ?? "account"}:${clientScope()?.epoch ?? 0}`}>
            {children}
          </Fragment>
        </PreferencesProvider>
      ) : (
        <Navigate to="/onboarding" replace />
      )}
    </AccountContext.Provider>
  );
}
