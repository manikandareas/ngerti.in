import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <Select value={theme ?? "system"} onValueChange={setTheme}>
      <SelectTrigger aria-label="Tema tampilan" className="w-48 max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        <SelectItem value="system">
          <HugeiconsIcon icon={ComputerIcon} />
          Sistem
        </SelectItem>
        <SelectItem value="light">
          <HugeiconsIcon icon={Sun03Icon} />
          Terang
        </SelectItem>
        <SelectItem value="dark">
          <HugeiconsIcon icon={Moon02Icon} />
          Gelap
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
