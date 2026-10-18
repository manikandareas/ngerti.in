# NG-032 · Shell, onboarding, dan walkthrough

Penerimaan lokal: 18 Oktober 2026. Scope: [NG-032](../backlog/tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md), mengikuti [kontrak UX](../product/02-user-flow.md).

## Perilaku yang tersedia

- Navigasi Percakapan, Kemampuan Gwen, Penggunaan, dan Pengaturan pada rail desktop atau sheet mobile. URL mempertahankan thread dan view; kembali ke chat mempertahankan draft. Chat tetap mounted selama membuka halaman workspace sehingga stream tetap berjalan.
- Welcome pada percakapan kosong menawarkan tiga contoh konkret. Pilihan mengisi composer dan memindahkan fokus, tanpa mengirim. Contoh dinonaktifkan selama ada draft agar tulisan tidak tertimpa. Pengguna dapat langsung menulis tanpa wizard/profil awal.
- Main/side chat, riwayat, pencarian judul, streaming, stop, pengiriman ulang, dan replay memakai kontrak backend yang ada. Entry yang gagal dimuat mempunyai tindakan pemulihan.
- Penggunaan membaca `/quotas`: sisa, limit, used, reserved, waktu reset perangkat, loading, error, stale-data notice, dan keadaan kuota habis. Riwayat dan navigasi tetap tersedia ketika kuota habis.
- Pengaturan menyediakan akun Clerk, pilihan terang/gelap, pintu Usage, serta status persona/memory. Enam kemampuan mendatang ditandai **Belum tersedia**, tanpa daftar pekerjaan/hasil sintetis.
- Offline mempertahankan editor dan memblokir kirim; reconnect ditampilkan juga ketika koneksi SSE pertama gagal. Error sinkronisasi dengan snapshot yang sudah tersedia mempertahankan transcript dan menyediakan pemulihan.
- Sheet memiliki judul/deskripsi dan tombol tutup berbahasa Indonesia. Escape mengembalikan fokus ke pembuka; pemilihan halaman dari menu mobile memindahkan fokus ke heading tujuan. Reduced motion mencakup komponen sheet/popover dan transisi tombol.

## Kontrak navigasi dan state fitur berikutnya

NG-032 memasang entry/status kemampuan serta pola tampilan loading/error/empty/unavailable. State domain berikut adalah rancangan untuk tiket integrasinya; belum merupakan runtime produk yang diterima.

| Permukaan | Posisi dan state pada 032 | State/pemulihan saat integrasi berikutnya |
| --- | --- | --- |
| Chat | Navigasi utama; welcome kosong, loading, error/retry, running, cancelled, offline/reconnecting | Riwayat/replay durable dan draft per account/thread tetap dipakai |
| Task | Kemampuan Gwen: belum tersedia | Empty mengajak memulai lewat chat; queued/running/waiting_user; failure/partial result, stop/retry; NG-033 |
| Hasil/file | Kemampuan Gwen: belum tersedia | Empty menjelaskan hasil tersimpan; upload/progress, ready, failed/interrupted; exact revision dan preview/download; NG-034/039 |
| Jadwal | Kemampuan Gwen: belum tersedia | Empty mengajak membuat jadwal; loading/list, pause/edit, failed/blocked_budget; outcome tidak hilang; NG-037 |
| Goals | Kemampuan Gwen: belum tersedia | Empty menjelaskan tujuan; active/paused/completed/archived, failed progress/replan; NG-038 |
| Persona/memory | Pengaturan dan Kemampuan Gwen: belum tersedia | Loading/empty, evidence, koreksi/forget, conflict dan pemulihan; NG-016–018 |
| Usage | Navigasi utama dan Pengaturan; data nyata, loading/error/retry, cached-data notice, quota zero | Compute allowance dan harga komersial mengikuti NG-040–022 |
| Komputer | Entry penjelasan pada Kemampuan Gwen; belum tersedia | Panel kontekstual dari Task; starting/ready/stopped/failed, expired viewer/reconnect, exclusive takeover; NG-035/036 |

## Environment dan metode

- Host macOS; UI `http://127.0.0.1:3000`, API `http://localhost:8000`, PostgreSQL/MinIO lokal; API/worker host. Readiness kembali ready setelah proses development sebelumnya berhenti dan stack dinyalakan ulang.
- Browser Chromium headless 148, lewat agent-browser dengan klik, pengetikan, keyboard, screenshot, dan pembacaan snapshot/API. Viewport 1280×577/800, 390×844, 320×568, serta 390×400 untuk ruang vertikal pendek. Ini emulasi viewport browser, bukan uji perangkat iOS/Android fisik atau keyboard OS mobile.
- Clerk development dengan akun sintetis baru, tanpa auth bypass aplikasi. Main thread awal mempunyai nol pesan dan tidak ada run. Satu akun development yang sudah ada dipakai untuk smoke awal tanpa mengganti isi chatnya.
- Model backend `gpt-6-luna`. Satu jawaban nyata menyelesaikan bantuan menulis; stop dilakukan pada permintaan kedua. Tidak ada provisioning Daytona, Task, scheduler, upload produk, atau pembayaran dalam penerimaan ini.
- Pengujian dilakukan sebagai walkthrough langsung dan observasi sementara; tidak menambahkan suite otomasi/unit baru ke repo.

## Acceptance dan bukti

| Kriteria tiket | Expected dan hasil yang diamati | Bukti |
| --- | --- | --- |
| Pengguna baru mulai dari chat dan mendapat keberhasilan kecil | Login akun baru membuka welcome. Memilih contoh mengisi draft/fokus, sementara server masih nol pesan dan run null. Draft bertahan melewati panel Usage dan reload. Setelah kirim, satu jawaban nyata tersimpan dan terbuka kembali sesudah reload. | [Welcome desktop](evidence/shell-32/onboarding-desktop.png), [hasil pertama](evidence/shell-32/first-result.png), [runtime usage](evidence/shell-32/runtime-usage.json) |
| Navigasi dan state untuk seluruh permukaan | Empat tujuan workspace dapat dibuka. Usage memakai data nyata; kegagalan request memberi retry dan pulih. Kemampuan mendatang berjumlah enam dan semuanya belum tersedia. Kontrak domain berikutnya dicatat pada tabel di atas. | [Capabilities](evidence/shell-32/capabilities-desktop.png), [Usage desktop](evidence/shell-32/usage-desktop.png), [Usage mobile](evidence/shell-32/usage-mobile.png), [Usage error](evidence/shell-32/usage-error.png), [history error](evidence/shell-32/history-error.png) |
| Desktop/mobile, keyboard/focus/reduced motion/reconnect dan status jujur | Tidak ada horizontal overflow pada 320/390 px; composer berada pada y=360 pada tinggi 400 px dan transcript dapat discroll. Enter mobile menghasilkan newline tanpa pesan server. Escape desktop mengembalikan fokus dengan outline 3 px; navigasi mobile memfokuskan heading. Reduced motion menghasilkan transition duration 0.00001 s. | [Welcome mobile](evidence/shell-32/onboarding-mobile.png), [chat mobile](evidence/shell-32/chat-mobile.png), [menu mobile](evidence/shell-32/menu-mobile.png), [tema gelap](evidence/shell-32/settings-dark.png), [observasi terstruktur](evidence/shell-32/browser-observations.json) |

### Pemulihan dan kontinuitas

- Saat run pertama berstatus **running**, membuka Pengaturan berhasil. Kembali ke chat menghasilkan satu pesan pengguna dan satu jawaban assistant, tanpa duplikasi. Run `03ea3451-3282-42e8-bc72-0efcf8dc1fac` menjadi complete.
- Request submit kedua sengaja diblokir pada browser. Draft tetap ada, error belum terkirim muncul, dan pending request identity tetap satu. Mengirim kembali sesudah blok dicabut menghasilkan satu pesan server untuk input tersebut.
- Stop nyata pada run `ae84de43-8bf2-43e5-88b4-4af4f11e6d74` menghasilkan cancelled, notice yang dapat dipahami, dan reservasi selesai. Snapshot akhir main thread: empat pesan (dua user, satu jawaban complete, satu assistant cancelled tanpa teks), `through_seq=21`, used=1, reserved=0, remaining=99. [Stop](evidence/shell-32/stop-desktop.png).
- Browser offline mempertahankan draft dan memblokir kirim. [Offline mobile](evidence/shell-32/offline-mobile.png).
- Request SSE pada main thread sengaja diblokir lalu dipulihkan. Sebelum pemulihan banner reconnect tampil; sesudah pemulihan banner hilang. Draft sama dan dua assistant message tetap dua. [Reconnect](evidence/shell-32/reconnecting.png).
- GET riwayat dan kuota sengaja digagalkan dengan network interception; UI error terpisah dari empty state dan retry memulihkan data.
- Kuota nol diuji dengan respons fixture di browser, bukan menghabiskan/mengubah saldo database. UI menunjukkan nol, mempertahankan draft, dan menonaktifkan kirim; Usage/riwayat tetap dapat dibuka. Fixture dihapus setelah uji. [Quota zero fixture](evidence/shell-32/usage-zero-fixture.png).

### Usage dan batas bukti

Jawaban pertama melaporkan 214 input token dan 44 output token, total 258 token. Run cancelled tidak melaporkan usage; ini tidak ditafsirkan sebagai biaya provider nol. Bukti menyimpan telemetry token dan settlement kuota, bukan nominal invoice provider. Tidak ada aksi berbayar sandbox/browser pada scope ini.

Run-level retry sesudah model failure, worker crash, dan cross-owner backend enforcement tidak diulang sebagai fault injection baru di NG-032. Kontrak backend tetap mengikuti [baseline NG-030](baseline-v1-acceptance.md); pengiriman ulang setelah transport submit gagal, SSE reconnect, serta stop di atas diuji baru. Kemampuan Task/approval umum dan hasil file tetap mengikuti tiket masing-masing.

## Pemeriksaan akhir

- `make check` lulus: Biome, TypeScript, Ruff check/format, dan mypy.
- `make build` lulus. Peringatan bundler dependency tentang directive `use client` tetap non-fatal; tidak ada error build.
- `git diff --check` lulus. Tidak ada dependency baru, migrasi, atau perubahan kontrak API/backend.
- Bukti screenshot dan JSON berada di [direktori evidence](evidence/shell-32/); [manifest evidence](evidence/shell-32/manifest.json) mencatat SHA-256 setiap artifact.
- Status Notion, checklist tiket, dokumen UX/operasi, empat view, serta mirror dan manifest dibaca ulang setelah penutupan.
