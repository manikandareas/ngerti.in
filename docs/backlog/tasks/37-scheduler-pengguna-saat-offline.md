# NG-037 · Scheduler pengguna saat offline

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873813a9603fb38d0df673f) · Readback: 2026-10-19T02:50:59.561159+00:00

| Property | Value |
| --- | --- |
| Ticket | 37 |
| Urutan | 12 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) |

<!-- notion-content:start -->
Tujuan: Scheduler pengguna saat offline.
Lingkup: **Aktif V1**. Identitas NG-037; Urutan delivery 12.
## Acceptance criteria
- [x] Schedule menyimpan intent, timezone IANA, recurrence/one-shot, revision, target thread, per-run cap, next_due; preview waktu dapat ditinjau.
- [x] Interval setiap N jam tersedia melalui form/chat, dihitung dari waktu mulai dengan preview tiga slot, kompatibel dengan jadwal lama dan tetap mengikuti kontrol Task.
- [x] Occurrence unik schedule/revision/intended_at menciptakan satu task dan delivery; worker tetap berjalan saat browser pengguna tertutup.
- [x] Default overlap skip saat occurrence terdahulu aktif, misfire coalesce satu occurrence terbaru, budget habis blocked_budget tanpa retry berbiaya.
- [x] Edit/pause hanya mengubah future occurrence; user memilih stop task yang sudah berjalan secara eksplisit; P18/P19/P20/P23.
## Spesifikasi dan bukti
[04 · Arsitektur, Runtime & Kontrak](../../product/04-arsitektur-dan-delivery.md) · [REA-2 · Task & Scheduler](../../research/muse-ai-v1/evidence/task.md)
## Dependencies
[NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md)
## Bukti penerimaan
**Diterima pada 2026-10-19 WITA di development lokal.** Migration incremental 0006_user_schedules tanpa reset menambah jadwal, revision immutable, preview keputusan dan occurrence unik. Chat dapat menyiapkan create/update/pause/resume/delete/run-now; kartu pengguna menerapkan perubahan exact. Panel Jadwal menampilkan Upcoming, kontrol dan 50 riwayat eksekusi dengan Task/hasil serta percakapan asal.
Walkthrough nyata: jadwal sekali jalan 10.14 WITA dipicu ketika halaman Ngertiin sudah dinavigasikan ke about:blank. Occurrence 1fc9c246-73f8-5c08-a96a-3f2125495ae1 menghasilkan satu Task 3542c668-6725-4379-b6ab-69fbb4de2ab6 dan satu delivery. Hasil tetap terlihat setelah aplikasi dibuka kembali; satu panggilan model, 2.806 token confirmed. Chat nyata membuat jadwal Senin/Rabu, mengubah 09.00 ke 09.30, lalu menjedanya pada revision 3. Tidak ada eksekusi audit otomatis berikutnya.
make schedule-inspect lulus 52 skenario PostgreSQL/checkpoints sementara: duplikasi dispatcher, revision stale, rollback/restart, overlap termasuk waiting_user, misfire coalesce, IANA/DST fold dan waktu hilang, budget atomik, tanpa charge chat otomatis, ownership serta input terhapus. Regresi Task55/quota46/File47, make check/build, docs-check dan diff-check lulus. Desktop1280x900/mobile emulasi390x844 dan320x640 diperiksa, tanpa overflow horizontal.
Laporan repo: `docs/engineering/schedule-37-acceptance.md`; desain: `docs/engineering/scheduler-runtime.md`; bukti: docs/engineering/evidence/schedule-37/live-readback.json dan controlled-contracts.json. Loop per menit tidak menjanjikan presisi detik. Walkthrough scheduled runtime nyata memakai teks; browser/Python memakai jalur Task dan kontrol yang sudah ada, tanpa klaim seluruh provider diuji ulang. Proaktivitas/quiet-hours production, email/push/WhatsApp, event-driven connectors dan invoice belum dicakup. P23 membuktikan jalur hasil terjadwal independen dari proaktivitas yang belum diimplementasikan.
Rujukan pengalaman Muse: Upcoming, schedules/runs, riwayat, run-now/delete dan scope permission schedule dari REA-2. Overlap/misfire/DST/idempotensi adalah kebijakan Ngertiin, bukan klaim backend Muse.
Hard per-task/resource/account cap serta cost telemetry wajib ada sejak capability pertama digunakan; paket komersial menyusul benchmark.
## Perluasan diterima: interval setiap N jam
Ditambahkan atas persetujuan pengguna pada 2026-10-19. Form “Setiap beberapa jam” dan tool chat mendukung `frequency=interval`, `interval_hours` bilangan bulat 1–8760. Tanggal/pukul mulai menjadi anchor: setiap 3 jam mulai 09:00 → 12:00 → 15:00 → 18:00, termasuk lintas malam. Preview menampilkan tiga slot berikutnya; aktivasi setelah anchor memilih slot masa depan. Durasi dihitung dalam UTC, bukan sejak Task selesai; resume dan run-now tidak menggeser anchor. Jam lokal dapat bergeser saat DST; anchor yang hilang ditolak dan fold pertama dipakai untuk waktu berulang.
Backend, API, form, ringkasan jadwal dan pengelolaan melalui chat memakai kontrak yang sama. Aturan overlap skip, misfire coalesce, per-run/account/global budget, preview keputusan dan idempotensi tetap berlaku. Tidak memerlukan migration tambahan; jadwal/proposal lama dan replay request key kalender tetap kompatibel.
Bukti development: `make schedule-inspect` kini lulus 82 skenario, termasuk 30 tambahan interval/kompatibilitas. Jadwal interval 3 jam dengan anchor 07.47 WITA dipicu secara alami pukul 10.47 ketika halaman aplikasi berada di about:blank; satu Task succeeded dan satu delivery, satu panggilan model `gpt-6-luna`, 903 token confirmed. `next_due` maju ke 13.47 WITA, lalu jadwal audit dijeda revision 2. Chat nyata menghasilkan preview setiap 2 jam mulai 2026-10-20 09.00 WITA, dengan slot 09.00/11.00/13.00; usulan audit ditolak agar tidak aktif. Kartu pada viewport 320×640 tidak overflow horizontal.
`make check`, `make build`, `make docs-check` dan diff-check lulus. Bukti tambahan repo: `docs/engineering/evidence/schedule-37/interval-readback.json`, `interval-ui.jpg` dan `controlled-contracts.json`; rincian dalam `docs/engineering/schedule-37-acceptance.md`. Satu slot interval diuji live; pengulangan berjam-jam, DST, downtime dan races dibuktikan dengan probes terkontrol. Status NG-037 tetap Done; jadwal audit berulang tidak memiliki eksekusi otomatis berikutnya.
<!-- notion-content:end -->
