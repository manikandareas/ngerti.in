# NG-019 · Kandidat proaktif dinamis dan reranking

Sumber: [Notion](https://app.notion.com/p/3f8abdd6187381a88a5cd665f17d979f) · Readback: 2026-10-19T08:25:25Z

| Property | Value |
| --- | --- |
| Ticket | 19 |
| Urutan | 17 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-017 · Memory aktif capture evidence dan recall](17-memory-aktif-capture-evidence-dan-recall.md) |

<!-- notion-content:start -->
Tujuan: Kandidat proaktif dinamis dan reranking.

Lingkup: **Aktif V1**. Identitas NG-019; Urutan delivery 17.

## Acceptance criteria

- [x] Candidate berasal dari evidence memory/goal/task-result dengan expiry, relevance dan thread tujuan.
- [x] Tidak ada dependency Practice/streak/pengayaan; no-op sah bila tidak ada kandidat layak.
- [x] Reranking dibatasi biaya, konten eksternal tidak menjadi instruksi, kandidat basi dibuang; P21/P22/P27.

## Spesifikasi dan bukti

[03 · Perilaku Agent](../../product/03-agent.md) · [REA-4 · Memory & Goals](../../research/muse-ai-v1/evidence/memory.md)

## Dependencies

[NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-017 · Memory aktif capture evidence dan recall](17-memory-aktif-capture-evidence-dan-recall.md)

## Bukti penerimaan

[NG-030 · Bukti penerimaan baseline V1](../../engineering/baseline-v1-acceptance.md). Bukti repo: docs/engineering/evidence/baseline-v1/. Status mengikuti hasil pemeriksaan baru; tidak mengandalkan penerimaan #01–05.

## Implementasi dan penerimaan NG-019

Diterima development 19 Oktober 2026 sesuai scope yang disetujui: LLM `gpt-6-luna` membentuk usulan dinamis; Jev `jev-1.13.0` menilai relevance, benefit, timing, novelty, grounding dan kebutuhan input; code memvalidasi evidence, menerapkan minimum dan ranking, lalu memilih paling banyak satu kandidat atau no-op. Riset Muse mendasari aspek keputusan, bukan bukti bahwa backend Muse memakai Jev atau rumus yang sama.

Migration incremental `0010_proactive_candidates`, marker event transactional dan worker Procrastinate menyimpan evaluasi/kandidat/ledger. Owner, revision/hash, expiry dan thread diperiksa sebelum inference, publication dan readback. Goal berubah/pause, memory correction/forget dan file/result delete memagari worker lama serta mempurge snapshot/draft/judgment yang terlacak. Laporan pengguna tetap diatribusi; budget komputasi bukan uang dan horizon ambigu tidak menciptakan deadline.

Default pratinjau akun nonaktif. Maksimal 20 refs, lima kandidat dan satu terpilih; satu attempt generasi dan satu Jev maksimal, tanpa retry/fallback otomatis. Receipt input yang sama tidak mengulang inference; failed berbeda dari no-op. Budget evaluation/account/global atomik terpisah dari allowance chat; unknown outcomes menahan reservation dan usage terkonfirmasi dicatat penuh, termasuk lintas UTC midnight.

`make proactive-inspect`: 68 kontrak lulus. Regresi Memory 62, Goals 74, Task 55, Files 47; `make check` dan `make build` lulus. Dua fixture provider nyata Indonesia/English diproses worker terpisah tanpa browser; ada kandidat terpilih dan no-op, dengan usage terkonfirmasi. Walkthrough Clerk desktop/320px memeriksa pratinjau/evidence/Jev; overflow navigasi diperbaiki menjadi 320/320px. Fixture diarsipkan dan evaluasi akun dikembalikan nonaktif.

Implementasi dan bukti repo: `docs/engineering/proactivity-runtime.md`, `docs/engineering/proactivity-19-acceptance.md`, `docs/engineering/evidence/proactivity-19/`. Threshold konservatif masih memerlukan kalibrasi luas; contoh integrasi bukan benchmark kualitas populasi. Bagian candidate/no-op/expiry/evaluation budget P21/P22 dan pemisahan data/kewenangan P27 diterima. Delivery otomatis, message cap, quiet hours, focus, mute/snooze dan intensitas end-user tetap mengikuti [NG-020 · Delivery proaktif per thread dan batas global](20-delivery-proaktif-per-thread-dan-batas-global.md).
<!-- notion-content:end -->
