import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";

/** Never publish a response from a previous resource/scope, including during the first render. */
export function useApiResource<T>(path: string | null, cursor = 0) {
  const [result, setResult] = useState<{ path: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ path: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cursor and retry explicitly invalidate an authoritative projection.
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    void request<T>(path, undefined, undefined, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) {
          setResult({ path, data });
          setFailure(null);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setFailure({ path, message: e instanceof Error ? e.message : "Data belum tersedia." });
      });
    return () => abort.abort();
  }, [path, cursor, attempt]);
  return {
    data: result?.path === path ? result.data : null,
    error: failure?.path === path ? failure.message : "",
    retry: () => setAttempt((n) => n + 1),
  };
}
