import { expect, test } from "bun:test";
import { z } from "zod";
import { createApi } from "../src/api";
import { responseSchemas } from "../src/api-contract";
import { operationResponse } from "../src/api-responses";
import { Background } from "../src/background";
import { fixture } from "./helpers";

test("consumer validates real creation, learning, workspace, group and control responses", async () => {
  const f = fixture();
  try {
    const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64));
    async function call(template: string, path = template, body?: unknown) {
      const method = body === undefined ? "GET" : "POST";
      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${"x".repeat(64)}`,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      const value = await response.json();
      expect(response.status, `${method} ${template}: ${JSON.stringify(value)}`).toBe(200);
      const published = operationResponse(method, template);
      const schema =
        "schema" in published
          ? published.schema
          : z.toJSONSchema(responseSchemas[published.reference as keyof typeof responseSchemas]);
      if (!schema) throw new Error("Missing response schema.");
      expect(z.fromJSONSchema(schema).safeParse(value), `${method} ${template}`).toMatchObject({
        success: true,
      });
      return value;
    }
    await call("/health/live");
    await call("/health/ready");
    await call("/v1/setup", undefined, {});
    const created = await call("/v1/creation/agents", undefined, {
      harness: "muse",
      connection_id: null,
      model_id: null,
      billing_source: "api_key",
    });
    await call("/v1/threads/:id/opening", `/v1/threads/${created.thread.id}/opening`);
    await call(
      "/v1/threads/:id/workspace",
      `/v1/threads/${f.thread.id}/workspace?agent_id=${f.agent.id}`,
    );
    const workspace = await call("/v1/workspaces", undefined, {
      agent_id: f.agent.id,
      thread_id: f.thread.id,
    });
    await call("/v1/workspaces/:id/files", `/v1/workspaces/${workspace.id}/files`);
    const context = { agent_id: f.agent.id, thread_id: f.thread.id };
    const query = new URLSearchParams(context).toString();
    const memory = await call("/v1/learning/memories/write", undefined, {
      context,
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: "Contract proof",
    });
    await call("/v1/learning/memories", `/v1/learning/memories?${query}`);
    await call("/v1/learning/memories/delete", undefined, {
      context,
      memory_id: memory.id,
      expected_revision: memory.revision,
    });
    const skill = await call("/v1/learning/skills/create", undefined, {
      context,
      name: "contract-proof",
      visibility: "dm_private",
      package: { description: "Verification", instructions: "Read the contract." },
    });
    await call("/v1/learning/skills/read", undefined, {
      context,
      skill_id: skill.skill.id,
      version: 1,
    });
    await call("/v1/learning/skills/assign", undefined, {
      context,
      skill_id: skill.skill.id,
      version: 1,
      expected_revision: 0,
      enabled: true,
    });
    await call("/v1/learning/skills", `/v1/learning/skills?${query}`);
    const group = await call("/v1/creation/groups", undefined, {
      name: "Contract group",
      member_agent_ids: [f.agent.id],
    });
    await call("/v1/groups/:id/configuration", `/v1/groups/${group.thread.id}/configuration`, {
      expected_revision: group.thread.revision,
      changes: { shared_instructions: "Read carefully." },
    });
    await call("/v1/groups/:id/messages", `/v1/groups/${group.thread.id}/messages`, {
      text: "Inspect the contract.",
    });
    await call("/v1/threads/:id/goals", `/v1/threads/${f.thread.id}/goals?agent_id=${f.agent.id}`);
    const admission = await call("/v1/runs", undefined, { ...context, text: "Read the contract." });
    await call("/v1/runs/:id/cancel", `/v1/runs/${admission.run.id}/cancel`, {});
    await call("/v1/entities/:kind", "/v1/entities/run");
    await call("/v1/entities/:kind/:id", `/v1/entities/run/${admission.run.id}`);
    await call("/v1/workspaces/:id/revoke", `/v1/workspaces/${workspace.id}/revoke`, {});
    expect(() => operationResponse("GET", "/v1/new-unreviewed-query")).toThrow(
      "response contract is missing",
    );
  } finally {
    f.close();
  }
});
