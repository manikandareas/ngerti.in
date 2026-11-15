"use client";

import { useEffect, useRef } from "react";

// Adapted from the owner-supplied 21st.dev Vignette Bloom video component.
// The owner selected the same presentation with the local CCTV office photograph.
// Source recipe: https://21st.dev/community/ascii/editor?from=e05cb032-35be-4bcd-999b-cbf5b1588bac
export function AsciiArt({ className }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = element.getBoundingClientRect().width > 0;
    const update = () => {
      element.autoplay = !motion.matches;
      if (motion.matches || document.hidden || !visible) {
        element.pause();
        if (motion.matches && element.readyState > 0) element.currentTime = 0;
      } else void element.play().catch(() => {});
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    element.addEventListener("loadedmetadata", update);
    update();
    return () => {
      element.pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      element.removeEventListener("loadedmetadata", update);
    };
  }, []);

  return (
    <video
      ref={video}
      className={className}
      src="/images/sign-in/vignette-bloom-office.mp4"
      poster="/images/sign-in/vignette-bloom-office.webp"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-label="Vignette Bloom — animated office artwork"
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
