import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/hooks/use-api-resource";
import { command, request } from "@/lib/api-client";
import { artifactUrl, uploadFile } from "@/lib/workspace-files";
import type { Artifact, Workspace } from "@/types/work";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { type FileView, FileViewer } from "./file-viewer";

type Files = { entries: { name: string; path: string; type: string }[]; next_after: string | null };
export function FilesPanel({
  snapshot,
  threads,
  agents,
  selected,
  select,
  refresh,
  attach,
}: {
  snapshot: Snapshot;
  threads: Thread[];
  agents: Agent[];
  selected: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<unknown>;
  attach: (a: Artifact) => void;
}) {
  const active = snapshot.workspaces.filter(
    (w) => w.state === "active" && snapshot.thread.member_agent_ids.includes(w.agent_id),
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState(snapshot.agents[0]?.id ?? "");
  const workspace =
    active.find((w) => w.id === workspaceId) ??
    active.find((w) => w.agent_id === agentId) ??
    active[0];
  const [path, setPath] = useState("");
  const [after, setAfter] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FileView | null>(null);
  const [destinations, setDestinations] = useState<Workspace[] | null>(null);
  const [destination, setDestination] = useState("");
  const [shared, setShared] = useState("");
  const listing = useApiResource<Files>(
    workspace
      ? `/v1/workspaces/${workspace.id}/files?path=${encodeURIComponent(path)}&after=${encodeURIComponent(after)}`
      : null,
    snapshot.cursor,
  );
  const artifact = snapshot.artifacts.find((a) => a.id === selected);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "File belum tersedia.");
    } finally {
      setBusy(false);
    }
  }
  function open(item: Artifact) {
    if (item.workspace_id && active.some((w) => w.id === item.workspace_id))
      setPreview({ name: item.name, url: artifactUrl(item), mediaType: item.media_type });
    else
      setError(
        "Folder asal tidak lagi terhubung. Bagikan file ke folder aktif atau periksa aksesnya.",
      );
  }
  return (
    <div className="context-section space-y-5">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {artifact ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              select(null);
              setDestinations(null);
              setShared("");
            }}
          >
            ← File
          </Button>
          <h3 className="break-all font-medium">{artifact.name}</h3>
          <p className="text-caption text-muted-foreground">
            {artifact.media_type} · {artifact.size_bytes ?? "?"} byte
          </p>
          <dl className="space-y-2 break-all text-caption">
            <div>
              <dt className="text-muted-foreground">Asal</dt>
              <dd>
                {artifact.origin}
                {artifact.source_artifact_id ? " · salinan dibagikan" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pekerjaan</dt>
              <dd>{artifact.run_id ?? "Lampiran pengguna"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => open(artifact)}>
              Buka {artifact.name}
            </Button>
            {active.some((w) => w.id === artifact.workspace_id) && (
              <Button variant="outline" size="sm" asChild>
                <a href={artifactUrl(artifact)} download={artifact.name}>
                  Unduh {artifact.name}
                </a>
              </Button>
            )}
            {snapshot.thread.type === "dm" &&
              active.some((w) => w.id === artifact.workspace_id) && (
                <Button variant="ghost" size="sm" onClick={() => attach(artifact)}>
                  Lampirkan ke pesan
                </Button>
              )}
          </div>
          <details
            onToggle={(e) => {
              if (e.currentTarget.open && !destinations)
                void act(async () => {
                  setDestinations(
                    (await request<Workspace[]>("/v1/entities/workspace")).filter(
                      (w) => w.state === "active" && w.id !== artifact.workspace_id,
                    ),
                  );
                });
            }}
          >
            <summary className="cursor-pointer text-sm">Bagikan salinan ke percakapan lain</summary>
            <div className="mt-3 space-y-3">
              <Label htmlFor="share-destination">Folder tujuan</Label>
              <select
                id="share-destination"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setShared("");
                }}
              >
                <option value="">Pilih folder…</option>
                {destinations?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {threads.find((t) => t.id === w.thread_id)?.name ??
                      agents.find((a) => a.id === w.agent_id)?.name ??
                      "Percakapan"}{" "}
                    · {agents.find((a) => a.id === w.agent_id)?.name ?? "Agent"} · {w.name}
                  </option>
                ))}
              </select>
              <p className="text-caption text-muted-foreground">
                Hanya file ini yang disalin. Riwayat, memory, dan file lain tetap di konteks asal.
              </p>
              <Button
                size="sm"
                disabled={!destination || busy}
                onClick={() =>
                  void act(async () => {
                    await command(`/v1/artifacts/${artifact.id}/share`, {
                      workspace_id: destination,
                    });
                    setShared("Salinan berhasil dibagikan.");
                  })
                }
              >
                Bagikan file ini
              </Button>
              {shared && (
                <p role="status" className="text-sm">
                  {shared}
                </p>
              )}
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            Folder, lampiran, dan hasil mengikuti percakapan ini.
          </p>
          {active.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="workspace-choice">Folder kerja</Label>
              <select
                id="workspace-choice"
                className="h-9 w-full rounded-md border bg-background px-2"
                value={workspace?.id ?? ""}
                onChange={(e) => {
                  setWorkspaceId(e.target.value);
                  setPath("");
                  setAfter("");
                }}
              >
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {snapshot.agents.find((a) => a.id === w.agent_id)?.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {workspace ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">{workspace.name}</h3>
                <p className="break-all text-caption text-muted-foreground">
                  {workspace.project_path ?? "Folder percakapan terkelola"}
                </p>
              </div>
              <Label htmlFor="file-upload" className="text-link">
                Unggah file
              </Label>
              <input
                id="file-upload"
                aria-label="Unggah file"
                type="file"
                className="max-w-full text-xs"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void act(async () => {
                      const result = await uploadFile(workspace.id, file);
                      select(result.id);
                    });
                }}
              />
              <p className="text-caption text-muted-foreground">
                Maksimal 16 MB per file. Upload menyimpan file di folder ini.
              </p>
              {path && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPath(path.split("/").slice(0, -1).join("/"));
                    setAfter("");
                  }}
                >
                  ← Folder induk
                </Button>
              )}
              {listing.error ? (
                <div role="alert" className="text-sm">
                  <p>{listing.error}</p>
                  <Button size="sm" variant="outline" onClick={listing.retry}>
                    Muat file lagi
                  </Button>
                </div>
              ) : listing.data ? (
                <div>
                  {listing.data.entries.length === 0 && (
                    <p className="py-5 text-sm text-muted-foreground">
                      Folder ini belum berisi file.
                    </p>
                  )}
                  {listing.data.entries.map((entry) => (
                    <div key={entry.path} className="flex items-center border-b">
                      <Button
                        variant="ghost"
                        className="h-auto min-h-10 min-w-0 flex-1 justify-start px-1 text-left"
                        disabled={entry.type === "unsupported"}
                        onClick={() => {
                          if (entry.type === "directory") {
                            setPath(entry.path);
                            setAfter("");
                          } else
                            setPreview({
                              name: entry.name,
                              url: `/v1/workspaces/${workspace.id}/file?path=${encodeURIComponent(entry.path)}`,
                            });
                        }}
                      >
                        <span className="truncate">
                          {entry.type === "directory" ? "↳ " : ""}
                          {entry.name}
                        </span>
                      </Button>
                      {entry.type === "file" && (
                        <a
                          className="px-2 text-caption text-link"
                          href={`/v1/workspaces/${workspace.id}/file?path=${encodeURIComponent(entry.path)}`}
                          download={entry.name}
                          aria-label={`Unduh ${entry.name}`}
                        >
                          ↓
                        </a>
                      )}
                    </div>
                  ))}
                  {listing.data.next_after && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAfter(listing.data?.next_after ?? "")}
                    >
                      File berikutnya
                    </Button>
                  )}
                  {after && (
                    <Button variant="ghost" size="sm" onClick={() => setAfter("")}>
                      Kembali ke awal
                    </Button>
                  )}
                </div>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  Memuat file…
                </p>
              )}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada folder yang terhubung. Gunakan folder percakapan atau hubungkan folder kerja
              saat diperlukan.
            </p>
          )}
          <details open={!workspace}>
            <summary className="cursor-pointer text-sm">
              {workspace ? "Ubah folder yang terhubung" : "Hubungkan folder"}
            </summary>
            <div className="mt-3 space-y-3">
              {snapshot.thread.type === "group" && (
                <>
                  <Label htmlFor="workspace-agent">Folder untuk anggota</Label>
                  <select
                    id="workspace-agent"
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                  >
                    {snapshot.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const value = await command<Workspace>("/v1/workspaces", {
                      agent_id: agentId,
                      thread_id: snapshot.thread.id,
                    });
                    setWorkspaceId(value.id);
                    setPath("");
                    setAfter("");
                  })
                }
              >
                Gunakan folder percakapan
              </Button>
              <Label htmlFor="project-path">Folder lokal pada host backend</Label>
              <Input
                id="project-path"
                placeholder="/path/ke/proyek"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
              <Button
                size="sm"
                disabled={busy || !project.startsWith("/")}
                onClick={() =>
                  void act(async () => {
                    const value = await command<Workspace>("/v1/workspaces", {
                      agent_id: agentId,
                      thread_id: snapshot.thread.id,
                      project_path: project,
                    });
                    setWorkspaceId(value.id);
                    setPath("");
                    setAfter("");
                  })
                }
              >
                Hubungkan folder lokal
              </Button>
            </div>
          </details>
          <section className="space-y-2">
            <h3 className="text-caption font-medium text-muted-foreground">Lampiran dan hasil</h3>
            {snapshot.artifacts.length ? (
              snapshot.artifacts.map((a) => (
                <Button
                  key={a.id}
                  aria-label={`File ${a.name}`}
                  variant="ghost"
                  className="h-auto min-h-12 w-full justify-start border-b px-1 text-left"
                  onClick={() => select(a.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{a.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {a.origin === "upload" ? "Lampiran" : "Hasil"} ·{" "}
                      {snapshot.agents.find((agent) => agent.id === a.agent_id)?.name}
                    </span>
                  </span>
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Lampiran dan hasil pekerjaan akan muncul di sini.
              </p>
            )}
          </section>
        </>
      )}
      <FileViewer file={preview} close={() => setPreview(null)} />
    </div>
  );
}
