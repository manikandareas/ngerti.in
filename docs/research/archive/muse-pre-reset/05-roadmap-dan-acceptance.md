> Arsip perencanaan sebelum reset 18 Oktober 2026. Keputusan aktif mengikuti spesifikasi/backlog V1; instruksi menyimpan package V2 dan urutan A0–A10 di sini sudah tidak berlaku.

# 05 · Roadmap V1, Acceptance & Artefak V2

Sumber: [Notion](https://app.notion.com/p/3fdabdd61873812c8d5dfa04b7f3e140)

<!-- notion-content:start -->
**Status: usulan implementasi berdasarkan arah V1 yang diminta pengguna.** Nomor A0–A10 bukan nomor tiket Notion dan belum mengubah backlog lama.

## 7. Slice implementasi V1 — urutan usulan

Nomor berikut adalah slice baru untuk pembahasan, **bukan perubahan nomor/status tiket Notion**. Setiap slice menghasilkan alur yang bisa dicoba langsung dengan backend nyata. Static/build tetap gate; kontrak uang/ownership/concurrency memerlukan probe terarah selain walkthrough browser.

| Slice | Hasil pengguna dan cakupan konkret | Reuse / perubahan utama | Depends on dan gate |
| --- | --- | --- | --- |
| A0 — Kontrak V1 dan walkthrough baru | Definisikan skenario near-parity berbukti, bentuk shell, onboarding asisten umum, daftar capabilities dan batas awal. | Reuse tokens/Pen #01; buat state desktop/mobile untuk task, memory, schedules, file/result dan approvals. | Arah baru sudah disetujui; hasil riset Muse memberi acceptance target. Mengubah dokumen sumber dilakukan terpisah sesudah laporan selesai. |
| A1 — Task durable dan results dasar | Chat dapat memulai pekerjaan background sederhana, lanjut bercakap di thread sama, melihat status, menghentikan, dan membuka hasil tersimpan setelah reload. | Reuse queue/checkpoint/lease/event/chat; pisahkan task execution dari chat turn dan generalize result references. | Fondasi #02/#04/#05; gate crash, cancel, delivery dedup, owner isolation, same-thread chat. Tidak memerlukan sandbox dulu. |
| A2 — Persona dan memory yang dapat dikendalikan | Ubah persona dengan exact review; agent mengingat preferensi lintas thread, pengguna melihat/koreksi/lupakan. | Rework #16/#17/#18 agar tidak bergantung Practice; reuse profile revision primitive dan approvals. | A1 untuk background curation opsional; persona+capture dasar dapat memakai chat events lebih dulu. Gate forgetting suppression dan rejected persona. |
| A3 — File produk dan hasil yang berguna | Attach file, baca/olah format awal yang didukung, dapat hasil text/file dengan sumber revision exact. | Reuse storage transport; product APIs/UI baru; extraction, preview, ownership, file/result retention. | A1; gate upload failure, unknown format, deleted/revised input, source injection, persistence. Pilih format awal eksplisit. |
| A4 — Eksekusi kode terisolasi | Minta analisis CSV/generate file; jalankan kode pada sandbox, lihat ringkasan/progress, download hasil, stop/timeout. | New execution adapter/session domain + resource/cost policy; output publication via A3. | A1/A3 + usage resource admission; gate isolation, runtime failure, cleanup dan restart. |
| A5 — Browser task | Agent menelusuri sumber dan melakukan alur browser yang didukung; hasil punya evidence; aksi external tertentu memerlukan policy/approval yang sesuai. | New browser adapter/session + action ledger, credentials/session controls dan recovery unknown outcome. | A1/A3/A4 boundary; gate read→act, stale approval, session expiry, inaccessible page, disconnect after side effect. |
| A6 — Goal yang mengarahkan tindakan | Simpan tujuan, ubah next action, jalankan task terkait, lihat evidence progress, pause/complete. | General goal domain; `course_requests` lama tidak otomatis dikonversi. | A1/A2; gate satu Goal banyak tasks, completion evidence, pause menghormati pekerjaan yang sudah ada. |
| A7 — User schedules | Buat jadwal sekali/berulang, review waktu, pause/edit/run now, hasil tetap datang saat offline. | New schedule + occurrence domain di atas Procrastinate periodic dispatch; task budget per occurrence. | A1/A6 opsional; gate timezone/DST, downtime, overlap, double dispatch, edit/cancel race, budget habis. |
| A8 — Proaktivitas terkontrol | Agent menawarkan tindak lanjut yang relevan dari memory/goal/result, dapat dimute/snooze, tidak spam. | Rework #19/#20 melepas dependencies ke streak/pengayaan Course; candidate/delivery/evidence dan atomic daily cap. | A1/A2/A6/A7; gate quiet hours/focus, dedup lintas thread, kandidat basi, no-op dan dua worker race. |
| A9 — Usage, paket dan pembayaran yang sesuai | Pengguna memahami biaya/kapasitas pekerjaan, batas dan reset; admitted task tidak mati diam-diam; upgrade lifecycle konsisten. | Reuse #05 ledger + redesign meters/versioning; adapt #21/#22 payment/entitlement. | Cost telemetry dimulai A1; admission dasar mendahului A4/A5/A7. Penetapan harga final sesudah benchmark lifecycle. |
| A10 — Release dan operasi V1 | Walkthrough asisten umum desktop/mobile, recovery, isolation, deploy/restore, observability, payment dan budget telah diverifikasi. | Rework #23/#25; regression #02/#04/#05 dan benchmark umum mengganti Course-only #24 sebagai launch gate. | Seluruh capability yang dipasarkan tersedia; scoped launch dapat menyebut batas, tetapi tidak mengklaim near-parity yang belum lolos. |

Urutan ini tidak berarti resource/cost controls menunggu A9. Instrumentasi dan hard budget harus menjadi bagian A1, A4, A5 dan A7. A9 menyelesaikan paket komersial dan UI lifecycle setelah angka biaya nyata tersedia.

## 8. Acceptance scenarios lintas kemampuan

| ID | Skenario pengguna/failure | Bukti kelulusan yang harus terlihat |
| --- | --- | --- |
| P01 | Pengguna baru melewati login dan meminta bantuan umum. | Tidak diwajibkan membuat Course; agent menyelesaikan satu pekerjaan nyata dan hasil dapat dibuka kembali. |
| P02 | Task berjalan; user bercakap lagi di thread asal lalu pindah side chat. | Semua percakapan tetap berfungsi; hasil task masuk ke thread asal dengan hubungan task yang jelas, tanpa mencampur token/respons. |
| P03 | Task memerlukan approval, pengguna menundanya lalu refresh/menutup browser. | Proposal masih ditemukan; tidak ada worker/slot eksekusi aktif yang tertahan; user bisa bercakap; approval exact dapat dilanjutkan. |
| P04 | Dua client menyetujui proposal sama atau mengirim decision request ulang. | Satu action sah, satu status final; replay identik konsisten, keputusan/input berbeda ditolak. |
| P05 | Target/proposal berubah sesudah ditinjau. | Approval stale tidak diterapkan; user melihat perubahan dan dapat meninjau proposal baru. |
| P06 | Worker mati sebelum task checkpoint, sesudah hasil tool, atau saat hasil dipublikasikan. | Recovery bertahap, completed effects tidak diduplikasi, progress/result terdahulu tetap bisa dibuka, biaya retry dapat diidentifikasi. |
| P07 | User menekan stop saat model, code atau browser berjalan. | Lease dicabut; operasi baru tidak terjadi; resource berhenti/cleanup terkonfirmasi atau statusnya terlihat; partial result dan biaya yang terpakai dijelaskan. |
| P08 | Browser/server disconnect setelah external effect terjadi sebelum acknowledgement. | Action menjadi unknown/reconciling bila perlu; tidak klik ulang buta; ada outcome atau langkah pemulihan yang dapat dipahami. |
| P09 | Akun B mengetahui ID file/task/goal/schedule/session/memory akun A. | Semua read/write/download/event/approval ditolak; tools dan job tidak melintas owner; tidak membocorkan existence lewat isi hasil. |
| P10 | Kode mencoba mengakses host/API secrets, filesystem task lain atau metadata internal. | Isolasi dan policy mencegah akses; task gagal terkendali; tidak ada akses credential/control-plane. |
| P11 | Code hang, memakai memory/disk berlebihan, mengunduh besar atau browser berulang tanpa hasil. | Batas sumber daya/biaya menghentikan pekerjaan; task status, cleanup dan saldo konsisten. |
| P12 | Task membuat beberapa file lalu sandbox dihentikan. | Manifest hasil telah dipersist sebelum success; download/preview tetap berfungsi setelah sandbox hilang. |
| P13 | File upload gagal, format tak didukung, atau input revision dihapus saat task queued. | State dan pesan error jelas; tidak mengklaim analisis selesai; tidak memakai revision lain diam-diam; reservasi diselesaikan benar. |
| P14 | User menyatakan preferensi, membuka thread baru, lalu mengoreksinya. | Recall relevan lintas thread berubah; evidence dan tipe claim dapat diperiksa; budget konteks tetap terukur. |
| P15 | User melupakan memory lalu curation/retry membaca history lama. | Fakta yang dilupakan tidak hidup kembali dari evidence yang sama; efek forgetting dapat diperiksa setelah refresh. |
| P16 | User menolak persona baru tetapi memory extraction membaca percakapan penolakan tersebut. | Soul tetap; memory tidak menerapkan instruksi persona yang ditolak. |
| P17 | Goal mempunyai beberapa task; satu gagal dan user mengubah target. | Goal tidak otomatis completed; task memakai revision/intent yang jelas; user dapat memilih lanjut/replan/pause. |
| P18 | Schedule berjalan saat user offline; dua dispatcher mengklaim waktu sama. | Satu occurrence, satu task dan satu delivery sah; semua tetap terlihat setelah login. |
| P19 | Schedule diedit/pause tepat saat due; worker restart setelah downtime; timezone berubah. | Berlaku policy revision, overlap/misfire dan future occurrences yang dinyatakan; tidak ada burst tanpa batas atau task jadwal tak berizin. |
| P20 | Reminder pukul lokal tertentu melintasi DST dan timezone berbeda. | Preview, occurrence dan timestamp hasil cocok dengan policy timezone yang dinyatakan. |
| P21 | Dua kandidat proaktif lintas thread bertemu cap harian; user mute atau sedang fokus. | Cap global atomik; timing dicek lagi sebelum delivery; tidak broadcast; candidate expired dibuang. |
| P22 | Tidak ada kandidat yang layak. | Agent boleh tidak mengirim; tidak membuat follow-up generik hanya untuk memenuhi cadence. |
| P23 | Scheduled result selesai saat cap proaktif habis/quiet hours. | Task outcome tetap tercatat; delivery mengikuti pengaturan khusus hasil yang diminta, tidak hilang akibat cap proaktif. |
| P24 | Usage hampir habis, task lain/reschedule berlomba mengambil sisa. | Admission atomik, estimated cap terlihat; admitted work punya aturan settlement; tidak melampaui account/global budget karena race. |
| P25 | User retry gagal tanpa hasil, retry dengan partial hasil, replay SSE, atau approve saat chat quota nol. | Kebijakan charge tiap jenis eksplisit; replay/approval tidak menjadi pesan baru; ledger dan actual cost tidak digandakan. |
| P26 | Harga provider/policy plan berubah ketika task/period lama masih ada. | Snapshot policy/price version tetap dapat diaudit; tidak menghitung ulang biaya lama dengan harga baru tanpa aturan eksplisit. |
| P27 | Web/file berisi instruksi untuk mengganti soul, mencuri file atau mengubah jadwal. | Konten tetap data; tidak melahirkan grant, approval, memory instruction atau side effect terlarang. |
| P28 | Result HTML/kode dibuka di preview mobile dan desktop. | Preview terisolasi, tidak punya session aplikasi; file dapat diunduh; scroll/focus/reduced motion/accessibility sesuai kemampuan tampilan. |
| P29 | Deployment baru saat task, approval dan schedule versi lama masih ada. | Payload/action/workflow lama dapat dilanjutkan atau dimigrasikan secara eksplisit; tidak menjadi stalled state tersembunyi. |
| P30 | Backup dikembalikan dan resource sandbox/provider tidak lagi sama. | State direkonsiliasi, task/occurrence/usage tidak digandakan; hasil durable tetap tersedia; run tak bisa dipulihkan diberi outcome jelas. |

Cara verifikasi: walkthrough browser untuk alur pengguna; fixture/probe backend terarah untuk race, ownership, usage, revision dan replay; fault injection pada sandbox/worker; static/type/build gates. Catat account/environment, input, task/action IDs, timestamps, expected/actual, screenshot/trace dan biaya. Bukti dokumentasi saja tidak menutup acceptance fitur.

## 9. Pricing, metering dan perubahan kontrak #05

Paket lama **Rp49.000, 5 Course, 300 chat, 200 halaman ekuivalen/30 hari** dirancang untuk produk belajar. Angka itu belum membuktikan kelayakan asisten umum dengan code/browser/background. Draf ini tidak menyarankan harga baru sebelum biaya lifecycle diukur.
Pisahkan empat hal:

1. **Entitlement/capability**: tool/fitur apa yang tersedia dan izin targetnya.
2. **Product allowance**: unit yang dipahami pengguna untuk admission/settlement.
3. **Actual cost**: model token, search/browser, sandbox runtime, parser/OCR, storage/egress dan background curation/evaluation.
4. **Operational limits**: RPS/TPM, concurrent tasks/sandboxes, timeout, maximum file/storage; ini berlaku meskipun allowance masih banyak.

### Reuse yang aman

Ledger #05 sudah memberi pola reserve/commit/release/reverse, account lock, stable resource key/fingerprint, periode snapshot dan token fencing. Ownership, transaction boundaries, idempotency dan delayed settlement sebaiknya dipertahankan.
Tetapi current schema mempunyai meter CHECK fixed tiga nilai, amount integer fixed per operation, serta status whole-operation. Konversi ke credit berbobot atau runtime variable **bukan sekadar mengganti teks UI**. Perlu migration, policy version, cara reserve cap lalu settle actual/remainder, dan compatibility periode/operasi historis. Jangan mengubah amount committed historis untuk mencocokkan paket baru.

### Usulan kebijakan awal

Mulai mencatat actual cost secara internal sejak A1. Tiap model invocation, tool action dan sandbox/resource session punya identity dedup dan price version, termasuk retry/system overhead. Bedakan actual cost estimated/confirmed/unknown jika provider tidak memberi bukti lengkap. Biaya model yang gagal setelah crash tetap mungkin terjadi walaupun charge produk dipulihkan.
Untuk UI, bandingkan dua kandidat melalui benchmark:

| Model allowance | Kelebihan | Konsekuensi yang perlu dibuktikan |
| --- | --- | --- |
| Chat allowance + execution allowance transparan | Pengguna mudah mengerti beda ngobrol dan pekerjaan berat; bisa menampilkan waktu/kapasitas task. | Perlu definisi unit code/browser/file, kemungkinan banyak meter dan kebutuhan estimasi. |
| Satu saldo work credits dengan estimate/max cap | Satu pool untuk banyak jenis task; dapat membatasi job mahal. | Bobot harus berbasis biaya terukur, quote/settlement jelas, reserve variable dan pembulatan integer yang dapat diaudit. |

Usulan untuk fase implementasi: **hard per-task cost/resource cap + internal cost events dahulu**, pertahankan meter chat legacy bagi periode yang sudah ada, lalu pilih public allowance setelah pola task nyata terlihat. Satu pesan tidak boleh memberi execution tanpa batas. Sebaliknya, setiap panggilan tool internal tidak perlu dijadikan tagihan yang membingungkan pengguna.
Task/schedule yang akan berulang memperlihatkan estimated per-run cap dan frekuensi, bukan menjanjikan total gratis. Saat allowance habis, occurrence bisa menunggu atau skip sesuai policy yang dinyatakan; jangan terus retry berbiaya. Goal dan task child berbagi parent/account budget. Memory capture dan proactive evaluation memakai internal operational budget; charge produk atas pesan proaktif/scheduled result harus diputuskan secara eksplisit.
Aksi baca hasil tersimpan, melihat usage, stop/cancel, menolak/menyetujui proposal yang sudah diterima, koreksi/forget memory dan mengelola jadwal harus tetap dapat diakses saat creation allowance habis, sesuai otorisasi dan operational limits. Ini mempertahankan prinsip kontrol pengguna dari #05.
Storage aktif dan masa retensi perlu batas tersendiri; memakai ulang file revision yang sudah diproses tidak otomatis memotong ingestion ulang. Normalisasi `page-equivalent-v1` dapat dipakai untuk input dokumen bila cocok, tetapi tidak mewakili biaya browser/runtime dan tidak boleh dipaksakan menjadi satuan semua tugas.
Pembayaran tetap domain terpisah: verifikasi provider, idempotent callback, reconciliation, renewal, expiry, downgrade dan refund harus mengaktifkan entitlement yang terverifikasi. Agent tidak punya tool setter plan/grant. Harga dan pemasaran baru mengikuti kontrak paket yang benar-benar diimplementasikan dan diterima.

## 10. V2 seams: Course/Lesson/Practice tanpa membangun ulang agent

V1 boleh membantu pengguna belajar lewat chat, riset dan file umum. Itu berbeda dari menerbitkan Course/Lesson/Practice dengan kontrak, quality gate dan dedicated player. Jangan menjanjikan artifact pendidikan terstruktur sebelum V2.
Pertahankan #003 beserta fixture/quality contracts sebagai package mandiri. Saat V2 dimulai:

- Tambahkan tool domain `propose_course`, `approve_outline`, `start_course_generation`, `open_learning_context` melalui approval/task boundary yang sama.
- Workflow Course menggunakan LangGraph untuk planner, generation/review/repair/publish; executions mempunyai ID sendiri dan hasil berupa references ke Course/lesson revisions.
- `Result` memakai manifest bertipe dan versioned schema. Misalnya `kind=course` menunjuk record domain; tidak menyimpan entire Course sebagai JSON chat message atau menjadikan file Markdown sebagai source of truth progress.
- File input dan evidence tetap mengacu revision immutable. Pemilihan sumber pembelajaran dan publication gate adalah kebijakan domain Course, bukan efek otomatis karena file sudah pernah dibaca agent.
- Dedicated player membaca domain learning: learner progress, attempt/grading, unlock, rewards dan streak. Memory boleh mengamati evidence hasil; memory tidak menulis skor/completion.
- Task framework memberi cancel/recovery/budget/result delivery; domain Course tetap punya expected revision, first-lesson publication, partial readiness dan quality gates tersendiri.
- Goal umum dapat berhubungan dengan learning goal; tidak semua Goal berubah menjadi Course. Main/side threads tetap ada; Course thread/context menjadi scope tambahan yang eksplisit.
- Entitlement V2 dapat menambah meter Course/assessment atau allowance khusus dengan policy version; legacy meter `course` disimpan historis sampai transisi ditetapkan.
Backlog lama #06–#15 dan #24 Course benchmark perlu dipilah: file transport/ingestion umum dapat menyumbang V1, sedangkan source selection untuk Course, outline, generation terstruktur, player, Practice, pengayaan, flashcards dan streak pindah ke V2. #16–#20 naik prioritas V1 dengan scope umum dan dependency yang diubah. #21–#23/#25 tetap diperlukan, tetapi acceptance dan funnels harus mengikuti asisten umum.

## 11. Keputusan yang perlu ditulis saat laporan diadopsi

1. Daftar kemampuan Muse yang benar-benar diamati dan batas near-parity V1, termasuk apa yang tidak teramati pada akun/kondisi yang diuji.
2. Target pengguna/use cases pertama asisten umum; apakah positioning pelajar tetap utama meskipun capabilities umum.
3. Mode/format input, code runtime dan browser capabilities awal, dukungan login/sesi, serta batas resource/retention.
4. Grant dan approval policy per kelas tindakan; tindakan di sandbox yang reversible tidak harus memerlukan kartu approval setiap langkah, sedangkan efek external mengikuti izin yang relevan.
5. Kebijakan no-op proaktif menggantikan fallback wajib, default daily cap/quiet hours, serta pemisahan scheduled results dari initiative messages.
6. Public allowance dan harga setelah benchmark; tidak mewarisi klaim kelayakan harga lama.
7. Schedule recurrence/overlap/misfire semantics, timezone, edit/cancel semantics, serta hasil yang memerlukan intervensi pengguna.
8. Perubahan PRODUCT/spec/backlog/UX/Notion dan mirror yang diperlukan; semua source harus read back sesudah mutasi, bukan hanya file lokal terlihat konsisten.
Keputusan framework baru tidak diperlukan untuk memulai. Pilihan vendor sandbox dan model/price policy masih membutuhkan verifikasi terkini serta PoC nyata. Roadmap ini belum mengubah status atau dependensi tiket lama; penerapannya memerlukan penyelarasan spesifikasi dan backlog.
<!-- notion-content:end -->

Readback Notion: 2026-10-18T04:45:11.632Z. Bukti raw berada pada `.firecrawl/muse-re-20261018/`; status implementasi mengikuti backlog.
