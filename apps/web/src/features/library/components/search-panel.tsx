import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceState } from "@/components/workspace-state";
import { useResourceSearch } from "../hooks/use-library";
import { kindLabels, type ResourceKind, type SearchSpec } from "../types";
import { ResourceCard } from "./resource-card";
export function SearchPanel({ library = false }: { library?: boolean }) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ResourceKind | "">("");
  const [sort, setSort] = useState<SearchSpec["sort"]>("recent");
  const [days, setDays] = useState("");
  const [spec, setSpec] = useState<SearchSpec>({
    query: "",
    kinds: library ? ["file", "result"] : [],
    sort: "recent",
  });
  const data = useResourceSearch(spec);
  const items = data.data?.pages.flatMap((p) => p.items) ?? [];
  const unique = items.filter(
    (item, index) =>
      items.findIndex((v) => v.ref.kind === item.ref.kind && v.ref.id === item.ref.id) === index,
  );
  const kinds = library
    ? (["file", "result"] as ResourceKind[])
    : (Object.keys(kindLabels) as ResourceKind[]);
  return (
    <div className="space-y-5">
      {library ? (
        <fieldset className="flex flex-wrap items-center gap-2" aria-label="Kategori Library">
          {(
            [
              ["", "Semua"],
              ["result", "Hasil"],
              ["file", "File"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={kind === value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setSpec({ ...spec, kinds: value ? [value] : ["file", "result"] });
              }}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={days === "7" ? "secondary" : "ghost"}
            aria-pressed={days === "7"}
            onClick={() => {
              const next = days === "7" ? "" : "7";
              setDays(next);
              setSpec({
                ...spec,
                since: next ? new Date(Date.now() - 7 * 86400000).toISOString() : undefined,
              });
            }}
          >
            Terakhir 7 hari
          </Button>
          <label className="text-sm">
            Tampilan{" "}
            <select
              aria-label="Tampilan Library"
              className="rounded-md border bg-background p-2"
              value={layout}
              onChange={(e) => setLayout(e.target.value as "grid" | "list")}
            >
              <option value="grid">Grid</option>
              <option value="list">Daftar</option>
            </select>
          </label>
        </fieldset>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSpec({
            query,
            kinds: kind ? [kind] : library ? ["file", "result"] : [],
            sort,
            since: days ? new Date(Date.now() - Number(days) * 86400000).toISOString() : undefined,
          });
        }}
      >
        <label className="text-sm font-medium" htmlFor={library ? "library-query" : "global-query"}>
          Apa yang ingin kamu temukan?
        </label>
        <div className="flex gap-2">
          <Input
            id={library ? "library-query" : "global-query"}
            value={query}
            maxLength={300}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: laporan penjualan"
            autoComplete="off"
          />
          <Button type="submit">Cari</Button>
        </div>
        <details>
          <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
            Filter dan urutan
          </summary>
          <div className="flex flex-wrap gap-3 py-2 text-sm">
            <label className="space-y-1">
              Jenis
              <select
                aria-label="Jenis hasil"
                className="block rounded-md border bg-background p-2"
                value={kind}
                onChange={(e) => setKind(e.target.value as ResourceKind | "")}
              >
                <option value="">Semua {library ? "file dan hasil" : "jenis"}</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              Waktu
              <select
                aria-label="Rentang waktu"
                className="block rounded-md border bg-background p-2"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              >
                <option value="">Kapan saja</option>
                <option value="7">7 hari terakhir</option>
                <option value="30">30 hari terakhir</option>
              </select>
            </label>
            <label className="space-y-1">
              Urutan
              <select
                aria-label="Urutan hasil"
                className="block rounded-md border bg-background p-2"
                value={sort}
                onChange={(e) => {
                  const next = e.target.value as SearchSpec["sort"];
                  setSort(next);
                  setSpec({ ...spec, sort: next });
                }}
              >
                <option value="relevance">Paling relevan</option>
                <option value="recent">Terbaru diubah</option>
                <option value="title">Judul</option>
              </select>
            </label>
          </div>
        </details>
      </form>
      {data.isPending ? (
        <WorkspaceState kind="loading" title="Mencari pekerjaanmu…" />
      ) : data.isError ? (
        <WorkspaceState
          kind="error"
          title="Pencarian belum dapat dimuat"
          description="Periksa koneksi atau persempit kata pencarian."
          onRetry={() => void data.refetch()}
        />
      ) : unique.length ? (
        <section
          className={
            library && layout === "grid"
              ? "grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2"
              : "divide-y"
          }
          aria-label={library ? "File dan hasil di Library" : "Hasil pencarian"}
        >
          {unique.map((item) => (
            <ResourceCard
              key={`${item.ref.kind}:${item.ref.id}`}
              item={item}
              preview={library && layout === "grid"}
            />
          ))}
        </section>
      ) : (
        <WorkspaceState
          kind="empty"
          title={spec.query ? "Belum ada yang cocok" : "Belum ada pekerjaan tersimpan"}
          description={
            spec.query
              ? "Coba judul, nama file, atau kata yang lebih singkat."
              : "Mulai dari chat. Pekerjaan dan hasilmu akan dapat ditemukan kembali di sini."
          }
        />
      )}
      {data.hasNextPage ? (
        <Button
          variant="outline"
          disabled={data.isFetchingNextPage}
          onClick={() => void data.fetchNextPage()}
        >
          {data.isFetchingNextPage ? "Memuat…" : "Lihat hasil lainnya"}
        </Button>
      ) : null}
    </div>
  );
}
