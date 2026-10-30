import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Lifecycle } from "../src/lifecycle";
import { Store } from "../src/store";

export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ngertiin-foundation-"));
  const owner = crypto.randomUUID();
  let store = new Store(join(dir, "state.sqlite"), owner);
  let lifecycle = new Lifecycle(store);
  const agent = lifecycle.create("agent", {
    name: "Researcher",
    harness: "codex",
    connection_id: crypto.randomUUID(),
  });
  const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
  return {
    dir,
    owner,
    agent,
    thread,
    get store() {
      return store;
    },
    get lifecycle() {
      return lifecycle;
    },
    admit(text = "Please inspect this project.") {
      return lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text });
    },
    bind() {
      return lifecycle.bind(thread.id, agent.id, crypto.randomUUID());
    },
    restart() {
      store.close();
      store = new Store(join(dir, "state.sqlite"), owner);
      lifecycle = new Lifecycle(store);
    },
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
