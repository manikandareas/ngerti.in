export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  about: string;
  category: string;
  prompts: string[];
  website?: string;
  logo?: string;
  categories?: { slug: string; name: string }[];
  toolsCount?: number;
  triggersCount?: number;
  noAuth?: boolean;
  icon?: "research" | "code" | "data" | "writing" | "planning" | "presentation";
};

// Discovery copy is curated locally. Connection and skill availability come from the API.
export const plugins: CatalogEntry[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Baca, susun, dan kelola email",
    about:
      "Bawa konteks email ke percakapan. Minta agent merangkum pesan, menemukan informasi penting, atau membantu menyusun balasan dengan akses yang kamu pilih.",
    category: "Sehari-hari",
    website: "https://mail.google.com",
    prompts: [
      "Rangkum email penting minggu ini dan susun hal yang perlu aku tindak lanjuti.",
      "Bantu susun balasan untuk email terakhir dari tim, lalu tampilkan draftnya.",
      "Temukan email tentang jadwal meeting dan rangkum informasi utamanya.",
    ],
  },
  {
    id: "googledrive",
    name: "Google Drive",
    description: "Dokumen, spreadsheet, dan file tim",
    about:
      "Temukan dokumen yang relevan dan gunakan isinya untuk bekerja bersama agent. Hubungkan akunmu, lalu tentukan akses untuk percakapan yang membutuhkannya.",
    category: "Sehari-hari",
    website: "https://drive.google.com",
    prompts: [
      "Cari dokumen rencana proyek dan rangkum keputusan terbarunya.",
      "Bandingkan dua dokumen proposal dan jelaskan perbedaan utamanya.",
      "Bantu susun ringkasan dari dokumen yang aku pilih di Google Drive.",
    ],
  },
  {
    id: "googlecalendar",
    name: "Google Calendar",
    description: "Atur jadwal dan rencanakan harimu",
    about:
      "Gunakan konteks kalender untuk merencanakan pekerjaan, memeriksa jadwal, dan menyiapkan agenda bersama agent.",
    category: "Sehari-hari",
    website: "https://calendar.google.com",
    prompts: [
      "Lihat jadwalku besok dan bantu siapkan agenda untuk setiap meeting.",
      "Cari waktu luang minggu ini untuk dua jam kerja fokus.",
      "Rangkum jadwal minggu ini dan tandai agenda yang bertabrakan.",
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repository, pull request, dan issue",
    about:
      "Bekerja dengan konteks repository langsung dari percakapan. Telusuri issue, pahami perubahan pada pull request, dan siapkan tindak lanjut bersama agent.",
    category: "Sehari-hari",
    website: "https://github.com",
    prompts: [
      "Jelaskan alur autentikasi repository ini berdasarkan kode dan dokumentasinya.",
      "Tinjau pull request ini: apa yang berubah, risikonya, dan pengujian yang masih kurang?",
      "Rangkum commit dan pull request minggu ini menjadi pembaruan proyek.",
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Ikuti percakapan dan kabar dari tim",
    about:
      "Temukan konteks dari percakapan tim dan susun pembaruan yang jelas. Agent menggunakan akses aplikasi yang diberikan secara khusus untuk percakapanmu.",
    category: "Sehari-hari",
    website: "https://slack.com",
    prompts: [
      "Rangkum diskusi proyek minggu ini dan daftar keputusan yang diambil.",
      "Cari konteks tentang perubahan deadline di channel proyek.",
      "Bantu susun pembaruan progres singkat untuk tim. Tampilkan draftnya dulu.",
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Catatan, wiki, dan pengetahuan tim",
    about:
      "Gunakan halaman dan catatan sebagai konteks kerja. Temukan informasi, rangkum keputusan, dan siapkan dokumentasi bersama agent.",
    category: "Sehari-hari",
    website: "https://www.notion.so",
    prompts: [
      "Cari catatan proyek dan rangkum prioritas yang masih terbuka.",
      "Ubah catatan meeting ini menjadi keputusan dan tindak lanjut.",
      "Bantu rapikan dokumentasi onboarding berdasarkan halaman yang aku pilih.",
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issue dan progres pengembangan produk",
    about:
      "Hubungkan diskusi pekerjaan dengan issue dan progres proyek. Minta agent membantu menyiapkan rencana atau merangkum pekerjaan yang perlu ditindaklanjuti.",
    category: "Produk & desain",
    website: "https://linear.app",
    prompts: [
      "Rangkum issue yang masih terbuka untuk proyek ini.",
      "Bantu pecah kebutuhan fitur ini menjadi issue yang jelas.",
      "Siapkan pembaruan progres berdasarkan issue minggu ini.",
    ],
  },
  {
    id: "figma",
    name: "Figma",
    description: "Desain, konteks visual, dan kolaborasi",
    about:
      "Bawa konteks desain ke percakapan untuk membahas alur, merangkum masukan, dan menyusun pekerjaan implementasi.",
    category: "Produk & desain",
    website: "https://www.figma.com",
    prompts: [
      "Bantu tinjau alur desain ini dan daftar pertanyaan yang perlu dijawab.",
      "Rangkum masukan desain menjadi daftar tindak lanjut.",
      "Susun checklist implementasi dari desain yang aku pilih.",
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Temukan dan kerjakan file bersama",
    about:
      "Temukan file yang dibutuhkan dan gunakan dokumen pilihanmu sebagai konteks pekerjaan bersama agent.",
    category: "Bisnis & produktivitas",
    website: "https://www.dropbox.com",
    prompts: [
      "Cari dokumen proyek terbaru dan rangkum isinya.",
      "Bantu kelompokkan file proyek berdasarkan tujuan penggunaannya.",
      "Buat ringkasan dari file yang aku pilih.",
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Konteks pelanggan dan aktivitas bisnis",
    about:
      "Gunakan informasi pelanggan untuk menyiapkan tindak lanjut, merangkum aktivitas, dan menyusun catatan yang lebih berguna.",
    category: "Bisnis & produktivitas",
    website: "https://www.hubspot.com",
    prompts: [
      "Bantu siapkan ringkasan pelanggan sebelum meeting.",
      "Rangkum aktivitas terbaru dan tindak lanjut yang masih terbuka.",
      "Susun draft tindak lanjut berdasarkan catatan pelanggan ini.",
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Pembayaran dan aktivitas pelanggan",
    about:
      "Bahas informasi pembayaran yang diizinkan bersama agent untuk membantu menyiapkan ringkasan dan tindak lanjut operasional.",
    category: "Bisnis & produktivitas",
    website: "https://stripe.com",
    prompts: [
      "Bantu rangkum aktivitas pembayaran pada periode yang aku pilih.",
      "Susun daftar pertanyaan untuk meninjau laporan pembayaran.",
      "Jelaskan data pembayaran ini dalam ringkasan yang mudah dibaca.",
    ],
  },
  {
    id: "canva",
    name: "Canva",
    description: "Materi visual untuk ide dan pekerjaanmu",
    about:
      "Hubungkan konteks materi visual dengan pekerjaan sehari-hari. Diskusikan ide, siapkan naskah, dan rapikan rencana konten bersama agent.",
    category: "Bisnis & produktivitas",
    website: "https://www.canva.com",
    prompts: [
      "Bantu susun outline presentasi dari brief ini.",
      "Tinjau naskah materi visual dan perjelas pesan utamanya.",
      "Siapkan rencana konten berdasarkan kampanye ini.",
    ],
  },
];

// These are task ideas, not installed packages or public marketplace listings.
export const skillIdeas: CatalogEntry[] = [
  {
    id: "deep-research",
    name: "Riset mendalam",
    description: "Temukan sumber, bandingkan, dan tarik kesimpulan",
    about:
      "Mulai dari pertanyaan yang jelas, periksa sumber, dan susun temuan dengan rujukan. Minta agent membuat skill ini agar alur risetmu dapat dipakai kembali.",
    category: "Rekomendasi",
    icon: "research",
    prompts: [
      "Buatkan skill riset yang membandingkan sumber primer, menyertakan rujukan, dan menjelaskan bagian yang belum pasti.",
    ],
  },
  {
    id: "code-review",
    name: "Code review",
    description: "Tinjau perubahan, risiko, dan cakupan pengujian",
    about:
      "Gunakan langkah peninjauan yang konsisten untuk memahami perubahan kode, menemukan risiko, dan memeriksa pengujian yang relevan.",
    category: "Rekomendasi",
    icon: "code",
    prompts: [
      "Buatkan skill code review yang memeriksa kebenaran perubahan, risiko regresi, dan pengujian yang diperlukan.",
    ],
  },
  {
    id: "data-analysis",
    name: "Analisis data",
    description: "Ubah data menjadi temuan yang bisa ditindaklanjuti",
    about:
      "Susun alur untuk memeriksa kualitas data, mengeksplorasi pola, dan menjelaskan temuan beserta batasannya.",
    category: "Rekomendasi",
    icon: "data",
    prompts: [
      "Buatkan skill analisis data yang memeriksa kualitas data sebelum menyusun temuan dan rekomendasi.",
    ],
  },
  {
    id: "clear-writing",
    name: "Penulisan yang jelas",
    description: "Rapikan ide menjadi tulisan yang mudah dipahami",
    about:
      "Bantu agent mengikuti gaya penulisan yang kamu butuhkan: langsung, terstruktur, dan sesuai pembaca.",
    category: "Rekomendasi",
    icon: "writing",
    prompts: [
      "Buatkan skill penulisan yang memakai bahasa sederhana, struktur yang jelas, dan menghapus kalimat berulang.",
    ],
  },
  {
    id: "project-planning",
    name: "Perencanaan proyek",
    description: "Pecah tujuan menjadi langkah dan prioritas",
    about:
      "Buat rencana yang dimulai dari hasil yang diinginkan, lalu jelaskan ketergantungan, prioritas, dan kriteria selesai.",
    category: "Rekomendasi",
    icon: "planning",
    prompts: [
      "Buatkan skill perencanaan proyek yang merinci tujuan, prioritas, ketergantungan, dan kriteria selesai.",
    ],
  },
  {
    id: "presentations",
    name: "Presentasi",
    description: "Bangun alur cerita dengan pesan yang kuat",
    about:
      "Ubah bahan yang ada menjadi alur presentasi yang fokus pada audiens, pesan utama, dan bukti pendukung.",
    category: "Rekomendasi",
    icon: "presentation",
    prompts: [
      "Buatkan skill penyusunan presentasi yang menentukan pesan utama, alur cerita, dan bukti untuk setiap bagian.",
    ],
  },
];
