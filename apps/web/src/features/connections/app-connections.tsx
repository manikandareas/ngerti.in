import { useAuth } from "@clerk/tanstack-react-start";
import { Plug, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";
import { AppInteractions } from "./app-interactions";
import { base, connectionError, send } from "./client";
import { GoogleSetup } from "./google-setup";

type Application = {
  id: string;
  label: string;
  url: string;
  prerequisites: string[];
  auth_methods: string[];
  setup?: { kind: string; oauth_configured: boolean };
};
type AppConnection = {
  connection_id: string;
  application: string;
  label: string;
  generation: number;
  status: string;
  url: string;
  auth_method: string;
  transport: string;
  tools: { name: string; schema: { description?: string } }[];
  selected_tools: string[];
  tools_selected: boolean;
  oauth_configured?: boolean;
};
type AppListing = { applications: Application[]; items: AppConnection[] };
type AppLogin = {
  attempt_id: string;
  connection_id: string;
  status: string;
  authorize_url?: string;
};
const labels: Record<string, string> = {
  configured: "Perlu diperiksa",
  connected: "Terhubung",
  disconnected: "Terputus",
  authorized_tools_unavailable: "Login berhasil, tools belum tersedia",
};

export function AppConnections({ contextual = false }: { contextual?: boolean }) {
  const { getToken, userId } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState(contextual ? "connected" : "available");
  const appTrigger = useRef<HTMLElement | null>(null);
  const [configuring, setConfiguring] = useState(false);
  function configure(id: string) {
    appTrigger.current = document.activeElement as HTMLElement;
    const item = data?.applications.find((app) => app.id === id);
    setEditing(null);
    setApplication(id);
    setMethod(item?.auth_methods[0] ?? "oauth");
    setLabel(item?.label ?? "");
    setKey("");
    setClientId("");
    setClientSecret("");
    setProfile("");
    setConfiguring(true);
  }
  const [data, setData] = useState<AppListing | null>(null);
  const [application, setApplication] = useState("notion");
  const [label, setLabel] = useState("");
  const [method, setMethod] = useState("oauth");
  const [key, setKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [profile, setProfile] = useState("");
  const [editing, setEditing] = useState<AppConnection | null>(null);
  const newIdentity = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<AppLogin | null>(null);
  const lock = useRef(false);
  const storageKey = `ngertiin:app-login:v1:${userId}`;
  const selected = data?.applications.find((item) => item.id === application);
  const load = useCallback(async () => {
    const result = await api<AppListing>(`${base}/apps`, await getToken());
    setData(result);
  }, [getToken]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      const attempt = sessionStorage.getItem(storageKey);
      const callbackUrl = window.location.href;
      const params = new URL(callbackUrl).searchParams;
      if (attempt) {
        try {
          if (params.has("state") && (params.has("code") || params.has("error"))) {
            await send(`/apps/auth/${attempt}/callback`, await getToken(), {
              callback_url: callbackUrl,
            });
            window.history.replaceState(null, "", `${window.location.pathname}#apps`);
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          }
          const result = await api<AppLogin>(`${base}/apps/auth/${attempt}`, await getToken());
          if (active) setPending(result);
        } catch (e) {
          if (e instanceof ApiError && [401, 404, 422].includes(e.status)) {
            sessionStorage.removeItem(storageKey);
            window.history.replaceState(null, "", `${window.location.pathname}#apps`);
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          }
          if (active) setError(connectionError(e));
        }
      }
      if (active) await load();
    })().catch((e) => active && setError(connectionError(e)));
    return () => {
      active = false;
    };
  }, [getToken, load, storageKey, userId]);

  useEffect(() => {
    if (!pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<AppLogin>(
          `${base}/apps/auth/${pending.attempt_id}`,
          await getToken(),
        );
        if (!active) return;
        if (["approved", "error", "interrupted"].includes(result.status)) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          setNotice(
            result.status === "approved"
              ? "Login selesai. Periksa tools, lalu pilih koneksi di pengaturan agent."
              : "Login belum selesai. Mulai login kembali untuk melanjutkan.",
          );
          await load();
          return;
        }
        setPending((current) =>
          current &&
          current.authorize_url === result.authorize_url &&
          current.status === result.status
            ? current
            : result,
        );
      } catch (e) {
        if (active) {
          setError(connectionError(e));
          if (e instanceof ApiError && [401, 404].includes(e.status)) {
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
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      await load();
    } catch (e) {
      setError(connectionError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const Heading = contextual ? "h3" : "h1";
  return (
    <section aria-labelledby="app-connections-title" className="space-y-6">
      <Tabs value={view} onValueChange={setView} className="gap-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Heading
              id="app-connections-title"
              className={
                contextual ? "text-base font-semibold" : "text-[28px] font-semibold tracking-tight"
              }
            >
              Connections
            </Heading>
            {!contextual && (
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <label className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Search connections"
                    placeholder="Search connections"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 sm:w-52"
                  />
                </label>
                <Button
                  className="rounded-full"
                  onClick={() => configure(data?.applications[0]?.id ?? "notion")}
                  disabled={!data}
                >
                  <Plus />
                  Add
                </Button>
              </div>
            )}
          </div>
          <p
            className={
              contextual ? "text-[13px] text-muted-foreground" : "text-base text-muted-foreground"
            }
          >
            Connect your tools to let Ngertiin work across your apps.
          </p>
        </header>
        <TabsList hidden={contextual} aria-label="Daftar aplikasi">
          <TabsTrigger value="available">Tersedia</TabsTrigger>
          <TabsTrigger value="connected">Terhubung</TabsTrigger>
        </TabsList>
        <TabsContent value="available">
          <section aria-label="Direktori aplikasi" className="space-y-4">
            <h2 className="text-[17px] font-semibold">Aplikasi untuk agent</h2>
            {!data ? (
              <div role="status" aria-label="Memuat aplikasi">
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
                {data.applications
                  .filter((app) =>
                    `${app.label} ${app.id}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((app) => (
                    <button
                      type="button"
                      key={app.id}
                      className="flex min-h-20 items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/50"
                      onClick={() => configure(app.id)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Plug className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium">{app.label}</span>
                        <span className="mt-1 block text-[13px] text-muted-foreground">
                          {app.id === "google-workspace"
                            ? "Gmail, Drive, Docs, Sheets & Calendar"
                            : `Hubungkan ${app.label} ke agent`}
                        </span>
                      </span>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
              </div>
            )}
            {data &&
              !data.applications.some((app) =>
                `${app.label} ${app.id}`.toLowerCase().includes(search.toLowerCase()),
              ) && (
                <p role="status" className="py-8 text-sm text-muted-foreground">
                  Tidak ada aplikasi yang cocok.
                </p>
              )}
          </section>
        </TabsContent>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <AppInteractions />
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {pending && (
          <div className="space-y-3 rounded-xl border p-4 text-sm" role="status">
            <p>
              Selesaikan login aplikasi. Koneksi dapat dipakai setelah tools berhasil diperiksa.
            </p>
            {pending.authorize_url && (
              <Button asChild>
                <a href={pending.authorize_url}>Lanjutkan login</a>
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await send(
                    `/apps/auth/${pending.attempt_id}`,
                    await getToken(),
                    undefined,
                    "DELETE",
                  );
                  sessionStorage.removeItem(storageKey);
                  setPending(null);
                })
              }
            >
              Batalkan
            </Button>
          </div>
        )}
        <TabsContent value="connected" className="space-y-4">
          {view === "connected" && data?.items.length === 0 && (
            <p role="status" className="py-8 text-sm text-muted-foreground">
              Belum ada aplikasi terhubung. Pilih aplikasi di tab Tersedia.
            </p>
          )}
          {view === "connected" &&
            data?.items
              .filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
              .map((connection) => (
                <article
                  key={connection.connection_id}
                  className="space-y-3 rounded-lg bg-muted/60 p-5 [overflow-wrap:anywhere]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{connection.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {labels[connection.status] ?? connection.status} · {connection.tools.length}{" "}
                        tools ditemukan
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          appTrigger.current = document.activeElement as HTMLElement;
                          setEditing(connection);
                          setApplication(connection.application);
                          setLabel(connection.label);
                          setMethod(connection.auth_method);
                          setKey("");
                          setClientId("");
                          setClientSecret("");
                          setProfile("");
                          setConfiguring(true);
                        }}
                      >
                        Atur ulang koneksi
                      </Button>
                      {connection.status !== "disconnected" && (
                        <>
                          {connection.auth_method === "oauth" &&
                            connection.transport === "http" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !!pending}
                                onClick={() =>
                                  void act(async () => {
                                    const result = await send<AppLogin>(
                                      `/apps/${connection.connection_id}/authorize`,
                                      await getToken(),
                                    );
                                    sessionStorage.setItem(storageKey, result.attempt_id);
                                    setPending(result);
                                  })
                                }
                              >
                                Login / hubungkan kembali
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await send(
                                  `/apps/${connection.connection_id}/discover`,
                                  await getToken(),
                                );
                              })
                            }
                          >
                            Periksa tools
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await send(
                                  `/apps/${connection.connection_id}`,
                                  await getToken(),
                                  undefined,
                                  "DELETE",
                                );
                                setNotice(
                                  "Koneksi diputus untuk agent. Pencabutan izin di aplikasi perlu diperiksa pada akun aplikasi.",
                                );
                              })
                            }
                          >
                            Putuskan
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {connection.tools.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm">
                        Pilih tools yang dapat digunakan
                      </summary>
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const tools = new FormData(event.currentTarget).getAll("tool");
                          void act(async () => {
                            await send(
                              `/apps/${connection.connection_id}/tools`,
                              await getToken(),
                              {
                                generation: connection.generation,
                                tools,
                              },
                            );
                            setNotice(
                              "Pilihan tools tersimpan. Simpan kembali pengaturan agent yang memakai koneksi ini.",
                            );
                          });
                        }}
                      >
                        {connection.tools.map((tool) => (
                          <label key={tool.name} className="flex items-start gap-2 text-sm">
                            <NativeChoice
                              type="checkbox"
                              name="tool"
                              value={tool.name}
                              defaultChecked={
                                !connection.tools_selected ||
                                connection.selected_tools.includes(tool.name)
                              }
                            />
                            <span className="min-w-0 break-words">
                              {tool.name}
                              <span className="block text-xs text-muted-foreground">
                                {tool.schema.description}
                              </span>
                            </span>
                          </label>
                        ))}
                        <Button size="sm" disabled={busy || connection.status === "disconnected"}>
                          Simpan pilihan tools
                        </Button>
                      </form>
                    </details>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Koneksi tersedia untuk diuji. Verifikasi setiap operasi aplikasi masih
                    diperlukan.
                  </p>
                </article>
              ))}
        </TabsContent>
        {contextual && (
          <Button asChild size="sm" variant="outline">
            <a href="/connections#apps">Kelola koneksi aplikasi</a>
          </Button>
        )}
        <Sheet open={configuring} onOpenChange={setConfiguring}>
          <SheetContent
            data-context-editor="true"
            overlayClassName="lg:hidden"
            className="gap-4 border-0 p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-[360px]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              appTrigger.current?.focus();
            }}
          >
            <SheetHeader className="px-0 pr-8">
              <SheetTitle>
                {editing ? "Atur ulang" : "Connect"} {selected?.label ?? "app"}
              </SheetTitle>
              <SheetDescription>
                Hubungkan akun lalu pilih tools yang boleh digunakan agent.
              </SheetDescription>
            </SheetHeader>
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <form
              id="app-configuration"
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await send("/apps", await getToken(), {
                    connection_id: editing?.connection_id ?? newIdentity.current,
                    application,
                    label,
                    auth_method: method,
                    ...(key ? { api_key: key } : {}),
                    ...(clientId ? { oauth_client_id: clientId } : {}),
                    ...(clientSecret ? { oauth_client_secret: clientSecret } : {}),
                    ...(profile ? { stdio_profile: profile } : {}),
                    ...(editing ? { expected_generation: editing.generation } : {}),
                  });
                  setKey("");
                  setClientId("");
                  setClientSecret("");
                  setLabel("");
                  setEditing(null);
                  setConfiguring(false);
                  setView("connected");
                  newIdentity.current = crypto.randomUUID();
                  setNotice("Koneksi tersimpan. Lanjutkan login atau periksa tools.");
                });
              }}
            >
              <label className="space-y-1 text-sm">
                Aplikasi
                <NativeSelect
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={application}
                  disabled={!!editing}
                  onChange={(e) => {
                    setApplication(e.target.value);
                    setMethod(
                      data?.applications.find((item) => item.id === e.target.value)
                        ?.auth_methods[0] ?? "oauth",
                    );
                    setProfile("");
                    setKey("");
                    setClientId("");
                    setClientSecret("");
                  }}
                >
                  {(data?.applications ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label htmlFor="app-label" className="space-y-1 text-sm">
                Nama koneksi
                <Input
                  id="app-label"
                  required
                  maxLength={100}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Akun pribadi"
                />
              </label>
              {application === "google-workspace" && !profile && (
                <GoogleSetup
                  configured={!!(selected?.setup?.oauth_configured || editing?.oauth_configured)}
                  clientId={clientId}
                  clientSecret={clientSecret}
                  onClientId={setClientId}
                  onClientSecret={setClientSecret}
                />
              )}
              <label className="space-y-1 text-sm">
                Cara login
                <NativeSelect
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {(application === "google-workspace" && !profile
                    ? ["oauth"]
                    : (selected?.auth_methods ?? ["oauth"])
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value === "oauth" ? "Login akun (OAuth)" : "Token akses"}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {method === "bearer" && (
                <label htmlFor="app-key" className="space-y-1 text-sm">
                  Token akses
                  <Input
                    id="app-key"
                    type="password"
                    autoComplete="off"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
              )}
              {application === "github" && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  GitHub dapat memakai token akses. Login OAuth memerlukan aplikasi GitHub yang
                  terdaftar; isi Client ID pada pengaturan tambahan.
                </p>
              )}
              <details className="sm:col-span-2">
                <summary className="cursor-pointer text-sm">Pengaturan koneksi tambahan</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {application !== "google-workspace" && (
                    <>
                      <label htmlFor="app-client-id" className="space-y-1 text-sm">
                        OAuth Client ID
                        <Input
                          id="app-client-id"
                          autoComplete="off"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                        />
                      </label>
                      <label htmlFor="app-client-secret" className="space-y-1 text-sm">
                        OAuth Client Secret
                        <Input
                          id="app-client-secret"
                          type="password"
                          autoComplete="off"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  <label htmlFor="app-profile" className="space-y-1 text-sm">
                    Profil server terisolasi
                    <Input
                      id="app-profile"
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                      placeholder="Disediakan operator"
                    />
                  </label>
                </div>
              </details>
              <Button className="justify-self-start" disabled={!data || busy}>
                {editing ? "Simpan dan hubungkan ulang" : "Tambahkan koneksi aplikasi"}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setLabel("");
                    setKey("");
                    setClientId("");
                    setClientSecret("");
                  }}
                >
                  Batalkan perubahan
                </Button>
              )}
            </form>
          </SheetContent>
        </Sheet>
      </Tabs>
    </section>
  );
}
