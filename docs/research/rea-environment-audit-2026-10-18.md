# Audit dan perbaikan REA untuk Codex

Tanggal: 18 Oktober 2026. Scope: instalasi skill bersama, launcher CLI REA, registrasi MCP Codex, dan pengujian jalur JavaScript/browser yang diperlukan untuk investigasi Muse.

## Hasil

**Instalasi, CLI, dan server MCP sudah berfungsi dalam pengujian langsung.** REA 6.5.0, skill versi 42, dan Node 24.18.0 sudah selaras. MCP menyediakan 207 tool dan 6 prompt. Koneksi menggunakan launcher yang benar-benar tersimpan pada konfigurasi Codex berhasil dalam 3.143 detik, di bawah timeout konfigurasi 30 detik.

**Sesi agent yang sudah berjalan masih perlu restart/reconnect untuk memuat tool baru.** Inventory tool sesi ini belum menampilkan REA. Ini berbeda dari kegagalan server: server sudah menerima initialize, tools/list, prompts/list, binary_session, dan permintaan analisis nyata. Panduan skill menyatakan: “Restart/reconnect the affected agent.” Lihat [SKILL.md lokal](/Users/vitoandareasmanik/.agents/skills/reverse-engineer-anything/SKILL.md).

## Temuan awal yang diluruskan

- Tidak adanya tool REA pada inventory sesi sebelumnya belum membuktikan server MCP rusak. Pemeriksaan sebelumnya belum melakukan handshake server sesungguhnya.
- Registrasi Codex dan CLI terminal sebelumnya menunjuk REA 4.0.1; skill masih versi 24 dengan katalog 116 tool. Pembaruan sekarang menyelaraskannya ke rilis 6.5.0 dan katalog 207 tool.
- Node default shell adalah 25.8.0. Rilis REA 6.5.0 mengecualikan Node 25; Node 24.18.0 yang didukung sudah tersedia. Rilis lama 4.0.1 memiliki rentang Node berbeda, sehingga hasil diagnosis versi terbaru tidak membuktikan semua operasi versi lama gagal.
- Brave pribadi tidak membuka CDP. Ini prasyarat attachment browser, bukan kegagalan MCP. Jalur browser sudah diuji memakai profil sementara yang terpisah.
- Ghidra, IDA, dan JADX bukan prasyarat jalur browser/JavaScript ini. Kehadirannya tidak diperlukan untuk meluluskan audit yang ditargetkan pada Codex dan skill.

## Perubahan yang diterapkan

| Komponen | Hasil perbaikan |
| --- | --- |
| `~/.codex/config.toml`, bagian `mcp_servers.rea` | `npx -y rea-agents@6.5.0 mcp`, dengan PATH khusus server yang mendahulukan Node 24.18.0. |
| Timeout startup Codex | Tetap 30 detik, sesuai kontrak pemeriksaan registrasi REA 6.5.0. |
| `~/.agents/skills/reverse-engineer-anything` | Skill resmi versi 42 beserta referensinya, melalui setup REA yang dibatasi ke Codex. |
| `~/.local/bin/rea` | Launcher baru yang memakai Node 24.18.0 dan REA 6.5.0. Lokasi ini sudah berada lebih awal pada PATH daripada instalasi CLI lama. |

Setup didahului dry-run dan backup. Konfigurasi di luar server REA dibandingkan secara semantik sebelum/sesudah dan tetap sama. Environment REA yang sebelumnya ada, termasuk jalur Hopper, dipertahankan. Node default shell serta registrasi MCP aplikasi lain tidak diubah. Instalasi CLI lama tidak dihapus; launcher baru menjadi jalur yang digunakan perintah `rea`.

Backup dan log audit lengkap berada di `/Users/vitoandareasmanik/.local/state/rea-audit/20261018T041055Z/`. Backup konfigurasi di direktori ini dibatasi dengan permission 0600 dan direktori 0700.

## Verifikasi nyata

| Pemeriksaan | Hasil |
| --- | --- |
| `rea --version` | 6.5.0 melalui launcher baru. |
| Scoped doctor untuk Codex + skill | `healthy: true`; Node, registrasi Codex, dan identitas skill lolos. |
| Production MCP doctor | Initialize, inventory, identitas server/katalog, dan request binary_session lolos; 207 tool dan 6 prompt sesuai. |
| MCP melalui konfigurasi Codex yang tersimpan | Handshake berhasil dengan versi 6.5.0 dan katalog yang sama; 3.143 detik. |
| Discovery browser | Halaman fixture ditemukan melalui endpoint CDP loopback dan filter origin yang tepat. |
| Inspeksi halaman | DOM, accessibility, dan source JavaScript ditangkap sesuai scope permintaan. |
| Analisis bundle browser | Satu script dianalisis, 78 AST node, nol parse failure; pemanggilan fetch `/api/status` ditemukan. |
| Skenario interaksi browser | Mengisi input, mengeklik tombol, dan menunggu hasil; semua langkah completed. DOM akhir memuat `REA: MCP browser check passed`. |
| Capture jaringan skenario | Respons `/api/status` berstatus 200; sembilan event tersimpan, nol dropped event. |
| Analisis aplikasi JavaScript lokal | Satu file JavaScript diparse tanpa parse failure; summary dan parent Evidence tersimpan. |
| Ekspor Evidence | Enam record diekspor, termasuk parent Evidence analisis statis. |
| Cleanup | Browser uji dan server fixture berhenti; profil browser sementara dihapus; koneksi MCP uji ditutup. |

Semua pengujian analisis tersebut dijalankan melalui **server MCP REA**, bukan hanya lewat output help atau pemeriksaan keberadaan executable. Fixture merupakan bahan diagnostik lokal, bukan source atau rekonstruksi Muse.

Lihat [ringkasan bukti yang dapat dibaca mesin](../engineering/evidence/rea-audit-2026-10-18/summary.json) dan [screenshot hasil interaksi browser](../engineering/evidence/rea-audit-2026-10-18/browser-check.png).

## Evidence REA

- Discovery: `ev_1d4f3e97c5215b47179526136babe8f837c401d5112581639aa0865e46bcb19e`.
- Inspeksi halaman: `ev_85ea1af8cfda76a518a6ef3f653ab5c3224eb050edd3a5a03d23cccb9c3c0c79`.
- Analisis bundle browser: `ev_78166bd4f37a48e5105eca4526ccfd871ffc3aad81a5a08f567c35aa2cfdf13e`.
- Skenario browser: `ev_2bf191ead6e9a26ab367c64bc766c0b1c5220e5ed9d0b2ce02bf15db8c441f53`.
- Parent analisis JavaScript: `ev_04dd1d3b3d4dc823a985e1f6067780f0286752f2537f95a3337ea7428debc8fd`.
- Summary view JavaScript: `ev_335141d9f00bde3bd4e9b128ed4a82c09d81fa652b5704e76cad308ba365ffe8`.

Bundle asli berada di `/Users/vitoandareasmanik/.local/state/rea-audit/20261018T041055Z/evidence-bundle.json`. Identitas hash dan ukuran tercantum pada ringkasan bukti.

## Batas hasil

Audit meluluskan jalur MCP, browser, bundle, dan JavaScript yang diuji. Ini bukan pengujian seluruh 207 tool atau seluruh provider native/mobile/firmware.

Capture pasif tetap dibatasi waktu attachment dan opsi scope. Capture skenario mengembalikan status completeness `incomplete` untuk bagian events meskipun langkah, DOM akhir, serta respons API yang dipilih terverifikasi; sembilan event yang tersimpan tidak diperlakukan sebagai bukti seluruh aktivitas browser. Analisis statis juga mencatat semantic unknowns, bukan jaminan seluruh perilaku runtime berhasil direkonstruksi.

Sesi Muse pribadi belum ditangkap lewat REA. Investigasi Muse berikutnya dapat memakai browser dengan endpoint CDP yang tersedia atau mode launch milik REA; akses login dan scope target ditetapkan pada investigasi itu. Browser uji audit ini sudah ditutup.

## Penggunaan setelah perbaikan

```sh
rea --version
rea doctor --client codex --skill --json
rea mcp doctor --json
```

Restart/reconnect Codex sekali agar registrasi baru dimuat oleh agent, lalu verifikasi tool REA muncul sebelum melanjutkan investigasi Muse. Instalasi ulang setup bukan langkah rutin untuk setiap pemakaian.

Referensi: [readiness resmi REA](https://github.com/morluto/rea/blob/main/docs/installation.md#check-readiness-for-your-task), [workflow browser resmi](https://github.com/morluto/rea/blob/main/docs/browser-observation.md), skill lokal versi 42, serta hasil pengujian di atas.
