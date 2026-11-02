import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

// OpenMausBot's web clipboard timeout/feedback, without its deferred native bridge.
export function useContentCopy(value: string | (() => string), resetMs = 1200) {
  const [state, setState] = useState<CopyState>("idle");
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    return () => {
      if (generation.current === version) generation.current++;
    };
  }, []);
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), resetMs);
    return () => clearTimeout(timer);
  }, [state, resetMs]);
  async function copy() {
    const text = typeof value === "function" ? value() : value;
    if (pending.current || !text.trim()) return;
    pending.current = true;
    const version = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 3000);
    });
    let result = false;
    try {
      result = await Promise.race([
        Promise.resolve(navigator.clipboard?.writeText(text)).then(
          () => Boolean(navigator.clipboard?.writeText),
          () => false,
        ),
        timeout,
      ]);
    } catch {
      /* Clipboard denial is presented as feedback near the action. */
    } finally {
      clearTimeout(timer);
      pending.current = false;
    }
    if (generation.current === version) setState(result ? "copied" : "failed");
  }
  return { state, copy };
}

export function downloadContent(filename: string, parts: BlobPart[], type: string) {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const tableAction =
  "inline-flex min-h-[30px] min-w-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring touch:min-h-10 touch:min-w-10";
