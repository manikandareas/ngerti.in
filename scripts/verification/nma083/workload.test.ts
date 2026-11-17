import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { acceptanceFixture } from "./fixture";

test("declared three-client HTTP/SSE workload measures admission and event delivery with private streams", async () => {
  const f = await acceptanceFixture();
  const directory = resolve(import.meta.dir, "../../../.dev/verification/nma-083");
  mkdirSync(directory, { recursive: true });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const pumps: Promise<void>[] = [];
  const samples: { actor: number; command_ms?: number; event_ms?: number }[] = [];
  const pending = new Map<string, { started: number; sample: (typeof samples)[number] }>();
  const errors: string[] = [];
  const report = {
    workload:
      "three concurrent clients; six unique queued admissions per client; one private SSE stream per client",
    clients: 3,
    planned_commands: 18,
    native_inference: false,
    production_capacity_claim: false,
    samples,
    errors,
    completed: false,
  };
  try {
    const lanes = [f.ownerLane, f.aliceLane, f.bobLane];
    for (const [actor, lane] of lanes.entries()) {
      const response = await f.request(lane.cookie, "/v1/events?limit=1000");
      const context = response.headers.get("X-Ngertiin-Event-Context")!;
      const page = await response.json();
      const stream = await f.http(
        `/v1/events/stream?after=${page.next_cursor}`,
        undefined,
        lane.cookie,
        {
          "X-Ngertiin-Organization": f.initial.organization.id,
          "X-Ngertiin-Event-Context": context,
        },
      );
      expect(stream.status).toBe(200);
      const reader = stream.body!.getReader();
      readers.push(reader);
      pumps.push(
        (async () => {
          let buffer = "";
          const decoder = new TextDecoder();
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) return;
            buffer += decoder.decode(chunk.value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame.split("\n").find((line) => line.startsWith("data: "));
              if (!data) continue;
              const event = JSON.parse(data.slice(6));
              const item = event.data;
              if (item.kind !== "message" || item.author !== "user") continue;
              const observed = pending.get(item.text);
              if (!observed) continue;
              if (observed.sample.actor !== actor)
                errors.push("A private command arrived on another actor's event stream.");
              else observed.sample.event_ms ??= performance.now() - observed.started;
            }
          }
        })().catch((error) => {
          errors.push(error instanceof Error ? error.name : "Stream failure");
        }),
      );
    }
    await Promise.all(
      lanes.map(async (lane, actor) => {
        for (let index = 0; index < 6; index++) {
          const marker = `NMA083-workload-${actor}-${index}-${crypto.randomUUID()}`;
          const sample: (typeof samples)[number] = { actor };
          samples.push(sample);
          const started = performance.now();
          pending.set(marker, { started, sample });
          await f.success(
            f.request(lane.cookie, "/v1/runs", {
              thread_id: lane.thread.id,
              agent_id: lane.agent.id,
              text: marker,
            }),
          );
          sample.command_ms = performance.now() - started;
        }
      }),
    );
    const deadline = Date.now() + 30000;
    while (samples.some((sample) => sample.event_ms === undefined) && Date.now() < deadline)
      await Bun.sleep(25);
    expect(samples).toHaveLength(18);
    expect(samples.filter((sample) => sample.event_ms !== undefined)).toHaveLength(18);
    expect(errors).toEqual([]);
    const p95 = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
    Object.assign(report, {
      p95_command_roundtrip_ms: p95(samples.map((sample) => sample.command_ms!)),
      p95_command_start_to_sse_delivery_ms: p95(samples.map((sample) => sample.event_ms!)),
      rss_bytes: process.memoryUsage().rss,
      completed: true,
    });
  } finally {
    await Promise.allSettled(readers.map((reader) => reader.cancel()));
    await Promise.all(pumps);
    await f.close();
    await Bun.write(resolve(directory, "workload.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
}, 120000);
