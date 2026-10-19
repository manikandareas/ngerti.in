# Penerimaan development NG-020

Tanggal: 19 Oktober 2026 WITA. Scope mengikuti keputusan pengguna untuk meniru
pengalaman proaktif Muse dari bukti yang tersedia, dengan kebijakan backend
Ngertiin yang dinyatakan tersendiri. Bukan klaim backend atau algoritma Muse sama.

## Implementasi

Migration incremental `0011_proactive_delivery`; preferensi akun/thread/Goal,
onboarding, perubahan lewat chat, pesan informatif tanpa pertanyaan wajib,
delivery transaksi tunggal, receipt/cap/dedup, quiet hours/snooze, unread,
Activity, kontrol mobile dan pencabutan lineage transcript. Rincian kebijakan
tersedia dalam [desain runtime](proactivity-delivery-runtime.md).

## Bukti dan batas verifikasi

- `make proactive-inspect`: 105 kontrak PostgreSQL disposable, termasuk 68
  kontrak NG-019 dan 37 kontrak delivery baru. Race last-slot lintas thread,
  receipt replay, mute/snooze, source/context change, expiry, rollback publikasi,
  timezone/DST, history revocation dan P23 diperiksa dengan provider terkontrol.
- Regresi: Scheduler 82, Task 55, Memory 62, Goals 74, File 47 dan quota 46.
- `make check` dan `make build` lulus. Pemeriksaan mirror dilakukan sesudah
  readback Notion akhir; hasil dicatat pada catatan penerimaan tiket.
- Browser Clerk development membuktikan onboarding dan penyimpanan timezone,
  perubahan thread menjadi quiet lewat chat nyata, serta mematikan proaktivitas
  seluruh akun lewat chat nyata. Pengaturan pada viewport 320×640 tidak overflow
  horizontal. Screenshot/readback disimpan di `evidence/proactivity-20/`.
- Dua evaluasi provider nyata melalui worker menghasilkan no-op: timing belum
  cukup pasti pada kasus anggaran, dan benefit/novelty/grounding tidak memenuhi
  minimum pada kasus pilihan pemasok. Keputusan tidak dipaksa menjadi delivery.
- Fixture positif delivery berlabel **terkontrol**, dengan evidence sintetis dan
  penilaian positif terkontrol, digunakan untuk menguji jalur pesan informatif
  tanpa action. Bukti ini dipisahkan dari evaluasi provider nyata; bukan bukti
  kualitas seleksi positif pada populasi pengguna.

Worker periodik mengirim fixture positif pada 16.58.00 WITA, sesudah waktu
delivery yang ditentukan 16.57.51, ketika browser berada di `about:blank`.
Read position sebelum/sesudah membuka thread adalah 0/3, dengan posisi pesan 3.
Mobile 320×640 dan desktop 1440×900 diperiksa. Audit diakhiri dengan intensitas
akun Nonaktif, evaluasi nonaktif, dan ketiga Goal fixture diarsipkan; pesan
terkirim tetap tersimpan.

Dua evaluasi provider mencatat 8.298 unit terkonfirmasi; dua giliran chat kontrol
mencatat 19.666 token model. Ini telemetry panggilan tersebut, bukan invoice atau
pengukuran seluruh biaya operasional. Snapshot/judgment dua no-op dipurge ketika
fitur dimatikan, sesuai revocation policy. Readback menyimpan state akhir,
receipt biaya, dan observasi no-op sebelum pencabutan secara terpisah.

`make docs-check` memverifikasi 65 page hashes, 41 tiket, empat views dan 1.168
tautan lokal setelah readback Notion. Status hanya NG-020 yang berubah menjadi
Done; properti tiket lain dipertahankan.

Cadence per menit bukan SLA detik. Threshold masih memerlukan kalibrasi lebih
luas pada NG-041. Tidak mengklaim production deployment, seluruh platform,
push/email/WhatsApp, invoice provider atau algoritma internal Muse.
