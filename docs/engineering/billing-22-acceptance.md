# Penerimaan NG-022 · Lifecycle paket pengguna

Diterima development pada 19 Oktober 2026. Scope: renewal terverifikasi, expiry/downgrade, refund penuh/sebagian, dampak pada Task/Jadwal, dan kontrol saat allowance habis. Checkout tetap Lemon Squeezy saja; Duitku tetap dinonaktifkan.

## Perilaku yang diterima

- Lifecycle policy `subscription-lifecycle-v1` disimpan per order, termasuk order NG-021 yang dimigrasikan. Tidak ada tambahan allowance Plus selama renewal belum terverifikasi. Cancel menghentikan perpanjangan tanpa mencabut periode yang sudah dibayar.
- Setelah paid-through habis, chat dan compute kembali ke Free 100 pesan/1.000 kredit per 30 × 24 jam. Renewal yang terverifikasi memberi satu grant untuk cycle asal, tanpa menggeser periodenya karena replay.
- Refund penuh dari invoice provider terverifikasi mencabut sisa hak cycle terkait melalui `quota_grants.revoked_at`. Receipt, cycle asli, penggunaan, reservasi pekerjaan lama dan biaya provider tidak dihapus atau ditulis ulang. Refund historis tidak mencabut renewal lain yang masih sah.
- Refund sebagian disimpan sebagai kebutuhan review terpisah dari status subscription. Hak yang sudah diberikan dipertahankan; invoice yang sudah refunded sebelum aktivasi pertama tidak diberi grant. Review tidak menghalangi konfirmasi cancellation. Tidak ada pemotongan proporsional otomatis atau tool agent untuk memberi/mencabut grant.
- Observasi refund monoton: stale paid, duplicate event dan concurrent reconciliation tidak mengembalikan grant yang dicabut. Refund dan pencabutan berada dalam satu transaksi dengan account lock/lease fencing yang sudah ada.
- Task yang sudah diterima memakai snapshot dan budget asal. Eksekusi Jadwal berikutnya memeriksa allowance saat admission; kuota habis menjadi `blocked_budget` dengan alasan dan tanpa Task/job parsial. Jadwal tetap tersimpan dan dapat dijeda.
- UI membedakan paket efektif dari status subscription, akhir akses berbayar dari reset Free, serta charge/reservasi dan refund uang. Stop, approval, hasil/download, memory, pause Jadwal tetap tersedia ketika saldo nol. Kelanjutan komputasi tetap dibatasi budget pekerjaan.
- Pembaruan metode pembayaran mengambil signed URL provider tepat saat diminta, setelah ownership/mode/store/variant/subscription diperiksa. Host HTTPS Lemon Squeezy wajib; URL bertanda tangan tidak disimpan dalam audit/history. History dan cancellation tetap tersedia ketika checkout dimatikan.

## Bukti verifikasi

| Pemeriksaan | Hasil | Bukti |
| --- | --- | --- |
| Lifecycle NG-022 pada database disposable | 49 kontrak lulus; resource sintetis dibersihkan | [Kontrak lifecycle](evidence/billing-22/lifecycle-contracts.json) |
| Regresi NG-021 | 69 kontrak lulus | [Kontrak billing](evidence/billing-22/billing-regression.json) |
| Kuota/usage/Task/scheduler | 46/48/55/82 kontrak lulus | [Ringkasan checks](evidence/billing-22/checks.json) |
| Static, type, format, build | `make check` dan `make build` lulus | [Ringkasan checks](evidence/billing-22/checks.json) |
| Lemon Squeezy API test nyata | URL pembaruan pembayaran tervalidasi; tidak disimpan | [Provider readback](evidence/billing-22/provider-readback.json) |
| Refund sandbox nyata | Invoice dummy NG-021 direfund penuh; chat/compute Free; replay tetap satu grant historis | [Refund sandbox](evidence/billing-22/sandbox-refund.json) |
| Browser desktop/mobile | Free nyata; Plus/past_due/refund/stale memakai respons UI sintetis; tidak ada overflow pada 1440/390/320px | [Browser readback](evidence/billing-22/browser-readback.json) |

Kontrak mencakup batas expiry tepat sebelum/saat paid-through, renewal recovery, receipt immutable, rollback refund saat crash, refund sebelum initial activation, refund historis dengan renewal lain, approval/stop/pause/download/memory saat nol, partial review plus cancel, ownership URL, serta penolakan host URL asing.

Screenshot: [desktop Free](evidence/billing-22/desktop-free.png), [desktop Plus sintetis](evidence/billing-22/desktop-plus-fixture.png), [mobile gagal bayar sintetis](evidence/billing-22/mobile-past-due-fixture.png), [mobile refund sintetis](evidence/billing-22/mobile-refund-fixture.png), [mobile partial review sintetis](evidence/billing-22/mobile-partial-refund-fixture.png), [mobile stale sintetis](evidence/billing-22/mobile-stale-fixture.png).

## Batas bukti

Tidak memakai kartu atau uang nyata. Refund provider nyata dijalankan hanya pada akun `billing-sandbox-probe` dan invoice test NG-021; signed URL dan PII tidak dicatat dalam artefak. Renewal 30 hari, expiry, partial refund dan crash dibuktikan dengan respons provider terkontrol pada PostgreSQL, bukan menunggu satu periode provider. Tampilan lifecycle selain Free memakai fixture browser yang tidak memutasi backend/provider. Refund nyata dibuktikan melalui API/reconciliation; tidak mengklaim webhook refund provider nyata sudah diterima. Worker tetap merekonsiliasi subscription yang telah berakhir agar refund terlambat dapat ditemukan.

Review refund sebagian mempertahankan hak yang sudah diterbitkan dan memerlukan tindak lanjut operasional; kebijakan pembagian allowance proporsional belum ditawarkan. Kode produk ini tidak mengirim refund uang secara otomatis. Tidak mengklaim penerimaan live production atau benchmark populasi NG-041. NG-023 tetap menjadi pekerjaan berikutnya.
