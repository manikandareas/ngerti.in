import { useSyncExternalStore } from "react";

// OpenMausBot's responsive boundary subscription; CSS and rendered modal state agree.
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (changed) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
