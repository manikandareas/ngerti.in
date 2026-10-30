import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { base, command, submit } from "@/features/direct-messages/client";
import { ResourcePanel } from "@/features/direct-messages/resource-panel";
import { ApiError, api } from "@/lib/api";

export type Bundle = {
  format: string;
  agent: { display_name: string; handle: string; soul: string };
  source: { hermes_revision: string; config_revision: string };
  history: { kind: "dm" | "group"; title: string };
  messages: unknown[];
  skills: unknown[];
  memories: unknown[];
  artifacts: unknown[];
};
type Preview = {
  handle_conflict: boolean;
  already_imported: boolean;
  readiness: string;
  counts: Record<string, number>;
  fingerprint: string;
  source: { hermes_revision: string; config_revision: string };
  requirements: Record<string, string[]>;
};
const countLabels: Record<string, string> = {
  messages: "pesan",
  memories: "memori",
  skills: "skills",
  artifacts: "file",
};
export function Counts({ counts }: { counts: Record<string, number> }) {
  return (
    <p className="text-sm">
      {Object.entries(counts)
        .map(([k, n]) => `${n} ${countLabels[k] ?? k}`)
        .join(" · ")}
    </p>
  );
}

export function PortableImport() {
  const { getToken, userId } = useAuth();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [handle, setHandle] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ thread_id: string; deduplicated: boolean } | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof command> | null>(null);
  const lock = useRef(false);
  const key = `nma-portable-import:v1:${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved?.type === "portable.import") {
        setPending(saved);
        setError("Impor belum terkonfirmasi. Periksa hasil permintaan tersimpan.");
      }
    } catch {
      /* Keep import available when storage is disabled. */
    }
  }, [key]);
  function resetPreview() {
    setPreview(null);
    setResult(null);
    setError("");
  }
  async function readFile(file: File) {
    if (file.size > 1024 * 1024) {
      setError("Paket terlalu besar. Batas paket 1 MiB; ekspor lebih sedikit konten.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(null);
    setBundle(null);
    setResult(null);
    try {
      const value = JSON.parse(await file.text());
      if (value?.format !== "ngertiin.agent.v1" || typeof value.agent?.handle !== "string")
        throw new Error("Format paket tidak didukung.");
      setBundle(value);
      setHandle(`${value.agent.handle.slice(0, 33)}-import`);
      const listing = await api<{ models: { id: string; label: string }[] }>(
        `${base}/agents?limit=1`,
        await getToken(),
      );
      setModels(listing.models);
    } catch {
      setError(
        "Paket belum dapat dibaca. Pilih berkas Ngertiin yang valid dan pastikan koneksi tersedia.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    if (lock.current || !bundle) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setPreview(
        await submit<Preview>(
          command("portable.preview", { bundle, handle, model }),
          await getToken(),
        ),
      );
    } catch {
      setError(
        "Paket ditolak atau belum dapat diperiksa. Periksa format, versi, nama file, dan koneksi.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function importBundle() {
    if (lock.current || (!pending && (!bundle || !preview || preview.handle_conflict))) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const body = pending ?? command("portable.import", { bundle, handle, model });
    setPending(body);
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
    } catch {
      /* Retain command in memory. */
    }
    try {
      setResult(await submit(body, await getToken()));
      setPending(null);
      setPreview(null);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![401, 403, 408, 429].includes(cause.status)
      ) {
        setPending(null);
        setPreview(null);
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* Storage is optional. */
        }
        setError(
          "Impor ditolak; tidak ada agent yang ditimpa. Periksa paket dan handle, lalu pratinjau ulang.",
        );
      } else
        setError(
          "Hasil impor belum terkonfirmasi. Periksa permintaan yang sama untuk mencegah duplikasi.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ResourcePanel
      title="Impor agent"
      description="Pratinjau paket agent sebelum membuat identitas baru."
      icon={<Upload className="size-4" />}
    >
      <p className="text-sm text-muted-foreground">
        Gunakan paket Ngertiin untuk memindahkan karakter, skills, dan konten pilihan. Koneksi akun
        perlu dihubungkan ulang. Goals dan jadwal lama tidak dijalankan.
      </p>
      <fieldset className="space-y-4" disabled={busy || !!pending}>
        <label className="block space-y-2 text-sm">
          Paket agent
          <Input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
        </label>
        {bundle && (
          <>
            <p className="font-medium wrap-anywhere">{bundle.agent.display_name}</p>
            <label className="block space-y-2 text-sm">
              Handle hasil impor
              <Input
                required
                pattern="[a-z][a-z0-9_-]{0,39}"
                maxLength={40}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  resetPreview();
                }}
              />
            </label>
            <label className="block space-y-2 text-sm">
              Model milik akun ini
              <NativeSelect
                className="min-h-11 w-full rounded-md border bg-background px-3"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  resetPreview();
                }}
              >
                <option value="">Hubungkan model setelah impor</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              variant="outline"
              disabled={!/^[a-z][a-z0-9_-]{0,39}$/.test(handle)}
              onClick={() => void inspect()}
            >
              Pratinjau impor
            </Button>
          </>
        )}
      </fieldset>
      {preview && (
        <div className="space-y-3 border-t pt-3">
          <Counts counts={preview.counts} />
          {bundle?.history?.kind === "group" && (
            <p className="text-sm text-muted-foreground">
              Riwayat dan memori grup disimpan sebagai file arsip dengan atribusi penulis aslinya.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Versi konfigurasi asal {preview.source.config_revision} · Hermes{" "}
            {preview.source.hermes_revision.slice(0, 8)}
          </p>
          <details className="space-y-2 text-sm">
            <summary className="cursor-pointer">Kemampuan yang perlu ditinjau</summary>
            {Object.entries(preview.requirements).map(([kind, ids]) => (
              <p key={kind} className="wrap-anywhere">
                {(
                  { tool_grants: "Tools", mcp_grants: "Koneksi", skill_refs: "Skills" } as Record<
                    string,
                    string
                  >
                )[kind] ?? kind}
                : {ids.length ? ids.join(", ") : "Tidak ada referensi"}
              </p>
            ))}
          </details>
          <p className="text-sm text-muted-foreground">
            Tools dan koneksi perlu dipilih kembali. Skills diarsipkan sampai ditinjau dan
            dipulihkan. Isi riwayat tersimpan sebagai teks; tidak ada pekerjaan lama yang
            diaktifkan.
          </p>
          {preview.handle_conflict && (
            <p role="alert" className="text-sm text-danger">
              Handle sudah dipakai. Pilih handle lain agar kustomisasi yang ada tetap tersimpan.
            </p>
          )}
          <Button disabled={busy || preview.handle_conflict} onClick={() => void importBundle()}>
            {preview.already_imported ? "Buka hasil impor yang sama" : "Impor sebagai agent baru"}
          </Button>
        </div>
      )}
      {pending && (
        <Button disabled={busy} onClick={() => void importBundle()}>
          Periksa hasil impor
        </Button>
      )}
      {result && (
        <div role="status" className="space-y-3 text-sm">
          <p>
            {result.deduplicated
              ? "Paket sudah pernah diimpor. Kustomisasi tetap tersimpan."
              : "Agent berhasil diimpor. Tinjau kemampuan dan koneksi sebelum digunakan."}
          </p>
          <Button asChild>
            <Link to="/conversations/$threadId" params={{ threadId: result.thread_id }}>
              Buka agent hasil impor
            </Link>
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Memeriksa paket…
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
