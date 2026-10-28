"""Translate authorized immutable image artifacts into native Hermes admission parts."""

from ngertiin_engine.contracts import EngineError
from ngertiin_engine.files import Files


def submission(store, payload, config=None):
    """Reauthorize on every admission attempt, including outbox recovery.

    Paths are created by the adapter in the native staging directory, never
    supplied by a client. Hermes captures immutable bytes and owns their lifetime.
    Original product artifact/message identities remain unchanged.
    """
    from gateway.platforms.base import get_image_cache_dir
    from gateway.session_ingress_media import sniff_image_mime

    files = Files(store)
    items = store.write(
        lambda conn: files.attachments(
            conn, payload["thread_id"], payload.get("attachment_ids", [])
        )
    )
    result = {"text": payload["text"]}
    images = []
    for item in items:
        if not item["media_type"].startswith("image/"):
            continue
        data = files.bytes(item)
        mime = sniff_image_mime(data)
        if mime is None or mime != item["media_type"]:
            raise EngineError(
                "UNSUPPORTED_MEDIA",
                {
                    "artifact_id": item["artifact_id"],
                    "reason": "invalid_image_bytes_or_type",
                },
            )
        # Decode as well as sniff: a header alone is not a usable image.
        from io import BytesIO

        from PIL import Image

        try:
            with Image.open(BytesIO(data)) as image:
                image.verify()
        except (OSError, ValueError, Image.DecompressionBombError):
            raise EngineError(
                "UNSUPPORTED_MEDIA", {"reason": "invalid_image_bytes"}
            ) from None
        extension = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }[mime]
        path = get_image_cache_dir() / ("nma_" + item["sha256"] + extension)
        files.atomic(path, data)
        images.append({"path": str(path), "mime": mime})
    if images:
        if config is not None:
            from agent.image_routing import _lookup_supports_vision

            provider = config.get("nma_provider", {}).get(
                "provider_id", config.get("provider", "custom")
            )
            native = _lookup_supports_vision(provider, config["model"], {}) is True
            if not native:
                grants = (
                    config.get("nma_capabilities", {})
                    .get("grants", {})
                    .get("tool_grants", [])
                )
                if "media_vision" not in grants:
                    raise EngineError(
                        "MEDIA_ROUTE_UNAVAILABLE",
                        {
                            "reason": "vision_capable_primary_or_muse_vision_grant_required"
                        },
                    )
                result["text"] += (
                    "\nUse vision_analyze to inspect these authorized images before answering: "
                    + ", ".join(
                        "artifact:" + item["artifact_id"]
                        for item in items
                        if item["media_type"].startswith("image/")
                    )
                )
                return result
        result["attachments"] = images
    return result
