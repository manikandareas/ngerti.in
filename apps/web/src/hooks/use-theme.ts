import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);

  function toggle(): void {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("ngertiin-theme", next ? "dark" : "light");
    } catch {
      /* Storage can be unavailable. */
    }
  }

  return { dark, toggle };
}
