"""Opt-in direct pinned-native Muse image generation/edit smoke; never retries POST."""

import hashlib
import json
import os
import time
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]
private = ROOT / ".dev/nma037/muse"
private.mkdir(mode=0o700, parents=True, exist_ok=True)
os.environ["HERMES_HOME"] = str(private)
key = dotenv_values(ROOT / ".env").get("MUSE_API_KEY")
assert key, "MUSE_API_KEY is missing"
os.environ["NMA_MEDIA_KEY"] = key
(private / "config.yaml").write_text(
    "image_gen:\n  provider: openai\n  openai:\n    base_url: https://api.meta.ai/v1\n    model: muse-image-1.0\n    key_env: NMA_MEDIA_KEY\n"
)
from ngertiin_engine.media_provider import install, settings
from plugins.image_gen.openai import OpenAIImageGenProvider

install()
settings.set({})
results = []
source = None
for action, prompt in [
    (
        "generate",
        "A simple flat illustration of a single red circle on a white background. No text.",
    ),
    (
        "edit",
        "Change the red circle to a blue circle. Keep the white background and composition.",
    ),
]:
    started = time.monotonic()
    try:
        value = OpenAIImageGenProvider().generate(prompt, "square", image_url=source)
        item = {
            "action": action,
            "elapsed_seconds": time.monotonic() - started,
            "success": bool(value.get("success")),
            "provider": value.get("provider"),
            "model": value.get("model"),
        }
        if value.get("success"):
            source = value["image"]
            data = Path(source).read_bytes()
            import base64

            from gateway.session_ingress_media import sniff_image_mime

            source_path = source
            source = (
                "data:"
                + sniff_image_mime(data)
                + ";base64,"
                + base64.b64encode(data).decode()
            )
            from PIL import Image

            with Image.open(source_path) as image:
                image.load()
                item.update(format=image.format, width=image.width, height=image.height)
            item.update(
                sha256=hashlib.sha256(data).hexdigest(),
                byte_count=len(data),
                local_output=source_path,
            )
        else:
            item["error_type"] = value.get("error_type")
            item["error"] = str(value.get("error", "")).replace(key, "[REDACTED]")[
                :2000
            ]
    except Exception as exc:  # noqa: BLE001 - retain provider failures without leaking credentials
        item = {
            "action": action,
            "success": False,
            "error_type": type(exc).__name__,
            "error": str(exc).replace(key, "[REDACTED]")[:1000],
        }
    results.append(item)
    (ROOT / "docs/research/evidence/nma-037/muse-native-images.json").write_text(
        json.dumps(results, indent=2) + "\n"
    )
    print(json.dumps(item), flush=True)
    if not item["success"]:
        break
