import { useAuth } from "@clerk/tanstack-react-start";
import { Brain } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { base, command, submit } from "./client";
import { ResourcePanel } from "./resource-panel";
import type { Thread } from "./state";

type Memory = {
  memory_id: string;
  revision: string;
  content: string;
  scope_kind: string;
  source_message_ids: string[];
  sources?: { message_id: string; href: string }[];
  history: { revision: string; content: string }[];
};
type Skill = {
  skill_id: string;
  name: string;
  revision: string;
  status: "active" | "archived";
  content: string;
  assets: string[];
  runtime_ready: boolean;
  reason: string | null;
  usage_count: number;
  usage?: { revision: string; status: string; href: string; created_at: string; run_id: string }[];
  provenance: { run_id?: string; source_message_ids?: string[] };
  sources?: { message_id: string; href: string }[];
  history: { revision: string; content: string; assets: string[]; created_at: string }[];
};
type CatalogItem = {
  id: string;
  name: string;
  description: string;
  classification: string;
  reason: string;
};
type Learning = { memories: Memory[]; skills: Skill[]; catalog: CatalogItem[] };
const reasons: Record<string, string> = {
  workflow_setup_required: "Alat atau akun pendukung perlu disiapkan",
  native_workspace_required: "Aktifkan kemampuan ruang kerja pada agent",
  document_dependencies_required: "Alat dokumen perlu dipasang di ruang kerja",
  skill_assets_required: "File pendukung skill perlu dipulihkan",
};

export function LearningControls({ thread }: { thread: Thread }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(thread.agents[0]?.agent_id ?? "");
  const [data, setData] = useState<Learning | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{
    kind: "memory" | "skill";
    id: string;
    revision: string;
    text: string;
  } | null>(null);
  const selected = useRef(agentId);
  const lock = useRef(false);
  const pending = useRef<object | null>(null);

  async function load(id = agentId) {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const result = await api<Learning>(
        `${base}/threads/${thread.thread_id}/learning?agent_id=${encodeURIComponent(id)}`,
        token,
      );
      if (selected.current === id) setData(result);
    } catch (cause) {
      if (selected.current === id)
        setError(cause instanceof Error ? cause.message : "Pembelajaran belum dapat dimuat.");
    } finally {
      if (selected.current === id) setBusy(false);
    }
  }

  async function change(type: string, payload: object, revision: string | null = null) {
    if (lock.current || !agentId) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const id = agentId;
    pending.current ??= {
      ...command(type, { agent_id: id, thread_id: thread.thread_id, ...payload }),
      expected_revision: revision,
    };
    try {
      await submit(pending.current, await getToken());
      pending.current = null;
      setEditing(null);
      setNotice("Perubahan tersimpan.");
      await load(id);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![401, 408, 429].includes(cause.status)
      )
        pending.current = null;
      setError(
        cause instanceof Error ? cause.message : "Perubahan belum terkonfirmasi. Coba kembali.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <ResourcePanel
      title="Memori dan skills"
      icon={<Brain className="size-4" />}
      description="Yang diingat dan dipelajari agent dari percakapan."
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <div aria-busy={busy}>
        {open && thread.kind === "group" && (
          <NativeSelect
            className="max-w-full rounded-md border bg-background p-2 text-sm"
            aria-label="Agent pembelajaran"
            value={agentId}
            disabled={busy || Boolean(pending.current)}
            onChange={(event) => {
              const id = event.target.value;
              selected.current = id;
              setAgentId(id);
              setData(null);
              setEditing(null);
              setNotice("");
              void load(id);
            }}
          >
            {thread.agents
              .filter((agent) => agent.status === "active")
              .map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.display_name}
                </option>
              ))}
          </NativeSelect>
        )}
      </div>
      {open && (
        <div className="space-y-5 pt-3">
          <p className="text-xs text-muted-foreground">
            {thread.kind === "group"
              ? "Pembelajaran di sini hanya tersedia dalam grup ini."
              : "Memori dan metode privat mengikuti agent ini di DM-nya."}{" "}
            Agent juga dapat memperbaruinya melalui percakapan.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          {busy && !data && (
            <p role="status" className="animate-pulse text-sm motion-reduce:animate-none">
              Memuat pembelajaran…
            </p>
          )}
          {Boolean(pending.current) && !busy && (
            <Button size="sm" onClick={() => void change("", {})}>
              Periksa dan ulangi permintaan
            </Button>
          )}
          {editing && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void change(
                  `learning.${editing.kind}`,
                  {
                    action: "correct",
                    [editing.kind === "memory" ? "memory_id" : "skill_id"]: editing.id,
                    content: editing.text,
                  },
                  editing.revision,
                );
              }}
            >
              <label
                htmlFor={`learning-edit-${thread.thread_id}`}
                className="block space-y-2 text-sm"
              >
                Koreksi {editing.kind === "memory" ? "memori" : "skill"}
                <Textarea
                  id={`learning-edit-${thread.thread_id}`}
                  aria-label={`Koreksi ${editing.kind === "memory" ? "memori" : "skill"}`}
                  className="min-h-32 max-h-64 overflow-y-auto"
                  value={editing.text}
                  onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                />
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || !editing.text.trim() || Boolean(pending.current)}
                >
                  Simpan koreksi
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Batal
                </Button>
              </div>
            </form>
          )}
          {data && (
            <>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Yang diingat</h2>
                {data.memories.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Belum ada memori tersimpan. Sampaikan preferensi yang ingin diingat melalui
                    percakapan.
                  </p>
                )}
                {data.memories.map((memory) => (
                  <article key={memory.memory_id} className="space-y-3 rounded-xl bg-muted/60 p-4">
                    <p className="whitespace-pre-wrap break-words text-sm">{memory.content}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || Boolean(pending.current)}
                        onClick={() =>
                          setEditing({
                            kind: "memory",
                            id: memory.memory_id,
                            revision: memory.revision,
                            text: memory.content,
                          })
                        }
                      >
                        Koreksi
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || Boolean(pending.current)}
                        onClick={() =>
                          void change(
                            "learning.memory",
                            { action: "forget", memory_id: memory.memory_id },
                            memory.revision,
                          )
                        }
                      >
                        Lupakan
                      </Button>
                    </div>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        Sumber dan revisi {memory.revision}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {(
                          memory.sources ??
                          memory.source_message_ids.map((id) => ({
                            message_id: id,
                            href: `#message-${id}`,
                          }))
                        ).map((source) => (
                          <li key={source.message_id}>
                            <a href={source.href} className="underline">
                              Pesan sumber
                            </a>
                          </li>
                        ))}
                        {memory.history.map((revision) => (
                          <li key={revision.revision} className="whitespace-pre-wrap break-words">
                            Revisi {revision.revision}: {revision.content}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </article>
                ))}
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Skills tersimpan</h2>
                {data.skills.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Metode yang dipelajari agent dan skill yang dipasang akan muncul di sini.
                  </p>
                )}
                {data.skills.map((skill) => (
                  <details
                    key={skill.skill_id}
                    className="border-b border-border/60 py-3 last:border-0"
                  >
                    <summary className="cursor-pointer break-words text-sm">
                      <span className="font-medium">{skill.name}</span> ·{" "}
                      {skill.status === "archived"
                        ? "Diarsipkan"
                        : skill.runtime_ready
                          ? "Siap digunakan"
                          : "Perlu disiapkan"}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {skill.reason && (
                        <p className="text-xs text-muted-foreground">
                          {reasons[skill.reason] ?? skill.reason}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Revisi {skill.revision} · Dibuka {skill.usage_count} kali ·{" "}
                        {skill.assets.length} file
                      </p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                        {skill.content}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || Boolean(pending.current)}
                          onClick={() =>
                            setEditing({
                              kind: "skill",
                              id: skill.skill_id,
                              revision: skill.revision,
                              text: skill.content,
                            })
                          }
                        >
                          Koreksi
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || Boolean(pending.current)}
                          onClick={() =>
                            void change(
                              "learning.skill",
                              {
                                skill_id: skill.skill_id,
                                action: skill.status === "archived" ? "restore" : "archive",
                              },
                              skill.revision,
                            )
                          }
                        >
                          {skill.status === "archived" ? "Pulihkan" : "Arsipkan"}
                        </Button>
                      </div>
                      <details>
                        <summary className="cursor-pointer text-xs">
                          File dan riwayat revisi
                        </summary>
                        <ul className="my-2 break-words text-xs text-muted-foreground">
                          {skill.assets.map((asset) => (
                            <li key={asset}>{asset}</li>
                          ))}
                        </ul>
                        {skill.usage?.length ? (
                          <ul className="my-2 space-y-1 text-xs">
                            {skill.usage.map((use) => (
                              <li key={`${use.run_id}:${use.revision}:${use.created_at}`}>
                                <a href={use.href} className="underline">
                                  Percakapan penggunaan revisi {use.revision}
                                </a>
                                {" · "}
                                {(
                                  {
                                    succeeded: "Selesai",
                                    failed: "Gagal",
                                    cancelled: "Dihentikan",
                                    indeterminate: "Perlu diperiksa",
                                    running: "Berjalan",
                                  } as Record<string, string>
                                )[use.status] ?? use.status}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {(
                          skill.sources ??
                          skill.provenance.source_message_ids?.map((id) => ({
                            message_id: id,
                            href: `#message-${id}`,
                          }))
                        )?.map((source) => (
                          <a
                            key={source.message_id}
                            href={source.href}
                            className="mr-3 text-xs underline"
                          >
                            Pesan sumber
                          </a>
                        ))}
                        {skill.history
                          ?.filter((revision) => revision.revision !== skill.revision)
                          .map((revision) => (
                            <details key={revision.revision} className="mt-2">
                              <summary className="cursor-pointer text-xs">
                                Revisi {revision.revision}
                              </summary>
                              <pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                                {revision.content}
                              </pre>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy || Boolean(pending.current)}
                                onClick={() =>
                                  void change(
                                    "learning.skill",
                                    {
                                      skill_id: skill.skill_id,
                                      action: "rollback",
                                      source_revision: revision.revision,
                                    },
                                    skill.revision,
                                  )
                                }
                              >
                                Pulihkan revisi {revision.revision}
                              </Button>
                            </details>
                          ))}
                      </details>
                    </div>
                  </details>
                ))}
              </div>
              <details className="space-y-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Temukan skill dari katalog
                </summary>
                <Input
                  aria-label="Cari skill"
                  placeholder="Cari Word, Excel, riset…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="max-h-72 overflow-auto">
                  {data.catalog
                    .filter(
                      (item) =>
                        item.classification !== "excluded" &&
                        `${item.name} ${item.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 border-b border-border/60 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium">{item.name}</p>
                          <p className="break-words text-xs text-muted-foreground">
                            {item.description}
                          </p>
                          {item.classification === "setup_required" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Memerlukan penyiapan alat atau layanan
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            Boolean(pending.current) ||
                            data.skills.some((skill) => skill.name === item.name)
                          }
                          onClick={() => void change("learning.install", { catalog_id: item.id })}
                        >
                          {data.skills.some((skill) => skill.name === item.name)
                            ? "Terpasang"
                            : "Pasang"}
                        </Button>
                      </div>
                    ))}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </ResourcePanel>
  );
}
