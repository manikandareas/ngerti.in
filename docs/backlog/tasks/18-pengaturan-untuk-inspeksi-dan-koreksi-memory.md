# NG-018 · Pengaturan inspeksi dan koreksi memory

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381aabe5cf4a3355618cd) · Readback: 2026-10-19T05:41:03.122Z

| Property | Value |
| --- | --- |
| Ticket | 18 |
| Urutan | 15 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Agent |
| Depends on | [NG-017 · Memory aktif capture evidence dan recall](17-memory-aktif-capture-evidence-dan-recall.md) |

<!-- notion-content:start -->
Tujuan: Pengaturan inspeksi dan koreksi memory.
Lingkup: **Aktif V1**. Identitas NG-018; Urutan delivery 15.

## Acceptance criteria
- [x] Pengguna melihat apa yang diingat dan sumbernya, mengoreksi/lupakan dan mematikan capture.
- [x] Koreksi/forget mempengaruhi recall dan retry curation sesudah reload; owner B tidak dapat membaca atau mengubah entry.
- [x] Kontrol tetap tersedia saat allowance habis; empty/loading/error serta focus/mobile diterima.

## Spesifikasi dan bukti
[02 · UX & User Flow](../../product/02-user-flow.md) · [REA-4 · Memory & Goals](../../research/muse-ai-v1/evidence/memory.md)

## Dependencies
[NG-017 · Memory aktif capture evidence dan recall](17-memory-aktif-capture-evidence-dan-recall.md)

## Bukti penerimaan
Implementasi development diterima 19 Oktober 2026. Mem0 OSS library 2.2.1, canonical PostgreSQL, evidence exact, hybrid recall, revision/suppression, outbox cleanup dan kontrol pengguna terimplementasi. Panduan cara kerja berada pada [03 · Perilaku Agent](../../product/03-agent.md).
Bukti repo: `docs/engineering/memory-runtime.md`, `docs/engineering/memory-17-acceptance.md`, `docs/engineering/evidence/memory-17/contracts-live.json` dan `live-readback.json`. Inspector memory lulus 67 skenario termasuk model nyata, English/negasi/kutipan fiksi, concurrency/retry, source deletion, capture-off in-flight, revocation Chat/Task/checkpoint, budget dan API allowance nol. Regresi persona 36, Task 55, file 47, scheduler 82 dan quota 46 lulus; make check/build lulus.
Walkthrough UI membuktikan capture pending yang jujur, lintas thread, kutipan sumber, koreksi dan history, forget yang mengubah jawaban, reload capture setting, mobile 390/320px serta API interruption/recovery. Operasi forget fixture dijalankan melalui domain service setelah dialog UI diperiksa; tidak mengklaim final destructive click melalui UI diuji.
Batas: development, bukan deployment produksi atau benchmark populasi besar. File/result tersedia melalui API exact source dan belum memiliki tombol capture khusus. Recall otomatis hanya current facts; cleanup indeks dapat pending, sumber asli dan jawaban terkirim tetap tersimpan.
### Referensi baseline
[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
