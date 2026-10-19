# Penerimaan Goals NG-038

Environment: development localhost, 19 Oktober 2026. Python 3.13.12, FastAPI 0.143.1, psycopg 3.3.6, LangChain 1.4.6, LangGraph 1.2.15 dan Pydantic 2.14.1; model aplikasi `gpt-6-luna`, OpenAI Responses. Migration incremental `0009_personal_goals` diterapkan tanpa reset. [Environment lengkap](evidence/goals-38/environment.json). Kontrak aktual: [goals-runtime.md](goals-runtime.md).

## Cakupan penerimaan

| Acceptance criterion NG-038 | Bukti |
| --- | --- |
| Kriteria keberhasilan, revisi, active/paused/completed/archived, next action, hubungan Task/Jadwal opsional | Form/preview/detail, keputusan lifecycle nyata, snapshot Task, riwayat target, reload serta kontrak API/domain. |
| Goal tidak otomatis memberi izin eksekusi atau membuat Jadwal | Setelah Goal disimpan tidak ada Task/Jadwal. Task dibuat melalui form tersendiri. Chat hanya menyiapkan preview perubahan dan tidak menambah Task. Jadwal juga melalui preview/konfirmasi tersendiri. |
| Kegagalan Task, perubahan target dan pause mempunyai dampak eksplisit; P17/P09 | Inspector menjalankan dua Task satu Goal dengan satu kegagalan provider terkontrol; target lama tidak diterapkan ke Goal baru. Owner asing, pause, retry, due races, budget dan stale decision ditolak. Trial worker nyata melewati Jadwal saat Goal dijeda. |

## Walkthrough dengan model nyata

Fixture sintetis **Portofolio NG-038** dibuat melalui menu Tujuan. Target, dua kriteria, horizon, next action dan batas kerja 360.000 unit ditinjau sebelum disimpan. Goal menjadi active dengan nol pekerjaan terkait. Form Task kemudian dipakai untuk meminta CV fiktif Raka, memilih Goal target v1 dan menjalankan pekerjaan terpisah. Task `551d7476-939c-42cc-a09b-948e1f232472` selesai dan tersimpan, memakai 634 unit model terkonfirmasi.

Form bukti menautkan Task berhasil tersebut ke kriteria pertama. Setelah review exact, detail menampilkan **1 dari 2 kriteria terpenuhi**, sumber/revisi dan hasil yang dapat dibuka. Goal tetap active dan tombol selesai belum tersedia. [Screenshot kemajuan](evidence/goals-38/desktop-progress.png).

Pesan chat meminta perubahan next action saja. Pada percobaan awal, model mengirim nomor pada nama Goal sebagai UUID dan turn berhenti. Reproduksi di seam tool ditambahkan sebelum perbaikan; tool sekarang mengembalikan feedback yang dapat dikoreksi. Retry dengan model nyata membaca ID exact dan menyiapkan proposal update. Approval melalui kartu chat mengubah next action, mempertahankan target v1 dan bukti pertama, serta tidak membuat Task/Jadwal tambahan. Kesalahan dan retry termasuk dalam usage run; tidak menyatakan percobaan awal berhasil.

Jadwal sekali **Catatan portofolio NG-038** dibuat melalui form dengan Goal target v1, pukul 14.22 WITA, cap 30.000 unit, runtime teks. Setelah preview diaktifkan, Goal dijeda melalui proposal/keputusan. UI Jadwal menyatakan eksekusi ditahan oleh Goal. Halaman aplikasi kemudian ditutup dengan membuka tab kosong. Pada waktu due, worker mencatat occurrence `020fdfe8-215f-5eea-9b2a-e1b5e95e8bea` sebagai skipped, dengan alasan Goal dijeda dan tanpa Task.

Sesudah halaman dibuka kembali, Goal dilanjutkan. Slot sekali yang terlewat tidak berjalan diam-diam. Pengguna memilih **Jalankan sekarang**, meninjau preview dan mengonfirmasi, lalu menutup halaman aplikasi kembali. Occurrence manual `ff852166-e079-5b47-91fe-9a65b398f388` membuat satu Task `1eaf9c50-7cdf-4e6b-8f4d-f372483a890c`; Task tersebut selesai dengan 1.598 unit terkonfirmasi. Dua Task tetap memakai target v1; total Goal 2.232 unit, reservasi aktif nol.

Kriteria kedua diuji dengan **laporan pengguna sintetis**, diberi label laporan pengguna dan catatan fixture yang jelas. Setelah kedua penilaian ditinjau, tombol selesai tersedia; proposal complete dan keputusan mengubah Goal menjadi completed. [Screenshot selesai](evidence/goals-38/desktop-completed.png). Goal kemudian diarsipkan melalui keputusan tersendiri; reload mempertahankan archived, riwayat, kedua sumber dan hasil. Tidak ada future slot tersisa pada Jadwal sekali tersebut.

ID Goal, sumber, revision, history, usage dan occurrence tersedia dalam [readback nyata](evidence/goals-38/live-readback.json). Evidence tidak memuat token browser, login ticket atau provider key.

## Desktop, mobile dan pemulihan

Desktop 1440×900 serta mobile 390×844 dan 320×640 diperiksa. Menu Tujuan/Jadwal, panel detail, tombol lifecycle dan sumber tetap dapat digunakan; pemeriksaan DOM tidak menemukan horizontal overflow pada document maupun section/article. [Mobile 390](evidence/goals-38/mobile-paused-390.png), [mobile 320](evidence/goals-38/mobile-paused-320.png), [Jadwal ditahan Goal](evidence/goals-38/mobile-schedule-held.png).

Saat API development sempat tidak tersedia selama iterasi, panel mempertahankan data terakhir dengan pesan error/Coba lagi. Sesudah API kembali ready, polling pulih dan keputusan proposal yang belum diterapkan dapat diselesaikan. Receipt, expected revision dan server readback menjaga agar retry tidak membuat perubahan ganda. Ini observasi pemulihan development, bukan uji outage production.

## Pemeriksaan kontrak dan regresi

`make goal-inspect` lulus **74 skenario** dalam PostgreSQL/checkpoints disposable. [Hasil lengkap](evidence/goals-38/contracts.json) mencakup ownership, extra owner input, proposal/decision idempotency, concurrent decisions, stale/expired approval, target vs control revision, source hash/revision berubah, Result dihapus, Result-only source lineage, failed Task, old target retry, parent budget races, Result update yang mewarisi parent, queue failure rollback, scheduler pause/edit/resume/downtime, HTTP auth serta pemulihan kesalahan ID tool chat.

Urutan bukti memakai revision keputusan, diuji dengan timestamp transaksi yang sengaja dibalik. Edit next action mempertahankan progress; perubahan target mengosongkan penilaian current sambil mempertahankan riwayat. Result update tanpa GoalRef tidak dapat melewati parent cap atau mengganti target lama diam-diam.

Regresi lulus: Task 55, scheduler 82, file 47 dan quota 46 skenario. Fixture compatibility scheduler diperbarui agar payload pra-upgrade tidak mengandung field Goal yang dahulu belum ada. `make check` mencakup Biome, TypeScript, Ruff lint/format dan mypy; `make build` menghasilkan build produksi. Warning bundler dependency yang sudah ada tetap nonfatal. `git diff --check` serta `make docs-check` digunakan pada hasil akhir dan mirror Notion.

## Batas bukti

Ini penerimaan development. Perubahan target, failure/races/owner asing, parent-cap exhaustion dan sumber Result/file hilang memakai inspector terkontrol, bukan seluruhnya walkthrough provider nyata. Trial Jadwal nyata memakai runtime teks; tidak mengklaim seluruh variasi browser/Python terjadwal diuji ulang. Mobile memakai viewport browser, bukan perangkat fisik.

Penilaian semantik merupakan keputusan yang ditinjau pengguna. Status Task succeeded sendiri tidak membuktikan semua kriteria terpenuhi. Laporan pengguna tidak menjadi verifikasi independen. Penyimpanan Goal tidak mengaktifkan perencanaan/eksekusi otonom atau delivery proaktif; NG-019/020 mengikuti kemudian. Tidak mencakup benchmark kualitas populasi besar, invoice, SKU komersial atau deployment production.
