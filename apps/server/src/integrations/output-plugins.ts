import type { z } from "zod";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import type {
  outputPluginInput,
  outputPluginRegistry,
  outputPluginSnapshot,
} from "./output-plugin-contracts";

export function transformOutput(plugin: z.infer<typeof outputPluginSnapshot>, text: string) {
  if (text.startsWith(plugin.match_prefix)) {
    const result = plugin.replace_prefix + text.slice(plugin.match_prefix.length);
    if (result.length <= 100_000) return { text: result, status: "applied" as const };
  }
  return { text, status: "failed" as const };
}

export class OutputPlugins {
  constructor(private readonly lifecycle: Lifecycle) {}

  private async thread(id: string) {
    const { store } = this.lifecycle;
    const thread = await store.get("thread", id);
    if (
      !store.dataContext ||
      thread.type !== "dm" ||
      thread.purpose !== "conversation" ||
      thread.actor_id !== store.dataContext.userId
    )
      throw new DomainError("SCOPE_DENIED", 403);
    await store.assertInvocation(thread.member_agent_ids[0]);
    return thread;
  }

  private async dependencies() {
    const { store } = this.lifecycle;
    return new Set(
      (await store.list("app_connection"))
        .filter(
          (connection) =>
            connection.ownership === "personal" &&
            connection.actor_id === store.dataContext?.userId &&
            connection.state === "active",
        )
        .map((connection) => connection.toolkit),
    );
  }

  async list(threadId: string): Promise<z.infer<typeof outputPluginRegistry>> {
    const thread = await this.thread(threadId);
    const dependencies = this.lifecycle.outputPlugins.length
      ? await this.dependencies()
      : new Set();
    return {
      revision: thread.revision,
      plugins: this.lifecycle.outputPlugins.map((plugin) => {
        const enabled = thread.output_plugin?.id === plugin.id;
        const state = !dependencies.has(plugin.dependency.toolkit)
          ? "dependency_missing"
          : !enabled
            ? "inactive"
            : thread.output_plugin?.version === plugin.version
              ? "active"
              : "version_changed";
        return {
          id: plugin.id,
          version: plugin.version,
          name: plugin.name,
          source: plugin.source,
          dependency: plugin.dependency.name,
          enabled,
          state,
        };
      }),
    };
  }

  async set(threadId: string, input: z.infer<typeof outputPluginInput>) {
    const thread = await this.thread(threadId);
    const plugin = this.lifecycle.outputPlugins.find((item) => item.id === input.id);
    if (thread.revision !== input.expected_revision) throw new DomainError("CONFLICT");
    if (!plugin) throw new DomainError("NOT_FOUND", 404);
    if (input.enabled && !(await this.dependencies()).has(plugin.dependency.toolkit))
      throw new DomainError("APP_AUTH_REQUIRED", 403);
    if (input.enabled || thread.output_plugin?.id === input.id)
      await this.lifecycle.store.put(
        {
          ...thread,
          output_plugin: input.enabled ? { id: plugin.id, version: plugin.version } : null,
          revision: thread.revision + 1,
          updated_at: new Date().toISOString(),
        },
        thread.revision,
      );
    return this.list(threadId);
  }

  async forTurn(thread: Entity<"thread">, run: Entity<"run">) {
    if (
      !thread.output_plugin ||
      thread.type !== "dm" ||
      thread.purpose !== "conversation" ||
      thread.actor_id !== this.lifecycle.store.dataContext?.userId ||
      run.publication !== "immediate" ||
      run.response_mode !== "answer"
    )
      return null;
    const plugin = this.lifecycle.outputPlugins.find(
      (item) =>
        item.id === thread.output_plugin?.id && item.version === thread.output_plugin.version,
    );
    if (!plugin || !(await this.dependencies()).has(plugin.dependency.toolkit)) return null;
    const { source: _source, dependency: _dependency, ...snapshot } = plugin;
    return snapshot;
  }
}
