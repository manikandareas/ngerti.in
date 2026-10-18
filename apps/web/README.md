# Struktur web

Kode disusun berdasarkan domain, lalu dipisahkan menurut tanggung jawabnya. Buat hanya folder yang dibutuhkan fitur.

```text
src/
├── routes/                 # Route TanStack, validasi search, dan guard
├── ui/                     # Halaman aplikasi yang menggabungkan beberapa fitur
├── features/
│   └── <domain>/
│       ├── components/     # Tampilan dan interaksi milik domain
│       ├── hooks/          # State, efek, query, dan mutation
│       ├── api/            # Helper request khusus domain bila diperlukan
│       ├── utils/          # Transformasi dan logika murni
│       ├── config/         # Konfigurasi domain, misalnya navigasi workspace
│       ├── constants.ts    # Nilai runtime dan label domain
│       └── types.ts        # Kontrak dan tipe domain
├── components/             # UI bersama: app shell, brand, tema, dan status
│   └── ui/                 # Primitive shadcn
├── hooks/                  # Hooks lintas fitur, misalnya tema aplikasi
└── lib/                    # Transport HTTP dan integrasi library bersama
```

- Simpan kode sedekat mungkin dengan domain pemiliknya. Pindahkan ke folder bersama ketika dipakai lintas domain.
- Gunakan import langsung ke modul; `@/` menunjuk ke `src/`. Hindari barrel `index.ts` yang hanya mengekspor ulang.
- Route menangani routing dan sesi. `ui/workspace-page.tsx` serta `ui/workspace-panel.tsx` menggabungkan chat, task, penggunaan, dan pengaturan.
- Komponen bersama dan `lib/` tidak mengimpor fitur. Fitur tidak mengimpor halaman aplikasi di `ui/` atau route.
- Ketergantungan domain mengikuti kebutuhan produk: chat menampilkan task dan kuota; task dan kuota tidak mengimpor chat. Hindari ketergantungan melingkar.
- Letakkan akses data dan penyimpanan browser di hooks atau helper domain. Komponen menangani presentasi dan event UI; logika tanpa React berada di `utils/`.
- Pertahankan query key, polling, identitas akun/thread, draft, dan request key saat merapikan kode.

Jalankan `make check` dan `make build` dari root repo. Verifikasi perilaku aplikasi secara terpisah melalui browser.
