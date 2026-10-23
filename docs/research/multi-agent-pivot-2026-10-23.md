# Pivot Ngertiin menuju persistent multi-agent workspace

Tanggal: 23 Oktober 2026. Status: rekomendasi riset untuk pembahasan, belum keputusan arsitektur atau backlog. Investigasi membaca source upstream pada commit terkunci, dokumentasi produk resmi, dan test source. Tidak menjalankan runtime/test upstream, mengubah aplikasi Ngertiin, atau memperbarui Notion.

## Keputusan yang direkomendasikan

**Evaluasi Rakazo sebagai kandidat fork utama untuk produk web Ngertiin; pertahankan Hermes canonical gateway sebagai pembanding serius.** Nakama menjadi referensi paling mudah dibaca untuk soul/profile dan interaksi grup, dengan gap durability dan isolation yang lebih besar. Pilih satu fondasi setelah prototype acceptance yang sama, lalu pertahankan semantik dan kode upstream sebanyak mungkin.

Alasan memilih urutan tersebut adalah fit produk hosted web dan jumlah komponen yang sudah tersambung, bukan preferensi stack lama Ngertiin. Jika kemampuan SOUL/skills per-profile serta kualitas runtime agent menjadi pembeda terbesar dalam pengujian, Hermes dapat menggantikan Rakazo sebagai pilihan pertama. Riset statis ini belum mengukur waktu integrasi atau keberhasilan tugas untuk menentukan pemenang final.

Kebebasan mengganti implementasi lama mengikuti instruksi pengguna pada sesi ini. Dokumen lama yang menyatakan mempertahankan fondasi atau mengecualikan connectors adalah konteks baseline sebelum pivot, bukan batas desain baru. Riset ini tidak mengubah status tiket lama menjadi selesai atau membatalkan pekerjaan tanpa keputusan tersendiri.

## Apa sebenarnya perubahan produknya

Unit utama menjadi **agent persisten yang mempunyai tanggung jawab**, dengan DM dan keanggotaan grup. Thread menjadi wadah percakapan; agent menyimpan identitas, instruksi, capability, memory dan pekerjaan lintas percakapan. Subagent sementara tetap berguna sebagai helper internal, tetapi berbeda dari agent yang diciptakan dan dikelola pengguna.

Dokumentasi resmi Grok Bot menjelaskan bot persisten, koordinasi peer, shared group context, serta pekerjaan yang berlanjut saat client ditutup. Dokumen yang lebih baru menjelaskan komputer dibagi per akun: file/login dapat dipakai semua bot, sedangkan percakapan dan learned context terpisah per bot. Maka “agent berbeda” tidak otomatis berarti VM berbeda. [Overview resmi](https://docs.x.ai/grok-bot/overview).

Artikel desain resmi juga membedakan capabilities yang dapat dibagi dari context per-role. Untuk Ngertiin, per-agent assignment tools/MCP/skills tetap kebutuhan valid pengguna, meskipun tidak harus menyalin seluruh kebijakan Grok Bot. [Designing Grok Bot](https://x.ai/news/designing-grok-bot).

Pernyataan bahwa multi-agent adalah satu-satunya masa depan tidak dibuktikan oleh investigasi ini. Alasan pivot yang lebih teruji adalah kebutuhan pengguna untuk beberapa peran persisten, konfigurasi berbeda, dan kerja lintas peran dalam percakapan. Keberhasilan harus diukur melalui hasil tugas, biaya, latency dan beban koordinasi pengguna; banyaknya pesan antarbots bukan ukuran keberhasilan.

## Perbandingan tiga referensi utama

| Aspek | Rakazo | Hermes | Nakama |
| --- | --- | --- | --- |
| Agent persisten | Bot + private instructions + model + memory/home | Profile + SOUL + canonical Bot Chat | Profile + SOUL/STYLE/INSTRUCTIONS/MEMORY |
| Grup nyata | Shared thread + explicit handoff tool | Canonical gateway Discussion + mentions; legacy Desktop juga ada | Group sessions + mention queue + private threads |
| Routing | User mentions; default anggota pertama; handoff terstruktur | Mention policy; round awal tanpa mention dapat melibatkan semua; lanjut hanya unaddressed mentions | User mentions/@all; giliran serial; agent mentions menambah queue |
| Anti-loop | Default enam hop; direct bounce ditolak | 2–6 anggota Discussion, 3 rounds, 10 agent messages | Dasar enam balasan, diperluas untuk initial roster; pass bukan batas pemanggilan model |
| Durable execution | DB run/task/event, leases, reconciler | SQLite room log, driver leases/generations, indeterminate recovery | Transcript durable; run queue Map dalam proses |
| Tools/MCP/skills | Per-bot MCP/tool assignment; skills catalog yang diperiksa dibagi per user/space | Per-profile toolsets/MCP/skills; Bot Mode konfigurasi | Assignment per-profile dan soul composer eksplisit |
| Web product reuse | Paling langsung untuk evaluasi fork aplikasi web | Runtime/gateway kuat; UI canonical belum parity penuh | UI/domain dekat kebutuhan dan lebih lugas |
| Gap utama | Multi-human group, per-agent skills, kompleksitas executor besar | Hosted tenant boundary, canonical-vs-legacy parity, integrasi web | Restart, active cancellation, host execution isolation |
| Lisensi root snapshot | Apache-2.0 | MIT | MIT |

Semua isi tabel diturunkan dari source yang dirinci dalam [audit Rakazo](multi-agent-pivot-2026-10-23-rakazo.md), [audit Hermes](multi-agent-pivot-2026-10-23-hermes.md), dan [audit Nakama](multi-agent-pivot-2026-10-23-nakama.md). Lisensi root belum menggantikan inventaris dependency, aset, dan layanan pihak ketiga.

## Temuan teknis yang menentukan

### 1. Percakapan antar-agent membutuhkan delivery protocol

Tampilan boleh berupa “@Writer, olah temuan ini”. Namun backend perlu menyimpan identitas pengirim/penerima, source message, task/run, hop/round, status delivery, dan pembatalan. Rakazo memberi contoh konkret: `handoffToGroupBot` memvalidasi keanggotaan dan active source run, lalu menyimpan pesan, task, run, dan event dalam satu transaksi sebelum enqueue. Retry memakai identitas handoff yang sama. [Source pinned](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/group-handoff.ts).

Hermes menyediakan alternatif yang dekat dengan mention conversational: policy deterministik memutuskan next member berdasarkan log dan watermark, sementara driver menyimpan lease serta generation. [Discussion](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_discussion.py), [driver](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_driver.py).

Pilih salah satu semantik sebagai baseline. Mencampur keduanya tanpa kontrak jelas berisiko satu pesan menyalakan agent dua kali, atau stop pada satu runtime tidak menghentikan runtime lain.

### 2. Otonomi mempunyai beberapa lapisan

- Agent membalas agent setelah tugas manusia: sudah ada bukti source dalam ketiga kandidat.
- Pekerjaan tetap berjalan setelah browser ditutup: perlu server-owned execution; jangan mengambil orchestrator renderer Hermes sebagai backend web.
- Pekerjaan dimulai schedule/event saat manusia offline: audit scheduler-to-group target tersendiri; keberadaan scheduler agent belum membuktikan group scheduler.
- Sistem mengundang/membuat agent atau mengubah capabilities sendiri: scope terpisah; bukan prasyarat awal percakapan multi-agent.

### 3. Banyak agent tidak sama dengan banyak manusia

Rakazo dan Nakama yang diperiksa memodelkan satu pemilik manusia dengan anggota bot. Hermes menyediakan actor/room model lebih kaya, tetapi authorization beberapa manusia belum terbukti. Jika fase pertama cukup satu pengguna + beberapa agent, ketiganya jauh lebih dekat. Jika harus beberapa pengguna manusia dalam grup yang sama, explicit human membership, author identity, roles, invitation, revoke, dan visibility wajib menjadi acceptance sebelum memilih upstream.

### 4. Soul mengatur perilaku; permission ditegakkan runtime

Jangan mengandalkan SOUL.md untuk membatasi secret atau filesystem. Setiap eksekusi harus memiliki capability grant dan boundary tenant yang nyata. Profile directory yang berbeda tidak membatasi bash/stdio MCP yang berjalan sebagai OS user sama. Ini gap konkret dalam dokumentasi profiles Hermes dan threat model Nakama, bukan risiko hipotetis. [Hermes profiles](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/profiles.md), [Nakama threat model](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/THREAT_MODEL.md).

### 5. Memory perlu scope yang terlihat

Kontrak yang diusulkan untuk evaluasi: private agent memory, DM transcript, group transcript/group knowledge, dan shared files merupakan scope berbeda. Masuk grup tidak otomatis memberikan akses ke seluruh DM agent lain. Shared computer juga tidak boleh dipresentasikan sebagai filesystem privat per-agent. Ini keputusan produk yang harus diekspos secara sederhana pada pengaturan sharing, bukan jargon pada chat.

## Cara mengikuti kode upstream secara konkret

1. Pin snapshot kandidat dan buat checkout/prototype terpisah. Pertama jalankan upstream tanpa perubahan perilaku agar baseline dapat dibandingkan.
2. Catat source file, commit, lisensi/notice, tests, serta setiap patch lokal. Fork yang dapat mengikuti upstream lebih masuk akal daripada menyalin folder lalu kehilangan asal perbaikannya.
3. Gunakan runtime, domain dan scheduler upstream bersama terlebih dahulu. Branding/UX lokal menyusul setelah jalur kerja terbukti.
4. Daftar delta wajib harus kecil dan eksplisit: per-agent skill assignment, konfigurasi soul yang diinginkan, tenant boundary, serta human membership jika memang masuk fase pertama.
5. Port modul ke stack lama hanya jika uji menunjukkan keuntungan yang konkret. Port Python↔TypeScript akan mengurangi code reuse dan dapat memperkenalkan perbedaan cancellation, transaction, dan replay.

Tidak direkomendasikan memulai dengan “UI Nakama + executor Rakazo + gateway Hermes”. Ketiganya memiliki session, memory, cancellation dan persistence ownership sendiri. Integrasi runtime kedua baru layak setelah kebutuhan yang tidak dipenuhi fondasi utama dapat ditunjukkan.

## Prototype pembanding dan acceptance

Skenario yang sama untuk Rakazo dan Hermes: pengguna membuat Researcher, Writer, Reviewer; masing-masing punya instruksi, model/capabilities dan skill berbeda. User memberi tugas di grup. Researcher mengambil sumber, Writer menyusun artifact, Reviewer memberi koreksi. Identitas dan handoff terlihat dalam satu transcript; user dapat menyela atau menghentikan pekerjaan.

| Percobaan | Bukti lulus |
| --- | --- |
| Konfigurasi agent | Instruksi dan capabilities berbeda benar-benar dipakai, bukan hanya tersimpan di UI |
| Mention/handoff | Recipient tepat; bukan semua agent menjawab setiap pesan; nama kembar tidak salah routing |
| Task selesai | Artifact berguna dan terhubung pada percakapan; tidak hanya agent saling mengakui pesan |
| Loop/budget | Mutual mention berhenti; batas token/biaya mencakup seluruh rantai dan pass calls |
| Stop/interruption | Giliran berikutnya tidak berjalan; late result tidak mempublikasi setelah cancellation sesuai kontrak |
| Client ditutup | Pekerjaan tetap berjalan; hasil dan status dapat dibaca setelah reconnect |
| Worker restart | State pulih atau ditandai indeterminate; side effect yang hasilnya belum pasti tidak diulang buta |
| Membership revoke | Agent yang dikeluarkan tidak menerima giliran baru atau mengakses data tanpa hak |
| Context/privacy | DM privat dan secret tenant lain tidak masuk prompt/tool/files grup |
| Tools nyata | Satu MCP + satu skill script + sandbox/browser target berjalan dengan grant yang tepat |
| Schedule/event | Trigger offline menghasilkan task pada target yang benar, dengan dedup dan hasil terlihat |

Ukur keberhasilan tugas, intervensi manusia, total biaya, waktu selesai, serta recovery behavior. Jangan mengubah semua sekaligus sebelum ada hasil pembanding. Pilihan fork utama ditetapkan dari bukti ini, lalu spesifikasi/backlog Ngertiin ditulis ulang mengikuti pilihan tersebut.

## Batas riset dan materi lanjutan

Tool codebase graph tidak tersedia; GitHub connector dan Git tree menjadi fallback. Skill REA dibaca: ordinary source-repository analysis memakai pembacaan source, sehingga tidak diperlukan dekompilasi binary atau instrumentasi aplikasi untuk klaim source di laporan ini. Runtime parity Grok Bot belum diuji dan internals proprietarinya tidak dianggap diketahui.

Dokumen lokal Ngertiin yang dibaca menjelaskan baseline FastAPI/LangGraph, PostgreSQL, Procrastinate dan E2B; itu orientasi sebelum pivot, bukan audit ulang seluruh kode saat ini. Ada perubahan aplikasi yang sudah berada di working tree sebelum riset; investigasi hanya menambahkan catatan di docs/research.

Audit alternatif dan bukti Grok Bot tersedia dalam [laporan alternatif](multi-agent-pivot-2026-10-23-alternatives.md). Detail setiap kandidat utama terdapat pada tiga audit yang ditautkan di atas. Seluruh rekomendasi masih dibatasi oleh inspeksi statis; klaim production-ready memerlukan prototype dan pengujian yang disebutkan.
