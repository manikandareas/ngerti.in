import {
  ArrowLeft01Icon,
  Cancel01Icon,
  Download04Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContentViewer, ViewerTarget } from "../lib/content-viewer";
import { FileTypeIcon } from "./file-type-icon";
import { FileContent } from "./file-viewer";
import "./conversation-content-viewer.css";

function ViewerBody({
  target,
  active,
  viewer,
}: {
  target: ViewerTarget;
  active: boolean;
  viewer: ContentViewer;
}) {
  const bind = viewer.bind;
  const host = useCallback(
    (element: HTMLDivElement | null) => bind(target.id, element),
    [bind, target.id],
  );
  return (
    <div
      hidden={!active}
      inert={!active}
      className="content-viewer-page"
      data-viewer-page={target.id}
    >
      {target.file ? (
        <FileContent file={target.file} headerInset={60} />
      ) : (
        <div ref={host} className="content-viewer-table" />
      )}
    </div>
  );
}

export function ConversationContentViewer({ viewer }: { viewer: ContentViewer }) {
  const target = viewer.entries.at(-1);
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (target) back.current?.focus({ preventScroll: true });
  }, [target]);
  if (!target) return null;
  return (
    <section
      className="conversation-content-viewer"
      aria-label={`Viewer ${target.name}`}
      data-content-viewer
    >
      <header className="content-viewer-header">
        <Button
          ref={back}
          type="button"
          variant="ghost"
          size="icon"
          className="viewer-header-surface viewer-header-action"
          aria-label="Kembali"
          onClick={viewer.back}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
        </Button>
        <h2
          title={target.name}
          className="viewer-header-surface viewer-header-title min-w-0 truncate text-center text-[14px] font-medium"
        >
          {target.name}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="viewer-header-surface viewer-header-action"
              aria-label="Aksi file"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {target.file ? (
              <DropdownMenuItem asChild>
                <a href={target.file.url} download={target.name}>
                  <HugeiconsIcon icon={Download04Icon} size={15} />
                  Unduh file
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={target.download}>
                <HugeiconsIcon icon={Download04Icon} size={15} />
                Unduh tabel
              </DropdownMenuItem>
            )}
            {target.info && (
              <DropdownMenuItem
                onSelect={() => {
                  viewer.clear();
                  target.info?.();
                }}
              >
                Info file
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {viewer.entries.map((entry) => (
        <ViewerBody key={entry.id} target={entry} active={entry.id === target.id} viewer={viewer} />
      ))}
    </section>
  );
}

export function ViewerComposerContext({
  viewer,
  disabled,
}: {
  viewer: ContentViewer;
  disabled?: boolean;
}) {
  if (!viewer.context) return null;
  return (
    <div className="viewer-composer-context" data-viewer-context>
      <FileTypeIcon
        name={viewer.context.name}
        mediaType={viewer.context.file?.mediaType}
        className="size-3.5"
      />
      <span className="min-w-0 truncate" title={viewer.context.name}>
        {viewer.context.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        className="ml-auto size-6 shrink-0"
        aria-label="Lepas konteks file"
        onClick={viewer.removeContext}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} />
      </Button>
    </div>
  );
}
