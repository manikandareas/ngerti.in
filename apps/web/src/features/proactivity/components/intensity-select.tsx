import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { intensityLabels } from "@/features/proactivity/types";

export function IntensitySelect({
  value,
  onChange,
  disabled,
  inherit = false,
  label = "Intensitas saran",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inherit?: boolean;
  label?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="min-h-11 w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {inherit ? <SelectItem value="inherit">Ikuti pengaturan akun</SelectItem> : null}
        {Object.entries(intensityLabels).map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
