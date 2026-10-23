# Grok Bot dan alternatif fondasi multi-agent

Tanggal pemeriksaan: 23 Oktober 2026. Status: riset sumber primer dan inspeksi statis, bukan acceptance runtime. Tidak ada repository pihak ketiga yang dijalankan atau kode produk Ngertiin yang diubah.

## Kesimpulan

Untuk kebutuhan Ngertiin, kandidat tambahan paling relevan ialah **OpenClaw untuk runtime agent persisten** dan **Block Buzz untuk model percakapan manusia + agent serta mention yang membangunkan agent**. Keduanya patut masuk shortlist bersama referensi pengguna. LobeHub mempunyai implementasi grup yang sangat relevan, tetapi lisensinya membatasi distribusi karya turunan; ia tidak boleh otomatis diperlakukan sebagai donor kode permisif. Microsoft Agent Framework memberi komponen orkestrasi, bukan produk tim agent siap pakai. Letta sekarang harus dievaluasi melalui `letta-code`, bukan server Python V1 yang telah dipensiunkan.

Ini rekomendasi untuk pembuktian teknis berikutnya, bukan kesimpulan bahwa salah satu kandidat sudah lolos kebutuhan SaaS Ngertiin. Tidak ada penilaian kematangan berdasarkan jumlah stars.

## Produk yang sebenarnya dimaksud: Grok Bot

Dokumentasi resmi menggambarkan bot bernama yang mempertahankan konteks lintas sesi, bisa bekerja paralel, saling mengirim pesan, dan berkoordinasi di grup. Ini cocok dengan kebutuhan pengguna, dan berbeda dari sekadar model Grok yang melakukan reasoning multi-agent di belakang satu jawaban. [Overview resmi](https://docs.x.ai/grok-bot/overview).

Semantik grup yang terdokumentasi:

- Grup dibuat dengan dua sampai enam bot; pesan biasa membiarkan peserta memilih siapa merespons.
- Mention, reply terhadap pesan bot, dan `@everyone` mengarahkan percakapan.
- Pesan asinkron antarbot membangunkan penerima; hasil bisa datang kemudian dan handoff terlihat.
- Instruksi langsung pengguna dapat mendahului pekerjaan latar belakang.
- Approval, permintaan secret/login, dan draft email/Slack tidak muncul di grup. Handoff bot ke grup saat ini hanya teks.

Sumber: [Message and collaborate, diperbarui 17 Oktober 2026](https://docs.x.ai/grok-bot/chat-and-collaboration).

Detail arsitektur produk yang mudah terlewat: semua bot satu akun berbagi komputer, filesystem, browser sessions, credentials, dan konektor. Setiap bot mendapat screen sendiri, tetapi screen bukan batas keamanan. Memori percakapan perbot tidak berarti komputer terisolasi perbot. [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps).

**Belum diketahui:** algoritma pemilihan speaker, antrean internal, deduplikasi, pembatasan siklus, transaksi handoff, dan schema memori Grok Bot. Dokumen publik tidak cukup untuk mengklaim kita dapat menyalin implementasi internalnya. Dukungan grup berisi beberapa manusia berbeda juga belum terbukti dari halaman grup yang diperiksa; jangan menyamakan banyak bot milik satu akun dengan multiplayer manusia.

## OpenClaw: kandidat runtime paling lengkap dalam pemeriksaan ini

Snapshot: [`2e6e86c485abf9d4e37996bf329c8f21eba52c60`](https://github.com/openclaw/openclaw/tree/2e6e86c485abf9d4e37996bf329c8f21eba52c60). GitHub metadata menyatakan MIT; pemeriksaan lisensi komponen/vendor tetap dibutuhkan ketika mengadopsi kode tertentu.

**Dokumentasi terverifikasi:** agent mempunyai workspace, `SOUL.md`/`AGENTS.md`/`USER.md`, state directory, profil autentikasi, dan session history sendiri. Binding memetakan channel/account/peer menuju agent. Jadi agent bukan hanya satu role prompt sementara di dalam workflow. [Multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent).

Skills mempunyai scope per-agent, workspace, shared managed, dan workshop. Nama yang bertabrakan diselesaikan lewat precedence; skill yang dipelajari satu agent tidak otomatis menjadi skill agent lain. MCP mendukung stdio, SSE, dan Streamable HTTP, dengan tool policy tetap berlaku setelah koneksi. [Skills source](https://github.com/openclaw/openclaw/blob/2e6e86c485abf9d4e37996bf329c8f21eba52c60/docs/tools/skills.md), [MCP source](https://github.com/openclaw/openclaw/blob/2e6e86c485abf9d4e37996bf329c8f21eba52c60/docs/tools/mcp.md).

**Kode yang dibaca:** `runSessionsSendA2AFlow` menunggu hasil run target, membedakan peer dengan child, memeriksa disposition balasan, mempertahankan identity/session generation sumber, memakai idempotency key ketika mengirim balasan sumber, dan mengirim hasil kepada requester. Balasan hasil tidak otomatis dikirim kembali ke target sehingga satu reply tidak memicu ping-pong implisit. Ini jauh lebih konkret daripada prompt “kalian boleh saling berbicara”. [Implementasi A2A](https://github.com/openclaw/openclaw/blob/2e6e86c485abf9d4e37996bf329c8f21eba52c60/src/agents/tools/sessions-send-tool.a2a.ts).

`sessions_send` mengalamatkan konteks model lokal; pengiriman ke percakapan eksternal memakai tool terpisah. Pembedaan tersebut perlu dipertahankan agar “mengirim pesan ke agent” tidak ambigu dengan “posting ke grup”. [Session tools](https://docs.openclaw.ai/concepts/session-tool).

**Batas utama:** dokumentasi keamanan secara eksplisit memakai satu trust boundary per gateway. Pengguna yang saling tidak percaya tidak boleh diasumsikan aman dalam satu gateway bersama. Untuk SaaS publik, inference desainnya adalah gateway/credentials terpisah per trust boundary, dengan control plane tenant milik Ngertiin. [Security source](https://github.com/openclaw/openclaw/blob/2e6e86c485abf9d4e37996bf329c8f21eba52c60/docs/gateway/security/index.md).

**Yang masuk akal diadopsi:** runtime lengkap di belakang adapter, format identitas dan skill, konfigurasi tool/MCP, session addressing dan attribution. Jangan menyalin beberapa file A2A tanpa dependency policy, identity, delivery, dan lifecycle-nya. Repository ini mempunyai banyak test spesifik session-send, termasuk policy dan admission; keberadaan test adalah bukti investasi pengujian, bukan bukti bahwa test lolos dalam lingkungan Ngertiin.

## Block Buzz: kandidat produk paling langsung untuk ruang manusia dan agent

Snapshot: [`016310d3cc44688779a7d517a13d9cc8024ddfa8`](https://github.com/block/buzz/tree/016310d3cc44688779a7d517a13d9cc8024ddfa8). README menyatakan Apache 2.0 dan menggambarkan relay Nostr, Postgres, Redis, object storage, desktop Tauri/React, serta ACP harness. Manusia dan agent masuk channel dengan identitas/keypair masing-masing; event bertanda tangan menjadi catatan percakapan. [README](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/README.md).

Alur yang bisa diikuti: relay menerima event → `buzz-acp` memilih mention → antrean sesuai conversation/thread → ACP `session/prompt` menjalankan harness yang sudah ada → agent memakai Buzz CLI untuk membaca atau mengirim pesan. Runtime dapat Goose, Codex, atau Claude Code melalui ACP. Dengan demikian Ngertiin tidak harus menciptakan agent loop sendiri. [ACP README](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/crates/buzz-acp/README.md).

**Kode yang dibaca:** `filter.rs` memeriksa mention melalui `p` tag terhadap public key agent, bukan substring nama. Filter expression bermasalah gagal tertutup; ada pengujian mention dan timeout. `queue.rs` menyimpan antrean per `SessionScope`, melacak scope in-flight, membatasi queue, dan memilih batch untuk dijalankan. Ini mendukung pemisahan antara identitas, pengalamatan pesan, dan slot eksekusi. [Filter](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/crates/buzz-acp/src/filter.rs), [Queue](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/crates/buzz-acp/src/queue.rs).

Nuansa yang perlu dipertahankan:

- Author gate default `owner-only`: pesan agent lain tidak otomatis diizinkan. Interaksi peer harus masuk policy allowlist yang sesuai.
- Opsi `--agents N` pada harness adalah pool subprocess dengan **identitas bot yang sama**, bukan N bot yang tampil sebagai peserta grup.
- Heartbeat hanya memakai slot idle, mempunyai prioritas lebih rendah dari pesan, dan maksimal satu heartbeat in-flight.
- Queue overflow dapat membuang event lama. Dokumentasi menyatakan replay recovery bergantung histori relay dan kemajuan consumer; complete delivery tidak dijamin.
- README membedakan fitur sudah bekerja dan approval workflow yang masih disambungkan. Jangan menganggap seluruh vision sudah tersedia.

Sumber: [ACP README](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/crates/buzz-acp/README.md), [Queue](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/crates/buzz-acp/src/queue.rs), [feature status](https://github.com/block/buzz/blob/016310d3cc44688779a7d517a13d9cc8024ddfa8/README.md).

**Tradeoff:** paling dekat untuk multiplayer dan mention, tetapi mengambil produk penuh berarti mengadopsi stack Rust/relay/identity yang lebih besar. Perlu memilih versi upstream dengan sengaja: repository [`block/buzz-app`](https://github.com/block/buzz-app) menyebut pengalaman 1.0 beta baru, sementara `block/buzz` 0.x tetap didukung. Jangan mencampur file dua generasi tanpa pengujian.

## LobeHub: pembanding konkret, donor kode bersyarat

Snapshot: [`b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6`](https://github.com/lobehub/lobehub/tree/b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6).

`GroupOrchestrationRuntime` menjalankan loop supervisor/executor dengan `maxSteps` dan abort. `GroupOrchestrationSupervisor` adalah state machine yang menerjemahkan keputusan `speak`, `broadcast`, `delegate`, `execute_task`, `execute_tasks`, dan `finish` menjadi operasi konkret; `maxRounds` membatasi putaran. Broadcast menonaktifkan tools secara default. Ini model supervisor terpusat, bukan bukti semua agent bebas saling membangunkan. [Runtime](https://github.com/lobehub/lobehub/blob/b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6/packages/agent-runtime/src/groupOrchestration/GroupOrchestrationRuntime.ts), [Supervisor](https://github.com/lobehub/lobehub/blob/b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6/packages/agent-runtime/src/groupOrchestration/GroupOrchestrationSupervisor.ts).

Prompt supervisor meminta pemilihan agent relevan, prioritas pada permintaan eksplisit pengguna, serta pembatasan pada peserta yang didefinisikan. Ini memperlihatkan bahwa kebijakan produk dan state machine dipisahkan. [Prompt](https://github.com/lobehub/lobehub/blob/b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6/packages/builtin-agents/src/agents/group-supervisor/systemRole.ts).

**Lisensi:** file LICENSE adalah LobeHub Community License, berbasis Apache 2.0 dengan syarat tambahan; teksnya meminta lisensi komersial untuk pengembangan dan distribusi karya turunan. Karena tujuan pengguna adalah akuisisi kode relatif langsung untuk produk, ini pembeda nyata dari MIT/Apache biasa. [LICENSE](https://github.com/lobehub/lobehub/blob/b6bb2d2710ec46e776b6f4ac582ce2f6069bcdc6/LICENSE).

## Letta dan Microsoft Agent Framework

**Letta:** `letta-ai/letta` pada [`8816d3a8516893bfdc0fa14bfb1235226012e295`](https://github.com/letta-ai/letta/blob/8816d3a8516893bfdc0fa14bfb1235226012e295/README.md) menyatakan server V1 retired dan menunjuk `letta-ai/letta-code` sebagai runtime aktif. Snapshot runtime: [`6c8b08fedfb6f3fb437163ede8320a387151693f`](https://github.com/letta-ai/letta-code/tree/6c8b08fedfb6f3fb437163ede8320a387151693f).

README runtime menawarkan identitas/memori persisten, MemFS berbasis Git, agent-scoped skills, schedules, dan penggunaan agent lain sebagai subagent. Kode `child-send-tracking.ts` membedakan anak dengan tag parent dari peer A2A, lalu mengikuti enqueue receipt run yang tepat; `subagent-depth.ts` membatasi nesting dua tingkat. Bukti bagus untuk lifecycle/memori, tetapi UX ruang multiplayer bersama belum terverifikasi. [README](https://github.com/letta-ai/letta-code/blob/6c8b08fedfb6f3fb437163ede8320a387151693f/README.md), [Child tracking](https://github.com/letta-ai/letta-code/blob/6c8b08fedfb6f3fb437163ede8320a387151693f/src/agent/subagents/child-send-tracking.ts), [Depth policy](https://github.com/letta-ai/letta-code/blob/6c8b08fedfb6f3fb437163ede8320a387151693f/src/agent/subagents/subagent-depth.ts).

**Microsoft Agent Framework:** pada [`a8e284ca8ce7c2a6b4a4641ef35e131d75a5cda3`](https://github.com/microsoft/agent-framework/tree/a8e284ca8ce7c2a6b4a4641ef35e131d75a5cda3), contoh `GroupChatBuilder` menggabungkan participant agents, orchestrator agent, streamed intermediate output, dan termination condition empat pesan assistant. Ini fondasi orkestrasi yang konkret, tetapi identitas persisten, roster, credentials, grup pengguna, dan product UI masih tanggung jawab aplikasi. [Contoh sumber](https://github.com/microsoft/agent-framework/blob/a8e284ca8ce7c2a6b4a4641ef35e131d75a5cda3/python/samples/03-workflows/orchestrations/group_chat_agent_manager.py).

Untuk proyek baru jangan otomatis memilih AutoGen dari reputasi historisnya: README resminya menyatakan maintenance mode dan mengarahkan proyek baru ke Agent Framework. [AutoGen](https://github.com/microsoft/autogen).

## Pilihan praktis dan pembuktian berikutnya

| Arah yang diprioritaskan | Kandidat yang perlu diuji | Kekurangan yang harus diselesaikan |
|---|---|---|
| Agent persisten, soul, skill, MCP, tools | OpenClaw | Batas tenant SaaS dan UX grup Ngertiin |
| Ruang bersama manusia/agent, mention, existing harness | Block Buzz | Beban stack, jaminan delivery, generasi produk |
| Memori agent yang belajar lintas waktu | Letta Code | Grup multiplayer dan batas local/cloud |
| Supervisor terstruktur di backend Python | Agent Framework | Sebagian besar produk agent masih perlu dibangun |
| Contoh implementasi UI/orkestrasi grup | LobeHub | Syarat lisensi karya turunan; bukan default donor kode |

Usulan eksperimen pembeda: satu user dan tiga agent persisten dalam satu grup, researcher menyebut writer, writer menyebut reviewer, pengguna melakukan interupsi, worker dimatikan lalu dinyalakan, pesan yang sama dikirim ulang, dan satu agent dicabut aksesnya. Catat attribution, antrean, biaya, hasil akhir, duplicate work, serta data apa yang bisa dibaca tiap peserta. Tambahkan dua user berbeda bila multiplayer manusia termasuk rilis pertama. Uji itu akan menentukan apakah kita benar-benar bisa memakai sistem upstream dengan sedikit adaptasi atau hanya meminjam konsep.

Status pertanyaan: identitas produk Grok Bot terjawab melalui dokumen resmi; kandidat dan modul adopsi terjawab pada level statis; jaminan runtime, biaya operasional, isolasi tenant end-to-end, dan tingkat keberhasilan tugas nyata belum diuji. Klaim bahwa semua masa depan AI harus multi-agent tidak dibuktikan oleh riset ini; kebutuhan produk pengguna sudah cukup menjadi alasan menguji pivot tanpa klaim tren universal tersebut.
