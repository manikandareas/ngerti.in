# NG-043 · Redesign aktivitas agent approval dan komputer

Sumber: [Notion](https://app.notion.com/p/3feabdd6187381de93e2c5f70f0bd05e) · Readback: 2026-10-20T07:54:34.975Z

| Property | Value |
| --- | --- |
| Ticket | 43 |
| Urutan | 23.2 |
| Lingkup | Aktif V1 |
| Status | Done |
| Prioritas | P1 |
| Area | Agent |
| Depends on | [NG-042 · Redesign shell dan percakapan mengikuti Muse](42-redesign-shell-dan-percakapan-mengikuti-muse.md) · [NG-033 · Task background dan approval umum](33-task-background-dan-approval-umum.md) · [NG-036 · Browser VNC live desktop dan takeover](36-browser-vnc-live-desktop-dan-takeover.md) |

<!-- notion-content:start -->
Tujuan: Redesign aktivitas agent approval dan komputer. Redesign UI/UX pada fondasi yang sudah tersedia.
## Masalah dan sumber audit
Task berulang dalam transcript dan Aktivitas masih pasif. Audit P2-01, P2-04 dan P1-01; atlas §3, §7–8.
## Lingkup
- Bangun panel Activity, Approvals, Upcoming, Identity dengan tab dan disclosure mengikuti Muse; Computer hanya muncul ketika capability/sesi relevan.
- Task inline menjadi status ringkas pada permintaan asal; completion mengutamakan hasil. Detail log, versi dan operasi teknis tersedia di detail.
- Aktivitas actionable dengan judul/outcome/waktu, grouping tanggal, tautan konteks chat/task; Upcoming menunjukkan judul dan waktu lokal/interval.
- Approval menampilkan tindakan, alasan, scope, preview, keputusan dan riwayat; detail teknis dilipat. Integrasikan browser banner/live view/takeover/stop/close tanpa mengubah kontrak runtime.
## Acceptance criteria
- [ ] Running task dapat menerima pesan lanjutan sesuai kontrak, diuji dengan pekerjaan cukup lama. Streaming respons chat dan blocking approval diuji sebagai state berbeda.
- [ ] Fresh pending approval, allowed/denied/expired, beberapa request dan retry mempunyai tampilan jelas; send/draft mengikuti keputusan kontrak, tidak mengasumsikan semua approval bebas blocking.
- [ ] Tidak ada laporan completion/error ganda; tindakan dari Aktivitas membuka task/chat yang benar.
- [ ] Browser stop, close dan takeover menjelaskan konsekuensi sebenarnya; tidak menutup sesi/mengirim keputusan izin secara implisit.
- [ ] Lengkapi bukti live Muse untuk approval pending dan takeover sebelum menerima kemiripan state tersebut; pertahankan unknown bila belum tersedia.
## Acuan dan batas redesign
Target: UI/UX identik dengan pola Muse pada fitur yang sepadan—struktur layout, hierarki, density, entry point, transisi, progressive disclosure, dan kontinuitas percakapan—dengan Soft Matcha, Nunito Sans, serta semantic color tokens Ngertiin tetap dipertahankan. Perbedaan fitur mengikuti scope Ngertiin; tidak menambah fitur Muse hanya demi kesamaan menu.
[Referensi Notion](https://app.notion.com/p/3feabdd6187381da8a92d4243d0b1303)
[01 · Peta Produk, UX & Interaksi](../../research/muse-ai-v1/01-produk-dan-ux.md)
[02 · UX & User Flow](../../product/02-user-flow.md)
Audit Ngertiin: `.dev/audits/2026-10-19-ux-muse.md` (19 Oktober 2026, snapshot 3e21f09). Verifikasi ulang gap pada implementasi terbaru sebelum mengubah kode. Status Done tiket fondasi tidak direset.
## Definition of done bersama
- [ ] Pasangan screenshot Muse–Ngertiin pada viewport/state yang sama disimpan; anotasi membedakan adaptasi tokens/fitur yang disengaja dari penyimpangan layout/interaksi.
- [ ] Reference sheet menetapkan ukuran, spacing, density, panel behavior dan state dari bukti langsung. Ukuran perkiraan atlas tidak dianggap spesifikasi pixel final.
- [ ] Walkthrough desktop/mobile, light/dark, keyboard/focus restore, reduced motion, empty/loading/error/recovery yang relevan lulus; draft dan konteks tetap terjaga.
- [ ] Setiap state Muse yang belum teramati ditandai unknown dan diverifikasi sebelum klaim identik; fallback Ngertiin diberi label keputusan desain, bukan bukti Muse.
- [ ] Kontrak izin, ownership, budget/caps, persistence, idempotency dan keamanan preview tetap berlaku. Gate build/check serta uji regresi relevan lulus.
- [ ] Bukti acceptance ditautkan di tiket; dokumentasi/mirror disinkronkan setelah readback. Pembuatan backlog bukan bukti implementasi selesai.
## Implementasi dan evidence — 20 Oktober 2026
Implementasi NG-043 tersedia di working tree lokal di atas fondasi NG-042. Status Review; belum mengklaim parity Muse atau acceptance lengkap.
- Panel Aktivitas, Persetujuan, Mendatang, Identitas; aktivitas actionable per tanggal dengan tautan task/chat; jadwal menampilkan waktu lokal dan zona jadwal.
- Status task ringkas dekat pesan asal; metadata task_id untuk task manual baru; single approval anchor menghindari approval berulang; detail versi/pemakaian terlipat.
- Preview, scope satu tindakan, expiry, keputusan, history disclosure, dan error retry pada approval. Banner komputer hanya untuk browser task relevan; copy menjelaskan takeover, return control, stop, dan close tanpa keputusan izin implisit.
- Live Ngertiin: pesan lanjutan diterima saat task panjang running; pending review, approve sampai satu completion, deny dengan draft tersimpan; draft chat bertahan. Desktop dark 1672×879 dan mobile dark 390×844, keyboard tabs/Escape, serta Activity ke task yang benar diperiksa.
- Gate lulus: make check, make build, 10 assertions transcript/status, 56 kontrak task, dan 47 kontrak komputer dengan allowance khusus proses inspector pada database sementara. Default inspector komputer tertahan budget fixture untuk task kedua; konfigurasi aplikasi tidak diubah.
- Bukti dan reference sheet lokal: `docs/engineering/activity-43-acceptance.md`; screenshot/DOM: `docs/engineering/evidence/activity-43/`. Perubahan belum di-commit atau dipush.
- Sisa acceptance: live blocking chat approval/expired/multiple pending/retry, VNC takeover-stop-close-reconnect, light/reduced-motion dan focus/error matrix lengkap, populated Upcoming. Muse riwayat Allowed teramati, pending approval dan takeover tetap unknown. NG-042 tetap Review.
<!-- notion-content:end -->

Bukti lokal: [Acceptance NG-043](../../engineering/activity-43-acceptance.md).

Status property dibaca ulang dari view Notion pada 2026-10-23T08:26:11.852Z. Isi historis di atas mempertahankan tanggal readback sebelumnya.
