import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("ngertiin-theme", next ? "dark" : "light");
    } catch {
      /* Storage can be unavailable. */
    }
  }
  return (
    <button
      className="icon-button"
      type="button"
      onClick={toggle}
      aria-label={dark ? "Gunakan mode terang" : "Gunakan mode gelap"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
