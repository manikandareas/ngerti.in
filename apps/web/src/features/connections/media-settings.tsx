import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { base, send } from "./client";

type Configuration = { generation: number; status: string; model: string };
export function MediaSettings() {
  const { getToken, userId } = useAuth();
  const [data, setData] = useState<Configuration | null>(null);
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setReady(false);
    setKey("");
    void getToken()
      .then((token) => api<{ configuration: Configuration | null }>(`${base}/apps/media`, token))
      .then((result) => {
        if (active) {
          setData(result.configuration);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setError("Koneksi gambar belum dapat dimuat.");
      });
    return () => {
      active = false;
    };
  }, [getToken, userId]);
  async function save(disconnect = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const value = await send<Configuration>(
        "/apps/media",
        token,
        disconnect
          ? undefined
          : {
              provider: "meta",
              api_key: key,
              expected_generation: data?.generation ?? 0,
            },
        disconnect ? "DELETE" : "POST",
      );
      setData(value);
      setKey("");
    } catch {
      setError(
        "Koneksi belum tersimpan. Muat ulang untuk memeriksa status sebelum mencoba kembali.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Koneksi gambar">
      <h2 className="font-semibold">Muse multimodal</h2>
      <p className="text-sm text-muted-foreground">
        Buat dan edit gambar, pahami gambar/video, dan transkripsikan suara. Aktifkan kemampuan Muse
        yang dibutuhkan pada agent.
      </p>
      {data && (
        <p role="status" className="text-sm">
          {data.status === "configured" ? "Terhubung" : "Terputus"} · {data.model}
        </p>
      )}
      <label htmlFor="muse-api-key" className="block space-y-1 text-sm">
        Meta Model API key
        <Input
          id="muse-api-key"
          type="password"
          autoComplete="off"
          value={key}
          disabled={busy || !ready}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !ready || !key.trim()} onClick={() => void save()}>
          {busy ? "Menyimpan…" : "Hubungkan"}
        </Button>
        {data?.status === "configured" && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>
            Putuskan
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
