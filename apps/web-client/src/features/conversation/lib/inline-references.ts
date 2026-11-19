import type { Agent } from "@/types/workspace";

export type InlineReference =
  | { kind: "agent"; id: string; label: string }
  | { kind: "user"; id: "owner"; label: string }
  | { kind: "file"; id: string; label: string }
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
  if (reference.kind !== "skill") return `ngertiin://${reference.kind}/${encode(reference.id)}`;
  const query = new URLSearchParams({ agent: reference.agentId });
  if (reference.version) query.set("version", String(reference.version));
  return `ngertiin://skill/${reference.source}/${encode(reference.id)}?${query}`;
}

export function referenceFromUrl(url: string, label: string): InlineReference | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ngertiin:" || parsed.hash || parsed.username || parsed.password)
      return null;
    if (parsed.search === "" && parsed.hostname === "user" && parsed.pathname === "/owner")
      return { kind: "user", id: "owner", label: "@user" };
    const kind = parsed.hostname === "artifact" ? "file" : parsed.hostname;
    if (
      parsed.search === "" &&
      (kind === "agent" || kind === "file") &&
      /^\/[\w-]+$/.test(parsed.pathname)
    )
      return { kind, id: parsed.pathname.slice(1), label };
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
    /(`+)[\s\S]*?\1|\[((?:\\.|[^\]\\\r\n])*)\]\((ngertiin:\/\/(?:agent|skill|user)\/[^\s)]+)\)/g;
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

export type ReferenceAgent = Pick<Agent, "id" | "name" | "handle" | "avatar_config"> &
  Partial<Pick<Agent, "system_role">>;
export type ReferenceAlias = Pick<ReferenceAgent, "id" | "name" | "handle">;
export type ReferenceSkill = Pick<SkillOption, "reference">;

function resolvePlainReference(
  token: string,
  aliases: Map<string, ReferenceAlias[]>,
  skills: ReferenceSkill[],
): InlineReference | undefined {
  if (token.toLocaleLowerCase() === "@user") return { kind: "user", id: "owner", label: "@user" };
  if (token.startsWith("@")) {
    const agents = aliases.get(token.slice(1).toLocaleLowerCase()) ?? [];
    if (agents.length === 1)
      return { kind: "agent", id: agents[0].id, label: `@${agents[0].name}` };
    return undefined;
  }
  if (token.startsWith("/")) {
    const matches = skills.filter((skill) => skill.reference.label === token);
    if (matches.length === 1) return matches[0].reference;
  }
  return undefined;
}

/** Resolve only unambiguous known aliases; protected Markdown, URLs and paths stay literal. */
export function plainReferenceParts(
  text: string,
  agents: ReferenceAlias[],
  skills: ReferenceSkill[],
) {
  const aliases = new Map<string, ReferenceAlias[]>();
  for (const agent of agents) {
    for (const alias of new Set(
      [agent.name, agent.handle]
        .filter((value): value is string => !!value)
        .map((value) => value.toLocaleLowerCase()),
    ))
      aliases.set(alias, [...(aliases.get(alias) ?? []), agent]);
  }
  const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = ["user", ...aliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapePattern)
    .join("|");
  const pattern = new RegExp(
    "`+[^`]*`+|https?:\\/\\/\\S+|\\[[^\\]]*\\]\\([^)]*\\)|(^|[\\s(])(@(?:" +
      names +
      ")|/[\\w-]+)(?=$|[\\s.,!?;:)…])",
    "giu",
  );
  const parts: ReferencePart[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]) continue;
    const token = match[2];
    const reference = resolvePlainReference(token, aliases, skills);
    if (!reference) continue;
    const start = match.index + match[1].length;
    if (start > offset) parts.push({ offset, text: text.slice(offset, start) });
    parts.push({ offset: start, reference, text: token });
    offset = start + token.length;
  }
  if (offset < text.length) parts.push({ offset, text: text.slice(offset) });
  return parts;
}
