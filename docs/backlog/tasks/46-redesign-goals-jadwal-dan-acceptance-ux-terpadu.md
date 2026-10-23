# NG-046 · Redesign goals jadwal dan acceptance UX terpadu

Sumber: [Notion](https://app.notion.com/p/3feabdd618738189878dea88adaf97fc) · Readback: 2026-10-20T08:39:44.741Z

| Property | Value |
| --- | --- |
| Ticket | 46 |
| Urutan | 23.5 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Agent |
| Depends on | [NG-042 · Redesign shell dan percakapan mengikuti Muse](42-redesign-shell-dan-percakapan-mengikuti-muse.md) · [NG-043 · Redesign aktivitas agent approval dan komputer](43-redesign-aktivitas-agent-approval-dan-komputer.md) · [NG-044 · Redesign settings terpusat dan identitas](44-redesign-settings-terpusat-dan-identitas.md) · [NG-045 · Redesign artifact viewer Library dan hasil percakapan](45-redesign-artifact-viewer-library-dan-hasil-percakapan.md) · [NG-038 · Goals umum dengan evidence progress](38-goals-umum-dengan-evidence-progress.md) · [NG-037 · Scheduler pengguna saat offline](37-scheduler-pengguna-saat-offline.md) |

<!-- notion-content:start -->
Tujuan: Redesign goals jadwal dan acceptance UX terpadu. Redesign UI/UX pada fondasi yang sudah tersedia.
## Masalah dan sumber audit
Goals/jadwal meminta runtime dan budget unit internal terlalu awal; perlu alur yang berpusat pada niat pengguna. Audit P1-03, P2-03 serta acceptance lintas fitur; atlas §5, §8–11.
## Lingkup
- Entry goals/jadwal membuka percakapan atau proposal singkat: maksud, target/waktu, ringkasan dan keputusan; advanced configuration melalui disclosure.
- Daftar goals berisi judul/subtitle/progress/tindakan ringkas; Upcoming menjadi entry jadwal dengan detail sesuai kebutuhan. Saving goal tidak otomatis mengizinkan eksekusi.
- Delivery proaktif/penemuan kemampuan yang sudah ada memakai pola Ideas/Feed: ringkasan dan tindakan lanjut ke chat. Jangan membangun Feed/Ideas baru di luar scope hanya untuk menyalin menu.
- Satukan copy, waktu lokal dan unit biaya yang dapat dipahami; default aman tetap mempertahankan caps backend.
- Jalankan acceptance lintas NG-042–045 dan tiket ini; lengkapi matriks per fitur/state, screenshot pasangan dan daftar perbedaan sengaja.
## Acceptance criteria
- [ ] Pengguna dapat memulai goal/jadwal dari maksud bahasa alami dan meninjau proposal tanpa memahami angka unit internal/runtime.
- [ ] Proposal menunjukkan konsekuensi jadwal/biaya/izin sebelum aktivasi; edit/cancel/validation/recovery tidak menggandakan jadwal atau mengubah grant.
- [ ] Meninjau goal atau jadwal sambil berbicara mempertahankan konteks; waktu yang ditampilkan konsisten dengan timezone pengguna.
- [ ] Walkthrough terpadu: chat → background task → approval → artifact → diskusi → goal/jadwal → settings → kembali, termasuk reload/reconnect dan mobile.
- [ ] Semua gap P1-01–05/P2-01–04 memiliki bukti penyelesaian atau pengecualian eksplisit; tidak ada klaim parity untuk state Muse yang belum terverifikasi.
- [ ] Acceptance akhir mencakup actual viewport 390/320px dan desktop setara referensi; periksa DOM viewport benar-benar berubah, overflow, keyboard dan focus.
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
## Implementasi dan acceptance · 20 Oktober 2026
Implementasi lokal: entry Rencanakan lewat chat menyiapkan maksud pengguna tanpa mengirim otomatis; form manual tetap tersedia dengan runtime/budget/file dalam pengaturan lanjutan. Goals menampilkan ringkasan dan kemajuan berbasis bukti. Proposal tujuan menjelaskan bahwa menyimpan tidak menjalankan pekerjaan. Proposal jadwal menampilkan batas kredit dari estimator backend, izin, waktu/zona, lalu keputusan eksplisit. Riwayat eksekusi memakai zona jadwal/perangkat; unit token internal tidak dikonversi secara palsu menjadi kredit. Bicarakan goal/jadwal memilih objek dan versi, mempertahankan viewer.
Bukti dan matriks P1-01–05/P2-01–04: `docs/engineering/redesign-45-46-acceptance.md`; screenshot: `docs/engineering/evidence/redesign-45-46/`.
Browser aktual 390/320px dan desktop 1672×822: tanpa root overflow pada state yang diperiksa, draft dan artifact bertahan setelah reload, Library→artifact→diskusi→versi→settings→kembali diuji. Proposal goal dan jadwal dari bahasa alami tampil; keduanya ditolak sesudah ditinjau, tidak ada jadwal uji diaktifkan. Proposal jadwal menunjukkan 31 Okt 2026 10.00 WITA dan batas 30 kredit.
Gate: check/build, 74 kontrak goals dan 82 scheduler lulus; kontrak file/Library/renderer juga lulus. Backend izin/caps/idempotency tidak diubah.
Status Review: acceptance terpadu live background→approval dalam rangkaian yang sama, error/reconnect/reduced-motion lengkap, dark visual yang konsisten, serta pasangan Muse untuk seluruh fitur/state masih belum terbukti. Bukti NG-042–044 dirujuk sebagai bukti sebelumnya, bukan diklaim diuji ulang seluruhnya.
<!-- notion-content:end -->

[Bukti implementasi dan sisa acceptance](../../engineering/redesign-45-46-acceptance.md).

Status property dibaca ulang dari view Notion pada 2026-10-23T08:26:11.852Z. Isi historis di atas mempertahankan tanggal readback sebelumnya.
