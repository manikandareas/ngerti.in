import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { Run } from "./types";

// Beautiful UI Tool Chips: compact, expandable tool activity, using our theme primitives.
export function ToolChips({ run }: { run: Run }) {
  if (!run.native_tools.length && !run.product_tools.length) return null;
  return (
    <details className="text-caption text-muted-foreground">
      <summary className="cursor-pointer py-2">
        {run.native_tools.length + run.product_tools.length} aktivitas tool
      </summary>
      <div className="flex flex-wrap gap-2 py-2">
        {run.native_tools.map((tool) => (
          <Badge key={tool.item_id} variant={tool.state === "failed" ? "destructive" : "secondary"}>
            {tool.state === "started" && <Spinner className="size-3" />}
            {tool.name} · {tool.state}
          </Badge>
        ))}
        {[...new Set(run.product_tools)].map((name) => (
          <Badge key={name} variant="secondary">
            {name === "ngertiin.update_agent" ? "Profil diperbarui" : name} · respons diterima
          </Badge>
        ))}
      </div>
    </details>
  );
}
