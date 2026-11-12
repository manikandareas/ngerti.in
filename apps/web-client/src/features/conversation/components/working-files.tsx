import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useContentViewer, workingFileTarget } from "../lib/content-viewer";
import {
  FILE_TREE_ROOT,
  type FileTreeNode,
  type WorkingFilesBrowser,
} from "../lib/working-files-browser";
import { FileTypeIcon } from "./file-type-icon";
import "./working-files.css";

export function WorkingFiles({ browser }: { browser: WorkingFilesBrowser }) {
  const state = useSyncExternalStore(browser.subscribe, browser.getSnapshot);
  const viewer = useContentViewer();
  const viewport = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const initialScroll = useRef(browser.scrollTop);
  const tree = useTree<FileTreeNode>({
    rootItemId: FILE_TREE_ROOT,
    state: state.tree,
    setExpandedItems: (value) => browser.setTree("expandedItems", value),
    setSelectedItems: (value) => browser.setTree("selectedItems", value),
    setFocusedItem: (value) => browser.setTree("focusedItem", value),
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().type === "directory",
    dataLoader: { getItem: browser.getNode, getChildren: browser.getChildren },
    onPrimaryAction: (item) => {
      const node = item.getItemData();
      if (node.status === "error") void browser.load(node.parent ?? "", "refresh");
      else if (node.status === "more") void browser.load(node.parent ?? "", "more");
      else if (node.type === "file") {
        if (viewport.current) browser.scrollTop = viewport.current.scrollTop;
        const url = `/v1/machine/file?${new URLSearchParams({ path: node.path })}`;
        viewer?.open(workingFileTarget({ name: node.name, url }), item.getElement() ?? undefined);
      }
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, selectionFeature],
  });
  useEffect(() => {
    void browser.load("");
  }, [browser]);
  const visibleFolders = useRef<(typeof state.folders)[string][]>([]);
  // Unopened prefetch results do not require rebuilding the visible tree.
  useLayoutEffect(() => {
    const next = ["", ...state.tree.expandedItems].map((path) => state.folders[path]);
    if (
      next.length === visibleFolders.current.length &&
      next.every((folder, index) => folder === visibleFolders.current[index])
    )
      return;
    visibleFolders.current = next;
    tree.rebuildTree();
  }, [state.folders, state.tree.expandedItems, tree]);
  const items = tree.getItems();
  useLayoutEffect(() => {
    if (
      !restored.current &&
      viewport.current &&
      items.length &&
      state.folders[""]?.entries.length
    ) {
      viewport.current.scrollTop = initialScroll.current;
      restored.current = true;
    }
  }, [items.length, state.folders]);
  const loading = ["", ...state.tree.expandedItems].some((path) => state.folders[path]?.loading);
  return (
    <section className="working-files-page" aria-label="Working files browser">
      <div
        ref={viewport}
        className="working-files-scroll"
        onScroll={(event) => {
          if (
            restored.current &&
            event.currentTarget.clientHeight > 0 &&
            event.currentTarget.getClientRects().length
          )
            browser.scrollTop = event.currentTarget.scrollTop;
        }}
      >
        <div {...tree.getContainerProps("Working files")} aria-busy={loading}>
          {items.map((item) => {
            const node = item.getItemData();
            const status = node.status;
            const disabled =
              status === "loading" || status === "empty" || node.type === "unsupported";
            return (
              <button
                key={item.getKey()}
                type="button"
                {...item.getProps()}
                onPointerEnter={() => {
                  if (node.type === "directory") browser.prefetch(node.path);
                }}
                data-viewer-file={node.type === "file" ? node.path : undefined}
                data-file-path={node.path}
                data-file-status={status}
                aria-disabled={disabled || undefined}
                title={status ? undefined : node.path}
                className={cn(
                  "file-tree-row",
                  status && "file-tree-status",
                  status === "error" && "text-destructive",
                )}
                style={{ paddingInlineStart: `${10 + item.getItemMeta().level * 16}px` }}
              >
                {status ? (
                  <span
                    className={cn("min-w-0", status === "loading" && "motion-safe:animate-pulse")}
                  >
                    {node.name}
                  </span>
                ) : (
                  <>
                    <span className="file-tree-chevron" aria-hidden="true">
                      {item.isFolder() && (
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={14}
                          className={item.isExpanded() ? "rotate-90" : ""}
                        />
                      )}
                    </span>
                    <FileTypeIcon
                      name={node.path}
                      folder={item.isFolder()}
                      expanded={item.isExpanded()}
                    />
                    <span className="min-w-0 truncate">{node.name}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
