import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import type { QueryResultRow } from "pg";
import type { Entity, Kind } from "../contracts";
import { asyncMap } from "../persistence/async-collections";
import { routineDisplayName } from "./labels";
import { type ConversationPart, conversationPart } from "./parts";

type Reader = <K extends Kind>(kind: K, id: string, cursor?: number) => Promise<Entity<K> | null>;
type Draft = Omit<ConversationPart, "sequence">;

/** Materialize public positions in the same transaction as their source domain event. */
export class ConversationJournal {
  constructor(
    private readonly db: {
      query<R extends QueryResultRow = QueryResultRow>(
        sql: string,
        values?: unknown[],
      ): Promise<{ rows: R[] }>;
    },
    private readonly read: Reader,
  ) {}

  async replay() {
    let after = Number(
      (
        await this.db.query<{ cursor: string }>(
          "SELECT cursor FROM conversation_projection WHERE id=1",
        )
      ).rows[0]?.cursor ?? 0,
    );
    for (;;) {
      const rows = (
        await this.db.query<{ cursor: string; body: { data: Entity } }>(
          "SELECT cursor,body FROM events WHERE cursor>$1 ORDER BY cursor LIMIT 500",
          [after],
        )
      ).rows;
      for (const row of rows) {
        const entity = row.body.data;
        const previous = await this.read(entity.kind, entity.id, Number(row.cursor) - 1);
        await this.record(entity, previous, Number(row.cursor), true);
        after = Number(row.cursor);
      }
      if (rows.length < 500) return;
    }
  }

  private async actor(id: string | null | undefined, cursor?: number) {
    const agent = id ? await this.read("agent", id, cursor) : null;
    return agent
      ? [
          {
            id: agent.id,
            name: agent.name,
            handle: agent.handle,
            avatar_config:
              agent.avatar_config ?? defaultAgentAvatar(agent.id, agent.system_role === "tobi"),
          },
        ]
      : [];
  }

  private async publish(part: Draft) {
    await this.db.query(
      "INSERT INTO conversation_parts(id,thread_id,body) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING",
      [part.id, part.thread_id, JSON.stringify(part)],
    );
  }

  private async visibleThread(id: string, cursor?: number) {
    const thread = await this.read("thread", id, cursor);
    return !!thread && (!thread.purpose || thread.purpose === "conversation");
  }

  private async runsAt(threadId: string, cursor?: number): Promise<Entity<"run">[]> {
    const rows =
      cursor === undefined
        ? (
            await this.db.query<{ body: unknown }>(
              "SELECT body FROM entities WHERE kind='run' AND body->>'thread_id'=$1 ORDER BY seq",
              [threadId],
            )
          ).rows
        : (
            await this.db.query<{ body: unknown }>(
              "SELECT body->'data' AS body FROM events WHERE cursor IN (\n            SELECT MAX(cursor) FROM events WHERE cursor<=$1 AND body->>'entity_kind'='run' AND body->'data'->>'thread_id'=$2 GROUP BY body->>'entity_id'\n          ) ORDER BY (SELECT MIN(first.cursor) FROM events AS first WHERE first.body->>'entity_id'=events.body->>'entity_id')",
              [cursor, threadId],
            )
          ).rows;
    return rows.map((row) => row.body as Entity<"run">);
  }

  private async message(
    message: Entity<"message">,
    cursor: number,
    historical?: number,
    publishedAt = message.created_at,
  ) {
    if (
      message.state === "deleted" ||
      message.purpose === "continuation" ||
      !(await this.visibleThread(message.thread_id, historical))
    )
      return;
    if (["handoff", "review"].includes(message.purpose)) return;
    if (!message.text && !message.artifact_ids.length) return;
    await this.publish({
      id: `message:${message.id}`,
      source_cursor: cursor,
      thread_id: message.thread_id,
      created_at: publishedAt,
      kind: "message",
      message_id: message.id,
      source_message_id: null,
      resource_id: null,
      actors: await this.actor(message.author_agent_id, historical),
      name: "",
      summary: null,
    });
  }

  private async input(run: Entity<"run">, cursor: number, historical?: number) {
    const input = await this.read("message", run.input_message_id, historical);
    if (input?.author !== "user" || input.purpose === "continuation") return;
    if (run.status === "queued") {
      const runs = await this.runsAt(run.thread_id, historical);
      const thread = await this.read("thread", run.thread_id, historical);
      const position = runs.findIndex((other) => other.id === run.id);
      if (
        runs.some(
          (other, index) =>
            other.id !== run.id &&
            other.thread_id === run.thread_id &&
            (other.agent_id === run.agent_id || thread?.type === "group") &&
            (["dispatching", "running", "cancel_requested", "unknown"].includes(other.status) ||
              (other.status === "queued" && index < position)),
        )
      )
        return;
    }
    if (["queued", "dispatching", "running", "steered", "failed", "cancelled"].includes(run.status))
      await this.message(input, cursor, historical, run.updated_at);
  }

  async record(entity: Entity, previous: Entity | null, cursor: number, replay = false) {
    const at = replay ? cursor : undefined;
    if (entity.kind === "message") {
      if (entity.author !== "user" || entity.purpose === "human_reply")
        await this.message(entity, cursor, at);
    } else if (entity.kind === "run") {
      await this.input(entity, cursor, at);
    } else if (
      entity.kind === "group_route" &&
      entity.state === "pending" &&
      !entity.selection_only
    ) {
      const input = await this.read("message", entity.message_id, at);
      if (input) await this.message(input, cursor, at);
    } else if (entity.kind === "goal" || entity.kind === "routine") {
      if (await this.visibleThread(entity.thread_id, at)) {
        const old = previous?.kind === entity.kind ? previous : null;
        let kind: ConversationPart["kind"] | null = null;
        if (!old) kind = entity.kind === "goal" ? "goal_created" : "routine_created";
        else if (
          entity.state !== old.state &&
          ["completed", "paused", "stopped"].includes(entity.state)
        )
          kind = `${entity.kind}_${entity.state}` as ConversationPart["kind"];
        else if (entity.state === "active" && old.state === "paused")
          kind = entity.kind === "goal" ? "goal_resumed" : "routine_resumed";
        else if (
          entity.kind === "goal" &&
          old.kind === "goal" &&
          entity.state === "active" &&
          entity.work_state === "blocked" &&
          old.work_state !== "blocked"
        )
          kind = "goal_blocked";
        if (kind)
          await this.publish({
            id: `${kind}:${entity.id}:${cursor}`,
            source_cursor: cursor,
            thread_id: entity.thread_id,
            created_at: entity.updated_at,
            kind,
            message_id: null,
            resource_id: entity.id,
            source_message_id:
              entity.kind === "goal"
                ? (entity.source_message_ids[0] ?? null)
                : entity.source_message_id,
            name:
              entity.kind === "goal"
                ? entity.title
                : routineDisplayName(entity.instruction, entity.name),
            summary:
              kind === "goal_blocked" && entity.kind === "goal"
                ? entity.progress.slice(0, 1000)
                : null,
            actors: await this.actor(entity.created_by_agent_id ?? entity.agent_id, at),
          });
      }
    } else if (entity.kind === "peer_task" && entity.source_agent_id) {
      const request = await this.read("message", entity.request_message_id, at);
      if (request && (await this.visibleThread(entity.thread_id, at))) {
        const failed =
          ["failed", "cancelled", "unknown"].includes(entity.state) &&
          previous?.kind === "peer_task" &&
          previous.state !== entity.state;
        if (!previous || failed)
          await this.publish({
            id: failed ? `handoff_failed:${entity.id}:${cursor}` : `handoff_requested:${entity.id}`,
            source_cursor: cursor,
            thread_id: entity.thread_id,
            created_at: failed ? entity.updated_at : request.created_at,
            kind: failed ? "handoff_failed" : "handoff_requested",
            message_id: request.id,
            resource_id: entity.id,
            source_message_id: null,
            name: request.purpose === "review" ? "review" : "handoff",
            summary: entity.summary ?? null,
            actors: [
              ...(await this.actor(entity.source_agent_id, at)),
              ...(await this.actor(entity.agent_id, at)),
            ],
          });
        if (replay && entity.summary) {
          const row = (
            await this.db.query<{ body: unknown }>(
              "SELECT body FROM conversation_parts WHERE id=$1",
              [`handoff_requested:${entity.id}`],
            )
          ).rows[0];
          if (row) {
            const part = row.body as Draft;
            if (part.summary === null)
              await this.db.query("UPDATE conversation_parts SET body=$1 WHERE id=$2", [
                JSON.stringify({ ...part, summary: entity.summary }),
                part.id,
              ]);
          }
        }
      }
    }
    await this.db.query("UPDATE conversation_projection SET cursor=$1 WHERE id=1", [cursor]);
  }

  async page(threadId: string, before?: number, limit = 50) {
    const rows = (
      await this.db.query<{ sequence: string; body: unknown }>(
        "SELECT sequence,body FROM conversation_parts WHERE thread_id=$1 AND sequence<$2 ORDER BY sequence DESC LIMIT $3",
        [threadId, before ?? Number.MAX_SAFE_INTEGER, limit + 1],
      )
    ).rows;
    const more = rows.length > limit;
    const parts = await asyncMap(rows.slice(0, limit).reverse(), async (row) => {
      const draft = row.body as Draft;
      const routine =
        draft.kind.startsWith("routine_") && draft.resource_id
          ? await this.read("routine", draft.resource_id, draft.source_cursor)
          : null;
      const name = routine ? routineDisplayName(routine.instruction, routine.name) : draft.name;
      // Older receipts stored a null recipe; resolve their historical system identity, never today's profile.
      const actors = await asyncMap(draft.actors, async (actor) => ({
        ...actor,
        avatar_config:
          actor.avatar_config ??
          defaultAgentAvatar(
            actor.id,
            (await this.read("agent", actor.id, draft.source_cursor))?.system_role === "tobi",
          ),
      }));
      // Historical handoff receipts can omit summary; keep the public field explicitly nullable.
      return conversationPart.parse({
        ...draft,
        summary: draft.summary ?? null,
        name,
        actors,
        sequence: Number(row.sequence),
      });
    });
    return { parts, has_more: more, next_before: more ? (parts[0]?.sequence ?? null) : null };
  }
}
