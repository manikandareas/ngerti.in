# NG-045 · Redesign artifact viewer Library dan hasil percakapan

Sumber: [Notion](https://app.notion.com/p/3feabdd6187381b1b2eefcbae0e4cbc9) · Readback: 2026-10-20T08:39:44.741Z

| Property | Value |
| --- | --- |
| Ticket | 45 |
| Urutan | 23.4 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Fondasi |
| Depends on | [NG-042 · Redesign shell dan percakapan mengikuti Muse](42-redesign-shell-dan-percakapan-mengikuti-muse.md) · [NG-034 · File produk dan hasil tersimpan](34-file-produk-dan-hasil-tersimpan.md) · [NG-039 · Library pencarian dan penemuan kemampuan](39-library-pencarian-dan-penemuan-kemampuan.md) |

<!-- notion-content:start -->
Tujuan: Redesign artifact viewer Library dan hasil percakapan. Redesign UI/UX pada fondasi yang sudah tersedia.
## Masalah dan sumber audit
Hasil membuka metadata dahulu lalu preview; Markdown mentah dan diskusi menutup dokumen. Audit P1-04, P1-05; atlas §4.
## Lingkup
- Klik artifact dari chat/Library langsung membuka konten ter-render; toolbar judul dan aksi ringkas, metadata/version/checksum/provenance dalam detail.
- Render Markdown termasuk heading/list/table/code dan format matematika yang didukung produk; mode sumber terpisah. Copy isolasi HTML hanya muncul pada konteks relevan.
- Library mengikuti hierarki kategori, thumbnail, pencarian, recent/all, sorting dan grid/list untuk tipe yang benar-benar didukung Ngertiin.
- Viewer full/split dengan chat, resize/maximize/close; 'Bicarakan' mempertahankan dokumen terlihat dan menjelaskan objek/versi sebagai konteks.
## Acceptance criteria
- [ ] Satu klik hasil membuka konten terbaca, tidak memerlukan langkah metadata → Preview.
- [ ] Skenario chat → artifact → diskusi → ganti versi → kembali menjaga konteks, draft dan posisi baca.
- [ ] Loading/constructing/ready/failed/interrupted serta file tidak didukung punya affordance dan recovery yang jelas.
- [ ] Download, versi, permission dan keamanan HTML/file tetap sesuai kontrak; share tidak memperluas akses diam-diam.
- [ ] Peroleh bukti visual isi viewer Muse yang belum terbaca karena batas iframe; shell teramati dan isi belum teramati dicatat terpisah.
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
Implementasi lokal: hasil chat menjadi kartu pembuka, file/hasil langsung membuka konten, Markdown/table/code/math ter-render, mode sumber terpisah, metadata dalam detail, Library kategori/recent/grid/daftar, serta Bicarakan mempertahankan viewer dan konteks versi. Desktop split/resize/maximize dan mobile split vertikal didukung; referensi viewer dan posisi baca disimpan per pengguna/percakapan/versi.
Bukti: `docs/engineering/redesign-45-46-acceptance.md` dan `docs/engineering/evidence/redesign-45-46/`. Isi iframe Muse berhasil diamati melalui AX/screenshot native (Kartu Warna), terpisah dari bukti shell. Screenshot tidak membuktikan parity seluruh tipe file.
Verifikasi: check/build; 47 kontrak file, 65 Library, dan 17 kontrak renderer/isolation. Browser: satu klik, Markdown/tabel/math, sumber, versi v2→v1→v2, diskusi/draft, reload, 390/320px tanpa root overflow, maximize dan resize keyboard. Tidak mengubah kontrak download/ownership/HTML atau menambah share publik.
Status Review: matriks loading/error/recovery penuh, download browser, dan pasangan Muse untuk seluruh state belum selesai. Detail pengecualian ada dalam dokumen acceptance; bukan klaim parity penuh.
<!-- notion-content:end -->

[Bukti implementasi dan sisa acceptance](../../engineering/redesign-45-46-acceptance.md).

Status property dibaca ulang dari view Notion pada 2026-10-23T08:26:11.852Z. Isi historis di atas mempertahankan tanggal readback sebelumnya.
