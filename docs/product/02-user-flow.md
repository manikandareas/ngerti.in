# 02 · UX & User Flow

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381fda2dbea043a840c5a) · Readback: 2026-10-18T17:56:53.897Z

<!-- notion-content:start -->
Chat menjadi pintu utama; panel membantu pengguna menemukan pekerjaan, hasil dan kontrol yang hidup lebih lama dari satu respons. Soft Matcha dan primitive UI yang ada dipertahankan. Onboarding menghasilkan satu bantuan umum yang kecil, tidak meminta pengguna membuat artefak pembelajaran.

NG-032 diterima pada 18 Oktober 2026: shell desktop/mobile menyediakan Percakapan, Kemampuan Gwen, Penggunaan nyata dan Pengaturan akun/tema. Welcome mengisi draft tanpa mengirim; riwayat, draft, streaming, offline/reconnect, error/retry, focus dan reduced motion diverifikasi pada browser. NG-033 menambah Task teks, menu Task, progress/draft persisten, review exact, edit revision, stop/retry dan delivery ke thread asal; chat tetap dapat digunakan saat Task running/waiting_user. NG-034 menambah upload/reuse exact file revisions, pilihan halaman/baris, OCR Mistral, beberapa hasil file, review/edit per file, revision history, preview/download/delete serta menu File & hasil. Pembaruan mempertahankan revision siap terdahulu dan cache OCR; draft lampiran tetap sesudah reload/pengiriman gagal. Bukti: `docs/engineering/files-34-acceptance.md`. NG-036 menambah browser pribadi, VNC, takeover privat dan login lintas Task; bukti pada `docs/engineering/computer-36-acceptance.md`. Goals, jadwal, memory dan pencarian Library penuh mengikuti tiket berikutnya. Bukti: `docs/engineering/task-33-acceptance.md`. Kontrak state/pemulihan dan bukti: `docs/engineering/shell-onboarding-32-acceptance.md` serta `docs/engineering/evidence/shell-32/`. File Pen walkthrough lama adalah bukti historis pembelajaran, bukan acceptance UI asisten umum.

## Chat dan sesi

Pengguna dapat berbicara pada main/side threads tanpa kehilangan draft atau jawaban.

**Alur:** Login → pilih/buat thread → kirim → lihat stream → stop/retry atau buka kembali history.

**State:** draft; queued/running/waiting_approval/cancelling; complete/failed/cancelled; offline/replaying.

**Input → output:** Teks, request key, cursor → pesan/progress/event seq durable.

**Kegagalan & pemulihan:** Reconnect mengambil snapshot dan replay sesudah cursor; retry dengan identitas stabil; draft tetap saat 429.

**Izin:** Account server mengikat thread; owner lain mendapat 404; token browser hanya untuk API.

**Biaya:** Baseline satu pesan pengguna mereservasi satu chat; text publik/approval commit, tanpa output release.

**Acceptance:** Login, dua thread, reload stream tanpa duplikasi, stop/retry, draft blocked, keyboard/mobile lulus; chat sambil Task menunggu ditutup NG-033.

Bukti modul: [REA-1 · Chat & Session](../research/muse-ai-v1/evidence/chat.md). Tiket: [NG-027 · Bersihkan UI dan persona awal](../backlog/tasks/27-bersihkan-ui-dan-persona-awal.md) · [NG-030 · Terima baseline V1 yang bersih](../backlog/tasks/30-terima-baseline-v1-yang-bersih.md) · [NG-032 · Shell onboarding dan walkthrough asisten umum](../backlog/tasks/32-shell-onboarding-dan-walkthrough-asisten-umum.md) · [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md).

## Task dan keputusan

Pengguna dapat memberi pekerjaan panjang sambil terus bercakap.

**Alur:** Permintaan → preview intent/batas → task → progress → review action exact bila perlu → hasil.

**State:** queued/running/waiting_user/succeeded/failed/cancelled; partial result terlihat.

**Input → output:** Intent, input revision, budget → Task, status, Approval dan Result references.

**Kegagalan & pemulihan:** Stale proposal ditolak; keputusan duplikat konsisten; unknown effect ditampilkan dan direkonsiliasi.

**Izin:** Approval berisi target/revision/scope exact; tidak membuka izin global; stop/reject selalu tersedia.

**Biaya:** Estimate dan max cap terlihat; waiting_user melepas worker/resource aktif sesuai TTL.

**Acceptance:** P02–P08: chat thread asal tetap menerima pesan; approve/reject setelah refresh, crash dan retry tidak menggandakan efek.

Bukti modul: [REA-2 · Task & Scheduler](../research/muse-ai-v1/evidence/task.md). Tiket: [NG-033 · Task background dan approval umum](../backlog/tasks/33-task-background-dan-approval-umum.md).

## File hasil dan Library

Pengguna dapat membuka hasil yang sudah selesai dan menemukan pekerjaan lama.

**Alur:** Attach → progress upload/extraction → task → result card → preview/download → Library/search.

**State:** uploading/ready/failed/deleted; constructing/ready/updating/failed/interrupted.

**Input → output:** File revision immutable/query → attachment, result manifest, daftar milik account.

**Kegagalan & pemulihan:** Format tak didukung, upload putus, input hilang dan preview gagal mempunyai recovery; hasil parsial tetap ditandai.

**Izin:** Download/preview/search owner-scoped; preview HTML terisolasi dari origin dan cookie aplikasi.

**Biaya:** Ukuran/retention/compute cap eksplisit; reuse revision tidak otomatis mengulang biaya parsing.

**Acceptance:** P09/P12/P13/P28; hasil dapat dibuka setelah sandbox dibuang; search tidak membocorkan resource dihapus/revoke.

Bukti modul: [REA-3 · File & Artifact](../research/muse-ai-v1/evidence/file.md). Tiket: [NG-034 · File produk dan hasil tersimpan](../backlog/tasks/34-file-produk-dan-hasil-tersimpan.md) · [NG-039 · Library pencarian dan penemuan kemampuan](../backlog/tasks/39-library-pencarian-dan-penemuan-kemampuan.md).

## Panel komputer dan takeover

Pengguna melihat serta mengendalikan lingkungan eksekusi yang sama dengan agent. NG-036 diterima development pada **2026-10-19**: satu workspace/profil browser pribadi per account, login digunakan kembali lintas Task setelah compute stop/start. Pilih Gunakan browser pribadi pada Task, lalu Lihat komputer; panel tersedia pada desktop/mobile. Laporan `docs/engineering/computer-36-acceptance.md`.

**Alur:** Task membutuhkan browser → buka panel VNC/live desktop → ambil alih bila perlu → backend handoff → login/input manusia → kembalikan → observasi baru → agent lanjut → persist hasil → tutup browser dengan benar dan hentikan komputasi, pertahankan profil. Task berikutnya memakai workspace yang sama dan memeriksa login.

**State:** starting/ready/stopped/failed; control agent/handoff/human/resuming; reconnecting; menunggu workspace atau bantuan login. Satu Task atau pengendali manusia memegang workspace pada satu waktu; Task browser lain mengantre.

**Input → output:** Session identity, control revision, pointer/keyboard → stream layar, acknowledgement dan state terkini. Panel menampilkan pekerjaan, pemegang kendali dan langkah yang dibutuhkan pengguna; chat tetap dapat digunakan. Desktop memakai panel lebar dan mobile tampilan penuh.

**Kegagalan & pemulihan:** Viewer expired/revoked, disconnect, aksi agent in-flight dan race dua tab tidak memberi dua pengendali. Putusnya koneksi saat kendali manusia tidak otomatis mengaktifkan agent. Unknown external effect diperiksa sebelum retry dan menahan penggunaan workspace berikutnya. Saat kembali, agent membaca keadaan terbaru; perubahan halaman tidak diam-diam mengubah tujuan Task.

**Login dan privasi:** Pengguna login sendiri melalui takeover; observasi model dan rekaman dihentikan selama input privat. Password tidak diminta lewat chat atau dijadikan memory. Cookie/data autentikasi tidak diekspor ke prompt, log, hasil atau runtime Python. Login dapat kedaluwarsa atau meminta 2FA; Gwen meminta bantuan lagi. Konten halaman setelah resume tetap mengikuti scope Task.

**Kontrol:** Tutup panel menutup viewer; Task dapat melanjutkan dalam batasnya. Hentikan Task mencabut kendali dan menghentikan eksekusi, mempertahankan profil serta hasil tersimpan. Reset browser dan hapus login tersimpan memerlukan konfirmasi setelah seluruh akses aktif dicabut; File/Result tetap tersedia. Logout satu situs dapat dilakukan di browser.

**Izin:** Backend memeriksa owner/grant/lease setiap perubahan kendali dan aksi; viewOnly di browser tidak cukup. Login tersimpan dan takeover tidak memberi izin aksi global; approval aksi eksternal terikat target/isi/revision dan terpisah dari review hasil.

**Biaya:** Runtime/idle/storage/egress cap dan lifecycle terlihat. Waktu komputasi aktif terpisah dari retensi/ukuran profil; habisnya waktu Task menghentikan komputasi tanpa menghapus login. Menunggu manusia tidak menahan worker; resource yang masih hidup tetap dibatasi dan dicatat biayanya.

**Acceptance:** Login nyata Task A dipakai Task B setelah stop/start; VNC takeover/input privat mobile, fresh observation, reconnect tanpa auto-resume, approval Logout, SIGKILL/idle stop, reset profil dan hasil persisten diuji. Owner/two-tab/expiry/stale/unknown/queue memakai 47 kontrak terkontrol. Desktop 1280x900/mobile emulasi 390x844; archive tidak dipakai. Bukti dan batas situs/2FA/production pada `docs/engineering/computer-36-acceptance.md`.

Bukti modul: [REA-6 · Browser & Computer](../research/muse-ai-v1/evidence/computer.md). Tiket: [NG-031 · Validasi Daytona dengan trial terbatas](../backlog/tasks/31-validasi-daytona-dengan-trial-terbatas.md) · [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) · [NG-036 · Browser VNC live desktop dan takeover](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md).

## Jadwal goals dan kontrol pribadi

Pengguna menemukan dan mengubah pekerjaan yang berjalan saat offline.

**Alur:** Simpan Goal/success criteria → task atau Schedule optional → review zona/waktu/cap → pause/edit/run now → outcome. Memory/persona bisa ditinjau dari Settings.

**State:** Goal active/paused/completed/archived; Schedule active/paused/deleted; occurrence queued/running/succeeded/failed/skipped/blocked_budget.

**Input → output:** Goal revision, instruksi, IANA timezone/recurrence → next action, preview waktu, occurrence dan delivery.

**Kegagalan & pemulihan:** Pause schedule tidak diam-diam membatalkan task berjalan; downtime mengikuti misfire policy, budget habis mempunyai reason.

**Izin:** Mencatat Goal tidak memberi grant/action/schedule otomatis; koreksi/forget/mute tetap tersedia.

**Biaya:** Per-run cap dan frekuensi ditampilkan; actual cost dan hasil tetap terlihat walau proactive cap habis.

**Acceptance:** P14–P23; user offline kembali melihat satu outcome; koreksi memory berpengaruh sesudah reload.

Bukti modul: [REA-4 · Memory & Goals](../research/muse-ai-v1/evidence/memory.md). Tiket: [NG-016 · Perubahan soul atas permintaan dan HITL](../backlog/tasks/16-perubahan-soul-atas-permintaan-dan-hitl.md) · [NG-017 · Memory aktif capture evidence dan recall](../backlog/tasks/17-memory-aktif-capture-evidence-dan-recall.md) · [NG-018 · Pengaturan inspeksi dan koreksi memory](../backlog/tasks/18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md) · [NG-037 · Scheduler pengguna saat offline](../backlog/tasks/37-scheduler-pengguna-saat-offline.md) · [NG-038 · Goals umum dengan evidence progress](../backlog/tasks/38-goals-umum-dengan-evidence-progress.md) · [NG-019 · Kandidat proaktif dinamis dan reranking](../backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md) · [NG-020 · Delivery proaktif per thread dan batas global](../backlog/tasks/20-delivery-proaktif-per-thread-dan-batas-global.md).

## Pengolahan data Python NG-035

Form Task menyediakan pilihan Hitung dan olah data dengan Python. Pengguna memilih lampiran/rentang, instruksi, output dan review opsional. CSV/JSON yang dilampirkan melalui composer memakai komputasi offline; chat juga dapat membuat Task komputasi melalui tool yang tersedia.

Progres membedakan persiapan program, provisioning, pengolahan, pemeriksaan/penyimpanan dan cleanup yang belum pasti. Pengguna tetap dapat bercakap. Review berlaku pada finalisasi hasil; candidate sudah tersimpan sehingga sandbox tidak hidup hanya untuk menunggu keputusan. Ringkasan dapat direvisi, bytes candidate tetap dan seluruh file dapat diunduh untuk ditinjau.

Hasil sukses tetap dapat dipreview/diunduh setelah sandbox dihapus. Update Result mempertahankan runtime asal. Stop mencabut eksekusi; pending cleanup/unknown memerlukan pemeriksaan sebelum retry. Walkthrough desktop/mobile dan bukti terdapat pada `docs/engineering/sandbox-35-acceptance.md`. [NG-035 · Eksekusi kode dalam sandbox](../backlog/tasks/35-eksekusi-kode-dalam-sandbox.md) diterima lokal; browser interaktif mengikuti NG-036.
<!-- notion-content:end -->
