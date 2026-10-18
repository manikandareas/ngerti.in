> Catatan historis sebelum reset V1 asisten umum pada 18 Oktober 2026. Kontrak/command pembelajaran, migration head dan hasil acceptance lama di bawah tidak menjadi persyaratan aktif. Lihat [spesifikasi V1](../product/01-produk-dan-paket.md) dan [baseline baru](baseline-v1-acceptance.md).

# Audit frontend terhadap walkthrough Pen

Tanggal: 2026-10-16. Referensi: `docs/walkthrough-ux.pen`, dibaca melalui Pencil MCP. Scope implementasi: frontend yang sudah tersedia (auth, chat, diagnostik); tidak menambah runtime Course atau endpoint baru.

## Temuan dan perbaikan

| Area | Sebelum | Hasil |
| --- | --- | --- |
| Auth (`UjAcJ`, `u4GzLS`) | Layout promosi dua kolom | Kartu Clerk di tengah; konfigurasi metode login tetap mengikuti Clerk |
| Welcome (`KuGjR`, `axZuW`) | Ikon Sprout, posisi vertikal berbeda | Aset puppy asli Pen, heading/suggestion pills, posisi responsif |
| Profil agent | Judul thread di tengah | Aset Gwen asli Pen, nama dan Popover informasi; judul thread tetap tersedia untuk pembaca layar |
| Rail/panel (`m3FnIy`, `a0h8H`) | Rail 76px, panel 320px | Rail 92px, panel 330px; panel 264px pada tablet, Drawer pada mobile |
| Composer | Dua baris kontrol dengan petunjuk command | Composer ringkas, Textarea, Button kirim/stop, DropdownMenu untuk `/course` |
| Dark tokens | Popover mengikuti card; input/accent/destructive berbeda | Popover #2D2D30, input #85858B, accent #3D3D41, destructive #A84B45 sesuai token Pen |
| Styling | 1.357 baris stylesheet berisi layout/selector halaman | Utility Tailwind pada komponen; root CSS untuk token, base, theme mapping dan reduced motion; tidak ada CSS module |
| Kontrol | Tombol/input native, select native, `window.confirm` | Button/Input/Select/AlertDialog shadcn; DropdownMenu/Drawer/Collapsible/Card/Badge tetap memakai primitive bersama |
| Struktur | Composer dan welcome di dalam Thread | `chat-composer.tsx`, `welcome.tsx`, dan `agent-profile.tsx` terpisah; state pengiriman/draft/idempotency dipindahkan ke `use-thread-composer.ts` pada cleanup berikutnya |

Aset `public/images/Dh2gf.png` dan `gY5qJ.png` diekspor langsung dari komponen Pen. File desain tidak diubah.

## Gap yang masih ada

Frontend belum identik dengan seluruh walkthrough. Route yang tersedia baru `/`, `/sign-in`, `/sign-up`, dan `/dev/system`.

- Onboarding, attachment chat, source selection, outline/revision, persiapan Course, Course Player, reward/remediasi, dan recovery khusus Course belum memiliki UI/runtime lengkap dalam frontend ini.
- Rail masih menampilkan navigasi yang sudah tersedia; menu library/practice/reward serta bottom navigation Pen belum diimplementasikan. Invite, karakter, plugin, dan skenario juga belum tersedia.
- Welcome menggunakan tiga saran yang didukung alur saat ini; enam saran serta personalisasi Pen belum seluruhnya tersedia.
- Konten percakapan/approval mengikuti kontrak chat saat ini. Tampilan seluruh variasi pesan Pen belum dipetakan satu per satu.
- Detail form auth ditentukan konfigurasi Clerk; metode Google/GitHub/email-password pada Pen tidak otomatis sama dengan konfigurasi instance saat ini.
- Primary Button mengikuti warna, radius, dan kedalaman Soft Matcha, dengan ukuran kontekstual untuk chat; seluruh state library Pen belum diverifikasi pixel-per-pixel.

## Verifikasi

- `bun run typecheck`, `bun run lint`, `bun run build`, dan `git diff --check` lulus. Build mengeluarkan warning dependency module-level `use client`.
- Halaman login nyata dibuka di browser. Chat diperiksa melalui harness sementara yang mengimpor komponen produksi; account button diberi stub, daftar thread memakai fixture. Harness tidak masuk source aplikasi.
- Desktop 1440×900 dan mobile 390×844: `document.documentElement.scrollWidth === innerWidth`.
- Saran mengisi draft; dropdown composer mengisi `/course `; Popover profil terbuka dan Escape menutupnya; Drawer mobile terbuka; pencarian panel menghasilkan state kosong; tema gelap dan computed token diperiksa.
- Bukti screenshot ada di `evidence/frontend-audit/`. Screenshot chat berlabel `fixture`; gambar merekam pemeriksaan sebelum penyesuaian akhir padding composer (+8px) dan radius Button.
- Pengiriman ke backend, streaming, autentikasi penuh, dan seluruh alur Course tidak dijalankan ulang pada audit visual ini.

Screenshot fixture memakai shell minimal untuk menguji komponen; rail kosong pada gambar fixture bukan keadaan rail produksi.
