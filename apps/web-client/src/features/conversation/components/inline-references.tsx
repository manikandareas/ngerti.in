import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { avatarColors } from "@ngertiin/avatar/catalog";
import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import {
  type CSSProperties,
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type InlineReference,
  plainReferenceParts,
  referenceParts,
  referenceTarget,
  type SkillOption,
} from "@/features/conversation/lib/inline-references";
import { request } from "@/lib/api-client";
import type { Agent, Skills, Snapshot } from "@/types/workspace";
import "./inline-references.css";

const emptyAgents: Agent[] = [];
const emptySkills: SkillOption[] = [];
const ReferenceContext = createContext({
  agents: emptyAgents,
  skills: emptySkills,
  group: false,
  loading: false,
  error: "",
  refresh: () => {},
});
export const useInlineReferences = () => useContext(ReferenceContext);

export function InlineReferencesProvider({
  snapshot,
  children,
}: {
  snapshot: Snapshot | null;
  children: ReactNode;
}) {
  const agents = snapshot?.agents ?? emptyAgents;
  const threadId = snapshot?.thread.id;
  const [attempt, retry] = useState(0);
  const [inventory, setInventory] = useState<{
    scope: string;
    skills: SkillOption[];
    loading: boolean;
    error: string;
  }>({ scope: "", skills: [], loading: false, error: "" });
  const scope = threadId
    ? `${threadId}:${agents.map((agent) => `${agent.id}:${agent.revision}`).join(",")}:${snapshot?.runs
        .filter((run) => run.status === "succeeded")
        .map((run) => run.id)
        .join(",")}`
    : "";
  // Inventory refreshes on identity changes or completed work, not on streamed text/events.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scope captures the relevant agent and run revisions; streamed snapshot objects do not invalidate inventory. attempt explicitly retries a failed read.
  useEffect(() => {
    if (!threadId) return;
    const controller = new AbortController();
    setInventory({ scope, skills: [], loading: true, error: "" });
    void Promise.allSettled(
      agents.map(async (agent) => {
        const query = new URLSearchParams({ agent_id: agent.id, thread_id: threadId });
        const result = await request<Skills>(
          `/v1/learning/skills?${query}`,
          undefined,
          undefined,
          controller.signal,
        );
        const application: SkillOption[] = result.application
          .filter((skill) => skill.assignment?.enabled)
          .map((skill) => ({
            agent,
            description: "Skill aplikasi",
            reference: {
              kind: "skill",
              id: skill.id,
              source: "application",
              agentId: agent.id,
              label: `/${skill.name}`,
              version: skill.assignment?.version,
            },
          }));
        const harness: SkillOption[] = result.harness.map((skill) => ({
          agent,
          description: skill.description,
          reference: {
            kind: "skill",
            id: skill.key,
            source: "harness",
            agentId: agent.id,
            label: `/${skill.name}`,
          },
        }));
        const inherited = new Set(result.harness.map((skill) => skill.name));
        const native: SkillOption[] = result.native_catalog
          .filter((skill) => skill.enabled && !inherited.has(skill.name))
          .map((skill) => ({
            agent,
            description: skill.description,
            reference: {
              kind: "skill",
              id: skill.key,
              source: "native",
              agentId: agent.id,
              label: `/${skill.name}`,
            },
          }));
        return [...application, ...harness, ...native];
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setInventory({
        scope,
        loading: false,
        skills: results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
        error: results.some((result) => result.status === "rejected")
          ? "Sebagian skills belum dapat dimuat."
          : "",
      });
    });
    return () => controller.abort();
  }, [scope, attempt]);
  const current = inventory.scope === scope;
  const value = useMemo(
    () => ({
      agents,
      skills: current ? inventory.skills : emptySkills,
      group: snapshot?.thread.type === "group",
      loading: !!threadId && (!current || inventory.loading),
      error: current ? inventory.error : "",
      refresh: () => retry((value) => value + 1),
    }),
    [agents, current, inventory, snapshot?.thread.type, threadId],
  );
  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function referenceColor(agent: Agent): CSSProperties {
  const config = agent.avatar_config ?? defaultAgentAvatar(agent.id, agent.system_role === "tobi");
  return { "--reference-color": avatarColors[config.color].base } as CSSProperties;
}

export function InlineReferenceChip({ reference }: { reference: InlineReference }) {
  const { agents } = useInlineReferences();
  const agent =
    reference.kind === "agent" ? agents.find((agent) => agent.id === reference.id) : undefined;
  const label = agent ? `@${agent.name}` : reference.label;
  return (
    <span
      data-inline-reference={reference.kind}
      data-reference-id={reference.id}
      className="inline-reference"
      style={agent ? referenceColor(agent) : undefined}
      title={
        agent
          ? `@${agent.handle ?? agent.name}`
          : reference.kind === "skill"
            ? `${reference.label} · ${reference.source === "application" ? "Aplikasi" : "Harness"}${reference.version ? ` · v${reference.version}` : ""}`
            : "Agent tidak tersedia"
      }
    >
      {reference.kind === "skill" && (
        <HugeiconsIcon icon={PuzzleIcon} size={12} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export function InlineReferenceText({
  text,
  agentId = referenceTarget(text),
}: {
  text: string;
  agentId?: string | null;
}) {
  const { agents, skills } = useInlineReferences();
  return referenceParts(text).flatMap((part) =>
    "reference" in part
      ? [<InlineReferenceChip key={part.offset} reference={part.reference} />]
      : plainReferenceParts(
          part.text,
          agents,
          agentId ? skills.filter((skill) => skill.agent.id === agentId) : skills,
        ).map((item) =>
          "reference" in item ? (
            <InlineReferenceChip key={`${part.offset}-${item.offset}`} reference={item.reference} />
          ) : (
            <Fragment key={`${part.offset}-${item.offset}`}>{item.text}</Fragment>
          ),
        ),
  );
}
