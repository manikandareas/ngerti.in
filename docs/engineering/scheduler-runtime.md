# Jadwal pengguna NG-037

Jadwal menghasilkan occurrence, lalu Task dan delivery yang sudah dimiliki domain Task/File/Result. Browser pengguna tidak menjalankan timer. Procrastinate memicu `schedule.dispatch` setiap menit di queue maintenance; PostgreSQL menyimpan definisi, revision, preview dan riwayat. Migration incremental `0006_user_schedules` tidak mereset data.

## Sumber desain

[REA-2](../research/muse-ai-v1/evidence/task.md) dan [kontrak frontend Muse](../research/muse-ai-v1/03-frontend-dan-kontrak.md) memperlihatkan Upcoming, schedules/runs terpisah, riwayat, run-now/delete/subscription serta permission scope schedule. Pengelolaan melalui chat tercatat pada dokumentasi vendor. Schema/backend scheduler Muse, DST, overlap, misfire dan jaminan retry/offline belum dibuktikan dari snapshot. Kebijakan berikut adalah keputusan Ngertiin, bukan klaim implementasi internal Muse.

## Definisi dan review

`ScheduleSpec` menyimpan judul, instruksi, IANA timezone, tanggal mulai, HH:MM, sekali/harian/mingguan (Senin=0)/interval per jam, runtime teks/Python/browser, review hasil, input revision/rentang exact, output spec dan batas kerja per run. Interval memakai `frequency=interval` dan `interval_hours` bilangan bulat 1–8760. Zona tidak mengikuti perpindahan perangkat secara diam-diam.

Semua mutasi melewati preview tersimpan selama 30 menit: create/update/pause/resume/delete/run. Owner berasal dari sesi server. Request key dan fingerprint mencegah pengulangan permintaan dengan identitas sama dan isi berbeda. Kartu memuat instruksi, thread tujuan, tiga waktu berikutnya jika ada, izin, input dan batas kerja. Keputusan bind ke proposal dan expected revision. Replay keputusan sama konsisten; keputusan berlawanan, revision stale dan approval kedaluwarsa ditolak.

Chat memakai `read_user_schedules` dan `preview_schedule`. Model hanya menyiapkan proposal; tombol pengguna menerapkannya. Task/runtime lain tidak menerima tool mutasi jadwal. Source run harus masih memiliki lease saat membuat proposal. Isi file, halaman dan history tetap data, bukan grant.

Instruksi dan konteks thread ditangkap saat preview. Setiap revision immutable menyimpan context snapshot. Run terjadwal tidak diam-diam mengambil instruksi dari pesan baru. Input tetap menunjuk revision file yang sama; kehilangan input menghasilkan failure jelas, tanpa mengganti file. Pause/delete tetap tersedia walaupun input hilang.

## Waktu dan occurrence

- Waktu lokal dikonversi melalui `zoneinfo`. Waktu DST yang tidak ada dilewati; waktu berulang memakai fold pertama satu kali. One-shot pada waktu yang hilang/past ditolak ketika tidak mempunyai waktu berikutnya.
- Interval memakai tanggal/pukul mulai sebagai anchor, kemudian menambah durasi UTC tetap. Setiap 3 jam mulai 09:00 berarti 09:00 → 12:00 → 15:00 → 18:00, terus melewati tengah malam. Saat diaktifkan setelah anchor, preview memilih slot berikutnya; tidak menjalankan seluruh slot masa lalu. Waktu selesai Task, resume dan run-now tidak menggeser anchor. Edit interval menghitung ulang future slots dari anchor yang ditinjau.
- Pada perubahan DST, jarak interval tetap N jam nyata sehingga jam lokal dapat bergeser/berulang. Anchor yang tidak ada ditolak; anchor berulang memakai fold pertama. Pencarian slot interval dan misfire memakai aritmetika langsung, termasuk setelah downtime panjang. Kebijakan kalender harian/mingguan tetap mengikuti jam lokal.
- Preview dan dispatcher memakai fungsi waktu yang sama. Tanggal didukung tahun 2000–2100; tidak ada parser cron atau job per browser.
- Identitas otomatis deterministik: schedule/revision/intended_at. Constraint unik juga mengikat trigger scheduled/manual. Run-now memakai identitas proposal tersendiri, tidak menggeser recurrence atau melanjutkan jadwal yang dijeda.
- Setelah downtime, dispatcher mengambil satu intended time terbaru dan memajukan next_due melewati waktu sekarang. Tidak membuat burst seluruh waktu yang terlewat.
- Jika Task occurrence sebelumnya queued/running/waiting_user atau mempunyai outcome unknown, occurrence baru dicatat skipped. Tidak membangun antrean jadwal yang tak terbatas.
- Tick dibatasi 50 jadwal, jumlah jadwal nondeleted 100/account dan 1000 global. Polling per menit dan antrean worker dapat menunda start; ini bukan jaminan presisi detik/SLA production.

## Transaksi dan izin

Lock berurutan account → thread → schedule. Dispatcher membaca kandidat tanpa memegang lock, lalu mengecek ulang state/revision/next_due di dalam transaksi. Edit/pause dan due claim dilinearisasi pada lock yang sama. Jika claim lebih dulu membuat Task, pause/edit/delete tidak menghapus atau membatalkannya. Pengguna memilih Stop Task secara eksplisit.

Occurrence, admission budget, Task dan enqueue commit bersama. Savepoint menahan outcome admission yang ditolak sambil membatalkan Task/job parsial. Crash sebelum commit tidak meninggalkan occurrence setengah jadi; retry setelah commit tidak menghasilkan Task kedua. Hasil dan delivery tetap melalui manifest serta fencing Task yang sudah ada. Riwayat mengambil status langsung dari Task, bukan menganggap queue success sebagai task success.

Review scope mengikat runtime, instruksi, target thread dan file. Ownership/input/provider policy/admission diperiksa ulang saat dispatch. Runtime tidak mendapat akses tambahan karena pengguna offline. Browser pribadi mempertahankan exact approval, login/takeover, lease, shared compute caps dan cleanup NG-036; Python mempertahankan isolasi NG-035. Login/approval yang memerlukan pengguna tetap waiting_user dan tunduk deadline runtime.

## Budget dan delivery

Setiap Task memakai batas minimum antara per-run cap yang ditinjau dan task cap server saat admission. Batas akun/global dan ledger token-work yang ada tetap atomik; resource/storage/browser caps tetap diperiksa domain runtime. Budget nol menghasilkan blocked_budget tanpa membuat Task, job berbiaya atau retry occurrence tersebut setiap tick. Kapasitas Task penuh dicatat skipped dengan alasan. Occurrence berikutnya diperiksa kembali secara normal.

Pemicu otomatis tidak membuat pesan user dan tidak mereservasi satu chat. Membuat preview/memutuskan lewat panel juga tidak memakai chat; permintaan melalui chat memakai kuota percakapan normal. Eksekusi aktual tetap dicatat sebagai penggunaan Task/model/resource. Unit kerja dan estimasi resource bukan invoice atau harga komersial.

Delivery ke target thread memakai idempotensi `task_deliveries`, lalu snapshot/replay percakapan. Hasil yang diminta tidak bergantung pada candidate/cap proaktif. NG-019/020 belum diimplementasikan; acceptance sekarang membuktikan independensi alur hasil terjadwal, bukan pengujian counter proaktif production. Email/push/WhatsApp dan scheduler berbasis connector event tidak ditambahkan.

## API dan UI

- GET `/schedules`: Upcoming, pending proposals yang belum expired, dan 50 occurrence terbaru milik owner.
- POST `/schedules/proposals`: validasi dan simpan preview exact.
- POST `/schedules/proposals/{id}/decision`: approve/reject idempotent.
- Panel Jadwal: sekali/harian/pilih hari/setiap beberapa jam, file/output, timezone/cap, preview, edit/pause/resume/delete/run-now dan riwayat. Chat juga menerima permintaan setiap N jam melalui tool preview yang sama.
- Proposal chat muncul pada transcript thread asal; chat tetap dapat dipakai sambil menunggu keputusan proposal jadwal.
- Riwayat membuka Task, hasil, approval, usage dan percakapan asal. Delete merupakan soft deletion jadwal; revision, occurrence, Task dan hasil tersimpan tidak ikut dihapus.

## Verifikasi

`make schedule-inspect` menggunakan PostgreSQL/checkpoints sementara dan model terkontrol untuk timing, races, ownership, stale proposal, budget, rollback dan delivery. Database probe dibuang. `make task-inspect`, `make quota-inspect`, `make files-inspect`, `make check`, `make build` serta `make docs-check` melindungi integrasi yang dipakai kembali. Walkthrough model nyata dan batas bukti dicatat dalam [laporan penerimaan](schedule-37-acceptance.md).
