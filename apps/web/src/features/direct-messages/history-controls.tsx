import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { command, submit } from "./client";
import { ResourcePanel } from "./resource-panel";
import type { Message, Thread } from "./state";

type HistoryCommand = Omit<ReturnType<typeof command>, "expected_revision"> & {
  expected_revision: string;
};

type Match = {
  message_id: string;
  thread_id: string;
  message_seq: string;
  title: string;
  preview: string;
};
type Usage = {
  run_id: string;
  usage: {
    total_tokens?: number;
    native_estimated_cost_usd?: number;
    available: boolean;
    cost_status?: string;
  };
};

export function HistoryControls({
  thread,
  messages,
  refresh,
}: {
  thread: Thread;
  messages: Message[];
  refresh: () => void;
}) {
  const { getToken, userId } = useAuth();
  const [title, setTitle] = useState(thread.title);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [usageAfter, setUsageAfter] = useState<string | null>(null);
  const [through, setThrough] = useState(messages.at(-1)?.message_seq ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [branch, setBranch] = useState<Thread | null>(null);
  const [pending, setPending] = useState<HistoryCommand | null>(null);
  const locked = useRef(false);
  const searchVersion = useRef(0);
  const key = `nma-history:v1:${userId}:${thread.thread_id}`;
  useEffect(() => {
    try {
      setPending(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    } catch {
      /* Storage is optional. */
    }
  }, [key]);
  useEffect(() => {
    if (!pending) setTitle(thread.title);
  }, [thread.title, pending]);

  async function act(type: "history.rename" | "history.branch") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const body = pending ?? {
      ...command(type, {
        thread_id: thread.thread_id,
        title,
        ...(type === "history.branch" ? { through_sequence: through } : {}),
      }),
      expected_revision: thread.revision,
    };
    setPending(body);
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
    } catch {
      /* Retain the exact command in memory. */
    }
    try {
      const result = await submit<{ thread: Thread }>(body, await getToken());
      setPending(null);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
      if (body.type === "history.branch") setBranch(result.thread);
      else {
        setNotice("Nama percakapan tersimpan.");
        refresh();
      }
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![401, 403, 408, 429].includes(cause.status)
      ) {
        setPending(null);
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* Storage is optional. */
        }
        setError(
          "Perubahan ditolak. Muat ulang untuk mengambil versi terbaru sebelum mencoba lagi.",
        );
      } else
        setError(
          "Hasil belum terkonfirmasi. Periksa kembali permintaan yang sama; riwayat tetap tersimpan.",
        );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function search(cursor: string | null = null) {
    if (locked.current || !query.trim()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const version = searchVersion.current;
    try {
      const result = await submit<{ items: Match[]; next_cursor: string | null }>(
        command("history.search", { query, thread_id: thread.thread_id, after: cursor }),
        await getToken(),
      );
      if (searchVersion.current === version) {
        setMatches((old) => (cursor ? [...(old ?? []), ...result.items] : result.items));
        setAfter(result.next_cursor);
      }
    } catch {
      setError("Pencarian belum dapat dimuat. Coba kembali.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function loadUsage() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submit<{ items: Usage[]; next_cursor: string | null }>(
        command("history.usage", { thread_id: thread.thread_id, after: usageAfter }),
        await getToken(),
      );
      setUsage((old) => [...(old ?? []), ...result.items]);
      setUsageAfter(result.next_cursor);
    } catch {
      setError("Penggunaan belum dapat dimuat. Coba kembali.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <ResourcePanel
      title="Riwayat dan penggunaan"
      description="Cari pesan, ubah nama, atau lanjutkan cabang percakapan."
      icon={<History className="size-4" />}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="block space-y-2 text-sm">
          Cari dalam percakapan
          <Input
            value={query}
            maxLength={200}
            onChange={(e) => {
              searchVersion.current++;
              setQuery(e.target.value);
              setMatches(null);
              setAfter(null);
            }}
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
          Cari pesan
        </Button>
      </form>
      {matches && (
        <div className="space-y-3" aria-live="polite">
          {matches.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada pesan yang cocok.</p>
          )}
          {matches.map((m) => (
            <div key={m.message_id} className="border-b pb-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Pesan {m.message_seq} · {m.title}
              </p>
              <p className="whitespace-pre-wrap wrap-anywhere">{m.preview}</p>
            </div>
          ))}
          {after && (
            <Button variant="outline" disabled={busy} onClick={() => void search(after)}>
              Hasil berikutnya
            </Button>
          )}
        </div>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Nama dan cabang percakapan</summary>
        <div className="space-y-3 pt-3">
          <label className="block space-y-2 text-sm">
            Nama percakapan
            <Input
              maxLength={120}
              value={title}
              disabled={busy || !!pending}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={busy || !!pending || !title.trim()}
            onClick={() => void act("history.rename")}
          >
            Simpan nama
          </Button>
          <label className="block space-y-2 text-sm">
            Cabangkan sampai nomor pesan
            <Input
              type="number"
              min="1"
              max={messages.at(-1)?.message_seq}
              value={through}
              disabled={busy || !!pending}
              onChange={(e) => setThrough(e.target.value)}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Cabang memakai agent yang sama dan menyalin teks sampai pesan pilihan. Konteks sesi
            dimulai baru. File, workspace, goals, jadwal, dan akses berbagi tidak disalin. Memori
            pribadi agent tetap berlaku di DM.
          </p>
          <Button
            variant="outline"
            disabled={busy || !!pending || !title.trim() || !through}
            onClick={() => void act("history.branch")}
          >
            Buat cabang
          </Button>
          {branch && (
            <Button asChild>
              <Link to="/conversations/$threadId" params={{ threadId: branch.thread_id }}>
                Buka cabang
              </Link>
            </Button>
          )}
        </div>
      </details>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Penggunaan model</summary>
        <div className="space-y-3 pt-3">
          {usage && (
            <>
              <p className="text-sm">
                {usage.length} pekerjaan dimuat ·{" "}
                {usage.reduce((n, r) => n + (r.usage.total_tokens ?? 0), 0).toLocaleString("id-ID")}{" "}
                token tercatat.
              </p>
              <p className="text-xs text-muted-foreground">
                {usage.filter((r) => r.usage.total_tokens === undefined).length} pekerjaan tanpa
                catatan token. Biaya yang tidak tersedia tetap tidak diketahui.
              </p>
              <ul className="space-y-2 text-sm">
                {usage.map((r) => (
                  <li key={r.run_id} className="wrap-anywhere">
                    {r.run_id.slice(0, 8)} ·{" "}
                    {r.usage.total_tokens === undefined
                      ? "Token belum tersedia"
                      : `${r.usage.total_tokens} token`}
                    {r.usage.native_estimated_cost_usd !== undefined &&
                      ` · estimasi USD ${r.usage.native_estimated_cost_usd.toFixed(6)}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(!usage || usageAfter) && (
            <Button variant="outline" disabled={busy} onClick={() => void loadUsage()}>
              {usage ? "Muat penggunaan berikutnya" : "Lihat penggunaan"}
            </Button>
          )}
        </div>
      </details>
      {pending && (
        <Button
          disabled={busy}
          onClick={() => void act(pending.type as "history.rename" | "history.branch")}
        >
          Periksa hasil perubahan
        </Button>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </ResourcePanel>
  );
}
