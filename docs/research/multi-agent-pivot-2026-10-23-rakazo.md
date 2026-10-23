# Rakazo: inspeksi source untuk pivot multi-agent

Tanggal: 23 Oktober 2026. Status: riset, bukan keputusan implementasi. Snapshot: [`f6a1ef2229a81319a91758aa65fac97575215691`](https://github.com/elie222/rakazo/tree/f6a1ef2229a81319a91758aa65fac97575215691). Inspeksi statis melalui GitHub connector; aplikasi dan test upstream belum dijalankan. Semua tautan source berikut mengunci snapshot ini.

## Kesimpulan

Rakazo kandidat kuat untuk fondasi produk web Ngertiin: bot persisten, grup, pesan peer, handoff, tools, MCP, skills, komputer, dan pekerjaan durable berada dalam satu aplikasi. Rekomendasi bersifat bersyarat: lakukan evaluasi fork sebelum porting ke stack Ngertiin. Tidak ada bukti bahwa menyalin seluruh sistem akan langsung memenuhi multi-human groups atau isolasi skills per-agent.

README menyatakan proyek masih beta. Stack yang dinyatakan: TypeScript, React/Vite, Hono/oRPC, PostgreSQL/Prisma, Better Auth, Graphile Worker, Pi, dan beberapa sandbox termasuk E2B. Ini cukup dekat dengan kebutuhan produk, tetapi berbeda dari FastAPI/LangGraph Ngertiin. [README](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/README.md).

## Agent dan kustomisasi

`Bot` menyimpan name, title, description, instructions, instructionHistory, selfUpdateInstructions, modelProvider/modelId/thinkingLevel, disabledBuiltinTools, computerId, parentBotId, memoryScope, routines, agentHome, browserProfile, dan relasi MCP. `Thread.botId` dan `Thread.groupId` terpisah; agent bukan sekadar satu system prompt berganti nama pada thread yang sama. [Schema](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/db/prisma/schema.prisma).

`botPersona` di executor membedakan public profile dari private instructions. Tidak perlu menamai semuanya SOUL.md/IDENTITY.md untuk memperoleh semantik identitas dan perilaku. Namun, round-trip dokumen SOUL.md/IDENTITY.md sebagai sumber konfigurasi belum dibuktikan; jangan menjanjikan kompatibilitas file tersebut hanya dari keberadaan instructions. [Executor](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/executor.ts#L9440).

Tool `propose_instructions_update` meminta persetujuan manusia untuk perubahan instruksi. Ada pemisahan bot persisten, pesan peer, dan helper sementara di katalog tools. [Builtin tools](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/builtin-tools.ts#L1120).

## Jalur group dan koordinasi

1. User menyebut anggota melalui teks atau mention chip ber-ID. `resolveGroupTargetBotIds` hanya membangunkan anggota grup. `@everyone` menargetkan semua; tanpa target, anggota pertama menjadi default. Ini aturan deterministik, bukan pemilihan speaker oleh model supervisor. [Group mentions](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/core/src/group-mentions.ts).
2. Agent mendapat roster grup, identitasnya sendiri, deskripsi anggota, dan instruksi kepemilikan tahap pekerjaan. Roster diperlakukan sebagai metadata tidak tepercaya. [Bot messages](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/core/src/bot-messages.ts).
3. Untuk menyerahkan tahap berikutnya, model memanggil `handoff_to_bot`. Tool memanggil `handoffToGroupBot`; teks `@agent` sendiri tidak identik dengan penyerahan pekerjaan yang durable. [Tool definition](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/builtin-tools.ts#L1396), [handler](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/group-handoff.ts).
4. Handler mengunci owned group, memeriksa source run masih running, source dan target masih anggota, serta target bukan dirinya sendiri. Ia menolak handoff langsung kembali ke pengirim tahap sebelumnya.
5. Dalam transaksi yang sama: simpan pesan `handoff`, Task target, Run target queued dengan sourceMessageId, dan event `group.handoff`. Sesudah commit: notify UI dan enqueue worker. `clientNonce = group-handoff:<runId>` membuat replay handoff yang sama mengacu pada hasil tersimpan. Konsekuensi semantiknya: satu transfer kepemilikan per source run, bukan fan-out bebas dari tool handoff ini. [Handler](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/group-handoff.ts).
6. Rantai bot-started deliveries dibatasi default enam hop melalui `BOT_MESSAGE_MAX_HOPS`. Pesan manusia memulai rantai baru. Ini batas hop, bukan otomatis batas total token/biaya/fan-out seluruh pekerjaan. [Hop policy](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/core/src/bot-messages.ts#L9).

Terdapat test untuk handoff, larangan bounce, cap chain, replay, dan ancestry malformed; ada browser test group transcript. Test tersebut dibaca, tidak dijalankan pada investigasi ini. [Unit tests](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/group-handoff.test.ts), [browser test](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/apps/web/e2e/group-chats.spec.ts).

## Peer messages, recovery, dan persistence

`message_bot` berbeda dari handoff grup: delivery asynchronous tidak mengakhiri turn pengirim. Prompt recipient membedakan request, result, status, question, dan FYI serta mencegah ack-only ping-pong melalui instruksi. Batas hop ditegakkan oleh kode; kualitas kepatuhan seperti tidak mengirim ack tetap perlu pengujian model nyata. [Core messaging](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/core/src/bot-messages.ts), [tools](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/builtin-tools.ts).

Ada koneksi bot lintas Space dengan approval pemilik target. Itu bukan bukti grup native multi-human: koneksi tersebut adalah peer 1:1 tersendiri. [Agent connections](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/agent-connections.ts).

Job reconciler mencari run queued serta leased/running dengan lease expired, lalu mengantrekan kelanjutan; leadership memakai PostgreSQL advisory lock. Ini bukti implementasi mekanisme recovery, belum bukti crash recovery end-to-end berhasil pada deployment kita. [Reconciler](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/job-reconciler.ts).

Agent home memiliki staging/previous directory dan pemulihan commit terputus; path containment dan symlink handling dibahas dalam kode. Mekanisme ini perlu dievaluasi sesuai storage target sebelum menganggap semua pod dapat berbagi home secara aman. [Home store](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/home.ts).

## Tools, MCP, skills, dan memory

MCP assignments diseleksi berdasarkan botId, spaceId, userId dan server enabled. Ada allowedTools/allowAllTools, discovery timeout/backoff, stdio process/session lifecycle, dan credential handling. Struktur ini merupakan referensi konkret untuk capability grant per-agent. Dukungan remote dan stdio ada pada source; keamanan hosting multi-tenant belum dibuktikan dengan penetration test. [MCP connector](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/mcp-connector.ts#L391), [server arguments](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/mcp-server-tool.ts).

Skills menggunakan format SKILL.md, catalog ringkas, `skill_read`, create/update/delete, dan source builtin/plugin/user. **Catalog skills yang diperiksa scoped ke spaceId + userId, bukan allowlist individual bot.** TaughtSkills mempunyai relasi bot tersendiri. Jika kebutuhan Ngertiin adalah setiap agent hanya mendapat skills terpilih, itu delta implementasi eksplisit. [Skill tools](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/skill-tools.ts#L85), [skill parser/catalog](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/core/src/agent-skill.ts).

Memory context menggabungkan scope bot dan scope user. Dengan demikian identitas agent berbeda tidak berarti semua memory terisolasi total; shared user memory adalah perilaku yang memang dibangun. Kebutuhan group-specific memory ACL perlu diuji tersendiri. [Memory context](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/memory-context.ts).

## Gap yang menentukan pilihan

| Kebutuhan | Bukti / implikasi |
| --- | --- |
| Satu user + beberapa agent dalam grup | Cocok dengan ChatGroup.userId, ChatGroupMember.botId dan owned-group routing |
| Beberapa manusia + agent dalam grup native | Belum tersedia dalam model group yang diperiksa: membership bot-only, query mengikat owner userId; perlu domain participant dan authorization tambahan |
| Soul/identity file terpisah yang bisa diedit | Ada profile/instructions; kompatibilitas literal file belum terbukti |
| Skills berbeda pada tiap agent | Shared catalog perlu assignment layer tambahan jika dibutuhkan |
| Runtime durable | Ada DB run/task/events, enqueue recovery, leases; masih perlu fault-injection runtime |
| Fondasi kecil dan mudah diubah | Scope besar; executor.ts pada snapshot ini 10.643 baris. Fitur luas membawa biaya pemeliharaan yang harus dinilai |

Sumber gap grup: [schema](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/db/prisma/schema.prisma), [group repositories](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/db/src/groups.ts). Ukuran executor adalah observasi snapshot, bukan pengukuran kualitas seluruh proyek.

## Rencana akuisisi yang disarankan

Evaluasi fork snapshot sebagai kandidat utama produk web. Pertahankan model domain, handoff protocol, event semantics, worker recovery, dan tests terlebih dahulu; hindari rewrite Python sebelum perilaku upstream terbukti. Setelah demonstrasi end-to-end, terapkan branding Ngertiin dan delta yang disepakati (misalnya per-agent skills, dokumen soul, multi-human membership).

Gunakan satu fondasi runtime utama. Jangan langsung mencampur executor Rakazo, gateway Hermes, dan orchestrator Nakama: masing-masing mempunyai pemilik session, memory, cancellation, dan recovery sendiri. Bila perlu worker dari runtime lain, integrasikan melalui batas adapter/protokol yang terukur, setelah jalur utama bekerja.

File LICENSE snapshot menyatakan Apache-2.0. Simpan provenance commit dan inventaris file yang diambil, pertahankan berkas lisensi/notice upstream yang berlaku, dan periksa lisensi dependency serta layanan integrasi sebelum distribusi. Ini pencatatan sumber, bukan audit legal lengkap. [LICENSE](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/LICENSE).
