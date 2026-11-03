import type { Routine } from "@/types/work";

/** Legacy routines have no title. Keep protocol references out of their display metadata. */
export function routineName(routine: Pick<Routine, "name" | "instruction">) {
  const line = (routine.name?.trim() || routine.instruction.split(/\r?\n/, 1)[0])
    .replace(/\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, (_, label: string) =>
      label.replace(/\\(.)/g, "$1"),
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!line || /ngertiin[.:/]|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i.test(line))
    return "Routine";
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
}
