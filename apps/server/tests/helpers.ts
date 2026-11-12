import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { Connections } from "../src/harness/connections";
import { Lifecycle } from "../src/lifecycle";
import { Store } from "../src/store";

export async function fixture() {
  if (!process.env.NGERTIIN_TEST_DATABASE_URL)
    throw new Error("NGERTIIN_TEST_DATABASE_URL must select a disposable PostgreSQL database.");
  const dir = mkdtempSync(join(tmpdir(), "ngertiin-foundation-"));
  const owner = crypto.randomUUID();
  const options = {
    connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
    schema: `test_${owner.replaceAll("-", "")}`,
  };
  let store = await Store.open(join(dir, "state.sqlite"), owner, options);
  let lifecycle = await Lifecycle.open(store);
  const connection = await new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await lifecycle.create("agent", {
    name: "Researcher",
    harness: "codex",
    connection_id: connection.id,
  });
  const thread = await lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
  return {
    dir,
    options,
    owner,
    agent,
    thread,
    get store() {
      return store;
    },
    get lifecycle() {
      return lifecycle;
    },
    async admit(text = "Please inspect this project.") {
      return await lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text });
    },
    async bind() {
      return await lifecycle.bind(thread.id, agent.id, crypto.randomUUID());
    },
    async restart() {
      await store.close();
      store = await Store.open(join(dir, "state.sqlite"), owner, options);
      lifecycle = await Lifecycle.open(store);
    },
    async close() {
      await store.close();
      const client = new Client({ connectionString: options.connectionString });
      await client.connect();
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${options.schema}" CASCADE`);
      } finally {
        await client.end();
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
