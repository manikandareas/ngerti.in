import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const modes = [
  { value: "light", label: "Terang", icon: Sun03Icon },
  { value: "dark", label: "Gelap", icon: Moon02Icon },
  { value: "system", label: "Sistem", icon: ComputerIcon },
] as const;

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      value={theme ?? "system"}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
      aria-label="Tema tampilan"
      className={cn("rounded-full bg-secondary p-1", compact && "flex-1")}
      spacing={1}
    >
      {modes.map(({ value, label, icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={`Mode ${label.toLowerCase()}`}
          className={cn(
            "h-7 gap-2 rounded-full px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground",
            compact && "px-2.5",
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" />
          <span className={cn(compact ? "sr-only" : "hidden sm:inline")}>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
