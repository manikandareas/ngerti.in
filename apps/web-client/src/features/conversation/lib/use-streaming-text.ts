import { useEffect, useRef, useState } from "react";

/** Smooth only arriving text; never replay history or build a typewriter backlog. */
export function useStreamingText(text: string, streaming: boolean) {
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
    if (!streaming || motion.matches || document.hidden || !text.startsWith(displayed.current)) {
      flush();
      return;
    }
    const from = displayed.current.length;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 100);
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
    document.addEventListener("visibilitychange", finish);
    motion.addEventListener("change", finish);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", finish);
      motion.removeEventListener("change", finish);
    };
  }, [text, streaming]);
  return !streaming || !text.startsWith(visible) ? text : visible;
}
