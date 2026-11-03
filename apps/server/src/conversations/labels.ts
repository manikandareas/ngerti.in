/** Display metadata only; execution instructions and original audit events stay verbatim. */
export function routineDisplayName(instruction: string, name?: string | null) {
  const line = (name?.trim() || instruction.split(/\r?\n/, 1)[0])
    .replace(/\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, (_, label: string) =>
      label.replace(/\\(.)/g, "$1"),
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!line || /ngertiin[.:/]|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i.test(line))
    return "Routine";
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
}
