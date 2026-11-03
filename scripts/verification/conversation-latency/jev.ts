import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { JevRouter, type RoutingPacket } from "../../../apps/server/src/groups/router";

const output = resolve(process.argv[2] ?? "docs/verification/conversation-latency/jev.json");
assert(
  process.env.TYPESAFE_API_KEY,
  "TYPESAFE_API_KEY is required; run with the root environment file.",
);
const router = new JevRouter(process.env.TYPESAFE_API_KEY);
const members = [
  {
    agent_id: crypto.randomUUID(),
    name: "Raka",
    handle: "researcher",
    soul: "Researcher: finds primary sources, researches facts and gathers evidence.",
    instructions: "Own research tasks; hand available research to Writer when prose is needed.",
  },
  {
    agent_id: crypto.randomUUID(),
    name: "Maya",
    handle: "writer",
    soul: "Writer: writes and edits articles, announcements, copy and summaries from available facts.",
    instructions: "Own drafting, rewriting and style edits.",
  },
  {
    agent_id: crypto.randomUUID(),
    name: "Nadia",
    handle: "reviewer",
    soul: "Reviewer: critically reviews completed drafts, verifies claims and identifies mistakes.",
    instructions: "Own review and validation of existing work.",
  },
];
const cases: { request: string; expected: number; previous?: { agent: number; text: string } }[] = [
  { request: "Cari sumber resmi tentang perubahan iklim untuk bahan artikel.", expected: 0 },
  { request: "Research the official documentation and collect primary sources.", expected: 0 },
  { request: "Tolong riset tren transportasi publik dan sertakan sumbernya.", expected: 0 },
  { request: "Temukan bukti yang mendukung angka pertumbuhan ini.", expected: 0 },
  {
    request: "Find original sources for our next article. We do not have any research yet.",
    expected: 0,
  },
  {
    request: "Kumpulkan informasi harga dari situs resmi, belum perlu menulis artikel.",
    expected: 0,
  },
  { request: "Tolong tuliskan artikel dari temuan riset yang sudah tersedia.", expected: 1 },
  { request: "Write a short launch announcement using the facts above.", expected: 1 },
  { request: "Buat caption Instagram dari poin-poin yang sudah disetujui.", expected: 1 },
  { request: "Rewrite this paragraph to sound more natural.", expected: 1 },
  { request: "Ringkas hasil diskusi menjadi tulisan yang mudah dibaca.", expected: 1 },
  { request: "Polish the wording of this email; retain its meaning.", expected: 1 },
  { request: "Review draf final ini dan tunjukkan bagian yang keliru.", expected: 2 },
  { request: "Independently verify the calculations in the completed report.", expected: 2 },
  { request: "Audit klaim pada artikel yang sudah ditulis dan berikan koreksi.", expected: 2 },
  { request: "Check the existing final draft against its cited evidence.", expected: 2 },
  { request: "Periksa kualitas hasil Writer sebelum kita publikasikan.", expected: 2 },
  { request: "Please critique this completed copy for unsupported claims.", expected: 2 },
  {
    request: "Lanjutkan pencarian sumbernya.",
    expected: 0,
    previous: {
      agent: 0,
      text: "I found two official sources and am checking a third primary source.",
    },
  },
  {
    request: "Ada sumber resmi lainnya?",
    expected: 0,
    previous: { agent: 0, text: "Here are the official research sources available so far." },
  },
  {
    request: "Continue gathering the evidence.",
    expected: 0,
    previous: {
      agent: 0,
      text: "The research is not complete; I still need the original dataset.",
    },
  },
  {
    request: "Buat lebih singkat dan santai.",
    expected: 1,
    previous: {
      agent: 1,
      text: "Here is the requested announcement draft, ready for style edits.",
    },
  },
  {
    request: "Use a warmer tone in the draft.",
    expected: 1,
    previous: {
      agent: 1,
      text: "The article draft is complete; let me know what wording to adjust.",
    },
  },
  {
    request: "Paragraf kedua tolong ditulis ulang.",
    expected: 1,
    previous: { agent: 1, text: "I have written the requested three-paragraph article." },
  },
  {
    request: "Tolong periksa lagi klaim terakhir.",
    expected: 2,
    previous: {
      agent: 2,
      text: "I reviewed the completed article and flagged two unsupported claims.",
    },
  },
  {
    request: "Double-check your verification of the second figure.",
    expected: 2,
    previous: { agent: 2, text: "I independently verified the figures in the final report." },
  },
  {
    request: "Sumbernya sudah cukup. Sekarang tuliskan artikelnya.",
    expected: 1,
    previous: {
      agent: 0,
      text: "Research complete. All sources and confirmed facts are available above.",
    },
  },
  {
    request: "The draft is ready. Have it reviewed for factual mistakes.",
    expected: 2,
    previous: { agent: 1, text: "The final draft is complete and ready for independent review." },
  },
  {
    request: "Butuh riset tambahan dulu untuk data tahun terbaru.",
    expected: 0,
    previous: {
      agent: 1,
      text: "The article needs a newer primary dataset before it can be finished.",
    },
  },
  {
    request: "Review sudah selesai. Sekarang perbaiki gaya penulisannya.",
    expected: 1,
    previous: {
      agent: 2,
      text: "Review complete. The facts are correct; the prose can be simplified.",
    },
  },
];
const results: object[] = [];
let correct = 0;
let fallback = 0;
const durations: number[] = [];
for (const [index, item] of cases.entries()) {
  const packet: RoutingPacket = {
    group: {
      name: "Editorial team",
      shared_instructions:
        "Choose the relevant specialist for each request; preserve task continuity and follow explicit topic changes.",
    },
    request: item.request,
    request_message_id: crypto.randomUUID(),
    members,
    attachments: [],
    history: item.previous
      ? [
          {
            id: crypto.randomUUID(),
            author: "agent",
            agent_id: members[item.previous.agent].agent_id,
            text: item.previous.text,
          },
        ]
      : [],
  };
  const started = performance.now();
  try {
    const result = await router.choose(packet, new AbortController().signal);
    const elapsed = Math.round(performance.now() - started);
    durations.push(elapsed);
    const matches = result.agent_id === members[item.expected].agent_id;
    correct += Number(matches);
    fallback += Number(!result.agent_id || result.confidence < 0.5);
    results.push({
      index,
      request: item.request,
      history: packet.history,
      expected: members[item.expected].handle,
      actual: members.find((member) => member.agent_id === result.agent_id)?.handle ?? null,
      correct: matches,
      duration_ms: elapsed,
      ...result,
    });
  } catch (error) {
    results.push({
      index,
      request: item.request,
      correct: false,
      duration_ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.constructor.name : "UnknownError",
    });
  }
}
durations.sort((a, b) => a - b);
const percentile = (p: number) =>
  durations[Math.max(0, Math.ceil(durations.length * p) - 1)] ?? null;
const report = {
  captured_at: new Date().toISOString(),
  model: "jev-1.14.0",
  sdk: "@typesafe-ai/sdk@0.6.0",
  runtime: `Bun ${Bun.version}`,
  scope: "Synthetic text-only routing decisions; no native execution or user content.",
  attempts: cases.length,
  responses: durations.length,
  correct,
  fallback,
  p50_ms: percentile(0.5),
  p95_ms: percentile(0.95),
  results,
};
mkdirSync(dirname(output), { recursive: true });
await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    attempts: report.attempts,
    responses: report.responses,
    correct,
    fallback,
    p50_ms: report.p50_ms,
    p95_ms: report.p95_ms,
  }),
);
assert.equal(report.responses, cases.length, "Every synthetic routing attempt must return.");
assert(
  correct / cases.length >= 0.95,
  "Routing accuracy must meet the initial 95% acceptance target.",
);
