# Penerimaan memory NG-017 dan NG-018

Environment: development localhost, 19 Oktober 2026. Implementasi memakai Mem0 OSS library 2.2.1, PostgreSQL/pgvector, model extraction `gpt-5-mini` dan embedding `text-embedding-3-small`. Migration incremental `0008_personal_memory` diterapkan tanpa reset data. Rancangan aktual: [memory-runtime.md](memory-runtime.md).

## Walkthrough dengan model nyata

Pesan fixture melalui UI: “Ingat bahwa nama proyek latihan saya adalah Lentera Uji17 dan saya lebih suka contoh dalam bahasa Indonesia.” Respons menyatakan capture masih pending. Dua entry muncul di **Identitas → Ingatan tentangmu**, bertipe fact/preference dengan kutipan sumber dan label percakapan. Side thread lain menjawab Lentera Uji17 dan bahasa Indonesia tanpa pesan sumber pada riwayat thread itu.

Editor UI mengoreksi nama proyek menjadi Lentera Revisi17. Riwayat menunjukkan versi 2 aktif dan versi 1 dikoreksi. Chat menjawab nama baru. Dialog forget menjelaskan bahwa pesan/file asli tetap tersimpan; dialog diperiksa lalu dibatalkan. Forget atas fixture dijalankan melalui domain service, diikuti readback UI dan chat. Entry proyek hilang, preferensi bahasa dari pesan yang sama tetap sah, dan jawaban baru menyatakan nama proyek belum tersedia sambil tetap menjawab bahasa Indonesia. Jawaban lama tetap terlihat sebagai arsip percakapan tetapi tidak dipakai ulang untuk model.

Capture-off disimpan melalui UI dan tetap off sesudah reload; daftar/edit/forget tetap ada. Capture kemudian dipulihkan on. Kedua fakta fixture akhirnya dilupakan; pesan sumber dan jawaban yang sudah terkirim dipertahankan. Trial memakai fakta sintetis, tidak mengambil atau menyimpan token browser pada evidence.

Desktop serta mobile 390×844 dan 320×640 diperiksa. Pada mobile sempit, panel menggulir vertikal; sumber dan kontrol tidak memerlukan horizontal scroll. Dialog memakai primitive AlertDialog; buka/batal memulihkan fokus. Ketika API dihentikan sementara, panel mempertahankan data terakhir dengan pesan error dan tombol Coba lagi. Panel pulih setelah API dimulai kembali. Loading/empty diperiksa saat query pertama dan panel awal tanpa entry.

Bukti: [live-readback.json](evidence/memory-17/live-readback.json), [screenshot mobile](evidence/memory-17/mobile-memory.jpg).

## Pemeriksaan kontrak dan regresi

Inspector `scripts/inspect_memory.py` menjalankan lifecycle pada database disposable, termasuk concurrent enqueue/capture, hash sumber berubah, owner asing, request-key/stale revision, candidate uncertainty, lexical fallback/RRF, batas envelope UTF-8, koreksi vs historical change, suppression/replay, penghapusan plaintext/history/evidence, shared source dengan dua fakta, source deletion dengan/tanpa dukungan independen, dan persona rejection exclusion.

Fault/race mencakup capture-off saat extraction in-flight; koreksi yang mencabut lease Chat; penghapusan ketiga tabel checkpoint yang terlacak; forget yang membatalkan Task aktif beserta draft/approval/history draft dan memastikan retry memakai revision baru; unknown provider outcome yang tetap menahan reservasi; dan budget habis yang memblok sebelum jaringan. GET/edit/settings/forget melalui API tetap berhasil ketika allowance chat benar-benar nol pada akun disposable. Perintah baru “ingat lagi” dapat membuka suppression dengan evidence baru.

Mode `--live` memakai provider nyata untuk extraction, admission, embedding, proyeksi dan recall, serta memeriksa usage terkonfirmasi. Trial tambahan memeriksa kode proyek English, negasi dan kutipan fiksi. Seluruh 67 skenario lulus; detailnya tersimpan pada [contracts-live.json](evidence/memory-17/contracts-live.json).

Regresi yang lulus: persona 36, Task 55, file 47, scheduler 82 dan quota 46 skenario. Mock file inspector diperbaiki untuk membaca JSON output specification sebelum konteks persona/memory tambahan; format prompt produk tidak diubah untuk menyesuaikan mock.

`make check` mencakup Biome, TypeScript, Ruff lint/format dan mypy. `make build` menghasilkan build web produksi; warning bundler dari dependency yang sudah ada tidak menggagalkan build. `make docs-check` memverifikasi mirror Notion, hash, dependency, empat views dan tautan lokal sesudah readback akhir.

## Batas penerimaan

Ini penerimaan development, bukan deployment produksi atau benchmark kualitas/latency populasi besar. Trial nyata adalah contoh terarah; tidak menetapkan p50/p95 yang representatif. Secret filter dan admission tidak menjamin deteksi semua rahasia atau interpretasi sempurna. Riwayat dapat diperiksa pengguna; recall otomatis hanya fakta current. File/result tersedia melalui API source exact dengan keputusan eksplisit, belum melalui tombol capture khusus di UI. Task komputasi/browser tidak menerima tambahan personal memory; integrasi prompt memory berlaku Chat dan Task teks.

Forget segera mencabut penggunaan canonical. Penghapusan indeks melalui outbox dapat pending; kontrol menampilkan status itu. Tidak mengklaim chat/file/result asli, jawaban terkirim, backup atau turunan arbitrer ikut terhapus. Sesudah retry cap, operator meninjau kegagalan indeks sebelum requeue. Mem0 history SDK hanya berada di memori proses selama operation.
