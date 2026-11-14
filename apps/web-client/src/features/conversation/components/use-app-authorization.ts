import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/features/account/session";
import type { Audience } from "@/features/account/types";
import { durableCommand, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
import type { AppConnection } from "@/types/work";

const pollMs = 5000;
const pollTries = 24;
const linkMs = 10 * 60 * 1000;
type Authorization = { id: string; toolkit: string; url: string; createdAt: number };

/** Reserve user activation before awaiting the server-owned authorization URL. */
function reservePage() {
  if (window.ngertiinDesktop?.openExternal) {
    const desktop = window.ngertiinDesktop;
    return {
      async open(url: string) {
        try {
          await desktop.openExternal?.(url);
          return true;
        } catch {
          return false;
        }
      },
      cancel() {},
    };
  }
  let page: Window | null = null;
  let navigated = false;
  let cancelled = false;
  try {
    page = window.open("", "_blank");
    if (page) page.opener = null;
  } catch {
    page?.close();
  }
  return {
    async open(url: string) {
      if (cancelled || !page || page.closed) return false;
      try {
        page.location.replace(url);
        navigated = true;
        return true;
      } catch {
        return false;
      }
    },
    cancel() {
      cancelled = true;
      if (!navigated && page && !page.closed) page.close();
    },
  };
}

export function useAppAuthorization(refresh: () => void) {
  const account = useAccount();
  const scope = useRef(clientScope()).current;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const mounted = useRef(true);
  const launch = useRef<ReturnType<typeof reservePage> | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Authorization | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verified, setVerified] = useState<AppConnection | null>(null);
  const [polling, setPolling] = useState<{ id: string; name: string; toolkit: string } | null>(
    null,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      launch.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!polling) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function read() {
      try {
        const connection = await request<AppConnection>(
          `/v1/apps/connections/${polling?.id}/refresh`,
          {},
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setVerified(connection);
        refreshRef.current();
        if (connection.state === "active") {
          setError("");
          setPolling(null);
          setLink((current) => (current?.id === connection.id ? null : current));
          setNotice(`${polling?.name} installed. Choose the actions your agent can use.`);
        } else if (++tries >= pollTries) {
          setPolling(null);
          setNotice(
            "Authorization is still pending. Open the browser to continue, then check status.",
          );
        } else timer = setTimeout(() => void read(), pollMs);
      } catch {
        if (!abort.signal.aborted) {
          setPolling(null);
          setError(
            "Could not verify the connection. Finish authorization, then check status again.",
          );
        }
      }
    }
    timer = setTimeout(() => void read(), pollMs);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [polling]);
  async function authorize(
    toolkit: string,
    name: string,
    id?: string,
    ownership: "personal" | "organization" = "personal",
  ) {
    if (inFlight.current) return;
    const reserved = reservePage();
    launch.current = reserved;
    inFlight.current = true;
    setBusy(true);
    setPolling(null);
    setError("");
    setNotice("");
    setVerified(null);
    const createdAt = Date.now();
    try {
      let audienceId: string | null = null;
      if (!id && ownership === "organization") {
        const audience = await durableCommand<{ audience: Audience }>(
          `app-audience:${toolkit}`,
          `/v1/organizations/${account?.organization?.id}/audiences`,
          { mode: "all_members" },
        );
        audienceId = audience.audience.id;
      }
      assertScope(scope);
      const value = await request<{ connection: AppConnection; connect_url: string }>(
        id ? `/v1/apps/connections/${id}/reconnect` : "/v1/apps/connect",
        id ? {} : { toolkit, ownership, audience_id: audienceId },
      );
      if (!mounted.current) return;
      const url = new URL(value.connect_url);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("The authorization link is invalid. Try installing again.");
      setLink({ id: value.connection.id, toolkit, url: url.href, createdAt });
      const opened = await reserved.open(url.href);
      if (!mounted.current) return;
      setPolling({ id: value.connection.id, toolkit, name });
      if (!opened)
        setError("Could not open the browser. Select Open browser to continue authorization.");
      refreshRef.current();
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not start installation. Check the connection, then try again.",
        );
        refreshRef.current();
      }
    } finally {
      reserved.cancel();
      if (launch.current === reserved) launch.current = null;
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function check(connection: AppConnection, name: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPolling(null);
    setError("");
    setNotice("");
    try {
      const current = await request<AppConnection>(
        `/v1/apps/connections/${connection.id}/refresh`,
        {},
      );
      if (!mounted.current) return;
      setVerified(current);
      refreshRef.current();
      if (current.state === "active") {
        setLink((value) => (value?.id === current.id ? null : value));
        setNotice(`${name} installed. Choose the actions your agent can use.`);
      } else
        setNotice(
          "Authorization is still pending. Open the browser to continue or try installing again.",
        );
    } catch {
      if (mounted.current) setError("Could not verify the connection. Try Check status again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function continueLink(name: string) {
    if (inFlight.current) return false;
    if (!link || Date.now() < link.createdAt || Date.now() - link.createdAt >= linkMs) {
      setLink(null);
      setPolling(null);
      setError("The authorization link has expired. Select Install plugin to get a new link.");
      return false;
    }
    const reserved = reservePage();
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const opened = await reserved.open(link.url);
      if (!mounted.current) return false;
      if (opened) setPolling({ id: link.id, toolkit: link.toolkit, name });
      else {
        setPolling(null);
        setError("Could not open the browser. Allow popups or try Open browser again.");
      }
      return opened;
    } finally {
      reserved.cancel();
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function reset() {
    if (inFlight.current) return;
    setLink(null);
    setPolling(null);
    setError("");
    setNotice("");
  }
  return {
    authorize,
    check,
    continueLink,
    reset,
    link,
    busy,
    integrating: busy || Boolean(polling),
    error,
    notice,
    polling,
    verified,
  };
}
