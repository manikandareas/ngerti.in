"""One backend inventory for agent instructions and the capability reference UI."""

from ngertiin.config import get_settings


def inventory():
    settings = get_settings()
    model = bool(settings.openai_api_key.get_secret_value())
    computer = bool(settings.daytona_api_key.get_secret_value())
    return {
        "capabilities": [
            {
                "id": "chat",
                "title": "Berpikir dan menulis",
                "available": model,
                "description": "Diskusikan ide, tulis, ringkas, atau bandingkan pilihan.",
                "example": "Bantu aku merapikan ide ini menjadi rencana yang jelas.",
            },
            {
                "id": "library",
                "title": "Temukan pekerjaan lama",
                "available": True,
                "description": "Temukan percakapan, file, hasil, pekerjaan, tujuan, dan jadwal.",
                "example": "Cari laporan yang kita buat minggu lalu.",
            },
            {
                "id": "files",
                "title": "Olah file dan revisi hasil",
                "available": model,
                "description": "Lampirkan file atau pilih hasil, lalu jelaskan kebutuhanmu.",
                "example": "Bantu aku merevisi laporan yang dipilih supaya lebih singkat.",
            },
            {
                "id": "code",
                "title": "Hitung dan olah data",
                "available": model and computer and settings.sandbox_provider == "daytona",
                "description": "Pengolahan Python berjalan di sandbox dengan batas kerja.",
                "example": "Analisis CSV ini dan buat ringkasan beserta tabel hasilnya.",
            },
            {
                "id": "browser",
                "title": "Gunakan browser pribadi",
                "available": model and computer,
                "description": "Login lewat takeover. Tindakan mengikuti izin pengguna.",
                "example": "Buka situs yang aku pilih dan bantu periksa informasinya.",
            },
            {
                "id": "schedules",
                "title": "Pekerjaan terjadwal",
                "available": model,
                "description": "Tinjau waktu, instruksi, dan batas kerja sebelum aktivasi.",
                "example": "Siapkan jadwal mingguan untuk memperbarui laporan ini.",
            },
            {
                "id": "goals",
                "title": "Tujuan dan kemajuan",
                "available": model,
                "description": "Simpan target dan kriteria, lalu tinjau bukti kemajuannya.",
                "example": "Bantu aku menyiapkan tujuan beserta kriteria keberhasilannya.",
            },
            {
                "id": "proactivity",
                "title": "Bantuan spontan yang dapat diatur",
                "available": model
                and settings.proactive_enabled
                and bool(settings.typesafe_api_key.get_secret_value()),
                "description": "Gwen dapat memberi saran relevan. Atur atau matikan melalui chat.",
                "example": "Kurangi saran proaktif di percakapan ini.",
            },
            {
                "id": "persona",
                "title": "Karakter dan ingatan Gwen",
                "available": True,
                "description": "Tinjau karakter dan kontrol ingatan dari panel asisten.",
                "example": "Aku ingin meninjau cara Gwen menjawab dan ingatan tentangku.",
            },
        ]
    }
