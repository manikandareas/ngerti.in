import { afterEach, expect, test } from "bun:test";
import { Artifacts } from "../src/artifacts";
import { Background } from "../src/background";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
const token = "submission-replay-".repeat(4);

for (const target of ["dm", "group"] as const) {
  test(`${target} existing-file submissions replay directly after lost acknowledgement and restart`, async () => {
    f = await fixture();
    const thread =
      target === "dm"
        ? f.thread
        : await f.lifecycle.create("thread", {
            type: "group",
            member_agent_ids: [f.agent.id],
          });
    const artifacts = new Artifacts(f.lifecycle);
    const workspace = await artifacts.workspaces.ensure(thread.id, f.agent.id);
    const bytes = Buffer.from("Existing source: keep these bytes unchanged.");
    const file = await artifacts.upload(workspace.id, crypto.randomUUID(), {
      name: "existing.txt",
      media_type: "text/plain",
      content_base64: bytes.toString("base64"),
    });
    const id = crypto.randomUUID();
    const body = {
      submission_id: id,
      agent_id: target === "dm" ? f.agent.id : null,
      text: "Read the existing file.",
      artifact_ids: [file.id],
      ...(target === "dm" ? { thread_id: thread.id } : {}),
    };
    let api = await createApi(f.lifecycle, new Background(f.lifecycle), token);
    const send = (input = body) =>
      api.handle(
        new Request(
          `http://localhost${target === "dm" ? "/v1/runs" : `/v1/groups/${thread.id}/messages`}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Idempotency-Key": id,
            },
            body: JSON.stringify(input),
          },
        ),
      );
    // The client loses the response after admission commits, then recovers its exact command.
    expect((await send()).status).toBe(200);
    await f.restart();
    api = await createApi(f.lifecycle, new Background(f.lifecycle), token);
    const cursor = await f.store.cursor;
    const receipts = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const response = await send();
        expect(response.status).toBe(200);
        return response.json();
      }),
    );
    expect(new Set(receipts.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(await f.store.cursor).toBe(cursor);
    expect(
      (await f.store.list("message")).filter(
        (m) => m.thread_id === thread.id && m.purpose === "conversation",
      ),
    ).toHaveLength(1);
    expect((await send({ ...body, text: "Different input." })).status).toBe(409);
    expect((await new Artifacts(f.lifecycle).download(file.id, workspace.id)).bytes).toEqual(bytes);
  });
}
