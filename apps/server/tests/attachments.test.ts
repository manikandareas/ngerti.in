import { afterEach, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Artifacts } from "../src/artifacts";
import { attachmentRead, attachmentSearch } from "../src/attachments/contracts";
import { AttachmentDocuments } from "../src/attachments/documents";
import { Attachments } from "../src/attachments/service";
import { AttachmentSubmissions } from "../src/attachments/submissions";
import { Background } from "../src/background";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
const token = "a".repeat(64);
function pdf(pages: string[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let i = 0; i < pages.length; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    const text = `BT /F1 12 Tf 20 750 Td (${pages[i].replace(/[\\()]/g, "\\$&")}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
function upload(
  submissionId: string,
  name = "input.txt",
  bytes = Buffer.from("Unique source: turquoise badger 9137"),
) {
  return {
    submission_id: submissionId,
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    name,
    media_type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
    content_base64: bytes.toString("base64"),
  };
}
async function running(text: string, ids: string[]) {
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  await f.lifecycle.bind(f.thread.id, f.agent.id, "attachment-native", workspace);
  const input = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text,
    artifact_ids: ids,
  });
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("No run claimed.");
  await f.lifecycle.started(claimed.id, claimed.dispatch_token, "attachment-turn");
  return {
    run: await f.store.get("run", input.run.id),
    authorize: async () =>
      await f.lifecycle.authorizeDispatch(claimed.id, claimed.dispatch_token as string),
  };
}

test("private uploads appear in neither workspace nor artifacts until one message commits", async () => {
  f = await fixture();
  const service = new AttachmentSubmissions(f.lifecycle);
  const submission = crypto.randomUUID();
  const staged = await service.stage(crypto.randomUUID(), upload(submission));
  expect(await f.store.list("artifact")).toHaveLength(0);
  expect(await f.store.list("workspace")).toHaveLength(0);
  const result = await service.commit(
    {
      submission_id: submission,
      thread_id: f.thread.id,
      agent_id: f.agent.id,
      text: "What does the file say?",
      artifact_ids: [staged.id],
    },
    submission,
  );
  expect(result.message.artifact_ids).toEqual([staged.id]);
  const artifact = await f.store.get("artifact", staged.id);
  expect(artifact.materialization).toBe("pending");
  if (!artifact.workspace_id || !artifact.source_path)
    throw new Error("Missing artifact projection.");
  const root = service.artifacts.workspaces.path(
    await f.store.get("workspace", artifact.workspace_id),
  );
  expect(existsSync(join(root, artifact.source_path))).toBe(false);
  await service.materialize(result.message);
  expect(readFileSync(join(root, artifact.source_path), "utf8")).toContain("turquoise badger");
});

test("a missing second upload rolls back all artifact and message publication", async () => {
  f = await fixture();
  const service = new AttachmentSubmissions(f.lifecycle);
  const submission = crypto.randomUUID();
  const staged = await service.stage(crypto.randomUUID(), upload(submission));
  await expect(
    (async () =>
      service.commit(
        {
          submission_id: submission,
          thread_id: f.thread.id,
          agent_id: f.agent.id,
          text: "Read both.",
          artifact_ids: [staged.id, crypto.randomUUID()],
        },
        submission,
      ))(),
  ).rejects.toThrow();
  expect(await f.store.list("artifact")).toHaveLength(0);
  expect(await f.store.list("message")).toHaveLength(0);
  expect((await f.store.list("attachment_upload"))[0]?.state).toBe("staged");
});

test("HTTP lost acknowledgement, exact replay and restart publish one message and artifact", async () => {
  f = await fixture();
  const submission = crypto.randomUUID();
  let app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
  const call = (path: string, body?: object, key = crypto.randomUUID()) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const fileId = crypto.randomUUID();
  expect((await call("/v1/message-uploads", upload(submission), fileId)).status).toBe(200);
  const body = {
    submission_id: submission,
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read this.",
    artifact_ids: [fileId],
  };
  const first = await (await call("/v1/runs", body, submission)).json();
  expect(first.message.artifact_ids).toEqual([fileId]);
  await f.restart();
  app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
  const status = await (await call(`/v1/message-submissions/${submission}`)).json();
  expect(status.state).toBe("committed");
  expect((await (await call("/v1/runs", body, submission)).json()).message.id).toBe(
    first.message.id,
  );
  expect((await call("/v1/runs", { ...body, text: "Changed payload" }, submission)).status).toBe(
    409,
  );
  expect(await f.store.list("message")).toHaveLength(1);
  expect(await f.store.list("artifact")).toHaveLength(1);
});

test("restart finishes a committed pending projection and expiry only removes uncommitted bytes", async () => {
  f = await fixture();
  let service = new AttachmentSubmissions(f.lifecycle);
  const id = crypto.randomUUID();
  const staged = await service.stage(crypto.randomUUID(), upload(id));
  await service.commit(
    {
      submission_id: id,
      thread_id: f.thread.id,
      agent_id: f.agent.id,
      text: "Read.",
      artifact_ids: [staged.id],
    },
    id,
  );
  const unused = await service.stage(crypto.randomUUID(), upload(crypto.randomUUID()));
  await f.restart();
  service = new AttachmentSubmissions(f.lifecycle);
  await service.recover();
  expect((await f.store.get("artifact", staged.id)).materialization).toBe("ready");
  await service.sweep(new Date(Date.now() + 25 * 60 * 60 * 1000));
  expect(existsSync(join(service.artifacts.blobRoot, unused.id))).toBe(false);
  expect(existsSync(join(service.artifacts.blobRoot, staged.id))).toBe(true);
});

test("PDF extraction supplies real page text, search locations and bounded read receipts", async () => {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const file = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "source.pdf",
    media_type: "application/pdf",
    content_base64: pdf([
      "Cover",
      "Verification marker: turquoise badger 9137",
      "Conclusion",
    ]).toString("base64"),
  });
  const { run, authorize } = await running("Explain this file.", [file.id]);
  const service = new Attachments(f.lifecycle);
  const context = await service.context(run, authorize);
  expect(context.text).toContain("turquoise badger 9137");
  const search = await service.search(
    run,
    attachmentSearch.parse({ artifact_id: file.id, query: "turquoise badger" }),
    authorize,
  );
  expect(search.matches[0]?.page).toBe(2);
  const result = await service.read(
    run,
    attachmentRead.parse({ artifact_id: file.id, start_page: 2, end_page: 2 }),
    authorize,
  );
  expect(result.pages[0]?.text).toContain("turquoise badger 9137");
  expect(
    (await f.store.get("run", run.id)).attachment_observations.map((r) => r.operation),
  ).toEqual(["search", "read"]);
  expect((await f.store.get("attachment_document", file.id)).page_count).toBe(3);
}, 20_000);

test("follow-up context finds prior sent files but excludes drafts, future messages and foreign lanes", async () => {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const sent = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "same.txt",
    content_base64: Buffer.from("first content").toString("base64"),
  });
  const draft = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "same.txt",
    content_base64: Buffer.from("private draft").toString("base64"),
  });
  await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read earlier.",
    artifact_ids: [sent.id],
  });
  const earlier = (await f.store.list("run"))[0];
  if (!earlier) throw new Error("Missing earlier run.");
  await f.store.put(
    { ...earlier, status: "cancelled", outcome: "cancelled", revision: earlier.revision + 1 },
    earlier.revision,
  );
  const { run } = await running("Which page?", []);
  const service = new Attachments(f.lifecycle);
  expect((await service.current(run)).attachments).toHaveLength(0);
  expect((await service.current(run)).previous_attachments.map((a) => a.id)).toEqual([sent.id]);
  await expect(
    service.read(run, attachmentRead.parse({ artifact_id: draft.id }), () => {}),
  ).rejects.toThrow("SCOPE_DENIED");
  await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Later file",
    artifact_ids: [draft.id],
  });
  expect((await service.list(run)).attachments.map((a) => a.id)).toEqual([sent.id]);
});

test("unsupported, empty and invalid documents have explicit failures without a fabricated read", async () => {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const documents = new AttachmentDocuments(f.lifecycle);
  for (const [name, content, expected] of [
    ["data.bin", "binary", "UNSUPPORTED_FORMAT"],
    ["empty.txt", "", "NO_TEXT"],
    ["broken.pdf", "not a PDF", "INVALID_DOCUMENT"],
  ] as const) {
    const file = await files.upload(workspace.id, crypto.randomUUID(), {
      name,
      content_base64: Buffer.from(content).toString("base64"),
    });
    expect((await documents.prepare(file, () => {})).error_code).toBe(expected);
  }
}, 20_000);

test("cached document reads recheck revoked access and immutable source corruption", async () => {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const file = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "source.txt",
    content_base64: Buffer.from("original").toString("base64"),
  });
  const { run, authorize } = await running("Read.", [file.id]);
  const service = new Attachments(f.lifecycle);
  await service.read(run, attachmentRead.parse({ artifact_id: file.id }), authorize);
  writeFileSync(join(files.blobRoot, file.id), "modified");
  await expect(
    service.read(run, attachmentRead.parse({ artifact_id: file.id }), authorize),
  ).rejects.toThrow("CONFLICT");
  await files.workspaces.revoke(workspace.id);
  await expect(
    service.read(run, attachmentRead.parse({ artifact_id: file.id }), authorize),
  ).rejects.toThrow();
});

test("an interrupted derived text cache is recomputed without changing source bytes", async () => {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const file = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "cache.txt",
    content_base64: Buffer.from("durable original text").toString("base64"),
  });
  const documents = new AttachmentDocuments(f.lifecycle);
  await documents.prepare(file, () => {});
  const cache = readdirSync(documents.root).find((name) => name.endsWith(".json"));
  if (!cache) throw new Error("Missing derived cache.");
  writeFileSync(join(documents.root, cache), "{");
  expect((await documents.prepare(file, () => {})).pages[0]?.text).toBe("durable original text");
  expect((await files.download(file.id, workspace.id)).bytes.toString()).toBe(
    "durable original text",
  );
});
