import {
  Add01Icon,
  Analytics01Icon,
  ArrowUpRight01Icon,
  CodeIcon,
  FileEditIcon,
  PackageIcon,
  Presentation01Icon,
  Search01Icon,
  Task01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogEntry } from "../lib/catalog";

const skillIcons = {
  research: Search01Icon,
  code: CodeIcon,
  data: Analytics01Icon,
  writing: FileEditIcon,
  planning: Task01Icon,
  presentation: Presentation01Icon,
};

export function EntryIcon({ entry, plugin }: { entry: CatalogEntry; plugin: boolean }) {
  const [failed, setFailed] = useState("");
  const [loaded, setLoaded] = useState("");
  const source = entry.logo && entry.logo !== failed ? entry.logo : undefined;
  return (
    <span
      className="marketplace-entry-icon"
      data-kind={plugin ? entry.id : (entry.icon ?? "skill")}
    >
      {plugin && source ? (
        <>
          {loaded !== source && <Skeleton className="marketplace-logo-skeleton" />}
          <img
            src={source}
            alt=""
            width={28}
            height={28}
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            style={{ opacity: loaded === source ? 1 : 0 }}
            ref={(image) => {
              if (image?.complete && image.naturalWidth > 0 && loaded !== source) setLoaded(source);
            }}
            onLoad={() => setLoaded(source)}
            onError={() => setFailed(source)}
          />
        </>
      ) : (
        <HugeiconsIcon
          icon={entry.icon ? skillIcons[entry.icon] : PackageIcon}
          size={24}
          strokeWidth={1.6}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export function EntryRow({
  entry,
  plugin,
  available,
  statusKnown = true,
  onOpen,
  onAction,
}: {
  entry: CatalogEntry;
  plugin: boolean;
  available: boolean;
  statusKnown?: boolean;
  onOpen: () => void;
  onAction: () => void;
}) {
  const canCreate = !available && entry.prompts.length > 0;
  return (
    <div className="marketplace-entry">
      <button type="button" className="marketplace-entry-open" onClick={onOpen}>
        <EntryIcon entry={entry} plugin={plugin} />
        <span className="marketplace-entry-copy">
          <span className="marketplace-entry-title-row">
            <span className="marketplace-entry-name">{entry.name}</span>
            {plugin && (
              <span className="marketplace-entry-state" data-installed={available}>
                {available && <HugeiconsIcon icon={Tick02Icon} size={12} aria-hidden="true" />}
                {statusKnown ? (available ? "Installed" : "Not installed") : "Status unavailable"}
              </span>
            )}
          </span>
          <span className="marketplace-entry-description">{entry.description}</span>
        </span>
      </button>
      {!plugin && (
        <button
          type="button"
          className="marketplace-entry-action"
          aria-label={canCreate ? `Create skill ${entry.name}` : `View ${entry.name}`}
          title={canCreate ? "Create with agent" : "View details"}
          onClick={canCreate ? onAction : onOpen}
        >
          <HugeiconsIcon
            icon={available ? Tick02Icon : canCreate ? Add01Icon : ArrowUpRight01Icon}
            size={20}
            strokeWidth={1.5}
          />
        </button>
      )}
    </div>
  );
}
