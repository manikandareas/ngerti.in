import { useRef, useState } from "react";
import type { ProviderId } from "@/features/settings/components/shared";
import { mergeConnections } from "@/features/settings/utils/provider-state";
import { ApiError, request } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import type { Connection } from "@/types/workspace";

export type ProviderLogin = {
  auth_url?: string;
  user_code?: string;
  expires_in_seconds?: number;
};

export function useProviderAccounts(provider: ProviderId, refresh: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logins, setLogins] = useState<Record<string, ProviderLogin>>({});
  const [fresh, setFresh] = useState<Connection[]>([]);
  const [uncertainAccount, setUncertainAccount] = useState(false);
  const lock = useRef(false);
  const accountOperation = useRef(crypto.randomUUID());

  function remember(connection: Connection) {
    setFresh((current) => mergeConnections(current, [connection]));
  }
  function clearLogin(id: string) {
    setLogins((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  async function run(id: string, action: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await action();
      return true;
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? `${repairMessage(failure.code)} (${failure.code})`
          : failure instanceof Error
            ? failure.message
            : "Permintaan gagal.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  async function startLogin(connection: Connection) {
    let login: ProviderLogin;
    try {
      login = await request<ProviderLogin>(`/v1/connections/${connection.id}/login`, {});
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "CONFLICT")
        throw new Error(
          "Login sebelumnya masih berjalan. Pilih Batalkan login atau Mulai ulang login pada menu akun. (CONFLICT)",
        );
      if (!(failure instanceof ApiError))
        throw new Error(
          "Status login belum dapat dipastikan. Periksa akun, atau pilih Mulai ulang login pada menu akun untuk memulai kembali.",
        );
      throw failure;
    }
    setLogins((current) => ({ ...current, [connection.id]: login }));
    await refresh();
  }
  function addAccount() {
    return run("new", async () => {
      let connection: Connection;
      try {
        connection = await request<Connection>(
          "/v1/connections",
          {
            harness: provider,
            authentication: { method: "native_login", billing_source: "subscription" },
          },
          accountOperation.current,
        );
      } catch (failure) {
        if (
          !(failure instanceof ApiError) ||
          !["INVALID_REQUEST", "UNAUTHORIZED", "SCOPE_DENIED", "CONFLICT"].includes(failure.code)
        )
          setUncertainAccount(true);
        throw failure;
      }
      accountOperation.current = crypto.randomUUID();
      setUncertainAccount(false);
      remember(connection);
      await refresh();
      await startLogin(connection);
    });
  }
  const actions = {
    inspect(connection: Connection) {
      return run(connection.id, async () => {
        const result = await request<Connection>(`/v1/connections/${connection.id}/inspect`, {});
        remember(result);
        await refresh();
        setNotice(
          result.login === "authenticated"
            ? "Akun diperiksa. Status model dan sumber biaya sudah diperbarui."
            : "Akun belum login. Selesaikan login lalu periksa kembali.",
        );
        if (result.login === "authenticated") clearLogin(connection.id);
      });
    },
    login(connection: Connection) {
      return run(connection.id, () => startLogin(connection));
    },
    restartLogin(connection: Connection) {
      return run(connection.id, async () => {
        // Restart is an explicit user action, including when a previous response was lost.
        await request(`/v1/connections/${connection.id}/login/cancel`, {});
        clearLogin(connection.id);
        await startLogin(connection);
      });
    },
    revoke(connection: Connection) {
      return run(connection.id, async () => {
        const revoked = await request<Connection>(
          `/v1/connections/${connection.id}/revoke`,
          {},
          crypto.randomUUID(),
        );
        remember(revoked);
        clearLogin(connection.id);
        await refresh();
        setNotice("Koneksi diputus.");
      });
    },
    cancelLogin(connection: Connection) {
      return run(connection.id, async () => {
        await request(`/v1/connections/${connection.id}/login/cancel`, {});
        clearLogin(connection.id);
        setNotice("Login dibatalkan.");
      });
    },
  };
  async function saved(connection: Connection) {
    remember(connection);
    await refresh().catch(() => {});
    setNotice("API key disimpan. Periksa akun & model untuk memverifikasi akses.");
  }
  return {
    fresh,
    busy,
    error,
    notice,
    setNotice,
    logins,
    uncertainAccount,
    addAccount,
    actions,
    saved,
  };
}

export type ProviderAccountActions = ReturnType<typeof useProviderAccounts>["actions"];
