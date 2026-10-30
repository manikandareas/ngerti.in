import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ChevronRight, KeyRound, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
import { MediaSettings } from "./media-settings";
import { ResearchSettings } from "./research-settings";
import { type SettingsSection, SettingsShell } from "./settings-shell";

export function ConnectionsPage() {
  const { getToken, userId } = useAuth();
  const [section, setSection] = useState<SettingsSection>("providers");
  const providerTrigger = useRef<HTMLElement | null>(null);
  function openProvider(id: string) {
    providerTrigger.current = document.activeElement as HTMLElement;
    setAdding(id);
  }
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      setSection(
        ["apps", "research", "media"].includes(hash) ? (hash as SettingsSection) : "providers",
      );
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function navigate(next: SettingsSection) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${next}`,
    );
    setSection(next);
  }
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
        result.remote_revocation !== "confirmed"
          ? "Koneksi diputus lokal. Pencabutan di provider belum terkonfirmasi; periksa pengaturan akun provider."
          : "Koneksi diputus dan pencabutan izin di provider terkonfirmasi. Pilihan dan riwayat agent tetap tersimpan.",
      );
    });
  }
  return (
    <SettingsShell section={section} onSection={navigate}>
      <div hidden={section !== "providers"} className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-[30px] font-semibold tracking-tight">Connect your AI provider</h1>
          <p className="text-base text-muted-foreground">
            Choose the providers your agents can use. Connect an account or add an API key to get
            started.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <Button className="h-11" onClick={() => openProvider("openai")}>
            <Plus />
            Connect OpenAI
          </Button>
          <Button className="h-11" variant="outline" onClick={() => openProvider("openrouter")}>
            <Plus />
            Add another provider
          </Button>
        </div>
        <section aria-labelledby="provider-directory" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="provider-directory" className="text-[17px] font-semibold">
              Setup providers
            </h2>
            <span className="text-xs text-muted-foreground">
              {data?.items.filter((c) => c.status === "connected").length ?? 0} connected
            </span>
          </div>
          {!data ? (
            <div role="status" aria-label="Memuat provider" className="space-y-3">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { id: "openai", label: "OpenAI", description: "Use your OpenAI API account" },
                {
                  id: "anthropic",
                  label: "Anthropic",
                  description: "Connect Claude with an API key",
                },
                {
                  id: "gemini",
                  label: "Google Gemini",
                  description: "Connect your Google AI account",
                },
                { id: "xai", label: "xAI", description: "Connect Grok with an API key" },
                ...[...data.providers]
                  .sort((a, b) => Number(b.id === "openrouter") - Number(a.id === "openrouter"))
                  .map((p) => ({
                    id: p.id,
                    label: p.label,
                    description:
                      p.id === "openrouter"
                        ? "Access multiple providers with one API key"
                        : p.auth_methods.includes("oauth")
                          ? "Connect your account"
                          : "Connect with an API key",
                  })),
              ].map((provider) => {
                const connected = data.items.some(
                  (c) =>
                    c.status === "connected" &&
                    (c.provider === provider.id ||
                      (c.provider === "custom" &&
                        c.base_url === providerPresets[provider.id]?.url)),
                );
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className="grid min-h-24 w-full grid-cols-[44px_minmax(0,1fr)_16px] items-center gap-x-3 gap-y-2 rounded-2xl sm:flex sm:gap-4 border px-4 py-[18px] text-left hover:bg-muted/40 sm:px-5"
                    onClick={() => openProvider(provider.id)}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Sparkles className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{provider.label}</span>
                      <span className="mt-1 block text-[13px] text-muted-foreground">
                        {provider.description}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className={`col-start-2 row-start-2 h-auto px-2.5 py-1 text-muted-foreground ${connected ? "bg-success text-success-foreground" : ""}`}
                    >
                      {connected ? "Connected" : "Not connected"}
                    </Badge>
                    <ChevronRight className="col-start-3 row-start-1 size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
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
            <p>
              {failedLogin.status === "expired"
                ? "Login kedaluwarsa."
                : failedLogin.status === "denied"
                  ? "Izin login ditolak."
                  : "Login sebelumnya belum selesai."}{" "}
              Coba kembali dengan registrasi akun yang sama.
            </p>
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
        <section aria-labelledby="saved-connections" className="space-y-2 border-t pt-6">
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
                <li
                  key={connection.connection_id}
                  className="space-y-3 py-5 [overflow-wrap:anywhere]"
                >
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
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">Model dan detail akun</summary>
                    <div className="mt-3 space-y-3">
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
                      <ul
                        aria-label={`Model ${connection.label}`}
                        className="max-h-48 space-y-1 overflow-auto text-sm"
                      >
                        {connection.models.map((model) => (
                          <li key={model.id}>{model.label || model.id}</li>
                        ))}
                      </ul>
                      <Link to="/agents" className="inline-block text-sm underline">
                        Atur model agent
                      </Link>
                    </div>
                  </details>
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
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          Kredensial disimpan aman. API key yang tersimpan tidak ditampilkan kembali.
        </p>
      </div>
      <div hidden={section !== "apps"}>
        <AppConnections />
      </div>
      {section === "research" && (
        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="text-[30px] font-semibold">Riset internet</h1>
            <p className="text-muted-foreground">
              Pilih layanan pencarian dan pembaca halaman untuk agent.
            </p>
          </header>
          <ResearchSettings expanded />
        </div>
      )}
      {section === "media" && (
        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="text-[30px] font-semibold">Gambar, video & suara</h1>
            <p className="text-muted-foreground">
              Kelola kesiapan provider multimodal untuk agent.
            </p>
          </header>
          <MediaSettings />
        </div>
      )}
      <Sheet
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
      >
        <SheetContent
          data-context-editor="true"
          overlayClassName="lg:hidden"
          className="gap-4 border-0 p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-[360px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            providerTrigger.current?.focus();
          }}
        >
          <SheetHeader className="px-0 pr-8">
            <SheetTitle>
              Connect{" "}
              {providerPresets[adding ?? ""]?.label ??
                data?.providers.find((p) => p.id === adding)?.label ??
                "provider"}
            </SheetTitle>
            <SheetDescription>Gunakan akun provider atau API key Anda sendiri.</SheetDescription>
          </SheetHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
          {data && adding && (
            <ConnectionForm
              key={adding}
              providers={data.providers}
              initialProvider={providerPresets[adding] ? "custom" : adding}
              preset={providerPresets[adding]}
              busy={busy}
              blocked={!!pending}
              onKey={async (draft) => {
                const saved = await addKey(draft);
                if (saved) setAdding(null);
                return saved;
              }}
              onLogin={(provider, label) => {
                login(provider, label);
                setAdding(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </SettingsShell>
  );
}

const providerPresets: Record<string, { label: string; url: string; protocol: string }> = {
  openai: { label: "OpenAI", url: "https://api.openai.com/v1", protocol: "chat_completions" },
  anthropic: {
    label: "Anthropic",
    url: "https://api.anthropic.com",
    protocol: "anthropic_messages",
  },
  gemini: {
    label: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    protocol: "chat_completions",
  },
  xai: { label: "xAI", url: "https://api.x.ai/v1", protocol: "chat_completions" },
};
