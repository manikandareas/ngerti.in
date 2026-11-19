import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { command, durableCommand, request } from "@/lib/api-client";
import type { Skills } from "@/types/workspace";

type Package = {
  description: string;
  instructions: string;
  assets: ({ path: string; text: string } | { path: string; content_base64: string })[];
};
type Version = { version: number; content: Package };
type Skill = Skills["application"][number];

export function SkillVersions({
  skill,
  threadId,
  agentId,
  refresh,
  consolidation,
}: {
  skill: Skill;
  threadId: string;
  agentId: string;
  refresh: () => void;
  consolidation?: { candidates: Skill[]; openConversation: () => void };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const version = selected ?? skill.assignment?.version ?? skill.revision;
  const [loaded, setLoaded] = useState<Version | null>(null);
  const [draft, setDraft] = useState<Version | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [merge, setMerge] = useState<{
    targetVersion: number;
    sourceId: string;
    sourceVersion: number;
  } | null>(null);
  const skillId = skill.id;
  const archived = skill.maintenance?.state === "archived";
  const locked = skill.maintenance?.locked === true;
  const lastUsed = skill.maintenance?.last_used_at;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void request<{ revision: { package: Package } }>(
      "/v1/learning/skills/read",
      { context: { agent_id: agentId, thread_id: threadId }, skill_id: skillId, version },
      undefined,
      controller.signal,
    )
      .then(({ revision }) => setLoaded({ version, content: revision.package }))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [agentId, threadId, skillId, version]);
  async function activate() {
    setSaving(true);
    try {
      await command("/v1/learning/skills/assign", {
        context: { agent_id: agentId, thread_id: threadId },
        skill_id: skillId,
        version,
        expected_revision: skill.assignment?.revision ?? 0,
        enabled: true,
      });
      refresh();
      toast.success(`Version ${version} is active.`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not change skill version.");
      refresh();
    } finally {
      setSaving(false);
    }
  }
  async function saveRevision() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const { revision } = await command<{ revision: { version: number; package: Package } }>(
        "/v1/learning/skills/revise",
        {
          context: { agent_id: agentId, thread_id: threadId },
          skill_id: skillId,
          expected_revision: draft.version,
          package: draft.content,
        },
      );
      setLoaded({ version: revision.version, content: revision.package });
      setSelected(revision.version);
      setDraft(null);
      refresh();
      toast.success(`Version ${revision.version} saved.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the skill revision.");
      refresh();
    } finally {
      setSaving(false);
    }
  }
  async function maintain(action: "lock" | "unlock" | "restore") {
    setSaving(true);
    try {
      await command("/v1/learning/skills/maintenance", {
        context: { agent_id: agentId, thread_id: threadId },
        skill_id: skillId,
        action,
      });
      refresh();
      toast.success(
        action === "restore"
          ? "Skill restored."
          : action === "lock"
            ? "Skill locked."
            : "Skill unlocked.",
      );
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not update the skill.");
      refresh();
    } finally {
      setSaving(false);
    }
  }
  const loadedVersion = loaded?.version === version ? loaded : null;
  const content = loadedVersion?.content;
  async function consolidate() {
    if (!merge?.sourceId || !consolidation) return;
    setSaving(true);
    setError("");
    try {
      await durableCommand(
        `skill-consolidation:${skillId}:${merge.targetVersion}:${merge.sourceId}:${merge.sourceVersion}`,
        "/v1/learning/skills/consolidate",
        {
          context: { agent_id: agentId, thread_id: threadId },
          target: { skill_id: skillId, version: merge.targetVersion },
          source: { skill_id: merge.sourceId, version: merge.sourceVersion },
        },
      );
      setMerge(null);
      consolidation.openConversation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start consolidation.");
      refresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="marketplace-detail-section" aria-label="Skill versions">
      <h2>Versions</h2>
      {lastUsed && (
        <p className="text-sm text-muted-foreground">
          Last used{" "}
          <time dateTime={lastUsed}>
            {new Date(lastUsed).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Browse version
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={version}
            disabled={saving || !!draft || !!merge}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {Array.from({ length: skill.revision }, (_, index) => skill.revision - index).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                  {skill.assignment?.version === item && skill.assignment.enabled
                    ? " (active)"
                    : ""}
                </option>
              ),
            )}
          </select>
        </label>
        {skill.actor_id !== null &&
          !draft &&
          !merge &&
          (archived ? (
            <Button variant="secondary" disabled={saving} onClick={() => void maintain("restore")}>
              Restore skill
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={
                  saving ||
                  !content ||
                  (skill.assignment?.enabled && skill.assignment.version === version)
                }
                onClick={() => void activate()}
              >
                Use this version
              </Button>
              {loadedVersion && version === skill.revision && !locked && (
                <Button variant="ghost" disabled={saving} onClick={() => setDraft(loadedVersion)}>
                  Edit skill
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => void maintain(locked ? "unlock" : "lock")}
              >
                {locked ? "Unlock skill" : "Lock skill"}
              </Button>
              {!locked &&
                version === skill.revision &&
                Boolean(consolidation?.candidates.length) && (
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() =>
                      setMerge({ targetVersion: version, sourceId: "", sourceVersion: 0 })
                    }
                  >
                    Consolidate skills
                  </Button>
                )}
            </>
          ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {merge && consolidation && (
        <form
          className="space-y-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void consolidate();
          }}
        >
          <label className="grid gap-1.5">
            Skill to combine
            <select
              className="rounded-md border bg-background px-2 py-1"
              required
              value={merge.sourceId}
              disabled={saving}
              onChange={(event) => {
                const candidate = consolidation.candidates.find(
                  (item) => item.id === event.target.value,
                );
                if (candidate)
                  setMerge({ ...merge, sourceId: candidate.id, sourceVersion: candidate.revision });
              }}
            >
              <option value="" disabled>
                Choose a skill
              </option>
              {consolidation.candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (v{item.revision})
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !merge.sourceId}>
              Start consolidation
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setError("");
                setMerge(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {draft ? (
        <form
          className="space-y-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRevision();
          }}
        >
          <label className="grid gap-1.5">
            Description
            <Input
              value={draft.content.description}
              maxLength={1024}
              required
              disabled={saving}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  content: { ...draft.content, description: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1.5">
            Instructions
            <Textarea
              value={draft.content.instructions}
              maxLength={64_000}
              rows={10}
              required
              disabled={saving}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  content: { ...draft.content, instructions: event.target.value },
                })
              }
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              Save revision
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setError("");
                setDraft(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : content ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{content.description}</p>
          <p className="whitespace-pre-wrap break-words">{content.instructions}</p>
        </div>
      ) : !error ? (
        <p role="status">Loading skill version…</p>
      ) : null}
    </section>
  );
}
