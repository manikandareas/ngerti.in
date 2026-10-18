# 06 · Bukti, Hasil Uji & Batas Investigasi

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381698715cbfd20430b35) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
<table_of_contents/>
Tanggal: 18 Oktober 2026. Laporan ini menggabungkan observasi UI authenticated, artefak frontend publik, REA MCP, dokumentasi resmi, dan inspeksi kode Ngertiin. Tidak ada source server Muse yang diperoleh. Laporan tidak menyatakan seluruh Muse sudah direkonstruksi atau Ngertiin sudah mencapai parity.

## 1. Hasil uji terkontrol

### LIVE-01 — Side chat, instruksi kedua dan hasil artifact

Pengujian dilakukan pada side chat baru bernama otomatis **Audit REA square table**. Satu artifact baru dibuat untuk audit; tidak menggunakan konten pribadi, tidak menghubungkan layanan, tidak mengubah settings, tidak membuat jadwal, tidak melakukan transaksi, dan tidak menghapus file lama.
1. Minta satu HTML berjudul **Audit REA - Tabel Kuadrat**, tabel angka 1–5 dan kuadratnya, dengan instruksi menghitung melalui Python. Permintaan melarang browsing, connectors, schedule dan perubahan file lama.
2. Sesudah submit, UI menampilkan Stop dan composer tetap tersedia.
3. Kirim “Sambil pekerjaan artefak tadi berjalan, jawab singkat: berapa 2 + 3? Jangan batalkan pekerjaan artefak.”
4. Pesan kedua diterima. Respons “2 + 3 = 5” muncul, diikuti keterangan artifact masih dibuat. Avatar menunjukkan Building artifact, kemudian Checking mobile view.
5. Kartu artifact muncul, diikuti pesan selesai. Membuka kartu mengarah ke `https://muse.ai/library/artifacts/audit-rea-tabel-kuadrat`, dengan split viewer, Resize panel, Maximize, More options dan Close.

| Klaim | Hasil |
| --- | --- |
| Side chat dapat dibuat dan dua instruksi diterima saat tugas pertama berjalan | Teramati langsung |
| Jawaban kedua tidak harus menunggu publikasi artifact pertama | Teramati pada skenario ini |
| Artifact dipublikasikan sebagai kartu dan viewer route terpisah | Teramati langsung |
| Agent benar-benar menjalankan Python | Belum dibuktikan dari process/tool execution; assistant menyatakannya, bukan bukti proses |
| Tabel di dalam artifact berisi 1,4,9,16,25 dan responsif | Assistant menyatakan; isi viewer belum berhasil diinspeksi independen |
| Semua task berjalan paralel dan adil | Tidak disimpulkan dari dua pesan ini |
| Artifact bertahan sesudah sandbox mati/reload penuh | Belum diuji |

Pembacaan DOM/screenshot viewer terhalang keterbatasan akses ekstensi pada URL kosong setelah pembukaan. Tidak dilakukan perluasan izin browser atau pengambilan cookies untuk mengatasinya. Artefak dan side chat audit dibiarkan tersedia pada akun, tanpa penghapusan. Pengamatan ini menunjukkan keberhasilan alur publikasi; batas render tetap dicatat.

## 2. Jalur bukti REA dan perolehan frontend

REA MCP **berfungsi dalam sesi ini**: `binary_session`, target discovery, page inspection, script export, analisis JavaScript terpilih, dan evidence export. REA 6.5.0, skill v42, 207 tools tersedia. Ini memperbarui penilaian awal yang masih melaporkan registrasi/sesi lama; tidak berarti setiap tool native/firmware telah diuji.
Public capture memakai browser baru dengan profil sementara tanpa login/cookies pengguna, endpoint CDP hanya loopback, allowlist `https://muse.ai`. Browser pribadi yang sudah login diamati melalui CUA, tanpa mengaktifkan CDP pada profil pribadi atau mengekstrak token.

| Bukti | Identitas/provenance |
| --- | --- |
| Discovery target publik | `ev_3f3b549bc40b5c598f2ffa59c4ebd487e50422f1c723abae208c1b37fc49f42e` |
| REA page inspection | `ev_ea428e6ce0aa17d7182aa1eb3c235b44ba7b8e3f45af28274eeab4fd37e831d3` |
| Captured scripts export | `ev_48541e373916d12acf2fb54d0a0f91850db420dd7d877b72e4c63b5513439d43` |
| Capture digest | SHA-256 `9d244515a58afe070e0c775f600d23cdbde1dee0fcc401a7d5a477273ae101c6` |
| Export manifest digest | SHA-256 `e946df2e1510a595e9b04915d8779093dd1b93fd01afcec51d37200c00477629` |
| Public landing sources | 54 sumber yang ditahan capture; bytes diekspor tanpa refetch/execute |
| App chunk discovery | CUA pageAssets inventory `72fe8a08-c825-4ab5-ab2b-a4e498b561f6` pada UI authenticated |
| App static acquisition | 199 URL chunk same-origin teramati, seluruhnya berhasil diunduh sebagai JavaScript publik tanpa Cookie/Authorization; 10.075.471 bytes |
| Build yang teramati | `dpl_13w2XhxKwKs7oW6RrPKNJxMESSbw` — snapshot, bukan versi produk yang stabil |

Capture status `policy_filtered`/`attach_limited`: observasi mulai ketika attach, sehingga request/console/WS sebelumnya tidak tersedia. Sepuluh script tanpa origin attribution dan metadata origin di luar allowlist dikecualikan. Source map hanya metadata deklaratif; tidak diambil. Public script export tidak memberi hubungan modul browser yang lengkap untuk URL query/inline yang diisolasi.
URL app chunk diperoleh dari state yang benar-benar dimuat, bukan menebak endpoint private. HTTP acquisition tersebut **bukan** capture authenticated RPC. Analisis REA atas file lokal menambah bukti statik, tidak membuka plaintext traffic terenkripsi ataupun implementasi service backend.

## 3. Berkas bukti lokal

Semua scratch evidence berada di `.firecrawl/muse-re-20261018/` yang di-ignore Git. Mirror laporan berada di `docs/research/muse-ai-v1/`.

| Berkas/kelompok | Isi |
| --- | --- |
| `evidence-public-initial.json`, `public-capture.json` | Capture awal dan record REA |
| `scripts-public/manifest.json`, `files/` | 54 captured sources dan provenance |
| `scripts-app-public/manifest.json`, `*.js` | 199 public app chunks, URL, byte count dan SHA-256 per artefak |
| `introducing-live.json`, `security-live.json`, `security-architecture.png` | Sumber vendor dan diagram |
| `help-*.json`, `help-*.md`, `privacy.json`, `landing-meta.json` | Dokumentasi resmi dan metadata asal |
| Draf frontend + evidence analisis | Entry points, operations, schemas, transport dan batas semantic coverage; detail pada halaman frontend |
| `notion-readback-*.json` | Hasil fetch setelah publikasi untuk verifikasi isi dan struktur |

Tidak ada isi chat, identitas goal, memory pribadi, secret values atau dump authenticated storage yang dimasukkan dalam Notion. Source frontend bersifat public shipped artifact; bukan source repo/backend Muse.

### Ekspor dan penutupan sesi

- `evidence-final.json`: 3 record capture/export dari sesi REA induk, 2.736.229 bytes.
- `evidence-frontend-analysis.json`: 8 record analisis dari sesi REA sub-investigasi, 157.149.405 bytes; SHA-256 `da26b214536f6a070fcd80a8af18b4ecf15b2f22f2fb5cd480a9b34a4296df6f`. Parent E2, E3 dan E4 terverifikasi ada pada bundle; session evidence tidak diasumsikan otomatis dibagi antaragent.
- `cleanup.json`: browser riset CDP milik audit telah dihentikan dan profil sementara dihapus. Profil/browser pribadi tidak diubah untuk menambah CDP atau akses secret.
Raw evidence besar tetap di scratch lokal; Notion menyimpan interpretasi, kontrak, indeks dan batas bukti agar laporannya tetap mudah dibaca.

## 4. Apa yang masih unknown

| Pertanyaan | Bukti sekarang | Verifikasi berikutnya |
| --- | --- | --- |
| Prompt, context window, compaction dan memory salience | Dokumen menyebut persistent memory; frontend hanya kontrol/kontrak | Skenario recall/correction/forgetting terkontrol; backend tetap tidak terlihat |
| Scheduler exactness, jitter, DST, downtime catch-up, retries | Operasi task/schedule dan Upcoming ada | One-shot/recurring test disposable, timezone, duplicate dispatch dan restart terukur |
| Delivery dan task resilience | Cursor/replay contracts ada | Putus koneksi, refresh, stop/resume, concurrent writes dan unknown external outcomes |
| CPU/RAM/disk/concurrency/idle limit Muse | Tidak ada spesifikasi terbukti | Observasi usage/limits tanpa stress abusif; docs/plan terkini |
| Semua connector/write/permission edge cases | Katalog, scoped grant dan vendor controls ada | Test connector milik pengguna dengan aksi aman; expiry/revoke dan stale proposal |
| Artifact DOM, runtime isolation dan API capability | Contract/schema terlihat; viewer route terbuka | Viewer yang dapat diinspeksi, network/origin policy, refresh, asset path dan persistence |
| Live browser takeover dan credential fill | Vendor + route registry | Task browser aman, pause/take/release/control race; jangan gunakan kredensial baru untuk membuktikan hal dasar |
| Native Mac/mobile/WhatsApp parity | Vendor menyebut distribusi; beberapa menu ada | Dedicated platform walkthrough dan session/notification scenarios |
| Model/backbone/training dan eval | Klaim produk/model vendor terpisah | Jangan menebak; ukur output/latency/cost Ngertiin sendiri |
| Production security efficacy, key management, TEE | Diagram dan uraian vendor | Audit/config/attestation publik; Confidential VM masih future pada sumber yang diperiksa |
| Backup RPO/RTO/delete propagation dan regional data | Janji backup/privacy | Contract vendor atau controlled recovery; tidak diperoleh dari bundle |
| Harga dan profitabilitas Ngertiin | #05 lama belum menghitung compute umum | Benchmark lifecycle nyata, hard caps, provider price verification dan pilot berbayar |

## 5. Definisi parity yang dapat dipertanggungjawabkan

Paritas pengalaman berarti pengguna dapat menyelesaikan skenario yang sama dengan hasil, kontrol dan pemulihan yang sebanding. Paritas internal berarti teknologi, model, policy dan deployment sama; hal tersebut tidak dapat dijanjikan dari reverse engineering web ini.
Gunakan empat label per capability: **observed**, **vendor-documented**, **implemented in Ngertiin**, **accepted in Ngertiin**. Satu kolom tidak menaikkan kolom lain secara otomatis. Snapshot frontend harus ditautkan ke tanggal/build; fitur dapat berubah setelah laporan diterbitkan.
Roadmap menyertakan 30 skenario penerimaan, mulai chat sambil task berjalan hingga budget races, sandbox cleanup, forgetting suppression, scheduled delivery, preview isolation dan backup reconciliation. Near-parity V1 dinilai dari matriks itu dan use case pilot, bukan jumlah menu yang sudah digambar.

## 6. Urutan investigasi lanjutan

1. Selesaikan pembacaan viewer dan trace artifact → manifest → refresh/persistence dengan input audit yang sama.
2. Uji user schedule aman dan cancel/revoke, lalu lanjut retry/reconnect tanpa menyentuh layanan eksternal.
3. Uji browser read-only + takeover pada situs publik; lanjut action/approval hanya pada alur yang diotorisasi jelas.
4. Perluas ke memory correction/forgetting dan cross-thread recall dengan data sintetis.
5. Catat observed result dan gap untuk mobile/channel/connector yang benar-benar masuk scope V1.
Laporan ini sudah memberi peta teknis dan implementasi yang dapat direview. Daftar di atas mempertahankan pertanyaan yang memerlukan eksperimen baru; tidak menyatakan bagian internal yang belum terlihat sebagai fakta.
<!-- notion-content:end -->
