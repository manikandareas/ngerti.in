# Penerimaan standar konten #003

Selesai pada 15 Oktober 2026. Cakupan adalah kontrak/validator/policy/fixture/desain handoff, sesuai [tiket #003](../backlog/tasks/03-port-standar-lesson-dan-soal-dari-prototipe.md). Planner, queue generation Course, player dan grading pengguna diimplementasikan pada #008/#009/#011/#012.

## Bukti terhadap acceptance criteria

| Kriteria #003 | Hasil dan bukti |
| --- | --- |
| Audit standar/protokol penilaian dan panduan per tipe | Audit versi v5/editorial policy 2 dirangkum pada [standar v1](course-content-standard.md), dilengkapi riset primer dan pemisahan kebijakan editorial dari bukti ilmiah. Kode baru ditulis untuk kontrak Python, tanpa menyalin engine prototipe. |
| Fixture kedalaman, evidence, variasi, ambiguitas, keterjawaban | Enam sumber sintetis, 30 skenario konten/review/readiness, dan sembilan kasus key/jawaban. Struktur lolos tetapi semantik gagal mempunyai label tersendiri. |
| Kontrak checks, review dan bounded repair | Validator, hash input review, quote/coverage/target checks, decision ready/repair/hold/needs_context, dua repair, dependency invalidation dan preservasi Lesson tersedia. |
| Jumlah mengikuti tujuan/standar, bukan kuota | Blueprint menetapkan kontribusi dan alasan jumlah Lesson; counts/diversity/cognitive intent diperiksa. Modul konten tidak menerima paket billing sebagai input pemangkasan. |

## Pemeriksaan manual lokal

- `make content-inspect`: 30 skenario sesuai label dan sembilan kebijakan jawaban sesuai label, tanpa mismatch. [Laporan lengkap](evidence/content-03-inspection.json).
- Empat schema yang benar-benar diekspor adapter LangChain diperiksa: NodeBlueprint, LessonDraft, PracticeSlots semua lima format, dan QualityReview. Semua objects tertutup, field required/described, nullability eksplisit; slot soal mengunci type/ID host dan tidak mengekspor union runtime oneOf.
- Round trip output fixed-slot menjadi PracticeDraft berhasil; penggantian ID slot dengan ID asing ditolak. Pemeriksaan awal menemukan precedence pattern pada Annotated ID; factory diperbaiki dan actual emitted pattern diverifikasi ulang. Schema audit kini juga memeriksa pattern/const tersebut.
- Readiness dari packet lama tidak dapat digunakan untuk menampilkan Lesson yang sudah diubah. Course dengan prerequisite ke dirinya sendiri ditolak.
- Contoh publikasi Lesson pertama tanpa Practice, semua Lesson tanpa Practice, serta Practice lengkap menghasilkan readiness yang diharapkan. Proyeksi publik tidak memuat key atau explanation privat.
- `make check`: Biome, TypeScript, Ruff lint/format dan mypy lulus. `make build`: web production build lulus. `uv build` pada backend: source distribution dan wheel lulus.

Tidak ada suite unit/integration/E2E baru atau panggilan model pada CI. `content-inspect` adalah alat operator untuk memanggil validator dan mengamati fixture dengan label yang telah diberikan; ia tidak mengukur akurasi penilaian AI.

## Probe provider nyata

Dua request Structured Outputs menggunakan model yang dikonfigurasi di root `.env`, terlapor sebagai **gpt-6-luna**, pada satu node sintetis diskon. Key tetap server-only, tidak dicatat pada artefak.

| Scope | Hasil terakhir |
| --- | --- |
| Lesson pertama | Response completed, QualityReview valid, keputusan ready, tanpa contract issue. |
| Paket Practice | Response completed, QualityReview valid, keputusan ready, tanpa contract issue. |

[Laporan provider](evidence/content-03-live-review.json) menyertakan response IDs, input/schema fingerprint, usage, findings dan keputusan. Probe pertama sempat menolak review Lesson karena model mengisi coverage criterion/soal Lesson lain. Host gate mempertahankan penolakan; prompt diperjelas dengan requested_criterion_ids dan question_ids kosong pada scope Lesson, lalu kedua probe diulang dan lulus.

Durasi yang tercatat adalah durasi dua probe review pada satu sampel, **bukan benchmark generation Course atau jaminan latency UX**. Tidak ada klaim kalibrasi guru, akurasi reviewer seluruh domain, atau bukti hasil belajar siswa. Label corpus merupakan penilaian editorial Codex. Jev tidak menjadi gate publikasi tanpa evaluasi; Mistral/Firecrawl terkait ingestion berikutnya. Browser runtime Course dan recovery multi-worker menunggu implementasi #009/#011.

## Dokumentasi dan sinkronisasi

[Desain generation](course-generation-design.md) menjelaskan Lesson pertama prioritas, microbatch, pool worker dinamis, admission global, snapshot Practice, idempotency dan protokol benchmark. Spesifikasi Notion serta mirror lokal diselaraskan untuk keputusan pengguna bahwa Lesson yang diperiksa boleh dibaca sebelum Practice siap. Task #009/#011 tetap Backlog; penerimaan #003 tidak mengklaim runtime tersebut telah diimplementasikan.
