export interface StudioState {
  id: string;
  label: string;
  description: string;
}

export interface StudioSection {
  id: string;
  label: string;
  description: string;
  placement: string;
  source: string;
  states: StudioState[];
}

const states = (items: [string, string, string][]): StudioState[] =>
  items.map(([id, label, description]) => ({ id, label, description }));

export const studioSections: StudioSection[] = [
  {
    id: "computer",
    label: "Computer",
    placement: "Sisi assistant dan panel Computer",
    description:
      "Persiapan tampil ringkas, aktivitas aktif memakai live preview, dan aktivitas selesai tetap berupa card ringkas.",
    source: "ComputerActivity · MachineScreen",
    states: states([
      ["preparing", "Menghubungkan", "Card persiapan tanpa gambar."],
      ["active", "Live preview", "Stream machine lokal yang terhubung, dalam mode view only."],
      ["completed", "Selesai", "Riwayat ringkas tanpa gambar atau koneksi viewer."],
    ]),
  },
  {
    id: "activity",
    label: "Aktivitas agent",
    placement: "Sisi assistant · DM dan grup",
    description:
      "Status singkat dengan avatar pada grup. DM tanpa avatar samping; animasi dan tindakan mengikuti kondisi kerja.",
    source: "AgentActivityBubble · activityPresentation",
    states: states([
      [
        "thinking",
        "Berpikir",
        "Copy berpikir dipilih stabil untuk setiap run. Avatar dan teks memakai animasi loading.",
      ],
      [
        "working",
        "Bekerja",
        "Status umum ketika agent bekerja tanpa kategori tool yang lebih spesifik.",
      ],
      ["searching", "Mencari web", "Pencarian ditampilkan sebagai aktivitas singkat."],
      ["reading", "Membaca file", "Agent membaca file yang relevan dengan pekerjaan."],
      ["updating", "Mengubah file", "Agent memperbarui file."],
      ["creating", "Membuat file", "Agent membuat file baru."],
      ["browsing", "Membuka halaman", "Agent membaca atau menelusuri halaman web."],
      ["asking_agent", "Meminta bantuan", "Agent tujuan disebut jika identitasnya diketahui."],
      [
        "queued",
        "Menunggu mulai",
        "Dapat muncul untuk pekerjaan lanjutan; antrean pesan biasa berada di area antrean.",
      ],
      ["preparing", "Menyiapkan", "Koneksi sedang disiapkan sebelum dispatch."],
      ["retrying", "Menghubungkan ulang", "Persiapan koneksi sedang dicoba ulang."],
      ["waiting", "Menunggu jawaban", "Pertanyaan tetap inline tanpa bubble status tambahan."],
      ["stopping", "Stop diminta", "Permintaan stop masih menunggu konfirmasi."],
      ["cancelled", "Sudah berhenti", "Penghentian sudah dikonfirmasi."],
      ["failed", "Gagal", "Kegagalan dengan petunjuk koneksi dan akses ke Settings."],
      ["blocked", "Tidak bisa mulai", "Persiapan terhambat; tersedia Try again dan Open settings."],
      ["unknown", "Hasil belum pasti", "Hasil perlu diperiksa dengan Check status."],
      ["offline", "Koneksi terputus", "Status reconnecting ketika koneksi aplikasi terputus."],
    ]),
  },
  {
    id: "routing",
    label: "Routing grup",
    placement: "Sisi assistant · grup",
    description:
      "Saat grup memilih penjawab, avatar gabungan mewakili anggota grup. Kendala routing memiliki pesan dan tindakan sendiri.",
    source: "WorkActivity",
    states: states([
      ["classifying", "Memilih penjawab", "Copy routing stabil selama satu proses pemilihan."],
      ["reviewing", "Meninjau pilihan", "Peninjauan routing tetap tampil sebagai aktivitas grup."],
      ["preparing", "Menyiapkan koneksi", "Koneksi penjawab sedang disiapkan."],
      ["retrying", "Mencoba koneksi", "Grup mencoba menyambungkan penjawab kembali."],
      [
        "blocked",
        "Koneksi terhambat",
        "Petunjuk dan ikon Try again tersedia saat hover atau fokus.",
      ],
      ["rejected", "Perlu klarifikasi", "Klarifikasi routing disertai tombol Try again."],
      ["unknown", "Belum terkonfirmasi", "Pemilihan penjawab belum dapat dikonfirmasi."],
    ]),
  },
  {
    id: "input",
    label: "Pertanyaan & keputusan",
    placement: "Sisi assistant · DM dan grup",
    description:
      "Pertanyaan dan review dijawab lewat composer. Persetujuan memakai kartu inline dengan tombol Tolak dan Setujui.",
    source: "HumanReplyCard · HumanReply",
    states: states([
      ["input", "Pertanyaan", "Pertanyaan berupa bubble; jawab lewat composer percakapan."],
      ["single", "Pilihan tunggal", "Pilih satu jawaban lalu tekan Continue."],
      ["multiple", "Beberapa pilihan", "Pilih satu atau beberapa jawaban sebelum mengirim."],
      ["custom", "Pilihan dan teks", "Pilih opsi yang tersedia atau tulis jawaban lain."],
      ["filled", "Sudah diisi", "Jawaban sudah diisi tetapi belum dikirim."],
      ["review", "Review", "Jawab permintaan tinjauan lewat composer."],
      ["approval", "Persetujuan", "Pilih Tolak atau Setujui pada kartu aplikasi yang sama."],
      [
        "approval-submitting",
        "Mengirim persetujuan",
        "Tombol dinonaktifkan saat keputusan dikirim.",
      ],
      [
        "approval-unconfirmed",
        "Persetujuan belum pasti",
        "Periksa keputusan yang sama tanpa mengirim ulang tindakan.",
      ],
      ["submitting", "Sedang dikirim", "Isian dan tombol dinonaktifkan selama pengiriman."],
      [
        "answered",
        "Sudah dijawab",
        "Pertanyaan tetap terlihat tanpa opsi, rincian, tombol atau receipt tambahan.",
      ],
      ["closed", "Sudah ditutup", "Permintaan yang sudah ditutup tidak menambah kartu status."],
      [
        "unconfirmed",
        "Belum terkonfirmasi",
        "Jawaban tersimpan terkunci sambil menunggu pemeriksaan status pengiriman.",
      ],
      ["error", "Pengiriman gagal", "Pesan kesalahan tampil di bawah isian jawaban."],
    ]),
  },
  {
    id: "files",
    label: "File & lampiran",
    placement: "Dalam atau di bawah pesan assistant",
    description:
      "File dapat muncul sebagai chip inline atau tombol lampiran. Contoh studio membuka pratinjau mandiri; percakapan memakai viewer Focus.",
    source: "Answer · InlineReferenceChip · FileActionChip · FileViewer",
    states: states([
      ["inline", "Chip file", "Referensi file di dalam jawaban membuka pratinjau."],
      [
        "attached",
        "Tombol lampiran",
        "Lampiran yang ditautkan ke pesan tampil sebagai tombol nama file.",
      ],
      ["csv", "Hasil tabel CSV", "Pratinjau tabel dapat dicari, disalin, dan diunduh."],
      [
        "markdown",
        "Dokumen Markdown",
        "Dokumen memakai renderer Markdown yang sama dengan jawaban.",
      ],
      [
        "missing",
        "File tidak tersedia",
        "Referensi file yang tidak ada ditampilkan sebagai teks File tidak tersedia.",
      ],
    ]),
  },
  {
    id: "sources",
    label: "Sumber riset",
    placement: "Setelah pesan pemicu · sebelum jawaban",
    description:
      "Sumber yang tercatat pada run ditampilkan dalam daftar yang bisa dibuka-tutup. Jumlah mengikuti sumber tercatat, bukan jumlah tautan pada jawaban.",
    source: "Answer · ResearchSources · SourceCitation",
    states: states([
      ["single", "Satu sumber", "Chip domain dan daftar satu sumber pada jawaban."],
      ["multiple", "Beberapa sumber", "Daftar berisi judul dan tautan HTTPS ke setiap sumber."],
    ]),
  },
  {
    id: "timeline",
    label: "Goal, Routine & handoff",
    placement: "Tengah timeline · bukan bubble assistant",
    description:
      "Milestone memakai baris terpusat. Goal/Routine dapat dibuka; beberapa peristiwa sejenis dapat diringkas dalam satu kelompok.",
    source: "TimelineActivity · ConversationEvent",
    states: states([
      ["goal_created", "Goal · dibuat", "Tujuan baru ditangkap dari percakapan."],
      ["goal_completed", "Goal · selesai", "Tujuan selesai dengan bukti yang tersimpan."],
      ["goal_blocked", "Goal · terhambat", "Tujuan membutuhkan perhatian pengguna."],
      ["goal_paused", "Goal · dijeda", "Tujuan dijeda."],
      ["goal_resumed", "Goal · dilanjutkan", "Tujuan aktif kembali."],
      ["goal_stopped", "Goal · dihentikan", "Tujuan dihentikan."],
      ["routine_created", "Routine · dibuat", "Routine baru dijadwalkan."],
      ["routine_paused", "Routine · dijeda", "Routine dijeda."],
      ["routine_resumed", "Routine · dilanjutkan", "Routine aktif kembali."],
      ["routine_stopped", "Routine · dihentikan", "Routine dihentikan."],
      [
        "handoff_failed",
        "Handoff terhambat",
        "Kegagalan handoff tetap terlihat sebagai pekerjaan yang membutuhkan perhatian.",
      ],
      [
        "batch",
        "Peristiwa dikelompokkan",
        "Beberapa milestone sejenis dapat dibuka sebagai daftar.",
      ],
      [
        "handoff_requested",
        "Handoff normal",
        "Bar handoff normal disembunyikan; tidak ada bar tambahan pada percakapan.",
      ],
    ]),
  },
  {
    id: "answers",
    label: "Isi jawaban",
    placement: "Sisi assistant · DM dan grup",
    description:
      "Markdown, blok kode, tabel, tautan, dan streaming tetap berada dalam bubble jawaban yang sama pada DM maupun grup.",
    source: "Answer · AnswerCode · MarkdownTable · useStreamingText",
    states: states([
      ["plain", "Teks biasa", "Jawaban singkat dengan waktu pengiriman."],
      [
        "markdown",
        "Markdown & referensi",
        "Daftar, penekanan, kutipan, dan tautan mengikuti renderer percakapan.",
      ],
      ["code", "Blok kode", "Kode mendukung salin, pilihan wrap, dan syntax highlighting."],
      ["table", "Tabel", "Tabel mendukung salin, unduh, perbesar, dan pengurutan."],
      [
        "streaming",
        "Streaming",
        "Teks bertambah melalui hook streaming yang sama. Ulangi contoh untuk memulai ulang.",
      ],
    ]),
  },
];

export function findStudioSection(id?: string) {
  return studioSections.find((section) => section.id === id) ?? studioSections[0];
}
