# 04 · Arsitektur & Delivery

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381198256f4ee69db1e78)

<!-- notion-content:start -->
## Prinsip delivery

Arsitektur mendukung arah jangka panjang agent belajar personal yang proaktif, sebagaimana dijelaskan pada [01 · Produk & Paket](01-produk-dan-paket.md). Implementasi v1 mengikuti backlog dan acceptance criteria yang telah disepakati; kesiapan memperluas kemampuan agent tidak mengharuskan seluruh kemampuan produk referensi dibangun pada v1.

Pemilihan teknologi mempertimbangkan ruang pengembangan jangka panjang dan keterbacaan kode. Tambahkan kemampuan serta infrastruktur ketika kebutuhan dan manfaatnya terbukti. Kelulusan v1 diukur dari alur belajar, fondasi agent personal, dan proaktivitas terbatas yang berfungsi sesuai backlog.

## Stack acuan

| Bagian | Pilihan |
| --- | --- |
| Web | TanStack Start + React |
| API dan auth | FastAPI + SQLModel + Alembic; Clerk |
| Worker | Procrastinate |
| Agent dan retrieval | LangChain create_agent + LangGraph; LlamaIndex |
| Data dan storage | PostgreSQL 16 + pgvector; Cloudflare R2 |
| Model gateway | LiteLLM |
| Observability dan checks | LangSmith + structlog; Ruff + pytest/anyio |

Pembagian monorepo difinalkan pada tiket fondasi.

## Agent dinamis dan workflow terstruktur

- **LangChain** `create_agent` menjalankan percakapan personal: model memilih tool, argumen, dan urutan langkah sesuai kebutuhan, atau langsung menjawab.
- **LangGraph custom** menjalankan pipeline terstruktur seperti generation Course, validasi, repair, dan publikasi.

Agent LangChain menggunakan runtime LangGraph; keduanya berbagi kemampuan checkpoint dan pause/resume. Urutan tool dalam percakapan tidak dikunci menjadi workflow per topik.

Perilaku percakapan dan agent loop: [03 · Agent](03-agent.md). [Acuan framework](https://docs.langchain.com/oss/python/langchain/overview).

## Eksekusi durable

```mermaid
flowchart LR
  U["Web"] --> A["API: auth dan domain actions"]
  A --> D[("PostgreSQL: data, event, approvals")]
  A --> Q[("Queue Procrastinate")]
  Q --> W["Worker: LangChain / LangGraph"]
  W --> D
  W --> R["LlamaIndex: konteks relevan"]
  R --> S["R2 dan pgvector"]
  W --> M["LiteLLM: Luna / Sol"]
  W --> E["Persist stream dengan seq"]
  E --> U

```

Data aplikasi memiliki approval, revision, kuota, dan progress. Checkpoint melanjutkan pekerjaan. Identitas akun berasal dari auth server; read/write/job dibatasi pada pemiliknya.

## Generasi dan quality gate

```mermaid
flowchart TD
  A["Outline dan blueprint disetujui"] --> B["Prioritaskan Lesson pertama"]
  A --> H["Pool worker: kelompok Lesson lain"]
  B --> C["Checks dan review pengajaran"]
  C -->|Lolos| D["Publikasikan revisi Lesson: mulai belajar"]
  C -->|Defect| R["Repair terarah, maksimal dua putaran"]
  R --> C
  H --> I["Checks, review, dan publikasi per kelompok"]
  D --> J["Snapshot seluruh Lesson wajib"]
  I --> J
  J --> K["Generate satu paket Practice"]
  K --> L["Checks key dan review cakupan/keterjawaban"]
  L -->|Lolos| M["Practice siap"]
  L -->|Belum| N["Repair bagian terkait; hold bila budget habis"]
```

Standar konten v1 ditetapkan melalui audit prototipe dan riset pengajaran; kontrak Python, validator, rubrik serta fixture menjadi deliverable #003. Blueprint memiliki tujuan teramati, kontribusi Lesson, evidence dan intent asesmen. Jumlah mengikuti kebutuhan belajar; billing tidak memangkas outline.

Lesson dapat dibaca sesudah pemeriksaan pengajaran, sebelum Practice selesai. Practice dibuat dari seluruh snapshot Lesson terbit lalu diperiksa terhadap cakupan, kunci, ambiguitas, format dan keterjawaban. Publikasi selalu memeriksa revisi; koreksi konten terbit membuat revisi baru dengan penanganan pembaca. Penyelesaian belajar dan unlock tidak berasal dari selesainya generation.

Pool worker dinamis membagi job Lesson/kelompok, review, Practice dan repair. Jalur Lesson pertama tidak menunggu join seluruh Course; review/publish-nya juga mendapat prioritas. Kelompok independen berjalan paralel, dengan admission RPS/TPM/biaya global lintas worker. Batching dan concurrency ditetapkan melalui pengukuran waktu ke Lesson pertama yang lolos, kesiapan Practice, kualitas, repair dan biaya.

Kode memiliki aturan pasti. Jev dapat membatch keputusan semantik sempit bila manfaatnya terukur; ia bukan penulis konten atau kalkulator. Model generatif/reasoning menangani pengajaran dan review sesuai evaluasi per peran. Temuan defect material aktif menghalangi publikasi; suggestion/resolved tidak. Satu hasil awal dan maksimal dua repair mempertahankan bagian valid. Retry transport dibatasi terpisah.

Implementasi runtime planner berada pada #008, generation multi-worker pada #009, player pada #011 dan Practice pada #012. Dokumen lokal: `docs/engineering/course-content-standard.md`, `docs/engineering/course-generation-design.md`, dan `docs/engineering/content-03-manual-acceptance.md`.

## Model dan biaya

| Model | Tugas awal |
| --- | --- |
| GPT-6 Luna | Chat rutin, analisis materi, draf Lesson/soal, kandidat memory |
| GPT-6.1 Sol | Perencanaan Course, review semantik, repair dan penalaran sulit |

Routing sama untuk Free dan Plus. Target generasi **sekitar Rp2.000/Course belum terbukti**. Benchmark prototipe mengindikasikan Rp1.500–Rp3.400/node untuk teks; biaya lifecycle dan human review tetap perlu diukur sebelum publikasi paket.

## Urutan delivery

```mermaid
flowchart LR
  A["Fondasi dan walkthrough UX"] --> B["Course pertama end-to-end"]
  B --> C["Practice, progress dan rewards"]
  C --> D["Memory dan proaktivitas"]
  D --> E["Billing, recovery dan evaluasi"]
  E --> F["Peluncuran berbayar + Free"]

```

P0 diperlukan untuk peluncuran; P1 peningkatan setelah alur inti. Tiket menjadi tempat acceptance criteria, dependencies, dan keputusan implementasi. Status Done mensyaratkan verifikasi perilaku; estimasi biaya dan SLA harus dibuktikan dengan data.
<!-- notion-content:end -->
