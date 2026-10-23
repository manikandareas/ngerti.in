# Izin komputer berdasarkan dampak aksi — 23 Oktober 2026

Kebijakan lama menahan semua click/type/key/SELECT dan navigasi ke URL yang tidak tertulis persis pada pesan awal. Itu menjelaskan approval berulang pada pekerjaan membaca situs. Reproduksi di database disposable gagal pada assertion `public_navigation_without_exact_url_grant` sebelum perbaikan.

Kebijakan baru memakai `computer/permissions.py` di batas dispatch backend, berlaku untuk engine Jev maupun screenshot. Planner chat, kedua actor browser, dan penjelasan UI mengikuti aturan yang sama. Tidak ada pilihan yang membebaskan semua aksi dari approval.

| Aksi | Perlakuan |
| --- | --- |
| Membuka URL HTTPS publik biasa, mengikuti tautan biasa | Otomatis dalam tujuan Task |
| Membaca, scroll, wait, tab, disclosure, pagination yang dikenali | Otomatis |
| Mengetik kueri, memilih filter, mengirim form pencarian yang dikenali | Otomatis |
| Mengirim email/pesan, publikasi, edit data, pembelian, perubahan akun/keamanan | Approval untuk aksi dan isi persisnya |
| Password, OTP, token, pembayaran privat, upload/iframe yang tidak dapat diperiksa | Takeover privat |
| Target yang belum cukup jelas dampaknya | Approval; tidak dianggap aman dari deskripsi actor |

Backend tidak menerima klasifikasi risiko dari model. Adapter mengamati label, role, href, jenis input, serta struktur/action form tanpa mengekspor nilai input. Search box/form harus dikenali dari semantik aktual; textbox bebas atau Enter pada editor tidak otomatis diizinkan. Endpoint aksi seperti logout/delete dan parameter operasi tetap ditahan meskipun URL pernah disebut pengguna. URL bertoken memerlukan takeover. Pembatasan HTTPS publik dan egress tetap berlaku.

Ini klasifikasi konservatif berdasarkan bukti browser, bukan jaminan memahami efek setiap JavaScript situs. Semantik yang kurang jelas tetap memerlukan approval; label pencarian tidak membebaskan tombol Send/Save atau form berisi field pengiriman dari pemeriksaan. Belum ada grant otomatis untuk semua tombol generik atau pengelolaan kredensial oleh model.

`InspectedTarget` membawa fingerprint dan konteks transient ke pemeriksaan izin. DOM guard mencakup semantik target/form dan dicek lagi sebelum input. Jalur screenshot juga membandingkan fingerprint tepat sebelum input di dalam actuator lock. Perubahan target ditolak sebagai stale sebelum input, bukan diulang sebagai efek yang belum pasti. Lease, deadline, ownership, receipt, dan kontrol takeover tetap diperiksa. Aktivasi canonical tab memakai `Page.bringToFront` di dalam barrier agar keyboard kembali menuju browser setelah takeover.

Snapshot sesi baru menyimpan `permissions=routine-auto-sensitive-approval-v1`. Snapshot lama tidak dapat memakai `allowed_urls` untuk melewati pemeriksaan dampak. Proposal lama yang sudah menunggu pengguna tetap melalui alur keputusan/resume biasa. Kode actuator dan metadata diunggah saat workspace dimulai; tidak memerlukan rebuild template, migrasi baru, atau key tambahan.

## Validasi

- `make computer-permissions-inspect`: 34 pemeriksaan lulus pada PostgreSQL/MinIO disposable. Mencakup navigasi tanpa exact-URL grant, tautan dan pencarian otomatis, pengiriman ditahan hingga approval, kredensial menuju takeover, unknown target, dan perubahan fingerprint sebelum input.
- `make computer-inspect`: 51 skenario lulus; `make browser-runtime-inspect`: 14; `make task-inspect`: 56. Ownership, takeover, stale approval, idempotensi, dan continuation tetap melewati kontrak yang sudah ada.
- `make check` dan `make build` lulus.

Probe `scripts/probe_jev_browser.py --live` memakai E2B dan model nyata dengan HTML fixture yang dikendalikan aplikasi. Dua run terakhir masing-masing lulus 7 pemeriksaan. Tombol Send report hanya menaikkan counter JavaScript lokal, tanpa mengirim email atau request eksternal. Probe memeriksa takeover/fencing, konteks target screenshot, satu approval untuk mutation sintetis, pencarian Jev otomatis, verifier hasil, metering, dan cleanup. Bukti run terakhir tersimpan di [computer-permissions](evidence/computer-permissions/). Ini smoke fixture, belum benchmark semua situs; actor yang memilih target ambigu tetap dapat menghasilkan approval.

Worker adalah proses Python tanpa autoreload. Proses development telah dimulai ulang setelah pemeriksaan bahwa tidak ada Task atau chat aktif; worker baru memuat kebijakan ini. Readiness API dan halaman web development sama-sama mengembalikan HTTP 200. Deployment produksi belum dijalankan sebagai bagian dari perubahan lokal ini.
