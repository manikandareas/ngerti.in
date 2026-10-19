# Penerimaan kandidat proaktif NG-019

Tanggal: 19 Oktober 2026. Scope: [NG-019](../backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md). Kontrak dan konfigurasi: [proactivity-runtime.md](proactivity-runtime.md).

## Bukti per kriteria

| Kriteria | Bukti |
| --- | --- |
| Kandidat berasal dari memory/Goal/Task-result, dengan expiry, relevance dan thread | Inspector PostgreSQL memeriksa canonical source/hash/revision, owner, routing, expiry, Task result mutation, Goal pause/change dan memory revocation. Model nyata menghasilkan usulan dengan exact refs; Jev menilai per dimensi. |
| Tidak bergantung pada domain belajar; no-op sah | Domain mandiri `proactivity/`; empty evidence, generasi kosong, kandidat kurang baru, tidak grounded, ambigu atau tanpa route menghasilkan no-op tanpa delivery. Tidak ada Practice/streak/pengayaan. |
| Evaluasi/reranking dibatasi biaya; sumber eksternal adalah data; kandidat basi dibuang | Satu reservation per stage, race budget lintas akun, budget melewati UTC midnight, unknown outcomes, source change saat inference, canonical readback dan lease recovery diperiksa. Model tidak mempunyai command/grant tools. |

## Kontrak backend dan regresi

`make proactive-inspect`: **68 kontrak lulus**, memakai database disposable yang dihapus setelah pemeriksaan. Bukti: [contracts.json](evidence/proactivity-19/contracts.json).

Cakupan utama meliputi: opt-in pratinjau; request/receipt idempotent; foreign owner/thread ditolak; lima worker hanya melakukan satu generasi dan satu judgment; satu candidate eligible; referensi/expiry; raw questions/answers; distinct failed/no-op; invalid provider scores; no inference untuk empty evidence; unknown charge tidak dianggap gratis; reservation stage tidak berulang; crash/lease recovery; Goal pause dan forget saat provider berjalan; purge unselected drafts; forgotten turn tidak terambil kembali; source mutation tanpa event tertangkap readback; secret gate; horizon/timezone; hidden diagnostics; client owner override; Task/result evidence; metadata budget tidak menjadi uang; UTC/global budget races; re-enable setelah revocation dan retry nonaktif yang idempotent.

Regresi terkait: Memory **62**, Goals **74**, Task **55**, Files **47** kontrak lulus. `make check` dan `make build` lulus; browser walkthrough dinilai terpisah dari static/build checks.

## Provider dan worker nyata

[live.json](evidence/proactivity-19/live.json) memakai fixture sintetis berbahasa Indonesia/English di PostgreSQL disposable. Default generasi `gpt-6-luna`; judgment `jev-1.13.0`. Job benar-benar dikonsumsi proses worker Procrastinate terpisah tanpa halaman browser. Kedua stage menghasilkan usage terkonfirmasi. Bukti menyimpan hasil model dan keputusan, bukan credential.

Skenario release notes menghasilkan kandidat layak untuk menawarkan draft bagian CSV export. Skenario anggaran dapat menghasilkan no-op karena confidence timing atau grounding belum cukup, meskipun relevansi tinggi. Gerbang minimum tidak diturunkan untuk memaksa contoh lolos. Ini bukti integrasi dan contoh kualitas terbatas, bukan benchmark akurasi populasi atau jaminan semua usulan berguna akan dipilih.

Uji awal menemukan format ID evidence ambigu dan metadata `budget_cap` yang sempat disalahartikan sebagai rupiah. Implementasi akhir meminta exact evidence keys, mengeluarkan anggaran komputasi dari konteks, menyediakan state terstruktur dan batas kemampuan, serta mempertahankan Jev sebagai penilai terpisah. Peningkatan model generasi dari percobaan `gpt-5-mini` menjadi `gpt-6-luna` mengurangi overclaim pada fixture; klaim yang tetap ambigu ditolak.

## Walkthrough browser

Panel internal dibuka melalui sesi Clerk nyata pada `/dev/system`. Pemeriksaan mencakup state awal nonaktif, kesiapan provider, status dan alasan evaluasi, rincian evidence/Jev, error API yang tetap dapat dicoba ulang, serta layout desktop dan 320px. Fixture browser menggunakan Goal/thread baru khusus acceptance; tidak membawa memory dari thread lain. Evaluasi pratinjau akun dikembalikan nonaktif sesudah walkthrough, dan Goal acceptance diarsipkan.

Screenshot dan readback sintetis disimpan dalam direktori [evidence/proactivity-19](evidence/proactivity-19/). Readback provider menggunakan database disposable; screenshot UI memakai fixture khusus pada database development dan tidak menjadi bukti delivery otomatis.

## Batas penerimaan

NG-020 belum diimplementasikan oleh pekerjaan ini: tidak ada pengiriman pesan proaktif otomatis, daily message cap, quiet hours/mute/snooze atau preferensi intensitas end-user. NG-019 menerima bagian candidate/no-op/expiry/evaluation budget dari P21/P22 dan pemisahan data dari kewenangan pada P27; bukan seluruh skenario delivery P21.

Retrieval bounded dapat melewatkan evidence yang lebih lama. Secret gate best effort; judgment model tetap dapat salah. Expiry dan pemeriksaan canonical mencegah konteks yang diketahui stale digunakan kembali, bukan membuktikan kebenaran independen setiap laporan pengguna. Kalibrasi threshold dan evaluasi kualitas yang lebih luas diperlukan sebelum delivery otomatis NG-020 diterima.
