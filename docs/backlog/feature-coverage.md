# Feature ownership

All 83 decision identities are assigned or explicitly parked. Shared-machine and Tauri development amendments follow the current product and architecture guides; original browser labels do not create a second active controller.

| ID | Fitur/keputusan | Scope | Engine/backend | UI/validasi UI | Distribusi/disposisi |
| --- | --- | --- | --- | --- | --- |
| A01 | Instalasi lokal | Wajib | — | — | [NMA-064 · Instalasi lokal dan distribusi setelah produk siap](NMA-064.md) |
| A02 | Instalasi VPS / server pribadi | Opsional | — | — | Diparkir sesuai matriks |
| A03 | Web responsif berpusat pada percakapan | Wajib | [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md), [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md), [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
| A04 | Tetap bekerja saat tab ditutup | Wajib | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md), [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | — | — |
| A05 | Akses pribadi yang terlindungi | Tunda | — | — | Diparkir sesuai matriks |
| B01 | Deteksi harness terpasang | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| B02 | Hubungkan subscription | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| B03 | Pilihan API key tetap tersedia | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| B04 | Pilih harness, akun, model, dan reasoning per agent | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md), [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| B05 | Status koneksi dan perbaikan yang jelas | Opsional | — | — | Diparkir sesuai matriks |
| B06 | Kemampuan sesuai harness | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md), [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| B07 | Konfigurasi CLI / custom ACP | Opsional | — | — | Diparkir sesuai matriks |
| B08 | Bantuan instalasi dan update harness | Opsional | — | — | Diparkir sesuai matriks |
| B09 | Endpoint API khusus dan model lokal | Tunda | — | — | Diparkir sesuai matriks |
| C01 | Tobi dan DM awal otomatis | Wajib | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C02 | Pembuatan cepat dan personalisasi agent lewat percakapan | Wajib | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md), [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C03 | Identitas agent persisten | Wajib | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C04 | DM persisten per agent | Wajib | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md), [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C05 | Streaming jawaban dan aktivitas | Wajib | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C06 | Antrean saat agent sibuk | Wajib | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C07 | Stop pekerjaan dan arahan tambahan | Kontrol wajib; tombol opsional | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| C08 | Context meter dan compaction | Opsional | — | — | Diparkir sesuai matriks |
| C09 | Pencarian dan pengambilan riwayat | Opsional | — | — | Diparkir sesuai matriks |
| C10 | Cabang percakapan / fork sesi | Opsional | — | — | Diparkir sesuai matriks |
| D01 | Grup satu pengguna dan beberapa agent | Wajib | [NMA-056 · Grup, model-based routing, handoff dan HITL API](NMA-056.md), [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| D02 | Mention dan routing percakapan | Wajib | [NMA-056 · Grup, model-based routing, handoff dan HITL API](NMA-056.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| D03 | Handoff, pembagian tugas, dan review | Wajib | [NMA-056 · Grup, model-based routing, handoff dan HITL API](NMA-056.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| D04 | Subagent sementara | Opsional | — | — | Diparkir sesuai matriks |
| D05 | Private DM/group context and shared machine files | Required | [NMA-056](NMA-056.md); [current architecture](../architecture/overview.md) | [NMA-062](NMA-062.md) | Logical metadata remains scoped; working files intentionally shared |
| E01 | Goal ditangkap otomatis dari chat | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E02 | Banyak goal persisten | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E03 | Kelanjutan pekerjaan otonom | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E04 | Jadwal, pengingat, dan pemeriksaan berkala | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E05 | Pemicu event / webhook | Opsional | — | — | Diparkir sesuai matriks |
| E06 | Daftar goals, progres, dan bukti | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E07 | Pause / stop goal berbeda dari stop run | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| E08 | Quiet mode dan pemberitahuan relevan | Wajib | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F01 | Logical workspace and shared working root | Required | [NMA-054](NMA-054.md); [Cua amendment](../architecture/shared-machine-cua-plan-2026-11-04.md) | [NMA-062](NMA-062.md), Library | Shared files; scoped saved-artifact metadata |
| F02 | Lampiran dan artifact | Wajib | [NMA-054 · Workspace, lampiran, artifact dan native coding tools API](NMA-054.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F03 | Baca, ubah, dan cari file | Wajib | [NMA-054 · Workspace, lampiran, artifact dan native coding tools API](NMA-054.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F04 | Terminal, eksekusi kode, dan Git | Wajib | [NMA-054 · Workspace, lampiran, artifact dan native coding tools API](NMA-054.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F05 | Riset web dengan sumber | Wajib | [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F06 | Persistent shared-machine browser | Required | [NMA-058 original scope](NMA-058.md); [Cua amendment](../architecture/shared-machine-cua-plan-2026-11-04.md) | [NMA-062](NMA-062.md); [Computer verification](../verification/shared-machine/README.md) | Local shared machine |
| F07 | Shared Linux desktop and human takeover | Required by 2026-11-04 amendment | [Cua lifecycle/tools/input ownership](../architecture/shared-machine-cua-plan-2026-11-04.md) | [Computer verification](../verification/shared-machine/README.md) | Remote enrollment and general native-client release deferred |
| F08 | MCP dan koneksi aplikasi | Wajib | [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F09 | Pemahaman gambar dan video | Wajib | [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| F10 | Generasi dan edit gambar | Opsional | — | — | Diparkir sesuai matriks |
| F11 | Pembuatan dokumen dan spreadsheet | Opsional | — | — | Diparkir sesuai matriks |
| F12 | Preview hasil web/aplikasi | Opsional | — | — | Diparkir sesuai matriks |
| G01 | Memory jangka panjang sesuai scope | Wajib | [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| G02 | Lihat, koreksi, dan hapus memory | Wajib | [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| G03 | Skills per agent | Wajib | [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| G04 | Agent membuat dan memperbaiki skill | Wajib | [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | — |
| G05 | Import/export konfigurasi agent | Tunda | — | — | Diparkir sesuai matriks |
| H01 | Riwayat produk dan sesi runtime tersambung | Wajib | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md), [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md), [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md), [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | — |
| H02 | Pemulihan setelah crash atau koneksi putus | Wajib | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md), [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md), [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
| H03 | Kontrol akses workspace/tools dan secret | Wajib | [NMA-047 · Fondasi harness-first, kontrak domain dan pensiun runtime lama](NMA-047.md), [NMA-054 · Workspace, lampiran, artifact dan native coding tools API](NMA-054.md), [NMA-058 · Browser-use MCP, VNC dan browser-session API](NMA-058.md), [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md), [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md) | [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
| H04 | Usage, kuota, dan sumber billing | Opsional | — | — | Diparkir sesuai matriks |
| H05 | Diagnostik dan perbaikan yang mudah | Wajib | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md), [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md), [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
| H06 | Pengaturan bertahap yang sederhana | Wajib | [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md), [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
| X01 | Marketplace skills / agent templates | Tunda | — | — | Diparkir sesuai matriks |
| X02 | Voice input, TTS, dan panggilan suara | Tunda | — | — | Diparkir sesuai matriks |
| X03 | Banyak host dan akses harness laptop dari VPS | Tunda | — | — | Diparkir sesuai matriks |
| X04 | Downloader / manajer model lokal | Tunda | — | — | Diparkir sesuai matriks |
| X05 | Routing lanjutan, fallback, credential pool, Mixture of Agents | Tunda | — | — | Diparkir sesuai matriks |
| X06 | Native clients | General release deferred; macOS ARM64 development exception implemented | [Tauri host](../architecture/tauri-development.md) | Shared web client | [NMA-064](NMA-064.md) remains open for fresh-device distribution |
| X07 | WhatsApp / Telegram / Slack / Discord / email sebagai kanal chat | Tunda | — | — | Diparkir sesuai matriks |
| X08 | Kolaborasi banyak manusia, organisasi, dan RBAC tim | Tunda | — | — | Diparkir sesuai matriks |
| X09 | Hosting website, deploy, dan marketplace berbayar | Tunda | — | — | Diparkir sesuai matriks |
| X10 | Nous Portal dan layanan akun/billing khusus Openbot | Tunda | — | — | Diparkir sesuai matriks |
| PR01 | ChatGPT / Codex | Wajib | [NMA-049 · Adapter native Codex / ChatGPT](NMA-049.md) | — | — |
| PR02 | Muse Code | Wajib | [NMA-050 · Adapter Muse Code melalui SDK/MSP](NMA-050.md) | — | — |
| PR03 | Hermes | Tunda | — | — | Diparkir sesuai matriks |
| PR04 | Grok | Tunda | — | — | [NMA-051 · Ditunda · Claude Code dan runtime ACP tambahan](NMA-051.md) · Rencana Ditunda; bukan prasyarat |
| PR05 | OpenCode | Tunda | — | — | [NMA-051 · Ditunda · Claude Code dan runtime ACP tambahan](NMA-051.md) · Rencana Ditunda; bukan prasyarat |
| PR06 | Claude Code | Tunda | — | — | [NMA-051 · Ditunda · Claude Code dan runtime ACP tambahan](NMA-051.md) · Rencana Ditunda; bukan prasyarat |
| PR07 | Gemini, Cursor, Cline, dan custom ACP | Tunda | — | — | [NMA-051 · Ditunda · Claude Code dan runtime ACP tambahan](NMA-051.md) · Rencana Ditunda; bukan prasyarat |
| T01 | Satu otoritas lifecycle aplikasi | Wajib | [NMA-047 · Fondasi harness-first, kontrak domain dan pensiun runtime lama](NMA-047.md) | — | — |
| T02 | Kontrak adapter harness yang sama | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md) | — | — |
| T03 | Tools produk tersedia pada harness | Wajib | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md), [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | — | — |
| T04 | Posisi Hermes dan kontrak data baru | Cleanup sesuai relevansi | [NMA-047 · Fondasi harness-first, kontrak domain dan pensiun runtime lama](NMA-047.md) | — | — |
| T05 | Host dan metode instalasi | Dev dahulu; installer terakhir | [NMA-047 · Fondasi harness-first, kontrak domain dan pensiun runtime lama](NMA-047.md) | — | [NMA-064 · Instalasi lokal dan distribusi setelah produk siap](NMA-064.md) |
| T06 | Verifikasi perilaku per runtime | Wajib | [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md) | [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | — |
