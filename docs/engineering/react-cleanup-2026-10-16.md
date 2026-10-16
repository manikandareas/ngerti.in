# Cleanup React — 16 Oktober 2026

Scope: frontend Chat dan diagnostik yang tersedia. Perubahan existing pada backend dan desain tetap dipertahankan; tidak dilakukan commit atau push.

## Pemisahan tanggung jawab

| Area | Sebelum | Sesudah |
| --- | --- | --- |
| `Thread` | 249 baris: draft, kirim, aksi run, transcript, composer | 93 baris: menyusun hooks dan UI; transcript, draft/idempotency, serta aksi run terpisah |
| `ChatPage` | Query/mutation thread dan listener panel bercampur dengan layout | `use-chat-threads` dan `use-chat-history`; state error/loading memakai komponen dengan early return |
| `/dev/system` | 198 baris berisi seluruh halaman | 10 baris untuk route/guard; implementasi di `features/diagnostics` |
| `FilePanel` | 184 baris | 93 baris, dengan hook file, form upload, dan baris file terpisah |
| `RunPanel` | 141 baris | 74 baris, dengan hook query/scheduling dan baris job terpisah |
| HTTP/DTO | Transport dan DTO diagnostik bercampur | DTO di fitur diagnostik; `lib/api.ts` untuk transport; download mutation dipakai bersama |

Reducer replay terpisah dari DTO chat. Status koneksi memakai union TypeScript. Cabang status bertingkat disederhanakan; Props baru bernama dan komponen tidak didefinisikan di dalam render. Request key, penyimpanan draft per akun/thread, cleanup listener/subscription, serta key komponen akun/thread tetap dipertahankan. Hook aksi run menyediakan `cancel` dan `retry` yang eksplisit.

Penghitung kesiapan sistem kini memakai jumlah komponen dari API. Delapan komponen berstatus ready ditampilkan sebagai 8/9 ketika Clerk masih berstatus configured.

## Verifikasi

- `make check`: Biome, TypeScript, Ruff lint/format, dan mypy (36 source files) lulus.
- `make build`: client/server production build lulus. Warning dependency module-level `use client` tetap muncul.
- Browser memakai aplikasi dan backend nyata dengan akun Clerk development yang sudah tersedia; tidak ada route atau harness fixture permanen.
- Kegagalan submit 503 disimulasikan di browser. Draft dan request key bertahan setelah reload. Retry nyata memakai key yang sama, jawaban berisi `4`, satu bubble assistant, draft serta pending key dibersihkan setelah sukses.
- Desktop 1440×900: buat side chat, panel tetap terbuka, main chat tetap terlihat saat pencarian kosong, Escape menutup panel dan memulihkan fokus, draft tetap ada.
- Mobile 390×844: Drawer dibuka/ditutup lewat pemilihan thread, draft dipulihkan setelah pindah ke main chat dan kembali. Kedua viewport tidak overflow horizontal.
- Diagnostik: identitas akun dan readiness terlihat; upload file contoh, batal hapus, dan konfirmasi hapus berhasil. Artifact yang sudah ada tetap tersimpan. Job diagnostik baru selesai dan muncul bersama job lama.

[Bukti JSON](evidence/react-cleanup/manual-acceptance.json), [desktop](evidence/react-cleanup/desktop.png), dan [mobile](evidence/react-cleanup/mobile.png).

Matriks crash/recovery/HITL tidak diulang penuh; [penerimaan #04](chat-04-implementation.md) dan bukti audit streaming sebelumnya tetap menjadi rujukan untuk bagian tersebut. Penutupan #04 tidak mencakup generation/player Course lengkap atau deploy production.
