import { Loading03Icon, RefreshIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, request } from "@/lib/api-client";
import type { AppConnection, AppEffect } from "@/types/work";
import type { Snapshot } from "@/types/workspace";
import { PanelCard, PanelEmpty, PanelPageHeader } from "./panel-primitives";
import { useAppAuthorization } from "./use-app-authorization";

type AppTool = { slug: string; description?: string };
type Catalog = { items: { slug: string; name: string; connected: boolean }[]; cursor?: string };
const pill =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-secondary/70 px-3 text-[13px] font-medium leading-5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 touch:h-9";
export function AppConnections({
  snapshot,
  onBack,
  embedded = false,
}: {
  snapshot: Snapshot;
  onBack: () => void;
  embedded?: boolean;
}) {
  const connections = useApiResource<AppConnection[]>("/v1/apps/connections", snapshot.cursor);
  const effects = useApiResource<AppEffect[]>("/v1/entities/app_effect", snapshot.cursor);
  const authorization = useAppAuthorization(connections.retry);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const currentQuery = useRef(debounced);
  currentQuery.current = debounced;
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);
  const catalogResource = useApiResource<Catalog>(
    `/v1/apps/catalog?search=${encodeURIComponent(debounced)}`,
  );
  const [pages, setPages] = useState<{ query: string; value: Catalog } | null>(null);
  const catalog = pages?.query === debounced ? pages.value : catalogResource.data;
  const [taskBusy, setTaskBusy] = useState(false);
  const busy = taskBusy || authorization.busy;
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AppConnection | null>(null);
  const [agentId, setAgentId] = useState(snapshot.agents[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<AppTool[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setTaskBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      connections.retry();
      effects.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi aplikasi belum tersedia.");
    } finally {
      setTaskBusy(false);
    }
  }
  function edit(connection: AppConnection, id = agentId) {
    setEditing(connection);
    setSelected(
      connection.grants.find((g) => g.thread_id === snapshot.thread.id && g.agent_id === id)
        ?.tools ?? [],
    );
    setTools([]);
    setQuery("");
    setNotice("");
  }
  const inventory = connections.data?.filter((connection) => connection.state !== "revoked") ?? [];
  const matches = (name: string) => name.toLowerCase().includes(search.trim().toLowerCase());
  // Filter already-loaded rows immediately; the debounced server result remains authoritative.
  const visibleCatalog =
    catalog?.items.filter(
      (app) => search.trim() === debounced || matches(`${app.name} ${app.slug}`),
    ) ?? [];
  const visibleConnections = inventory.filter((connection) =>
    matches(
      `${connection.toolkit} ${catalog?.items.find((app) => app.slug === connection.toolkit)?.name ?? ""}`,
    ),
  );
  const represented = new Set(
    visibleCatalog.map(
      (app) => inventory.findLast((connection) => connection.toolkit === app.slug)?.id,
    ),
  );
  const extras = connectedOnly
    ? visibleConnections
    : visibleConnections.filter((connection) => !represented.has(connection.id));
  const recent =
    effects.data?.filter(
      (effect) =>
        effect.thread_id === snapshot.thread.id &&
        snapshot.thread.member_agent_ids.includes(effect.agent_id),
    ) ?? [];
  function connectionRow(connection: AppConnection, name: string) {
    const granted = connection.grants.filter(
      (grant) =>
        grant.thread_id === snapshot.thread.id &&
        snapshot.thread.member_agent_ids.includes(grant.agent_id),
    ).length;
    const link = authorization.link?.id === connection.id ? authorization.link : null;
    return (
      <section
        key={connection.id}
        aria-label={`Koneksi ${connection.toolkit} ${connection.id.slice(0, 8)}`}
        className="rounded-xl px-2 py-2 transition-colors hover:bg-secondary/40"
      >
        <div className="flex items-center gap-3">
          <ServiceIcon name={name} />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold leading-5">
              <span className="truncate">{name}</span>
              {connection.state === "active" && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={13}
                  strokeWidth={2.5}
                  className="shrink-0 text-success-foreground"
                  aria-label="Terhubung"
                />
              )}
            </p>
            <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {connection.state === "active"
                ? granted
                  ? "Akses percakapan diberikan"
                  : "Terhubung · pilih akses percakapan"
                : authorization.polling?.id === connection.id
                  ? "Menunggu konfirmasi login"
                  : connection.state === "auth_required"
                    ? "Login diperlukan"
                    : "Menunggu koneksi"}
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-40"
            disabled={busy}
            aria-label={`Periksa koneksi ${connection.toolkit}`}
            title="Periksa koneksi"
            onClick={() => void authorization.check(connection, name)}
          >
            <HugeiconsIcon icon={RefreshIcon} size={15} />
          </button>
          {connection.state === "active" ? (
            <button
              type="button"
              className={pill}
              disabled={busy}
              aria-label={`Kelola akses ${connection.toolkit}`}
              onClick={() => edit(connection)}
            >
              Kelola akses
            </button>
          ) : connection.state === "auth_required" ? (
            <button
              type="button"
              className={pill}
              disabled={busy}
              aria-label={`Hubungkan ulang ${connection.toolkit}`}
              onClick={() => void authorization.authorize(connection.toolkit, name, connection.id)}
            >
              Hubungkan ulang
            </button>
          ) : null}
        </div>
        {link && (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="ms-[52px] mt-1 block text-[13px] text-link underline underline-offset-2"
            onClick={(event) => {
              if (!authorization.continueLink(name)) event.preventDefault();
            }}
          >
            Lanjutkan koneksi di Composio ↗
          </a>
        )}
      </section>
    );
  }
  return (
    <div className={embedded ? "settings-app-connections" : "context-section pt-3.5"}>
      {!embedded && (
        <PanelPageHeader
          title="Koneksi aplikasi"
          back="Detail"
          onBack={onBack}
          intro="Hubungkan aplikasi melalui Composio, lalu pilih akses untuk percakapan ini."
        />
      )}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-secondary/70 px-3.5 focus-within:ring-1 focus-within:ring-ring">
            <HugeiconsIcon
              icon={Search01Icon}
              size={15}
              className="shrink-0 text-muted-foreground"
            />
            <input
              aria-label="Cari aplikasi"
              maxLength={100}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPages(null);
              }}
              placeholder="Cari aplikasi…"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="button"
            aria-pressed={connectedOnly}
            onClick={() => setConnectedOnly((value) => !value)}
            className={`${pill} ${connectedOnly ? "bg-foreground/10 text-foreground" : "text-muted-foreground"}`}
          >
            Terhubung
            {inventory.filter((connection) => connection.state === "active").length > 0
              ? ` ${inventory.filter((connection) => connection.state === "active").length}`
              : ""}
          </button>
        </div>
        {(error || authorization.error || connections.error) && (
          <p role="alert" className="text-[13px] leading-5 text-destructive">
            {error || authorization.error || connections.error}
          </p>
        )}
        {authorization.notice && (
          <p role="status" className="text-[13px] leading-5 text-muted-foreground">
            {authorization.notice}
          </p>
        )}
        {!editing && (
          <section
            aria-label={connectedOnly ? "Akun aplikasi terhubung" : "Katalog aplikasi"}
            className="space-y-1"
          >
            {!connectedOnly && !catalog && !catalogResource.error && (
              <p
                role="status"
                className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="motion-safe:animate-spin"
                />
                Memuat aplikasi…
              </p>
            )}
            {!connectedOnly && catalogResource.error && (
              <p role="alert" className="text-[13px] leading-5 text-muted-foreground">
                Katalog aplikasi belum dapat dimuat.{" "}
                <button
                  type="button"
                  className="text-link underline"
                  onClick={catalogResource.retry}
                >
                  Muat ulang katalog
                </button>
              </p>
            )}
            {!connectedOnly &&
              visibleCatalog.map((app) => {
                const connection = inventory.findLast((value) => value.toolkit === app.slug);
                return connection ? (
                  connectionRow(connection, app.name)
                ) : (
                  <div
                    key={app.slug}
                    className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/40"
                  >
                    <ServiceIcon name={app.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold leading-5">{app.name}</p>
                      <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                        {app.connected
                          ? "Akun terhubung di Composio"
                          : "Hubungkan melalui Composio"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={pill}
                      disabled={busy || !connections.data}
                      aria-label={`Hubungkan ${app.name}`}
                      onClick={() => void authorization.authorize(app.slug, app.name)}
                    >
                      Hubungkan
                    </button>
                  </div>
                );
              })}
            {extras.map((connection) =>
              connectionRow(
                connection,
                catalog?.items.find((app) => app.slug === connection.toolkit)?.name ??
                  connection.toolkit,
              ),
            )}
            {((connectedOnly && connections.data && !extras.length) ||
              (!connectedOnly && catalog && !visibleCatalog.length && !extras.length)) && (
              <PanelEmpty>Tidak ada aplikasi yang cocok.</PanelEmpty>
            )}
            {!connectedOnly && catalog?.cursor && (
              <button
                type="button"
                className={`${pill} mx-auto flex`}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const queryAtStart = debounced;
                    const next = await request<Catalog>(
                      `/v1/apps/catalog?search=${encodeURIComponent(debounced)}&cursor=${encodeURIComponent(catalog.cursor ?? "")}`,
                    );
                    if (currentQuery.current === queryAtStart)
                      setPages({
                        query: queryAtStart,
                        value: {
                          items: [
                            ...new Map(
                              [...catalog.items, ...next.items].map((app) => [app.slug, app]),
                            ).values(),
                          ],
                          cursor: next.cursor,
                        },
                      });
                  })
                }
              >
                Aplikasi berikutnya
              </button>
            )}
          </section>
        )}
        {editing && (
          <section
            className="space-y-3 rounded-[12px] bg-card px-3.5 py-3"
            aria-label={`Akses ${editing.toolkit}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Akses {editing.toolkit}</h4>
              <button type="button" className={pill} onClick={() => setEditing(null)}>
                Selesai
              </button>
            </div>
            {snapshot.thread.type === "group" && (
              <>
                <Label htmlFor="app-agent">Anggota yang mendapat akses</Label>
                <select
                  id="app-agent"
                  className="h-9 w-full rounded-md border bg-background px-2"
                  value={agentId}
                  onChange={(e) => {
                    setAgentId(e.target.value);
                    edit(editing, e.target.value);
                  }}
                >
                  {snapshot.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Input
              aria-label="Cari tindakan aplikasi"
              placeholder="Apa yang perlu dilakukan?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !query.trim()}
              onClick={() =>
                void act(async () => {
                  const result = await request<AppTool[] | { truncated: true; message: string }>(
                    "/v1/apps/search",
                    { connection_id: editing.id, query },
                  );
                  if (!Array.isArray(result)) throw new Error(result.message);
                  setTools(result);
                })
              }
            >
              Cari tindakan
            </Button>
            {[...new Set([...selected, ...tools.map((t) => t.slug)])].map((slug) => (
              <label key={slug} className="flex min-h-10 items-start gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={selected.includes(slug)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked ? [...v, slug] : v.filter((s) => s !== slug),
                    )
                  }
                />
                <span className="break-words">
                  {tools.find((t) => t.slug === slug)?.description ??
                    slug.toLowerCase().replaceAll("_", " ")}
                </span>
              </label>
            ))}
            <Button
              size="sm"
              disabled={busy || !snapshot.thread.member_agent_ids.includes(agentId)}
              onClick={() =>
                void act(async () => {
                  const grants = editing.grants.filter(
                    (g) => !(g.agent_id === agentId && g.thread_id === snapshot.thread.id),
                  );
                  if (selected.length)
                    grants.push({
                      agent_id: agentId,
                      thread_id: snapshot.thread.id,
                      tools: selected,
                    });
                  const result = await command<AppConnection>(
                    `/v1/apps/connections/${editing.id}/assign`,
                    { expected_revision: editing.revision, grants },
                  );
                  setEditing(result);
                  setNotice("Akses percakapan diperbarui.");
                })
              }
            >
              Simpan akses percakapan
            </Button>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
          </section>
        )}
        {recent.length > 0 && (
          <PanelCard label="Hasil aplikasi">
            {recent.map((e) => (
              <details key={e.id} className="px-3.5 py-3 text-[13px]">
                <summary className="cursor-pointer">
                  {e.tool.toLowerCase().replaceAll("_", " ")} ·{" "}
                  {e.state === "succeeded"
                    ? "Berhasil"
                    : e.state === "unknown"
                      ? "Hasil belum diketahui"
                      : e.state === "failed"
                        ? "Gagal"
                        : "Sedang diproses"}
                </summary>
                <div className="mt-2 space-y-2 text-caption">
                  <p>
                    {e.error_code ??
                      (e.state === "unknown"
                        ? "Periksa hasil di aplikasi sebelum meminta tindakan yang sama lagi."
                        : "Receipt dari backend")}
                  </p>
                  {e.log_id && <p className="break-all">Receipt: {e.log_id}</p>}
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                    {e.result === null
                      ? "Belum ada hasil terverifikasi."
                      : JSON.stringify(e.result, null, 2).slice(0, 6000)}
                  </pre>
                </div>
              </details>
            ))}
          </PanelCard>
        )}
        {effects.error && (
          <p className="text-[13px] text-muted-foreground">
            Hasil aplikasi belum dapat dimuat.{" "}
            <button type="button" className="text-link underline" onClick={effects.retry}>
              Muat ulang
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** The current catalog projection has no logo/domain fields: use the upstream ServiceIcon initial fallback. */
function ServiceIcon({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-[15px] font-semibold text-muted-foreground"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
