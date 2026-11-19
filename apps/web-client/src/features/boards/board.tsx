import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { durableCommand, request } from "@/lib/api-client";
import { clientScope, downloadFile } from "@/lib/client-scope";
import { artifactUrl } from "@/lib/workspace-files";
import type { Agent } from "@/types/workspace";

const columns = [
  ["ready", "Ready"],
  ["waiting", "Waiting"],
  ["running", "Running"],
  ["review", "Review"],
  ["blocked", "Blocked"],
  ["done", "Done"],
] as const;

type BoardCard = {
  id: string;
  revision: number;
  title: string;
  assignee_agent_id: string;
  assignee_name: string;
  reviewer_name: string | null;
  state: (typeof columns)[number][0];
  current_run_id: string | null;
  run_status:
    | "queued"
    | "dispatching"
    | "running"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "unknown"
    | "steered"
    | null;
  claim_heartbeat_at: string | null;
  dependency_ids: string[];
  start_requested: boolean;
  required_artifact_name: string | null;
  blocker: string | null;
  submission: { summary: string } | null;
  review_feedback: string | null;
  review_decision: { decision: "approve" | "request_changes"; findings: string } | null;
  artifacts: { id: string; name: string; workspace_id: string }[];
};

export function Board({ agents }: { agents: Agent[] }) {
  const scope = clientScope();
  const [creating, setCreating] = useState(false);
  const [resuming, setResuming] = useState<BoardCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const board = useQuery({
    queryKey: [scope?.key, scope?.epoch, "board-cards"],
    queryFn: ({ signal }) =>
      request<BoardCard[]>("/v1/boards/cards", undefined, undefined, signal, undefined, scope),
    refetchInterval: (query) =>
      query.state.data?.some(
        ({ state, start_requested, run_status }) =>
          state === "running" ||
          state === "review" ||
          (state === "waiting" && start_requested) ||
          (state === "blocked" && run_status === "unknown"),
      )
        ? 2500
        : false,
  });

  async function perform(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await board.refetch();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the card.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const created = await perform(() =>
      durableCommand("board:create", "/v1/boards/cards", {
        title: fields.get("title"),
        assignee_agent_id: fields.get("assignee"),
        reviewer_agent_id: fields.get("reviewer") || null,
        instruction: fields.get("instruction"),
        dependency_ids: fields.getAll("dependency"),
        required_artifact_name: String(fields.get("artifact") ?? "").trim() || null,
      }),
    );
    if (created) setCreating(false);
  }

  async function resume(event: FormEvent<HTMLFormElement>, card: BoardCard) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const resumed = await perform(() =>
      durableCommand(
        `board:resume:${card.id}:${card.revision}`,
        `/v1/boards/cards/${card.id}/resume`,
        {
          expected_revision: card.revision,
          information: String(fields.get("information") ?? ""),
        },
      ),
    );
    if (resumed) setResuming(null);
  }

  return (
    <main aria-label="Board" className="app-screen min-h-0 overflow-auto bg-background">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Board</h1>
          <Button
            size="sm"
            disabled={!agents.length}
            onClick={() => {
              setError("");
              setCreating(true);
            }}
          >
            New card
          </Button>
        </div>
        {board.isPending && <p role="status">Loading cards…</p>}
        {board.isError && (
          <div role="alert" className="flex items-center gap-2">
            <p>Could not load the board.</p>
            <Button size="sm" variant="outline" onClick={() => void board.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {error && !creating && !resuming && <p role="alert">{error}</p>}
        {board.data && (
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {columns.map(([state, label]) => (
              <section
                key={state}
                aria-label={label}
                className="min-w-0 rounded-xl bg-muted/55 p-3"
              >
                <h2 className="mb-3 px-1 text-sm font-semibold">{label}</h2>
                <div className="grid gap-2">
                  {board.data
                    .filter((card) => card.state === state)
                    .map((card) => (
                      <article
                        key={card.id}
                        aria-label={card.title}
                        className="grid min-w-0 gap-2 rounded-lg border bg-card p-3 text-sm"
                      >
                        <h3 className="break-words font-medium">{card.title}</h3>
                        <p className="break-words text-muted-foreground">
                          {agents.find((agent) => agent.id === card.assignee_agent_id)?.name ??
                            card.assignee_name}
                        </p>
                        {card.reviewer_name && (
                          <p className="break-words text-muted-foreground">
                            {card.review_decision?.decision === "approve" && state === "done"
                              ? "Approved by "
                              : "Reviewer "}
                            {card.reviewer_name}
                          </p>
                        )}
                        {(state === "running" || state === "review") &&
                          (card.claim_heartbeat_at ? (
                            <p className="break-words text-muted-foreground">
                              Claimed · Last heartbeat{" "}
                              <time dateTime={card.claim_heartbeat_at}>
                                {new Date(card.claim_heartbeat_at).toLocaleTimeString()}
                              </time>
                            </p>
                          ) : (
                            <p className="text-muted-foreground">Awaiting claim</p>
                          ))}
                        {state === "blocked" && card.run_status === "cancelled" && (
                          <p className="text-muted-foreground">Worker stopped</p>
                        )}
                        {card.required_artifact_name && state !== "done" && (
                          <p className="break-all text-muted-foreground">
                            {card.required_artifact_name}
                          </p>
                        )}
                        {card.blocker && <p className="break-words">{card.blocker}</p>}
                        {card.review_feedback && (
                          <div>
                            <p className="font-medium">Changes requested</p>
                            <p className="break-words text-muted-foreground">
                              {card.review_feedback}
                            </p>
                          </div>
                        )}
                        {state === "waiting" && (
                          <p className="break-words text-muted-foreground">
                            Prerequisites{" "}
                            {card.dependency_ids
                              .map(
                                (id) =>
                                  board.data?.find((dependency) => dependency.id === id)?.title ??
                                  "Unavailable card",
                              )
                              .join(", ")}
                          </p>
                        )}
                        {state === "done" && (
                          <p className="break-words">{card.submission?.summary}</p>
                        )}
                        {card.artifacts.map((file) => (
                          <Button
                            key={file.id}
                            type="button"
                            variant="link"
                            className="h-auto justify-start whitespace-normal break-all p-0 text-left"
                            aria-label={`Download ${file.name}`}
                            onClick={() => void downloadFile(artifactUrl(file), file.name)}
                          >
                            {file.name}
                          </Button>
                        ))}
                        {(state === "ready" || (state === "waiting" && !card.start_requested)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="justify-self-start"
                            aria-label={
                              state === "waiting"
                                ? `Start ${card.title} when ready`
                                : `Start ${card.title}`
                            }
                            disabled={busy}
                            onClick={() =>
                              void perform(() =>
                                durableCommand(
                                  `board:start:${card.id}:${card.revision}`,
                                  `/v1/boards/cards/${card.id}/start`,
                                  {
                                    expected_revision: card.revision,
                                  },
                                ),
                              )
                            }
                          >
                            {state === "waiting" ? "Start when ready" : "Start"}
                          </Button>
                        )}
                        {(state === "running" || state === "review") &&
                          card.current_run_id &&
                          ["queued", "dispatching", "running", "cancel_requested"].includes(
                            card.run_status ?? "",
                          ) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-self-start"
                              aria-label={`Stop ${card.title}`}
                              disabled={busy || card.run_status === "cancel_requested"}
                              onClick={() =>
                                void perform(() =>
                                  durableCommand(
                                    `board:stop:${card.current_run_id}`,
                                    `/v1/runs/${card.current_run_id}/cancel`,
                                    {},
                                  ),
                                )
                              }
                            >
                              {card.run_status === "cancel_requested"
                                ? "Stopping…"
                                : state === "review"
                                  ? "Stop reviewer"
                                  : "Stop worker"}
                            </Button>
                          )}
                        {state === "blocked" && card.run_status !== "unknown" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="justify-self-start"
                            aria-label={`Resume ${card.title}`}
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              setResuming(card);
                            }}
                          >
                            Resume
                          </Button>
                        )}
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <Dialog open={creating} onOpenChange={(open) => !busy && setCreating(open)}>
        <DialogContent>
          <DialogTitle>New card</DialogTitle>
          <DialogDescription className="sr-only">Assign work to an agent.</DialogDescription>
          <form onSubmit={(event) => void create(event)} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              Title
              <Input name="title" required maxLength={120} disabled={busy} />
            </label>
            <label className="grid gap-1 text-sm">
              Assignee
              <NativeSelect name="assignee" className="w-full" required disabled={busy}>
                <NativeSelectOption value="">Choose an agent</NativeSelectOption>
                {agents.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>
                    {agent.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              Instructions
              <Textarea name="instruction" required maxLength={12000} disabled={busy} />
            </label>
            <label className="grid gap-1 text-sm">
              Reviewer (optional)
              <NativeSelect name="reviewer" className="w-full" disabled={busy}>
                <NativeSelectOption value="">Choose a reviewer</NativeSelectOption>
                {agents.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>
                    {agent.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              Required filename (optional)
              <Input name="artifact" maxLength={180} disabled={busy} />
            </label>
            {!!board.data?.length && (
              <details className="text-sm">
                <summary className="cursor-pointer">Prerequisites (optional)</summary>
                <div className="mt-2 grid max-h-28 gap-2 overflow-auto">
                  {board.data.map((card) => (
                    <label key={card.id} className="flex items-center gap-2">
                      <input type="checkbox" name="dependency" value={card.id} disabled={busy} />
                      {card.title}
                    </label>
                  ))}
                </div>
              </details>
            )}
            {error && <p role="alert">{error}</p>}
            <Button type="submit" disabled={busy} className="justify-self-end">
              {busy ? "Saving…" : "Create card"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {resuming && (
        <Dialog open onOpenChange={(open) => !open && !busy && setResuming(null)}>
          <DialogContent>
            <DialogTitle>Resume {resuming.title}</DialogTitle>
            <DialogDescription>{resuming.blocker}</DialogDescription>
            <form onSubmit={(event) => void resume(event, resuming)} className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Additional information (optional)
                <Textarea name="information" maxLength={8000} disabled={busy} />
              </label>
              {error && <p role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="justify-self-end">
                {busy ? "Resuming…" : "Resume card"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
