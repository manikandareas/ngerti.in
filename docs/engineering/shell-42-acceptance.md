# NG-042 · Shell dan percakapan

Implementasi 19 Oktober 2026. Status **Review**: perubahan produk tersedia di development, tetapi seluruh definition of done visual belum terbukti. Sumber: [NG-042 di Notion](https://app.notion.com/p/3feabdd6187381de83d7e3f1f49a2f36).

## Perubahan

- Rail berisi chat, pencarian, tujuan, Library, dan pengaturan. Task/jadwal melalui panel asisten; penggunaan dan contoh permintaan melalui pengaturan. Registry URL lama tetap menerima semua deep link.
- Header menampilkan pemilih thread dan avatar; composer memiliki satu entry lampiran. Pengaturan proaktivitas thread dan detail kuota berada dalam overflow. Kuota muncul dekat composer hanya saat gagal dimuat atau tersisa maksimal lima pesan.
- Search memakai dialog desktop dan layar penuh mobile. Chat tetap mounted selama fitur kontekstual terbuka, termasuk koneksi event dan draft.
- `ContextPanel` digunakan fitur workspace, asisten, dan detail hasil. Resize pointer/keyboard, collapse, maximize, close, dan transisi mobile menggunakan subtree yang sama. Fitur induk tetap mounted di bawah detail hasil agar return path dan pilihan pencarian tidak hilang.
- Mobile menggunakan navigasi bawah; panel memiliki tombol kembali. Permukaan di belakang panel mobile/maximized tidak menerima fokus. Escape dan pengembalian fokus tersedia.
- Reply menambahkan kutipan ke draft tanpa menghapus draft sebelumnya. Posisi baca disimpan per thread dalam session storage. Side chat kosong tidak memiliki suggestion cards; bantuan main chat tetap adaptasi Ngertiin.
- Soft Matcha, Nunito Sans, semantic tokens, API ownership/izin, approval, budget, persistence, idempotency, dan preview tetap memakai kontrak yang ada. Tidak ada migrasi atau perubahan backend.

## Reference sheet dan anotasi

Observasi langsung Muse pada tab audit sintetis; atlas Notion tetap sumber konteks, bukan sumber ukuran final. Desktop 1672×879; mobile 390×844. [Atlas Muse](https://app.notion.com/p/3feabdd6187381da8a92d4243d0b1303).

| Elemen | Bukti Muse | Implementasi/adaptasi Ngertiin |
| --- | --- | --- |
| Rail desktop | Screenshot: 72 px, ikon vertikal, search, avatar terpisah | 72 px, hanya fitur V1; tanpa Feed/Ideas/channel/konektor |
| Composer desktop | DOM: textarea x541..1163, tinggi24; screenshot shell x488..1256, lebar768, tinggi58 | Shell maksimum768 px setelah padding; satu entry lampiran, kirim/stop mengikuti kontrak run |
| Kolom pesan | Screenshot: batas baca sekitar768 px; user kanan, agent kiri | Kolom768 px termasuk padding, bubble dan semantic tokens Ngertiin |
| Header | Pemilih side chat kiri, avatar tengah, whitespace tanpa garis pemisah | Pemilih thread kiri, avatar tengah, overflow kanan; avatar Ngertiin44 px adalah adaptasi yang belum dianggap pixel parity |
| Panel | Atlas dan live: chat + panel; resize, maximize/close | Default asisten360 px; fitur/detail480 px; resize320–900 px, maksimum52vw. Angka480 dan batas resize adalah keputusan Ngertiin, bukan token resmi Muse |
| Mobile | Live390×844: navigasi bawah, composer di atas navigasi | Navigasi bawah56 px + safe area; hanya empat tujuan V1. Asisten tetap entry header |
| Empty side chat | Live Muse: area kosong dan composer | Teks petunjuk satu baris, tanpa kartu saran; adaptasi copy Ngertiin |
| Search | Atlas/live entry: dialog, daftar hasil | Dialog680 px pada desktop, penuh pada mobile; filter Ngertiin dipertahankan |

## Bukti visual

File di [direktori screenshot](evidence/shell-42/) harus dibaca bersama batas berikut. Isi pesan sintetis berbeda antara produk; ini perbandingan state/layout, bukan golden image dengan konten identik. Screenshot desktop light dan error ditangkap sebelum penyesuaian avatar terakhir; keduanya membuktikan tema/state, bukan tampilan final header. Split desktop dan light/populated mobile sudah diperbarui setelah revisi terakhir.

- [Muse populated desktop](evidence/shell-42/muse-desktop-populated.jpg), [Muse empty desktop](evidence/shell-42/muse-desktop-empty.jpg), [Muse populated mobile](evidence/shell-42/muse-mobile-populated.jpg).
- [Ngertiin desktop light](evidence/shell-42/ngertiin-desktop-light.jpg), [Ngertiin split](evidence/shell-42/ngertiin-desktop-split.jpg), [Ngertiin error](evidence/shell-42/ngertiin-desktop-error.jpg).
- [Ngertiin empty desktop](evidence/shell-42/ngertiin-desktop-empty.jpg), [Ngertiin empty mobile](evidence/shell-42/ngertiin-mobile-empty.jpg), [Ngertiin populated mobile](evidence/shell-42/ngertiin-mobile-populated.jpg), [Ngertiin light mobile](evidence/shell-42/ngertiin-mobile-light.jpg).
- [Respons selesai di split](evidence/shell-42/ngertiin-desktop-completed-split.jpg): screenshot diambil setelah respons selesai; tidak diklaim sebagai frame streaming walau aksi navigasi dimulai saat run aktif.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `make check` | Lint frontend, TypeScript, Ruff, format, Mypy lulus |
| `make build` | Build client/server lulus |
| `make quota-inspect` | 46 kontrak lulus, database sementara dibuang |
| `make files-inspect` | 47 kontrak lulus, resource sementara dibersihkan |
| `make docs-check` | 70 hashes, 46 tiket, empat view; order pecahan23.1–23.5 didukung tanpa melemahkan uniqueness/dependency checks |
| Desktop split | Draft tetap terbaca ketika Library dibuka; keyboard splitter480→512; collapse/open, maximize/restore, close lulus |
| Keyboard | Maximized panel menyembunyikan background dari accessibility tree; kembali memfokuskan composer; dialog search fokus input |
| Mobile | Library→detail hasil→Library→chat mempertahankan objek, return path, dan draft; tested390×844; lebar320 dan701 px tidak menimbulkan overflow horizontal root |
| Reply | Kutipan jawaban masuk ke draft. Target klik semula bertabrakan dengan pesan; diperbaiki menjadi baris tindakan di bawah pesan dan diuji ulang |
| Search | Query NG-042 mengembalikan thread uji; daftar main/side chat dan pembuatan side chat tetap tersedia |
| Run aktif | Dua permintaan sintetis,12 kalimat dan40 tips. Berpindah ke Library saat run aktif lalu kembali menghasilkan respons lengkap tanpa kehilangan thread. Worker dev semula tidak berjalan; dijalankan untuk pemeriksaan |
| Error/recovery | UUID thread tidak tersedia menampilkan error/retry; browser Back memulihkan thread dan draft |
| Tema | Light/dark lewat kontrol produk diverifikasi; dark dipulihkan setelah audit |
| Reduced motion | Aturan global dan komponen diperiksa secara statis; emulasi prefers-reduced-motion runtime belum dilakukan |

## Sisa acceptance sebelum Done

1. Unggah browser end-to-end belum terbukti. File chooser extension memerlukan izin file URL; izin tidak diubah. Percobaan picker native tidak menghasilkan upload yang terkonfirmasi. Kontrak upload backend47 lulus, tetapi tidak menggantikan acceptance UI upload/processing/retry/remove.
2. Muse streaming, error/recovery, light mode, dan reduced-motion belum direproduksi pada sesi ini. Tetap **unknown**. Tidak ada klaim UI identik untuk state tersebut. Tidak membuat permintaan model baru di Muse atau mengubah pengaturan akunnya.
3. Pasangan screenshot semua state dengan konten dan viewport identik, audit keyboard/screen reader menyeluruh, masih perlu melengkapi gate visual. Bukti yang ada mendukung implementasi fungsional, bukan sertifikasi pixel parity.
4. Posisi baca memiliki persistence per thread dalam kode; round-trip scroll pada riwayat panjang dengan pagination belum diuji khusus. Tidak menyamakan keberadaan kode dengan kelulusan acceptance ini.

NG-043–046 tetap Backlog. Mirrornya ditambahkan karena merupakan snapshot backlog baru yang belum ada di repo; tidak ada implementasi atau status tiket tersebut diubah. Tidak commit atau push otomatis.
