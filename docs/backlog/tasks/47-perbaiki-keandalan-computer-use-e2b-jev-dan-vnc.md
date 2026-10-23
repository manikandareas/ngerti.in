# NG-047 · Perbaiki keandalan computer use E2B Jev dan VNC

Sumber: [Notion](https://app.notion.com/p/402abdd6187381faa59dc9440e9f5b84) · Readback: 2026-10-23T08:26:11.852Z

| Property | Value |
| --- | --- |
| Ticket | 47 |
| Urutan | 23.6 |
| Lingkup | Aktif V1 |
| Status | Backlog |
| Prioritas | P1 |
| Area | Agent |

<!-- notion-content:start -->
## Tujuan

Menjadikan computer use E2B/Jev mampu menyelesaikan riset publik secara otonom, dengan VNC yang dapat dipulihkan dan approval hanya untuk tindakan yang benar-benar memerlukannya. Tiket remediasi baru; status Done fondasi lama tidak direset.

## Bukti audit cepat

Tanggal audit: 2026-10-23.<br />[Thread lokal](http://localhost:3000/?thread=fa37b461-b872-52a8-a9e1-9d09794efc23), Task <code>d4f515dd-3a49-4a41-aa94-abb6b25669aa</code>. Tautan [localhost](http://localhost) hanya tersedia pada lingkungan development.

- 16:16:58 WITA: Task riset tren AI agent 2027 dimulai.
- 16:17:15: workspace ready; 16:17:20: satu navigasi Google selesai. Query masih berupa kalimat instruksi “Lakukan riset berbasis web tentang tren AI agent yang diperkirakan relevan pada 2027”.
- 16:17:26 dan 16:17:31: dua inspeksi ditolak stale. Action dan decision pada kedua record kosong; target/penyebab mismatch tidak dapat direkonstruksi.
- 16:17:38: waiting\_user / computer\_human, alasan “Target privat memerlukan takeover.” Tidak ada proposal approval tersimpan. Source code [steps.py](http://steps.py) mengangkat NeedsHuman sebelum menyimpan record keputusan takeover; URL/elemen pemicunya belum terbukti. Jangan menganggap ini pasti false positive.
- 16:19:03: cancelled; 16:19:05: session dan workspace stopped. task\_commands kosong, sehingga aktor pemicu pembatalan belum teratribusi dari data yang diperiksa.
- Enam model calls, 14.908 usage units; nol computer\_evidence dan nol computer\_candidates. Tidak ada laporan riset selesai.
- Policy aktual: E2B, workflow computer v2, Jev 1.13.0, metered\_browser\_work, 64 calls, 60 steps, 1.200 detik. Tidak ada bukti budget habis pada Task ini.
- Dua viewer grants pada control\_version 34 kini closed=true, connected=false. Ini bukti penutupan grant, bukan bukti bahwa frame VNC tampil baik atau reconnect/takeover berhasil.

## Kondisi implementasi saat ini

Fondasi E2B, Jev, jurnal aksi, metering, kontrol agent/manusia dan penutupan sesi tersedia. Pada penggunaan nyata ini, agent belum melewati tahap pencarian menjadi pembacaan sumber. Menghapus budget tidak menyelesaikan hambatan target stale dan keputusan takeover.<br />Audit ini memakai database/event historis dan pembacaan kode. Tidak menjalankan ulang Task, tidak mengukur frame VNC, tidak menguji ulang seluruh provider lifecycle. Tidak ada bukti outage E2B dari kasus ini.

## Perbaikan berurutan

1. Simpan intended action, URL/identitas target yang disanitasi, reason\_code, phase dan detail mismatch sebelum validasi/exception. Catat keputusan takeover serta sumber cancel; jangan menyimpan credential atau isi privat.
2. Perbaiki validasi target aksi rutin: gunakan identitas dan konteks elemen yang relevan; perubahan DOM tidak terkait tidak boleh menggagalkan search/input/link. Setelah stale, observasi ulang lalu replan dengan batas retry sederhana. Jangan mengulang mutation yang efeknya belum diketahui.
3. Bedakan elemen login/privat dari halaman publik yang memiliki tombol login. Bila sumber membutuhkan login dan tidak wajib untuk tujuan pengguna, pilih sumber publik alternatif. Takeover hanya bila akses privat memang diperlukan; approval aksi sensitif tetap terikat aksi/target aktual.
4. Bentuk query pencarian yang ringkas dari tujuan, dukung reformulasi, submit pencarian dan buka sumber. Kumpulkan sumber unik sebelum sintesis; hasil pencarian dan snapshot berulang tidak dihitung sebagai beberapa sumber independen.
5. Tangani error E2B/CDP/Jev/VNC pada boundary yang tepat: transient error dapat retry/reconnect terbatas, error permanen menghasilkan status dan langkah pemulihan yang jelas. Pertahankan evidence/checkpoint; jangan menelan error atau menyatakan sukses palsu. Stop/cancel harus selalu menghentikan input dan menutup grant.
6. Perjelas UI progress dan VNC: fase aktif, alasan menunggu, aksi yang dibutuhkan pengguna, reconnect, takeover/handback dan kondisi terminal. Tambahkan riwayat koneksi/revokasi dengan alasan agar masalah viewer bisa dibedakan dari browser agent.
7. Pertahankan metering dan batas operasional sederhana yang masuk akal, tanpa mengembalikan task token budget/finish reserve atau lapisan validasi berulang. Ukur hasil nyata sebelum menambah batas baru.

## Acceptance criteria

- [ ] Reproduksi kelas tugas riset publik ini pada E2B/Jev menghasilkan laporan dengan minimal tiga sumber unik yang benar-benar dibuka, judul/URL/tanggal, dan pemisahan fakta/proyeksi; bila tidak tersedia, hasil parsial menyebut kendala yang terbukti.
- [ ] Halaman publik dengan DOM dinamis, search field dan tombol login diuji; perubahan elemen tidak terkait tidak memicu stale palsu/takeover. Perubahan target sebenarnya tetap terdeteksi.
- [ ] Dua kegagalan stale berurutan memicu strategi baru yang tercatat, bukan loop aksi identik; tidak ada replay mutation dengan efek tidak diketahui.
- [ ] Sumber privat opsional dapat dilewati ke alternatif publik. Login/credential yang memang dibutuhkan meminta takeover dengan alasan yang spesifik. Aksi sensitif tetap melalui approval; aksi rutin tidak meminta approval berulang.
- [ ] Setiap stale/takeover/error/cancel dapat ditelusuri ke intended action, fase, alasan dan hasil, dengan data sensitif disanitasi.
- [ ] Uji VNC autentik: buka viewer, reconnect setelah jaringan putus/reload, grant kedaluwarsa, dua tab, takeover/handback, cancel saat aktif, desktop/mobile. Buktikan frame dan kontrol input, bukan hanya grant database.
- [ ] Fault injection timeout/provider/CDP/worker interruption menghasilkan retry terbatas atau status recoverable yang jelas, evidence tetap tersimpan dan tidak ada duplicate side effect.
- [ ] Setelah stop/cancel, input agent/manusia lama ditolak, grant ditutup dan sesi/provider direkonsiliasi; hasil parsial tetap dapat dibaca.
- [ ] Bukti uji situs nyata dan fixture disimpan terpisah; laporkan completion rate, stale/takeover rate, latency dan biaya. Hasil unit test tidak disamakan dengan kelulusan penggunaan nyata.

## Dependency dan verifikasi

Fondasi: [Referensi Notion](https://app.notion.com/p/3fdabdd618738198b295ca667c34f1b1) dan [Referensi Notion](https://app.notion.com/p/3feabdd6187381de93e2c5f70f0bd05e).<br />Hasil remediasi menjadi masukan benchmark [Referensi Notion](https://app.notion.com/p/3fdabdd6187381f8ade2c7db2c75396e).<br />Referensi repo: <code>docs/engineering/browser-simplification-2026-10-23.md</code>, <code>docs/engineering/computer-use-final-implementation-plan-2026-10-23.md</code>; implementasi terkait <code>computer/steps.py</code>, <code>supervisor.py</code>, <code>permissions.py</code>, <code>jev.py</code> dan viewer/control.<br />Status Backlog. Pembuatan tiket ini bukan bukti perbaikan selesai.
<!-- notion-content:end -->
