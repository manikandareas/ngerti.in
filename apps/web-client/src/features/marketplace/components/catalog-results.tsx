import { ArrowRight01Icon, PackageIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CatalogEntry } from "../lib/catalog";
import { categoryPreviewLimit, groupCatalog } from "../lib/categories";
import { EntryRow } from "./catalog-entry";
import { DeferredEntries } from "./deferred-entries";

export const CatalogResults = memo(function CatalogResults({
  entries,
  plugin,
  loading,
  query,
  onClear,
  onOpen,
  onAction,
  isAvailable,
  statusKnown,
  category,
  onCategory,
}: {
  entries: CatalogEntry[];
  plugin: boolean;
  loading: boolean;
  query: string;
  onClear: () => void;
  onOpen: (entry: CatalogEntry) => void;
  onAction: (entry: CatalogEntry) => void;
  isAvailable: (entry: CatalogEntry) => boolean;
  statusKnown: boolean;
  category?: string;
  onCategory?: (slug: string) => void;
}) {
  const columns = useMediaQuery("(min-width: 1024px)") ? 2 : 1;
  const mobile = useMediaQuery("(max-width: 767.98px)");
  const [activated, setActivated] = useState(0);
  const groups = useMemo(() => (category ? [] : groupCatalog(entries)), [category, entries]);
  const chunks = useMemo(
    () =>
      category
        ? Array.from({ length: Math.ceil(entries.length / 24) }, (_, index) =>
            entries.slice(index * 24, (index + 1) * 24),
          )
        : [],
    [category, entries],
  );
  if (loading) return <CatalogSkeleton />;
  if (!entries.length)
    return (
      <div className="marketplace-empty">
        <HugeiconsIcon icon={query ? Search01Icon : PackageIcon} size={28} strokeWidth={1.4} />
        <h2>{query ? "No results" : plugin ? "No plugins available" : "No skills available"}</h2>
        <p>
          {query
            ? `Try another search for “${query}”.`
            : "Available items will appear here when the catalog is ready."}
        </p>
        {query && (
          <Button variant="secondary" onClick={onClear}>
            Clear search
          </Button>
        )}
      </div>
    );
  const row = (entry: CatalogEntry) => (
    <EntryRow
      key={entry.id}
      entry={entry}
      plugin={plugin}
      available={isAvailable(entry)}
      statusKnown={statusKnown}
      onOpen={() => onOpen(entry)}
      onAction={() => onAction(entry)}
    />
  );
  if (category)
    return (
      <div className="marketplace-category-list" data-total-count={entries.length}>
        {chunks.map((chunk, index) => (
          <DeferredEntries
            key={chunk[0].id}
            count={chunk.length}
            initial={index <= activated}
            columns={columns}
            mobile={mobile}
            activateNext={() => setActivated((value) => Math.max(value, index + 1))}
          >
            <div className="marketplace-entry-grid">{chunk.map(row)}</div>
          </DeferredEntries>
        ))}
      </div>
    );
  return (
    <>
      {groups.map((group, index) => (
        <section
          key={group.slug}
          className="marketplace-category"
          aria-label={group.label}
          onFocusCapture={() => setActivated((value) => Math.max(value, index))}
        >
          <h2>
            {plugin && onCategory ? (
              <button type="button" onClick={() => onCategory(group.slug)}>
                {group.label}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={15}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            ) : (
              group.label
            )}
          </h2>
          <DeferredEntries
            count={
              plugin ? Math.min(group.entries.length, categoryPreviewLimit) : group.entries.length
            }
            initial={index <= activated}
            columns={columns}
            mobile={mobile}
          >
            <div className="marketplace-entry-grid">
              {(plugin ? group.entries.slice(0, categoryPreviewLimit) : group.entries).map(row)}
            </div>
          </DeferredEntries>
        </section>
      ))}
    </>
  );
});

function CatalogSkeleton() {
  return (
    <div
      className="marketplace-entry-grid marketplace-loading"
      role="status"
      aria-label="Loading catalog"
    >
      {[1, 2, 3, 4, 5, 6].map((key) => (
        <div key={key} className="marketplace-row-skeleton">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
