# NG-034 · File produk dan hasil tersimpan

Diterima lokal pada 18 Oktober 2026. Scope: [NG-034](../backlog/tasks/34-file-produk-dan-hasil-tersimpan.md), di atas Task/approval NG-033. Environment memakai web/API/worker host, PostgreSQL dan MinIO lokal, akun Clerk sintetis. Migrasi incremental `0003_product_files` mempertahankan data yang ada.

## Perilaku yang tersedia

Composer dan form Task menerima PDF, PNG/JPEG, TXT/MD, CSV dan JSON. Upload mempunyai progress, cancel/retry dengan request key stabil, pemilihan file tersimpan, revision baru serta rentang halaman/baris. Draft menyimpan referensi revision dan pilihan output sesudah reload atau pengiriman gagal. Retry upload tetap menunjuk revision upload semula walaupun revision lebih baru sudah ada.

PDF/gambar memakai **Mistral OCR `mistral-ocr-4-1`**, langsung melalui API dengan bytes base64. Kredensial hanya di backend. Teks UTF-8, CSV dan JSON divalidasi/dibaca lokal. Tidak menambah LlamaIndex atau LlamaParse. Ekstraksi dimulai saat dipakai Task; cache mengikat revision, model dan versi policy. Halaman provider mulai dari indeks nol dinormalisasi menjadi halaman pengguna mulai dari satu.

Task menghasilkan satu atau beberapa berkas MD/TXT/CSV/JSON/HTML statis. Pengguna dapat meninjau dan mengedit isi setiap file sebelum menyetujui revision exact. Hasil menyediakan manifest, checksum, referensi input/rentang, revision history, preview, unduh dan hapus. Pembaruan mengikat current result revision, memakai snapshot isi hasil sebelumnya dan input asli; revision siap terdahulu tetap terbaca selama pembaruan atau ketika pembaruan gagal.

Menu **File & hasil** menampilkan 50 input dan hasil terbaru milik akun. Pencarian Library lintas resource tetap NG-039. Eksekusi kode umum tetap NG-035; Task ini menghasilkan file teks terstruktur tanpa memberi model akses shell atau browser.

## Batas dan biaya

| Batas awal | Nilai |
| --- | --- |
| Upload/berkas hasil | 10 MiB per file |
| Lampiran | 5 file, total 25 MiB |
| PDF / OCR per Task | 20 halaman per PDF / 40 halaman |
| Gambar | PNG/JPEG, maksimal 25 megapiksel |
| Ekstraksi | Maksimal 4 MiB |
| Hasil | 10 file, total 25 MiB |
| Storage akun | 250 MiB, termasuk bytes yang belum dipurge |
| OCR internal per tanggal UTC | 100 halaman/akun, 1.000 global |
| Task file | 60.000 unit kerja, maksimal 3 model calls, input 48.000 byte dan output 3.000 token per call |

Satu permintaan Task memakai satu chat unit. Upload, cache reuse, review, download dan retry Task tidak membuat pesan berbayar baru. Budget halaman OCR adalah pengaman biaya internal, bukan meter paket komersial baru. Policy/model/estimasi tarif disnapshot saat ekstraksi dibuat. Estimasi konfigurasi awal USD 4/1.000 halaman merupakan estimasi operasional, bukan invoice atau harga pelanggan.

Reservasi halaman akun/global atomik dilakukan sebelum dispatch. Request OCR ambigu tetap menghitung seluruh halaman yang mungkin terpakai; Task retry tidak mendispatch ulang OCR. Percobaan OCR baru memerlukan keputusan eksplisit dan request identity baru, dengan pengakuan potensi biaya bila percobaan lama mungkin sudah berjalan. Riwayat attempt dan charged pages tetap disimpan setelah bytes dihapus.

Isi yang melampaui budget konteks gagal sebelum model dipanggil, dengan petunjuk memilih rentang lebih kecil. Tidak ada truncation diam-diam. Batas ukuran output adalah ceiling penyimpanan; batas token model dapat tercapai lebih dahulu dan tidak menjanjikan generasi file berukuran 10 MiB.

## Persistence, akses dan retention

Upload divalidasi dalam proses disposable untuk metadata PDF/gambar; ingress multipart, termasuk chunked, dibatasi sebelum spool. Root file dan revision memiliki identitas terpisah. Object key dibuat server di prefix owner. Task mengikat exact revision, hash dan extraction identity; sumber hilang tidak diganti revision terbaru secara diam-diam.

Procrastinate menjalankan ekstraksi dan Task. Task yang menunggu input melepas execution slot; penyelesaian ekstraksi membangunkan dependency. LangGraph tetap menjaga workflow draft/review. Tidak melakukan network/S3/model I/O sambil menahan transaksi domain.

Publikasi melakukan reservasi manifest → put semua bytes → baca ulang/verifikasi SHA-256 → transaksi yang memublikasikan manifest/files, status Task success, action outcome dan satu delivery. Partial/malformed output dan put gagal tidak menjadi success. Stop/deletion mencabut lease, sehingga worker lama tidak dapat memublikasikan hasil. Retry publikasi memakai draft durable. Late storage write setelah deletion/GC tetap direvoke dan dijadwalkan dibersihkan kembali.

Preview/download melalui proxy API berautentikasi dengan pemeriksaan owner sebelum dan sesudah I/O, `no-store`, `nosniff` dan attachment disposition. URL S3 publik/signed tidak dikirim ke browser. HTML disanitasi dengan DOMPurify, navigation/form/script/external URL dibuang, lalu dirender dalam iframe `sandbox=""` dengan origin opaque, CSP ketat dan `no-referrer`. CSS inline dan konten statis dapat ditampilkan; bytes unduhan tetap file asli. PDF asli tersedia lewat download; PDF inline viewer tidak termasuk slice ini. Preview teks dibatasi 200.000 karakter; CSV maksimal 200 baris/100 kolom, disertai petunjuk mengunduh file lengkap.

Delete merevoke seluruh revision segera, menghentikan Task aktif yang memakainya, kemudian maintenance membersihkan bytes setiap lima menit. Upload yang tidak pernah dipakai Task dibersihkan setelah 24 jam. Input yang telah digunakan dan hasil siap disimpan sampai dihapus. Hasil turunan yang selesai tetap ada setelah sumber dihapus; penghapusan hasil merevoke semua revision hasil secara atomik. Draft, manifest/provenance dan audit metadata tetap menjadi riwayat Task; delete bukan penghapusan total transcript.

## Bukti penerimaan

[Live readback](evidence/files-34/live-readback.json) mencatat Task/action/execution/delivery IDs, snapshots, manifests, versi library, usage dan deletion. [Fixture PDF](evidence/files-34/fixtures/scan-rapat.pdf) dan [PNG](evidence/files-34/fixtures/scan-rapat.png) adalah scan sintetis Indonesia: proposal Jumat, Ayu, Rp1.500.000, Buku 12 dan Pensil 24.

| Bukti | Expected / actual |
| --- | --- |
| OCR nyata → dua hasil | Task `e12e415b-543e-456e-bc1b-fa156e10efa3` membaca PDF melalui Mistral, menghasilkan HTML ringkasan dan CSV inventaris yang cocok dengan halaman 1. Satu extraction dan satu delivery. [Desktop hasil](evidence/files-34/desktop-result.png), [preview HTML](evidence/files-34/desktop-html-preview.png). |
| Pembaruan, review/edit dan reload | Task `18195256-680d-4ec9-8f13-479f18d08c0b` memakai cache yang sama, menerima isi hasil v1, mengubah judul dan menambah kolom status. Edit CSV membuat draft revision 2; reload mempertahankan proposal, approval menghasilkan result v2 dan satu delivery. Hasil v1 tetap dapat dipilih. [Review mobile](evidence/files-34/mobile-review.png), [CSV v1](evidence/files-34/mobile-csv-preview.png). |
| PNG → JSON dan audit setelah purge | Task `505f7dfa-47f0-4ad8-86d6-0c0af9c87976` pada worker final membaca PNG lewat OCR nyata, menghasilkan keputusan/Ayu/1500000/inventaris yang benar. Setelah sumber dipurge, halaman charged dan metadata usage tetap sama. [Readback retention](evidence/files-34/live-ocr-retention.json), [preview JSON](evidence/files-34/desktop-json-preview.png). |
| Chat bersamaan | Chat menjawab 4 untuk pertanyaan 2+2 saat pembaruan file berjalan/menunggu. Task tidak menahan active ChatRun. |
| Upload/revision dan recovery | Upload CSV melalui UI, revision 2 menyimpan isi baru sementara revision 1 tetap ada. [Revision input](evidence/files-34/desktop-input-revisions.png). Request chat yang di-abort mempertahankan teks, file refs, output spec dan request key sesudah reload: [readback draft](evidence/files-34/draft-restored.json), [mobile](evidence/files-34/mobile-network-failure.png). |
| Owner, batas, kegagalan | [47 skenario backend](evidence/files-34/contracts.json) pada PostgreSQL/checkpoint dan MinIO nyata mencakup owner isolation, immutable revisions, concurrent upload replay, page cap, chunked ingress/CORS, unknown OCR/retry, context ceiling, stale approval, failed update, partial publication, stop, lost ack, deletion dan late-writer GC. Provider model/OCR pada fault probe adalah adapter terkontrol. Database sementara dan prefix sintetis probe dihapus. |
| Sandbox dihapus (P12) | [Live Daytona](evidence/files-34/sandbox-persistence.json): snapshot daytona-medium, SDK 0.225.0/provider v0.225.1, TTL 3 menit. Tiga file benar-benar dibuat dan diunduh dari sandbox, dipublikasikan melalui result service, sandbox dihapus dan keberadaannya dicek, lalu bytes/hash hasil persisten tetap sama. Ini adapter fixture terbatas, bukan eksekusi kode umum NG-035. Hasil fixture kemudian dihapus lewat UI. |
| Isolasi HTML (P28) | [Probe browser](evidence/files-34/preview-isolation.json) memeriksa sanitasi script/form/refresh/link/URL eksternal, iframe tanpa allow-scripts/allow-same-origin, akses same-origin gagal dan nol request ke domain uji. [Desktop](evidence/files-34/desktop-isolation.png), [mobile](evidence/files-34/mobile-isolation.png). |
| Download/delete | Unduhan HTML melalui tombol UI cocok dengan manifest SHA-256. Delete sumber menghasilkan 404 dan kedua berkas hasil tetap terbaca; delete hasil fixture menghilangkannya dari daftar. [Dialog sumber](evidence/files-34/mobile-delete-source.png). |

Walkthrough memakai viewport 1280×900, 390×844 dan 320×640; tidak ditemukan overflow horizontal, tombol kirim tetap terlihat ketika area attachment panjang, serta keyboard focus/reduced motion diperiksa. Mobile adalah emulasi viewport, bukan perangkat fisik. [Lampiran desktop](evidence/files-34/desktop-attachments.png), [320 px](evidence/files-34/mobile-attachments-320.png).

Panggilan OCR PNG langsung menggunakan model snapshot dan mengembalikan satu halaman dalam sekitar 1,1 detik: [respons tersanitasi](evidence/files-34/mistral-live.json). Usage/token/invoice dipisahkan; reservation Daytona USD0,0833 adalah ceiling trial tiga menit, bukan biaya aktual yang ditagihkan. Semua resource Daytona milik probe dikonfirmasi dihapus. Bukti ini tidak menerima R2 production, remote deployment, seluruh kualitas dokumen OCR, kode/browser umum atau full Library search.

Total tiga model calls Task terkonfirmasi memakai **3.782 token**, tidak termasuk chat. Task fixture sandbox tidak memanggil model. OCR nyata memakai **3 halaman** (dua integrasi dan satu smoke langsung), estimasi konfigurasi **USD0,012**; saldo kredit dan invoice tidak diperiksa. Detail usage OCR PDF trial awal sempat dibersihkan oleh worker yang belum direstart setelah perbaikan retention; charged pages/policy tetap ada. Setelah worker direstart, trial PNG final membuktikan metadata usage bertahan sesudah purge. Kondisi ini dicatat pada live readback dan petunjuk operasi.

`make check`, `make build`, `make task-inspect` (55), `make quota-inspect` (46), probe file (47), dan `git diff --check` lulus. [Ringkasan checks](evidence/files-34/checks.json) mencatat gate dokumentasi dan readback Notion.

## Operasi

Jalankan `make migrate` untuk database yang sudah ada; jangan memakai reset. Isi `MISTRAL_API_KEY` hanya pada environment backend/worker. `.env.example` memuat snapshot model dan cap. Restart worker setelah mengubah Python/config; autoreload API tidak mereload worker.

`make files-inspect` menjalankan fault probe tanpa panggilan model/OCR berbayar. Untuk merekam laporan: `uv run --project apps/backend python scripts/inspect_files.py --output docs/engineering/evidence/files-34/contracts.json`. Probe live sandbox bersifat eksplisit: `scripts/probe_file_persistence.py --live --owner UUID --output PATH`; menggunakan trial/cap NG-031 dan membuat Task fixture milik akun tersebut. Jangan menjadwalkan probe berbayar sebagai health check.
