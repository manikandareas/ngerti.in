import { type ComponentName, components } from "@/lib/component-catalog";

export const categories = {
  actions: "Actions",
  forms: "Form & input",
  navigation: "Navigation",
  overlays: "Overlay & menu",
  display: "Data & layout",
  feedback: "Feedback",
  conversation: "Conversation",
} as const;

export type Category = keyof typeof categories;

const definitions = {
  actions: {
    button: "Varian aksi, ukuran, ikon, loading, dan disabled.",
    "button-group": "Gabungkan aksi yang saling berkaitan.",
    toggle: "Kontrol dua state untuk satu pilihan.",
    "toggle-group": "Pilihan tunggal atau jamak dalam satu kelompok.",
  },
  forms: {
    field: "Label, deskripsi, input, dan validasi dalam satu struktur.",
    label: "Label yang terhubung dengan kontrol form.",
    input: "Input teks dengan helper, error, dan disabled state.",
    "input-group": "Input dengan ikon, teks pendukung, atau aksi.",
    "input-otp": "Input kode satu kali dengan navigasi keyboard.",
    "native-select": "Pilihan menggunakan kontrol native browser.",
    textarea: "Input untuk teks beberapa baris.",
    checkbox: "Pilih satu atau beberapa opsi independen.",
    "radio-group": "Pilih satu opsi dari satu kelompok.",
    switch: "Ubah pengaturan antara aktif dan nonaktif.",
    slider: "Atur nilai di dalam sebuah rentang.",
    select: "Daftar pilihan dengan pencarian keyboard.",
    combobox: "Cari dan pilih opsi dari daftar.",
    calendar: "Pilih tanggal dengan navigasi bulan.",
  },
  navigation: {
    breadcrumb: "Tunjukkan posisi dalam hierarki halaman.",
    menubar: "Kelompok menu dengan navigasi keyboard.",
    "navigation-menu": "Navigasi dengan panel dan tautan bertingkat.",
    pagination: "Berpindah di antara halaman hasil.",
    sidebar: "Panel navigasi dengan state expanded dan collapsed.",
    tabs: "Beralih antara panel dalam satu konteks.",
    command: "Cari aksi melalui command palette.",
  },
  overlays: {
    "alert-dialog": "Konfirmasi tindakan yang membutuhkan perhatian.",
    "context-menu": "Menu yang muncul melalui klik kanan.",
    dialog: "Konten modal dengan focus management.",
    drawer: "Panel geser untuk interaksi pada layar kecil.",
    "dropdown-menu": "Menu aksi dengan opsi dan separator.",
    "hover-card": "Informasi tambahan saat hover atau fokus.",
    popover: "Panel kontekstual di dekat trigger.",
    sheet: "Panel dari tepi layar untuk konten pendukung.",
    tooltip: "Penjelasan singkat untuk sebuah kontrol.",
  },
  display: {
    avatar: "Identitas visual dengan fallback teks.",
    "aspect-ratio": "Pertahankan rasio konten saat ukuran berubah.",
    card: "Kelompokkan judul, konten, dan aksi pada satu surface.",
    carousel: "Navigasi horizontal untuk kumpulan konten.",
    chart: "Visualisasi data menggunakan palet tema.",
    direction: "Dukung arah teks kiri-ke-kanan dan kanan-ke-kiri.",
    item: "Baris konten dengan media, deskripsi, dan aksi.",
    kbd: "Tampilkan kombinasi tombol keyboard.",
    resizable: "Panel yang ukurannya dapat diubah.",
    "scroll-area": "Area scroll dengan ukuran yang terkontrol.",
    separator: "Pemisah visual horizontal atau vertikal.",
    table: "Tampilkan data dalam baris dan kolom.",
  },
  feedback: {
    accordion: "Buka atau tutup kelompok informasi.",
    alert: "Feedback informatif, success, warning, dan error.",
    badge: "Label singkat untuk state atau kategori.",
    collapsible: "Tampilkan detail tambahan sesuai kebutuhan.",
    empty: "State ketika belum ada data untuk ditampilkan.",
    progress: "Status kemajuan sebuah proses.",
    skeleton: "Bentuk sementara saat konten dimuat.",
    sonner: "Notifikasi toast yang mengikuti tema aktif.",
    spinner: "Indikator aktivitas dengan ikon Hugeicons.",
  },
  conversation: {
    attachment: "Lampiran dengan nama, ukuran, dan tipe file.",
    bubble: "Bubble percakapan dengan varian dan alignment.",
    "code-block": "Blok kode dengan tipografi mono dan aksi salin.",
    marker: "Penanda tanggal atau pemisah dalam percakapan.",
    message: "Struktur pesan dengan avatar dan konten.",
    "message-scroller": "Percakapan scroll dengan navigasi ke pesan terbaru.",
    questionnaire: "Pertanyaan bertahap dengan pilihan dan validasi.",
    trace: "Status aktivitas dan detail yang dapat dibuka.",
  },
} satisfies Record<Category, Partial<Record<ComponentName, string>>>;

export const catalog = components.map((name) => {
  const category = (Object.keys(categories) as Category[]).find(
    (group) => name in definitions[group],
  );
  if (!category) throw new Error(`Missing component category: ${name}`);
  const description = (definitions[category] as Partial<Record<ComponentName, string>>)[name];
  return {
    name,
    category,
    description,
    title: name
      .split("-")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" "),
  };
});

const exportOverrides: Partial<Record<ComponentName, string>> = {
  chart: "ChartContainer",
  direction: "DirectionProvider",
  "input-otp": "InputOTP",
  resizable: "ResizablePanelGroup",
  sonner: "Toaster",
};

export function componentImport(name: ComponentName) {
  const exported =
    exportOverrides[name] ??
    name
      .split("-")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join("");
  return `import { ${exported} } from "@/components/ui/${name}";`;
}
