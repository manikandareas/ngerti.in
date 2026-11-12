import { DomainError } from "../contracts";
import { asyncFilter } from "../persistence/async-collections";
import { type LearningContext, memoryDelete, memoryQuery, memoryWrite } from "./contracts";
import { LearningScope } from "./scope";

export class Memories extends LearningScope {
  async list(context: LearningContext, input: unknown = {}) {
    const data = memoryQuery.parse(input);
    await this.context(context);
    return await asyncFilter(
      await this.lifecycle.store.list("memory"),
      async (item) =>
        (await this.visible(context, item)) &&
        (data.include_deleted || item.state === "active") &&
        (item.state === "deleted" ||
          item.text.toLocaleLowerCase().includes(data.query.toLocaleLowerCase())),
    );
  }
  async recall(context: LearningContext, input: unknown = {}) {
    const data = memoryQuery.parse(input);
    const items = await this.list(context, data);
    let start = 0;
    if (data.after) {
      const cursor = await this.lifecycle.store.get("memory", data.after);
      await this.require(context, cursor);
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
  async write(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = memoryWrite.parse(input);
    await this.validate(context, data.visibility);
    return await this.lifecycle.store.transaction(async () => {
      if (data.expected_revision === 0) {
        // Identities are never reused, including after deletion. Old retries cannot resurrect facts.
        if ((await this.lifecycle.store.list("memory")).some((item) => item.id === data.memory_id))
          throw new DomainError("CONFLICT");
        return await this.lifecycle.store.put({
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
      const current = await this.lifecycle.store.get("memory", data.memory_id);
      await this.require(context, current);
      if (
        current.revision !== data.expected_revision ||
        current.state !== "active" ||
        current.visibility !== data.visibility
      )
        throw new DomainError("CONFLICT");
      return await this.update(current, { text: data.text, source_run_id: sourceRunId });
    });
  }
  async remove(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = memoryDelete.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const current = await this.lifecycle.store.get("memory", data.memory_id);
      await this.require(context, current);
      if (current.revision !== data.expected_revision || current.state !== "active")
        throw new DomainError("CONFLICT");
      return await this.update(current, { state: "deleted", text: "", source_run_id: sourceRunId });
    });
  }
}
