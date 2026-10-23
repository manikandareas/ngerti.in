# Browser continuation dan engine Jev

Implementasi 23 Oktober 2026 mengikuti [riset Jev/E2B](../research/jev-browser-e2b-2026-10-23.md). PostgreSQL tetap menjadi otoritas task, queue dan resource; profil pengguna yang sudah ada tidak dihapus atau diganti.

## Perilaku dan arsitektur

Chat menyerahkan pekerjaan ke task durable dan langsung mengembalikan handle. Engine Jev di backend memilih operasi/target dari snapshot DOM transient. Runner terspesialisasi di E2B menjalankan observasi dan satu aksi melalui Browser Harness/CDP localhost. Ini adaptasi policy Jev Ultrafast terpin, bukan menjalankan `Agent.run()` upstream tanpa kontrol aplikasi. Snapshot upstream yang diadaptasi beserta lisensi MIT ada di `computer/jev_assets`.

Key TypeSafe, key model teks, credential database/storage dan key E2B tetap di backend. Pemanggilan model melewati broker internal `computer/jev.py`, yang mereservasi dan menyelesaikan biaya per call melalui ledger task. Pembuat teks memakai Responses API yang memang didukung konfigurasi Ngertiin; uji awal membuktikan helper Chat Completions upstream menerima HTTP400 pada konfigurasi ini, sehingga transport itu tidak dipakai.

Snapshot menolak halaman dengan field password/file/OTP/token/payment yang terdeteksi sebelum mengambil teks/value. DOM snapshot dan raw request tidak disimpan sebagai checkpoint. State task menyimpan hitungan langkah, feedback koreksi, progress terbatas, dan maksimal12 cuplikan evidence terlihat (800 karakter per cuplikan). Enam cuplikan terakhir dikirim sebagai referensi tidak tepercaya. Tidak ada capture saat human control; field classification tetap konservatif dan bukan jaminan mendeteksi semua data sensitif di setiap situs.

Satu target Chrome eksplisit diikat dalam sandbox; target itu diaktifkan sebelum DOM, screenshot dan takeover. Hilangnya target tidak diam-diam memilih tab lain. Referensi node diikat ke document hash dan context guard, dicek lagi sebelum dispatch. Model tidak dapat memasok selector/JavaScript/shell. SELECT mengikat opsi yang diamati; nilai TYPE_TEXT disiapkan sebelum approval.

`actuator.py` memberi barrier lokal dengan epoch, task identity, deadline dan file lock. Handoff menaikkan control version, mencabut authority, menunggu acknowledgement lokal dan drain koneksi/aksi sebelum human control. Resume mencabut input manusia, mengambil screenshot baru dan memakai epoch baru. Screenshot/DOM/input memakai barrier yang sama. Kebijakan approval kemudian diperbarui mengikuti instruksi pengguna: navigasi/pencarian rutin otomatis, mutation dan keamanan tetap exact approval; lihat [kebijakan izin komputer](computer-permissions-2026-10-23.md). Loopback CDP dan gateway viewer privat dipertahankan.

## Continuation dan failure

Migration `0019_browser_continuation` menambah `background_tasks.runtime_state` dan `browser_workspaces.heartbeat_at`. Tidak mengubah workflow_version atau menafsirkan ulang checkpoint lama. Migrasi sudah dijalankan pada database development aktif.

Keputusan model invalid, output invalid dan penolakan verifier mendapat maksimal dua koreksi per task, tetap memakai budget/call ceiling yang sama. Refusal dan invalid authorization tidak dipaksa menjadi aksi. Provider sementara gagal mendapat backoff/jitter melalui scheduled queue, bukan worker yang tidur. Repeated unchanged DOM mengalihkan pembacaan ke engine screenshot existing.

Attempt melakukan yield sebelum model/aksi dimulai jika waktu tersisa tidak cukup. Yield menyimpan state, mencabut lease dan enqueue atomik; scheduled yields dipisahkan dari batas failed attempts, dengan batas absolut sesi/budget tetap berlaku. Hard timeout dan worker recovery melanjutkan hanya jika workspace ready, control agent dan tidak ada receipt dispatched/unknown. Aksi dengan outcome belum pasti tetap menunggu rekonsiliasi. Stop tidak memberikan otoritas kepada worker lama. Heartbeat mencegah operasi model yang sehat dianggap idle hanya karena timestamp aksi lama.

Candidate yang sudah tersimpan dikenali pada retry cleanup/publication, sehingga browser tidak dijalankan ulang hanya untuk membuat berkas yang sama. Verifier mengambil screenshot baru dan menilai objective browser secara terpisah; validasi filename/format/storage tetap dilakukan aplikasi setelahnya. Refusal/incomplete dari verifier tidak dianggap sukses.

Startup menangani timeout `xdpyinfo` sebagai readiness belum siap, bukan exception terminal langsung. Readiness Chrome/proxy memakai deadline45detik; port yang belum siap dilaporkan tanpa data halaman. Diagnostik browser verbose hanya dipakai probe fixture melalui env khusus, tidak aktif default.

## Aktivasi dan kompatibilitas

`make e2b-templates` membangun `ngertiin-desktop-v2` (2vCPU/4GiB, Python3.12.12, uv0.10.7, Browser Harness0.1.13). Template berhasil dibangun pada environment development; ID `gtzr7wybjv1q1v4m3j7g`. Task baru tidak menginstal paket saat startup. Kode actuator/snapshot terpercaya diunggah oleh adapter bersama lifecycle kontrol, tanpa key model.

Konfigurasi default dan `.env.example`:

```dotenv
E2B_COMPUTER_TEMPLATE=ngertiin-desktop-v2
COMPUTER_ENGINE=jev
COMPUTER_MAX_STEPS=24
COMPUTER_MODEL_CALLS=24
COMPUTER_TASK_SECONDS=1200
```

Env eksplisit dapat menimpa default. Workspace lama pada templatev1 tetap memakai profil yang sama. Jika interpreter DOM belum tersedia, task mencatat fallback ke screenshot, bukan menghapus profil atau menginstal software diam-diam. Memilih `COMPUTER_ENGINE=screenshot` mematikan seleksi Jev untuk task baru; existing task memakai policy snapshot saat admission.

Batas waktu dapat dikonfigurasi sampai3600detik, langkah sampai120 dan model calls sampai180 untuk pilot. Perubahan itu harus disertai admission allowance/resource yang cukup; bukan akses tanpa batas. Default20menit/24langkah tetap dipertahankan. Sesi approval/takeover masih mempunyai deadline resource; expiry tetap membutuhkan continuation/retry yang sesuai, bukan memperpanjang compute tanpa admission. Full-memory pause dan rekonstruksi unsaved form belum menjadi default; profil disimpan melalui filesystem pause seperti sebelumnya.

## Validasi

- Inspector komputer existing:51 skenario lulus.
- Inspector continuation baru:14 skenario lulus, termasuk koreksi keputusan/output, yield, progress lintas execution, heartbeat, read recovery, unknown action tanpa replay, local human/stale-epoch rejection, display timeout, kompatibilitas legacy, stale approval, dan commit sebelum shutdown.
- Regresi Task:56, Sandbox:45, Usage:49 skenario lulus pada database disposable. Satu run Usage sempat gagal pada assertion allowance; reproduksi admission terisolasi menghasilkan429 yang benar dan pengulangan suite lengkap lulus49.
- Uji nyata TypeSafe dan model teks: keputusan field serta nilai Lisbon lulus pada database disposable.
- Uji nyata E2B/Jev: form sintetis di browser, exact approval ketik/klik, hasil Lisbon/Casa Flora, verifier independen, publication, native TypeSafe cost events dan penghapusan resource lulus. Screenshot hasil diperiksa secara visual. Tidak ada submission ke situs eksternal: fixture mengganti DOM test yang dikendalikan probe.
- `make check`, `make build`, dan `make docs-check` dijalankan. Semua lulus; `git diff --check` dan validasi sintaks snapshot JavaScript juga lulus.

Perintah:

```sh
make browser-runtime-inspect
make computer-inspect
make task-inspect
make sandbox-inspect
make usage-inspect
make jev-browser-probe
```

`jev-browser-probe` eksplisit membuat model/E2B calls berbayar, database disposable, dan owner fixture. Resource fixture dihapus dalam finally. `scripts/probe_jev_browser.py --live --models-only` memeriksa kompatibilitas model tanpa membuat desktop.

Batas bukti: smoke nyata ini tidak membuktikan reliabilitas semua situs, long-run30–60menit, login2FA pada setiap situs, atau dukungan penuh iframe/shadow/canvas/upload. Fallback mempertahankan kontrol/approval yang sama; private/opaque input memerlukan bantuan pengguna. Retained profilev1 dapat tetap memakai engine screenshot. Canary dan benchmark situs representatif tetap menjadi syarat sebelum klaim reliabilitas luas.

## Evidence akhir

- [Kontrak continuation](evidence/browser-continuation/continuation-contracts.json):14 skenario.
- [Probe nyata dan metrik](evidence/browser-continuation/jev-live.json):6 checks, termasuk penolakan worker stale saat human control dan penyelesaian sesudah resume.
- [Layar hasil](evidence/browser-continuation/result.png): tab yang terlihat menampilkan Results for Lisbon dan Casa Flora/free cancellation; diperiksa visual.
- [Probe provider](evidence/browser-continuation/provider-live.json):12 checks untuk ingress privat, VNC/RFB, internet publik, download, pause/resume, profil setelah worker restart dan delete.
- [Ringkasan validasi](evidence/browser-continuation/validation.json).

Run fixture terakhir memerlukan95,841detik wall clock termasuk startup, pergantian kontrol dan verification;4 execution attempts dan7 model calls memakai11.461 token-work. Latensi empat request Jev tercatat375–622ms; helper teks2.474ms. Estimasi ledger model+compute5.305microUSD (USD0,005305), bukan invoice atau proyeksi semua tugas. Ini satu smoke sintetis, bukan SLA atau benchmark situs luas. Resource probe tersisa0; satu resource profil existing tetap dipertahankan. Konfigurasi `.env` development diarahkan ke templatev2/Jev untuk resource baru; legacy profile memakai fallback kompatibel.
