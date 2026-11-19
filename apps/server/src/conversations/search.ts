import { DomainError, type Entity } from "../contracts";
import type { LearningContext } from "../learning/contracts";
import { LearningScope } from "../learning/scope";
import { historySearchInput, historySourceInput } from "./search-contracts";

const reference = (threadId: string, messageId: string) =>
  `ngertiin://history/${threadId}/${messageId}`;

/** Search the retained conversation projections under the current account and agent. */
export class ConversationSearch extends LearningScope {
  private async lane(context: LearningContext) {
    const { agent, thread } = await this.context(context);
    const store = this.lifecycle.store;
    const account = store.dataContext;
    if (
      !account ||
      thread.purpose !== "conversation" ||
      thread.actor_id !== account.userId ||
      thread.organization_id !== account.organizationId
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return { agent, thread, account };
  }

  async search(context: LearningContext, input: unknown, excludeMessageId?: string) {
    const { query, limit } = historySearchInput.parse(input);
    const { agent, thread, account } = await this.lane(context);
    const store = this.lifecycle.store;
    const matches = await store.query<{
      thread_id: string;
      message_id: string;
      conversation: string;
      author: "user" | "agent";
      created_at: string;
      excerpt: string;
    }>(
      `WITH search AS (SELECT websearch_to_tsquery('simple'::regconfig,$4) AS terms)
       SELECT t.id AS thread_id, m.id AS message_id,
              COALESCE(t.body->>'name',$8) AS conversation,
              m.body->>'author' AS author, m.body->>'created_at' AS created_at,
              CASE WHEN length(m.body->>'text')<=1800 THEN m.body->>'text'
                   ELSE left(ts_headline('simple'::regconfig,m.body->>'text',search.terms,
                        'StartSel=[, StopSel=], MinWords=15, MaxWords=40, MaxFragments=2'),1800)
              END AS excerpt
       FROM entities m
       JOIN entities t ON t.kind='thread' AND t.id::text=m.body->>'thread_id'
                      AND t.organization_id=m.organization_id AND t.actor_id=m.actor_id
       CROSS JOIN search
       WHERE m.kind='message' AND m.organization_id=$1 AND m.actor_id=$2
         AND m.body->>'state'='complete' AND COALESCE(m.body->>'purpose','conversation')='conversation'
         AND m.body->>'author' IN ('user','agent')
         AND COALESCE(t.body->>'purpose','conversation')='conversation'
         AND ($3::uuid IS NULL OR m.id<>$3)
         AND (CASE WHEN $9::boolean THEN t.id=$5
                ELSE t.id<>$5 AND t.body->>'type'='dm' AND t.body->'member_agent_ids'->>0=$6 END)
         AND to_tsvector('simple'::regconfig,COALESCE(m.body->>'text','')) @@ search.terms
       ORDER BY ts_rank_cd(to_tsvector('simple'::regconfig,COALESCE(m.body->>'text','')),search.terms) DESC, m.seq DESC
       LIMIT $7`,
      [
        account.organizationId,
        account.userId,
        excludeMessageId ?? null,
        query,
        thread.id,
        agent.id,
        limit,
        agent.name,
        thread.type === "group",
      ],
    );
    return {
      matches: matches.rows.map((item) => ({
        ...item,
        reference: reference(item.thread_id, item.message_id),
      })),
    };
  }

  async source(context: LearningContext, input: unknown) {
    const data = historySourceInput.parse(input);
    const { agent, thread, account } = await this.lane(context);
    const store = this.lifecycle.store;
    const source = await store.get("thread", data.thread_id);
    if (
      source.organization_id !== account.organizationId ||
      source.actor_id !== account.userId ||
      source.purpose !== "conversation" ||
      (thread.type === "group"
        ? source.id !== thread.id
        : source.type !== "dm" || !source.member_agent_ids.includes(agent.id))
    )
      throw new DomainError("NOT_FOUND", 404);
    const message: Entity<"message"> = await store.get("message", data.message_id);
    if (
      message.thread_id !== source.id ||
      message.organization_id !== account.organizationId ||
      message.actor_id !== account.userId ||
      message.state !== "complete" ||
      message.purpose !== "conversation" ||
      message.author === "routine"
    )
      throw new DomainError("NOT_FOUND", 404);
    return {
      ...data,
      conversation: source.name ?? agent.name,
      author: message.author,
      created_at: message.created_at,
      reference: reference(source.id, message.id),
      text: message.text.slice(0, 6000),
      truncated: message.text.length > 6000,
    };
  }
}
