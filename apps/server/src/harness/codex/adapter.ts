import { join } from "node:path";
import type { HarnessAdapter } from "../broker";
import { CodexClient } from "./client";

export class CodexAdapter implements HarnessAdapter {
  readonly harness = "codex";
  constructor(
    private readonly endpoint: () => string,
    private readonly args: string[] = [],
  ) {}
  async connect(context: Parameters<HarnessAdapter["connect"]>[0]) {
    const client = new CodexClient(
      context.executable,
      context,
      join(context.state_directory, "lanes", context.agent_id, context.thread_id, "workspace"),
      this.endpoint,
      context.instructions,
      this.args,
    );
    try {
      await client.initialize();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }
}
