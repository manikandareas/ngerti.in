# Status repository

Ngertiin sedang pivot ke multi-agent persisten dan proaktif. Lanjutkan repository ini. Implementasi multi-agent terbaru adalah satu-satunya jalur produk/runtime; jangan menambahkan mode pivot/legacy atau fallback engine lama. Rollback memakai versi Git dan backup terverifikasi, bukan dua engine aktif. Pertahankan data pengguna, migrasi historis, dan bukti verifikasi.

- Arsitektur single-agent dan batas V1 lama adalah konteks historis, bukan kewajiban kompatibilitas. Gunakan kembali bagian yang cocok; perubahan ini bukan izin menghapus data atau pekerjaan pengguna.
- Produk mendukung DM pengguna dengan satu agent dan grup berisi pengguna yang sama bersama beberapa agent. Agent memiliki identitas persisten yang sama di DM/grup; riwayat percakapannya terpisah. Kolaborasi dengan manusia lain di luar cakupan saat ini.
- Goals dikenali, dibuat, dan diperbarui agent secara otomatis dari percakapan, tanpa formulir atau tombol aktivasi wajib. Goals mengarahkan pekerjaan proaktif, termasuk saat pengguna offline.
- Acuan: Hermes untuk engine, kelanjutan goals, dan pemicu proaktif; Muse untuk perilaku Goals; Nakama untuk pengalaman agent/grup; Rakazo sebagai pembanding handoff dan recovery. Ngertiin tetap produk independen, bukan kelanjutan fork seluruh aplikasi.
- Saat mengadopsi modul, ikuti source upstream yang dipahami, catat versi/lisensi, dan buktikan perilakunya. Pilihan integrasi final serta automatic goal capture belum terbukti; jangan menganggap semua fitur upstream otomatis tersedia.
- Hindari layer kebijakan inisiatif atau pembatas otonomi tambahan tanpa referensi dan kebutuhan yang disepakati. Gunakan satu pemilik lifecycle eksekusi, session, dan recovery.
- Aturan pivot di atas menggantikan rekomendasi fork dan batas produk lama yang bertentangan dalam dokumentasi/Notion. Pertahankan bukti historis; bedakan hasil observasi, proposal, dan keputusan yang sudah disepakati.

## Acuan dokumentasi utama

- Sebelum merancang atau mengimplementasikan pivot, baca [Ngertiin Multi Agent di Notion](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) dan dokumen anak yang relevan. Ini sumber utama keputusan produk, rancangan engine, referensi, tahapan, dan acceptance; bedakan keputusan yang disepakati dari proposal teknis yang masih menunggu spike/ADR.
- Ambil scope, acceptance criteria, dan urutan dependensi dari [backlog NMA dan Kanban](https://app.notion.com/p/116e1edcee864b5da91887466d728aac). Baca tiket beserta `Depends on` sebelum mulai; tandai Done hanya setelah acceptance dan bukti verifikasi terpenuhi.
- [Riset lokal](docs/research/multi-agent-pivot-2026-10-23.md), dokumen V1, dan Notion lama adalah bukti pendukung/historis. Jika bertentangan, ikuti keputusan pivot terbaru di Notion utama atau instruksi eksplisit pengguna. Jika Notion tidak dapat diakses, nyatakan keterbatasannya; jangan menganggap salinan lama sebagai keputusan terkini.

## Engine and backend language

Write all engine and backend code and authored text in English: function, variable, class, module, and schema names; API fields and authored request/response bodies; messages, errors, logs, comments, docstrings, and agent prompts/instructions. Apply this rule to all new or modified engine/backend code. Preserve user-provided content in its original language.

## Penelusuran kode

Utamakan MCP knowledge graph: `search_graph` → `trace_path` → `get_code_snippet` → `query_graph` → `get_architecture`. Gunakan `rg`/pencarian file untuk literal, konfigurasi, non-code, atau ketika graph tidak tersedia/tidak memadai.
