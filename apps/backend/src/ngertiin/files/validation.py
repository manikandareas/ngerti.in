"""Content validation and canonical, non-executable output manifests."""

import csv
import hashlib
import io
import json
import subprocess
import sys
from pathlib import PurePath

from ngertiin.files.contracts import OUTPUT_TYPES, TYPES, clean_name, policy


def validate_upload(filename: str, data: bytes) -> tuple[str, str, int]:
    name = clean_name(filename)
    extension = PurePath(name).suffix.lower()
    if extension not in TYPES:
        raise ValueError("Format didukung: PDF, PNG/JPG, TXT, MD, CSV dan JSON.")
    if not data or len(data) > policy()["max_file_bytes"]:
        raise ValueError("Ukuran file harus 1 byte sampai 10 MiB.")
    if extension in (".pdf", ".png", ".jpg", ".jpeg"):
        try:
            result = subprocess.run(
                [sys.executable, "-m", "ngertiin.files.inspect", extension],
                input=data,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=6,
                check=True,
            )
            pages = json.loads(result.stdout)["pages"]
        except (subprocess.SubprocessError, ValueError, KeyError) as error:
            raise ValueError(
                "File rusak/tidak sesuai format, PDF terkunci/melebihi 20 halaman, "
                "atau gambar melebihi 25 megapiksel."
            ) from error
    else:
        validate_text(data, extension)
        pages = 1
    return name, TYPES[extension], pages


def validate_text(data: bytes, extension: str):
    try:
        value = data.decode("utf-8-sig")
        if "\x00" in value:
            raise ValueError("binary")
        if extension == ".json":
            json.loads(value)
        elif extension == ".csv":
            csv.field_size_limit(1024 * 1024)
            for _ in csv.reader(io.StringIO(value), strict=True):
                pass
    except (UnicodeError, ValueError, RecursionError, csv.Error) as error:
        raise ValueError("File teks harus UTF-8 dan isi JSON/CSV harus valid.") from error


def outputs(draft: str, specs: list[dict]) -> dict:
    try:
        value = json.loads(draft)
        if not isinstance(value, dict) or not isinstance(value.get("files"), list):
            raise ValueError("envelope")
        files = value["files"]
        if len(files) != len(specs):
            raise ValueError("count")
        total = 0
        for file, spec in zip(files, specs, strict=True):
            if (
                not isinstance(file, dict)
                or file.get("filename") != spec["filename"]
                or not isinstance(file.get("content"), str)
                or not file["content"].strip()
            ):
                raise ValueError("content")
            body = file["content"].encode("utf-8")
            total += len(body)
            if len(body) > policy()["max_file_bytes"]:
                raise ValueError("size")
            if spec["format"] in ("json", "csv"):
                validate_text(body, "." + spec["format"])
            file["content_type"] = OUTPUT_TYPES["." + spec["format"]]
            file["sha256"] = hashlib.sha256(body).hexdigest()
            file["size"] = len(body)
        if total > policy()["max_output_bytes"]:
            raise ValueError("total")
        summary = value.get("summary", "Hasil tersimpan.")
        if not isinstance(summary, str) or len(summary) > 6000:
            raise ValueError("summary")
        return {"summary": summary, "files": files}
    except (TypeError, KeyError, ValueError, RecursionError) as error:
        raise ValueError(
            "Berkas hasil belum lengkap atau formatnya tidak valid. Draft tetap tersimpan."
        ) from error
