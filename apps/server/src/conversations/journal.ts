import type { Database } from "bun:sqlite";
import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import type { Entity, Kind } from "../contracts";
import { routineDisplayName } from "./labels";
import { type ConversationPart, conversationPart } from "./parts";

type Reader = <K extends Kind>(kind: K, id: string, cursor?: number) => Entity<K> | null;
type Draft = Omit<ConversationPart, "sequence">;

/** Materialize public positions in the same transaction as their source domain event. */
export class ConversationJournal {
  constructor(
    private readonly db: Database,
    private readonly read: Reader,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_parts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))
      );
      CREATE INDEX IF NOT EXISTS conversation_part_thread ON conversation_parts(thread_id, sequence);
      CREATE TABLE IF NOT EXISTS conversation_projection (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL);
      INSERT OR IGNORE INTO conversation_projection VALUES (1,0);
    `);
  }

  replay() {
    const after =
      this.db
        .query<{ cursor: number }, []>("SELECT cursor FROM conversation_projection WHERE id=1")
        .get()?.cursor ?? 0;
    const rows = this.db
      .query<{ cursor: number; body: string }, [number]>(
        "SELECT cursor,body FROM events WHERE cursor>? ORDER BY cursor",
      )
      .all(after);
    for (const row of rows) {
      const event = JSON.parse(row.body) as { data: Entity };
      const entity = event.data;
      const previous = this.read(entity.kind, entity.id, row.cursor - 1);
      this.record(entity, previous, row.cursor, true);
    }
  }

  private actor(id: string | null | undefined, cursor?: number) {
    const agent = id ? this.read("agent", id, cursor) : null;
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

  private publish(part: Draft) {
    this.db
      .query("INSERT OR IGNORE INTO conversation_parts(id,thread_id,body) VALUES (?,?,?)")
      .run(part.id, part.thread_id, JSON.stringify(part));
  }

  private visibleThread(id: string, cursor?: number) {
    const thread = this.read("thread", id, cursor);
    return !!thread && (!thread.purpose || thread.purpose === "conversation");
  }

  private runsAt(cursor?: number): Entity<"run">[] {
    const rows =
      cursor === undefined
        ? this.db
            .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='run' ORDER BY seq")
            .all()
        : this.db
            .query<
              { body: string },
              [number]
            >(`SELECT json_extract(body,'$.data') AS body FROM events WHERE cursor IN (
            SELECT MAX(cursor) FROM events WHERE cursor<=? AND json_extract(body,'$.entity_kind')='run' GROUP BY json_extract(body,'$.entity_id')
          ) ORDER BY (SELECT MIN(first.cursor) FROM events AS first WHERE json_extract(first.body,'$.entity_id')=json_extract(events.body,'$.entity_id'))`)
            .all(cursor);
    return rows.map((row) => JSON.parse(row.body) as Entity<"run">);
  }

  private message(
    message: Entity<"message">,
    cursor: number,
    historical?: number,
    publishedAt = message.created_at,
  ) {
    if (
      message.state === "deleted" ||
      message.purpose === "continuation" ||
      !this.visibleThread(message.thread_id, historical)
    )
      return;
    if (["handoff", "review"].includes(message.purpose)) return;
    if (!message.text && !message.artifact_ids.length) return;
    this.publish({
      id: `message:${message.id}`,
      source_cursor: cursor,
      thread_id: message.thread_id,
      created_at: publishedAt,
      kind: "message",
      message_id: message.id,
      source_message_id: null,
      resource_id: null,
      actors: this.actor(message.author_agent_id, historical),
      name: "",
      summary: null,
    });
  }

  private input(run: Entity<"run">, cursor: number, historical?: number) {
    const input = this.read("message", run.input_message_id, historical);
    if (input?.author !== "user" || input.purpose === "continuation") return;
    if (run.status === "queued") {
      const runs = this.runsAt(historical);
      const thread = this.read("thread", run.thread_id, historical);
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
      this.message(input, cursor, historical, run.updated_at);
  }

  record(entity: Entity, previous: Entity | null, cursor: number, replay = false) {
    const at = replay ? cursor : undefined;
    if (entity.kind === "message") {
      if (entity.author !== "user" || entity.purpose === "human_reply")
        this.message(entity, cursor, at);
    } else if (entity.kind === "run") {
      this.input(entity, cursor, at);
    } else if (
      entity.kind === "group_route" &&
      entity.state === "pending" &&
      !entity.selection_only
    ) {
      const input = this.read("message", entity.message_id, at);
      if (input) this.message(input, cursor, at);
    } else if (entity.kind === "goal" || entity.kind === "routine") {
      if (this.visibleThread(entity.thread_id, at)) {
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
          this.publish({
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
            actors: this.actor(entity.created_by_agent_id ?? entity.agent_id, at),
          });
      }
    } else if (entity.kind === "peer_task" && entity.source_agent_id) {
      const request = this.read("message", entity.request_message_id, at);
      if (request && this.visibleThread(entity.thread_id, at)) {
        const failed =
          ["failed", "cancelled", "unknown"].includes(entity.state) &&
          previous?.kind === "peer_task" &&
          previous.state !== entity.state;
        if (!previous || failed)
          this.publish({
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
            actors: [...this.actor(entity.source_agent_id, at), ...this.actor(entity.agent_id, at)],
          });
        if (replay && entity.summary) {
          const row = this.db
            .query<{ body: string }, [string]>("SELECT body FROM conversation_parts WHERE id=?")
            .get(`handoff_requested:${entity.id}`);
          if (row) {
            const part = JSON.parse(row.body) as Draft;
            if (part.summary === null)
              this.db
                .query("UPDATE conversation_parts SET body=? WHERE id=?")
                .run(JSON.stringify({ ...part, summary: entity.summary }), part.id);
          }
        }
      }
    }
    this.db.query("UPDATE conversation_projection SET cursor=? WHERE id=1").run(cursor);
  }

  page(threadId: string, before?: number, limit = 50) {
    const rows = this.db
      .query<{ sequence: number; body: string }, [string, number, number]>(
        "SELECT sequence,body FROM conversation_parts WHERE thread_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      )
      .all(threadId, before ?? Number.MAX_SAFE_INTEGER, limit + 1);
    const more = rows.length > limit;
    const parts = rows
      .slice(0, limit)
      .reverse()
      .map((row) => {
        const draft = JSON.parse(row.body) as Draft;
        const routine =
          draft.kind.startsWith("routine_") && draft.resource_id
            ? this.read("routine", draft.resource_id, draft.source_cursor)
            : null;
        const name = routine ? routineDisplayName(routine.instruction, routine.name) : draft.name;
        // Older receipts stored a null recipe; resolve their historical system identity, never today's profile.
        const actors = draft.actors.map((actor) => ({
          ...actor,
          avatar_config:
            actor.avatar_config ??
            defaultAgentAvatar(
              actor.id,
              this.read("agent", actor.id, draft.source_cursor)?.system_role === "tobi",
            ),
        }));
        // Historical handoff receipts can omit summary; keep the public field explicitly nullable.
        return conversationPart.parse({
          ...draft,
          summary: draft.summary ?? null,
          name,
          actors,
          sequence: row.sequence,
        });
      });
    return { parts, has_more: more, next_before: more ? (parts[0]?.sequence ?? null) : null };
  }
}
