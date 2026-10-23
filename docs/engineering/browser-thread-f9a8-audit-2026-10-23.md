# Audit riset browser pada thread f9a8 — 23 Oktober 2026

Thread: `f9a8e50e-210b-5572-9815-db543d59f42e`.
Task: `7d3ed451-c0e7-4770-a8ea-fcd5dd022f5e`.
Permintaan pengguna: “research terkait trend ai agent di 2027 nanti”.

Audit membaca database development dengan transaksi read-only, membaca metadata E2B tanpa resume, dan mereproduksi perpindahan tab pada browser lokal terisolasi. Tidak mengubah kode runtime, melanjutkan Task, mereset profil, atau menyalakan/mematikan server development. Browser fixture sudah ditutup.

## Hasil aktual

Task gagal pada 23 Oktober 2026, **13:37:36 WITA**, sekitar **159,642 detik** setelah dibuat pada 13:34:57. Batas sesi komputer 20 menit belum tercapai. Draft dan hasil akhir sama-sama kosong.

| Bukti | Nilai |
| --- | --- |
| Aksi tercatat | 11: 4 navigate, 5 click, 2 wait |
| Observasi | 26 complete, 1 unknown pada pembacaan awal |
| Scroll / tombol Back | Tidak ada yang tercatat |
| Panggilan model | 13 dari batas 24; seluruhnya OpenAI-compatible |
| Panggilan TypeSafe/Jev | 0 |
| Engine pada policy Task | `jev` |
| Engine aktual pada runtime state | `screenshot` |
| Resource E2B yang digunakan | Retained `ngertiin-desktop-v1`, template `68q3umevaxnshb5rwnrm` |
| Kondisi resource ketika diaudit | paused; tidak di-resume untuk audit |
| Pemakaian work / batas | 36.624 / 60.000 unit |
| Sisa work / kebutuhan reservasi berikutnya | 23.376 / 26.630 unit |
| Catatan bukti bacaan di runtime state | 0 |
| Draft / hasil tersimpan | 0 karakter / 0 karakter |

Pesan kegagalan: `Batas komputasi task tercapai. Draft yang sudah ada tetap tersimpan.` Pada Task ini frasa terakhir tidak berarti ada draft yang berhasil tersimpan.

Tiga execution bukan tiga crash. Execution pertama melakukan continuation setelah fase verifikasi; kedua menunggu keputusan untuk klik McKinsey; ketiga melaksanakan aksi yang disetujui lalu gagal pada reservasi budget. Tidak ada unknown effect pada workspace. Penghentian resource merupakan cleanup setelah kegagalan aplikasi, bukan bukti E2B tiba-tiba memutus komputer.

## Rekonstruksi singkat

Semua waktu di bawah WITA, UTC+8.

| Waktu | Peristiwa |
| --- | --- |
| 13:34:57 | Task browser dibuat untuk riset tren AI agent menuju 2027. |
| 13:35:10–13:35:13 | Mencoba jalur DOM, lalu memakai screenshot. Resource aktual masih desktop-v1. |
| 13:35:17 | Membuka pencarian Google pertama; kueri memuat 2025 dan 2027. |
| 13:35:33 | Klik sumber Gartner. |
| 13:35:41 | Navigasi eksplisit ke pencarian Google lain. |
| 13:36:17–13:36:23 | Actor mencapai `finish`; verifier dipanggil; Task masuk `computer_correcting`, lalu continuation. Kandidat dan alasan verifier tidak tersimpan. |
| 13:36:34, 13:36:42, 13:36:49 | Tiga klik lagi untuk sumber/rilis Gartner. Dua klik terakhir hampir di koordinat sama: (1000,386) dan (1002,384). |
| 13:37:00 | Navigasi ke pencarian Google ketiga. |
| 13:37:15–13:37:24 | Klik McKinsey ditahan untuk approval, lalu dilaksanakan setelah keputusan pengguna. |
| 13:37:29 | Navigasi langsung ke rilis Gartner. |
| 13:37:36 | Reservasi model berikutnya ditolak; Task gagal; tidak ada draft/hasil. |

Ini memang pola pengulangan sumber/pencarian tanpa hasil tersimpan. Tidak ada aksi Back dalam ledger. Sebagian gerakan kembali ke pencarian merupakan keputusan `navigate` eksplisit; bagian yang tampak seperti tab artikel dibuka lalu segera ditinggalkan juga dapat dijelaskan oleh temuan pengelolaan tab berikut.

## Temuan dan tingkat kepastian

### 1. P1 — Observasi dapat meninggalkan tab artikel dan mengaktifkan tab pencarian lama

`computer/cdp.py:12` menyimpan satu identitas tab pada `target.json`. Ketika tautan membuka tab baru, tab yang dipilih tetap tab lama. `computer/actuator.py:41` selalu menjalankan `Target.activateTarget` dan `Page.bringToFront` untuk target tersebut sebelum screenshot, inspeksi target, atau aksi. Tidak ada mekanisme untuk mengadopsi tab hasil klik yang sah.

**Reproduksi berhasil pada Chromium/Brave terisolasi:** tautan `target=_blank` membuka Article fixture; artikel visible/focused dan Search fixture hidden. Pemanggilan fungsi `actuator.dispatch` aktual untuk observasi mengubah Search fixture menjadi visible/focused dan artikel menjadi hidden. Hanya perintah Linux `scrot` yang distub pada macOS; target discovery dan perubahan fokus CDP benar-benar dijalankan.

Kepastian: bug kode dan mekanismenya **terkonfirmasi melalui reproduksi**. Bahwa setiap klik historis Gartner/McKinsey pada Task ini membuka tab baru merupakan **penjelasan paling kuat, belum bukti historis lengkap**. Runtime tidak mencatat target/opener/URL sebelum-sesudah klik, sehingga tidak dapat memastikan detail setiap perpindahan pada run tersebut. Tidak ada bukti untuk menyimpulkan semua situs memblokir akses atau semua artikel berhasil termuat.

### 2. P1 — Task yang dikonfigurasi Jev sebenarnya tidak memakai Jev

Metadata provider memastikan workspace masih menggunakan `ngertiin-desktop-v1`. `computer/e2b.py:151` memakai interpreter DOM yang dibakar ke template v2; exit 127 menghasilkan `DomUnavailable`. `computer/workflow.py:126` kemudian menetapkan engine screenshot pada runtime state. Task ini memiliki engine screenshot dan nol panggilan TypeSafe di seluruh cost ledger.

Default template v2 hanya digunakan saat membuat resource baru; tidak memperbarui retained workspace v1. Fallback lama berfungsi sesuai jalur kompatibilitas, tetapi menghilangkan manfaat Jev/DOM yang diharapkan dari konfigurasi Task baru. Kepastian engine aktual dan template: **terkonfirmasi**.

### 3. P1 — Jalur screenshot tidak memiliki penjaga loop dan catatan bacaan yang setara dengan DOM

Pemeriksaan fingerprint/unchanged dan pengumpulan `evidence` berada di dalam cabang DOM (`computer/workflow.py:131–157`). Jalur screenshot (`:165`) melewatinya. Bahkan penjaga DOM saat ini hanya mengalihkan ke screenshot setelah pengamatan berulang; belum mendeteksi siklus antarsitus atau klik berulang secara menyeluruh.

`computer/continuation.py:26` mencatat deskripsi aksi sebagai progress. “Membuka sumber Gartner” tidak membuktikan sumber terbaca atau sebuah klaim berhasil diekstrak. Pada Task ini terdapat 11 deskripsi progress, tetapi tidak ada evidence sumber yang tersimpan dan tidak ada scroll. Actor menerima histori delapan aksi terakhir dan screenshot saat ini; daftar URL yang sudah dipelajari, temuan, dan alasan pengulangan belum tersedia sebagai state riset.

Kepastian celah kode dan state kosong: **terkonfirmasi**. Tidak dapat menyimpulkan model sama sekali tidak membaca teks yang kebetulan terlihat pada screenshot; isi pengamatan/penalaran tersebut tidak tersimpan.

### 4. P1 — Reservasi budget menghentikan Task sebelum batas waktu/call/step tercapai

`computer/model.py:97` memesan ukuran konteks dalam byte, konteks persona, overhead screenshot 18.000, dan ceiling output. `tasks/budget.py:56` menolak bila pemakaian ditambah reservasi melebihi cap.

Rekonstruksi konteks actor berikutnya dari state dan histori Task menghasilkan **26.630 unit**. Sisa Task **23.376 unit**, kekurangan **3.254 unit**. Replay fungsi `reserve_call` aktual dengan state tangkapan di memori menghasilkan pesan kegagalan persis yang tersimpan, tanpa menulis database atau memanggil model.

Artinya pemakaian yang sudah dikonfirmasi baru 61,04% dari cap, tetapi panggilan berikutnya tidak dapat direservasi. Ini penjaga budget yang bekerja sesuai implementasi, dengan orkestrasi yang belum menyediakan jalan menuju hasil parsial/finalisasi ketika sisa budget mengecil. Tidak cukup hanya memperpanjang timeout atau menambah retry. Kepastian penyebab terminal: **terkonfirmasi**. Unit ini work aplikasi, bukan dolar atau invoice provider.

### 5. P1 — Verifier dan penyimpanan kandidat belum sesuai untuk riset lintas situs

Event `computer_verifying` diikuti `computer_correcting` membuktikan actor sempat memilih `finish` dan verifikasi tidak berhasil dilalui. Panggilan kelima mengeluarkan 3.036 output token, tetapi konten kandidat tidak disimpan, sehingga kualitas jawaban itu tidak dapat diaudit.

Verifier (`computer/verification.py:23`) menerima tujuan, `action.description`, dan screenshot terbaru. Isi `action.files`, kumpulan temuan sumber, kutipan, atau halaman-halaman yang dibaca tidak diberikan. Penilaian “tujuan terlihat terpenuhi” dari satu screenshot bukan kontrak verifikasi yang cukup untuk sebuah laporan riset multisumber. Penyimpanan kandidat baru dilakukan sesudah verifier lulus (`computer/workflow.py:190`), sehingga draft tetap kosong saat verifikasi gagal.

Kepastian alur finish/verifikasi/koreksi dan tidak tersimpannya kandidat: **terkonfirmasi**. Tidak dapat memastikan apakah verifier salah menolak atau berhasil menolak laporan yang lemah, karena verdict/alasan dan kandidat tidak dicatat. Feedback juga dikosongkan pada checkpoint aksi berikutnya, sehingga alasan koreksi bukan catatan evaluasi yang tahan lama.

### 6. P2 — Bukti operasional terlalu tipis untuk menjelaskan akibat setiap klik

Receipt `complete` menyatakan perintah input dikonfirmasi, bukan bahwa artikel berhasil terbuka dan terbaca. Ledger tidak menyimpan URL/title/target/opener sebelum-sesudah aksi, perubahan state halaman, atau alasan klasifikasi approval. Screenshot transient juga tidak menghasilkan metadata bacaan pada jalur fallback.

Selain itu, ketiga kueri Google secara eksplisit memuat 2025, walaupun Task berlangsung Oktober 2026. Konteks actor browser tidak memasukkan waktu runtime secara eksplisit (`computer/model.py:85`). Ini risiko freshness riset, bukan bukti bahwa semua sumber tahun 2025 tidak layak dipakai untuk proyeksi 2027.

## Urutan perbaikan yang disarankan

1. Perbaiki lifecycle tab: ikuti target baru yang berasal dari klik sah dalam lease/epoch saat ini, periksa tujuan, lalu perbarui canonical target dan batalkan proposal lama secara atomik. Jangan sekadar memilih tab terakhir atau tab aktif, karena popup dan takeover harus tetap terisolasi. Uji `target=_blank`, window.open, tautan biasa, redirect, dan manusia membuka tab saat takeover.
2. Pastikan capability aktual resource saat admission/startup. Migrasikan retained profile ke runtime v2 dengan preservasi/backup dan validasi profil; tampilkan engine aktual serta alasan fallback. Hindari reset login sebagai jalan pintas.
3. Terapkan observasi hasil dan penjaga pengulangan pada kedua engine: URL/target yang benar, state siap dibaca, fingerprint semantik, aksi berulang, siklus kunjungan, dan jumlah temuan baru. Setelah pengulangan tanpa kemajuan, replan atau pindah sumber; jangan terus mengklik sumber yang sama.
4. Pisahkan pencarian, pembacaan/ekstraksi, dan sintesis. Simpan temuan sumber/URL/tanggal dan kandidat draft secara bertahap sebelum validasi; verifier menilai isi laporan beserta bukti multisumber. Kandidat yang belum tervalidasi tetap belum dipublikasikan sebagai hasil sukses.
5. Anggarkan finalisasi secara eksplisit. Saat budget tidak cukup untuk aksi baru, simpan temuan/kandidat dan keluarkan hasil parsial yang jujur atau status blocked-budget yang dapat dilanjutkan, bukan kegagalan generik tanpa draft. Tinjau konsistensi estimasi byte/token/image; jangan hanya menaikkan cap.
6. Tambahkan metadata trace yang tersanitasi: engine/capability, alasan fallback, target/opener, URL/title sebelum-sesudah, perubahan hasil, dan verdict verifier. Pertahankan larangan capture/ekspor kredensial dan isolasi takeover. Sertakan waktu runtime dan tanggal sumber pada workflow riset.

Acceptance perlu mencakup riset 2–3 situs dengan artikel yang membuka tab baru, fallback screenshot pada profil lama, pengulangan tanpa kemajuan, verifikasi laporan multisumber, dan budget hampir habis. Uji pencarian/form satu halaman yang sebelumnya lulus belum mewakili kasus ini.

## Bukti dan batas audit

- [Task, aksi, execution, cost ledger, dan event timeline](evidence/browser-thread-f9a8/task-trace.json).
- [Reproduksi fokus tab dengan fungsi aplikasi aktual](evidence/browser-thread-f9a8/tab-focus-reproduction.json).
- [Hash sumber yang diaudit](evidence/browser-thread-f9a8/source-hashes.json).

Audit ini menghasilkan temuan dan prioritas perbaikan. Kode runtime belum diubah pada tahap audit ini. Data historis tidak cukup untuk memastikan tampilan/isi setiap artikel, alasan pasti verifier menolak kandidat, atau apakah suatu situs mengalami paywall/CAPTCHA pada saat kejadian.
