"""One bounded OCR request; ambiguous dispatch is never retried by the client."""

import base64
import json

import httpx

from ngertiin.config import get_settings


class OcrFailure(ValueError):
    def __init__(self, message: str, *, unknown: bool):
        super().__init__(message)
        self.unknown = unknown


async def parse(data: bytes, content_type: str, rules: dict) -> tuple[dict, str | None]:
    key = get_settings().mistral_api_key.get_secret_value()
    if not key:
        raise OcrFailure("Mistral OCR belum dikonfigurasi.", unknown=False)
    uri = f"data:{content_type};base64," + base64.b64encode(data).decode("ascii")
    image = content_type.startswith("image/")
    document = (
        {"type": "image_url", "image_url": uri}
        if image
        else {
            "type": "document_url",
            "document_url": uri,
        }
    )
    request_id = None
    try:
        async with (
            httpx.AsyncClient(
                timeout=httpx.Timeout(90, connect=10), follow_redirects=False
            ) as client,
            client.stream(
                "POST",
                "https://api.mistral.ai/v1/ocr",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": rules["model"],
                    "document": document,
                    "include_image_base64": False,
                    "table_format": "html",
                },
            ) as response,
        ):
            request_id = response.headers.get("x-request-id")
            if response.status_code >= 400:
                raise OcrFailure(
                    f"Mistral OCR menolak permintaan ({response.status_code}). "
                    "Periksa akses/budget lalu coba ulang ekstraksi.",
                    unknown=response.status_code >= 500,
                )
            result = bytearray()
            async for chunk in response.aiter_bytes():
                result.extend(chunk)
                if len(result) > rules["max_extraction_bytes"]:
                    raise OcrFailure("Hasil OCR melebihi batas ekstraksi.", unknown=True)
            return json.loads(result), request_id
    except httpx.ConnectError as error:
        raise OcrFailure("Tidak dapat terhubung ke Mistral OCR.", unknown=False) from error
    except (httpx.HTTPError, ValueError) as error:
        if isinstance(error, OcrFailure):
            raise
        raise OcrFailure(
            "Outcome OCR belum terkonfirmasi. Biaya tetap dicadangkan; "
            "permintaan tidak diulang otomatis.",
            unknown=True,
        ) from error
