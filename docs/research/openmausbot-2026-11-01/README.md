# OpenMausBot → referensi UI/UX Ngertiin

Investigasi 1 November 2026 memakai skill `reverse-engineer-anything` (REA 6.5.0, skill v42), aplikasi terpasang, source yang dipin, dan keputusan Notion saat investigasi. **Hasilnya adalah paket referensi desain dan tiruan interaktif terpisah. UI produksi Ngertiin belum diubah.**

OpenMausBot memberi baseline yang cocok: daftar agent seperti kontak, percakapan sebagai pusat kerja, dan detail yang terbuka di samping. Untuk Ngertiin, pertahankan kesederhanaan itu dan ikuti tab **Agent/Anggota · File · Goals · Routine** yang sudah diputuskan.

## Mulai dari sini

- [Tiruan interaktif dengan data contoh](reference.html): DM/grup, panel kanan, tab kontekstual, menu pembuatan, tema gelap/terang, dan tampilan sempit. Semua interaksi lokal; tidak terhubung backend/provider.
- [Design system dan resep rekonstruksi](design-system.md): warna, font, spacing, ukuran, komponen, dan motion.
- [Token CSS siap dipelajari](design-tokens.css) dan [token JSON dari CSS aplikasi terpasang](design-tokens.json).
- [Bedah source terperinci](source-findings.md): inventaris fitur, file/line, dependency, dan batas bukti.
- [Cuplikan source yang dipin](evidence/source-excerpts.md), [11 skin upstream](evidence/source-design-tokens.json), dan [manifest bukti](evidence/manifest.json).
- [Hasil verifikasi paket referensi](verification.md).

Untuk membuka lewat server lokal dari root repo: `python3 -m http.server 8891 --bind 127.0.0.1 --directory docs/research/openmausbot-2026-11-01`, lalu buka `http://127.0.0.1:8891/reference.html`. File juga tidak membutuhkan build/dependency install.

## Identitas target dan kekuatan bukti

| ID | Bukti | Identitas / batas |
| --- | --- | --- |
| A1 | Aplikasi terpasang | `/Applications/OpenMausBot.app`, bundle `com.openmausbot.app`, versi/build **0.1.137**. Salinan pada volume DMG tidak menjadi target. |
| A2 | REA ASAR | `app.asar`, SHA-256 `123baad523c82bcc3210d5092d0c1d9f211c4cfcb44de43813f8bff1cbd14e6f`. UI ternyata dikirim terpisah di `Resources/ui`. |
| A3 | REA UI terpilih | Lima file dipilih: `index.html`, chunk NewBotDialog, RoomPanel, new-bot, KeyboardShortcutsModal. Empat JS diparse, 0 parse failure; 147 file relevan lain tidak dianalisis semantiknya. |
| C1 | CSS terpasang | `Resources/ui/assets/index-C515F6gO.css`, SHA-256 `ec0fc627dd6325e29c71a320b0cc8013e1de0162486db9da0e932d3915d6cf01`. Token Midnight/Daylight diekstrak langsung; bukan perkiraan dari screenshot. |
| S1 | Source upstream | [commit 7124ebc4](https://github.com/milind-soni/OpenMausBot/tree/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9), package **0.1.137**. Versi cocok, tetapi kesetaraan seluruh source dengan build terpasang belum terbukti. |
| R1–R8 | Runtime aplikasi | Delapan capture layar lewat CUA pada aplikasi yang sudah berjalan; daftar di bawah. Ini bukti navigasi/visual, bukan pengujian provider. |
| N1 | Keputusan Ngertiin | [Peta screen frontend](https://app.notion.com/p/40babdd6187381abba02d29c7363474d), edit terakhir 2026-11-01 07:13 UTC; snapshot disimpan. [Scope produk](https://app.notion.com/p/402abdd61873816e871ae24804345b56) dan [index](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) juga dibaca langsung. |

**Observed** berarti terlihat pada runtime atau file yang dibaca. **Source-observed** adalah perilaku yang ditunjukkan kode, belum dibuktikan berjalan. **Adaptation** adalah pilihan untuk Ngertiin; bukan fakta upstream. Informasi versi dependency pada laporan source adalah declared ranges, bukan versi proses yang diukur.

## Bukti visual dan alur

| Capture | Yang dibuktikan langsung | Arti untuk Ngertiin |
| --- | --- | --- |
| [R1 · Percakapan](evidence/screenshots/01-conversation.png) | Sidebar agent + preview; header nama/model; bubble; tabel; composer; error inline dari riwayat yang sudah ada | Satu tempat untuk membaca, bekerja, dan memperbaiki masalah |
| [R2 · Profil](evidence/screenshots/02-agent-profile.png) | Klik nama/avatar membuka panel kanan; tab Details/Library/Computer; akses Routine dan aktivitas | Gunakan entry profil sama; ganti susunan tab sesuai N1 |
| [R3 · Library](evidence/screenshots/03-agent-library.png) | Tab Library: empty state hasil; memory, skills, working folder | Resource mengikuti agent/chat, dengan bagian advanced saat perlu |
| [R4 · Menu +](evidence/screenshots/04-create-menu.png) | New bot, New group chat, Templates | Ngertiin memakai Create agent/Create group; template tidak otomatis masuk scope |
| [R5 · Grup](evidence/screenshots/05-create-group.png) | Nama, department opsional, checkbox agent, Create disabled sebelum valid | Gunakan nama + agent sesuai N1; department tidak menjadi field wajib baru |
| [R6 · Settings](evidence/screenshots/06-general-settings.png) | Tema system/light/dark, appearance, bahasa, send key, progressive disclosure | Settings umum ringkas; hindari menyalin seluruh fitur upstream |
| [R7 · Model](evidence/screenshots/07-model-picker.png) | Pencarian, provider/account group, pilihan reasoning, link pengelolaan akun | Pakai hierarchy yang mudah dibaca untuk Codex/ChatGPT dan Muse; billing harus eksplisit |
| [R8 · Composer +](evidence/screenshots/08-composer-add.png) | Attach files, Work until done, Teach a task | Attach saat relevan; goals Ngertiin tetap otomatis dari percakapan |

Capture memakai resolusi layar native (Retina), sehingga ukuran PNG bukan ukuran CSS. Nilai dimensi pada resep berasal dari source/CSS. Screenshot memuat chat lama contoh topik agentic AI dan nama tampilan pengguna; kredensial tidak disimpan dalam paket. Jangan menerbitkan screenshot ini sebagai demo publik tanpa meninjau isinya.

Urutan observasi: chat → profil → Library → tutup panel → menu + → dialog grup tanpa submit → Escape → Settings → General → tutup → model picker tanpa memilih → Escape → composer + → Escape. Tidak mengirim pesan, membuat agent/grup, memulai run, mengganti model/tema, atau menautkan akun. OpenMausBot dikembalikan ke percakapan awal.

### Flow yang layak ditiru

1. **Pilih identitas → buka percakapan.** Agent/grup adalah satu daftar. Klik nama di header membuka detail tanpa memindahkan pengguna ke halaman lain. R1–R3 membuktikan pola ini.
2. **Create agent → langsung ke DM.** Source upstream `lib/new-bot.ts:50–83` membuat dari defaults dan memilih nama yang belum dipakai. Tombol New bot tidak diklik dalam investigasi. Di Ngertiin, kontrak N1 menambahkan satu pembuka otomatis durable; membuka ulang chat tidak mengulang inferensi.
3. **Create group → nama + anggota → chat.** Dialog upstream diamati; submit dan routing anggota belum diuji. Ngertiin memakai satu pembuka, satu penjawab terpilih, dan anggota lain diam sesuai N1.
4. **Bekerja → tampilkan aktivitas singkat → rincian saat dibuka.** Label manusiawi dan disclosure input/output terlihat di source `ToolActivity.tsx`; state busy, queue, steer dan stop tetap harus dibuktikan lewat API nyata Ngertiin.
5. **Resource di samping percakapan.** Upstream Library mengumpulkan hasil/memory/skills/folder. Ngertiin memisahkan Agent/Anggota, File, Goals, Routine pada satu panel dengan detail di dalamnya.
6. **Error dekat konteks pekerjaan.** R1 menunjukkan pesan model unsupported inline. Ini mengonfirmasi presentasi error lama, bukan reproduksi kegagalan baru atau hasil diagnosis provider.

## Pemetaan ke scope Ngertiin

| Pola upstream | Keputusan adaptasi | Pemilik saat gate siap |
| --- | --- | --- |
| Agent list, chat, profile pill | Reuse pola; Tobi tersedia otomatis, identitas agent lintas DM/grup | NMA-061 |
| Profil Details/Library/Computer | Adapt ke Agent/Anggota · File · Goals · Routine; satu panel tertutup/dibuka | NMA-061/062 |
| Instant New bot | Reuse defaults/nama unik; satu entity + DM + opening per operasi | NMA-065 backend, NMA-061 UI |
| Dialog group + responders | Nama/pilih agent; satu pembuka dan router yang otoritatif | NMA-065/062 |
| Model/account menu banyak provider | Tampilkan capability Codex/ChatGPT dan Muse; auth dan billing terpisah | NMA-061 |
| Composer Work until done | Tidak menjadi activation form wajib; goals otomatis sesuai percakapan | NMA-062 |
| Desktop/VM/phone/voice/cloud/org | Inventaris upstream saja; general desktop/native clients/voice tetap Tunda | Tidak masuk komitmen UI ini |
| Search, context meter, 11 skins | Referensi opsional; memerlukan keputusan scope sebelum dikerjakan | Opsional |

Notion saat dibaca menyatakan **NMA-060 In Progress** dan **NMA-065 Backlog**. Paket ini mendukung desain/riset; bukan izin melewati urutan backend → gate API Done → NMA-061–063 → instalasi. Tidak mengubah status tiket atau Notion.

## Ledger REA dan keterbatasan

| Bukti REA | Record |
| --- | --- |
| ASAR lengkap dalam ledger sesi | `ev_72b333c028c6ab0f6ddbcc8a3b2241eb3777165ea03409e67d19d013e6909abd` |
| Ringkasan ASAR yang disimpan | `ev_e2cdb4879babd84dbc78f06edb604b021184ee6bcfb9729be4a2a2ce41caa93e` — [JSON](evidence/rea-app-summary.json) |
| UI terpilih, record lengkap disimpan gzip | `ev_baf48007a04d11e208f83aaf5ed542435a9f2fabb7afb706eb1a8fb30e9e155b` — [record](evidence/rea-ui-complete-record.json.gz) |
| Ringkasan UI | `ev_d64ed6f31629c8e96611cf0c7607247839f9acbc9b2e12c00b7216c1fbc6f10b` — [JSON](evidence/rea-ui-summary.json) |
| Halaman module identity 0–11 | `ev_2b1d7936aad7632d6ddbc75f357e45eb49473059d672ea6844598fe4056a6715` — [JSON](evidence/rea-ui-modules.json); 12/167, halaman pertama saja |

Analisis ASAR terkena result-budget constraints dan banyak relasi tetap unknown. Ringkasannya tidak berarti audit engine selesai. Export sesi lengkap dibuat di `/tmp/ngertiin-openmaus-rea-20261101.json` (137,272,761 byte) dan gzip di `/tmp/ngertiin-openmaus-rea-20261101.json.gz`; file sementara ini tidak menjadi dependency paket. Record UI terpilih dipertahankan lengkap di repository, tanpa mengklaim 147 file yang tidak dipilih sudah dianalisis. Tidak ada native analysis session yang dibuka sehingga tidak ada sesi native yang perlu ditutup.

## Checklist hasil

| Pertanyaan | Hasil |
| --- | --- |
| Target dan versi aplikasi? | Terjawab dari bundle dan REA |
| Tampilan utama, profil, Library, menu, dialog grup, settings, model, composer? | Terjawab untuk delapan state runtime yang dicapture |
| Warna/font/dimensi/motion dan asalnya? | Terjawab dari shipped CSS + pinned source; computed style lengkap belum diukur |
| Semua flow berjalan dengan provider? | Parsial: navigasi dibuktikan; create/send/busy/stop/recovery tidak dijalankan |
| Mobile upstream? | Source-observed; aplikasi upstream tidak diuji di mobile |
| Apa yang ditiru di Ngertiin? | Pemetaan dan preview tersedia; keputusan produk N1 tetap otoritatif |
| UI/backend Ngertiin sudah terintegrasi? | Belum; paket ini reference terpisah |

Upgrade: pin revision baru, ulangi identitas bundle/CSS hash, bandingkan token dan source entry yang dicatat, capture ulang delapan state, lalu periksa delta terhadap N1/tiket aktif. Jangan mengganti hasil lama; buat direktori tanggal baru supaya bukti tetap dapat ditelusuri.
