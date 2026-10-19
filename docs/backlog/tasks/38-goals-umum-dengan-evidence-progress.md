# NG-038 · Goals umum dengan evidence progress

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873814babd1c1bcd089effb) · Readback: 2026-10-19T06:29:38.106391+00:00

| Property | Value |
| --- | --- |
| Ticket | 38 |
| Urutan | 16 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-018 · Pengaturan inspeksi dan koreksi memory](18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) |

<!-- notion-content:start -->
Tujuan: Goals umum dengan evidence progress.
Lingkup: **Aktif V1**. Identitas NG-038; Urutan delivery 16.
## Acceptance criteria
- [x] Goal memiliki success criteria, revision, status active/paused/completed/archived, next action dan hubungan optional task/schedule.
- [x] Pembuatan Goal tidak otomatis memberi izin eksekusi atau menjadwalkan pekerjaan; user meninjau tindakan yang diperlukan.
- [x] Task gagal tidak menyelesaikan Goal; perubahan target dan pause mempunyai dampak eksplisit pada future work; P17/P09.
## Spesifikasi dan bukti
[03 · Perilaku Agent](../../product/03-agent.md) · [REA-4 · Memory & Goals](../../research/muse-ai-v1/evidence/memory.md)
## Dependencies
[NG-018 · Pengaturan inspeksi dan koreksi memory](18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md)
## Bukti penerimaan
Diterima development pada 19 Oktober 2026. Goal memiliki kriteria, horizon, next action, revision/plan_revision, status active/paused/completed/archived, bukti per kriteria dan hubungan Task/Jadwal opsional. Panel dan chat menyiapkan proposal exact; pengguna menerapkan keputusan. Menyimpan Goal tidak membuat Task/Jadwal atau memberi izin eksternal. Task gagal tidak menyelesaikan Goal; edit target/kriteria/horizon meminta replan, sedangkan edit next action mempertahankan bukti. Pause/complete/archive menahan future work; Task yang sudah dibuat tetap mempunyai kontrol Stop terpisah.
make goal-inspect lulus 74 skenario P17/P09, termasuk ownership, stale/expired/replay, kegagalan Task, perubahan target, Result-only lineage, source deletion, parent budget dan rollback. Regresi Task 55, scheduler 82, file 47 dan quota 46 lulus; make check/build serta git diff --check lulus. Trial model nyata: CV Task selesai, bukti ditinjau, chat preview/retry, Jadwal skipped saat Goal paused dan halaman ditutup, lalu satu manual run berhasil sesudah resume/approval, completion dan archive/reload. Desktop 1440, mobile 390/320 diperiksa. Dua Task memakai total 2.232 unit model terkonfirmasi; invoice tidak diverifikasi.
Bukti repo: `docs/engineering/goals-38-acceptance.md`, `docs/engineering/goals-runtime.md`, `docs/engineering/evidence/goals-38/`. Goal fixture diarsipkan; Jadwal sekali tidak mempunyai future slot. Perubahan target/fault/races memakai inspector terkontrol; live Jadwal memakai teks. Ini penerimaan development, bukan deployment production atau benchmark populasi besar. NG-019/020 tetap pekerjaan berikutnya.
<!-- notion-content:end -->
