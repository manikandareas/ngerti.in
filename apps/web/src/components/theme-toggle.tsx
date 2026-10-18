import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-11"
      aria-pressed={dark}
      type="button"
      onClick={toggle}
      aria-label={dark ? "Gunakan mode terang" : "Gunakan mode gelap"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}
