# NG-016 · Perubahan soul atas permintaan dan HITL

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381469879f976651f1717) · Readback: 2026-10-19T03:42:13.950127+00:00

| Property | Value |
| --- | --- |
| Ticket | 16 |
| Urutan | 13 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) |

<!-- notion-content:start -->
Tujuan: Perubahan soul atas permintaan dan HITL.
Implementasi NG-016 mengikuti panel avatar Aktivitas/Mendatang/Identitas. Identity (nama/avatar/deskripsi), Soul (karakter) dan Memory (informasi pengguna, NG-017/018) mempunyai tanggung jawab terpisah. Editor langsung dan preview chat memakai satu layanan, revision exact dan keputusan owner. Memory capture/recall bukan bagian delivery ini.
Lingkup: **Aktif V1**. Identitas NG-016; Urutan delivery 13.
## Acceptance criteria
- [x] Persona revision baru ditinjau terhadap soul aktif; approve exact dan stale revision ditolak.
- [x] Penolakan tidak mengubah persona dan tidak ditangkap sebagai instruksi memory; source eksternal tidak dapat mengubah soul.
- [x] Pengguna dapat melihat revision aktif/history serta memulihkan revision secara eksplisit; uji P16/P27.
## Spesifikasi dan bukti
[03 · Perilaku Agent](../../product/03-agent.md) · [REA-4 · Memory & Goals](../../research/muse-ai-v1/evidence/memory.md)
## Dependencies
[NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md)
## Bukti penerimaan
Diterima development pada 19 Oktober 2026. Laporan repo: docs/engineering/[persona-16-acceptance.md](http://persona-16-acceptance.md); desain: docs/engineering/[persona-runtime.md](http://persona-runtime.md); readback: docs/engineering/evidence/persona-16/live-readback.json. make persona-inspect lulus 36 skenario dalam database disposable; Task 55 dan scheduler 82 lulus regresi; make check/build serta git diff --check lulus. Walkthrough nyata mencakup draft/reload, konflik dua tab dan merge field, restore, model preview/reject/approve dan penerapan lintas thread, file TXT injection, error/retry simpan serta desktop 1440x900/mobile Chromium 390x844 dan 320x640.
Batas P16: penolakan serta capture-exclusion references durable diuji; extractor/recall memory dan end-to-end re-curation mengikuti NG-017. Avatar memakai gambar yang ada atau inisial. Tidak mengklaim mobile fisik, production deployment atau parity internal Muse. Profil awal dipulihkan sesudah audit dan history dipertahankan.
### Fondasi historis
[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
