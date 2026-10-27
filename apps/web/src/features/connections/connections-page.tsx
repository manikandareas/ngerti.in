import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { AppConnections } from "./app-connections";
import {
  base,
  type Connection,
  connectionError,
  type Listing,
  type Login,
  send,
  statuses,
} from "./client";
import { ConnectionForm, type KeyDraft } from "./connection-form";

export function ConnectionsPage() {
  const { getToken, userId } = useAuth();
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [pending, setPending] = useState<Login | null>(null);
  const [failedLogin, setFailedLogin] = useState<Login | null>(null);
  const [repair, setRepair] = useState<string | null>(null);
  const [replacementKey, setReplacementKey] = useState("");
  const storageKey = `ngertiin:provider-login:${userId}`;
  const load = useCallback(async () => {
    const result = await api<Listing>(`${base}/connections`, await getToken());
    setData(result);
  }, [getToken]);
  useEffect(() => {
    void load().catch((e) => setError(connectionError(e)));
    const saved = sessionStorage.getItem(storageKey);
    if (saved) setPending({ attempt_id: saved, status: "pending", expires_at: 0 });
  }, [load, storageKey]);

  useEffect(() => {
    if (!pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<Login>(
          `${base}/provider-auth/${pending.attempt_id}`,
          await getToken(),
        );
        if (!active) return;
        if (result.status !== "pending") {
          if (result.status === "completed" || result.status === "cancelled")
            sessionStorage.removeItem(storageKey);
          else setFailedLogin(result);
          setPending(null);
          setNotice(
            result.status === "completed"
              ? "Akun terhubung. Periksa model untuk memilihnya pada agent."
              : `Login ${result.status === "cancelled" ? "dibatalkan" : "belum selesai"}. Anda dapat memulai kembali.`,
          );
          await load();
          return;
        }
      } catch (e) {
        if (active) {
          setError(connectionError(e));
          if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
            sessionStorage.removeItem(storageKey);
            setPending(null);
            return;
          }
        }
      }
      if (active) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, getToken, load, storageKey]);

  async function act(operation: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
      return true;
    } catch (e) {
      setError(connectionError(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function addKey(draft: KeyDraft) {
    return act(async () => {
      await send("/connections", await getToken(), {
        ...draft,
        connection_id: crypto.randomUUID(),
      });
      setNotice("Key tersimpan. Periksa model untuk memastikan akses akun.");
    });
  }
  function login(provider: string, label: string, connection_id?: string) {
    if (lock.current) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    void act(async () => {
      try {
        const result = await send<Login>("/provider-auth", await getToken(), {
          provider,
          label,
          connection_id,
        });
        sessionStorage.setItem(storageKey, result.attempt_id);
        setPending(result);
        if (popup && result.authorize_url) popup.location.replace(result.authorize_url);
      } catch (e) {
        popup?.close();
        throw e;
      }
    });
  }
  function disconnect(connection: Connection) {
    void act(async () => {
      const result = await send<Connection>(
        `/connections/${connection.connection_id}`,
        await getToken(),
        undefined,
        "DELETE",
      );
      setNotice(
        result.remote_revocation === "not_confirmed"
          ? "Koneksi diputus lokal. Pencabutan di provider belum terkonfirmasi; periksa pengaturan akun provider."
          : "Koneksi diputus. Pilihan dan riwayat agent tetap tersimpan.",
      );
    });
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Koneksi model</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Hubungkan akun inference Anda, lalu pilih koneksi dan model pada masing-masing agent.
            Penggunaan mengikuti akun dan paket yang dipilih.
          </p>
          <Link to="/agents" className="inline-block text-sm underline underline-offset-4">
            Atur model agent
          </Link>
        </header>
        {error && (
          <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={() => void act(load)} disabled={busy}>
              Muat ulang
            </Button>
          </div>
        )}
        {notice && (
          <p role="status" className="rounded-xl border p-4 text-sm">
            {notice}
          </p>
        )}
        {pending && (
          <section
            aria-label="Login berlangsung"
            className="space-y-3 rounded-xl border p-4 text-sm"
          >
            <p role="status">
              Selesaikan persetujuan di halaman provider. Anda dapat kembali ke halaman ini
              setelahnya.
            </p>
            <div className="flex flex-wrap gap-3">
              {pending.authorize_url && (
                <Button asChild variant="outline">
                  <a href={pending.authorize_url} target="_blank" rel="noreferrer">
                    Buka halaman login
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await send(
                      `/provider-auth/${pending.attempt_id}`,
                      await getToken(),
                      undefined,
                      "DELETE",
                    );
                    sessionStorage.removeItem(storageKey);
                    setPending(null);
                    setNotice("Login dibatalkan.");
                  })
                }
              >
                Batalkan login
              </Button>
            </div>
          </section>
        )}
        {failedLogin && (
          <section className="space-y-3 rounded-xl border p-4 text-sm" aria-label="Pulihkan login">
            <p>Login sebelumnya belum selesai. Coba kembali dengan registrasi akun yang sama.</p>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                const popup = window.open("about:blank", "_blank");
                if (popup) popup.opener = null;
                void act(async () => {
                  try {
                    const result = await send<Login>(
                      `/provider-auth/${failedLogin.attempt_id}/retry`,
                      await getToken(),
                    );
                    sessionStorage.setItem(storageKey, result.attempt_id);
                    setFailedLogin(null);
                    setPending(result);
                    if (popup && result.authorize_url) popup.location.replace(result.authorize_url);
                  } catch (error) {
                    popup?.close();
                    throw error;
                  }
                });
              }}
            >
              Coba login kembali
            </Button>
          </section>
        )}
        <section aria-labelledby="saved-connections" className="space-y-2">
          <h2 id="saved-connections" className="text-lg font-semibold">
            Akun terhubung
          </h2>
          {!data ? (
            <p role="status" className="py-5 text-sm">
              Memuat koneksi…
            </p>
          ) : data.items.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">
              Belum ada koneksi. Tambahkan akun di bawah untuk mulai menggunakan model.
            </p>
          ) : (
            <ul className="divide-y">
              {data.items.map((connection) => (
                <li key={connection.connection_id} className="space-y-3 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{connection.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {data.providers.find((p) => p.id === connection.provider)?.label} ·{" "}
                        {connection.billing}
                      </p>
                    </div>
                    <span className="text-sm">
                      {statuses[connection.status] || connection.status}
                    </span>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">
                    Akun {connection.account_id.slice(0, 16)}
                    {connection.registration_id
                      ? ` · Registrasi ${connection.registration_id}`
                      : ""}{" "}
                    · {connection.models.length} model
                  </p>
                  {connection.catalog_status === "public_catalog" && (
                    <p className="text-xs text-muted-foreground">
                      Katalog publik tersedia. Izin akun dan kuota akan diperiksa saat model
                      digunakan.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {connection.provider !== "chatgpt" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setRepair(connection.connection_id);
                          setReplacementKey("");
                        }}
                      >
                        Ganti key
                      </Button>
                    )}

                    {connection.status !== "disconnected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await send<Connection>(
                              `/connections/${connection.connection_id}/models`,
                              await getToken(),
                            );
                            setNotice(
                              `${result.models.length} model tersedia. Pilih model pada pengaturan agent. Akses inference mengikuti kuota dan izin provider.`,
                            );
                          })
                        }
                      >
                        Periksa model
                      </Button>
                    )}
                    {(connection.provider === "chatgpt" ||
                      connection.provider === "openrouter") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !!pending}
                        onClick={() =>
                          login(connection.provider, connection.label, connection.connection_id)
                        }
                      >
                        Login kembali
                      </Button>
                    )}
                    {connection.status !== "disconnected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => disconnect(connection)}
                      >
                        Putuskan
                      </Button>
                    )}
                  </div>
                  {repair === connection.connection_id && (
                    <form
                      className="flex flex-wrap items-end gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const api_key = replacementKey;
                        setReplacementKey("");
                        void act(async () => {
                          await send("/connections", await getToken(), {
                            connection_id: connection.connection_id,
                            provider: connection.provider,
                            label: connection.label,
                            api_key,
                            base_url: connection.base_url,
                            protocol:
                              connection.protocol === "model_specific"
                                ? "chat_completions"
                                : connection.protocol,
                            workload: connection.workload,
                          });
                          setRepair(null);
                          setNotice("Key diganti. Periksa model sebelum melanjutkan agent.");
                        });
                      }}
                    >
                      <label
                        htmlFor={`repair-${connection.connection_id}`}
                        className="min-w-0 flex-1 space-y-2 text-sm"
                      >
                        API key pengganti
                        <Input
                          id={`repair-${connection.connection_id}`}
                          type="password"
                          autoComplete="off"
                          value={replacementKey}
                          onChange={(event) => setReplacementKey(event.target.value)}
                          required
                        />
                      </label>
                      <Button size="sm" disabled={busy || !replacementKey.trim()}>
                        Simpan key
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setRepair(null);
                          setReplacementKey("");
                        }}
                      >
                        Batal
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {data && (
          <ConnectionForm
            providers={data.providers}
            busy={busy}
            blocked={!!pending}
            onKey={addKey}
            onLogin={login}
          />
        )}
        <AppConnections />
      </div>
    </AppShell>
  );
}
