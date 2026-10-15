# 02 · User Flow

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381fda2dbea043a840c5a)

<!-- notion-content:start -->
## Membuat Course pertama

```mermaid
flowchart TD
  A["Signup"] --> B["Onboarding: background, goal, persona"]
  B --> C["Composer: topik, prompt atau file"]
  C --> D["Cari materi pengguna dan sumber internet"]
  D --> E["Pengguna memilih sumber"]
  E --> F["Agent menyusun outline"]
  F --> G{"Review pengguna"}
  G -->|Revisi| F
  G -->|Setujui| H["Prioritaskan node pertama"]
  H --> I["Mulai belajar"]
  H --> J["Node berikutnya dibuat di background"]

```

Tour kontekstual menunjukkan kemampuan composer dan attachment. Pengguna membuat Course nyata sebagai demo. Sumber dipilih pengguna; Course berdiri mandiri dari Study Space.

## Menyelesaikan node

```mermaid
flowchart TD
  A["Lesson"] --> B["Selesai Lesson: simpan reward flashcard"]
  B --> C{"Masih ada Lesson?"}
  C -->|Ya| A
  C -->|Tidak| D["Practice: jawab seluruh soal"]
  D --> E{"Ada jawaban salah?"}
  E -->|Ya| F["Satu putaran menjawab ulang soal salah"]
  E -->|Tidak| G["Practice selesai"]
  F --> G
  G --> H["Buka node inti berikutnya bila ada"]
  G --> I{"Pengayaan direkomendasikan?"}
  I -->|Ya| J["Screen pengayaan: alasan dan pilihan"]
  J -->|Buat pengayaan: CTA utama| K["Siapkan node pengayaan opsional"]
  J -->|Lewati: action sekunder| L["Lanjutkan Course"]
  I -->|Tidak| L
  K --> L
  L --> M{"Semua node inti selesai?"}
  M -->|Ya| N["Course selesai"]
  M -->|Tidak| A
```

Node berikutnya tetap terbuka setelah Practice selesai walaupun nilai rendah. Pengayaan tidak mengubah progress inti dan tidak memakai slot Course baru. Flashcard tersimpan untuk review; streak berasal dari aktivitas belajar valid.

### Screen pengayaan

Jika pengayaan direkomendasikan, tampilkan step/screen tersendiri dalam rangkaian penyelesaian Practice, dengan pola presentasi seperti screen streak dan flashcard. Screen muncul setelah seluruh soal dan putaran ulang jawaban salah selesai.

- Tampilkan konsep yang perlu diperkuat dan manfaat pengayaan secara singkat.
- **Buat pengayaan**: tombol utama yang menonjol; klik menyetujui tawaran dan memulai pembuatan node opsional.
- **Lewati**: action sekunder yang jelas; pengguna melanjutkan Course tanpa membuat pengayaan.

## Agent dan kembali belajar

```mermaid
flowchart LR
  A["Satu agent personal"] --> B["Main chat"]
  A --> C["Side chat"]
  A --> D["Panel chat Course"]
  D --> E["Konteks Course dan Lesson aktif"]
  D --> F["HP: drawer"]
  G["Kembali ke Course"] --> H["Pulihkan posisi, jawaban dan draft"]
  H --> D

```

Membuka chat mempertahankan sesi belajar. Slash command menuju flow yang sama dan tetap memakai HITL; nama command difinalkan pada implementasi.

## Loading dan recovery

```mermaid
stateDiagram-v2
  [*] --> Menyiapkan
  Menyiapkan --> BisaBelajar: node pertama valid
  BisaBelajar --> Selesai: semua node inti selesai
  Menyiapkan --> PerluPemulihan: gagal
  BisaBelajar --> PerluPemulihan: node berikutnya gagal
  PerluPemulihan --> Menyiapkan: retry bagian yang gagal
  PerluPemulihan --> BisaBelajar: node siap dipertahankan
  Selesai --> [*]

```

Browser ditutup: job tetap berjalan. Koneksi putus: pulihkan state. Reward, jawaban, dan progress tidak digandakan. Sumber belum memadai: minta konteks tambahan sambil mempertahankan input. Outline lama tetap terlihat selama revisi.
<!-- notion-content:end -->
