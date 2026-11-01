import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, request } from "@/lib/api-client";
import type { AppConnection, AppEffect } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

type AppTool = { slug: string; description?: string };
type Catalog = { items: { slug: string; name: string; connected: boolean }[]; cursor?: string };
export function AppConnections({ snapshot }: { snapshot: Snapshot }) {
  const [expanded, setExpanded] = useState(false);
  const connections = useApiResource<AppConnection[]>(
    expanded ? "/v1/apps/connections" : null,
    snapshot.cursor,
  );
  const effects = useApiResource<AppEffect[]>(
    expanded ? "/v1/entities/app_effect" : null,
    snapshot.cursor,
  );
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [editing, setEditing] = useState<AppConnection | null>(null);
  const [agentId, setAgentId] = useState(snapshot.agents[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<AppTool[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      connections.retry();
      effects.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi aplikasi belum tersedia.");
    } finally {
      setBusy(false);
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
  const recent =
    effects.data?.filter(
      (e) =>
        e.thread_id === snapshot.thread.id && snapshot.thread.member_agent_ids.includes(e.agent_id),
    ) ?? [];
  return (
    <details
      className="context-section border-t pt-4"
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">Koneksi aplikasi</summary>
      <div className="mt-3 space-y-4">
        <p className="text-caption text-muted-foreground">
          Hubungkan aplikasi melalui Composio, lalu pilih akses untuk percakapan ini.
        </p>
        {(error || connections.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || connections.error}
          </p>
        )}
        {connections.data
          ?.filter((c) => c.state !== "revoked")
          .map((c) => (
            <section
              key={c.id}
              aria-label={`Koneksi ${c.toolkit} ${c.id.slice(0, 8)}`}
              className="space-y-2 border-b pb-3"
            >
              <p className="text-sm font-medium">
                {c.toolkit}{" "}
                <span className="font-normal text-muted-foreground">
                  ·{" "}
                  {c.state === "active"
                    ? "Terhubung"
                    : c.state === "auth_required"
                      ? "Login diperlukan"
                      : "Menunggu koneksi"}
                </span>
              </p>
              {link?.id === c.id && (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-link underline"
                >
                  Lanjutkan koneksi di Composio ↗
                </a>
              )}
              <p className="text-caption text-muted-foreground">
                {c.grants.filter(
                  (g) =>
                    g.thread_id === snapshot.thread.id &&
                    snapshot.thread.member_agent_ids.includes(g.agent_id),
                ).length
                  ? "Akses diberikan dalam percakapan ini"
                  : "Belum diberikan ke percakapan ini"}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={`Periksa koneksi ${c.toolkit}`}
                  onClick={() =>
                    void act(async () => {
                      await request(`/v1/apps/connections/${c.id}/refresh`, {});
                    })
                  }
                >
                  Periksa koneksi
                </Button>
                {c.state === "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Kelola akses ${c.toolkit}`}
                    onClick={() => edit(c)}
                  >
                    Kelola akses
                  </Button>
                ) : c.state === "auth_required" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const value = await request<{ connect_url: string }>(
                          `/v1/apps/connections/${c.id}/reconnect`,
                          {},
                        );
                        setLink({ id: c.id, url: value.connect_url });
                      })
                    }
                  >
                    Hubungkan ulang
                  </Button>
                ) : null}
              </div>
            </section>
          ))}
        {editing && (
          <section className="space-y-3 border-b pb-4" aria-label={`Akses ${editing.toolkit}`}>
            <h4 className="text-sm font-medium">Akses {editing.toolkit}</h4>
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
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () =>
              setCatalog(
                await request<Catalog>(`/v1/apps/catalog?search=${encodeURIComponent(search)}`),
              ),
            );
          }}
        >
          <Label htmlFor="app-search">Cari aplikasi</Label>
          <Input
            id="app-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kalender, email, atau aplikasi lain…"
          />
          <Button size="sm" variant="outline" disabled={busy}>
            Cari aplikasi
          </Button>
        </form>
        {catalog?.items.map((app) => (
          <div key={app.slug} className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm">{app.name}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Hubungkan ${app.name}`}
              onClick={() =>
                void act(async () => {
                  const value = await request<{ connection: AppConnection; connect_url: string }>(
                    "/v1/apps/connect",
                    { toolkit: app.slug },
                  );
                  setLink({ id: value.connection.id, url: value.connect_url });
                })
              }
            >
              Hubungkan
            </Button>
          </div>
        ))}
        {catalog?.cursor && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const next = await request<Catalog>(
                  `/v1/apps/catalog?search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(catalog.cursor ?? "")}`,
                );
                setCatalog({ items: [...catalog.items, ...next.items], cursor: next.cursor });
              })
            }
          >
            Aplikasi berikutnya
          </Button>
        )}
        {recent.length > 0 && (
          <section className="space-y-3">
            <h4 className="text-caption font-medium text-muted-foreground">Hasil aplikasi</h4>
            {recent.map((e) => (
              <details key={e.id} className="text-sm">
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
          </section>
        )}
        {effects.error && (
          <p className="text-caption text-muted-foreground">
            Hasil aplikasi belum dapat dimuat.{" "}
            <button type="button" className="text-link underline" onClick={effects.retry}>
              Muat ulang
            </button>
          </p>
        )}
      </div>
    </details>
  );
}
