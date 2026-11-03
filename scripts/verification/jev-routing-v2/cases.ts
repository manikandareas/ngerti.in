import type { RoutingPacket } from "../../../apps/server/src/groups/router";

export type RoutingCase = {
  id: string;
  category: string;
  split: "calibration" | "held_out";
  expected: string | null;
  packet: RoutingPacket;
};
type Template = {
  category: string;
  text: (names: string[]) => string;
  expected: number | null;
  previous?: number;
};
const templates: Template[] = [];
function add(
  category: string,
  expected: number | null,
  texts: ((names: string[]) => string)[],
  previous?: number,
) {
  for (const text of texts) templates.push({ category, expected, text, previous });
}
add("direct", 0, [
  (n) => `${n[0]}, sapa aku dong.`,
  (n) => `${n[0].toUpperCase()}, bantu cari sumber resminya.`,
  (n) => `Tolong ${n[0]} yang kerjakan permintaan ini.`,
  (n) => `${n[0].split(" ")[0].toLowerCase()}, jawab pertanyaanku ya.`,
  (n) => `Please have ${n[0]} handle this one.`,
  (n) => `Bisa ${n[0]} bantu jelaskan istilah ini?`,
  (n) => `${n[0]}, lanjutkan pekerjaanmu.`,
  (n) => `For ${n[0]}: answer with a short greeting.`,
  (n) => `Aku mau minta bantuan ${n[0]}, bukan yang lain.`,
  (n) => `Hey ${n[0].split(" ")[0]}, can you say hello?`,
]);
add("delegation", 0, [
  (n) => `${n[0].split(" ")[0].toLowerCase()} suruh ${n[1].toLowerCase()} say hi ke aku`,
  (n) => `${n[0]}, minta ${n[1]} menyapa saya.`,
  (n) => `${n[0]}, ask ${n[1]} to review the draft.`,
  (n) => `${n[0]}, delegasikan penulisan artikel ini ke ${n[1]}.`,
  (n) => `${n[0]}, tolong hubungi ${n[1]} supaya dia menjawab.`,
  (n) => `Please have ${n[0]} ask ${n[1]} to explain the result.`,
  (n) => `${n[0]} bisa minta ${n[1]} kirim sapaan singkat?`,
  (n) => `${n[0]}, teruskan permintaan ini ke ${n[1]}.`,
  (n) => `I'd like ${n[0]} to hand this work to ${n[1]}.`,
  (n) => `${n[0].split(" ")[0]}, bilang ke ${n[1]} aku butuh bantuannya.`,
]);
add(
  "follow_up",
  2,
  [
    () => "Tolong periksa lagi klaim terakhir.",
    () => "Lanjutkan review yang tadi.",
    () => "Continue your previous verification.",
    () => "Ada koreksi lain dari pemeriksaanmu?",
    () => "Check that final calculation again.",
    () => "Yang tadi ditandai salah, jelaskan lebih rinci.",
    () => "Coba verifikasi sekali lagi hasil itu.",
    () => "Please finish the review you were doing.",
    () => "Bisa lanjutkan pemeriksaan yang belum selesai?",
    () => "Teruskan analisis kekeliruan tadi.",
  ],
  2,
);
add("role", 1, [
  () => "Tulis artikel dari riset yang sudah tersedia.",
  () => "Rewrite this paragraph in a warmer tone.",
  () => "Buat caption singkat untuk peluncuran produk.",
  () => "Polish the wording of this announcement.",
  () => "Ringkas poin yang disepakati menjadi email.",
  () => "Edit draf ini supaya lebih mudah dibaca.",
  () => "Write a short introduction using the facts above.",
  () => "Susun ulang tulisan ini tanpa mengubah faktanya.",
  () => "Turn the available notes into a clear report.",
  () => "Bikin paragraf penutup yang lebih natural.",
]);
add("negation", 1, [
  (n) => `Jangan pilih ${n[0]}. ${n[1]}, kerjakan ini.`,
  (n) => `Not ${n[0]}; ${n[1]}, please answer.`,
  (n) => `Kalimat '${n[0]}, jawab ini' cuma kutipan. Permintaan saya untuk ${n[1]}.`,
  (n) => `${n[0]} sudah selesai. Sekarang ${n[1]} tolong bantu.`,
  (n) => `Aku membicarakan hasil ${n[0]}, tetapi yang kuminta menjawab adalah ${n[1]}.`,
]);
add("absent_recipient", null, [
  () => "Minta Agent Zefiro yang tidak ada di grup ini menjawab.",
  () => "Agent Zefiro, kerjakan ini sendiri.",
  () => "Route this directly to Agent Zefiro; nobody else should do it.",
  () => "Saya hanya ingin Agent Zefiro yang menjawab, jangan anggota grup ini.",
  () => "Please assign the request to Agent Zefiro, who is not in this group.",
]);

const cohorts = [
  ["Skinny Vicuna", "Tobi", "Nadia Reviewer"],
  ["Raka Pratama", "Maya Putri", "Nadia Utami"],
  ["Aruna", "Bayu", "Citra"],
  ["Alex Research", "Morgan Writer", "Sam Reviewer"],
];
export function routingCases(): RoutingCase[] {
  const ordinary: RoutingCase[] = cohorts.flatMap((names, cohort) =>
    templates.map((template, index) => {
      const ids = ["researcher", "writer", "reviewer"];
      const previous = template.previous;
      const packet: RoutingPacket = {
        group: { name: "Shared work", shared_instructions: "" },
        request: template.text(names),
        request_message_id: `case-${cohort}-${index}`,
        members: names.map((name, i) => ({
          agent_id: ids[i],
          name,
          handle: ids[i],
          soul: [
            "Researcher: find primary sources and gather factual evidence.",
            "Writer: draft and edit articles, captions, reports and correspondence from available facts.",
            "Reviewer: independently verify claims and calculations in existing work.",
          ][i],
          instructions: "",
        })),
        history:
          previous === undefined
            ? []
            : [
                {
                  id: "previous",
                  author: "agent",
                  agent_id: ids[previous],
                  text: "I am reviewing the completed report and verifying its final calculation; the review is not complete yet.",
                },
              ],
        active_tasks:
          previous === undefined
            ? []
            : [
                {
                  agent_id: ids[previous],
                  state: "working",
                  summary: "Verify the completed report and final calculation.",
                },
              ],
        attachments: [],
      };

      return {
        id: `cohort-${cohort}-${index}`,
        category: template.category,
        split: cohort === 0 ? "calibration" : "held_out",
        expected: template.expected === null ? null : ids[template.expected],
        packet,
      };
    }),
  );
  const extra: [string, number | null, number?][] = [
    ["Tobi minta Skinny Vicuna menyapaku", 1],
    ["Nadia Reviewer, ask Skinny Vicuna to ask Tobi to say hello", 2],
    ["skinny suruh tobi say hi ke aku", 0],
    ["Skinny Vicuna, minta Tobi menyapa, kemudian kamu tunggu hasilnya", 0],
    ["Bukan Skinny Vicuna. Tobi, minta Nadia Reviewer memeriksa hasilnya", 1],
    [
      "Aku mengutip 'Tobi, jawab sekarang'; yang sebenarnya kuminta bekerja adalah Skinny Vicuna",
      0,
    ],
    ["Tobi tidak perlu menjawab. Skinny Vicuna saja yang mengerjakan", 0],
    ["Ceritakan ke Tobi bahwa Nadia Reviewer sudah selesai; Skinny Vicuna tolong sampaikan", 0],
    ["Nadia Reviewer, audit hitungannya; Tobi hanya penulis draf", 2],
    ["Bikin tulisan penutup dari semua fakta yang sudah ada", 1],
    ["Cari referensi primer dan cocokkan sumber angkanya", 0],
    ["Verify the existing citations and mathematical claims independently", 2],
    ["Yang hasil review barusan, cocokkan lagi nomor halamannya", 2, 2],
    ["Lanjut riset yang tadi belum selesai", 0, 0],
    ["Pendekin paragraf yang baru kamu tulis", 1, 1],
    ["Please ask Agent Zefiro to do this, not any current member", null],
    ["Semua anggota di sini jangan mengerjakan; hanya Agent Zefiro yang kuminta", null],
    ["Skinny Vicuna, don't answer for Tobi; ask Tobi to greet me", 0],
    ["@Tobi, minta Skinny Vicuna bilang hi ke aku", 1],
    [
      "Skinny Vicuna yang mengoordinasikan, Tobi yang nanti menyapa. Silakan mulai Skinny Vicuna",
      0,
    ],
  ];
  const novel = extra.map(([text, expected, previous], index): RoutingCase => {
    const packet = structuredClone(ordinary[0].packet);
    packet.request = text;
    packet.request_message_id = `novel-${index}`;
    if (previous !== undefined) {
      packet.history = [
        {
          id: "recent",
          author: "agent",
          agent_id: packet.members[previous].agent_id,
          text: "I am still working on the requested task and have a preliminary result.",
        },
      ];
      packet.active_tasks = [
        { agent_id: packet.members[previous].agent_id, state: "working", summary: text },
      ];
    }
    if ([2, 3, 17, 18, 19].includes(index)) {
      packet.members[0].soul = "";
      packet.members[1].soul = "A thoughtful generalist";
    }
    return {
      id: `novel-${index}`,
      category: "novel_mixed",
      split: "held_out",
      expected: expected === null ? null : packet.members[expected].agent_id,
      packet,
    };
  });
  return [...ordinary, ...novel];
}
