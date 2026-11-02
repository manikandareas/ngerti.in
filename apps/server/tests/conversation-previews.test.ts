import { afterEach, expect, test } from "bun:test";
import { createApi } from "../src/api";
import { responseSchemas } from "../src/api-contract";
import { Background } from "../src/background";
import { type Entity, thread } from "../src/contracts";
import { readConversationPreviews } from "../src/conversations/previews";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());

test("conversation previews return bounded visible excerpts for DMs and groups without side effects", () => {
  f = fixture();
  const group = thread.parse(
    f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] }),
  );
  const peer = f.lifecycle.create("agent", {
    name: "Empty conversation",
    harness: "codex",
    connection_id: null,
  });
  const empty = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [peer.id] });
  const first = f.admit("First message").message;
  const put = (changes: Partial<Entity<"message">>) =>
    f.store.put<Entity<"message">>({ ...first, id: crypto.randomUUID(), ...changes });
  const latest = put({ text: "Latest\n\tmessage", thread_id: group.id });
  put({ text: "Deleted message", state: "deleted", thread_id: group.id });
  put({ text: "PRIVATE_CONTINUATION", purpose: "continuation", thread_id: group.id });
  put({ text: "", author: "agent", author_agent_id: f.agent.id, thread_id: group.id });
  const internal = f.store.put({
    ...group,
    id: crypto.randomUUID(),
    purpose: "routing",
    group_thread_id: group.id,
  });
  put({ text: "PRIVATE_ROUTER_CONTEXT", thread_id: internal.id });
  const long = put({ text: "Long message ".repeat(100), thread_id: f.thread.id });
  const cursor = f.store.cursor;
  const result = responseSchemas.conversation_previews.parse(readConversationPreviews(f.store));
  expect(result.cursor).toBe(cursor);
  expect(f.store.cursor).toBe(cursor);
  expect(result.items).toHaveLength(3);
  expect(result.items.find((item) => item.thread_id === empty.id)?.latest_message).toBeNull();
  expect(result.items.find((item) => item.thread_id === group.id)?.latest_message).toEqual({
    id: latest.id,
    text: "Latest message",
    author: "user",
    author_agent_id: null,
    has_attachments: false,
  });
  expect(result.items.find((item) => item.thread_id === f.thread.id)?.latest_message).toMatchObject(
    {
      id: long.id,
      text: long.text.trim().slice(0, 240),
    },
  );
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});

test("authenticated preview reads reflect edits, deletions and restart through the published API", async () => {
  f = fixture();
  const token = "d".repeat(64);
  const request = (authorized = true) =>
    new Request("http://localhost/v1/conversations/previews", {
      headers: authorized ? { Authorization: `Bearer ${token}` } : {},
    });
  let app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  expect((await app.handle(request(false))).status).toBe(401);
  const first = f.admit("Earlier message").message;
  const latest = f.admit("Before edit").message;
  const edited = f.store.put(
    { ...latest, revision: latest.revision + 1, text: "After edit" },
    latest.revision,
  );
  const read = async () => {
    const response = await app.handle(request());
    expect(response.status).toBe(200);
    return responseSchemas.conversation_previews.parse(await response.json()).items[0]
      ?.latest_message;
  };
  expect(await read()).toMatchObject({ id: edited.id, text: "After edit" });
  f.store.put({ ...edited, revision: edited.revision + 1, state: "deleted" }, edited.revision);
  expect(await read()).toMatchObject({ id: first.id, text: first.text });
  f.restart();
  app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  expect(await read()).toMatchObject({ id: first.id, text: first.text });
  const contract = await app
    .handle(
      new Request("http://localhost/v1/contracts", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    .then((response) => response.json());
  expect(contract.projections.conversation_previews).toBeDefined();
  expect(
    contract.http.find((route: { path: string }) => route.path === "/v1/conversations/previews"),
  ).toMatchObject({
    method: "GET",
    authentication: "installation_bearer",
    semantics: "read",
  });
});
