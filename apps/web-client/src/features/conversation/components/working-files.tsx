import {
  ArrowLeft01Icon,
  Download04Icon,
  File02Icon,
  Folder01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import type { MachineFiles } from "@/types/machine";
import { type FileView, FileViewer } from "./file-viewer";
import { PanelCard, PanelEmpty } from "./panel-primitives";

export function WorkingFiles({ cursor }: { cursor: number }) {
  const [path, setPath] = useState("");
  const [after, setAfter] = useState("");
  const [preview, setPreview] = useState<FileView | null>(null);
  const listing = useApiResource<MachineFiles>(
    `/v1/machine/files?${new URLSearchParams({ path, after, limit: "100" })}`,
    cursor,
  );
  function folder(next: string) {
    setPath(next);
    setAfter("");
  }
  return (
    <>
      <PanelCard
        label={<span className="text-[16px] font-semibold text-foreground">Working files</span>}
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh working files"
            onClick={listing.retry}
          >
            <HugeiconsIcon icon={RefreshIcon} size={14} />
          </Button>
        }
      >
        <div className="flex min-h-11 items-center gap-2 px-3.5 py-2 text-[13px]">
          {(path || after) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={after ? "First page" : "Parent folder"}
              onClick={() =>
                after ? setAfter("") : folder(path.split("/").slice(0, -1).join("/"))
              }
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            </Button>
          )}
          <span className="min-w-0 truncate" title={path || "Shared machine"}>
            {path || "Shared machine"}
          </span>
        </div>
        {listing.error ? (
          <PanelEmpty>
            <span role="alert">
              Working files are unavailable. Reconnect the machine and refresh.
            </span>
          </PanelEmpty>
        ) : !listing.data ? (
          <PanelEmpty>Loading working files…</PanelEmpty>
        ) : !listing.data.entries.length ? (
          <PanelEmpty>
            This folder is empty. Files saved by your agents will appear here.
          </PanelEmpty>
        ) : (
          listing.data.entries.map((entry) => {
            const url = `/v1/machine/file?${new URLSearchParams({ path: entry.path })}`;
            return (
              <div key={entry.path} className="flex min-h-[46px] items-center px-3.5 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left hover:text-primary"
                  onClick={() =>
                    entry.type === "directory"
                      ? folder(entry.path)
                      : setPreview({ name: entry.name, url })
                  }
                  disabled={!["directory", "file"].includes(entry.type)}
                >
                  <HugeiconsIcon
                    icon={entry.type === "directory" ? Folder01Icon : File02Icon}
                    size={16}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-[14px]">{entry.name}</span>
                </button>
                {entry.type === "file" && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a href={url} download={entry.name} aria-label={`Download ${entry.name}`}>
                      <HugeiconsIcon icon={Download04Icon} size={14} />
                    </a>
                  </Button>
                )}
              </div>
            );
          })
        )}
        {listing.data?.next_after && (
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAfter(listing.data?.next_after ?? "")}
            >
              Next files
            </Button>
          </div>
        )}
      </PanelCard>
      <p className="px-1 text-[13px] leading-relaxed text-muted-foreground">
        These live files and attachment copies are shared with all your agents. Published files
        above remain saved copies.
      </p>
      <FileViewer file={preview} close={() => setPreview(null)} />
    </>
  );
}
