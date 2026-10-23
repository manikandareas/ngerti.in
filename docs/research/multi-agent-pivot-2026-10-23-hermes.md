# Hermes Agent sebagai fondasi pivot multi-agent Ngertiin

Tanggal pemeriksaan: 23 Oktober 2026. Snapshot sumber: [`7489b22af47ce91b366dde81d5831ea422577498`](https://github.com/NousResearch/hermes-agent/commit/7489b22af47ce91b366dde81d5831ea422577498). Pemeriksaan berupa pembacaan source, dokumentasi, dan test source melalui GitHub connector; tidak menjalankan Hermes, model, atau test suite. Semua kesimpulan runtime di bawah adalah kontrak yang terlihat di source, bukan hasil uji langsung.

## Kesimpulan

Hermes sekarang merupakan kandidat **fondasi produk sekaligus runtime**, bukan hanya referensi CLI atau subagent. Snapshot ini sudah mempunyai Bot Mode: persistent agent profiles, agent creator, SOUL, model terpisah, skills/tools/MCP, grup, dan komunikasi antarbot. Bahkan tersedia dua generasi implementasi grup: orchestrator lama di renderer Desktop dan orchestrator baru yang dimiliki gateway. Untuk Ngertiin berbasis web, jalur gateway adalah kandidat yang lebih tepat untuk diuji; jangan menyalin orchestrator renderer lalu mengandalkan tab pengguna tetap terbuka.

Dasar keputusan ini adalah keberadaan kode RPC grup, durable room log, policy turn, dan task driver, bukan klaim README saja. Namun ini **belum membuktikan SaaS multi-tenant siap pakai**, dan parity antara Desktop, gateway canonical groups, serta seluruh kemampuan Bot Mode belum diuji.

## 1. Model agent: persistent profile, bot, dan subagent berbeda

`Profile` adalah home directory persisten; konfigurasi, SOUL, skills, memori, session, cron, dan state berada di sana. `Bot` menambahkan metadata roster dan canonical Bot Chat pada profile. `Subagent` adalah child untuk suatu pekerjaan dengan percakapan baru. Karena itu “buat agent” untuk pengguna sebaiknya mengikuti profile/Bot, sedangkan delegation tetap menjadi alat internal agent. [Dokumentasi profiles](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/profiles.md).

Source `hermes_cli/profiles.py` menetapkan direktori awal seperti `memories`, `sessions`, `skills`, `workspace`, `cron`, dan `home`; clone config mencakup `config.yaml`, `.env`, `SOUL.md`, serta curated memory. Ini menunjukkan identitas bukan sekadar satu system prompt dalam tabel. [Implementasi profile](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/profiles.py).

Bot Mode menawarkan nama/title/description, avatar, model-provider, custom SOUL, dan pengaktifan per skill/toolset/MCP server. Bot memiliki chat kanonik yang dipertahankan, sedangkan pekerjaan sampingan dapat mempunyai session lain. Ini paling dekat dengan permintaan produk pengguna. [Bot Mode](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/bot-mode.md).

## 2. Grup: alur konkret yang bisa diadopsi

Jalur gateway mempunyai pemisahan modul yang jelas:

| Lapisan | Source dan tanggung jawab |
|---|---|
| RPC | [`tui_gateway/methods_groups.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tui_gateway/methods_groups.py): capabilities, create, send, state, log, stop, retry, approve, replication dan peer registration. |
| Durable room | [`gateway/hosted_rooms.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_rooms.py): identitas room, SQLite append-only event log, actor types, authority epoch, batas penyimpanan. |
| Policy | [`gateway/hosted_room_discussion.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_discussion.py): roster, mentions, watermarks, prompt delta, keputusan next task dan publikasi. |
| Execution state | [`gateway/hosted_room_driver.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_driver.py): lease, queued/running/settled/failed/cancelled/indeterminate/deferred/stopping, fencing dan recovery. |
| Coordinator | [`tui_gateway/hosted_room_service.py`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tui_gateway/hosted_room_service.py): menyambungkan room, policy, runtime, profile dan peer transport. |

Alur policy yang terlihat di `plan_next_task`:

1. Pesan pengguna masuk ke log dengan thread dan event identity.
2. Putaran pertama memilih agent yang di-mention; tanpa mention atau dengan `@all`/`@everyone`, semua anggota menjadi kandidat.
3. Engine menghasilkan paling banyak satu task berikutnya; anggota berjalan secara serial pada jalur Discussion ini.
4. Agent menerima delta pesan berdasarkan watermark miliknya, lalu memberi hasil atau `(pass)`.
5. Putaran lanjutan hanya membangunkan rekan yang disebut oleh agent dan belum membalas setelah mention tersebut. Pesan biasa tanpa handoff tidak otomatis membangunkan putaran baru.
6. Konstanta snapshot membatasi roster Discussion menjadi 2–6 anggota, 3 putaran, dan 10 pesan agent. Jangan menyamakan batas generic room storage (128 anggota) dengan kapasitas execution policy ini.

Sumber: [`resolve_mentions`, `_unaddressed_member_mentions`, `plan_next_task`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_discussion.py#L321).

**Implikasi:** multi-agent conversational UX tidak membutuhkan router LLM untuk setiap giliran. Identifikasi penerima, jadwal, dedup, dan batas percakapan ditangani kode; agent memutuskan isi kontribusi dan siapa yang perlu dilibatkan. Aturan ini sudah cukup konkret untuk menjadi baseline Ngertiin.

## 3. Mengapa jangan mencampur dua implementasi grup

Jalur lama di [`group-rounds.ts`](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/apps/desktop/src/plugins/hermes-bots/group-rounds.ts) juga memakai bounded round robin, persistent per-group sessions, deterministic mention parsing, holds, dan pass. Tetapi logika berjalan dalam plugin renderer, dengan model penyimpanan dan sinkronisasi berbeda.

Catatan canonical Desktop menyebut UI gateway group masih text-only, anggota dari otoritas lokal yang sama, serta tidak menawarkan rename/disband/membership editing/attachments pada workspace tersebut. Kode backend sudah mempunyai rename, disband, attachment validation, dan peer target contracts. Ini perbedaan **exposure UI vs kemampuan backend**; jangan menggabungkannya menjadi satu klaim “semua fitur sudah siap”. Catatan yang sama menyebut crash-safe group-send journaling native belum diimplementasikan. [Batas canonical UI](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/apps/desktop/docs/canonical-groups.md).

## 4. Durability, stop, dan kegagalan

Room driver memakai execution/cancel generation serta gateway/process/lease identity untuk menolak commit dari worker lama. `recover_room` memindahkan running attempt yang ditinggalkan menjadi `indeterminate`; source sengaja tidak langsung mengulang side effect yang belum diketahui hasilnya. RPC retry dan approval membawa task/member/generation/request identity. Ini pola penting untuk diadopsi bersama scheduler, bukan hanya menyalin prompt grup. [Driver recovery](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_driver.py#L829), [RPC](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tui_gateway/methods_groups.py).

Test source mencakup dua contender satu pemenang, stale lease, cancellation vs late success, indeterminate recovery, idempotent admission/settlement, mention handoff, watermark, bounded rounds, dan publication crash gap. Itu bukti engineering intent dan cakupan kasus; **test belum dijalankan dalam riset ini**. [Driver tests](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tests/gateway/test_hosted_room_driver.py), [Discussion tests](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tests/gateway/test_hosted_room_discussion.py).

Delegated child berbeda lagi: dokumentasinya secara eksplisit menyatakan background result durability bukan durable execution; restart tidak melanjutkan child yang sedang berjalan. Jadi jangan menggunakan `delegate_task` sebagai pengganti seluruh persistent group execution. [Delegation lifetime](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/delegation.md).

## 5. Tools, MCP, skills dan batas isolasi

Skills sudah menggunakan SKILL.md dan progressive disclosure: list mengeluarkan nama/deskripsi, view membuka isi dan referensi. Ini dapat diadopsi sebagai format langsung, termasuk katalog pengguna per profile. [Skills source](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/skills_tool.py).

MCP mendukung transport stdio/HTTP, discovery, per-server filtering, serta resources/prompts. Registration source memiliki include/exclude, metadata trust tier, collision resolution, dan schema cache. Karena itu fondasi MCP sudah jauh melampaui menyimpan URL server pada agent. [MCP guide](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/mcp.md), [registration source](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/mcp_tool_registration.py).

Profile memisahkan state, **bukan sandbox filesystem**. Dokumen profiles menyatakan local backend tetap mempunyai akses akun OS; SOUL bukan enforcement boundary. Maka inferensi arsitektur untuk Ngertiin adalah satu runtime/container/sandbox berotoritas jelas per tenant atau sesuai isolation model yang diuji. “Satu profile per user” saja belum merupakan bukti tenant isolation. Kredensial, MCP subprocess, skill scripts, private memory, dan shared group artifacts perlu diuji lintas tenant. [Profiles vs sandboxing](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/profiles.md).

## 6. Cara adopsi yang disarankan

Rekomendasi riset: **uji Hermes sebagai upstream runtime dan canonical group engine terlebih dahulu**, dengan adapter produk Ngertiin yang tipis. Jangan mulai dengan menyalin seluruh model execution ke runtime buatan sendiri. Fork atau vendor hanya bagian yang terbukti memerlukan perubahan, pin commit, dan pertahankan mapping patch terhadap upstream.

Urutan pembuktian:

1. Buat tiga persistent profiles dengan SOUL, model, skill, dan tool access berbeda.
2. Jalankan percakapan user → researcher → writer → reviewer melalui canonical group RPC; verifikasi hanya mention yang memicu putaran lanjutan.
3. Tutup client web, restart gateway saat pekerjaan berjalan, lalu amati recovery, status indeterminate, dan larangan replay otomatis side effect.
4. Uji group-private context vs DM-private context dan dua tenant dengan nama agent sama.
5. Uji satu MCP server dan satu skill script di sandbox target Ngertiin, termasuk pemisahan secret dan filesystem.
6. Baru tentukan apakah integrasi upstream penuh, fork sempit, atau port modul murni policy/state lebih murah secara operasional.

Tidak ada alasan dari riset ini untuk mempertahankan arsitektur lama Ngertiin bila menghambat langkah tersebut. Tetapi pilihan wholesale replacement memerlukan pembuktian host deployment dan tenant boundary; kecocokan UI saja belum cukup.

## 7. Lisensi dan hal yang belum terjawab

File lisensi snapshot adalah MIT dengan copyright Nous Research 2025. File tersebut mengizinkan penggunaan, modifikasi dan distribusi dengan mempertahankan notice; dependency, aset, plugin, serta distribusi turunan tetap perlu inventory saat benar-benar diadopsi. Ini pembacaan file lisensi, bukan audit legal seluruh dependency. [LICENSE](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/LICENSE).

Belum dibuktikan: E2B compatibility end-to-end, performa banyak tenant, operational SLO, deployment web tanpa Desktop, cakupan authorization beberapa manusia dalam satu room, parity canonical UI dengan legacy groups, dan keberhasilan test pada pinned revision. Snapshot ini sudah cukup untuk menempatkan Hermes pada shortlist utama dan menyusun prototype acceptance yang spesifik; belum cukup untuk menyebut implementasi produksi selesai.
