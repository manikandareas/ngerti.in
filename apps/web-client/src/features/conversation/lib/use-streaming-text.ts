import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/hooks/use-preferences";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";

/** Smooth only arriving text; never replay history or build a typewriter backlog. */
export function useStreamingText(text: string, streaming: boolean) {
  const { preferences } = usePreferences();
  const [visible, setVisible] = useState(text);
  const displayed = useRef(text);
  const lastPaint = useRef(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const flush = () => {
      displayed.current = text;
      setVisible(text);
    };
    if (
      !streaming ||
      !displayed.current ||
      !preferences.smoothStreaming ||
      motion.matches ||
      !isPageVisible() ||
      !text.startsWith(displayed.current)
    ) {
      flush();
      return;
    }
    const from = displayed.current.length;
    const started = performance.now();
    const tick = (now: number) => {
      // Projection batching already spends up to 40 ms; keep the combined visual buffer bounded.
      const progress = Math.min(1, (now - started) / 60);
      if (progress === 1 || now - lastPaint.current >= 32) {
        let end = from + Math.ceil((text.length - from) * progress);
        // Never expose half of a UTF-16 surrogate pair.
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end++;
        displayed.current = text.slice(0, end);
        setVisible(displayed.current);
        lastPaint.current = now;
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      flush();
    };
    if (from < text.length) frame = requestAnimationFrame(tick);
    const unsubscribe = subscribePageVisibility(finish);
    motion.addEventListener("change", finish);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      motion.removeEventListener("change", finish);
    };
  }, [text, streaming, preferences.smoothStreaming]);
  return !streaming || !visible || !preferences.smoothStreaming || !text.startsWith(visible)
    ? text
    : visible;
}
