"""Owner-private native image provider adaptation; no managed gateway or host paths."""

import base64
import json
import os
from contextvars import ContextVar
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, digest
from ngertiin_engine.provider_secrets import Vault

settings = ContextVar("nma_media_settings", default=None)
TOOLS = {"image_generate"}


class MediaProvider:
    def __init__(self, home, owner):
        self.home, self.owner = Path(home), owner
        self.vault = Vault(home, owner, directory="media-secrets")
        self.identity = str(uuid5(NAMESPACE_URL, owner + ":media:v1"))

    def read(self):
        try:
            value = self.vault.read(self.identity)
            from ngertiin_engine.redaction import remember

            remember({"api_key": value["api_key"]})
            return value
        except EngineError as exc:
            if exc.code != "CREDENTIAL_UNAVAILABLE":
                raise
            return None

    def configure(self, payload):
        if (
            set(payload) != {"provider", "api_key", "expected_generation"}
            or payload["provider"] != "meta"
        ):
            raise EngineError("INVALID_CONFIGURATION")
        if (
            not isinstance(payload["api_key"], str)
            or not 1 <= len(payload["api_key"]) <= 16000
        ):
            raise EngineError("INVALID_CONFIGURATION")
        with self.vault.locked(self.identity):
            old = self.read()
            generation = old["metadata"]["generation"] if old else 0
            if (
                type(payload["expected_generation"]) is not int
                or generation != payload["expected_generation"]
            ):
                raise EngineError("REVISION_CONFLICT")
            metadata = {
                "provider": "meta",
                "model": "muse-image-1.0",
                "generation": generation + 1,
                "status": "configured",
                "operations": ["generate", "edit"],
                "upscale": False,
            }
            self.vault.write(
                self.identity, {"metadata": metadata, "api_key": payload["api_key"]}
            )
            return metadata

    def listing(self):
        value = self.read()
        return {"configuration": value["metadata"] if value else None}

    def disconnect(self):
        with self.vault.locked(self.identity):
            value = self.read()
            if not value:
                raise EngineError("NOT_FOUND")
            value["api_key"] = ""
            value["metadata"].update(
                status="disconnected", generation=value["metadata"]["generation"] + 1
            )
            self.vault.write(self.identity, value)
            return value["metadata"]

    def catalog(self):
        value = self.read()
        metadata = value["metadata"] if value else {}
        ready = metadata.get("status") == "configured"
        tools = {}
        surfaces = {}
        for grant, toolset, label in (
            ("media_images", "image_gen", "Muse images"),
            ("media_vision", "vision", "Muse vision"),
            ("media_video", "video", "Muse video understanding"),
        ):
            surface = "nma_" + grant
            tools[grant] = {
                "enabled": ready,
                "label": label,
                "toolset": toolset,
                "execution_surface": surface,
            }
            surfaces[surface] = {
                "kind": "scoped_media",
                "ready": ready,
                "configuration": metadata,
                "reason": "media_provider_required",
            }
        return tools, surfaces


def owner_media():
    return MediaProvider(os.environ["HERMES_HOME"], os.environ["NMA_OWNER_ID"])


def invoke(name, arguments, marker, database, owner):
    if name not in TOOLS or "media_images" not in marker["grants"].get(
        "tool_grants", []
    ):
        return False, None
    media = owner_media()
    with media.vault.locked(media.identity):
        return _invoke(name, arguments, marker, database, owner)


def _invoke(name, arguments, marker, database, owner):
    if name not in TOOLS or "media_images" not in marker["grants"].get(
        "tool_grants", []
    ):
        return False, None
    from agent.secret_scope import reset_secret_scope, set_secret_scope
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    from ngertiin_engine.app_interactions import _store_factory
    from ngertiin_engine.capabilities import authorize
    from ngertiin_engine.files import Files
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.native_surface import call_identity
    from ngertiin_engine.reliability import execution

    if _store_factory is None or execution.get() is None or call_identity.get() is None:
        raise EngineError("ACCESS_REVOKED")
    store = _store_factory()
    _, config, _ = store.write(lambda conn: Goals(store).scope(conn, execution.get()))
    authorize(marker, database, owner)
    value = owner_media().read()
    # Catalog snapshot authorization above includes provider generation. Recheck
    # it immediately before reading credentials and issuing the billed request.
    if not value or value["metadata"].get("status") != "configured":
        raise EngineError("CAPABILITY_UNAVAILABLE")
    args = dict(arguments)
    if (
        not isinstance(args.get("prompt"), str)
        or not args["prompt"].strip()
        or len(args["prompt"]) > 100000
    ):
        return True, json.dumps(
            {"error": "INVALID_MEDIA_PROMPT", "outcome": "rejected"}
        )
    if set(args) - {
        "prompt",
        "aspect_ratio",
        "image_url",
        "reference_image_urls",
        "upscale",
    }:
        return True, json.dumps(
            {"error": "UNSUPPORTED_MEDIA_CONTROL", "outcome": "rejected"}
        )
    if args.get("upscale"):
        return True, json.dumps(
            {
                "error": "UNSUPPORTED_MEDIA_CONTROL",
                "details": {"field": "upscale", "provider": "meta"},
                "outcome": "rejected",
            }
        )
    if args.get("aspect_ratio", "landscape") not in {"landscape", "portrait", "square"}:
        return True, json.dumps(
            {
                "error": "UNSUPPORTED_MEDIA_CONTROL",
                "details": {"field": "aspect_ratio"},
                "outcome": "rejected",
            }
        )

    def reference(ref):
        if not isinstance(ref, str) or not ref.startswith("artifact:"):
            raise EngineError(
                "MEDIA_REFERENCE_REQUIRED", {"format": "artifact:<artifact_id>"}
            )
        files = Files(store)
        item = store.write(
            lambda conn: files.get(
                conn, ref.removeprefix("artifact:"), thread_id=config["thread_id"]
            )
        )
        data = files.bytes(item)
        from gateway.session_ingress_media import sniff_image_mime

        mime = sniff_image_mime(data)
        if not mime or mime != item["media_type"]:
            raise EngineError("UNSUPPORTED_MEDIA")
        return "data:" + mime + ";base64," + base64.b64encode(data).decode()

    try:
        source = reference(args["image_url"]) if args.get("image_url") else None
        refs = args.get("reference_image_urls") or []
        if not isinstance(refs, list) or len(refs) > 10:
            raise EngineError("INVALID_REQUEST")
        refs = [reference(ref) for ref in refs]
    except EngineError as exc:
        return True, json.dumps(
            {"error": exc.code, "details": exc.details, "outcome": "rejected"}
        )
    home = (
        owner_media().home
        / "media-cache"
        / digest(
            [
                owner,
                config["agent_id"],
                config["thread_id"],
                config["context_generation"],
            ]
        )
    )
    home.mkdir(mode=0o700, parents=True, exist_ok=True)
    native = {
        "provider": "openai",
        "openai": {
            "base_url": "https://api.meta.ai/v1",
            "model": "muse-image-1.0",
            "key_env": "NMA_MEDIA_KEY",
        },
    }
    st = settings.set(native)
    ht = set_hermes_home_override(home)
    secret = set_secret_scope(
        {"NMA_MEDIA_KEY": value["api_key"]}, profile_home=str(home)
    )
    try:
        from plugins.image_gen.openai import OpenAIImageGenProvider

        # Native SDK defaults retry requests; generation ACK loss must never
        # cause an implicit second billed submission.
        result = OpenAIImageGenProvider().generate(
            args.get("prompt", ""),
            args.get("aspect_ratio", "landscape"),
            image_url=source,
            reference_image_urls=refs,
        )
        if result.get("success"):
            result["provider"] = "meta"
            image = Path(result["image"]).resolve()
            if not image.is_relative_to(home.resolve()) or image.is_symlink():
                raise EngineError("MEDIA_OUTPUT_REFUSED")
            data = image.read_bytes()
            from gateway.session_ingress_media import sniff_image_mime

            mime = sniff_image_mime(data)
            if not mime:
                raise EngineError("UNSUPPORTED_MEDIA")
            ids = call_identity.get()
            operation = digest(
                [config["thread_id"], ids.turn_id, ids.tool_call_id, name]
            )
            from ngertiin_engine.reliability import Reliability

            def publish(conn):
                run, live, _ = Goals(store).scope(conn, execution.get())
                item = Files(store).publish(
                    conn,
                    operation,
                    live,
                    run,
                    "image."
                    + {
                        "image/png": "png",
                        "image/jpeg": "jpg",
                        "image/webp": "webp",
                        "image/gif": "gif",
                    }[mime],
                    mime,
                    data,
                )
                Reliability(store).append(conn, run, live, "artifact.ready", item)
                return item

            item = store.write(publish)
            result.update(image="artifact:" + item["artifact_id"], artifacts=[item])
        return True, json.dumps(result)
    finally:
        reset_secret_scope(secret)
        reset_hermes_home_override(ht)
        settings.reset(st)


def install():
    from plugins.image_gen import openai as provider

    original = provider._build_client

    def client(*args, **kwargs):
        value = original(*args, **kwargs)
        return (
            value.with_options(max_retries=0, timeout=180)
            if settings.get() is not None
            else value
        )

    provider._build_client = client


def schema():
    """Retain native prompt/aspect fields; replace host/URL refs with scoped IDs."""
    from copy import deepcopy

    from tools.image_generation_tool import IMAGE_GENERATE_SCHEMA

    value = deepcopy(IMAGE_GENERATE_SCHEMA)
    value["description"] = (
        "Generate or edit a Muse image. Use artifact:<artifact_id> for authorized reference images. Results are retained conversation artifacts. Upscaling is unavailable."
    )
    fields = value["parameters"]["properties"]
    fields["image_url"] = {
        "type": "string",
        "description": "Source image to edit: artifact:<artifact_id>.",
    }
    fields["reference_image_urls"] = {
        "type": "array",
        "items": {"type": "string"},
        "maxItems": 10,
        "description": "Additional authorized artifact:<artifact_id> image references.",
    }
    return value
