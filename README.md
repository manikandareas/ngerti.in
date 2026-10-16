# Ngertiin

Agent belajar personal untuk pelajar SMA dan mahasiswa. Spesifikasi dan backlog berasal dari [Notion](https://app.notion.com/p/3f8abdd6187381e39753f0d54ee2556b); salinan lokal dimulai dari [docs/README.md](docs/README.md).

## Development

Prasyarat: Docker/Compose, Bun 1.3.10, Node.js 22.12+, dan uv. uv mengelola Python 3.13. PostgreSQL/pgvector dan MinIO berjalan di Docker; web, API, dan worker berjalan di mesin.

```sh
cp .env.example .env
# Isi key Clerk development dan OPENAI_API_KEY di .env.
make install
make infra-up
make setup
make dev
```

Jangan menyalin `.env.example` di atas `.env` yang sudah berisi credentials. Build MinIO pertama mengunduh binary release resmi yang dipin dan memeriksa checksum. Namespace Compose `ngertiin-v1` serta volume terpisah menjaga data prototipe tetap terpisah.

- Web: <http://127.0.0.1:3000>
- Diagnostik development: <http://127.0.0.1:3000/dev/system>
- API: <http://127.0.0.1:8000/docs>
- MinIO Console: <http://127.0.0.1:9001>
- PostgreSQL: `localhost:5433`

Jika ingin terminal terpisah, jalankan `make api`, `make worker`, dan `make web`. `make infra-down` menghentikan container tanpa menghapus volume. Ctrl+C pada `make dev` menghentikan ketiga proses aplikasi.

## Pemeriksaan

```sh
make check
make build
```

Checks hanya lint, formatting, typecheck, dan build. Validasi fitur dilakukan manual di browser. Lihat [panduan development](docs/engineering/development.md), [checklist penerimaan #02](docs/engineering/foundation-02-manual-acceptance.md), dan [tiket fondasi](docs/backlog/tasks/02-fondasi-production-workspace-auth-dan-data.md).

Chat personal #04 tersedia di halaman utama setelah login: main/side chat, streaming yang dapat dilanjutkan, tool, approval, stop, dan recovery worker. Lihat [implementasi dan penerimaan #04](docs/engineering/chat-04-implementation.md). `/course` menyimpan tujuan setelah persetujuan; sumber, outline, dan materi mengikuti backlog #07–09.

## Batas modul

`apps/web` menangani UI. `apps/backend/src/ngertiin` adalah satu package Python untuk API dan worker. Account ownership dan data aplikasi dimiliki backend; Procrastinate mengantarkan pekerjaan, sedangkan LangGraph menyimpan kemajuan workflow. Dokumentasi setup dan migrasi adalah bagian dari deliverable fondasi.
