# NG-036 · Browser pribadi, VNC dan takeover

Diterima **19 Oktober 2026 WITA** pada development lokal macOS: API/worker host, PostgreSQL/LangGraph checkpoints, Procrastinate, MinIO, Clerk development, Daytona target `eu`, SDK **0.225.0**, provider **v0.225.1**, snapshot `daytona-medium` (**2 vCPU / 4 GiB RAM / 8 GiB disk**). [Tiket dan scope](../backlog/tasks/36-browser-vnc-live-desktop-dan-takeover.md).

Task browser tersedia melalui pilihan **Gunakan browser pribadi** dan tool chat `start_background_task(use_browser=true)`. Satu workspace/profil per account dipakai lintas Task secara bergantian. Browser dan proxy berhenti setelah pekerjaan; profil disimpan pada disk workspace Daytona yang sama. Auto archive dinonaktifkan; tidak ada ekspor cookie, salinan profil ke object storage, atau pemasangan profil pada sandbox Python offline.

## Hasil penerimaan

| Kebutuhan | Expected → actual dan bukti |
| --- | --- |
| Login nyata lintas Task | Login sendiri pada Task A melalui VNC → Task B membuka `/secure` sesudah provider stop/start dan masih melihat **Secure Area** tanpa login ulang. [Readback](evidence/computer-36/live-readback.json), [hasil Task B](evidence/computer-36/login-reused-hasil.md). |
| Live desktop dan input privat | Desktop 1280×900 dan emulasi mobile 390×844 memakai desktop Chromium 1280×720 yang sama. Selama human control, tidak ada observasi/model/action baru. Mobile mempunyai input privat melalui RFB. [Desktop](evidence/computer-36/desktop-agent.png), [mobile login](evidence/computer-36/mobile-human-login.png). |
| Handoff dan fencing | Backend mencabut execution/control version, menunggu busy action dan channel viewer selesai, lalu memberikan input manusia. Return mencabut viewer lama, mengambil layar baru, mencatat control return dan melanjutkan execution baru. Model yang selesai terlambat tidak dapat bertindak. [47 kontrak](evidence/computer-36/controlled-contracts.json). |
| Gateway dan ownership | Secret grant di-hash, HttpOnly, owner/control-version bound, berlaku sampai lima menit atau deadline Task. Backend memblokir input RFB pada agent control. Dua tab tidak merebut channel aktif; owner asing/stale command/expiry ditolak. Disconnect/reconnect nyata tetap mempertahankan human control. [Kontrak](evidence/computer-36/controlled-contracts.json). |
| Antrean dan outcome ambigu | Task kedua menunggu saat workspace dipakai. Lost acknowledgement dan cleanup failure memblokir pemakaian berikutnya. Pengakuan pemeriksaan manusia mengakhiri Task ambigu tanpa mengulang aksi. [Kontrak](evidence/computer-36/controlled-contracts.json). |
| Approval aksi | Klik/ketik/tombol dan URL yang tidak persis ada pada permintaan asli ditahan sebagai proposal. Logout demo benar-benar menunggu approval, mempunyai satu receipt klik, lalu menghasilkan konfirmasi halaman login. Review hasil Task A terpisah dan tidak menyalakan browser kembali. [Readback](evidence/computer-36/live-readback.json). |
| Pemeriksaan target | Fingerprint mengikat URL, elemen, posisi, focus, scroll/window dan isi form yang relevan; seluruh konteks di-hash di dalam Chromium. Jam desktop tidak memengaruhi fingerprint. Perubahan target membatalkan proposal. Password/file/OTP/card/iframe atau target tak terbaca meminta takeover. [Kontrak](evidence/computer-36/controlled-contracts.json). |
| Worker mati dan deadline | Worker pengujian mendapat SIGKILL pada 17:47:31 UTC. Task probe memakai batas yang diturunkan menjadi 120 detik, deadline 17:48:46 UTC. Provider teramati **STOPPED pada 17:49:29 UTC**, sebelum worker dinyalakan kembali. Sweep setelah restart menutup sesi dan menandai Task berakhir; profil tetap ada. [Observasi provider](evidence/computer-36/provider-deadline.jsonl), [readback](evidence/computer-36/live-readback.json). |
| Reset dan hasil persisten | Dialog konfirmasi reset dipakai pada Settings → penghapusan provider terkonfirmasi, nol resource NG-036 tersisa. Tiga hasil tetap siap dan bytes cocok dengan SHA-256 manifest; unduhan UI Task B cocok byte demi byte setelah reset. [Dialog](evidence/computer-36/reset-confirmation.png), [preview mobile setelah reset](evidence/computer-36/mobile-result-after-reset.png), [readback](evidence/computer-36/live-readback.json). |
| Pemulihan candidate | Interupsi setelah candidate tersimpan tetap memerlukan konfirmasi stop sebelum publikasi. Setelah rekonsiliasi, candidate dipublikasikan tanpa sesi browser baru. Revisi saat sesi browser masih aktif ditolak backend. [Kontrak](evidence/computer-36/controlled-contracts.json). |

## Walkthrough nyata

Situs pengujian adalah [The Internet login demo](https://the-internet.herokuapp.com/login); memakai kredensial demo publik yang tercantum di situs dan terlihat pada screenshot halaman login. Evidence tidak memuat kredensial akun pribadi, cookie, token, profile bytes atau URL provider bertanda tangan.

- Task A `a1625183-d8a0-401f-8ea9-6d220b8d1d99`: buka login, takeover, input manusia pada mobile, kembalikan kendali, simpan ringkasan Secure Area, tinjau dan finalisasi hasil. Awal pengujian menemukan format respons model tidak konsisten; strict structured output diperbaiki lalu Task yang sama dicoba kembali. Dua sesi compute tercatat, tanpa menyembunyikan percobaan awal.
- Task B `650e0d5f-cd11-4682-a65a-6fa3e66808db`: buka `/secure` setelah compute A berhenti. Login masih aktif; hasil tersimpan tanpa login ulang atau logout.
- Task logout `db6a4a24-4b19-451e-bfe3-c4c1565974e7`: URL model sempat memuat karakter tambahan sehingga meminta approval terpisah; model kemudian memakai URL asli yang benar. Permintaan approval diperjelas agar model mengeluarkan proposal aksi. Klik Logout yang disetujui dijalankan satu kali; hasil menyatakan **You logged out of the secure area!**.
- Task deadline `a8c6bd35-a16a-4c58-a46d-73340dc7cc85`: halaman login setelah logout meminta bantuan manusia. Worker dihentikan paksa ketika menunggu, tanpa viewer/heartbeat aktif. Provider berhenti sendiri dan recovery tidak mengirim formulir maupun menerbitkan hasil palsu.

Retensi profil berbeda dari masa hidup compute. Provider idle stop dapat menghentikan compute lebih awal saat menunggu tanpa viewer. Profil tetap tersimpan; sesi yang tidak lagi siap dihentikan/direkonsiliasi sebelum dicoba lagi. Reconnect viewer bukan perpanjangan deadline. App tidak menjanjikan RAM/proses atau validitas login pihak ketiga tetap hidup.

## Policy dan biaya

| Batas awal | Nilai |
| --- | --- |
| Waktu Task / langkah | Maksimal 20 menit / 24 langkah; panggilan model juga tunduk budget token/call Task. Worker menggunakan execution slice terbatas. |
| Idle / cleanup reserve | Idle stop provider 2 menit; reservasi memasukkan margin 180 detik. Supervisor Chromium terpisah berhenti pada deadline meskipun worker mati. |
| Profil | Retensi maksimal 7 hari tidak aktif; 20 profil global. Ukuran profil dipantau setiap 5 detik pada ambang 1 GiB; disk provider mempunyai batas 8 GiB. |
| Unduhan / egress | Collector maksimal 10 MiB/file dan 25 MiB total. Direktori unduhan dipantau setiap 5 detik pada ambang 25 MiB. Proxy membatasi total transfer 200 MiB/sesi, koneksi 25 MiB dan 16 koneksi; hanya tujuan internet publik port 80/443. |
| Concurrency | Satu compute/account, dua global, berbagi admission lock dan cap biaya dengan sandbox Python. Satu Task maksimal tiga sesi. |
| Biaya UTC akun / global | Default 1.000.000 / 5.000.000 micro USD per bucket UTC asal Task. Outcome ambigu mempertahankan reservasi. |
| Rate compute / retained disk | Snapshot 166.464 / 864 micro USD per jam; versi `daytona-linux-2026-10-18`. |

Sesi default mereservasi **208.964 micro USD**, termasuk **145.152 micro USD** untuk seluruh tujuh hari storage. Setiap pemakaian mencadangkan ulang seluruh retention window secara konservatif. Setelah konfirmasi stop, compute diselesaikan dari wall time teramati; cadangan disk tetap dihitung. Ledger ini **estimasi, bukan invoice**. UI panel menampilkan pemakaian/cadangan; paket komersial dan benchmark mengikuti NG-040/NG-041.

Empat Task walkthrough mencatat **14 panggilan model**, **31.758 token confirmed**, lima sesi compute dan estimasi resource/storage agregat **USD 0,760149**. Biaya token model tidak dikonversi menjadi uang tanpa snapshot harga model. Durasi, policy, resource reservations, settlement, action IDs dan hash hasil tersedia pada readback. Profil demo dihapus setelah pemeriksaan akhir; hasilnya dipertahankan.

## Menjalankan dan batas bukti

```sh
make install
make migrate
make check
make build
make computer-inspect
make sandbox-inspect
make task-inspect
make files-inspect
make quota-inspect
make docs-check
```

Migrasi incremental **0005_browser_workspace** sudah diterapkan tanpa reset. Restart worker setelah perubahan Python/config; autoreload API tidak mereload worker. `DAYTONA_API_KEY` diperlukan di backend. `.env.example` memuat batas waktu/retensi/rate storage; cap uang berbagi konfigurasi sandbox. API dan browser harus berada pada konfigurasi same-site yang mendukung cookie viewer; origin WebSocket diperiksa.

`make computer-inspect` lulus **47 skenario** dengan PostgreSQL/checkpoints/MinIO sementara dan remote adapter terkontrol, kemudian membersihkan resource fixture. Regresi sandbox **45**, Task **55**, File **47**, quota **46** tetap lulus. Biome, TypeScript, Ruff, mypy dan build lulus.

Login/stop-start, VNC mobile, reconnect, Logout approval, SIGKILL/idle stop, reset provider dan bytes hasil diuji nyata. Lost acknowledgement, race/ownership dua account, target berubah, viewer expiry, input RFB ilegal, shared admission, cleanup failure, retention dan interupsi candidate memakai adapter/fixture terkontrol. Situs 2FA khusus, seluruh situs lain, archive/restore, production deployment, penetration test, invoice dan outage control plane menyeluruh tidak dicakup walkthrough ini. Archive tidak dipakai. Browser memerlukan koneksi publik; sandbox Python tetap tanpa jaringan dan tidak memperoleh profil login.
