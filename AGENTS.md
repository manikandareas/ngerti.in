# Status repository

Ngertiin adalah workspace agent persisten berbasis web. Lanjutkan repository ini mengikuti keputusan **harness-first** di Notion pada 30 Oktober 2026. Implementasi yang ada menjadi baseline untuk diaudit, direuse, atau dibersihkan; keputusan arsitektur baru bukan bukti implementasi atau acceptance sudah selesai.

## Acuan dokumentasi utama

1. Sebelum merancang atau mengimplementasikan perubahan produk/runtime, baca [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), [scope produk](https://app.notion.com/p/402abdd61873816e871ae24804345b56), dan dokumen anak yang relevan. Kolom `Keputusan kamu` pada [matriks fitur](https://app.notion.com/p/409abdd61873813284bbf75698073d8e) menentukan Wajib/Opsional/Tunda; rekomendasi awal bukan keputusan final.
2. Ambil scope, acceptance, dan dependensi dari tiket di [backlog NMA](https://app.notion.com/p/116e1edcee864b5da91887466d728aac). Gunakan `Rencana: Harness-first` untuk pekerjaan aktif; baca `Depends on` sebelum mulai. Tiket `Historis` dan `Ditunda` bukan antrean aktif atau prasyarat tersembunyi.
3. Untuk urutan kerja, ikuti [roadmap Engine/API → UI → Instalasi](https://app.notion.com/p/402abdd6187381ceaa4fe40ebf41001c). Untuk boundary runtime/API, baca [arsitektur aktif](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f); untuk pembuktian dan Done, baca [acceptance dan gerbang kesiapan](https://app.notion.com/p/402abdd61873812a97a9f41032dd854f).

Instruksi eksplisit pengguna dan keputusan terbaru di Notion mengungguli panduan produk lama di repo. Riset lokal, dokumen V1, rancangan Hermes-first/106-family, dan hasil Done historis adalah bukti pendukung untuk scope lamanya. Jika Notion tidak dapat diakses, nyatakan keterbatasannya dan lanjutkan hanya scope yang sudah jelas; jangan menganggap salinan lama sebagai keputusan terkini.

## Arsitektur dan scope aktif

- **Satu otoritas lifecycle aplikasi di Ngertiin** mengelola identity agent/thread/goal/Routine, admission, queue, domain persistence, event publication, cancellation intent, dan keputusan recovery. Harness memiliki inner agent/model/tool loop; adapter menangani protokol, proses, capabilities, dan native-session binding. Backend API dan UI mengikuti state otoritatif ini.
- Runtime wajib saat ini hanya **Codex/ChatGPT** melalui App Server dan **Muse Code** melalui SDK/MSP sesuai pembuktian adapter. ACP adalah salah satu transport, bukan kewajiban membangun adapter ACP generik. Hermes, Grok, OpenCode, Claude Code, Gemini, Cursor, Cline, dan custom ACP ditunda.
- Hermes tidak menjadi engine wajib atau fallback. Audit modul lama dan bersihkan kode/config/docs/tooling yang tidak relevan setelah penggantinya tersedia; reuse yang relevan boleh dipertahankan dengan boundary jelas. Gunakan satu jalur lifecycle aplikasi tanpa engine lama yang paralel; rollback memakai versi Git dan backup terverifikasi.
- Subscription menjadi fokus; API key tetap pilihan jika didukung harness. Bedakan metode autentikasi dari sumber billing, dan jangan beralih dari subscription ke billing API key secara diam-diam. Capabilities, minimum/tested versions, dan state unsupported/unknown ditetapkan per harness.
- Produk-tools memakai jalur terstruktur seperti MCP sesuai adapter, dengan scope dan akses resource divalidasi server-side. Periksa kembali perubahan grant/capability sebelum dispatch. Rekonsiliasi status/receipt saat recovery; tindakan eksternal dengan hasil unknown tidak diulang secara buta. Bedakan permintaan stop dari konfirmasi native stop.
- Tobi dan primary DM tersedia otomatis. Agent dapat dibuat/diubah melalui percakapan dan produk-tools. Identitas agent persisten sama di DM/grup; native session, transcript, dan konteks privat tetap terpisah. Grup berisi satu pemilik manusia dan beberapa agent miliknya; routing berbasis model memilih penjawab tanpa pass/skip bubbles dari agent lain.
- Goals ditangkap dan diperbarui otomatis dari percakapan tanpa formulir atau tombol aktivasi wajib. Jadwal/pemeriksaan disebut **Routine**. Kelanjutan berjalan saat tab tertutup selama backend dan host harness tetap hidup. Stop run berbeda dari pause/stop goal beserta kelanjutannya; jangan menambahkan universal approval atau pembatas inisiatif baru tanpa kebutuhan yang disepakati.
- Browser agent memakai lingkungan browser yang sama dengan tampilan visual VNC; general desktop/computer use dan aplikasi native ditunda. **Composio** dipakai untuk koneksi aplikasi. Skills bawaan harness terpisah dari skills aplikasi; agent hanya membuat/memperbaiki paket skill milik aplikasi.
- Fitur Opsional memerlukan keputusan eksplisit sebelum menjadi komitmen wajib; fitur Tunda tetap di luar implementasi aktif. Source upstream yang tersedia tidak otomatis memperluas scope.

## Urutan implementasi dan data

- Kerjakan **engine/backend → gate API NMA-060 Done → UI NMA-061–063 → instalasi lokal NMA-064**. Verifikasi gate di Notion sebelum mulai UI. Installer/perangkat lain dikerjakan terakhir; VPS opsional. NMA-051 untuk runtime tambahan ditunda dan bukan dependency aktif.
- NMA-047 menetapkan seam adopsi/port Openbot, bahasa/proses/storage, dan kontrak domain awal berdasarkan bukti kompatibilitas. Pilihan teknis yang belum ditutup bukan keputusan final yang boleh diasumsikan dari arsitektur lama.
- Gunakan HTTP/events/native clients atau test clients/CLI/headless scripts untuk membuktikan backend sebelum UI. Perubahan boundary API setelah gate memerlukan verifikasi ulang sebelum UI menggunakannya.
- Data development lama boleh direset dan tidak memerlukan jalur migrasi/kompatibilitas. Batasi reset pada data development yang diperlukan; pertahankan pekerjaan pengguna yang tidak terkait dan bukti historis. Persistence, recovery, dan isolasi data baru saat operasi normal tetap wajib.

## Adopsi source dan verifikasi

- Openbot menjadi pegangan utama source/logic/flow aplikasi dan runtime. Baca exact module/flow pada revision yang dirujuk tiket dan [pegangan source](https://app.notion.com/p/402abdd6187381329ecfccbc490cff2c); catat file/module/commit, alasan reuse, perubahan lokal, versi dependency, dan cara upgrade. Pengurusan lisensi ditangani pengguna terpisah; provenance tetap dicatat. Referensi Hermes/Nakama/Rakazo lama dapat dipakai sebagai pembanding terarah.
- Bedakan keputusan produk, source observed, contract/fixture tested, native/live verified, API readiness, UI acceptance, dan distribusi. Login, model discovery, completed inference, dan useful product-tool round trip adalah bukti berbeda. Catat setup/command, versi/config, denominator, pass/fail/skip, unknown outcomes, dan keterbatasan.
- Tandai tiket Done hanya setelah scope, acceptance, dan dependency terpenuhi dengan bukti yang dapat ditelusuri. Source tersedia, fixture lulus, atau Done historis tidak membuktikan acceptance baru; API siap belum berarti UI, installer, atau produksi siap.

## Engine and backend language

Write all engine and backend code and authored text in English: function, variable, class, module, and schema names; API fields and authored request/response bodies; messages, errors, logs, comments, docstrings, and agent prompts/instructions. Apply this rule to all new or modified engine/backend code. Preserve user-provided content in its original language.

## Penelusuran kode

Utamakan MCP knowledge graph: `search_graph` → `trace_path` → `get_code_snippet` → `query_graph` → `get_architecture`. Gunakan `rg`/pencarian file untuk literal, konfigurasi, non-code, atau ketika graph tidak tersedia/tidak memadai.
