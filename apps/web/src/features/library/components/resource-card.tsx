import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { libraryCommand, useResourceSelection } from "../hooks/use-library";
import { kindLabels, type ResourceItem, type ResourceRef, resourceStatusLabels } from "../types";
import { useResourceContext } from "./resource-context";
export function ResourceCard({ item }: { item: ResourceItem }) {
  const context = useResourceContext();
  const selection = useResourceSelection(context.threadId);
  return (
    <article className="min-w-0 space-y-2 border-b py-4 text-sm last:border-b-0">
      <p className="text-xs text-muted-foreground">
        {kindLabels[item.ref.kind]}
        {resourceStatusLabels[item.status] ? ` · ${resourceStatusLabels[item.status]}` : ""}
        {item.ref.revision ? ` · v${item.ref.revision}` : ""}
        {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleDateString()}` : ""}
      </p>
      <button
        type="button"
        className="block w-full text-left font-semibold wrap-anywhere underline-offset-4 hover:underline focus-visible:underline"
        onClick={() => context.open(item.ref)}
      >
        {item.title}
      </button>
      {item.snippet ? (
        <p className="line-clamp-3 text-muted-foreground wrap-anywhere">{item.snippet}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => context.open(item.ref)}>
          <FileSearch />
          Buka
        </Button>
        {context.threadId ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={
              selection.select.isPending || (item.ref.kind === "result" && !item.ref.revision)
            }
            onClick={() =>
              selection.select.mutate(item.ref, {
                onSuccess: () => {
                  context.open(null);
                  context.discuss();
                },
              })
            }
          >
            <MessageCircle />
            Bicarakan
          </Button>
        ) : null}
      </div>
      {selection.select.isError ? (
        <p role="alert" className="text-danger">
          Pilihan tidak tersimpan. Buka kembali item atau coba lagi.
        </p>
      ) : null}
    </article>
  );
}
export function ResourceSearchCards({
  refs,
  query,
  hasMore,
}: {
  refs: ResourceRef[];
  query?: string;
  hasMore?: boolean;
}) {
  const { getToken, userId } = useAuth();
  const data = useQuery({
    queryKey: ["resource-hits", userId, refs],
    queryFn: async ({ signal }) =>
      libraryCommand<{ items: ResourceItem[] }>("hits", await getToken(), { refs }, signal),
    enabled: Boolean(userId && refs.length),
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <section
      className="mt-3 max-w-lg rounded-xl border bg-card px-4"
      aria-label="Hasil pencarian Gwen"
    >
      <p className="pt-4 text-sm font-semibold">
        {query ? `Hasil untuk “${query}”` : "Hasil pencarian"}
      </p>
      {data.isPending && refs.length ? (
        <p className="py-4 text-sm" role="status">
          Memeriksa hasil…
        </p>
      ) : data.isError ? (
        <div className="py-4 text-sm" role="alert">
          <p>Hasil belum dapat diperiksa.</p>
          <Button variant="ghost" onClick={() => void data.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : data.data?.items.length ? (
        data.data.items.map((item) => (
          <ResourceCard key={`${item.ref.kind}:${item.ref.id}`} item={item} />
        ))
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          Tidak ada hasil yang tersedia. Coba kata lain atau cari kembali jika resource sudah
          berubah.
        </p>
      )}
      {hasMore ? (
        <p className="pb-4 text-xs text-muted-foreground">
          Masih ada hasil lain. Minta Gwen menampilkan hasil berikutnya atau gunakan tombol Cari.
        </p>
      ) : null}
    </section>
  );
}
