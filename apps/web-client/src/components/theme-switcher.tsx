import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const modes = [
  { value: "light", label: "Terang", icon: Sun03Icon },
  { value: "dark", label: "Gelap", icon: Moon02Icon },
  { value: "system", label: "Sistem", icon: ComputerIcon },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      value={theme ?? "system"}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
      aria-label="Tema tampilan"
      className="rounded-nav border bg-card p-1"
      spacing={1}
    >
      {modes.map(({ value, label, icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={`Mode ${label.toLowerCase()}`}
          className="h-control-sm gap-2 rounded-control px-3 text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-link"
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
