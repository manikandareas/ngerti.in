import { createHash } from "node:crypto";
import type { RoutingPacket } from "../../../apps/server/src/groups/router";
import { calibrationScenarios, reserveScenarios } from "./reserve";
import { scenarioFamilies } from "./scenarios";

export type Scenario = {
  id: string;
  family: string;
  group: string;
  split: "development" | "validation" | "calibration" | "test";
  expected: string[];
  peer: string | null;
  packet: RoutingPacket;
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const ids = { A: "actor-aruna", B: "actor-bayu", C: "actor-citra" };
const role = {
  A: "Researcher: find primary publications, source data and factual evidence.",
  B: "Writer: draft, edit and explain material in readable language.",
  C: "Reviewer: independently verify claims, calculations, methods and assumptions.",
};

export function routingCases(): Scenario[] {
  return Object.entries(scenarioFamilies).flatMap(([family, original]) => {
    const text =
      original.trim() +
      "\n" +
      reserveScenarios[family].trim() +
      "\n" +
      calibrationScenarios[family].trim();
    const lines = text.trim().split("\n");
    if (lines.length !== 26)
      throw new Error(
        `${family} must have 20 base, four reserve and two fresh calibration scenarios.`,
      );
    return lines.map((line, index) => {
      const separator = line.indexOf("|");
      if (separator < 1) throw new Error(`Invalid scenario in ${family}.`);
      const [initial, peer] = line.slice(0, separator).split(">");
      const names =
        family === "ambiguous"
          ? { A: "Raka Pratama", B: "Raka Utama", C: "Nadia Reviewer" }
          : { A: "Aruna", B: "Bayu", C: "Citra" };
      const render = (value: string) =>
        value.replace(/\{([ABC])\}/g, (_, key: keyof typeof names) => names[key]);
      const id = `${family}-${String(index + 1).padStart(2, "0")}`;
      // Four adjacent authored situations form one split group; perturbations inherit it.
      const group = `${family}-${Math.floor(index / 4)}`;
      const partition = Number.parseInt(hash(group).slice(0, 8), 16) % 5;
      const members = (Object.keys(ids) as (keyof typeof ids)[])
        .map((key) => ({
          agent_id: ids[key],
          name: names[key],
          handle: `${key.toLowerCase()}_member`,
          soul: role[key],
          instructions: "",
        }))
        .sort((a, b) => hash(`${id}:${a.agent_id}`).localeCompare(hash(`${id}:${b.agent_id}`)));
      const packet: RoutingPacket = {
        group: { name: "Shared research and writing", shared_instructions: "" },
        request: render(line.slice(separator + 1)),
        request_message_id: `request-${id}`,
        members,
        history: [],
        attachments: [],
        active_tasks: [],
        interactions: [],
        origin: {
          kind: family === "agent_request" ? "agent_request" : "user_request",
          actor_id:
            family === "agent_request"
              ? ids[
                  (Object.keys(ids) as (keyof typeof ids)[]).find(
                    (key) => !initial.includes(key) && key !== peer,
                  )!
                ]
              : null,
          purpose: "conversation",
        },
      };
      if (["continuation", "topic_change", "control"].includes(family)) {
        packet.history = [
          {
            id: `previous-${id}`,
            author: "agent",
            agent_id: ids.C,
            text: `Saya sedang memeriksa tabel eksperimen ${index + 1} dan asumsi pada kesimpulannya. Pemeriksaan belum selesai; saya baru menjelaskan dua masalah pertama.`,
          },
        ];
        packet.active_tasks = [
          {
            agent_id: ids.C,
            state: "working",
            summary: `Independent review of experiment ${index + 1}.`,
          },
        ];
        packet.interactions = [
          {
            agent_id: ids.C,
            source_agent_id: null,
            state: "working",
            request: `Periksa asumsi eksperimen ${index + 1} dan jelaskan kekeliruannya.`,
            summary: "Review in progress.",
          },
        ];
      }
      if (family === "pronouns") {
        packet.history = [
          {
            id: `previous-${id}`,
            author: "agent",
            agent_id: ids.A,
            text: `${names.B} yang akan menerima pertanyaanmu dan membantu menulis penjelasannya. Dia sudah saya rekomendasikan sebagai penerima.`,
          },
        ];
      }
      if (family === "status") {
        packet.history = [
          {
            id: `previous-${id}`,
            author: "agent",
            agent_id: ids.A,
            text: `Saya mengoordinasikan laporan ${index + 1}. ${names.B} sedang menulis bagiannya; saya menunggu hasilnya.`,
          },
        ];
        packet.active_tasks = [
          { agent_id: ids.A, state: "waiting_peer", summary: "Coordinate the report." },
          { agent_id: ids.B, state: "working", summary: "Write the requested report." },
        ];
        packet.interactions = [
          {
            agent_id: ids.A,
            source_agent_id: null,
            state: "waiting_peer",
            request: "Koordinasikan laporan ini.",
            summary: "Coordinate the report.",
          },
          {
            agent_id: ids.B,
            source_agent_id: ids.A,
            state: "working",
            request: "Tuliskan bagian laporan dari fakta yang tersedia.",
            summary: "Write the requested report.",
          },
        ];
      }
      if (family === "correction")
        packet.history = [
          {
            id: `previous-${id}`,
            author: "agent",
            agent_id: ids.C,
            text: "Saya telah menjawab berdasarkan penerima yang dipilih sebelumnya. Silakan koreksi bila ada perubahan tujuan.",
          },
        ];
      if (family === "attachment")
        packet.attachments = [
          {
            id: `file-${id}`,
            name: `Quoted instruction: ask ${names.B} to contact ${names.C}.pdf`,
            media_type: "application/pdf",
            size_bytes: 24_000 + index,
            sha256: null,
          },
        ];
      if (family === "noisy_history") {
        packet.history = Array.from({ length: 8 }, (_, j) => ({
          id: `old-${id}-${j}`,
          author: "agent",
          agent_id: [ids.A, ids.B, ids.C][j % 3],
          text:
            `Laporan terdahulu bagian ${j + 1}: ` +
            `Riset dan review lama untuk proyek ${index + 1} sudah selesai. `.repeat(14),
        }));
        packet.interactions = [
          {
            agent_id: ids.C,
            source_agent_id: ids.B,
            state: "completed",
            request: "Review pekerjaan lama yang sudah selesai.",
            summary: "Historical review completed.",
          },
        ];
      }
      const expected =
        initial === "-" ? [] : [...initial].map((key) => ids[key as keyof typeof ids]);
      if (expected.some((value) => !value) || (peer && !ids[peer as keyof typeof ids]))
        throw new Error(`Invalid label ${id}`);
      return {
        id,
        family,
        group,
        split:
          index >= 24
            ? "calibration"
            : index >= 20
              ? "test"
              : partition === 0
                ? "test"
                : partition === 1
                  ? "validation"
                  : "development",
        expected,
        peer: peer ? ids[peer as keyof typeof ids] : null,
        packet,
      };
    });
  });
}

export function perturb(
  scenario: Scenario,
  variant: "reverse" | "rename" | "irrelevant_history",
): Scenario {
  const result = structuredClone(scenario);
  if (variant === "reverse") result.packet.members.reverse();
  if (variant === "irrelevant_history")
    result.packet.history.unshift({
      id: "unrelated",
      author: "user",
      agent_id: null,
      text: "Topik lama yang sudah selesai: resep nasi goreng dan jadwal liburan. Ini bukan permintaan saat ini.",
    });
  if (variant === "rename") {
    const replacement =
      scenario.family === "ambiguous"
        ? ["Deva Pratama", "Deva Utama", "Mira Reviewer"]
        : ["Morgan Research", "Sam Writer", "Alex Review"];
    const old = Object.values(ids).map(
      (id) => result.packet.members.find((member) => member.agent_id === id)!,
    );
    const mapping = new Map(old.map((member, i) => [member.name, replacement[i]]));
    const replace = (text: string) => {
      for (const [before, after] of mapping) text = text.replaceAll(before, after);
      return scenario.family === "ambiguous" ? text.replaceAll("Raka", "Deva") : text;
    };
    result.packet.request = replace(result.packet.request);
    result.packet.history = result.packet.history.map((message) => ({
      ...message,
      text: replace(message.text),
    }));
    for (const member of result.packet.members) member.name = mapping.get(member.name)!;
    for (const task of result.packet.interactions ?? []) task.request = replace(task.request);
  }
  result.id += `:${variant}`;
  return result;
}

export const datasetHash = () => hash(JSON.stringify(routingCases()));
