# NG-017 · Memory aktif capture evidence dan recall

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738151a38ffb012be2c9ce) · Readback: 2026-10-19T05:41:03.122Z

| Property | Value |
| --- | --- |
| Ticket | 17 |
| Urutan | 14 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-016 · Perubahan soul atas permintaan dan HITL](16-perubahan-soul-atas-permintaan-dan-hitl.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md) |

<!-- notion-content:start -->
Tujuan: Memory aktif capture evidence dan recall.
Lingkup: **Aktif V1**. Identitas NG-017; Urutan delivery 14.

## Acceptance criteria
- [x] Entry bertipe fact/preference/observation, owner, evidence revision, waktu, confidence dan status.
- [x] Capture/recall lintas thread relevan dan dibatasi token/biaya; tidak menyimpan secret atau menjadikan memory otoritas domain.
- [x] Koreksi/suppression mencegah memory lama hidup kembali setelah forgetting; P14/P15/P16/P27.

## Spesifikasi dan bukti
[03 · Perilaku Agent](../../product/03-agent.md) · [REA-4 · Memory & Goals](../../research/muse-ai-v1/evidence/memory.md)

## Dependencies
[NG-016 · Perubahan soul atas permintaan dan HITL](16-perubahan-soul-atas-permintaan-dan-hitl.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md)

## Bukti penerimaan
Implementasi development diterima 19 Oktober 2026. Mem0 OSS library 2.2.1, canonical PostgreSQL, evidence exact, hybrid recall, revision/suppression, outbox cleanup dan kontrol pengguna terimplementasi. Panduan cara kerja berada pada [03 · Perilaku Agent](../../product/03-agent.md).
Bukti repo: `docs/engineering/memory-runtime.md`, `docs/engineering/memory-17-acceptance.md`, `docs/engineering/evidence/memory-17/contracts-live.json` dan `live-readback.json`. Inspector memory lulus 67 skenario termasuk model nyata, English/negasi/kutipan fiksi, concurrency/retry, source deletion, capture-off in-flight, revocation Chat/Task/checkpoint, budget dan API allowance nol. Regresi persona 36, Task 55, file 47, scheduler 82 dan quota 46 lulus; make check/build lulus.
Walkthrough UI membuktikan capture pending yang jujur, lintas thread, kutipan sumber, koreksi dan history, forget yang mengubah jawaban, reload capture setting, mobile 390/320px serta API interruption/recovery. Operasi forget fixture dijalankan melalui domain service setelah dialog UI diperiksa; tidak mengklaim final destructive click melalui UI diuji.
Batas: development, bukan deployment produksi atau benchmark populasi besar. File/result tersedia melalui API exact source dan belum memiliki tombol capture khusus. Recall otomatis hanya current facts; cleanup indeks dapat pending, sumber asli dan jawaban terkirim tetap tersimpan.
### Referensi baseline
[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.
<!-- notion-content:end -->
