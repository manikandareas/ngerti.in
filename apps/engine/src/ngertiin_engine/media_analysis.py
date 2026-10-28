"""Native vision/video tools with owner-authorized artifacts and a direct Muse route."""

import asyncio
import json
import os
import subprocess
import tempfile
from contextvars import ContextVar
from pathlib import Path

from ngertiin_engine.contracts import EngineError
from ngertiin_engine.media_provider import owner_media

active = ContextVar("nma_media_analysis", default=None)
TOOLS = {
    "vision_analyze": ("media_vision", "image_url", "image/", ".png"),
    "video_analyze": ("media_video", "video_url", "video/", ".mp4"),
}


def install():
    from tools import vision_tools

    vision_tools._load_auxiliary_client()
    original = vision_tools.async_call_llm

    async def call(**kwargs):
        key = active.get()
        if key is None:
            return await original(**kwargs)
        from openai import AsyncOpenAI

        async with AsyncOpenAI(
            api_key=key, base_url="https://api.meta.ai/v1", max_retries=0, timeout=180
        ) as client:
            return await client.chat.completions.create(
                model="muse-spark-1.3", messages=kwargs["messages"]
            )

    vision_tools.async_call_llm = call


def schema(name):
    from copy import deepcopy

    from tools.vision_tools import VIDEO_ANALYZE_SCHEMA, VISION_ANALYZE_SCHEMA

    value = deepcopy(
        VISION_ANALYZE_SCHEMA if name == "vision_analyze" else VIDEO_ANALYZE_SCHEMA
    )
    field = TOOLS[name][1]
    value["description"] = (
        "Analyze authorized media with Muse Spark. Use artifact:<artifact_id>; video also accepts an HTTPS URL explicitly posted by the user in this conversation."
    )
    value["parameters"]["properties"][field]["description"] = (
        "Authorized artifact:<artifact_id>. For video, an HTTPS URL posted by the user in this conversation is also accepted. No host paths."
    )
    return value


def invoke(name, arguments, marker, database, owner):
    if name not in TOOLS or TOOLS[name][0] not in marker["grants"].get(
        "tool_grants", []
    ):
        return False, None
    from tools.vision_tools import video_analyze_tool, vision_analyze_tool

    from ngertiin_engine.app_interactions import _store_factory
    from ngertiin_engine.capabilities import authorize
    from ngertiin_engine.files import Files
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.reliability import execution

    if _store_factory is None or execution.get() is None:
        raise EngineError("ACCESS_REVOKED")
    store = _store_factory()
    _, config, _ = store.write(lambda conn: Goals(store).scope(conn, execution.get()))
    _, field, prefix, extension = TOOLS[name]
    ref = arguments.get(field)
    if not isinstance(ref, str) or not (
        ref.startswith("artifact:")
        or (name == "video_analyze" and ref.startswith("https://"))
    ):
        return True, json.dumps(
            {"error": "MEDIA_REFERENCE_REQUIRED", "outcome": "rejected"}
        )
    media = owner_media()
    with media.vault.locked(media.identity):
        authorize(marker, database, owner)
        value = media.read()
        files = Files(store)
        try:
            if ref.startswith("https://"):
                from ngertiin_engine.media_sources import authorized_url

                item = authorized_url(store, config, ref, execution.get())
            else:
                item = store.write(
                    lambda conn: files.get(
                        conn,
                        ref.removeprefix("artifact:"),
                        thread_id=config["thread_id"],
                    )
                )
            if not item["media_type"].startswith(prefix):
                raise EngineError("UNSUPPORTED_MEDIA")
            data = files.bytes(item)
        except EngineError as exc:
            return True, json.dumps({"error": exc.code, "outcome": "rejected"})
        with tempfile.TemporaryDirectory(
            prefix="nma-analysis-", dir=media.home
        ) as directory:
            if name == "vision_analyze":
                from gateway.session_ingress_media import sniff_image_mime

                mime = sniff_image_mime(data)
                if mime is None or mime != item["media_type"]:
                    return True, json.dumps(
                        {"error": "UNSUPPORTED_MEDIA", "outcome": "rejected"}
                    )
                extension = {
                    "image/png": ".png",
                    "image/webp": ".webp",
                    "image/jpeg": ".jpg",
                    "image/gif": ".gif",
                }[mime]
            else:
                extension = {
                    "video/mp4": ".mp4",
                    "video/webm": ".webm",
                    "video/quicktime": ".mov",
                }.get(item["media_type"])
                if extension is None:
                    return True, json.dumps(
                        {"error": "UNSUPPORTED_MEDIA", "outcome": "rejected"}
                    )
            path = Path(directory) / ("input" + extension)
            path.write_bytes(data)
            metadata = {}
            if name == "video_analyze":
                try:
                    result = subprocess.run(
                        [
                            "ffprobe",
                            "-v",
                            "error",
                            "-protocol_whitelist",
                            "pipe",
                            "-show_entries",
                            "format=duration:stream=codec_name,codec_type,width,height",
                            "-of",
                            "json",
                            "pipe:0",
                        ],
                        input=data,
                        check=True,
                        capture_output=True,
                        env={"PATH": os.environ.get("PATH", "")},
                        timeout=15,
                    )
                    metadata = json.loads(result.stdout)
                    if not any(
                        stream.get("codec_type") == "video"
                        for stream in metadata.get("streams", [])
                    ):
                        raise ValueError
                except (OSError, subprocess.SubprocessError, ValueError):
                    return True, json.dumps(
                        {"error": "UNSUPPORTED_MEDIA", "outcome": "rejected"}
                    )
            token = active.set(value["api_key"])
            try:
                question = arguments.get("question", "Describe this media.")
                result = (
                    asyncio.run(
                        vision_analyze_tool(
                            str(path),
                            question,
                            "muse-spark-1.3",
                            region=arguments.get("region"),
                        )
                    )
                    if name == "vision_analyze"
                    else asyncio.run(
                        video_analyze_tool(str(path), question, "muse-spark-1.3")
                    )
                )
                decoded = json.loads(result)
                decoded.update(
                    artifact_id=item["artifact_id"],
                    provider="meta",
                    model="muse-spark-1.3",
                    media_metadata=metadata,
                )
                return True, json.dumps(decoded)
            finally:
                active.reset(token)
