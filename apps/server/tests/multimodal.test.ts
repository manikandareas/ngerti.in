import { afterEach, expect, test } from "bun:test";
import sharp from "sharp";
import { Artifacts } from "../src/artifacts";
import { Connections } from "../src/harness/connections";
import { prepareVisualInputs } from "../src/multimodal";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
async function setup(media = "image/png", bytes?: Buffer) {
  f = fixture();
  const artifacts = new Artifacts(f.lifecycle);
  const workspace = artifacts.workspaces.ensure(f.thread.id, f.agent.id);
  const content =
    bytes ??
    (await sharp({ create: { width: 80, height: 40, channels: 3, background: "red" } })
      .png()
      .toBuffer());
  const artifact = artifacts.upload(workspace.id, crypto.randomUUID(), {
    name: "visual.png",
    media_type: media,
    content_base64: content.toString("base64"),
  });
  f.lifecycle.bind(f.thread.id, f.agent.id, "native", workspace);
  f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Describe the attachment",
    artifact_ids: [artifact.id],
  });
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run) throw new Error("Missing run");
  const connections = new Connections(f.lifecycle),
    c = connections.get(f.store.get("agent", f.agent.id).connection_id);
  const connection = connections.update(c, {
    capabilities: { ...c.capabilities, image_input: "supported", video_input: "unsupported" },
    models: [
      { id: "vision", reasoning: [], input_modalities: ["text", "image"] },
      { id: "text-only", reasoning: [], input_modalities: ["text"] },
    ],
  });
  return { artifact, run, connection };
}
test("visual inputs use immutable scoped bytes and record normalization hashes", async () => {
  const s = await setup();
  const result = await prepareVisualInputs(f.lifecycle, s.run, s.connection, "vision");
  expect(result.images[0]?.startsWith("data:image/png;base64,")).toBe(true);
  expect(result.receipts[0]).toMatchObject({
    artifact_id: s.artifact.id,
    source_sha256: s.artifact.sha256,
    width: 80,
    height: 40,
  });
  expect(JSON.stringify(result.receipts)).not.toContain("base64");
});
test("text-only or unknown models cannot silently receive image inputs", async () => {
  const s = await setup();
  await expect(prepareVisualInputs(f.lifecycle, s.run, s.connection, "text-only")).rejects.toThrow(
    "CAPABILITY_UNSUPPORTED",
  );
  await expect(prepareVisualInputs(f.lifecycle, s.run, s.connection, "missing")).rejects.toThrow(
    "CAPABILITY_UNKNOWN",
  );
  await expect(
    prepareVisualInputs(
      f.lifecycle,
      s.run,
      {
        ...s.connection,
        harness: "muse",
        capabilities: { ...s.connection.capabilities, image_input: "unsupported" },
      },
      "vision",
    ),
  ).rejects.toThrow("CAPABILITY_UNSUPPORTED");
});
test("unsupported video and unsupported harness image input fail before native dispatch", async () => {
  const s = await setup("video/mp4", Buffer.from("fake video"));
  await expect(prepareVisualInputs(f.lifecycle, s.run, s.connection, "vision")).rejects.toThrow(
    "CAPABILITY_UNSUPPORTED",
  );
});
test("malformed bytes and falsely declared image formats are rejected", async () => {
  const s = await setup("image/png", Buffer.from("private text pretending to be an image"));
  await expect(prepareVisualInputs(f.lifecycle, s.run, s.connection, "vision")).rejects.toThrow(
    "INVALID_REQUEST",
  );
});
