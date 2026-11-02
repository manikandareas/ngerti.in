import {
  ArrowRight01Icon,
  ArrowUp02Icon,
  Download04Icon,
  File02Icon,
  Folder01Icon,
  FolderOpenIcon,
  Share08Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { PanelCard, PanelEmpty, PanelNavRow, PanelPageHeader } from "./panel-primitives";

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
    <div className="context-section min-w-0 space-y-3.5 pt-3.5">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {artifact ? (
        <>
          <PanelPageHeader
            title={artifact.name}
            back="Library"
            onBack={() => {
              select(null);
              setDestinations(null);
              setShared("");
            }}
          />
          <p className="text-caption text-muted-foreground">
            {artifact.media_type} · {artifact.size_bytes ?? "?"} byte
          </p>
          <PanelCard label="Tentang file">
            <dl className="divide-y divide-foreground/[0.05] break-all text-[13px] [&>div]:px-3.5 [&>div]:py-3 [&_dt]:mb-1">
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
          </PanelCard>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => open(artifact)}>
              <HugeiconsIcon icon={File02Icon} size={14} strokeWidth={1.5} />
              Buka {artifact.name}
            </Button>
            {active.some((w) => w.id === artifact.workspace_id) && (
              <Button variant="outline" size="sm" asChild>
                <a href={artifactUrl(artifact)} download={artifact.name}>
                  <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.5} />
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
            className="group/share rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06]"
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
            <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3.5 py-[11px] text-[14px] [&::-webkit-details-marker]:hidden">
              <HugeiconsIcon
                icon={Share08Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground"
              />
              <span className="flex-1">Bagikan salinan ke percakapan lain</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground group-open/share:rotate-90"
              />
            </summary>
            <div className="space-y-3 px-3.5 pb-3.5">
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
            <PanelCard label="Folder kerja">
              <div className="space-y-3 px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <HugeiconsIcon
                    icon={FolderOpenIcon}
                    size={18}
                    strokeWidth={1.5}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{workspace.name}</h3>
                    <p className="break-all text-caption text-muted-foreground">
                      {workspace.project_path ?? "Folder percakapan terkelola"}
                    </p>
                  </div>
                </div>
                <Label
                  htmlFor="file-upload"
                  tabIndex={0}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] bg-control px-3.5 text-[13px] font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      document.getElementById("file-upload")?.click();
                    }
                  }}
                >
                  <HugeiconsIcon icon={Upload04Icon} size={14} strokeWidth={1.5} />
                  Unggah file
                </Label>
                <input
                  id="file-upload"
                  aria-label="Unggah file"
                  type="file"
                  className="sr-only"
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
                    <HugeiconsIcon icon={ArrowUp02Icon} size={13} strokeWidth={1.5} />
                    Folder induk
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
                      <div
                        key={entry.path}
                        className="flex min-h-[46px] items-center gap-1 border-b border-foreground/[0.05] last:border-0"
                      >
                        <Button
                          variant="ghost"
                          className="h-auto min-h-[46px] min-w-0 flex-1 justify-start gap-2.5 px-0 text-left text-[13px] font-normal"
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
                          {entry.type === "directory" ? (
                            <HugeiconsIcon
                              icon={Folder01Icon}
                              size={16}
                              strokeWidth={1.5}
                              className="shrink-0 text-muted-foreground"
                            />
                          ) : (
                            <HugeiconsIcon
                              icon={File02Icon}
                              size={16}
                              strokeWidth={1.5}
                              className="shrink-0 text-muted-foreground"
                            />
                          )}
                          <span className="truncate">{entry.name}</span>
                        </Button>
                        {entry.type === "file" && (
                          <a
                            className="px-2 text-caption text-link"
                            href={`/v1/workspaces/${workspace.id}/file?path=${encodeURIComponent(entry.path)}`}
                            download={entry.name}
                            aria-label={`Unduh ${entry.name}`}
                          >
                            <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.5} />
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
              </div>
            </PanelCard>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada folder yang terhubung. Gunakan folder percakapan atau hubungkan folder kerja
              saat diperlukan.
            </p>
          )}
          <details
            open={!workspace}
            className="group/folder rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06]"
          >
            <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3.5 py-[11px] text-[14px] [&::-webkit-details-marker]:hidden">
              <HugeiconsIcon
                icon={FolderOpenIcon}
                size={15}
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
              <span className="flex-1">
                {workspace ? "Ubah folder yang terhubung" : "Hubungkan folder"}
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={15}
                strokeWidth={1.5}
                className="text-muted-foreground group-open/folder:rotate-90"
              />
            </summary>
            <div className="space-y-3 px-3.5 pb-3.5">
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
          <PanelCard label="Lampiran dan hasil">
            {snapshot.artifacts.length ? (
              snapshot.artifacts.map((item) => (
                <PanelNavRow
                  key={item.id}
                  title={item.name}
                  aria-label={`File ${item.name}`}
                  icon={File02Icon}
                  hint={`${item.origin === "upload" ? "Lampiran" : "Hasil"} · ${snapshot.agents.find((agent) => agent.id === item.agent_id)?.name ?? "Agent"}`}
                  onClick={() => select(item.id)}
                />
              ))
            ) : (
              <PanelEmpty>Lampiran dan hasil pekerjaan akan muncul di sini.</PanelEmpty>
            )}
          </PanelCard>
        </>
      )}
      <FileViewer file={preview} close={() => setPreview(null)} />
    </div>
  );
}
