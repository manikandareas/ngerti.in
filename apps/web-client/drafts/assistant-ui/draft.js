// Disposable draft: local UI transitions only. No backend commands or persistence.

import { computerBubble, computerScreen } from "./computer.js";
import { icons } from "./icons.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const icon = (name) => icons[name] ?? "";
const iconButton = (name, label, action, extra = "") =>
  `<button type="button" class="icon-button ${extra}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" data-action="${action}">${icon(name)}</button>`;
const avatar = (extra = "") => `<span class="avatar ${extra}" aria-hidden="true"></span>`;
const mark = (index = 0) =>
  `<span class="source-mark ${index % 3 === 1 ? "blue" : index % 3 === 2 ? "orange" : ""}" aria-hidden="true">${index % 3 === 0 ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 5a4 4 0 0 1 8 0H4Zm1 2h6l-3 7-3-7Z"/></svg>' : index % 3 === 1 ? '<svg viewBox="0 0 16 16" fill="none"><path d="m2 11 4-4 3 2 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 8h3v6H2zm5-5h3v11H7zm5 3h3v8h-3z"/></svg>'}</span>`;

const scenarios = [
  {
    id: "composer",
    label: "Send & Stop",
    icon: "ArrowUp02",
    title: "Composer mengikuti niat pengguna",
    description: "Saat agent aktif: kosong menjadi Stop, mulai mengetik menjadi Send.",
    rule: "Mengetik tidak menghentikan agent. Menghapus seluruh draft mengembalikan tombol Stop selama agent masih aktif. Berlaku sama di DM dan grup.",
  },
  {
    id: "failed",
    label: "Pesan & retry",
    icon: "Refresh",
    title: "Aksi dekat dengan pesan",
    description: "Hover pesan untuk menyalin, mencoba lagi, atau mengedit pesan pengguna.",
    rule: "Try again muncul saat pesan di-hover atau difokuskan. Respons lama diganti aktivitas agent pada posisinya. Pada layar sentuh, ketuk pesan untuk membuka aksi.",
  },
  {
    id: "question",
    label: "Pertanyaan opsi",
    icon: "MoreHorizontal",
    title: "Satu kartu untuk semua pertanyaan opsi",
    description: "Pertanyaan produk maupun native memakai komposisi dan interaksi yang sama.",
    rule: "Pilih opsi atau tulis pilihan lain. Setelah dikirim, kartu hilang dan percakapan berlanjut tanpa bar atau centang “jawaban tersimpan”.",
  },
  {
    id: "text",
    label: "Pertanyaan teks",
    icon: "Edit02",
    title: "Tanyakan langsung dalam percakapan",
    description: "Pertanyaan tanpa opsi menjadi pesan biasa. Jawab lewat composer.",
    rule: "Tidak ada kartu dengan isian teks tambahan. Composer tetap menjadi tempat untuk menulis jawaban.",
  },
  {
    id: "approval",
    label: "Persetujuan",
    icon: "Tick02",
    title: "Keputusan dengan tindakan yang jelas",
    description: "Persetujuan memakai kartu yang sama, dengan konteks dan tombol keputusan.",
    rule: "Footer hanya berisi Tolak dan Setujui di sisi kanan. Setelah dipilih, kartu menghilang dan assistant melanjutkan tanpa indikator jawaban tersimpan.",
  },
  {
    id: "files",
    label: "File & lampiran",
    icon: "Attachment01",
    title: "Lampiran sebagai aksi yang ringan",
    description: "Chip netral dengan ikon tipe file dan petunjuk untuk membuka dokumen.",
    rule: "Warna hanya membantu mengenali tipe file pada ikon kecil. Permukaan chip dan teksnya tetap netral, termasuk saat berada di bubble assistant.",
  },
  {
    id: "computer",
    label: "Computer use",
    icon: "Computer",
    title: "Computer hadir di dalam percakapan",
    description:
      "Bubble persiapan berubah menjadi layar saat machine siap, lalu mengikuti aktivitas agent.",
    rule: "Layar muncul otomatis setelah persiapan. Open computer membuka tampilan yang lebih besar. Seluruh aktivitas dan layar di sini adalah simulasi lokal.",
  },
  {
    id: "sources",
    label: "Citation & sumber",
    icon: "Search01",
    title: "Sumber mengikuti isi jawaban",
    description: "Citation ringkas di dalam kalimat, lalu kumpulan sumber di akhir jawaban.",
    rule: "Klik citation untuk membuka sumber terkait. Klik “10 sumber” untuk melihat seluruh referensi. Ikon sumber ditumpuk tanpa menambah deretan aksi lain.",
  },
];
const questions = [
  {
    title: "Berapa varian rasa yang ingin kita luncurkan?",
    choices: ["Tiga rasa utama", "Lima rasa sekaligus", "Satu rasa unggulan"],
  },
  {
    title: "Apa fokus utama peluncuran ini?",
    choices: ["Mengenalkan rasa baru", "Meningkatkan penjualan", "Menguji minat pelanggan"],
  },
  {
    title: "Di mana kita akan mulai menjualnya?",
    choices: ["Toko utama", "Semua cabang", "Pesanan online"],
  },
];
const sources = [
  [
    "Penjualan per rasa · Oktober",
    "analytics.scoop.example",
    "Penjualan pistachio pada data contoh meningkat 23% dibanding September. Margin kotor 8 poin lebih tinggi dari vanilla.",
  ],
  [
    "Tren permintaan stone-fruit",
    "insights.scoop.example",
    "Ringkasan contoh tren permintaan untuk pistachio dan rasa berbasis stone-fruit.",
  ],
  [
    "Margin produk per cabang",
    "finance.scoop.example",
    "Perbandingan margin setelah memperhitungkan bahan baku dan volume penjualan.",
  ],
  [
    "Stok dan kecepatan penjualan",
    "inventory.scoop.example",
    "Ringkasan stok saat ini dan proyeksi kebutuhan untuk minggu berikutnya.",
  ],
  [
    "Rasa favorit pelanggan",
    "feedback.scoop.example",
    "Rekap masukan pelanggan dari seluruh cabang.",
  ],
  [
    "Riwayat promosi Oktober",
    "marketing.scoop.example",
    "Daftar promosi yang berpengaruh pada penjualan bulan ini.",
  ],
  [
    "Penjualan per rasa · September",
    "analytics.scoop.example",
    "Data pembanding dari periode sebelumnya.",
  ],
  [
    "Biaya bahan baku terbaru",
    "finance.scoop.example",
    "Rangkuman biaya bahan pada kumpulan data contoh.",
  ],
  [
    "Laporan transaksi harian",
    "reports.scoop.example",
    "Jumlah transaksi dan volume pembelian rata-rata.",
  ],
  [
    "Ringkasan performa cabang",
    "reports.scoop.example",
    "Perbandingan performa tiap cabang pada periode yang sama.",
  ],
];
const params = new URLSearchParams(location.search);
let scenario = scenarios.find((item) => item.id === params.get("case")) ?? scenarios[0];
let mode = params.get("mode") === "group" ? "group" : "dm";
let theme = params.get("theme") === "dark" ? "dark" : "light";
let state;
let toastTimer;
let responseTimer;
let computerTimer;
let nextMessage = 0;
const actionCloseTimers = new WeakMap();

function message(role, text, extra = {}) {
  return { id: `draft-message-${++nextMessage}`, role, text, ...extra };
}

function resetScenario() {
  clearTimeout(responseTimer);
  clearTimeout(computerTimer);
  state = {
    running: false,
    activityIndex: null,
    draft: "",
    step: 0,
    answers: ["", "", ""],
    questionCount: 3,
    cardOpen: false,
    computer: { stage: "starting", step: 0, ready: false },
    selectedSource: null,
    editing: null,
    messages: [],
  };
  switch (scenario.id) {
    case "composer":
      state.messages = [message("user", "Bantu siapkan peluncuran rasa baru untuk bulan depan.")];
      state.running = true;
      break;
    case "failed":
      state.messages = [
        message("user", "Buatkan draf email singkat untuk mengirim proposal peluncuran."),
        message(
          "assistant",
          "Ini drafnya.\n\nSubjek: Proposal Peluncuran Rasa Baru\n\nHalo tim,\n\nBerikut rencana peluncuran rasa baru untuk bulan depan. Kita akan memulai dari tiga rasa utama dengan evaluasi penjualan setiap minggu.",
          { failed: true },
        ),
      ];
      break;
    case "question":
      state.messages = [
        message("user", "Bantu susun rencana peluncuran rasa baru."),
        message("assistant", "Sebelum menyusun rencananya, kita tentukan tiga hal ini dulu."),
      ];
      state.cardOpen = true;
      break;
    case "text":
      state.messages = [
        message("user", "Tolong buatkan proposal untuk calon mitra kita."),
        message("assistant", "Siapa nama penerima proposal ini?"),
      ];
      break;
    case "approval":
      state.messages = [
        message("user", "Cek kebutuhan waffle cone untuk minggu depan."),
        message(
          "assistant",
          "Stok saat ini cukup untuk tiga hari. Saya sarankan menambah 250 waffle cone untuk kebutuhan minggu depan.",
        ),
      ];
      state.cardOpen = true;
      break;
    case "files":
      state.messages = [
        message("user", "Siapkan panduan onboarding untuk tim toko."),
        message(
          "assistant",
          "Panduan onboarding sudah siap. Kamu bisa membuka SOP, daftar stok, dan draf pengumumannya di bawah.",
          { files: true },
        ),
      ];
      break;
    case "sources":
      state.messages = [
        message("user", "Rasa apa yang paling potensial untuk kita prioritaskan?"),
        message(
          "assistant",
          "Pistachio adalah rasa dengan pertumbuhan tercepat — penjualannya naik 23% bulan ini dan marginnya 8 poin di atas vanilla.",
          { research: true },
        ),
      ];
      break;
    case "computer":
      state.messages = [message("user", "Buka browser dan cek stok waffle cone dari pemasok.")];
      state.running = true;
      break;
  }
  $("#composer-input").value = "";
  $("#document-dialog").close();
  $("#computer-dialog").close();
  render();
  if (scenario.id === "computer") computerTimer = setTimeout(startComputer, 4000);
}

function updateUrl() {
  const search = new URLSearchParams({ case: scenario.id, mode, theme });
  history.replaceState(null, "", `${location.pathname}?${search}`);
}

function render() {
  document.documentElement.dataset.theme = theme;
  $(".conversation-frame").dataset.mode = mode;
  $("#theme-button").innerHTML = icon(theme === "light" ? "Moon02" : "Sun03");
  const themeLabel = `Gunakan tema ${theme === "light" ? "gelap" : "terang"}`;
  $("#theme-button").setAttribute("aria-label", themeLabel);
  $("#theme-button").title = themeLabel;
  $("#scenario-nav").innerHTML = scenarios
    .map(
      (item) =>
        `<a class="scenario-link" data-case="${item.id}" href="?case=${item.id}&mode=${mode}&theme=${theme}" ${item.id === scenario.id ? 'aria-current="page"' : ""}>${icon(item.icon)}${item.label}</a>`,
    )
    .join("");
  $("#scenario-title").textContent = scenario.title;
  $("#scenario-description").textContent = scenario.description;
  $("#scenario-rule").textContent = scenario.rule;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  $("#chat-header").innerHTML =
    `${mode === "group" ? `<span class="avatar-stack">${avatar()}${avatar("avatar-teal")}</span>` : avatar()}<div><strong>${mode === "group" ? "Peluncuran Scoop" : "Tobi"}</strong><small>${mode === "group" ? "Kamu, Tobi, dan Skinny" : "Assistant kamu"}</small></div>${mode === "group" ? '<span class="group-label">Grup</span>' : ""}`;
  $("#composer-context").textContent = mode === "group" ? "Peluncuran Scoop" : "Tobi";
  renderThread();
  renderControls();
  updateComposer();
  renderSources();
  updateUrl();
}

function renderThread() {
  const activity =
    state.running && scenario.id !== "computer"
      ? `<div class="agent-activity">${avatar()}<span>Tobi is working…</span></div>`
      : "";
  let content = state.messages
    .map((item, index) => `${state.activityIndex === index ? activity : ""}${renderMessage(item)}`)
    .join("");
  if (state.cardOpen && scenario.id === "question") content += renderQuestion();
  if (state.cardOpen && scenario.id === "approval") content += renderApproval();
  if (scenario.id === "computer")
    content += `<article class="assistant-computer" data-stage="${state.computer.stage}" data-ready="${state.computer.ready}" aria-label="Computer Tobi">${avatar()}<div class="computer-bubble">${computerBubble(state.computer)}</div></article>`;
  if (state.activityIndex === null || state.activityIndex >= state.messages.length)
    content += activity;
  $("#thread").innerHTML = content;
  const scroll = $("#thread-scroll");
  scroll.scrollTop = scroll.scrollHeight;
}

function renderMessage(item) {
  const text = escapeHtml(item.text)
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
  let body = text;
  if (item.files)
    body += `<div class="file-list">${fileChip("pdf", "Dairy Onboarding SOP.pdf")}${fileChip("csv", "Stok awal.csv")}${fileChip("docx", "Draf pengumuman.docx")}</div>`;
  if (item.research)
    body = `<div class="research-copy"><p>${escapeHtml(item.text)} ${citation(0, "scoopdata.io")} Tren rasa berbasis stone-fruit juga bergerak ke arah yang sama. ${citation(1, "insights.scoop")}</p><p>Saya sarankan menjadikan pistachio sebagai rasa unggulan, sambil menguji satu rasa musiman dalam jumlah kecil.</p></div><button class="sources-trigger" type="button" data-action="open-sources"><span class="source-stack">${mark(0)}${mark(1)}${mark(2)}</span>10 sumber</button>`;
  return `<article class="message ${item.role} ${item.failed ? "failed" : ""}" data-message-id="${item.id}" tabindex="0" aria-label="Pesan ${item.role === "user" ? "kamu" : "Tobi"}">${item.role === "assistant" ? avatar() : ""}<div class="message-content"><div class="bubble">${item.role === "assistant" && mode === "group" ? '<div class="sender">Tobi</div>' : ""}${body}<p class="timestamp">12.30</p></div>${item.failed ? `<p class="failure-note">${icon("AlertCircle")}Respons belum selesai.</p>` : ""}</div><div class="message-actions" aria-label="Aksi pesan">${iconButton("Copy01", "Salin pesan", "copy-message", "copy-action")}${iconButton("Refresh", "Try again", "retry-message", "retry-action")}${item.role === "user" ? iconButton("Edit02", "Edit pesan", "edit-message") : ""}</div></article>`;
}

// Both question and approval use this single card composition.
function interactionCard({ title, body, footer, kind }) {
  return `<div class="assistant-interaction">${avatar()}<section class="interaction-card ${kind}-card" aria-labelledby="interaction-title"><header><h3 id="interaction-title">${escapeHtml(title)}</h3></header><div class="interaction-body">${body}</div><footer>${footer}</footer></section></div>`;
}

function renderQuestion() {
  const question = questions[state.step];
  const answer = state.answers[state.step];
  const other = question.choices.includes(answer) ? "" : answer;
  const body = `<fieldset><legend class="visually-hidden">${escapeHtml(question.title)}</legend>${question.choices.map((choice, index) => `<label class="question-option"><input type="radio" name="draft-answer" value="${escapeHtml(choice)}" data-choice="${index}" ${choice === answer ? "checked" : ""}><span>${escapeHtml(choice)}</span></label>`).join("")}</fieldset><input class="question-other" id="question-other" aria-label="Pilihan lain" placeholder="Pilihan lain…" value="${escapeHtml(other)}">`;
  const footer = `<div class="stepper">${state.questionCount > 1 ? `<button type="button" class="icon-button" data-action="previous-question" aria-label="Pertanyaan sebelumnya" ${state.step === 0 ? "disabled" : ""}>${icon("ArrowLeft01")}</button><span>${state.step + 1}/${state.questionCount}</span>` : "<span>1 pertanyaan</span>"}</div><div class="card-actions"><button type="button" class="pill-button" data-action="skip-question">Lewati</button><button type="button" class="pill-button primary" id="question-next" data-action="next-question" ${!answer.trim() ? "disabled" : ""}>${state.step === state.questionCount - 1 ? "Kirim jawaban" : "Lanjut"}</button></div>`;
  return interactionCard({ title: question.title, body, footer, kind: "question" });
}

function renderApproval() {
  const body =
    '<p class="approval-description">Pesan ulang 250 waffle cone dari <span class="entity-chip"><span class="entity-logo">C</span>Cone King</span> dengan waktu pengiriman <span class="lead-time">7 hari</span>.</p>';
  const footer =
    '<div class="card-actions"><button type="button" class="pill-button outlined" aria-label="Tolak pesanan" data-action="reject">Tolak</button><button type="button" class="pill-button primary" aria-label="Setujui pesanan" data-action="approve">Setujui</button></div>';
  return interactionCard({
    title: "Pesan ulang waffle cone sekarang?",
    body,
    footer,
    kind: "approval",
  });
}

function updateComputer() {
  const card = $(".assistant-computer");
  if (!card) return;
  const scroll = $("#thread-scroll");
  const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 32;
  card.dataset.stage = state.computer.stage;
  card.dataset.ready = state.computer.ready;
  const bubble = card.querySelector(".computer-bubble");
  // Preserve the same bubble; only its contents expand after the machine is ready.
  if (state.computer.stage !== "starting" && bubble.querySelector(".machine-screen")) {
    const screen = bubble.querySelector(".machine-screen");
    screen.dataset.step = state.computer.step;
    screen.dataset.working = state.computer.stage === "working";
    const nextScreen = document.createElement("template");
    nextScreen.innerHTML = computerScreen(state.computer);
    screen.querySelector(".machine-browser-bar").innerHTML =
      nextScreen.content.querySelector(".machine-browser-bar").innerHTML;
    screen.querySelector(".machine-page").innerHTML =
      nextScreen.content.querySelector(".machine-page").innerHTML;
    screen.setAttribute(
      "aria-label",
      nextScreen.content.firstElementChild.getAttribute("aria-label"),
    );
    bubble.querySelector(".computer-card-heading p").textContent = {
      working: "Working",
      finished: "Finished",
      stopped: "Stopped",
    }[state.computer.stage];
  } else bubble.innerHTML = computerBubble(state.computer);
  if (atBottom) scroll.scrollTop = scroll.scrollHeight;
  if ($("#computer-dialog").open)
    $("#computer-expanded").innerHTML = computerScreen(state.computer);
  renderControls();
  updateComposer();
}

function startComputer() {
  clearTimeout(computerTimer);
  if (scenario.id !== "computer") return;
  state.computer = { stage: "working", step: 0, ready: true };
  state.running = true;
  updateComputer();
  computerTimer = setTimeout(advanceComputer, 3500);
}

function advanceComputer() {
  clearTimeout(computerTimer);
  if (scenario.id !== "computer" || state.computer.stage !== "working") return;
  state.computer.step = (state.computer.step + 1) % 3;
  updateComputer();
  computerTimer = setTimeout(advanceComputer, 3500);
}

function stopComputer(stage = "stopped") {
  clearTimeout(computerTimer);
  state.running = false;
  state.computer.stage = stage;
  updateComputer();
}

function fileChip(type, name) {
  const colors = { pdf: "#bd3c40", csv: "#2b7750", docx: "#316db6" };
  const fileIcon = `<svg class="filetype" viewBox="0 0 22 26" aria-hidden="true"><path d="M4 1h9l6 6v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="${colors[type]}"/><path d="M13 1v6h6" fill="#ffffff50"/><text x="10.5" y="18" fill="white" font-family="Arial,sans-serif" text-anchor="middle" font-size="${type === "docx" ? "5.5" : "6.5"}" font-weight="700">${type.toUpperCase()}</text></svg>`;
  return `<button type="button" class="file-chip" data-file="${type}" aria-label="Buka ${name}">${fileIcon}<span class="file-label">${name}</span>${icon("ArrowUpRight01")}</button>`;
}

function citation(index, label) {
  return `<button type="button" class="citation" data-citation="${index}" aria-label="Lihat sumber: ${escapeHtml(label)}">${mark(index)}${escapeHtml(label)}</button>`;
}

function renderSources() {
  const panel = $("#sources-panel");
  panel.hidden = state.selectedSource === null;
  if (panel.hidden) return;
  panel.innerHTML = `<header><h3 id="sources-title" tabindex="-1">10 sumber</h3>${iconButton("Cancel01", "Tutup sumber", "close-sources")}</header><p>Referensi contoh untuk draft ini.</p><div class="sources-list">${sources.map(([title, domain], index) => `<button type="button" class="source-row ${state.selectedSource === index ? "selected" : ""}" data-source-detail="${index}">${mark(index)}<span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(domain)}</small></span></button>`).join("")}</div>`;
  if (state.selectedSource >= 0)
    panel.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function renderControls() {
  let controls = "";
  if (scenario.id === "composer" || scenario.id === "failed")
    controls =
      '<button type="button" data-action="simulate-failure">Simulasikan gagal</button><button type="button" data-action="finish">Selesaikan respons</button>';
  if (scenario.id === "question")
    controls = `<button type="button" data-action="toggle-question-count">${state.questionCount === 3 ? "Coba satu pertanyaan" : "Coba tiga pertanyaan"}</button>`;
  if (scenario.id === "computer")
    controls =
      state.computer.stage === "starting"
        ? '<button type="button" data-action="start-computer">Machine siap</button>'
        : state.computer.stage === "working"
          ? '<button type="button" data-action="next-computer-step">Langkah berikutnya</button><button type="button" data-action="finish-computer">Selesaikan aktivitas</button>'
          : '<button type="button" data-action="start-computer">Lanjutkan aktivitas</button>';
  $("#scenario-controls").innerHTML = controls;
}

function updateComposer() {
  const dirty = state.draft.length > 0;
  const stopping = state.running && !dirty;
  const button = $("#send-button");
  const label = stopping ? "Hentikan respons" : state.editing ? "Kirim perubahan" : "Kirim pesan";
  button.innerHTML = icon(stopping ? "Stop" : "ArrowUp02");
  button.dataset.action = stopping ? "stop" : "send";
  button.disabled = !stopping && !state.draft.trim();
  button.setAttribute("aria-label", label);
  button.title = label;
  $("#composer-input").placeholder = state.editing
    ? "Edit pesan kamu…"
    : scenario.id === "text"
      ? "Tulis jawabanmu…"
      : "Tulis pesan…";
  $("#composer-hint").textContent = state.editing
    ? "Perubahan hanya berlaku di draft ini."
    : "Enter untuk kirim · Shift + Enter untuk baris baru";
  let status = state.running
    ? `Agent aktif · Composer ${dirty ? "terisi → Send" : "kosong → Stop"}`
    : `Agent tidak aktif · ${dirty ? "Siap dikirim" : "Send nonaktif"}`;
  if (state.cardOpen && scenario.id === "question")
    status = `Pertanyaan ${state.step + 1}/${state.questionCount} · ${state.answers.filter(Boolean).length} terisi`;
  if (state.cardOpen && scenario.id === "approval")
    status = "Menunggu keputusan · Tidak ada isian teks";
  if (scenario.id === "computer")
    status = `Machine: ${state.computer.stage} · Layar ${state.computer.ready ? "tersedia" : "belum tampil"}`;
  $("#state-label").textContent = status;
}

function submitComposer() {
  if (state.running && state.draft.length === 0) {
    clearTimeout(responseTimer);
    if (scenario.id === "computer") {
      stopComputer();
      return;
    }
    state.running = false;
    renderThread();
    updateComposer();
    return;
  }
  const text = state.draft.trim();
  if (!text) return;
  if (state.editing) {
    const item = state.messages.find((item) => item.id === state.editing);
    if (item) item.text = text;
    state.editing = null;
  } else state.messages.push(message("user", text));
  state.draft = "";
  $("#composer-input").value = "";
  $("#composer-input").style.height = "auto";
  state.running = true;
  state.activityIndex = null;
  renderThread();
  updateComposer();
  if (scenario.id === "text") {
    clearTimeout(responseTimer);
    responseTimer = setTimeout(() => {
      state.running = false;
      state.messages.push(
        message(
          "assistant",
          `Baik, proposalnya akan saya tujukan kepada ${text}. Saya lanjutkan dengan draf pembukaannya.`,
        ),
      );
      renderThread();
      updateComposer();
    }, 900);
  }
}

function advanceQuestion(skip = false) {
  if (!skip && !state.answers[state.step].trim()) return;
  if (skip) state.answers[state.step] = "";
  if (state.step < state.questionCount - 1) state.step++;
  else {
    state.cardOpen = false;
    const first = state.answers[0];
    state.messages.push(
      message(
        "assistant",
        first
          ? `Baik, kita mulai dengan ${first.toLowerCase()}. Saya akan menyusun rencana peluncurannya sesuai pilihanmu.`
          : "Baik, saya buatkan rencana awal yang bisa kita sesuaikan bersama.",
      ),
    );
  }
  renderThread();
  updateComposer();
}

function showToast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 1600);
}

function openFile(type) {
  const samples = {
    pdf: [
      "Dairy Onboarding SOP.pdf",
      "<h3>Panduan onboarding tim toko</h3><p>Selamat datang di tim Scoop. Gunakan panduan ini untuk menyiapkan shift pertamamu.</p><ol><li>Periksa kebersihan area kerja dan alat penyajian.</li><li>Catat suhu freezer sebelum toko dibuka.</li><li>Cocokkan stok awal dengan daftar inventaris.</li><li>Siapkan label rasa dan informasi alergen.</li><li>Lakukan serah terima stok di akhir shift.</li></ol>",
    ],
    csv: [
      "Stok awal.csv",
      "<table><thead><tr><th>Produk</th><th>Jumlah</th><th>Satuan</th></tr></thead><tbody><tr><td>Waffle cone</td><td>250</td><td>pcs</td></tr><tr><td>Paper cup</td><td>180</td><td>pcs</td></tr><tr><td>Sendok</td><td>200</td><td>pcs</td></tr></tbody></table>",
    ],
    docx: [
      "Draf pengumuman.docx",
      "<h3>Pelatihan tim toko</h3><p>Halo tim,</p><p>Kita akan mengadakan pelatihan onboarding pada Senin pukul 09.00. Silakan membaca SOP sebelum sesi dimulai.</p><p>Terima kasih dan sampai bertemu!</p>",
    ],
  };
  const [title, content] = samples[type];
  $("#document-title").textContent = title;
  $("#document-content").innerHTML = content;
  $("#document-dialog").showModal();
}

$("#composer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitComposer();
});
$("#composer-input").addEventListener("input", (event) => {
  state.draft = event.target.value;
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 108)}px`;
  updateComposer();
});
$("#composer-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (state.draft.trim()) submitComposer();
  }
});
$("#theme-button").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  render();
});
$("#reset-button").addEventListener("click", resetScenario);

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-choice]")) {
    state.answers[state.step] = event.target.value;
    $("#question-other").value = "";
    $("#question-next").disabled = false;
    updateComposer();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "question-other") {
    state.answers[state.step] = event.target.value;
    document.querySelectorAll("[data-choice]").forEach((choice) => {
      choice.checked = false;
    });
    $("#question-next").disabled = !event.target.value.trim();
    updateComposer();
  }
});

// Keep the action target reachable across a slightly diagonal pointer path.
document.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch") return;
  const message = event.target.closest(".message");
  if (!message) return;
  clearTimeout(actionCloseTimers.get(message));
  message.classList.add("actions-open");
});
document.addEventListener("pointerout", (event) => {
  if (event.pointerType === "touch") return;
  const message = event.target.closest(".message");
  if (!message || message.contains(event.relatedTarget)) return;
  clearTimeout(actionCloseTimers.get(message));
  actionCloseTimers.set(
    message,
    setTimeout(() => message.classList.remove("actions-open"), 180),
  );
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a[data-case]");
  if (!target) return;
  if (target.dataset.case) {
    event.preventDefault();
    scenario = scenarios.find((item) => item.id === target.dataset.case);
    resetScenario();
    return;
  }
  if (target.dataset.mode) {
    mode = target.dataset.mode;
    render();
    return;
  }
  if (target.dataset.file) {
    openFile(target.dataset.file);
    return;
  }
  if (target.dataset.citation !== undefined) {
    state.selectedSource = Number(target.dataset.citation);
    renderSources();
    $("#sources-title").focus();
    return;
  }
  if (target.dataset.sourceDetail !== undefined) {
    const index = Number(target.dataset.sourceDetail);
    state.selectedSource = index;
    renderSources();
    $("#document-title").textContent = sources[index][0];
    $("#document-content").innerHTML =
      `<p>${escapeHtml(sources[index][2])}</p><p><small>${escapeHtml(sources[index][1])} · Data contoh lokal</small></p>`;
    $("#document-dialog").showModal();
    return;
  }
  const action = target.dataset.action;
  const item = state.messages.find(
    (item) => item.id === target.closest("[data-message-id]")?.dataset.messageId,
  );
  switch (action) {
    case "copy-message":
      if (item) {
        await navigator.clipboard.writeText(item.text);
        showToast("Pesan disalin");
      }
      break;
    case "retry-message":
      clearTimeout(responseTimer);
      if (!item) break;
      if (item.role === "assistant") {
        state.activityIndex = state.messages.indexOf(item);
        state.messages.splice(state.activityIndex, 1);
      } else {
        const promptIndex = state.messages.indexOf(item);
        const nextPrompt = state.messages.findIndex(
          (candidate, index) => index > promptIndex && candidate.role === "user",
        );
        const count = (nextPrompt === -1 ? state.messages.length : nextPrompt) - promptIndex - 1;
        state.messages.splice(promptIndex + 1, count);
        state.activityIndex = promptIndex + 1;
      }
      state.running = true;
      state.cardOpen = false;
      renderThread();
      updateComposer();
      break;
    case "edit-message":
      if (item) {
        state.editing = item.id;
        state.draft = item.text;
        $("#composer-input").value = item.text;
        $("#composer-input").focus();
        updateComposer();
      }
      break;
    case "simulate-failure": {
      clearTimeout(responseTimer);
      state.running = false;
      let last = state.messages.at(-1);
      if (last.role !== "assistant") {
        last = message(
          "assistant",
          "Saya sudah mulai menyusun rencana peluncurannya. Berikut garis besar tahap pertama…",
        );
        state.messages.push(last);
      }
      last.failed = true;
      renderThread();
      updateComposer();
      break;
    }
    case "finish": {
      clearTimeout(responseTimer);
      state.running = false;
      state.messages.forEach((item) => {
        item.failed = false;
      });
      const response = message(
        "assistant",
        "Rencana awalnya siap: pilih tiga rasa utama, lakukan uji coba selama dua minggu, lalu evaluasi penjualan sebelum memperluas peluncuran.",
      );
      if (state.activityIndex === null) state.messages.push(response);
      else state.messages.splice(state.activityIndex, 0, response);
      state.activityIndex = null;
      renderThread();
      updateComposer();
      break;
    }
    case "next-question":
      advanceQuestion();
      break;
    case "skip-question":
      advanceQuestion(true);
      break;
    case "previous-question":
      if (state.step > 0) state.step--;
      renderThread();
      updateComposer();
      break;
    case "toggle-question-count":
      state.questionCount = state.questionCount === 3 ? 1 : 3;
      state.step = 0;
      state.answers = ["", "", ""];
      state.cardOpen = true;
      renderThread();
      renderControls();
      updateComposer();
      break;
    case "start-computer":
      startComputer();
      break;
    case "next-computer-step":
      advanceComputer();
      break;
    case "finish-computer":
      stopComputer("finished");
      break;
    case "open-computer":
      $("#computer-expanded").innerHTML = computerScreen(state.computer);
      $("#computer-dialog").showModal();
      break;
    case "close-computer":
      $("#computer-dialog").close();
      break;
    case "approve":
    case "reject":
      state.cardOpen = false;
      state.messages.push(
        message(
          "assistant",
          action === "approve"
            ? "Baik, saya lanjutkan penyiapan pesanan 250 waffle cone sesuai pilihanmu."
            : "Baik, pesanan tidak dilanjutkan. Kita bisa meninjau kebutuhan stoknya lagi nanti.",
        ),
      );
      renderThread();
      updateComposer();
      break;
    case "open-sources":
      state.selectedSource = -1;
      renderSources();
      $("#sources-title").focus();
      break;
    case "close-sources":
      state.selectedSource = null;
      renderSources();
      $(".sources-trigger")?.focus();
      break;
    case "close-document":
      $("#document-dialog").close();
      break;
  }
});

document.querySelectorAll("[data-icon]").forEach((element) => {
  element.innerHTML = icon(element.dataset.icon);
});
resetScenario();
