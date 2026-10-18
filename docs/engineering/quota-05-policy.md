> Catatan historis sebelum reset V1 asisten umum pada 18 Oktober 2026. Kontrak/command pembelajaran, migration head dan hasil acceptance lama di bawah tidak menjadi persyaratan aktif. Lihat [spesifikasi V1](../product/01-produk-dan-paket.md) dan [baseline baru](baseline-v1-acceptance.md).

# Kuota #05 — kebijakan dan kontrak

Implementasi [backlog #05](../backlog/tasks/05-kuota-course-chat-dan-materi-per-periode.md), berdasarkan brainstorming yang disetujui untuk dikerjakan pada 16 Oktober 2026. Gateway/checkout mengikuti #21; UI lifecycle paket lengkap mengikuti #22.

## Paket dan periode

Tiga meter independen: `course`, `chat`, `material_pages`. Free menyediakan 1/100/100; Plus 5/300/200 per 30 hari. Model, fitur dan kualitas sama. Batas disimpan sebagai snapshot per periode, dengan versi kebijakan. Sisa tidak diakumulasi. Waktu tersimpan UTC; batas periode inklusif pada awal dan eksklusif pada akhir.

Free berjangkar pada `accounts.created_at` (akun aplikasi dibuat pada akses pertama yang sah). Periode dibuat secara lazy dengan kelipatan tepat 30 hari, sehingga akun tidak aktif tidak menunda reset. Tidak ada pemotongan retroaktif atas pesan sebelum ledger tersedia.

Aktivasi Plus internal memulai 30 hari saat aktivasi sah. Pembelian ulang ketika Plus aktif/terjadwal menambahkan periode sesudah periode Plus terakhir; tidak mereset allowance lebih awal. Key aktivasi dan sumber harus konsisten saat replay. Saat Plus berakhir tanpa perpanjangan, Free berjangkar pada akhir Plus terakhir. Aktivasi memendekkan periode Free yang sedang berjalan; operasi terdahulu tetap terikat pada periode asal. Fungsi ini tidak diekspos sebagai endpoint mutasi atau tool agent. #21 harus memverifikasi pembayaran sebelum memanggilnya; refund pembayaran dan pembatalan entitlement mengikuti #21/#22.

## Ledger

`remaining = limit - committed - reserved`; reverse tidak lagi termasuk committed. Mutasi menahan lock akun sebelum lock domain/thread/run. Reserve, penulisan domain dan enqueue memakai satu transaksi singkat. Panggilan model/OCR/network berada di luar transaksi.

Identitas operasi stabil per akun/meter/resource. Input berbeda pada identitas sama ditolak. Reserve yang sudah reserved/committed mengembalikan operasi yang sama, termasuk lintas periode. Retry eksplisit setelah release/reverse memperoleh reservasi baru pada periode aktif dengan token baru; token lama kehilangan hak untuk commit. Riwayat event menyimpan periode, jumlah, token dan alasan setiap perubahan.

Release hanya melepas reserved; pemakaian committed dipulihkan lewat reverse eksplisit. Release/reverse tidak menghapus sejarah. Reversal terlambat memperbaiki periode asal, tanpa menambah allowance periode baru. Reservasi pekerjaan lama dapat selesai sesudah reset pada periode asal. Tidak ada expiry buta berdasarkan umur reservasi: pemilik workflow harus memagari worker dan memastikan status domain terminal sebelum melepaskannya.

## Chat

Satu pesan pengguna mereservasi satu unit ketika run dibuat. Commit terjadi bersama penyimpanan teks jawaban asisten nonkosong atau kartu HITL. Reasoning/progress tool tidak memicu commit. Main/side/panel Course menggunakan meter akun yang sama.

Multi-call model/tool, SSE reconnect, replay, keputusan approval dan recovery tidak menambah unit. Stop/error/hasil kosong sebelum output melepaskan reservasi; sesudah output tetap dihitung. Retry setelah release memeriksa kapasitas lagi. Run historis tanpa reservasi tetap grandfathered; tidak ditagih saat replay/resume.

Kuota nol hanya melarang pesan baru atau retry yang membutuhkan reservasi baru. Approval, penolakan, stop, pembacaan history dan pekerjaan yang sudah diterima tetap dapat diproses, dengan batas operasional yang sudah ada.

## Course

Menyimpan tujuan `/course`, pencarian sumber dan review outline belum memakai slot Course; pesan percakapannya tetap memakai chat. #08 mereservasi satu Course berdasarkan ID Course dan revisi outline yang disetujui dalam transaksi approval yang sama. #09 commit bersama publikasi Lesson pertama yang lolos gate. Node berikutnya, recovery dan pengayaan untuk tujuan sama memakai operasi tersebut.

Pembatalan sebelum publikasi melepas reserve. Penghapusan Course terbit tidak mengembalikan unit. Kegagalan sistem final yang tidak dapat memenuhi outline memulihkan unit lewat reverse sesudah pemulihan dinyatakan berhenti; konten tersedia dipertahankan. Percobaan baru setelah pengembalian harus memperoleh reserve kembali, tanpa pemakaian bersih ganda.

Kuota pembuatan tidak memblokir membaca Lesson, Practice/grading, retry soal salah atau review flashcard tersedia. Pertanyaan baru melalui panel chat mengikuti meter chat. Otorisasi akses konten tetap milik domain belajar.

## Materi

Normalisasi `page-equivalent-v1`: PDF dihitung per halaman; gambar per lembar; dokumen dominan gambar mengikuti jumlah halaman hasil render; teks/dokumen tanpa pagination tetap/web memakai konten bersih dengan pembulatan ke atas per 500 kata, minimum satu untuk konten nonkosong. Konten kosong ditolak. Penghitungan kata memakai rentang non-whitespace; parser #06 harus mengirim konten bersih, bukan HTML mentah. Ini unit kapasitas produk, bukan klaim kesetaraan biaya OCR.

Measurement berasal dari backend. #06 memeriksa ownership/revisi dan reuse hasil siap sebelum reserve; satu revisi siap milik akun yang sama dapat dipakai lintas Course/periode tanpa pemotongan ulang. Retry/reindex sistem tidak membuat identitas materi baru. Revisi konten baru memakai identitas baru. Penghapusan tidak mengembalikan pemakaian. Jika hasil sudah dihapus dan perlu ingestion baru, #06 membuat identitas ingestion baru; retry/reindex sistem mempertahankan operasi asal. Kandidat pencarian/cuplikannya belum menjadi ingestion penuh.

Ukuran diketahui sebelum OCR/embedding berbiaya, lalu reserve seluruh jumlah, proses, dan commit bersama publikasi hasil siap. Jumlah melebihi allowance menolak pekerjaan tanpa memangkas input diam-diam. Kegagalan/cancel sebelum siap melepaskan reserve. Batas format/ukuran/storage dan parser/OCR merupakan #06.

## Batas penerimaan

#05 menerapkan chat nyata, endpoint usage dan ringkasan UI. Course/materi diuji sebagai kontrak transaksi; integrasi generation/ingestion nyata baru diterima pada #06/#08/#09. Bukti penerimaan mencatat probe database, browser dan pemeriksaan statis secara terpisah.
