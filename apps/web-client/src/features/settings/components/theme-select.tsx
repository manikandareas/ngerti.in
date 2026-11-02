import { useTheme } from "next-themes";
import { useId } from "react";

const themes = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
] as const;

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const group = useId();
  const selected = theme ?? "system";
  return (
    <div role="radiogroup" aria-label="Tema tampilan" className="settings-theme-control">
      {themes.map((item) => (
        <label key={item.value} className="settings-theme-option">
          <input
            type="radio"
            name={group}
            value={item.value}
            checked={selected === item.value}
            onChange={() => setTheme(item.value)}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}
