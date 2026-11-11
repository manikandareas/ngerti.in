# Feature decisions

The decision column preserves the user-selected Required/Optional/Deferred scope. Recommendations are context, not additional commitments. This register contains 83 decision identities: 70 product candidates, seven runtime/provider choices and six foundations. [Product scope](../../PRODUCT.md) and [the local backlog](../backlog/README.md) define current interpretation and ownership.

Amendments applied: shared Cua machine replaces browser-use/VNC; semantic Jev selection routes group members; Goals require durable responsibility; the Tauri macOS ARM64 host is an implemented development exception to deferred general native-client distribution. The accepted engine/API billing scope uses Codex subscription and explicitly selected Muse API key; Muse subscription remains unverified.

On 2026-11-07 the user authorized a separate GPUI visual/interactivity experiment, implemented in [the experimental app](../../apps/gpui-experiment/README.md). It uses fixture conversations and an optional observation-only retained-machine viewer; [experiment evidence](../verification/gpui-experiment-2026-11-07/README.md) owns that tested scope. The subsequent [desktop-rs parity plan](../architecture/desktop-rs-plan-2026-11-07.md) contains NMA-066–071. NMA-066/NMA-067 are **Done** under the [2026-11-08 owner decision](../development/nma-066-067-closure-2026-11-08.md), accepting the implemented native foundation/components and making remaining technical verification non-blocking. [Foundation](../verification/nma-066/README.md) and [component evidence](../verification/nma-067/README.md) preserve actual results and limitations. NMA-068 is Done for the implemented native workspace/conversation with bounded native/API evidence; NMA-069 is Done for native contextual workflows; NMA-070 is Done for native Computer/host lifecycle; NMA-071 is Done for integrated native development acceptance under the [focused November 9 scope](../development/nma-071-closure-scope-2026-11-09.md). Tauri remains active; host replacement, other-platform distribution and NMA-063/NMA-064 retain their separate gates.

The user confirmed native Rust + GPUI implementation of the main desktop-rs UI. The [rendering ownership contract](../architecture/desktop-rs-plan-2026-11-07.md#rendering-ownership-contract) limits WebViews to static HTML document content and the scoped Computer viewer. Workspace, composer/messages, avatar, panels, Settings, file tree, rich content and PDF controls are native; a React/web-client wrapper or browser-based PDF UI does not satisfy this scope.

The 2026-11-07 content-viewer decision selects Focus: direct conversation file/table viewing, centered filenames, a floating contextual composer, direct static HTML rendering and source download through the actions menu. The subsequent PDF amendment adds direct paged preview, selectable text and zoom within the same viewer; the filename header remains borderless. Existing file/terminal capabilities perform edits; saved artifacts remain immutable. See [the interface decision](interface.md#conversation-content-viewer).

Current UI tabs are Detail, Library and Computer. The 2026-11-07 Working files amendment moves shared machine browsing out of Library into a dedicated file-tree page opened by the folder action beside Close. Source files use a lightweight read-only Focus view with syntax colors, line numbers, find, copy and wrapping. See [the interface decision](interface.md#working-files). Earlier File/Agent panel wording below describes responsibilities now reached through those surfaces; see [the current interface](interface.md). The ordinary composer queues during an active run; contextual steer and the explicit cancellation endpoint have separate receipt semantics. The explanatory C07 flow never authorizes deterministic natural-language cancellation classification.

The November 9 owner request adopts Zed's native per-thread presentation-state pattern: retained conversation entities, protected/idle cache lifetimes, scoped event reconciliation and durable rich-draft/reading checkpoints. Backend identity, queue, receipts and recovery remain authoritative. [Interface semantics](interface.md#native-per-thread-presentation-state) and [bounded implementation evidence](../verification/nma-068/retained-threads-2026-11-09.md) own this amendment; optional search/fork, agent runtimes and distribution scope are unchanged.

The subsequent owner-requested conversation transition refinement covers retained avatars and stable avatar gutters, neutral composer presentation from the first focused frame, and conversation-shaped skeletons only while uncached history is loading. [Transition evidence](../verification/nma-068/conversation-transitions-2026-11-09.md) retains its own source and validation cohort.

The 2026-11-11 owner amendment makes Settings a full application screen in `apps/web-client` and the shared Tauri host, then adds device preferences, explicit connection controls, public-data export and shortcut guidance. The subsequent approved refinement adds the permanent compact icon rail, contextual sidebars and borderless surfaces; removes sidebar collapse controls and the redundant conversation title; and aligns the Settings sidebar title with section-heading typography. The [interface specification](interface.md#web-and-tauri-settings--2026-11-11) defines the nine supported sections. It preserves conversation/draft continuity, scoped app grants and explicit account/billing choices; it does not alter the separately accepted native Rust client or add account-login/provider-training controls.

## Matriks fitur produk

Jumlah: 60 fitur dalam delapan kelompok. Detail perilaku adalah ekspektasi bila fitur dipilih; dukungan runtime harus dibuktikan sebelum fitur dinyatakan tersedia.

### A · Instalasi dan akses

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| A01 | Instalasi lokal | Menjalankan Ngertiin di mesin sendiri lalu membuka antarmuka web; setup tidak mengharuskan subscription layanan Ngertiin. | Inti | Wajib, namun jadi backlog dengan urutan terakhir | O1, O9 |
| A02 | Instalasi VPS / server pribadi | Menjalankan backend dan harness di VPS milik pengguna; web dapat diakses dari perangkat lain. | Inti | Optional, | O9 |
| A03 | Web responsif berpusat pada percakapan | Satu halaman percakapan desktop/mobile dengan sidebar kiri agent/grup sekaligus daftar chat dan sidebar kanan bertab Agent/Anggota, File, Goals, Routine. | Inti | Wajib. Keputusan 2026-11-01: tidak ada halaman Agents/Workspace/Goals/Routine terpisah sebagai navigasi utama; panel dapat ditutup dan menjadi sheet/tampilan penuh di mobile. | N1, N2 |
| A04 | Tetap bekerja saat tab ditutup | Agent dan jadwal tetap berjalan selama host/backend hidup; mesin mati bukan kondisi offline yang bisa terus mengeksekusi. | Inti | Wajib | N3, O5 |
| A05 | Akses pribadi yang terlindungi | Instalasi lokal development tidak memerlukan fitur login/pairing lengkap saat ini. Perlindungan akses web lintas perangkat/VPS dibahas saat scope instalasi tersebut dikerjakan; pengamanan resource dan secret H03 tetap wajib. | Inti | Tunda untuk sekarang. Berbeda dari H03 yang tetap wajib; tidak menambahkan login akun cloud sebagai prasyarat development. | N2, O9 |

### B · Harness, subscription, dan koneksi

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| B01 | Deteksi harness terpasang | Menampilkan CLI yang ditemukan, versinya, dan kesiapan koneksi pada host tempat backend berjalan. | Inti | Wajib, ngertiin juga memiliki minimal version dari harness yang di support | O1, O2 |
| B02 | Hubungkan subscription | Menggunakan login akun/plan melalui jalur yang didukung harness atau provider; status login dibedakan dari akses inference. | Inti | Wajib | O2, P1, P2 |
| B03 | Pilihan API key tetap tersedia | Pengguna dapat memilih key bila didukung; sumber billing aktif terlihat dan tidak diam-diam beralih dari plan ke key. | Inti | Wajib | O2 |
| B04 | Pilih harness, akun, model, dan reasoning per agent | Setiap agent dapat memakai koneksi dan model berbeda, dengan opsi sesuai kemampuan runtime tersebut. | Inti | Wajib | O2, N2 |
| B05 | Status koneksi dan perbaikan yang jelas | Tampilkan siap, perlu login, dibatasi kuota, atau gangguan sementara; refresh otomatis dan petunjuk reconnect yang tepat. | Inti | Optional | O2, O8 |
| B06 | Kemampuan sesuai harness | UI hanya menawarkan operasi yang didukung, misalnya gambar, resume, compact, atau tools; ketidaktersediaan dijelaskan. | Inti | Wajib | O2, P3 |
| B07 | Konfigurasi CLI / custom ACP | Path/command dan argumen harness dapat diatur bila deteksi otomatis belum cocok; custom agent ACP dapat dihubungkan. | Disarankan | Optional | O2 |
| B08 | Bantuan instalasi dan update harness | Aplikasi membantu memasang/memperbarui versi kompatibel; tidak mengubah CLI sistem tanpa tindakan pengguna. | Opsional | Optional | O1, O2 |
| B09 | Endpoint API khusus dan model lokal | Hubungkan endpoint yang sudah ada seperti OpenAI-compatible/Ollama; bukan kewajiban menyertakan downloader model. | Opsional | Tunda | O1, O2 |

### C · Agent dan percakapan

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| C01 | Tobi dan DM awal otomatis | Instalasi/akun baru mendapat generalist Tobi; dapat membuka percakapan tanpa mengisi formulir agent lebih dahulu. | Inti | Wajib | N1, N2 |
| C02 | Pembuatan cepat dan personalisasi agent lewat percakapan | Tombol + → Create agent langsung membuat agent bernama acak dari library, membuka DM, dan memulai satu pesan pembuka otomatis dari pengguna; agent memperbarui dirinya melalui tools. | Disarankan | Wajib. Nama unik pada daftar pengguna; avatar dan koneksi/model default yang telah dipilih. Personalisasi sesuai kebutuhan, satu pertanyaan saat perlu, boleh langsung bekerja; nama/peran/persona/goals/cara kerja bukan checklist. Tidak perlu form atau perantara Tobi. Delta backend NMA-065; UI NMA-061. | O1, O3 |
| C03 | Identitas agent persisten | Identitas agent stabil lintas DM/grup; update melalui tools memperbarui nama/avatar/peran/instructions dan terlihat pada sidebar/panel sesuai revision. | Inti | Wajib | N2, O3 |
| C04 | DM persisten per agent | Sidebar agent sekaligus daftar chat; klik item membuka DM yang benar. Membuka existing chat tidak menjalankan model; hanya flow Create eksplisit mengirim satu pembuka otomatis. | Inti | Wajib | N2, O3 |
| C05 | Streaming jawaban dan aktivitas | Pengguna melihat progres, jawaban, aktivitas tools, serta pertanyaan/izin dari runtime secara jelas. | Inti | Wajib. November 7 refinement: centered calendar-day separators and shared clocks on messages/cards; Goal/Routine event bars remain without clocks. | O3, P3 |
| C06 | Antrean saat agent sibuk | Saat agent sibuk, pesan biasa masuk antrean persisten. Pengguna dapat mengedit/menghapus pesan yang belum diproses, atau memilih Arahkan sekarang untuk memberi koreksi melalui steer bila runtime mendukung. | Inti | Wajib. Queue + steer dengan UX percakapan yang mudah dipahami pengguna awam; default pesan biasa masuk antrean, arahan sekarang menjadi pilihan kontekstual. | O8 |
| C07 | Stop pekerjaan dan arahan tambahan | Pengguna menyampaikan pembatalan melalui percakapan/steer. Agent menafsirkan konteks dan memilih structured tool cancel\_run atau control\_goal/control\_routine; backend memvalidasi scope, target, receipt dan native confirmation. Endpoint cancel langsung tetap tersedia ketika harness macet. | Inti | Wajib. Keputusan 2026-10-31: hapus cancellation-intent regex/deterministic language classifier. Agent memutuskan dari konteks melalui tools; steer mengirim arahan saat runtime mendukung dan tidak menjamin pemrosesan instan. Chat biasa tetap antre; endpoint cancel eksplisit independen dari model/antrean. Stop run berbeda dari pause/stop goal/Routine. Tombol Stop khusus tetap opsional. | O3, O8 |
| C08 | Context meter dan compaction | Tampilkan penggunaan konteks jika tersedia; compact atau handoff sesuai runtime tanpa menghapus riwayat produk. | Disarankan | Optional | O2, O3 |
| C09 | Pencarian dan pengambilan riwayat | Cari pesan lama dan buka bagian riwayat yang relevan; agent dapat mengambil riwayat sesuai scope. | Disarankan | optional | O2, O3 |
| C10 | Cabang percakapan / fork sesi | Mengeksplorasi arah lain tanpa menimpa percakapan utama; hanya jika mapping fork runtime jelas. | Opsional | optional | O2, P3 |

#### Flow percakapan saat agent sedang bekerja

1. Pesan biasa tetap dapat dikirim dan masuk antrean dengan status yang mudah dipahami, misalnya Menunggu. Pengguna tidak harus memilih mode teknis setiap kali mengirim pesan.
2. Untuk koreksi yang perlu diterapkan pada pekerjaan berjalan, tersedia aksi kontekstual Arahkan sekarang. Istilah steer adalah mekanisme internal, bukan istilah yang wajib dipahami pengguna.
3. Pesan seperti stop atau gajadi deh dipahami berdasarkan konteks sebagai permintaan pembatalan jika maksudnya jelas; kutipan atau diskusi hipotetis tidak otomatis membatalkan pekerjaan. Pembatalan tidak menunggu antrean pesan biasa selesai dan tidak hanya mengandalkan tool dari agent yang sedang macet.
4. UI membedakan permintaan penghentian yang sedang dikirim dari konfirmasi bahwa runtime benar-benar berhenti. Tindakan yang telanjur selesai tidak dianggap otomatis dibatalkan atau di-undo.
5. Edit/hapus pesan adalah pengelolaan pesan. Stop satu run menghentikan pekerjaan itu; stop goal menghentikan tanggung jawab beserta kelanjutannya sesuai E07. Tombol Stop khusus bukan prasyarat alur ini.

### D · Grup dan kolaborasi agent

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| D01 | Grup satu pengguna dan beberapa agent | Tombol + → Create group membuka dialog nama dan pilihan agent milik pengguna; setelah dibuat, buka chat grup dan kirim satu pembuka otomatis dari pengguna. | Inti | Wajib. Satu anggota memandu opening/personalisasi; grup tetap satu pemilik manusia dan agent miliknya. Delta backend NMA-065; dialog/opening UI NMA-062. | N2, O4 |
| D02 | Mention dan routing percakapan | Pemilihan penjawab mengikuti konteks melalui model router, bukan giliran tetap atau acak. Hanya agent terpilih yang menjawab; agent lain diam tanpa pesan seperti (pass), skip, atau pemberitahuan tidak menjawab. | Inti | Wajib. Router berbasis konteks memilih satu anggota valid untuk opening grup dan penjawab berikutnya sesuai konteks. Anggota lain diam tanpa pass/skip. Keputusan 2026-11-03: TypeSafe Jev dipilih untuk routing anggota grup berdasarkan instruksi eksplisit pengguna. Mention/target eksplisit langsung ke anggota valid. Keputusan ambigu memakai satu fallback model anggota yang tercatat; gangguan layanan menahan routing untuk retry pesan yang sama. Konfigurasi dapat memilih router model anggota secara eksplisit. Scope advanced provider routing X05 tetap ditunda. Implementasi dan bukti pada [NMA-056 · Grup, model-based routing, handoff dan HITL API](../backlog/NMA-056.md). | N2, O4 |
| D03 | Handoff, pembagian tugas, dan review | Agent dapat membagi tugas, meminta peer mengulas, atau mention pengguna ketika perlu input, review, approval, atau HITL. Pekerjaan terkait dapat menunggu lalu dilanjutkan setelah respons pengguna. | Inti | Wajib. Pengguna bukan perantara antar-agent; agent meminta input saat dibutuhkan tanpa approval universal. Handoff/review tampil sebagai aktivitas singkat yang ramah pengguna; instruksi teknis tetap internal. | N2, O4 |
| D04 | Subagent sementara | Pekerjaan paralel sementara mempunyai hasil dan kontrol, tanpa otomatis menjadi identitas permanen atau anggota grup. | Disarankan | Optional | N1, O3 |
| D05 | Batas konteks DM dan grup | Identitas agent, history, memory, instruksi, native session dan metadata artifact tetap mengikuti DM/grup. Working files dan salinan attachment di machine sengaja dibagikan kepada semua agent pemilik yang berwenang. | Inti | Wajib. Amendment 2026-11-04: logical workspace memberi scope percakapan/artifact; bukan isolasi filesystem OS bersama. | N2 |

### E · Goals otomatis dan proaktivitas

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| E01 | Goal ditangkap otomatis dari chat | Agent menangkap tanggung jawab nyata melalui chat. Eksplorasi nama/persona atau ide hipotetis pada personalisasi tidak otomatis menjadi goal aktif. | Inti | wajib | N3 |
| E02 | Banyak goal persisten | Agent dalam DM dan grup dapat mempunyai beberapa tanggung jawab persisten. Goal grup dimiliki grup dengan koordinator terpisah; sumber, progres, evidence dan identitas bertahan ketika penanggung jawab berganti. | Inti | wajib | N3 |
| E03 | Kelanjutan pekerjaan otonom | Pekerjaan yang belum selesai dapat dilanjutkan saat pengguna tidak membuka web; tidak harus menunggu pesan baru. | Inti | wajib | N3, O5 |
| E04 | Jadwal, pengingat, dan pemeriksaan berkala | Routine satu kali/berulang/pemeriksaan berkala dibuat/diubah melalui chat; timezone dan hasil terlihat pada tab Routine dalam scope agent/percakapan/grup. | Inti | Wajib, bernama Routine. Routine grup dimiliki grup; target agent tertentu atau otomatis, dengan satu identitas occurrence dan satu pelaksana tiap eksekusi. | N3, O5 |
| E05 | Pemicu event / webhook | Goal dapat dilanjutkan ketika event yang dihubungkan masuk; bukan setiap tick mengirim pesan baru. | Disarankan | Optional | N3, O5 |
| E06 | Daftar goals, progres, dan bukti | Tab Goals pada sidebar kanan menampilkan progres, hambatan, hasil/artifact dan bukti; klik item membuka detail dalam panel yang sama. | Inti | Wajib | N3 |
| E07 | Pause / stop goal berbeda dari stop run | Pengguna dapat menghentikan satu run atau seluruh tanggung jawab beserta kelanjutannya; stop tetap berlaku setelah restart. | Inti | Wajib | N3, O8 |
| E08 | Quiet mode dan pemberitahuan relevan | Agent boleh menunggu tanpa spam; kemajuan penting, pertanyaan, hambatan, dan hasil muncul di percakapan yang benar. | Disarankan | Wajib | N3, O5 |

### F · Workspace, tools, dan hasil kerja

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| F01 | Workspace dan proyek | Satu persistent Linux machine per installation/owner untuk seluruh agent. Logical workspace mempertahankan konteks dan provenance; Library menampilkan saved artifacts; Working files tersedia melalui action folder di header side panel sebagai file tree pada machine yang sama dengan terminal/browser/desktop. | Inti | Wajib. Amendment 2026-11-04: shared working root; saved artifact bytes immutable dan metadata percakapan tetap scoped. Remote/VPS attachment masih rencana. | O6, N2 |
| F02 | Lampiran dan artifact | Upload lampiran melalui percakapan; buka/download hasil dari chat atau tab File; sharing eksplisit dan viewer sesuai format/capability. | Inti | wajib | O6, N2 |
| F03 | Baca, ubah, dan cari file | Operasi file berjalan pada workspace yang diberikan; perilaku mengikuti tools harness atau tools Ngertiin yang dihubungkan. | Inti | wajib | O6 |
| F04 | Terminal, eksekusi kode, dan Git | Agent dapat menjalankan pekerjaan coding serta memeriksa hasilnya dalam workspace yang sesuai. | Disarankan | wajib, memanfaatkan acp ataupun kemampuan agent harness | O6 |
| F05 | Riset web dengan sumber | Agent mencari/membaca web dan memberi tautan sumber pada hasil; pilihan backend mengikuti kemampuan yang tersedia. | Disarankan | wajib | N4, O6 |
| F06 | Browser agent | Browser persisten pada shared Linux desktop, dikendalikan lewat Cua SDK → cua-spacesd → Cua Driver dan ditampilkan lewat viewer Cua pada Computer. | Disarankan | Wajib. Keputusan pengguna 2026-11-04 mengganti browser-use MCP/VNC sebagai jalur aktif. Codex/Muse tetap memiliki inner loop. Mouse/keyboard diserialisasi bersama human takeover; proses terminal boleh paralel. Bukti lama NMA-058 tetap historis untuk scope aslinya. | O6 |
| F07 | Computer use / desktop | Shared Linux desktop lokal yang disediakan untuk agent; pengguna dapat melihat dan mengambil/mengembalikan kontrol machine yang sama. | Opsional | Wajib untuk machine lokal sesuai keputusan pengguna 2026-11-04. Gunakan Cua SDK + cua-spacesd + Driver; Ngertiin memiliki lifecycle, scope, input lease, receipts dan recovery. Native client Ngertiin, remote/VPS enrollment dan multi-machine tetap di luar implementasi ini. | O1, O6 |
| F08 | MCP dan koneksi aplikasi | Agent memperoleh tools dari server MCP atau koneksi aplikasi yang dipilih; akun dan kemampuan dapat ditetapkan per agent. | Disarankan | wajib, saat ini gunakan composio | O2, O7, N4 |
| F09 | Pemahaman gambar dan video | Agent memahami lampiran visual bila model/harness mendukung; batas input dan ketersediaannya terlihat. | Disarankan | wajib | N4, O1 |
| F10 | Generasi dan edit gambar | Membuat atau mengedit gambar sebagai artifact; tidak otomatis menjanjikan generasi video atau semua kontrol provider. | Opsional | optional | N4, O1 |
| F11 | Pembuatan dokumen dan spreadsheet | Agent menghasilkan PDF/DOCX/XLSX/presentasi melalui tools/skills yang tersedia; hasil dapat dibuka dan diunduh. | Disarankan | optional | N4, O6, O7 |
| F12 | Preview hasil web/aplikasi | Buka preview hasil coding atau dokumen yang relevan langsung dari percakapan bila backend mendukungnya. | Opsional | optional | N4, O3 |

### G · Memory, skills, dan personalisasi

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| G01 | Memory jangka panjang sesuai scope | Agent mengingat preferensi/fakta relevan sesuai scope; memory dapat diakses dari bagian lanjutan tab Agent tanpa menyatukan DM-private dengan grup. | Inti | wajib | N2, O7 |
| G02 | Lihat, koreksi, dan hapus memory | Pengguna dan agent dapat memperbarui fakta dengan identitas yang jelas; penghapusan tidak muncul kembali dari state lama. | Disarankan | wajib | N4, O7 |
| G03 | Skills per agent | Agent menggunakan dua sumber skill: skill yang diwarisi dari harness terintegrasi dan skill level aplikasi yang diassign pada agent Ngertiin. Sumber skill dibedakan; benturan nama ditangani secara eksplisit tanpa menimpa paket bawaan. | Disarankan | Wajib. Disepakati: warisi skills harness + skills yang diassign melalui aplikasi. Skill bawaan harness tidak diubah oleh workflow pembuatan/perbaikan skill Ngertiin. | N4, O7 |
| G04 | Agent membuat dan memperbaiki skill | Agent membuat dan memperbaiki paket skill milik aplikasi Ngertiin, beserta versi/aset dan perubahan yang dapat ditinjau; paket bawaan harness tetap terpisah. | Disarankan | Wajib. Disepakati: penulisan/perbaikan hanya pada skills level aplikasi; tidak memodifikasi skills bawaan harness. | N4, O7 |
| G05 | Import/export konfigurasi agent | Pindahkan persona, instructions, dan skills tanpa mengekspor secret atau mencampurkan riwayat privat secara otomatis. | Opsional | tunda | N4, O7 |

### H · Keandalan dan kontrol pengguna

| ID | Fitur | Ekspektasi pengguna | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| H01 | Riwayat produk dan sesi runtime tersambung | Pesan baru tetap tersimpan setelah restart; pergantian native session tidak menghapus identitas/riwayat agent Ngertiin. | Inti | wajib | O3, O8 |
| H02 | Pemulihan setelah crash atau koneksi putus | Periksa status sesi/pekerjaan sebelum melanjutkan; tindakan yang hasilnya belum diketahui tidak diulang sembarangan. | Inti | wajib | O8 |
| H03 | Kontrol akses workspace/tools dan secret | Konfigurasi per agent membatasi resource yang benar; kredensial tidak menjadi teks percakapan atau file yang bebas dibaca agent. | Inti | wajib | N2, O2, O6 |
| H04 | Usage, kuota, dan sumber billing | Tampilkan data yang benar-benar dilaporkan; usage yang tidak tersedia tetap unknown, bukan nol atau unlimited. | Disarankan | optional, jika berkaitan dengan usage dari harness yang di integrasikan maka dapat di implementasikan | O2, O8 |
| H05 | Diagnostik dan perbaikan yang mudah | Pesan error menjelaskan perlu login, host mati, capability tidak ada, atau provider sedang gagal; log dukungan meredaksi secret. | Disarankan | wajib, | O8, O9 |
| H06 | Pengaturan bertahap yang sederhana | Pengaturan lanjutan dibuka bertahap pada panel Agent dan Settings umum. Creation memakai default yang sudah dipilih; aplikasi/folder/jadwal ditanyakan saat relevan. | Disarankan | Wajib. Tidak ada form teknis atau checklist personalisasi wajib. Pengguna bisa langsung memberikan tugas; koneksi/model/billing tidak berubah diam-diam. | N1, O1 |

## Tambahan Openbot dan scope yang tidak otomatis ikut

| ID | Kandidat tambahan | Ekspektasi / batas | Rekomendasi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| X01 | Marketplace skills / agent templates | Menemukan dan memasang paket dari katalog publik; library skill lokal tetap dapat berjalan tanpa marketplace. | Opsional | tunda | O7 |
| X02 | Voice input, TTS, dan panggilan suara | Berbicara dengan agent dan mendengar jawaban; tentukan dahulu apakah cukup dictation atau perlu panggilan real-time. | Opsional | tunda | N4, O1 |
| X03 | Banyak host dan akses harness laptop dari VPS | Menghubungkan host lain secara eksplisit; instalasi di VPS tidak otomatis mendeteksi CLI laptop. | Tunda | tunda | O9 |
| X04 | Downloader / manajer model lokal | Aplikasi mengunduh dan mengelola inference lokal; berbeda dari menghubungkan endpoint yang sudah ada pada B09. | Tunda | tunda | N4, O2 |
| X05 | Routing lanjutan, fallback, credential pool, Mixture of Agents | Strategi pemilihan model/akun dan gabungan hasil; perlu manfaat nyata untuk alur subscription-first sebelum dibawa penuh. | Opsional | tunda | N4, O2 |
| X06 | Desktop/mobile native Ngertiin | Tauri macOS ARM64 is implemented for development. NMA-066/NMA-067 desktop-rs foundation/components are Done under the 2026-11-08 owner acceptance decision, with remaining technical verification non-blocking. NMA-068 is Done for the implemented native workspace/conversation with bounded native/API evidence; NMA-069 is Done for native contextual workflows; NMA-070 is Done for native Computer/host lifecycle; NMA-071 is Done for integrated native development acceptance under the [focused November 9 scope](../development/nma-071-closure-scope-2026-11-09.md). Fresh-device distribution, other-platform clients and production release remain separate future scope. | Tunda for general release | Scoped development: Tauri active; desktop-rs integrated native development acceptance complete. General release deferred | N1, O1 |
| X07 | WhatsApp / Telegram / Slack / Discord / email sebagai kanal chat | Interaksi agent di kanal eksternal; scope Ngertiin sebelumnya mengecualikannya. | Tunda | tunda | N1, O4 |
| X08 | Kolaborasi banyak manusia, organisasi, dan RBAC tim | Mengundang manusia lain; berbeda dari grup satu pemilik dengan beberapa agent. | Tunda | tunda | N2, O4 |
| X09 | Hosting website, deploy, dan marketplace berbayar | Agent menerbitkan layanan/website serta transaksi platform; bukan prasyarat workspace agent personal. | Tunda | tunda | O3 |
| X10 | Nous Portal dan layanan akun/billing khusus Openbot | Coupling ke layanan produk lain tidak otomatis diadopsi bersama logic runtime. | Tunda | tunda | N1, N4 |

X06–X08 dan coupling Nous pada X10 mengangkat kembali area yang sebelumnya di luar scope. Keberadaan kode pada Openbot bukan keputusan mengaktifkannya di Ngertiin. Fitur hosting/pembayaran Openbot, kebijakan permission default-nya, atau layanan akun cloud-nya juga tidak otomatis diadopsi.

## Keputusan runtime/provider

Kolom Keputusan kamu menentukan scope runtime. Label Usulan posisi adalah konteks awal, bukan prioritas yang mengalahkan keputusan wajib. Dukungan tools/modalities/login/kuota tetap berbeda; setiap target wajib mendapat pembuktian pada tiketnya. Harness tersedia pada host backend; remote/multi-host tetap ditunda.

| ID | Runtime/provider | Usulan posisi | Pegangan transport | Ekspektasi koneksi | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- | --- |
| PR01 | ChatGPT / Codex | Target awal | Codex App Server; ACP melalui adapter bila sesuai. Public SIWC/Responses tetap kandidat bila model loop dibutuhkan langsung. | Plan dan/atau API key sesuai jalur yang dipilih. | wajib | O2, P1 |
| PR02 | Muse Code | Target awal | SDK resmi/MSP menjalankan Muse Code. ACP komunitas hanya alternatif yang perlu dibuktikan. | Plan Muse Code dan key adalah pilihan billing yang harus dibedakan. | wajib | O2, P2 |
| PR03 | Hermes | Tunda sesuai keputusan | Runtime Hermes ditunda. Dependency dan flow lama hanya dipertahankan jika masih relevan sebagai modul reuse; tidak menjadi otoritas atau fallback wajib. | Tidak masuk acceptance runtime aktif saat ini. | tunda | N4 |
| PR04 | Grok | Kandidat berikutnya | Jalur ACP yang diimplementasikan Openbot dapat menjadi pegangan. | Login akun atau API key sesuai dukungan CLI. | Tunda untuk sekarang | O2 |
| PR05 | OpenCode | Kandidat berikutnya | Jalur ACP; kemampuan model dan billing mengikuti akun/provider yang dipakai OpenCode. | Go/subscription dapat memakai key; OAuth tidak selalu berarti subscription. | Tunda untuk sekarang | O2 |
| PR06 | Claude Code | Opsional | SDK/native adapter seperti Openbot; metode autentikasi dipilih sesuai dukungan integrasi. | Jangan menjanjikan semua consumer plan sebagai metode login produk. | Tunda untuk sekarang | O2 |
| PR07 | Gemini, Cursor, Cline, dan custom ACP | Opsional | Tambahkan satu per satu berdasarkan capability/version; login headless/VPS tidak dianggap otomatis tersedia. | Ikuti metode login dan akses model masing-masing harness. | Tunda untuk sekarang | O2, P3 |

**ACP adalah salah satu protokol adapter, bukan syarat semua provider.** Runtime wajib saat ini hanya Codex/ChatGPT PR01 dan Muse Code PR02. Hermes PR03 tetap ditunda; Grok, OpenCode, Claude Code, Gemini, Cursor, Cline dan custom ACP PR04–PR07 ditunda. Native adapters memakai SDK/App Server/MSP yang sesuai. Login tiap provider dibuktikan pada host development; kompatibilitas VPS/headless tidak otomatis menjadi prasyarat. Kontrak adapter tetap dapat diperluas, tetapi implementasi generic ACP/custom runtime tidak wajib sekarang. Editor konfigurasi advanced B07 tetap opsional. Subscription tetap fokus utama; API key boleh dipilih bila didukung harness, tanpa fallback billing diam-diam.

## Fondasi implementasi

Bagian ini bukan menu tambahan untuk pengguna aplikasi, melainkan pekerjaan agar fitur yang dipilih dapat dipercaya.

| ID | Fondasi | Hasil yang dibutuhkan | Usulan | Keputusan kamu | Acuan |
| --- | --- | --- | --- | --- | --- |
| T01 | Satu otoritas lifecycle aplikasi | Satu pemilik admission, antrean, goals, pembatalan, dan keputusan recovery; harness punya inner execution yang batasnya jelas. | Inti | wajib | N4, O3, O8 |
| T02 | Kontrak adapter harness yang sama | Start/resume/prompt/events/stop/settings dinormalisasi, dengan capabilities eksplisit; ACP, App Server, MSP, dan HTTP dapat berbeda di bawahnya. | Inti | wajib | O2, P3 |
| T03 | Tools produk tersedia pada harness | Memory, goals, artifact, dan kolaborasi Ngertiin dapat dipanggil harness melalui jalur terstruktur seperti MCP; tidak bergantung parsing prose sebagai default. | Inti | wajib | O2, O7 |
| T04 | Posisi Hermes dan kontrak data baru | Audit dan bersihkan dependency/config/flow Hermes yang tidak relevan pada rancangan harness-first; tetapkan kontrak data baru tanpa engine lama sebagai fallback. | Cleanup sesuai keputusan | hapus dan bersihkan, jika emang sudah tidak relate | N4 |
| T05 | Host dan metode instalasi | Tentukan dukungan OS, binary vs container, folder kredensial, proses background, dan login VPS/headless untuk provider awal. | Perlu keputusan | focus pada development saat ini, instalasi pada device lain di putuskan / kerjakan pada akhir rangkaian implementasi | O9 |
| T06 | Verifikasi perilaku per runtime | Buktikan alur lengkap, crash/stop, isolasi DM/grup, goal offline, dan billing per harness; source tersedia bukan acceptance. | Inti | wajib | N4, O8 |

Otoritas lifecycle aplikasi berada pada Ngertiin; integrasi runtime Hermes PR03 ditunda. Kode/config/dependency Hermes yang tidak relevan dibersihkan setelah audit pengganti, tanpa engine lama sebagai fallback. NMA-047 menutup detail implementasi dan kontrak data baru. Tidak perlu kompatibilitas atau migrasi data development lama.

## Contoh bukti selesai setelah fitur dipilih

1. Install local/VPS → buka web → hubungkan satu harness → DM menghasilkan jawaban dan satu artifact.
2. Dua agent dengan runtime berbeda berkolaborasi di grup; author benar dan DM privat tidak ikut bocor.
3. Goal muncul otomatis dari percakapan, berlanjut ketika tab ditutup, lalu selesai dengan bukti atau melaporkan hambatan.
4. Stop run dan stop goal punya hasil berbeda yang jelas, termasuk setelah restart.
5. Crash di tengah pekerjaan → recovery membaca status/receipt dan tidak menggandakan tindakan yang hasilnya belum diketahui.
6. Login berhasil, model tersedia, inference selesai, dan sumber billing dibuktikan terpisah; gangguan sementara tidak otomatis menjadi login ulang atau pindah biaya.

Ini contoh acceptance untuk menyusun tiket setelah pemilahan, bukan hasil pengujian yang sudah dijalankan.

## Pegangan source dan hubungan dokumentasi

Snapshot utama Openbot: `01e4b18e238e5de72a3570162c9f4275bb585786`, diperiksa pada 2026-10-30. Source menunjukkan pola implementasi; belum ada klaim bahwa seluruhnya kompatibel atau terverifikasi di Ngertiin.

| Kode | Pegangan |
| --- | --- |
| O1 | [Openbot README dan inventaris fitur](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/README.md) |
| O2 | [Providers](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/providers.md); [provider drivers](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/provider-drivers.ts); [AgentClient](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent-client.ts); [ACP client](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/acp-client.ts) |
| O3 | [Agents](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/agents.md); [AgentService](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent-service.ts); [turn lifecycle](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/turn-lifecycle.ts) |
| O4 | [Shared channels dan messaging](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/channels-and-messaging.md) |
| O5 | [Routine scheduler](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/routine-scheduler.ts); [routines pada arsitektur agent](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/agents.md) |
| O6 | [Browser](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/browser.md); [struktur dan state ownership](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/structure.md); [workspace sandbox](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/workspace-sandbox.ts) |
| B1 | [browser-use MCP](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/mcp/server.py), [session](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/browser/session.py), [CLI](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/cli.py), [dependencies](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/pyproject.toml); commit `b49a68e4060acb226da8f784194fef301c53a6d7`, source version `0.13.14`, diamati pada 2026-10-31. Historical browser-source observation; current Cua evidence is maintained in the shared-machine guide. |
| O7 | [Skills/plugins](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/skills-and-plugins.md); [memory/tool integration](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/providers.md) |
| O8 | [Boot recovery](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/agent/boot-recovery.ts); [mailbox store](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/src/backend/mailbox-store.ts); [provider diagnostics/settings](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/providers.md) |
| O9 | [Self-hosted server](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/self-hosted-server.md); [repository structure](https://github.com/nightly-labs/openbot/blob/01e4b18e238e5de72a3570162c9f4275bb585786/docs/architecture/structure.md) |
| P1 | [Codex App Server](https://learn.chatgpt.com/docs/app-server); [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) |
| P2 | [Muse SDK resmi](https://github.com/meta-models/muse-code-sdk/blob/33110fe570f9e71da4869beab06b803cb3fa9242/clients/sdk-ts/README.md); [Muse subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions) |
| P3 | [Spesifikasi ACP](https://github.com/agentclientprotocol/agent-client-protocol/tree/ac765763d483dd92fb5b57aec154d45586be2717/docs/protocol/v1) |
| N1 | [01 · Arah produk dan scope harness-first](../../PRODUCT.md) |
| N2 | [02 · Agent, percakapan, grup dan flow kontrol](conversations.md) |
| N3 | [03 · Goals otomatis, Routine dan proaktivitas](goals-routine.md) |
| N4 | [Architecture](../architecture/overview.md) |

Dokumen N1–N3 telah diselaraskan dengan keputusan ini. N4 adalah arsip rencana Hermes/106-family sebelumnya dan bukan target parity atau dependency aktif. Scope sekarang mengikuti kolom Keputusan kamu, termasuk klarifikasi dan reset data development. Pemetaan seluruh 83 baris keputusan ke pemilik backlog atau disposisi Opsional/Tunda ada pada roadmap aktif.
