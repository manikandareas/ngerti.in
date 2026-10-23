# NG-044 · Redesign settings terpusat dan identitas

Sumber: [Notion](https://app.notion.com/p/3feabdd61873816fb622c8293d1e1a36) · Readback: 2026-10-20T08:11:42.656Z

| Property | Value |
| --- | --- |
| Ticket | 44 |
| Urutan | 23.3 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Fondasi |
| Depends on | [NG-042 · Redesign shell dan percakapan mengikuti Muse](42-redesign-shell-dan-percakapan-mengikuti-muse.md) · [NG-018 · Pengaturan inspeksi dan koreksi memory](18-pengaturan-untuk-inspeksi-dan-koreksi-memory.md) |

<!-- notion-content:start -->
Tujuan: Redesign settings terpusat dan identitas. Redesign UI/UX pada fondasi yang sudah tersedia.
## Masalah dan sumber audit
Settings panjang mengganti chat, konfigurasi tersebar, istilah teknis/copy tidak konsisten. Audit P1-02, P2-03; atlas §3 Identity dan §6.
## Lingkup
- Ganti halaman panjang menjadi satu settings container berkategori: General sebagai awal, navigasi kategori tetap, subhalaman dengan return path, scroll isi mandiri.
- Petakan akun/tampilan/bahasa, usage/paket, proaktivitas, browser/data, izin dan bantuan sesuai capability Ngertiin; jangan tampilkan konektor/wallet palsu.
- Tempatkan konfigurasi teknis dan reset dalam subhalaman/disclosure. Satukan unit usage, istilah Indonesia dan waktu lokal dengan timezone jelas.
- Integrasikan Identity/SOUL/MEMORY melalui panel agent/editor dan percakapan sesuai referensi; batas save/approval/forget tetap eksplisit.
## Acceptance criteria
- [ ] Settings terbuka di atas konteks aktif, mudah ditutup dengan fokus kembali; draft dan pekerjaan berlangsung tetap terjaga.
- [ ] Pengaturan umum dapat ditemukan dari kategori awal; usage tidak memerlukan navigasi terpisah yang kehilangan konteks.
- [ ] Memory/persona menunjukkan capability aktual; tidak ada copy 'sedang disiapkan' untuk fitur yang tersedia.
- [ ] Save/cancel/unsaved/error serta aksi sensitif mempunyai konsekuensi jelas; tidak ada perubahan izin/default akibat redesign.
- [ ] Editor identitas dapat berdampingan dengan chat; perilaku perubahan dan approval existing tetap lulus regresi.
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
## Implementasi dan verifikasi · 20 Oktober 2026
Implementasi NG-044 tersedia di working tree lokal. Status Review; belum mengklaim identik atau memenuhi seluruh definition of done.
- Settings menjadi modal berkategori dengan Umum sebagai awal, navigasi tetap, scroll isi mandiri, return path, ringkasan kuota, dan penggunaan/paket dalam container yang sama. Konteks chat dan panel aktif tetap mounted.
- Identitas membuka tab Identitas di samping chat; copy profil, SOUL dan MEMORY sesuai capability aktual. Save/approval/forget backend tidak diubah.
- Draft proaktivitas bertahan lintas kategori; cancel dan dialog buang perubahan melindungi close, perpindahan route dan Back browser. Zona waktu dan unit kuota diperjelas. Reset browser berada dalam disclosure dengan konfirmasi konsekuensi.
- Bukti browser desktop: draft chat bertahan, fokus kembali ke Pengaturan, navigasi kategori, usage, light/dark, identitas berdampingan, batal perubahan dan Back guard, reset browser dibatalkan tanpa penghapusan.
- Gate: make check dan make build lulus; persona 36, memory 62, proactivity 105 kontrak lulus. Fixture proactivity kini memakai model terkonfigurasi untuk reservasi; nama dummy sebelumnya terkena tarif fallback dan menolak admission. Tidak mengubah limit/default produksi.
- Bukti lokal: `docs/engineering/settings-44-acceptance.md` dan `docs/engineering/evidence/settings-44/`.
- Masih perlu acceptance: mobile/breakpoint aktual (override viewport tool tidak konsisten), reduced motion runtime, loading/error/recovery penuh, pekerjaan live selama overlay, dan pasangan screenshot Muse–Ngertiin pada viewport/state sama. Ukuran Muse 800×600 dan baris kategori 32 px diukur langsung pada desktop; bukti ini bukan klaim parity seluruh state.
<!-- notion-content:end -->

Status property dibaca ulang dari view Notion pada 2026-10-23T08:26:11.852Z. Isi historis di atas mempertahankan tanggal readback sebelumnya.
