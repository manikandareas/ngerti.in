import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/api-client";
import type { AppConnection } from "@/types/work";

const pollMs = 5000;
const pollTries = 24;
const linkMs = 10 * 60 * 1000;
type Authorization = { id: string; url: string; createdAt: number };

/** Reserve user activation before awaiting the server-owned authorization URL. */
function reservePage() {
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
    open(url: string) {
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
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const mounted = useRef(true);
  const launch = useRef<ReturnType<typeof reservePage> | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Authorization | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [polling, setPolling] = useState<{ id: string; name: string } | null>(null);
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
        refreshRef.current();
        if (connection.state === "active") {
          setError("");
          setPolling(null);
          setLink((current) => (current?.id === connection.id ? null : current));
          setNotice(`${polling?.name} terhubung. Pilih akses percakapan yang diperlukan.`);
        } else if (++tries >= pollTries) {
          setPolling(null);
          setNotice("Login belum terkonfirmasi. Lanjutkan login, lalu periksa koneksi lagi.");
        } else timer = setTimeout(() => void read(), pollMs);
      } catch {
        if (!abort.signal.aborted) {
          setPolling(null);
          setError(
            "Status koneksi belum dapat diperiksa. Lanjutkan login, lalu periksa koneksi lagi.",
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
  async function authorize(toolkit: string, name: string, id?: string) {
    if (inFlight.current) return;
    const reserved = reservePage();
    launch.current = reserved;
    inFlight.current = true;
    setBusy(true);
    setPolling(null);
    setError("");
    setNotice("");
    const createdAt = Date.now();
    try {
      const value = await request<{ connection: AppConnection; connect_url: string }>(
        id ? `/v1/apps/connections/${id}/reconnect` : "/v1/apps/connect",
        id ? {} : { toolkit },
      );
      if (!mounted.current) return;
      const url = new URL(value.connect_url);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Link otorisasi tidak valid. Periksa koneksi lagi.");
      setLink({ id: value.connection.id, url: url.href, createdAt });
      setPolling({ id: value.connection.id, name });
      if (!reserved.open(url.href))
        setError("Jendela login diblokir. Gunakan tautan Lanjutkan koneksi di bawah.");
      refreshRef.current();
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Koneksi belum terkonfirmasi. Periksa daftar koneksi sebelum mencoba lagi.",
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
      refreshRef.current();
      if (current.state === "active") {
        setLink((value) => (value?.id === current.id ? null : value));
        setNotice(`${name} terhubung. Pilih akses percakapan yang diperlukan.`);
      } else
        setNotice(
          "Login belum terkonfirmasi. Lanjutkan login atau hubungkan ulang secara eksplisit.",
        );
    } catch {
      if (mounted.current)
        setError("Status koneksi belum dapat diperiksa. Coba Periksa koneksi lagi.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function continueLink(name: string) {
    if (!link || Date.now() < link.createdAt || Date.now() - link.createdAt >= linkMs) {
      setError("Link login sudah berakhir. Pilih Hubungkan ulang untuk membuat link baru.");
      return false;
    }
    setError("");
    setPolling({ id: link.id, name });
    return true;
  }
  return { authorize, check, continueLink, link, busy, error, notice, polling };
}
