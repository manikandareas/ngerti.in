# Studi source Rakazo dan Hermes: computer use, VNC, permission, approval

Diperiksa 23 Oktober 2026. Metode: skill `reverse-engineer-anything`, dengan source tracing karena kedua target menyediakan source lengkap. Skill mengarahkan analisis repo biasa untuk target ini; decompiler/REA runtime tidak diperlukan. Graph MCP tidak tersedia, sehingga memakai pencarian dan pembacaan source. Dua investigasi repo dilakukan paralel sesuai instruksi skill, lalu jalur approval penting diperiksa ulang saat sintesis.

**Batas:** seluruh temuan upstream adalah analisis statis pada commit berikut. Tidak menjalankan aplikasi, VNC, model, atau sandbox upstream. Nama metode, dokumentasi dan test source bukan bukti acceptance runtime. Negative search diberi batas eksplisit.

| Repo | Snapshot yang dianalisis |
| --- | --- |
| [Rakazo](https://github.com/elie222/rakazo) | `fc8f8ee94fb4d5f8dd35631aaae1647b7de93509` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | `67491b50f7e5ef8be6e591d745b32758aa60c33e` |

## 1. Kesimpulan untuk Ngertiin

Kedua repo memisahkan akses viewer, hak input manusia/agent, dan approval tool. Keamanan viewer tidak membuktikan setiap klik mutation membutuhkan persetujuan. Rakazo kuat sebagai referensi E2B lifecycle, capability VNC dan checkpoint approval. Hermes memberi contoh RFB filtering, takeover lease lintas proses, privacy fencing, serta pembedaan input delivered dari effect verified. Kebijakan approval keduanya berbeda dari kebutuhan Ngertiin; jangan diadopsi utuh.

Rekomendasi: pertahankan Jev + Browser Harness + E2B, routine-auto dan exact sensitive approval existing. Ambil pola kontrol/recovery kedua repo untuk memperkuat boundary, bukan mengganti supervisor dengan agent bebas tool. Rencana penerapan ada di [computer-use/VNC plan](../engineering/computer-use-vnc-plan-2026-10-23.md).

## 2. Rakazo: alur aktual

### E2B dan lifecycle

Adapter membuat sandbox dengan timeout yang berujung pause dan auto-resume dimatikan. Jalur reconnect memakai sandbox retained; kegagalan transport tidak langsung dianggap sandbox hilang. Recovery setelah resume meminta percobaan berikutnya, alih-alih langsung mengulang operasi yang efeknya mungkin sudah terjadi. Stop menghapus cached handle dan pause, sedangkan destroy melakukan kill berdasarkan ID tanpa perlu resume. Error pause diteruskan karena resource mungkin masih hidup. [Create/connect/recovery](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/e2b-sandbox.ts#L72-L226), [provision](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/e2b-sandbox.ts#L230-L269), [stop/destroy](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/e2b-sandbox.ts#L430-L453).

**Adopsi:** bedakan resource absent, paused, transport unavailable, dan outcome unknown. Pertahankan profil dan checkpoint. Jangan menyalin strategi retry tanpa memastikan receipt Ngertiin sudah direkonsiliasi.

### VNC dan takeover

Screen capability memakai AES-GCM, TTL satu jam, dan scope bot/computer/generation/control lease. API memvalidasi generation/lifecycle/lease; proxy juga memeriksa stream yang sudah terbuka setiap satu detik dan menutupnya jika authority tidak bisa divalidasi. Token provider bertingkat tidak dikirim langsung sebagai kredensial viewer. Ini authorization aktual, bukan hanya toggle frontend. [Capability](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/core/src/node/screen-capability.ts#L3-L121), [API authority](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/apps/api/src/screen-proxy.ts#L28-L78), [ongoing stream](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/apps/web/src/screen-proxy.ts#L17-L105).

View memakai x11vnc `-viewonly`; control memakai proses/socket/token terpisah. Revocation menghapus route authorization dan menghentikan proses control. Takeover API menolak saat execution masih memblokir, kecuali sedang waiting_takeover; grant memakai conditional update dan lease. Executor menolak `computer_observe` maupun `computer_act` ketika held for takeover. [View server](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/core/src/node/desktop-runtime.ts#L550-L568), [revoke control](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/core/src/node/desktop-runtime.ts#L606-L646), [takeover API](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/apps/api/src/router.ts#L3132-L3228), [executor guard](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/executor.ts#L5576-L5623).

**Adopsi:** generation-bound capability, revocation pada koneksi hidup, backend input enforcement, dan handoff eksklusif. Ngertiin sudah memiliki gateway/RFB/epoch; tidak perlu langsung mengganti cookie HttpOnly dengan bearer URL atau memanjangkan TTL ke satu jam. Audit ini tidak membuktikan seluruh shell/custom tools Rakazo terkurung dari display/profile selama takeover.

### Approval: baca combiner, bukan nama fungsi

`computer_act`, `browser_act`, `browser_navigate`, `shell`, dan `write_file` masuk exemption klasifikasi consequential default. Rules dapat mengubah keputusan; specific rule menang dan require menang pada specificity yang sama. Tools tertentu yang menembus security boundary tetap memiliki mandatory gate. Resolver tanpa rule mengembalikan allow. Optional Auto Review berlaku pada jalur consequential/new destination yang memenuhi syarat; mandatory approval tidak diloloskan judge. Error judge pada consequential action berujung ask. [Classification](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/core/src/action-approval.ts#L3-L166), [resolver/combiner](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/core/src/action-approval.ts#L299-L401), [executor wiring](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/executor.ts#L5035-L5086), [judge failure](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/executor.ts#L5225-L5262).

Sebelum pause untuk input pengguna, executor memperbarui lease, flush workspace, persist checkpoint, lalu pause dengan owner/fence. Dispatch berada sesudah gate dan approved effect diklaim; duplicate yang uncertain tidak langsung dieksekusi ulang. **Inilah pola yang relevan untuk Ngertiin**, terpisah dari default exemption yang terlalu luas untuk browser mutation. [Checkpoint/pause](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/executor.ts#L5385-L5451), [claim/dispatch](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/executor.ts#L5485-L5535).

Guard visual menghitung aksi sama dengan screenshot tak berubah dan dapat menolaknya sebelum dispatch; screenshot identik tidak dikirim ulang. Namun typing dapat melewati guard dan perubahan frame mereset streak. **Inferensi desain:** guard ini berguna sebagai sinyal, tetapi tidak mengganti kemajuan berbasis evidence/postcondition; animasi tidak boleh dianggap pekerjaan maju. [Computer tool guard](https://github.com/elie222/rakazo/blob/fc8f8ee94fb4d5f8dd35631aaae1647b7de93509/packages/adapters/src/computer-tools.ts#L134-L227).

## 3. Hermes: native desktop dan browser adalah jalur berbeda

### Bot Desktop dan VNC

Hermes memiliki Bot Desktop TigerVNC/Xfce; placement dapat memakai gateway atau backend terminal yang mendukung streaming. Resolver menolak fallback diam-diam ke host ketika backend tidak mendukung desktop. Pencarian pada `tools`, `plugins/browser`, dan `plugins/computer_use` tidak menemukan referensi E2B; ini bukan klaim tidak ada integrasi pada seluruh ekosistem plugin. [Placement contract](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/bot_desktop/placement.py#L1-L16), [resolver](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/bot_desktop/placement.py#L64-L86).

Viewer memakai authenticated request, single-use ticket 30 detik, Origin checks dan socket RFB per profile. Stateful parser memfilter keyboard, pointer, clipboard, resize, dan extended keyboard berdasarkan lease holder; protokol tak dikenal ditolak. Bridge me-refresh lease antarproses dengan interval hingga 250 ms, sehingga jangan menyebut revocation atomik tanpa jendela. [Ticket/auth](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/hermes_cli/web_routers/display.py#L1-L18), [consume ticket](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/hermes_cli/web_routers/display.py#L61-L90), [RFB filter](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/bot_desktop/rfb_filter.py#L1-L108), [lease refresh](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/hermes_cli/web_routers/display.py#L138-L165).

Lease persistent memakai file/fcntl; state rusak/tidak terbaca menolak akses agent. Native tool memeriksa lease sebelum dispatch dan mem-fence hasil sebelum capture dipersist/dikirim ke vision, termasuk ketika takeover lalu handback terjadi selama panggilan. Source secara eksplisit menyatakan lease hanya tool-level: script same-user dengan DISPLAY/XAUTHORITY dapat menghindarinya. [Threat boundary](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/bot_desktop/lease.py#L1-L17), [dispatch/capture fence](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L318-L380).

Socket putus abnormal mempertahankan human exclusion; close normal 1000/1001 mengembalikan kontrol menurut jalur ini. Untuk Ngertiin, adopsi perlindungan abnormal disconnect, tetapi **tetap explicit handback**, karena menutup panel existing tidak berarti menyerahkan kontrol. [Disconnect handling](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/hermes_cli/web_routers/display.py#L225-L240).

### Native computer-use approval

Trace: `handle_computer_use → hard block → _request_approval → shared approval gate → backend call lock → lease/epoch recheck → dispatch → result fence`. Scope grant berupa `cua:<action>:<background|foreground>`. Click, type, scroll, dan focus termasuk destructive classification; scope once/session/permanent tidak identik dengan exact payload/recipient approval. [Dispatch](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L318-L380), [scope](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L382-L404), [classification](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L455-L485).

`fail_closed_when_no_human=True` bukan berarti semua unattended execution ditolak. Shared gate terlebih dahulu memeriksa YOLO/approval off, grant existing, presence, lalu deny/approve mode untuk cron/single_query/unattended sebelum human prompt. Mode approve eksplisit dapat mengizinkan. Native mode resolution juga membedakan standard/bounded/unrestricted, dengan manifest untuk bounded. **Jangan menyalin YOLO atau session-wide click grant sebagai solusi otonomi Ngertiin.** [Actual shared gate](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/approval.py#L968-L1038), [mode resolution](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L131-L159), [manifest docs](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/website/docs/user-guide/features/computer-use.md#L118-L180).

### Browser dan terminal approval tidak universal

Jalur browser click/type yang ditelusuri: current-page/SSRF guard → browser command. Tidak ada exact semantic approval Send/Buy/Delete pada jalur tersebut. `browser_exec` menjalankan Python Browser Harness dengan URL routing checks dan optional Bot Desktop fencing; ini bukan terminal approval gate. Local Bot Desktop memakai lease; cloud/user-supplied CDP dikecualikan dari lease tersebut. Plugin hooks bisa menambah kebijakan, tetapi seluruh konfigurasi plugin tidak diaudit. [Click/type](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/browser_tool.py#L884-L923), [browser exec](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/browser_use_cli.py#L774-L855), [lease scope](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/browser_tool_session.py#L833-L854).

Terminal memakai dangerous-command guards dan smart classification untuk command yang ditandai; beberapa isolated backend melewati guard tertentu kecuali user-deny. Karena itu, “Hermes memiliki approval terminal” tidak membuktikan browser ataupun arbitrary shell di sandbox aman dari efek eksternal. [Terminal policy](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/approval.py#L1151-L1194), [isolated backend condition](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/approval.py#L1041-L1055).

### Recovery dan durabilitas

Hermes membedakan delivered input dari confirmed effect dan mendorong fresh capture/verify untuk hasil yang tak dapat dibuktikan. Browser session/workspace dapat bertahan antarpanggilan sementara variabel Python tidak; evidence perlu ditulis per batch. Namun approval gateway yang ditelusuri memakai thread/events/in-memory queue, sehingga bukan bukti durable database resume seperti Task Ngertiin. Browser recovery juga mempunyai recycle/retry once; jangan salin ke mutation dengan acknowledgment hilang. [Effect classification](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/computer_use/tool.py#L520-L540), [persistence contract](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/browser_use_cli.py#L884-L897), [approval wait](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/approval_gateway_wait.py#L1-L10), [retry](https://github.com/nousresearch/hermes-agent/blob/67491b50f7e5ef8be6e591d745b32758aa60c33e/tools/browser_tool_session.py#L933-L973).

## 4. Keputusan adopsi

| Pola | Keputusan untuk Ngertiin |
| --- | --- |
| Capability/viewer terikat owner, generation, expiry | Pertahankan existing; perkuat reconnect dan revocation. Jangan menyalin TTL/bearer transport tanpa kebutuhan. |
| Backend view-only dan lease input | Pertahankan RFB filter serta actuator; tambah corpus fragmented/extended messages dan race. |
| Epoch fence sebelum dan sesudah capture | Adopsi sebagai acceptance seluruh observer/model-result path; privacy bukan hanya pemblokiran input. |
| Durable pause/claim approval Rakazo | Terapkan dalam model Task/steps existing; simpan proposal dan checkpoint sebelum menunggu. |
| Click/session/permanent grant Hermes | Tidak diadopsi untuk mutation generik; grant harus exact effect/payload/context. |
| Exemption computer/browser/shell Rakazo | Tidak diadopsi; semua actuator melewati policy Ngertiin. |
| YOLO/approval-off/unattended autoapprove | Tidak diadopsi; offline agent tetap berhenti pada approval krusial. |
| Browser automatic retry | Hanya read yang aman atau aksi terbukti belum dispatched; unknown mutation harus reconcile. |
| Screenshot dedup dan action streak | Sinyal tambahan; supervisor tetap menilai evidence/postcondition baru. |
| Placement eksplisit Hermes | Adopsi; missing E2B/capability tidak boleh diam-diam beralih ke host/provider/engine lain. |

## 5. Pertanyaan yang terjawab dan yang masih perlu diuji

- **Terjawab dari source:** apakah kedua repo punya VNC/takeover; bagaimana viewer/input diotorisasi; jalur approval native/browser; bagaimana pause/resume/lease diperiksa; pola yang relevan bagi Ngertiin.
- **Terjawab sebagian:** privacy terhadap seluruh possible tool escape; konfigurasi plugin/permission override dapat mengubah perilaku dan tidak semuanya diaudit.
- **Belum diuji runtime:** race revocation, reconnect lintas perangkat, expiry sesungguhnya, profile persistence, layanan E2B, serta UX produksi kedua repo.
- **Untuk implementasi Ngertiin:** corpus permission, pre-capture privacy, target manager, retained capability maintenance, approval payload revalidation, dispatch reconciliation, dan budget finalisasi harus melewati gate pada rencana.

Riset ini tidak menjadikan kedua repo standar keamanan atau bukti bahwa mengganti engine akan menyelesaikan audit Ngertiin. Pelajaran terpenting adalah memisahkan **hak melihat**, **hak mengendalikan**, dan **izin efek**, kemudian menguji enforcement pada jalur dispatch aktual.
