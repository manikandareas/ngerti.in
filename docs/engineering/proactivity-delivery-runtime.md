# Delivery proaktif NG-020

NG-019 membentuk kandidat melalui LLM/Jev. NG-020 menentukan apakah kandidat yang
terpilih masih layak menjadi satu pesan mandiri dalam percakapan. PostgreSQL
menyimpan preferensi, receipt perubahan, kandidat, pesan, event, dan receipt
delivery; Procrastinate memeriksa delivery setiap menit meskipun browser tertutup.

## Dasar pengalaman dan batas bukti

[Riset Muse](../research/muse-ai-v1/02-arsitektur-vendor.md) mendokumentasikan
pekerjaan background, penilaian sebelum pemberitahuan, informasi baru/kebutuhan
input, serta pengaturan intensitas lewat chat. Observasi UI membuktikan Activity,
Ideas, Feed dan percakapan; backend ranking, routing, cap, quiet hours, dan dedup
Muse tidak diperoleh. Kebijakan numerik di bawah merupakan keputusan Ngertiin.

## Preferensi dan onboarding

Migration incremental `0011_proactive_delivery` tidak mereset data. Preferensi
produk terpisah dari flag evaluasi diagnostics. Akun baru ditawari Normal;
delivery baru aktif setelah pengguna menyimpan pilihan dan membaca penjelasannya.
Akun pratinjau yang sebelumnya nonaktif mempertahankan Nonaktif. Akun pratinjau
yang aktif juga memerlukan acknowledgement produk. Mematikan fitur mencabut
kandidat/snapshot yang belum dikirim; menyalakan kembali tidak menghidupkan
snapshot yang dicabut.

Pengaturan akun memuat intensitas, timezone IANA, jam tenang dan snooze. Thread dan
Goal mempunyai override intensitas/jeda dengan revisi terpisah. Nonaktif pada
akun, thread, atau Goal terkait memblokir pengiriman. Goal yang ditautkan melalui
Task juga diperiksa. Jeda terpanjang dari seluruh scope berlaku. Jam tenang akun
tetap berlaku pada seluruh scope. Override scope tidak menaikkan cap total akun.

API: GET `/proactivity`, GET `/proactivity/scope/{thread|goal}/{id}`, POST
`/proactivity/preferences`, serta POST `/proactivity/read/{thread_id}/{position}`.
Semua owner berasal dari sesi Clerk; ID scope diverifikasi sebelum read/write.
Perubahan memakai expected revision dan request key; replay exact mengembalikan
receipt, sedangkan key dengan isi berbeda ditolak. Kontrol UI tidak menggunakan
allowance chat atau inference. Draft form tetap tersedia ketika terjadi konflik.

Chat menyediakan `read_proactivity_preferences` dan
`set_proactivity_preferences`. Perubahan membutuhkan instruksi langsung pada
pesan pengguna saat ini, kutipan exact, revision scope dan lease chat yang masih
aktif. Konten file/web/history tidak menjadi izin. Cakupan percakapan diikat ke
thread run; Goal memakai ID owner-scoped dan nama yang disebut pengguna, atau
referensi “tujuan ini” ketika hanya ada satu Goal aktif dalam thread tersebut.
Perubahan ini tidak mengubah Soul, memory, izin eksternal atau jadwal.

## Kebijakan interupsi awal

| Intensitas | Ceiling gabungan akun per 24 jam berjalan | Jarak minimum |
| --- | --- | --- |
| Lebih tenang | 1 pesan | 12 jam |
| Normal | 3 pesan | 4 jam |
| Lebih aktif | 6 pesan | 1 jam |

Ini ceiling internal, bukan target cadence atau angka milik Muse. Hari berjalan
mencegah perubahan timezone membuka cap baru. Lebih tenang juga memerlukan
benefit >= 1,8, timing >= 1,5 dan novelty >= 0,95. Seluruh intensitas tetap
memerlukan minimum relevance/benefit/timing/confidence/grounding NG-019. Override
scope memengaruhi selektivitas/jarak; cap akun tetap memakai intensitas akun.
Quiet hours awal 22.00–08.00 mengikuti timezone yang ditinjau pengguna. Dispatcher
mengecek ulang per menit dalam jam tenang sehingga DST fold/gap tidak menciptakan
waktu lokal rekaan. Snooze maksimal satu tahun; expiry kandidat tetap berlaku.

## Kandidat dan pengiriman

Kandidat informatif boleh `action=null`; `needs_input` tetap memerlukan pertanyaan
spesifik. Payload lama dengan action teks tetap terbaca. Pesan menggunakan
`what_is_new` dan action jika ada, tanpa inference penulisan tambahan. Pesan
menyimpan metadata sebab, waktu, dan versi policy; UI menyediakan “Mengapa ini
muncul?” tanpa menampilkan skor/debug internal.

Sebelum mengirim, transaksi mengunci akun lalu kandidat/thread dan memeriksa:

1. Receipt yang sudah ada, status dan expiry kandidat.
2. Flag server/evaluasi, onboarding, intensitas, scope, snooze dan quiet hours.
3. Revision/hash/ownership sumber dan watermark event akun. Konteks yang berubah
   membuang kandidat lama; evaluasi berikutnya menyusun kandidat baru.
4. Hubungan evidence ke thread tujuan, minimum semantik dan novelty sebelumnya.
5. Dedup konten lintas thread tujuh hari, cap gabungan dan jarak interupsi.
6. Chat yang sedang menjawab/menunggu keputusan ditunda agar tidak diinterupsi.

Pesan assistant dengan `run_id=null`, event SSE, receipt delivery dan status
`delivered` ditulis atomik. Receipt candidate unik dan ID pesan deterministik
mencegah duplikasi setelah restart/retry. Gagal sebelum commit tidak memakai cap.
Kandidat yang ditahan menyimpan alasan serta waktu pemeriksaan berikutnya.
Dispatcher mengambil paling banyak satu kandidat per akun per sweep; expiry
mencegah burst tumpukan lama setelah offline. Tidak ada Task baru dari delivery.

Dedup deterministik memakai jenis, informasi baru dan action yang dinormalisasi,
tanpa thread dalam kunci. Riwayat kandidat terkirim yang sumbernya masih valid
juga masuk konteks novelty Jev agar perubahan kata tidak dianggap kebaruan.
Ini bukan jaminan dedup semantik universal. Batas evaluasi/biaya NG-019 tetap
terpisah dari cap pesan; error provider tidak menjadi no-op dan tidak diulang
otomatis.

## Riwayat, hasil yang diminta dan pencabutan

Navigasi chat menampilkan jumlah saran belum dibaca. Membuka percakapan yang
terlihat mengirim read position monoton; browser tersembunyi tidak menandai read.
Thread aktif menerima pesan melalui SSE, sedangkan navigasi diperbarui berkala.
Activity menampilkan saran terbaru dan Pengaturan menautkan percakapan asal.

Task dan Schedule mempertahankan publikasi serta receipt hasilnya sendiri.
Quiet hours/cap proaktif tidak menghapus atau menahan hasil yang memang diminta;
completion/approval tidak dibuat ulang menjadi pesan proaktif. Pemberitahuan
eksternal, Feed/Ideas penuh dan eksekusi Goal otomatis bukan bagian delivery ini.

Koreksi/forget/sumber hilang memagari kandidat. Riwayat untuk model memeriksa
lineage pesan proaktif agar informasi yang dicabut tidak masuk kembali melalui
transcript. Pesan yang sudah terkirim tetap menjadi riwayat pengguna; aturan ini
tidak menjanjikan penarikan semua salinan historis.

Operasi dan batas penerimaan: [laporan NG-020](proactivity-20-acceptance.md).
