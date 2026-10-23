# Audit interaksi E2B / VNC — thread 82944

Thread: `82944c0e-bfd0-5386-b9c7-b60a6927dfb9`. Task: `3d8f0416-17e6-4929-bcab-d9722dc4659c`. Tujuan: riset tren AI agent menuju 2027. Audit read-only terhadap database, event stream tersimpan, source code, dan API informasi E2B; tidak menjalankan ulang Task atau meresume sandbox. Endpoint UI memberikan HTTP 200, tetapi audit ini tidak memiliki rekaman layar historis. [Bukti terstruktur](evidence/browser-thread-82944/audit.json).

## Kesimpulan

Workflow v2 benar-benar aktif dan memakai Jev. Riset gagal mencapai sumber primer: hanya navigate ke Google dan scroll yang berhasil dieksekusi. Setelah tiga panggilan Jev dan dua kegagalan inspeksi target, admission budget menghentikan eksplorasi. Cabang penanganan langsung menerbitkan cuplikan parsial tanpa sintesis/verifikasi model. E2B berhasil melakukan maintenance; tidak ada bukti outage provider sebagai penyebab utama. VNC sempat memiliki channel aktif dan kemudian ditutup ketika workspace dihentikan. Keadaan provider saat audit: **paused**, bukan deleted.

## Kronologi (23 Oktober 2026, WITA / UTC+8)

| Waktu | Kejadian |
|---|---|
| 15:34:41 | Permintaan riset masuk. |
| 15:34:51 | Task dan sesi E2B pertama dimulai. |
| 15:35:08 | Task `waiting_user / computer_upgrade_required`; runtime tersimpan belum memenuhi capability Jev. Sesi dihentikan. |
| 15:35:16–15:35:55 | Sesi maintenance 38,7 detik. Setelah upgrade, Task diantrekan kembali. |
| 15:35:55 | Attempt kedua dan sesi kerja baru dimulai, dengan deadline 15:55:55. |
| 15:36:09–15:36:11 | Observasi awal selesai. Grant viewer diperkirakan diterbitkan 15:36:11,645 dari expiry minus TTL 300 detik. |
| 15:36:11–15:36:12 | Navigate ke Google memakai 500 karakter awal instruksi sebagai query. |
| 15:36:15–15:36:17 | Jev memilih scroll; scroll selesai. |
| 15:36:19 | Evidence pertama disimpan dari Google. Inspeksi target berikutnya gagal. |
| 15:36:22 | Evidence kedua dari URL Google yang sama disimpan; inspeksi target berikutnya kembali gagal. |
| 15:36:25 | Panggilan keputusan berikutnya tertahan budget; kandidat partial dibuat. |
| 15:36:29 | Sesi dihentikan, hasil `hasil.md` dipublikasikan; Task `failed / computer_partial`. |

Total sekitar 98 detik sejak Task dibuat. Tiga sesi mencakup startup awal, maintenance, dan kerja setelah upgrade; bukan tiga sesi riset penuh.

## Temuan prioritas

### P1 — Finish reserve memotong eksplorasi, tetapi cabang error melewati finalisasi

Tiga panggilan Jev dikonfirmasi: 4.308 + 5.670 + 7.173 = **17.151 unit**. Cap 60.000; sisa aktual 42.849. Finish reserve terakhir **28.150**, sehingga ceiling panggilan eksplorasi berikutnya hanya boleh maksimal **14.699**. Ceiling sebelumnya berturut-turut 17.214, 20.771, 24.720. Ceiling tepat panggilan yang ditolak tidak disimpan, sehingga tidak boleh direkonstruksi sebagai angka pasti.

`tasks/budget.py:reserve_call` memeriksa charged usage + requested ceiling + reserve. `supervisor.py:draft` menangkap BudgetExhausted dan memanggil `finalize(reason=...)`. `finalize` langsung menetapkan partial bila reason terisi, sehingga blok synthesize/verify dilewati. Ledger membuktikan **nol browser_synthesis dan nol browser_verifier**. Ini bukan verifier menolak laporan; verifier tidak pernah dipanggil. Batas langkah (24), batas model call (24), dan deadline sesi belum tercapai.

Prioritas perbaikan: pisahkan alasan berhenti eksplorasi dari keputusan apakah finalisasi masih dapat dicoba; gunakan cadangan finalisasi sesuai tujuannya. Kurangi konteks keputusan yang berulang secara terukur, bukan menghilangkan ceiling keselamatan atau sekadar membesarkan cap.

### P1 — Hasil pencarian diterima sebagai evidence sumber

Kedua evidence ber-URL Google search yang sama, panjang 2.013 dan 2.587 karakter, posisi scroll sama (y=360). Teks pertama menjadi bagian teks kedua dengan tambahan kartu sumber; similarity sekitar 87,5%. Isinya berupa rangkuman Google dan kartu hasil pencarian, bukan bukti kunjungan ke IBM/PwC/Gartner. Dugaan bahwa sebagian adalah AI Overview kuat dari bentuk teks, tetapi tidak dikonfirmasi rekaman layar.

`jev.py` meminta model mengabaikan search results, tetapi `supervisor.py` menyimpan langsung bila `decision.relevant` benar. `evidence.save` hanya memeriksa URL HTTPS, teks, dan checksum; tidak membedakan search discovery dari sumber yang dibuka. Perubahan teks pada URL sama menambah evidence_count. **Dua evidence tidak berarti dua sumber independen.**

Prioritas: beri tipe discovery/source, hitung cakupan berdasarkan sumber yang benar-benar dibuka, dan gabungkan revisi bacaan halaman yang sama. Ringkasan mesin pencari tidak boleh menaikkan cakupan artikel primer.

### P1 — Target stale berulang; detail aksi hilang dari audit

Dua baris inspeksi `observe` berstatus unknown pada 15:36:19–21 dan 15:36:22–23. Runtime state menyimpan `Target berubah; pilih ulang.` Tidak ada click/type mutation dispatched, proposal approval, atau unknown effect pada workspace. Ini konsisten dengan StaleTarget pada inspeksi sebelum dispatch; bukan bukti efek eksternal ambigu.

`steps.execute` membuat baris inspeksi tanpa action sebelum `runtime.target`; jika pemeriksaan gagal, tujuan aksi tidak tersimpan. Karena itu target/URL yang hendak dipilih Jev tidak bisa dipastikan dari data ini. `snapshot.js:75` memasukkan body.innerText hingga 60.000 karakter ke fingerprint dokumen. Perubahan kartu/rangkuman Google yang tidak terkait target bisa membatalkan seluruh fingerprint. Ini kandidat penyebab kuat, bukan diagnosis mismatch spesifik yang telah dibuktikan: telemetry tidak menyimpan alasan mismatch rinci.

Prioritas: simpan proposal sebelum inspeksi beserta alasan stale terstruktur; bedakan navigasi rutin dan validasi exact mutation. Jangan melemahkan validasi recipient/payload/account demi menghindari stale.

### P2 — Query pencarian adalah instruksi laporan, bukan query riset

Bootstrap mengirim 500 karakter instruksi, termasuk format bahasa, sitasi, risiko, dan ringkasan eksekutif, ke Google. Akhir query terpotong pada kata `or`. Itu perilaku source code deterministik, bukan pilihan strategi Jev. Query semacam ini dapat mendorong respons rangkuman panjang dan memperbesar konteks keputusan.

Prioritas: buat query ringkas berdasarkan subtopik dan tipe sumber; pisahkan instruksi penulisan dari input pencarian.

### P2 — Status observability membingungkan

Task final `failed/computer_partial`, tetapi execution kedua `succeeded` karena jalur publikasi memang berhasil. Runtime phase tetap `synthesize` walaupun sintesis model dilewati. Unknown observation tidak berarti unknown mutation. Ketiga istilah ini perlu dipisahkan dalam trace/UX agar diagnosis tidak salah.

## E2B, VNC, permission

- Capability setelah upgrade: Python 3.12.12, browser-harness 0.1.13, Chrome 149, dom=true. Metadata provider dibaca tanpa resume dan mengonfirmasi paused.
- Hanya satu viewer grant yang relevan dengan waktu Task, epoch 32. Grant berakhir 15:41:11,645; `channel_deadline` terakhir 15:36:40,342 berarti channel diperbarui sekitar 15:36:25,342 karena lease channel 15 detik. Ini bukti channel berjalan, bukan bukti kualitas frame yang pengguna lihat.
- Grant kini closed=true/connected=false. Workspace berhenti pada 15:36:29 dengan epoch naik menjadi 33. Penutupan sesuai jalur finalize → stop_task → revoke viewer. Tidak ada bukti token lima menit expired atau kegagalan reconnect sebagai pemicu Task berhenti. Waktu/close-code WebSocket historis tidak tersedia untuk membuktikan detail transport.
- Tidak tercatat human takeover, approval mutation, atau penolakan pengguna dalam Task ini. Navigate dan scroll mendapat keputusan auto. Pause awal adalah maintenance-required, bukan approval transaksi situs.
- Ketiga sesi sudah stopped; workspace tidak mempunyai active_task_id dan unknown_effect=false. Estimasi compute tersimpan total 4.090 microusd (~USD 0,00409), bukan invoice terkonfirmasi dan tidak termasuk biaya model.

## Batas audit dan tindak lanjut

Tidak ada log lokal terkait ID ini yang ditemukan di berkas `.dev/*.log`/`.jsonl` yang diperiksa. Event DB, cost ledger dan receipt menjadi bukti historis utama. Tidak ada raw response pilihan target Jev, mismatch reason terperinci, atau screenshot/video historis. Tidak dilakukan replay ke situs hidup, perubahan source runtime, retry Task, atau pembukaan sesi E2B baru.

Prioritas perbaikan: (1) alur finish reserve/finalisasi, (2) discovery vs source dan query, (3) stale diagnostics/target stability, (4) status terminal dan penjelasan VNC berhenti. Kasus nyata ini menunjukkan bahwa fixture tiga sumber yang sebelumnya lulus belum mewakili halaman Google dinamis dan instruksi riset panjang; skenario ini perlu menjadi regression corpus sebelum memperluas rollout.
