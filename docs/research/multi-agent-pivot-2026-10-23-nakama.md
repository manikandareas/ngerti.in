# Nakama: audit source untuk pivot multi-agent Ngertiin

Tanggal pemeriksaan: 23 Oktober 2026. Snapshot: [`ac0643f8196fdf9133e66f5a13eef86103c45d0c`](https://github.com/ahmadrosid/nakama/commit/ac0643f8196fdf9133e66f5a13eef86103c45d0c), commit 22 Oktober 2026 18:46 UTC. Metode: membaca source, dokumentasi, dan test lewat GitHub connector; tidak menjalankan aplikasi atau test. Karena graph MCP tidak tersedia dalam sesi, discovery menggunakan Git tree resmi. Temuan adalah bukti statis, bukan hasil acceptance runtime.

## Kesimpulan

**Nakama layak menjadi referensi utama untuk perilaku produk agent + grup.** Source sudah memuat persistent agent profiles, konfigurasi soul/tools/MCP/skills, grup dengan brief, mention yang mengaktifkan agent berikutnya, shared files/memory, serta private thread. Ini jauh lebih konkret daripada framework yang hanya menyediakan delegasi subagent.

Namun, mengadopsi seluruh runtime apa adanya belum memenuhi SaaS multi-agent durable: grup hanya dimiliki satu manusia; antrean kerja hidup dalam proses; Stop menunggu hop saat ini; tools berbahaya berjalan dengan kewenangan host. Rekomendasi: adopsi model interaksi dan modul domain Nakama secara dekat, lalu validasi/penuhi persistence, isolation, dan cancellation sebelum menyatakannya siap untuk Ngertiin.

## 1. Agent adalah entitas persisten dan dapat dikustomisasi

Source `ProfileService.createProfile` menyimpan profile, menulis soul files, menetapkan tools default dan bundled skills. Ada API assignment terpisah untuk tool, MCP server, dan skill. Duplikasi profile menyalin assignment tersebut. Jadi agent bukan sekadar nama baru dalam satu prompt. [ProfileService](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/profile-service.ts#L350)

Composer soul menyusun empat lapisan eksplisit: `SOUL.md` sebagai identity; `STYLE.md` sebagai voice/style; `INSTRUCTIONS.md` sebagai aturan kerja; `MEMORY.md` sebagai continuity. Stored system prompt ditambahkan jika berbeda. Tidak perlu meniru nama file `IDENTITY.md` untuk mendapatkan fungsi identity tersebut. [Soul composer](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/soul/compose.ts)

`resolveProfileSystemPrompt` memuat stack milik org/profile, published soul jika shared agent, katalog skills, capability agent-browser, katalog knowledge base, dan org memory. `runSubAgentPrompt` memakai resolver profile yang sama, sehingga giliran agent dalam grup tetap menggunakan konfigurasi agent itu. [Prompt resolver](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-service.ts#L6151), [group execution](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-service.ts#L2115)

Skill adalah instruksi yang dimuat melalui katalog dan mekanisme matched-skill; bukan otomatis callable tool. Assignment MCP diterjemahkan menjadi runtime tools melalui resolver. Model ini bisa diikuti tanpa membuat runtime khusus untuk setiap jenis kustomisasi. [Skills composition](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/skills/compose.ts), [MCP resolution](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-service.ts#L5426)

## 2. Model grup dan algoritme handoff yang benar-benar ada

Endpoint membatasi grup menjadi 2–12 agent, nama maksimal 80 karakter, brief maksimal 4.000 karakter. Grup mempunyai banyak session; sebuah private thread menempel pada pesan agent. [Routes](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/http/routes/agent-groups.ts#L38), [contracts](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/agent-groups.ts)

Alur normal di source:

1. Pesan manusia disimpan lalu dimasukkan ke inbox run session.
2. Mention manusia menentukan speaker; `@all` mengantrekan seluruh anggota secara berurutan.
3. Jika tidak ada mention, speaker terakhir didahulukan lalu anggota lain mendapat kesempatan.
4. Runtime membaca ulang grup dan akses profile setiap hop.
5. Agent mendapat brief, roster/role, group memory, shared directory, dan transcript terbaru.
6. Satu agent dieksekusi melalui `runSubAgentPrompt`.
7. Jawaban disimpan; mention terhadap agent lain ditambahkan ke antrean.
8. Run berakhir saat antrean habis, stop diminta, grup hilang, atau batas hop habis.

Ini adalah **handoff berurutan berbasis mention**, bukan semua agent berjalan paralel atau peer process yang terus hidup. LLM memilih siapa yang disebut; kode deterministik mengurus parsing, antrean, membership, dan batas eksekusi. [Service](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-service.ts), [prompt](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-prompt.ts)

`memberHandles` membuat slug unik dan suffix jika bertabrakan. Parser mention menghindari pola email/URL dan mencocokkan handle panjang dahulu. Mention diri sendiri dan `@all` dari agent diabaikan; `@all` manusia diperluas menjadi semua anggota. Queue menghindari duplikasi agent yang masih menunggu. [Mention implementation](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/agent-groups.ts#L141)

Batas dasar adalah enam balasan agent per pesan manusia. Saat inbox diproses, budget diatur menjadi `max(6, jumlah agent yang dibangunkan)`, supaya `@all` tetap mencapai semua anggota. Pesan manusia baru dapat memperbarui budget. Agent yang tidak perlu menambah jawaban boleh mengembalikan pass; pass tidak disimpan dan tidak mengurangi hop. Karena itu, enam bukan batas biaya atau jumlah pemanggilan model yang mutlak. [Run loop](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-service.ts), [mayPass](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-prompt.ts)

## 3. Memori dan konteks

Transcript main chat dibatasi 40 pesan dan 24.000 karakter terakhir. Anggota melihat role singkat yang diambil dari paragraf SOUL.md masing-masing, bukan seluruh private soul rekan. Shared directory disediakan untuk hasil kerja bersama; group memory ditambahkan ke setiap giliran dan tersedia lintas session. Tool `update_group_memory` hanya ditambahkan ketika input memiliki shared directory. [Group prompt](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-prompt.ts), [tool composition](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-service.ts#L2135)

Private thread memasukkan percakapan grup sampai pesan akar lalu isi thread. Thread tidak ditambahkan ke transcript main chat; speaker hanya agent pemilik pesan akar. Namun thread masih memakai shared folder dan group memory. Artinya privasi transcript tidak identik dengan isolasi semua side effect atau file hasil kerja. [Thread composition](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-prompt.ts#L331)

## 4. Batas yang material untuk Ngertiin

| Area | Bukti yang ditemukan | Implikasi adopsi |
|---|---|---|
| Banyak manusia dalam grup | `groups.owner_user_id`; pesan manusia direpresentasikan `author_profile_id = null`; query group dibatasi owner | Sudah satu user + banyak agent. Belum model membership banyak manusia dalam satu grup. |
| Durability eksekusi | `runs` dan `threadRuns` adalah Map dalam proses; source menyatakan restart mengakhiri run | Pesan tersimpan, pekerjaan yang sedang berjalan tidak durable. |
| Banyak instance server | Stop dan status active hanya tersedia pada proses pemilik run | Perlu shared coordination sebelum horizontal scaling. |
| Cancellation | Stop mengosongkan queue dan memasang flag; tidak abort hop aktif | UI Stop bukan penghentian langsung biaya/side effect. |
| Timeout | Subagent default 300 detik, maksimum 600; Promise.race | ACP process dibersihkan melalui `endOneShotAcp`; jangan menyimpulkan semua tool/model call biasa ikut dibatalkan. |
| Nested delegation | Group hop mengatur depth 1; subagent tool tidak disertakan | Agent dapat mention peer, tetapi tidak membentuk pohon subagent bebas dari hop grup. |
| Host isolation | Threat model menyatakan bash, scripts, stdio MCP, plugins, coding agents bukan tenant sandbox | Profile assignment adalah kontrol capability, bukan boundary OS/container. |
| Scheduling | Automation runner mengeksekusi `automation.profileId`; group service dipicu post pesan | Scheduler profile ada, tetapi jalur scheduler yang mengaktifkan grup tidak terbukti dalam source yang diperiksa. |

Sumber tabel: [group store](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-store.ts), [group service](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-service.ts), [subagent runner](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-service.ts#L2115), [timeout definitions](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/tools/sub-agent-shared.ts), [automation runner](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/automation-runner.ts), [threat model](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/THREAT_MODEL.md#L114).

Database grup adalah file SQLite `agent-groups.sqlite` per organisasi, berisi groups, group_sessions, messages, avatars, pins; directory/file diberi permission 0700/0600. Ini persistence transcript/config, bukan queue durable. [Store](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-store.ts#L116)

## 5. Kematangan dan lisensi

Ada test terarah untuk handoff, hop cap, `@all`, shared folder, memory lintas chat, kehilangan akses di tengah run, user keluar organisasi, Stop setelah hop, pesan baru saat agent bekerja, penghapusan session, dan private thread. Test loop dua agent secara eksplisit mengharapkan enam panggilan. Test tersebut **dibaca, tidak dijalankan** dalam audit ini. [Service tests](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-service.test.ts), [store tests](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-store.test.ts)

Snapshot API menunjukkan repositori dibuat 23 Mei 2026, sekitar 494 stars dan 92 forks, tidak archived. Release terakhir yang terbaca adalah v0.4.55 pada 21 Oktober 2026. Angka ini sinyal aktivitas, bukan bukti reliabilitas production. [Metadata](https://api.github.com/repos/ahmadrosid/nakama), [releases](https://github.com/ahmadrosid/nakama/releases)

Root LICENSE adalah MIT dengan copyright 2026 ahmadrosid; teksnya mengizinkan penggunaan/modifikasi/distribusi dengan penyertaan notice. Ini temuan teks lisensi root, bukan audit dependency/assets atau nasihat legal. [LICENSE](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/LICENSE)

## 6. Peta adopsi yang disarankan

**Ikuti dekat atau port dengan perubahan minimal:** kontrak profile; soul composer; assignment tools/MCP/skills; group/group-session/thread; handle resolution; mention routing; queue berurutan; pass; brief; roster; shared workspace dan group memory. Modul ini sudah menghubungkan fitur yang diminta secara konkret.

**Desain ulang sebelum mengklaim SaaS tahan restart:** simpan run/turn/queue beserta idempotency dan lease di storage bersama; propagasi cancellation; budget token/biaya bersama seluruh chain; identitas author manusia eksplisit jika kelak multi-user group; sandbox/credential boundary per tenant/agent sesuai kebutuhan. Ini rekomendasi arsitektur audit, bukan fitur yang sudah dibuktikan di Nakama.

**Pertahankan acceptance dari perilaku upstream:** user mention A → A melakukan kerja/tool → A mention B → B membaca hasil → balasan B terlihat dengan identitasnya; mutual mention berhenti; revoke akses di tengah run mencegah giliran berikutnya; thread tidak masuk main transcript; restart tidak menggandakan side effect; Stop menghentikan pekerjaan aktif sesuai kontrak produk. Dua terakhir membutuhkan implementasi yang lebih kuat daripada baseline Nakama.

## 7. Yang belum dibuktikan

Belum ada walkthrough UI atau benchmark latency/cost, test concurrency nyata, penetration test tenant isolation, recovery crash, kelengkapan audit tools pihak ketiga, dan pembuktian bahwa scheduler dapat menjalankan autonomous group. Belum ada dasar menyebut runtime ini setara Grokbot secara keseluruhan. Akan tetapi, source yang diperiksa cukup kuat untuk menjadikan Nakama kandidat pertama bagi prototype group interaction Ngertiin.
