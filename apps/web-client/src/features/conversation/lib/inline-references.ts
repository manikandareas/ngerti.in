import type { Agent } from "@/types/workspace";

export type InlineReference =
  | { kind: "agent"; id: string; label: string }
  | {
      kind: "skill";
      id: string;
      label: string;
      source: "application" | "harness" | "native";
      agentId: string;
      version?: number;
    };
export type ReferencePart =
  | { offset: number; text: string }
  | { offset: number; reference: InlineReference; text: string };
export interface SkillOption {
  reference: Extract<InlineReference, { kind: "skill" }>;
  description: string;
  agent: Agent;
}

const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);

export function referenceUrl(reference: InlineReference) {
  if (reference.kind === "agent") return `ngertiin://agent/${encode(reference.id)}`;
  const query = new URLSearchParams({ agent: reference.agentId });
  if (reference.version) query.set("version", String(reference.version));
  return `ngertiin://skill/${reference.source}/${encode(reference.id)}?${query}`;
}

export function referenceFromUrl(url: string, label: string): InlineReference | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ngertiin:" || parsed.hash || parsed.username || parsed.password)
      return null;
    if (parsed.hostname === "agent" && /^\/[\w-]+$/.test(parsed.pathname))
      return { kind: "agent", id: parsed.pathname.slice(1), label };
    const match = /^\/(application|harness|native)\/([^/]+)$/.exec(parsed.pathname);
    const agentId = parsed.searchParams.get("agent");
    const version = parsed.searchParams.get("version");
    if (parsed.hostname !== "skill" || !match || !agentId || !/^[\w-]+$/.test(agentId)) return null;
    if (version !== null && !/^[1-9]\d*$/.test(version)) return null;
    return {
      kind: "skill",
      source: match[1] as "application" | "harness" | "native",
      id: decodeURIComponent(match[2]),
      label,
      agentId,
      ...(version ? { version: Number(version) } : {}),
    };
  } catch {
    return null;
  }
}

export function referenceText(reference: InlineReference) {
  const label = reference.label.replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&");
  return `[${label}](${referenceUrl(reference)})`;
}

/** Stable references travel through the existing durable message/draft text field. */
export function referenceParts(text: string): ReferencePart[] {
  const pattern =
    /(`+)[\s\S]*?\1|\[((?:\\.|[^\]\\\r\n])*)\]\((ngertiin:\/\/(?:agent|skill)\/[^\s)]+)\)/g;
  const parts: ReferencePart[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match[1]) continue;
    const reference = referenceFromUrl(match[3], match[2].replace(/\\(.)/g, "$1"));
    if (!reference) continue;
    if (match.index > offset) parts.push({ offset, text: text.slice(offset, match.index) });
    parts.push({ offset: match.index, reference, text: match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ offset, text: text.slice(offset) });
  return parts;
}

export function referenceTarget(text: string): string | null {
  const references = referenceParts(text).flatMap((part) =>
    "reference" in part ? [part.reference] : [],
  );
  return (
    references.find((reference) => reference.kind === "agent")?.id ??
    references.find((reference) => reference.kind === "skill")?.agentId ??
    null
  );
}

/** Only known names at word boundaries become references; URLs, paths and code stay literal. */
export function plainReferenceParts(text: string, agents: Agent[], skills: SkillOption[]) {
  const parts: ReferencePart[] = [];
  const pattern =
    /`+[^`]*`+|https?:\/\/\S+|\[[^\]]*\]\([^)]*\)|(^|[\s(])([@/])([\w-]+)(?=$|[\s.,!?;:)])/gu;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]) continue;
    const agent = match[2] === "@" ? agents.find((item) => item.handle === match[3]) : undefined;
    const candidates =
      match[2] === "/" ? skills.filter((item) => item.reference.label === `/${match[3]}`) : [];
    const reference: InlineReference | undefined = agent
      ? { kind: "agent", id: agent.id, label: `@${agent.handle}` }
      : candidates.length === 1
        ? candidates[0].reference
        : undefined;
    if (!reference) continue;
    const start = match.index + match[1].length;
    if (start > offset) parts.push({ offset, text: text.slice(offset, start) });
    const token = `${match[2]}${match[3]}`;
    parts.push({ offset: start, reference, text: token });
    offset = start + token.length;
  }
  if (offset < text.length) parts.push({ offset, text: text.slice(offset) });
  return parts;
}
