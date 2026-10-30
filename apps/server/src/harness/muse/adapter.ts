import { join } from "node:path";
import type { HarnessAdapter } from "../broker";
import { MuseClient } from "./client";

export class MuseAdapter implements HarnessAdapter {
  readonly harness = "muse";
  constructor(
    private readonly endpoint: () => string,
    private readonly args: string[] = [],
  ) {}
  async connect(context: Parameters<HarnessAdapter["connect"]>[0]) {
    // Muse's durable model projection follows its process startup model. Pin both it and the session.
    const client = new MuseClient(
      context.executable,
      {
        ...context,
        env: {
          ...context.env,
          MUSE_CONTRIBUTOR_MODE: context.model_id?.endsWith("-contributor") ? "1" : "0",
        },
      },
      join(context.state_directory, "lanes", context.agent_id, context.thread_id, "workspace"),
      this.endpoint,
      context.instructions,
      this.args,
      context.model_id,
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
