# Kandidat proaktif NG-019

NG-019 membentuk dan memilih kesempatan membantu berdasarkan evidence. LLM menghasilkan usulan, Jev menilai makna, dan code memeriksa legalitas serta memilih paling banyak satu kandidat per evaluasi. Evaluasi ini tidak mengirim pesan, membuat Task/Jadwal, mengubah Goal/Soul atau memberi grant. Delivery mengikuti [NG-020](../backlog/tasks/20-delivery-proaktif-per-thread-dan-batas-global.md).

Kontrak produk: [NG-019](../backlog/tasks/19-kandidat-proaktif-dinamis-dan-reranking.md), [Perilaku Agent](../product/03-agent.md), [acceptance](proactivity-19-acceptance.md). Implementasi berada di `apps/backend/src/ngertiin/proactivity/`; migration incremental `0010_proactive_candidates` mempertahankan data yang sudah ada.

## Dasar keputusan dan batas bukti Muse

[Dokumentasi vendor dalam riset Muse](../research/muse-ai-v1/02-arsitektur-vendor.md) mendukung goals, pola, pengetahuan percakapan, kejadian relevan, hasil background, kebaruan bermakna, kebutuhan input, manfaat dibanding interupsi, dan preferensi intensitas. Pola/percakapan paling eksplisit menjadi dasar Ideas; seluruhnya tidak diasumsikan sebagai parameter satu algoritma notifikasi.

[Frontend Muse](../research/muse-ai-v1/03-frontend-dan-kontrak.md) memuat momentum/status, lifecycle Goal, updates/suggestions/briefings dan associations. Bukti tersebut tidak mengungkap rumus ranking atau model backend Muse, termasuk penggunaan Jev. Rancangan berikut adalah implementasi Ngertiin, bukan klaim rekonstruksi internal Muse. Momentum `behind` tidak ditebak dari jumlah Task atau horizon bebas.

## Evidence dan pemicu

Chat selesai, perubahan Task, keputusan Goal serta admission memory menulis marker akun pada transaksi yang sama. Perubahan berdekatan digabungkan selama dua menit. Procrastinate `proactive.dispatch` berjalan setiap menit dan memeriksa akun yang waktunya tiba; pemeriksaan berikutnya satu jam kemudian. Akun harus mengaktifkan evaluasi pratinjau secara eksplisit, default nonaktif. Flag server `PROACTIVE_ENABLED` tetap menjadi gerbang global.

Snapshot maksimal 20 referensi canonical dan 24.000 byte sebelum metadata evaluasi. Masing-masing sumber mengambil paling banyak empat record terbaru: Goal active, memory aktif, Task succeeded/result, pekerjaan yang sedang berjalan, dan pesan. History kandidat eligible yang masih valid ditambahkan hanya bila seluruh lineage tetap muat. Ini retrieval bounded; bukan pencarian seluruh riwayat. Evaluasi thread eksplisit memfilter sumber percakapan sebelum limit dan tidak membawa memory dari thread lain atau editor tanpa thread.

- Goal mengikat revision/spec, target dan evidence current yang sumbernya masih tersedia. `budget_cap` internal tidak dikirim ke model sebagai anggaran pengguna.
- Memory harus current/active, berlaku, tidak suppressed, dan masih mempunyai evidence sah. Capture off tidak menghapus fakta lama; koreksi/forget mencabut konteks kandidat.
- Task/result mengikat revision, status, teks hasil dan manifest. Memory lineage Task, target Goal dan file revision pada manifest diperiksa ulang.
- Pesan user adalah laporan pengguna, bukan verifikasi independen. Pesan yang dikecualikan/forgotten, rahasia yang terdeteksi, output ber-lineage memory yang dicabut, dan turn belum complete dilewati. Pesan assistant hanya menjadi konteks kebaruan.
- Konten panjang diberi label excerpt/truncated; hash tetap berasal dari konten canonical penuh. Batas konteks dapat melewatkan informasi; model harus memilih no-op bila dukungan tidak cukup.

Hanya `horizon` ISO datetime lengkap dengan timezone yang dianggap waktu pasti. Teks seperti “segera” atau tanggal/jam tanpa timezone tidak menjadi deadline. Dalam 24 jam menjelang waktu pasti tersebut, hash evaluasi menyertakan window jam sehingga perubahan waktu dapat dinilai kembali. Kandidat dibatasi 1–24 jam dan tidak melewati expiry sumber/evaluasinya.

## Pembentukan kandidat

Generasi default memakai `PROACTIVE_GENERATION_MODEL=gpt-6-luna`, melalui adapter HTTP OpenAI yang sudah digunakan aplikasi. Satu batch menghasilkan nol sampai lima usulan, biasanya satu atau dua ketika evidence sempit:

| Jenis | Maksud |
| --- | --- |
| `meaningful_update` | Perkembangan yang mempunyai nilai tambahan terhadap informasi yang sudah disampaikan. |
| `needs_input` | Keputusan/fakta pengguna diperlukan untuk membuka langkah berikutnya. |
| `goal_next_step` | Langkah konkret yang mendukung target aktif. |
| `plan_adjustment` | Usulan meninjau rencana berdasarkan evidence yang berubah. |
| `personalized_idea` | Ide yang didukung kebutuhan, pola yang memang teramati, atau konteks personal. |

Kandidat memuat title, satu action opsional, why_relevant, why_now, what_is_new, exact evidence keys, thread tujuan dan expiry. Referensi yang tidak tersedia atau thread yang tidak terkait ditolak code sebelum Jev. Model tidak memiliki tool atau akses domain untuk mengeksekusi action. Preview memakai template dari usulan terpilih; tidak ada inference tambahan untuk menulis pesan.

Laporan pengguna harus diatribusi; draft belum dibaca tidak diklaim sudah diperiksa. Model tidak boleh menafsirkan metadata token sebagai uang, mengarang deadline, menjanjikan hasil siap diajukan, atau menganggap satu observasi sebagai kebiasaan.

## Jev dan seleksi code

Jev dipanggil melalui `POST https://api.typesafe.ai/v1/systemone`, model pinned `jev-1.13.0`. Kunci TypeSafe hanya di backend. Setiap kandidat mendapat enam pertanyaan independen dalam satu request batch:

| Pertanyaan | Primitive | Keputusan awal |
| --- | --- | --- |
| Relevance | Score dengan tiga level situasi konkret | Minimal 1,5 dari 2. |
| Benefit | Score | Minimal 1,5 dari 2. |
| Timing | Score | Minimal 1 dari 2. |
| Novel | Noul | Minimal 0,8 probabilitas yes. |
| Grounded | Noul | Minimal 0,9 probabilitas yes. |
| Needs input | Noul | Kandidat `needs_input` memerlukan minimal 0,8. |

Setiap Score memerlukan confidence minimal 0,5. Output harus finite, distribution konsisten dan bentuk primitive benar. Confidence menunjukkan konsentrasi distribusi, bukan jaminan kebenaran; Noul tidak mempunyai field confidence terpisah. Pertanyaan, jawaban mentah, versi policy dan model aktual disimpan untuk inspeksi. Alasan keputusan berasal dari rule code; Jev tidak diminta mengarang penjelasan reasoning.

Setelah semua minimum lulus, code menghitung rank `0.40*relevance/2 + 0.35*benefit/2 + 0.25*timing/2`, dengan urutan kandidat sebagai tie-break. Nilai tinggi tidak mengompensasi kegagalan minimum lain. Dedup exact berlaku pada jenis/thread/action kandidat eligible. Kandidat lain dicatat discarded, termasuk `lower_rank`, `low_novel`, `low_grounded`, atau `uncertain_timing`. Tanpa yang layak, status evaluasi `no_op`. Error provider adalah `failed`, bukan no-op.

Threshold ini konservatif dan masih memerlukan kalibrasi dengan data representatif. Contoh positif yang tampak relevan dapat ditolak karena dukungan atau timing ambigu. Tidak ada janji kalibrasi kualitas universal maupun paritas algoritma Muse. [TypeSafe Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul), [confidence](https://docs.typesafe.ai/confidence), [API](https://docs.typesafe.ai/api).

## Durable state, revocation dan biaya

`proactive_evaluations` menyimpan snapshot, hash input/policy/model/account revision, lease tiga menit dan receipt. Hash input yang sama mengembalikan receipt yang sama, termasuk failed; tidak memicu ulang inference. Claim worker diserialisasi pada lock akun. Satu evaluation hanya mempunyai satu candidate eligible melalui constraint database.

Setiap inference, penyimpanan draft, publication, dan readback memeriksa ulang sumber. Goal berubah/dijeda, memory dikoreksi/dilupakan, atau file/result dihapus mencabut evaluasi terkait secara konservatif pada seluruh akun. Snapshot, seluruh usulan termasuk yang belum terpilih, dan judgment yang terlacak dipurge. Worker lama tidak dapat menulisnya kembali. Revision akun maju agar re-enable atau evidence baru dapat membentuk receipt baru tanpa menghidupkan konteks lama. Referensi ID/hash dan ledger numerik tetap menjadi audit; ini tidak menghapus sumber chat/file/result asli.

Evaluasi yang kehilangan lease menjadi failed/interrupted. Reservation orphan menjadi unknown. Retry transport/model dinonaktifkan; satu attempt generasi dan satu attempt Jev per evaluation, diproteksi unique constraint per stage. Tidak ada fallback yang melewati keputusan Jev. Error tidak menyimpan respons provider atau secret dalam log.

| Konfigurasi | Default |
| --- | --- |
| Evaluasi baru per akun/hari UTC | 12 |
| Unit internal per evaluasi | 100.000 |
| Unit internal per akun/hari UTC | 300.000 |
| Unit internal global/hari UTC | 3.000.000 |
| Timeout HTTP per stage | 60 detik |
| Output generasi maksimal | 4.000 token |

Reservation atomik dilakukan sebelum setiap attempt, memakai byte request sebagai ceiling input konservatif ditambah 10.000 unit. Usage provider terkonfirmasi mengganti reservation; jumlah di atas estimasi tetap dicatat penuh, tidak dikurangi. Unknown outcome menahan reservation. Budget evaluation tetap menghitung stage sebelum pergantian hari UTC. Ini unit operasional internal, bukan harga pelanggan, USD, atau invoice provider. Batas ini terpisah dari allowance chat dan cap pesan NG-020.

## Inspeksi dan operasi

Jalankan `make migrate`, restart API/worker dan isi `TYPESAFE_API_KEY` di `.env` server. Konfigurasi contoh ada di `.env.example`; tidak perlu dependency SDK tambahan. `make proactive-inspect` menjalankan kontrak di PostgreSQL disposable. Opsi `--live` pada `scripts/inspect_proactivity.py` menggunakan kedua provider dengan fixture sintetis dan proses worker terpisah.

`/dev/system` menyediakan panel pratinjau, aktif/nonaktif evaluasi, evaluasi sekarang, status/no-op/error, kandidat, thread, expiry, evidence hashes dan penilaian Jev. GET/POST `/dev/proactivity`, `/settings`, `/evaluations`, dan GET `/evaluations/{id}` memakai owner dari sesi server. Endpoint disembunyikan ketika diagnostics tidak aktif. UI mempertahankan data terakhir ketika refresh gagal dan melakukan polling hanya selama queued/running.

Delivery, preferensi intensitas pengguna, quiet hours, focus, mute/snooze dan cap pesan lintas thread tetap mengikuti NG-020. Hasil Task/Jadwal dan approval yang sudah mempunyai alur sendiri tidak digandakan menjadi pemberitahuan proaktif. Menyelesaikan NG-019 tidak mengaktifkan pesan otomatis.
