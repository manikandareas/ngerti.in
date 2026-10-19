# NG-039 · Library dan pencarian melalui chat

Diterima pada development, 19 Oktober 2026. Scope mengikuti final plan pengguna: chat menjadi pintu utama untuk menemukan, membuka dan melanjutkan pekerjaan. Konektor native, OAuth dan sinkronisasi eksternal tidak masuk V1.

## Perilaku yang diterima

- `search_resources` mencari percakapan, Task, file, hasil, Tujuan dan Jadwal milik akun. `read_resource` membaca konten terbatas dari referensi exact; metadata tidak diklaim sebagai isi dokumen.
- Kartu pencarian dalam chat menyimpan referensi, lalu UI menghidrasi metadata melalui pemeriksaan akses baru. Pilihan Bicarakan disimpan per akun/thread, terlihat di composer, bertahan setelah reload dan tidak mengirim pesan otomatis.
- Chat run menangkap pilihan sebagai snapshot. Tool Task dapat memperbarui hasil milik akun dari percakapan lain dengan result ID/revision exact; optimistic concurrency menolak pembaruan revision lama. Pilihan versi lama tetap versi lama sampai pengguna memilih versi terbaru.
- File & hasil menjadi Library. Global Cari meliputi enam jenis resource; Library berfokus pada file/hasil. Filter jenis/waktu dan urutan relevansi/terbaru/judul bersifat opsional. Pagination tidak lagi bergantung pada daftar 50 item terbaru.
- Detail memakai panel berdampingan pada desktop dan Sheet penuh pada mobile. Task, hasil, Tujuan dan Jadwal menggunakan kontrol domain yang sudah ada. Membuka panel asisten menutup detail resource agar dua panel tidak mempersempit chat sekaligus.
- Halaman Kemampuan Gwen dan konteks agent menggunakan inventory backend yang sama. Ketersediaan konfigurasi runtime dibedakan dari izin tindakan. Contoh mengisi draft pada thread yang sama, mempertahankan draft sebelumnya, tanpa menjalankan pekerjaan.
- Penghapusan berlaku pada pencarian dan operasi berikutnya melalui sumber kanonis; cache bukan pemberi akses. Perubahan privasi memory membatalkan konteks percakapan yang sudah dibaca agent. Isi resource tidak menciptakan grant.

## Walkthrough model dan browser nyata

Browser Brave desktop 1672×822 dan viewport mobile 390×844; mobile adalah emulasi viewport, bukan pengujian perangkat fisik. Data audit sintetis.

| Skenario | Expected dan actual |
| --- | --- |
| Chat A meminta laporan Markdown: Januari 100, Februari 120 | Satu Task background menghasilkan laporan, persentase kenaikan 20%, hasil siap dan file dapat dibuka |
| Chat B mencari laporan dari chat lain | Tool pencarian memunculkan kartu hasil dengan referensi hasil v1; tidak membuat Task tambahan |
| Buka → Bicarakan → reload | Pilihan tetap mengikat hasil yang sama dan v1; composer tidak mengirim otomatis |
| Minta baca dan revisi: tambah Maret 150 | Trace mencatat `read_resource`, `search_resources`, `start_background_task`; hasil yang sama menjadi v2, dengan kenaikan Januari–Maret 50% |
| Buka v1 dan v2 pada mobile | Dropdown, label detail dan pilihan chat mengikuti revision yang dibuka; v1 tetap berisi dua bulan dan v2 berisi tiga bulan |
| Cari kata yang tidak ada | Empty state “Belum ada yang cocok” memberi petunjuk mencoba judul/nama/kata lebih singkat |
| Hentikan API sementara, lalu pulihkan | Detail menampilkan error dan Coba lagi; retry membuka resource kembali sesudah API tersedia |
| Contoh Kemampuan Gwen saat ada draft | Contoh ditambahkan ke draft yang ada pada thread yang sama; allowance tetap 80 dan pesan tidak dikirim |
| Library desktop | Navigasi tunggal Library, daftar file/hasil, status/versi dan tindakan Buka/Bicarakan; document scrollWidth sama dengan viewport 1672 px |

IDs:

- Chat A: `22996ffb-7a7a-58d7-9dbb-c66b539fa4fe`.
- Chat B: `f53629fc-6b06-5140-b6e2-6d61973f6d99`.
- Result: `c532d027-2bc7-5c04-a88b-8e9dc09ad0f0`.
- File: `laporan-penjualan-ng039.md`; v1 SHA-256 prefix `6d4297e924f3`, v2 `77ef261e1e13`.

Bukti: [trace model dan Task](evidence/library-39/live-readback.json), [bytes/revision hasil](evidence/library-39/result-revisions.json), [environment/package](evidence/library-39/environment.json), [screenshot desktop](evidence/library-39/desktop-chat.jpg), dan [screenshot mobile](evidence/library-39/mobile-result.jpg). Uji awal menemukan masalah pencocokan tanda baca nama file; query yang sama berhasil setelah normalisasi. Trace awal tersebut dipertahankan, bukan dihapus dari bukti.

## Pemeriksaan kontrak dan regresi

`make library-inspect` lulus **65 skenario**, memakai PostgreSQL sementara dan prefix object storage khusus probe yang dibersihkan. Mencakup enam jenis, ownership, filter/waktu, pagination, input SQL literal, exact/historical revisions, unggahan belum selesai, teks UTF-8 terbatas, forgotten source, generation privasi, selection snapshot, tool/projection, revisi lintas thread, stale update, deletion/revoke, conditional capabilities, HTTP auth dan validasi.

[Hasil kontrak](evidence/library-39/controlled-contracts.json).

Regresi: `make files-inspect` **47**, `make task-inspect` **55**, `make quota-inspect` **46** lulus. `make check`, `make build`, `make docs-check`, dan `git diff --check` lulus. Build memuat peringatan dependency `use client` yang tidak menghalangi keluaran produksi.

## Operasi dan batas

Migration `0012_resource_library` menambah teks pencarian file dan pilihan/snapshot referensi. Upgrade development sudah diterapkan; backfill **21 file** memakai bytes/ekstraksi yang sudah tersedia dan diverifikasi hash, tanpa model atau OCR tambahan. Untuk upgrade environment lain:

```sh
make migrate
make library-backfill
```

Pencarian adalah teks PostgreSQL, bukan semantic search atau OCR otomatis saat mencari. Konten file yang diindeks dibatasi 120.000 karakter. Pembacaan agent dibatasi 12.000 byte UTF-8; percakapan mengembalikan 30 pesan terbaru yang masih sah. Pencarian pesan dapat menemukan teks lebih lama dari jendela baca tersebut. File tanpa teks dapat ditemukan lewat nama/metadata; kontennya belum dianggap terbaca. Query mempunyai timeout 4 detik dan page size maksimal 50.

Empat chat run audit mencatat **38.274 token**; dua Task memakai **2.391 usage units**. Unit Task dan token chat adalah telemetry terpisah dan tidak dijumlahkan sebagai tagihan. Pencarian langsung tidak memanggil model; pencarian lewat chat mengikuti ledger chat yang ada. Invoice/tarif uang tidak diverifikasi. Audit ini menggunakan Task teks, tanpa provisioning sandbox/browser tambahan.

Acceptance ini membuktikan development pada data audit, termasuk kontrol akses dan fault probes terkontrol. Kapasitas korpus besar, kualitas semantic search, produksi, perangkat mobile fisik, konektor, editor kompleks, sharing publik dan generator media tidak diklaim oleh NG-039.
