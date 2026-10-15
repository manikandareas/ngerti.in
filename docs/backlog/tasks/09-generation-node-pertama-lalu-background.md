# Generation: node pertama lalu background

Sumber: [Notion](https://app.notion.com/p/3f8abdd61873816caeb2d24a482c6511)

Status: **Backlog** · Prioritas: **P0** · Area: **Course** · Urutan: **9**

Depends on:

- [Fondasi production: workspace, auth dan data](02-fondasi-production-workspace-auth-dan-data.md)
- [Port standar Lesson dan soal dari prototipe](03-port-standar-lesson-dan-soal-dari-prototipe.md)
- [Outline Course: perencanaan, revisi dan approval](08-outline-course-perencanaan-revisi-dan-approval.md)

<!-- notion-content:start -->
## Hasil

Pengguna mulai belajar dari node pertama valid sambil node lain dibuat.

## Acceptance criteria

- [ ] Worker memprioritaskan node pertama lengkap; node lain diproses background dengan concurrency terbatas.
- [ ] Setiap node lolos checks/review sebelum publish; repair terarah mempertahankan bagian valid dan berhenti pada batas.
- [ ] Browser ditutup atau worker restart tidak kehilangan state; resume tidak menagih Course atau menggandakan node.
- [ ] Status per node membedakan readiness dari unlock; bagian gagal dapat dipulihkan tanpa menghapus node siap.

## Spesifikasi

[04 · Arsitektur & Delivery](../../product/04-arsitektur-dan-delivery.md)

[02 · User Flow](../../product/02-user-flow.md)
<!-- notion-content:end -->
