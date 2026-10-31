import { DomainError } from "../contracts";
import { type LearningContext, memoryDelete, memoryQuery, memoryWrite } from "./contracts";
import { LearningScope } from "./scope";

export class Memories extends LearningScope {
  list(context: LearningContext, input: unknown = {}) {
    const data = memoryQuery.parse(input);
    this.context(context);
    return this.lifecycle.store
      .list("memory")
      .filter(
        (item) =>
          this.visible(context, item) &&
          (data.include_deleted || item.state === "active") &&
          (item.state === "deleted" ||
            item.text.toLocaleLowerCase().includes(data.query.toLocaleLowerCase())),
      );
  }
  recall(context: LearningContext, input: unknown = {}) {
    const data = memoryQuery.parse(input);
    const items = this.list(context, data);
    let start = 0;
    if (data.after) {
      const cursor = this.lifecycle.store.get("memory", data.after);
      this.require(context, cursor);
      const index = items.findIndex((item) => item.id === cursor.id);
      if (index < 0) throw new DomainError("CONFLICT");
      start = index + 1;
    }
    const memories = [];
    let bytes = 0;
    for (const item of items.slice(start, start + data.limit)) {
      bytes += Buffer.byteLength(JSON.stringify(item));
      if (bytes > 32_000) break;
      memories.push(item);
    }
    const hasMore = start + memories.length < items.length;
    return {
      memories,
      has_more: hasMore,
      next_after: hasMore ? (memories.at(-1)?.id ?? null) : null,
    };
  }
  write(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = memoryWrite.parse(input);
    this.validate(context, data.visibility);
    return this.lifecycle.store.transaction(() => {
      if (data.expected_revision === 0) {
        // Identities are never reused, including after deletion. Old retries cannot resurrect facts.
        if (this.lifecycle.store.list("memory").some((item) => item.id === data.memory_id))
          throw new DomainError("CONFLICT");
        return this.lifecycle.store.put({
          ...this.base(),
          id: data.memory_id,
          kind: "memory",
          ...context,
          visibility: data.visibility,
          text: data.text,
          state: "active",
          source_run_id: sourceRunId,
        });
      }
      const current = this.lifecycle.store.get("memory", data.memory_id);
      this.require(context, current);
      if (
        current.revision !== data.expected_revision ||
        current.state !== "active" ||
        current.visibility !== data.visibility
      )
        throw new DomainError("CONFLICT");
      return this.update(current, { text: data.text, source_run_id: sourceRunId });
    });
  }
  remove(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = memoryDelete.parse(input);
    return this.lifecycle.store.transaction(() => {
      const current = this.lifecycle.store.get("memory", data.memory_id);
      this.require(context, current);
      if (current.revision !== data.expected_revision || current.state !== "active")
        throw new DomainError("CONFLICT");
      return this.update(current, { state: "deleted", text: "", source_run_id: sourceRunId });
    });
  }
}
