# Port standar Lesson dan soal dari prototipe

Sumber: [Notion](https://app.notion.com/p/3f8abdd618738197962afe1cc626e01c)

Status: **Done** · Prioritas: **P0** · Area: **Course** · Urutan: **3**

Depends on: —

<!-- notion-content:start -->
## Hasil

Standar konten menjadi kontrak dan fixture yang bisa diverifikasi.

## Acceptance criteria

- [x] Audit standar/protokol penilaian terbaru di ../[ngerti.in](http://ngerti.in) dan versi panduan per tipe; tetapkan schema/rubric untuk proyek baru.
- [x] Fixture mencakup kedalaman Lesson, evidence, variasi format relevan, key ambigu, dan soal yang tidak dapat dijawab.
- [x] Kontrak checks deterministik, review semantik dan batas repair ditetapkan dengan fixture pass/fail untuk diterapkan worker.
- [x] Jumlah node/aktivitas mengikuti tujuan dan standar; tidak dikurangi untuk memenuhi kuota paket.

## Implementasi dan penerimaan #003

Selesai pada **2026-10-15**. Modul Python/Pydantic `apps/backend/src/ngertiin/content/` menetapkan standard_version=1: blueprint/evidence, Lesson Markdown, lima tipe soal dan key privat, validator, input/review terikat hash, serta keputusan ready/repair/hold/needs_context. Kode generation prototipe tidak disalin; audit editorial v5/policy 2 dilengkapi riset primer.

Corpus berisi enam sumber sintetis, 30 skenario konten/review/readiness dan sembilan kasus key/jawaban. Inspeksi manual menghasilkan nol mismatch terhadap label editorial. Empat schema aktual adapter LangChain diperiksa, termasuk fixed typed question slots dengan ID/type terkunci. Review stale, foreign ID, snapshot berubah dan kebocoran key publik diperiksa.

Dua probe OpenAI Structured Outputs pada satu node sintetis, model terkonfigurasi gpt-6-luna, menghasilkan review Lesson pertama dan Practice yang valid dengan keputusan ready. Probe awal menangkap coverage lintas Lesson pada scope Lesson; instruksi diperjelas tanpa melemahkan gate, kemudian diulang. Ini verifikasi kontrak, bukan kalibrasi guru, bukti hasil belajar atau benchmark generation Course.

`make check`, `make build`, dan build wheel/source Python lulus. Tidak ada suite unit/integration/E2E baru atau model call di CI. Credentials root `.env` tetap server-only.

Keputusan UX pengguna: Lesson yang lolos pemeriksaan dapat dibaca sebelum Practice siap. Kontrak handoff membedakan readiness dan progress, snapshot/revisi, job per Lesson/kelompok, batch Practice, prioritas foreground serta admission lintas worker. Runtime planner, engine multi-worker, player dan grading mengikuti tiket terkait.

Dokumentasi lokal: `docs/engineering/course-content-standard.md`, `docs/engineering/course-generation-design.md`, `docs/engineering/content-03-manual-acceptance.md`, dan `docs/fixtures/course-content/`. Hasil riil serta batas pemeriksaan tercatat pada bukti penerimaan.

## Spesifikasi

[02 · User Flow](../../product/02-user-flow.md)

[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)
<!-- notion-content:end -->
