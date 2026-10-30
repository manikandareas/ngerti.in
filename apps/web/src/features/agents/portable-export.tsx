import { useAuth } from "@clerk/tanstack-react-start";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { base, command, submit } from "@/features/direct-messages/client";
import { ResourcePanel } from "@/features/direct-messages/resource-panel";
import type { Artifact, Message, Thread } from "@/features/direct-messages/state";
import { api } from "@/lib/api";
import { type Bundle, Counts } from "./portable-import";

type Learning = {
  memories: { memory_id: string; content: string; scope_kind: string }[];
  skills: { skill_id: string; name: string; status: string }[];
};

export function PortableExport({
  thread,
  messages,
  artifacts,
}: {
  thread: Thread;
  messages: Message[];
  artifacts: Artifact[];
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(thread.agents[0]?.agent_id ?? "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [learning, setLearning] = useState<Learning | null>(null);
  const [preview, setPreview] = useState<{
    bundle: Bundle;
    selection_counts: Record<string, number>;
    fingerprint: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [url, setUrl] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function choose(id: string, value: boolean) {
    setSelected((old) => ({ ...old, [id]: value }));
    setPreview(null);
    setUrl("");
  }
  async function loadLearning() {
    setBusy(true);
    setError("");
    try {
      setLearning(
        await api<Learning>(
          `${base}/threads/${thread.thread_id}/learning?agent_id=${agentId}`,
          await getToken(),
        ),
      );
    } catch {
      setError("Memori dan skills belum dapat dimuat. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submit<{
        bundle: Bundle;
        selection_counts: Record<string, number>;
        fingerprint: string;
      }>(
        command("portable.export", {
          agent_id: agentId,
          thread_id: thread.thread_id,
          message_ids: messages.filter((m) => selected[m.message_id]).map((m) => m.message_id),
          memory_ids:
            learning?.memories.filter((m) => selected[m.memory_id]).map((m) => m.memory_id) ?? [],
          skill_ids:
            learning?.skills
              .filter((s) => s.status === "active" && selected[s.skill_id])
              .map((s) => s.skill_id) ?? [],
          artifact_ids: artifacts.filter((a) => selected[a.artifact_id]).map((a) => a.artifact_id),
        }),
        await getToken(),
      );
      setPreview(result);
      setUrl(
        URL.createObjectURL(
          new Blob([JSON.stringify(result.bundle)], { type: "application/json" }),
        ),
      );
    } catch {
      setPreview(null);
      setUrl("");
      setError(
        "Paket belum dapat dibuat. Pilih lebih sedikit konten dan periksa akses file. Batas paket 1 MiB; berkas kredensial tidak dapat diekspor.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const option = (id: string, label: string) => (
    <label key={id} className="flex min-w-0 items-start gap-2 py-1 text-sm">
      <NativeChoice
        type="checkbox"
        checked={!!selected[id]}
        disabled={busy}
        onChange={(e) => choose(id, e.target.checked)}
      />
      <span className="line-clamp-3 min-w-0 wrap-anywhere">{label}</span>
    </label>
  );
  return (
    <ResourcePanel
      title="Ekspor agent"
      description="Pilih riwayat, memori, skills, dan file untuk disertakan."
      icon={<Download className="size-4" />}
      open={open}
      onOpenChange={setOpen}
    >
      {thread.kind === "group" && (
        <label className="block space-y-2 text-sm">
          Agent yang diekspor
          <NativeSelect
            aria-label="Agent yang diekspor"
            value={agentId}
            className="min-h-11 w-full rounded-md border bg-background px-3"
            disabled={busy}
            onChange={(e) => {
              setAgentId(e.target.value);
              setLearning(null);
              setSelected({});
              setPreview(null);
              setUrl("");
            }}
          >
            {thread.agents.map((a) => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.display_name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {thread.kind === "group" && (
        <p className="text-sm text-muted-foreground">
          Riwayat dan memori grup diimpor sebagai file arsip dengan nama penulis asli. Riwayat
          tersebut tidak menjadi instruksi atau tanggung jawab baru di DM.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Karakter dan referensi konfigurasi disertakan. Riwayat, memori, skills, dan file hanya masuk
        jika dipilih. Kunci akun, sesi browser, goals, dan jadwal tidak disertakan.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Pilih pesan dari riwayat yang dimuat
        </summary>
        <div className="max-h-64 space-y-2 overflow-y-auto py-3">
          {messages.map((m) => option(m.message_id, `Pesan ${m.message_seq}: ${m.content}`))}
        </div>
        <p className="text-xs text-muted-foreground">
          Untuk memilih pesan yang lebih lama, muat riwayat sebelumnya di percakapan.
        </p>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Pilih file hasil</summary>
        <div className="space-y-2 pt-3">
          {artifacts.length ? (
            artifacts.map((a) => option(a.artifact_id, a.filename))
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada file hasil.</p>
          )}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Pilih memori dan skills</summary>
        <div className="space-y-2 pt-3">
          {!learning && (
            <Button variant="outline" disabled={busy} onClick={() => void loadLearning()}>
              Muat memori dan skills
            </Button>
          )}
          {learning?.memories.map((m) => option(m.memory_id, m.content))}
          {learning?.skills
            .filter((s) => s.status === "active")
            .map((s) => option(s.skill_id, s.name))}
        </div>
      </details>
      <Button disabled={busy} onClick={() => void inspect()}>
        {busy ? "Menyiapkan…" : "Pratinjau ekspor"}
      </Button>
      {preview && (
        <div className="space-y-3 border-t pt-3">
          <Counts counts={preview.selection_counts} />
          <p className="text-sm font-medium wrap-anywhere">{preview.bundle.agent.display_name}</p>
          <p className="line-clamp-4 whitespace-pre-wrap text-sm wrap-anywhere">
            {preview.bundle.agent.soul}
          </p>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            Sidik paket: {preview.fingerprint}
          </p>
          <Button asChild>
            <a href={url} download={`${preview.bundle.agent.handle}.ngertiin.json`}>
              Unduh paket agent
            </a>
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </ResourcePanel>
  );
}
