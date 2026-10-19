# NG-036 · Browser VNC live desktop dan takeover

Sumber: [Notion](https://app.notion.com/p/3fdabdd618738198b295ca667c34f1b1) · Readback: 2026-10-18T17:59:18.252Z

| Property | Value |
| --- | --- |
| Ticket | 36 |
| Urutan | 11 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P0 |
| Area | Agent |
| Depends on | [NG-035 · Eksekusi kode dalam sandbox](35-eksekusi-kode-dalam-sandbox.md) |

<!-- notion-content:start -->
Tujuan: Browser VNC live desktop dan takeover dengan workspace browser pribadi serta login yang dapat digunakan kembali lintas Task.

Lingkup: **Aktif V1**. Identitas NG-036; Urutan delivery 11.

## Keputusan scope yang disepakati

Disetujui pengguna pada **2026-10-19**: satu profil/workspace browser pribadi per account; banyak Task memakai workspace tersebut secara bergantian. Workspace dan profil hidup lintas Task, sedangkan sesi eksekusi terikat Task, budget dan batas waktu. Implementasi dan penerimaan development tercatat pada laporan NG-036; batas bukti dibedakan dari target V1 keseluruhan.

Pengguna login melalui takeover. Task berikutnya memakai profil yang sama dan memeriksa apakah autentikasi masih berlaku; situs tetap dapat meminta login ulang atau 2FA. Login tersimpan tidak memberi izin aksi global atau memperluas instruksi Task.

Komputasi dihentikan ketika Task selesai/tidak digunakan; profil dipertahankan. File hasil disimpan melalui File/Result. Umur komputasi aktif dan retensi profil adalah policy terpisah; habisnya waktu Task tidak otomatis menghapus login.

## Acceptance criteria

- [x] Pengguna melihat dan mengendalikan browser/desktop yang sama dengan agent melalui panel VNC dalam aplikasi; chat tetap dapat digunakan dan panel nyaman pada desktop/mobile.
- [x] Backend mengatur control state agent/handoff/human/resuming dengan lease/version; takeover mencabut hak agent mengirim aksi, termasuk hasil model yang selesai setelah lease berubah.
- [x] Aksi in-flight selesai/direkonsiliasi sebelum input manusia aktif; saat dikembalikan, input manusia dicabut dan agent membaca keadaan terbaru. Perubahan halaman tidak diam-diam mengganti tujuan atau izin Task.
- [x] Uji dua tab, dua owner, viewer expiry/revoke, disconnect/reconnect, stale commands, unknown external effect; tombol viewOnly bukan otorisasi backend. Putusnya viewer saat kendali manusia tidak otomatis mengaktifkan agent.
- [x] Login melalui takeover pada Task A tetap dapat dipakai pada Task B setelah browser ditutup dengan benar dan komputasi dihentikan/dinyalakan kembali. Uji jalur archive/restore bila dipakai. Catat situs, environment, expected/actual dan bukti tanpa secret; marker profil sintetis NG-031 tidak menggantikan uji login nyata.
- [x] Login kedaluwarsa atau 2FA mengarah ke bantuan manusia tanpa loop login otomatis. Input privat menghentikan observasi model/rekaman; password tidak diminta melalui chat atau disimpan sebagai memory. Cookie/data autentikasi tidak diekspor ke prompt, log, File/Result atau runtime Python offline.
- [x] Satu Task atau pengendali manusia memegang workspace pada satu waktu; Task browser lain mengantre. Outcome eksekusi yang belum pasti memblokir pemakaian berikutnya sampai rekonsiliasi; worker/channel lama tidak dapat mengubah workspace milik execution berikutnya.
- [x] Tutup panel hanya menutup viewer; Hentikan Task mencabut kendali dan menghentikan eksekusi tanpa menghapus profil. Reset browser dan hapus login tersimpan memerlukan konfirmasi, mencabut seluruh akses aktif dan mengonfirmasi penghapusan profil tanpa menghapus File/Result.
- [x] Cleanup mengonfirmasi penghentian komputasi, mencabut viewer/lease, membersihkan proses serta berkas sementara Task, mempertahankan profil dan menyimpan hasil. Uji crash/restart dan isolasi dua account; RAM/proses atau login situs yang kedaluwarsa tidak dijanjikan tetap hidup.
- [x] Approval sebelum aksi eksternal terikat target/isi/revision; target diperiksa lagi sebelum dispatch. Login dan takeover bukan approval aksi. Efek eksternal dengan acknowledgement hilang diperiksa sebelum retry; review hasil akhir tetap terpisah.
- [x] Hard budget per Task/resource/account, batas langkah/waktu, idle stop, concurrency serta cost telemetry aktif sejak capability pertama. Storage profil yang dipertahankan tetap dicatat dan dibatasi; TTL komputasi dibedakan dari policy retensi profil.

## Urutan implementasi

1. Task browser memakai interface komputer milik aplikasi dengan Daytona sebagai adapter pertama; workspace/profile owner-scoped, antrean eksklusif, observasi/aksi bounded serta File/Result dan cleanup.
2. Panel komputer desktop/mobile, live viewer, takeover/login privat, handoff, observasi baru saat resume dan reconnect.
3. Approval aksi eksternal, rekonsiliasi outcome, fault/owner/concurrency checks dan walkthrough login lintas Task. Batas resource/biaya dan ownership berlaku sejak langkah pertama.

## Policy implementasi pertama

Daytona workspace pribadi dengan disk profil yang sama, auto archive nonaktif. Task maksimal 20 menit/24 langkah, idle stop 2 menit, margin cleanup 180 detik, retensi profil maksimal 7 hari. Ambang profil 1 GiB dan direktori download 25 MiB dipantau setiap 5 detik; disk provider dibatasi 8 GiB. Collector maksimal 10 MiB/file dan 25 MiB total; proxy public-only membatasi transfer 200 MiB/sesi. Satu compute/account, dua global, 20 profil, tiga sesi/Task. Cap uang berbagi dengan Python: default akun 1.000.000/global 5.000.000 microUSD per bucket UTC asal.

Snapshot compute 166.464 microUSD/jam dan disk 864 microUSD/jam. Sesi default mereservasi 208.964 microUSD termasuk 145.152 microUSD storage tujuh hari. Setiap use mencadangkan seluruh retention window secara konservatif; telemetry adalah estimasi, bukan invoice. Python offline tidak memperoleh profil login atau jaringan baru.

## Spesifikasi dan bukti

[02 · UX & User Flow](../../product/02-user-flow.md) · [REA-6 · Browser & Computer](../../research/muse-ai-v1/evidence/computer.md)

## Dependencies

[NG-035 · Eksekusi kode dalam sandbox](35-eksekusi-kode-dalam-sandbox.md)

## Bukti penerimaan

Diterima development pada **2026-10-19** WITA. Laporan repo `docs/engineering/computer-36-acceptance.md`; readback, screenshots dan 47 kontrak pada `docs/engineering/evidence/computer-36/`. SDK 0.225.0/provider v0.225.1, target eu, snapshot daytona-medium 2vCPU/4GiB/8GiB.

Task A a1625183-d8a0-401f-8ea9-6d220b8d1d99 login melalui VNC privat; Task B 650e0d5f-cd11-4682-a65a-6fa3e66808db membuka Secure Area tanpa login ulang setelah provider stop/start. Situs demo [https://the-internet.herokuapp.com/login](https://the-internet.herokuapp.com/login) memakai akun demo publik; evidence tidak memuat credential akun pribadi atau cookie/token. Review hasil A tidak menjalankan browser lagi. Task db6a4a24-4b19-451e-bfe3-c4c1565974e7 menjalankan satu klik Logout sesudah approval dan mengonfirmasi halaman login.

Task a8c6bd35-a16a-4c58-a46d-73340dc7cc85 memakai limit probe 120 detik. Worker mendapat SIGKILL pada 17:47:31 UTC; deadline 17:48:46, provider STOPPED teramati 17:49:29 sebelum worker kembali. Recovery menutup sesi tanpa replay. Reset dikonfirmasi melalui Settings; provider mengonfirmasi nol resource NG-036. Tiga hasil tetap siap, hash dan unduhan UI cocok sesudah profil dihapus.

Kontrak terkontrol menguji owner/two-tab/fencing/expiry/RFB enforcement, late model, queue, shared admission dengan Python, unknown outcome tanpa replay, stale target, private input, cleanup failure, retention dan interupsi candidate. Regresi sandbox 45/Task 55/File 47/quota 46 serta check/build lulus. Empat Task nyata mencatat 14 model calls, 31.758 token confirmed, lima sesi dan estimasi resource/storage USD 0,760149; bukan invoice.

Mobile adalah emulasi 390x844; desktop 1280x900. Archive tidak dipakai. Situs 2FA khusus, semua situs lain, production, penetration test dan invoice tidak diklaim. Jalur login/expired meminta takeover; tidak ada auto-login atau ekspor cookie. Hard caps/cost telemetry berlaku sejak capability pertama; paket komersial tetap NG-040/NG-041.
<!-- notion-content:end -->
