import { type ImgHTMLAttributes, useEffect, useState } from "react";
import { scopedFetch } from "@/lib/client-scope";

/** Private image bytes use the same scoped transport as their preview and download. */
export function ScopedImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    if (!src || typeof src !== "string") return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    void scopedFetch(src, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ source: src, url: objectUrl });
      })
      .catch(() => {});
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return loaded && loaded.source === src ? (
    <img {...props} alt={alt ?? ""} src={loaded.url} />
  ) : null;
}
