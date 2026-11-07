import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { artifactUrl } from "@/lib/workspace-files";
import type { Artifact } from "@/types/work";
import type { Snapshot } from "@/types/workspace";
import { type ComposerAttachment, uploadedAttachment } from "./attachment-references";
import { readFilePreview } from "./file-preview";
import { WorkingFilesBrowser } from "./working-files-browser";

export type ViewerFile = { name: string; url: string; mediaType?: string };
export type ViewerTarget = {
  id: string;
  name: string;
  file?: ViewerFile;
  download?: () => void;
  info?: () => void;
  release?: () => void;
  resolve: (signal: AbortSignal) => Promise<ComposerAttachment>;
};
type Entry = ViewerTarget & { origin: HTMLElement | null };
type ViewerState = { scope: string | null; entries: Entry[]; context: ViewerTarget | null };

export function savedFileTarget(artifact: Artifact, snapshot: Snapshot): ViewerTarget {
  const accessible =
    artifact.thread_id === snapshot.thread.id &&
    snapshot.workspaces.some(
      (workspace) =>
        workspace.id === artifact.workspace_id &&
        workspace.state === "active" &&
        workspace.thread_id === snapshot.thread.id &&
        (workspace.scope === "group" ||
          snapshot.thread.member_agent_ids.includes(workspace.agent_id ?? "")),
    );
  if (!accessible)
    throw new Error("The source folder is no longer connected. Check file access in Library.");
  return {
    id: artifact.id,
    name: artifact.name,
    file: { name: artifact.name, url: artifactUrl(artifact), mediaType: artifact.media_type },
    resolve: async () => uploadedAttachment(artifact),
  };
}

export function workingFileTarget(file: ViewerFile): ViewerTarget {
  const id = crypto.randomUUID();
  return {
    id,
    name: file.name,
    file,
    resolve: async (signal) => {
      const response = await fetch(file.url, { signal });
      if (!response.ok)
        throw new Error("The working file is unavailable. Reopen it and try again.");
      const content = await readFilePreview(response, 16 * 1024 * 1024, signal);
      if (content.truncated) throw new Error("The file exceeds the 16 MB attachment limit.");
      const mediaType =
        file.mediaType ??
        response.headers.get("content-type")?.split(";")[0] ??
        "application/octet-stream";
      const attachment = new File([content.bytes], file.name, { type: mediaType });
      return {
        id,
        name: file.name,
        mediaType,
        size: attachment.size,
        state: "local",
        file: attachment,
      };
    },
  };
}

export function useContentViewerController(scope: string | null, showInfo?: (id: string) => void) {
  const [state, setState] = useState<ViewerState>({ scope, entries: [], context: null });
  const [hosts, setHosts] = useState<Record<string, HTMLElement | null>>({});
  const fileBrowser = useMemo(() => new WorkingFilesBrowser(scope), [scope]);
  useEffect(() => () => fileBrowser.dispose(), [fileBrowser]);
  const reads = useRef(new Set<AbortController>());
  const retained = useRef<Entry[]>([]);
  const entries = state.scope === scope ? state.entries : [];
  const context = state.scope === scope ? state.context : null;
  useEffect(() => {
    for (const previous of retained.current) {
      if (!entries.some((entry) => entry.id === previous.id && entry.release === previous.release))
        previous.release?.();
    }
    retained.current = entries;
  }, [entries]);
  useEffect(
    () => () => {
      for (const entry of retained.current) entry.release?.();
    },
    [],
  );
  useEffect(() => {
    setState({ scope, entries: [], context: null });
    setHosts({});
    const pending = reads.current;
    return () => {
      for (const read of pending) read.abort();
      pending.clear();
    };
  }, [scope]);
  const open = useCallback(
    (target: ViewerTarget, source?: HTMLElement) => {
      const origin =
        source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setState((previous) => ({
        scope,
        entries: [
          ...(previous.scope === scope
            ? previous.entries.filter((entry) => entry.id !== target.id)
            : []),
          { ...target, origin },
        ],
        context: target,
      }));
    },
    [scope],
  );
  const back = () => {
    const origin = entries.at(-1)?.origin;
    setState({ scope, entries: entries.slice(0, -1), context: entries.at(-2) ?? null });
    requestAnimationFrame(() => {
      if (origin?.isConnected) origin.focus({ preventScroll: true });
      else if (origin?.dataset.viewerFile) {
        Array.from(document.querySelectorAll<HTMLElement>("[data-viewer-file]"))
          .find(
            (element) =>
              element.dataset.viewerFile === origin.dataset.viewerFile &&
              element.getClientRects().length > 0,
          )
          ?.focus({ preventScroll: true });
      }
    });
  };
  const bind = useCallback((id: string, host: HTMLElement | null) => {
    setHosts((previous) => (previous[id] === host ? previous : { ...previous, [id]: host }));
  }, []);
  const clear = () => setState({ scope, entries: [], context: null });
  const attachment = async () => {
    if (!context) return undefined;
    const abort = new AbortController();
    reads.current.add(abort);
    try {
      return await context.resolve(abort.signal);
    } finally {
      reads.current.delete(abort);
    }
  };
  return {
    entries,
    context,
    hosts,
    open,
    back,
    bind,
    clear,
    attachment,
    showInfo,
    fileBrowser,
    removeContext: () => setState((previous) => ({ ...previous, context: null })),
  };
}

export type ContentViewer = ReturnType<typeof useContentViewerController>;
export const ContentViewerContext = createContext<ContentViewer | null>(null);
export const useContentViewer = () => useContext(ContentViewerContext);
