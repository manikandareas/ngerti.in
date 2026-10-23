# NG-042 · Redesign shell dan percakapan mengikuti Muse

Sumber: [Notion](https://app.notion.com/p/3feabdd6187381de83d7e3f1f49a2f36) · Readback: 2026-10-19T15:31:57.122490+00:00

| Property | Value |
| --- | --- |
| Ticket | 42 |
| Urutan | 23.1 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Fondasi |
| Depends on | [NG-032 · Shell onboarding dan walkthrough asisten umum](32-shell-onboarding-dan-walkthrough-asisten-umum.md) |

<!-- notion-content:start -->
Tujuan: Redesign shell dan percakapan mengikuti Muse. Redesign UI/UX pada fondasi yang sudah tersedia.
## Masalah dan sumber audit
Navigasi masih berpusat pada modul; header/composer membawa kontrol permanen dan perpindahan fitur memutus kesinambungan visual chat. Audit P1-01, P1-05, P2-02; atlas §1–2.
## Lingkup
- Susun rail, header/avatar, daftar main/side chat, search, composer, dan shared panel/split-view mengikuti referensi Muse; inventory fitur Ngertiin menentukan entry yang benar-benar ditampilkan.
- Task/jadwal diakses terutama melalui panel agent; usage melalui settings; kemampuan melalui bantuan/contoh permintaan. Pertahankan deep link dan akses pengelolaan yang dibutuhkan.
- Composer minimal dengan satu entry lampiran; pengaturan thread dalam overflow dan indikator kuota kontekstual. Pesan, reply, unread dan status memakai hierarki referensi.
- Shared layout menyediakan resize/collapse/maximize/close serta adaptasi mobile yang mempertahankan draft, objek terpilih, posisi baca dan return path.
## Acceptance criteria
- [x] Pengguna dapat memulai pekerjaan melalui chat tanpa memilih modul/runtime terlebih dahulu.
- [ ] Main/side chat, pencarian dan lampiran tetap berfungsi; navigasi bolak-balik tidak kehilangan draft, thread atau hasil streaming.
- [x] Membuka fitur kontekstual di desktop dapat mempertahankan chat melalui split view; mobile mempunyai transisi eksplisit dengan state terpelihara.
- [ ] Header, rail, composer dan whitespace dibandingkan pada empty, populated, streaming dan error; kontrol tidak mendominasi kebutuhan mengirim pesan.
## Acuan dan batas redesign
Target: UI/UX identik dengan pola Muse pada fitur yang sepadan—struktur layout, hierarki, density, entry point, transisi, progressive disclosure, dan kontinuitas percakapan—dengan Soft Matcha, Nunito Sans, serta semantic color tokens Ngertiin tetap dipertahankan. Perbedaan fitur mengikuti scope Ngertiin; tidak menambah fitur Muse hanya demi kesamaan menu.
[Referensi Notion](https://app.notion.com/p/3feabdd6187381da8a92d4243d0b1303)
[01 · Peta Produk, UX & Interaksi](../../research/muse-ai-v1/01-produk-dan-ux.md)
[02 · UX & User Flow](../../product/02-user-flow.md)
Audit Ngertiin: `.dev/audits/2026-10-19-ux-muse.md` (19 Oktober 2026, snapshot 3e21f09). Verifikasi ulang gap pada implementasi terbaru sebelum mengubah kode. Status Done tiket fondasi tidak direset.
## Definition of done bersama
- [ ] Pasangan screenshot Muse–Ngertiin pada viewport/state yang sama disimpan; anotasi membedakan adaptasi tokens/fitur yang disengaja dari penyimpangan layout/interaksi.
- [ ] Reference sheet menetapkan ukuran, spacing, density, panel behavior dan state dari bukti langsung. Ukuran perkiraan atlas tidak dianggap spesifikasi pixel final.
- [ ] Walkthrough desktop/mobile, light/dark, keyboard/focus restore, reduced motion, empty/loading/error/recovery yang relevan lulus; draft dan konteks tetap terjaga.
- [ ] Setiap state Muse yang belum teramati ditandai unknown dan diverifikasi sebelum klaim identik; fallback Ngertiin diberi label keputusan desain, bukan bukti Muse.
- [ ] Kontrak izin, ownership, budget/caps, persistence, idempotency dan keamanan preview tetap berlaku. Gate build/check serta uji regresi relevan lulus.
- [ ] Bukti acceptance ditautkan di tiket; dokumentasi/mirror disinkronkan setelah readback. Pembuatan backlog bukan bukti implementasi selesai.
## Implementasi dan evidence · 19 Oktober 2026
Implementasi tersedia pada working tree development. Rail 72 px, header pemilih thread/avatar, composer satu entry lampiran, pengaturan thread dalam overflow, kuota kontekstual, search dialog, serta ContextPanel bersama dengan resize/collapse/maximize/close. Navigasi mobile menggunakan bottom bar. Draft dan run tetap mounted saat panel dibuka; reply menambahkan kutipan.
Validasi: make check dan make build lulus; quota-inspect 46 kontrak dan files-inspect 47 kontrak lulus. Walkthrough split desktop, mobile 390×844, lebar 320/701 tanpa overflow horizontal, detail-return path, reply, search, error/recovery, light/dark dan navigasi ketika run aktif dilakukan. Dua respons sintetis selesai setelah perpindahan panel.
Bukti repository: `docs/engineering/shell-42-acceptance.md` dan docs/engineering/evidence/shell-42/. Reference Muse desktop 1672×879 dan mobile 390×844 diobservasi langsung. Ukuran/adaptasi Ngertiin dibedakan dari hasil observasi Muse.
Status Review, belum Done: upload UI terhalang izin file URL browser dan percobaan picker native belum terkonfirmasi; backend tests tidak menggantikan acceptance UI. Muse streaming/error/light/reduced-motion masih unknown. Pasangan screenshot semua state, screen-reader/keyboard menyeluruh, reduced-motion runtime, serta round-trip scroll dengan pagination belum lengkap. Tidak mengklaim pixel parity atau seluruh definition of done terpenuhi.
NG-043–046 hanya dimirror sebagai Backlog; tidak diimplementasikan. Tidak ada perubahan kontrak backend, migrasi, commit atau push.
<!-- notion-content:end -->

Status property dibaca ulang dari view Notion pada 2026-10-23T08:26:11.852Z. Isi historis di atas mempertahankan tanggal readback sebelumnya.
