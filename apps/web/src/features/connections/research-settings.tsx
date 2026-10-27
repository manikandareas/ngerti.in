import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { base, connectionError, send } from "./client";

type Research = {
  providers: { id: string; extract: boolean }[];
  configuration: {
    generation: number;
    search_backend: string;
    extract_backend: string;
    workspace_grant?: string;
    x_ready: boolean;
    status?: string;
  } | null;
};
const keyNames: Record<string, string> = {
  firecrawl: "FIRECRAWL_API_KEY",
  exa: "EXA_API_KEY",
  tavily: "TAVILY_API_KEY",
  "brave-free": "BRAVE_SEARCH_API_KEY",
  searxng: "SEARXNG_URL",
};

export function ResearchSettings() {
  const { getToken, userId } = useAuth();
  const [data, setData] = useState<Research | null>(null);
  const [search, setSearch] = useState("firecrawl");
  const [extract, setExtract] = useState("firecrawl");
  const [searchKey, setSearchKey] = useState("");
  const [extractKey, setExtractKey] = useState("");
  const [xKey, setXKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getToken()
      .then((token) => api<Research>(`${base}/apps/research`, token))
      .then((result) => {
        if (!active) return;
        setData(result);
        if (result.configuration) {
          setSearch(result.configuration.search_backend);
          setExtract(result.configuration.extract_backend);
        }
      })
      .catch((e) => active && setError(connectionError(e)));
    return () => {
      active = false;
    };
  }, [getToken, userId]);
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">Riset internet</summary>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const credentials = {
            ...(searchKey ? { [keyNames[search]]: searchKey } : {}),
            ...(extractKey ? { [keyNames[extract]]: extractKey } : {}),
            ...(xKey ? { XAI_API_KEY: xKey } : {}),
          };
          void (async () => {
            const configuration = await send<NonNullable<Research["configuration"]>>(
              "/apps/research",
              await getToken(),
              {
                search_backend: search,
                extract_backend: extract,
                credentials,
                ...(data?.configuration
                  ? {
                      expected_generation: data.configuration.generation,
                      workspace_grant: data.configuration.workspace_grant,
                    }
                  : {}),
              },
            );
            setData((current) => (current ? { ...current, configuration } : current));
            setSearchKey("");
            setExtractKey("");
            setXKey("");
            setNotice("Konfigurasi tersimpan. Pilih kemampuan Web research pada pengaturan agent.");
          })()
            .catch((e) => setError(connectionError(e)))
            .finally(() => setBusy(false));
        }}
      >
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Pilih layanan pencarian dan pembaca halaman. Kunci hanya digunakan untuk koneksi akun ini.
          {data?.configuration?.status === "disconnected" ? " Layanan saat ini terputus." : ""}
        </p>
        <label htmlFor="research-search" className="space-y-1 text-sm">
          Pencarian
          <select
            id="research-search"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          >
            {data?.providers.map((item) => (
              <option key={item.id}>{item.id}</option>
            ))}
          </select>
        </label>
        <label htmlFor="research-extract" className="space-y-1 text-sm">
          Pembaca halaman
          <select
            id="research-extract"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={extract}
            onChange={(e) => setExtract(e.target.value)}
          >
            {data?.providers
              .filter((item) => item.extract)
              .map((item) => (
                <option key={item.id}>{item.id}</option>
              ))}
          </select>
        </label>
        <label htmlFor="research-search-key" className="space-y-1 text-sm">
          {search === "searxng" ? "URL SearXNG" : "API key pencarian"}
          <Input
            id="research-search-key"
            type="password"
            autoComplete="off"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={data?.configuration ? "Kosongkan untuk mempertahankan kunci" : "API key"}
          />
        </label>
        {extract !== search && (
          <label htmlFor="research-extract-key" className="space-y-1 text-sm">
            API key pembaca halaman
            <Input
              id="research-extract-key"
              type="password"
              autoComplete="off"
              value={extractKey}
              onChange={(e) => setExtractKey(e.target.value)}
            />
          </label>
        )}
        <label htmlFor="research-x-key" className="space-y-1 text-sm">
          API key xAI (opsional)
          <Input
            id="research-x-key"
            type="password"
            autoComplete="off"
            value={xKey}
            onChange={(e) => setXKey(e.target.value)}
            placeholder={
              data?.configuration?.x_ready
                ? "Akses X sudah dikonfigurasi"
                : "Untuk pencarian publik di X"
            }
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm sm:col-span-2">
            {notice}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button disabled={busy || !data}>Simpan layanan riset</Button>
          {data?.configuration && data.configuration.status !== "disconnected" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void (async () => {
                  const configuration = await send<NonNullable<Research["configuration"]>>(
                    "/apps/research",
                    await getToken(),
                    undefined,
                    "DELETE",
                  );
                  setData((current) => (current ? { ...current, configuration } : current));
                  setNotice("Layanan riset diputus. Masukkan kembali kunci untuk menyambungkan.");
                })()
                  .catch((e) => setError(connectionError(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Putuskan layanan
            </Button>
          )}
        </div>
      </form>
    </details>
  );
}
