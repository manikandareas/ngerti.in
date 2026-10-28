"""Scoped media configuration/admission and opt-in actual native Muse generation."""

# ruff: noqa: F811
import base64
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

import pytest
from test_capabilities import capability_agent
from test_direct_messages import send, snapshot
from test_runtime import Model, command, runtime, settle  # noqa: F401


def test_media_configuration_is_private_and_revision_checked(runtime):
    root, _, call, *_ = runtime
    payload = {
        "provider": "meta",
        "api_key": "disposable-media-key",
        "expected_generation": 0,
    }
    result = call(command("media.configure", payload))
    assert result["result"]["generation"] == 1, result
    assert "api_key" not in json.dumps(call(command("media.list")))
    assert (
        call(command("media.configure", payload))["error"]["code"]
        == "REVISION_CONFLICT"
    )
    agent = capability_agent(call, "media-agent", tool_grants=["media_images"])
    # The fixture may not offer a separate catalog command. Agent creation proves resolution.
    assert agent["config"]["tool_grants"] == ["media_images"]
    state = (root / "state/state.db").read_bytes()
    assert b"disposable-media-key" not in state
    assert call(command("media.disconnect"))["result"]["status"] == "disconnected"


def test_native_image_admission_validates_scope_and_bytes(runtime, monkeypatch):
    from io import BytesIO

    from gateway.platforms import base
    from ngertiin_engine.contracts import EngineError
    from ngertiin_engine.files import Files
    from ngertiin_engine.media_inputs import submission
    from PIL import Image

    root, _, call, *_ = runtime
    monkeypatch.setenv("HERMES_HOME", str(root / "state"))
    source = BytesIO()
    Image.new("RGB", (8, 8), "red").save(source, format="PNG")
    data = source.getvalue()
    identity = str(uuid4())
    agent = capability_agent(call, "media-input")
    thread = agent["primary_dm_thread_id"]
    p = {
        "artifact_id": identity,
        "thread_id": thread,
        "filename": "input.png",
        "media_type": "image/png",
        "sha256": hashlib.sha256(data).hexdigest(),
        "byte_count": len(data),
    }
    assert "result" in call(command("file.begin", p))
    call(
        command(
            "file.part",
            {
                "artifact_id": identity,
                "index": 0,
                "data_base64": base64.b64encode(data).decode(),
            },
        )
    )
    item = call(command("file.finalize", {"artifact_id": identity}))["result"]

    class Store:
        owner = "fixture"

        def write(self, fn):
            return fn(None)

    monkeypatch.setattr(
        Files,
        "attachments",
        lambda self, conn, tid, ids: (
            [item] if tid == thread else (_ for _ in ()).throw(EngineError("NOT_FOUND"))
        ),
    )
    monkeypatch.setattr(base, "get_image_cache_dir", lambda: root / "images")
    first = submission(
        Store(), {"thread_id": thread, "text": "Inspect", "attachment_ids": [identity]}
    )
    assert Path(first["attachments"][0]["path"]).read_bytes() == data
    assert first == submission(
        Store(), {"thread_id": thread, "text": "Inspect", "attachment_ids": [identity]}
    )
    with pytest.raises(EngineError, match="NOT_FOUND"):
        submission(
            Store(),
            {
                "thread_id": str(uuid4()),
                "text": "Inspect",
                "attachment_ids": [identity],
            },
        )
    item["media_type"] = "image/jpeg"
    with pytest.raises(EngineError, match="UNSUPPORTED_MEDIA"):
        submission(
            Store(),
            {"thread_id": thread, "text": "Inspect", "attachment_ids": [identity]},
        )

    item["media_type"] = "image/png"
    from agent import image_routing

    monkeypatch.setattr(
        image_routing, "_lookup_supports_vision", lambda *args, **kwargs: False
    )
    config = {"model": "text-only", "provider": "custom"}
    with pytest.raises(EngineError, match="MEDIA_ROUTE_UNAVAILABLE"):
        submission(
            Store(),
            {"thread_id": thread, "text": "Inspect", "attachment_ids": [identity]},
            config,
        )
    config["nma_capabilities"] = {"grants": {"tool_grants": ["media_vision"]}}
    aux = submission(
        Store(),
        {"thread_id": thread, "text": "Inspect", "attachment_ids": [identity]},
        config,
    )
    assert "attachments" not in aux and "artifact:" + identity in aux["text"]


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_MUSE"),
    reason="Opt-in billed Muse image generation/edit",
)
def test_muse_images_through_gateway(runtime, monkeypatch):
    from dotenv import dotenv_values
    from test_runtime import SOURCE

    key = dotenv_values(SOURCE.parents[2] / ".env").get("MUSE_API_KEY")
    assert key
    root, server, call, start, *_ = runtime
    metadata = call(command("media.list"))["result"]["configuration"]
    generation = metadata["generation"] if metadata else 0
    configured = call(
        command(
            "media.configure",
            {"provider": "meta", "api_key": key, "expected_generation": generation},
        )
    )
    assert "result" in configured
    agent = capability_agent(
        call, "muse-live", tool_grants=["media_images", "media_vision", "media_video"]
    )
    thread = call(command("thread.read", {"thread_id": agent["primary_dm_thread_id"]}))[
        "result"
    ]

    def reply(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        server.requests.append(body)
        if not body.get("messages"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")
            return
        messages = body["messages"]
        if messages[-1]["role"] == "tool":
            message = {"role": "assistant", "content": "Image retained."}
        else:
            arguments = {
                "prompt": "A single red circle on white, flat illustration, no text.",
                "aspect_ratio": "square",
            }
            if getattr(server, "media_reference", None):
                arguments.update(
                    prompt="Change only the red circle to blue.",
                    image_url="artifact:" + server.media_reference,
                )
            tool_name = getattr(server, "media_tool", "image_generate")
            if tool_name != "image_generate":
                arguments = {
                    "image_url"
                    if tool_name == "vision_analyze"
                    else "video_url": "artifact:" + server.media_reference,
                    "question": "Describe the visible colors and shapes precisely.",
                }
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "media-call",
                        "type": "function",
                        "function": {
                            "name": "tool_call",
                            "arguments": json.dumps(
                                {
                                    "calls": [
                                        {
                                            "name": "image_generate",
                                            "arguments": arguments,
                                        }
                                    ]
                                }
                            ),
                        },
                    }
                ],
            }
        payload = json.dumps(
            {
                "id": "media-model",
                "object": "chat.completion",
                "choices": [
                    {
                        "index": 0,
                        "message": message,
                        "finish_reason": "tool_calls"
                        if message.get("tool_calls")
                        else "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            }
        ).encode()
        if body.get("stream"):
            delta = dict(message)
            if delta.get("tool_calls"):
                delta["tool_calls"] = [{"index": 0, **delta["tool_calls"][0]}]
            payload = (
                "data: "
                + json.dumps(
                    {
                        "id": "media-model",
                        "choices": [
                            {
                                "index": 0,
                                "delta": delta,
                                "finish_reason": "tool_calls"
                                if message.get("tool_calls")
                                else "stop",
                            }
                        ],
                    }
                )
                + "\n\ndata: [DONE]\n\n"
            ).encode()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            "text/event-stream" if body.get("stream") else "application/json",
        )
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    monkeypatch.setattr(Model, "do_POST", reply)
    for phase in ("generate", "edit"):
        body = send(thread, "Please " + phase + " an image")
        result = call(body)["result"]
        import time

        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            final = call(command("runtime.read", {"run_id": result["run_id"]}))[
                "result"
            ]
            if final["status"] not in {"queued", "running"}:
                break
            time.sleep(0.2)
        assert final["status"] == "succeeded", final
        state = snapshot(call, thread)
        artifacts = state["artifacts"]
        assert len(artifacts) == (1 if phase == "generate" else 2), state
        assert call(body)["result"]["run_id"] == result["run_id"]
        server.media_reference = artifacts[0]["artifact_id"]
        print("MUSE_GATEWAY", phase, json.dumps(artifacts), flush=True)
    start.current.kill()
    start.current.wait(timeout=10)
    start()
    assert len(snapshot(call, thread)["artifacts"]) == 2
    call(command("media.disconnect"))
    # Test secrets must not survive in retained fixture directories.
    import shutil

    shutil.rmtree(root / "state/media-secrets")


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_MUSE"), reason="Opt-in billed Muse transcription"
)
def test_muse_transcription_receipt_and_restart(runtime):
    import shutil

    from dotenv import dotenv_values
    from test_runtime import SOURCE

    root, _, call, start, *_ = runtime
    key = dotenv_values(SOURCE.parents[2] / ".env")["MUSE_API_KEY"]
    metadata = call(command("media.list"))["result"]["configuration"]
    configured = call(
        command(
            "media.configure",
            {
                "provider": "meta",
                "api_key": key,
                "expected_generation": metadata["generation"] if metadata else 0,
            },
        )
    )
    assert "result" in configured
    try:
        agent = capability_agent(call, "voice-live")
        thread = agent["primary_dm_thread_id"]
        data = (SOURCE.parents[2] / ".dev/nma037/speech.wav").read_bytes()
        identity = str(uuid4())
        call(
            command(
                "file.begin",
                {
                    "artifact_id": identity,
                    "thread_id": thread,
                    "filename": "speech.wav",
                    "media_type": "audio/wav",
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "byte_count": len(data),
                },
            )
        )
        call(
            command(
                "file.part",
                {
                    "artifact_id": identity,
                    "index": 0,
                    "data_base64": base64.b64encode(data).decode(),
                },
            )
        )
        assert "result" in call(command("file.finalize", {"artifact_id": identity}))
        body = command(
            "media.transcribe",
            {"artifact_id": identity, "thread_id": thread, "request_key": str(uuid4())},
        )
        first = call(body)["result"]
        print("MUSE_TRANSCRIPTION", json.dumps(first), flush=True)
        assert first["success"] and "circle" in first["transcript"].lower(), first
        assert call(body)["result"] == first
        start.current.kill()
        start.current.wait(timeout=10)
        start()
        assert call(body)["result"] == first
        other = capability_agent(call, "voice-other")
        forged = command(
            "media.transcribe",
            {**body["payload"], "thread_id": other["primary_dm_thread_id"]},
        )
        assert call(forged)["error"]["code"] == "NOT_FOUND"
    finally:
        call(command("media.disconnect"))
        shutil.rmtree(root / "state/media-secrets", ignore_errors=True)


@pytest.mark.skipif(
    not os.environ.get("NMA_TEST_MUSE"),
    reason="Opt-in billed native Muse image/video understanding",
)
def test_muse_understanding(runtime):
    import shutil
    import sqlite3
    from io import BytesIO

    from dotenv import dotenv_values
    from PIL import Image
    from test_runtime import SOURCE

    root, server, call, *_ = runtime
    key = dotenv_values(SOURCE.parents[2] / ".env")["MUSE_API_KEY"]
    metadata = call(command("media.list"))["result"]["configuration"]
    configured = call(
        command(
            "media.configure",
            {
                "provider": "meta",
                "api_key": key,
                "expected_generation": metadata["generation"] if metadata else 0,
            },
        )
    )
    assert "result" in configured
    try:
        agent = capability_agent(
            call, "understanding", tool_grants=["media_vision", "media_video"]
        )
        thread = call(
            command("thread.read", {"thread_id": agent["primary_dm_thread_id"]})
        )["result"]

        def respond(body, text):
            if body["messages"][-1]["role"] == "tool":
                return {"role": "assistant", "content": "Media interpreted."}
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": server.media_tool + "-analysis",
                        "type": "function",
                        "function": {
                            "name": "tool_call"
                            if server.media_tool == "video_analyze"
                            else server.media_tool,
                            "arguments": json.dumps(
                                {
                                    "calls": [
                                        {
                                            "name": server.media_tool,
                                            "arguments": {
                                                server.media_field: "artifact:"
                                                + server.media_reference,
                                                "question": "Describe the colors and geometric shapes visible.",
                                            },
                                        }
                                    ]
                                }
                                if server.media_tool == "video_analyze"
                                else {
                                    server.media_field: "artifact:"
                                    + server.media_reference,
                                    "question": "Describe the colors and geometric shapes visible.",
                                }
                            ),
                        },
                    }
                ],
            }

        server.goal_script = respond
        image = BytesIO()
        Image.new("RGB", (64, 64), "blue").save(image, format="PNG")
        for name, media_type, data in (
            ("vision_analyze", "image/png", image.getvalue()),
            (
                "video_analyze",
                "video/mp4",
                (SOURCE.parents[2] / ".dev/nma037/video.mp4").read_bytes(),
            ),
        ):
            identity = str(uuid4())
            call(
                command(
                    "file.begin",
                    {
                        "artifact_id": identity,
                        "thread_id": thread["thread_id"],
                        "filename": "input.png"
                        if name == "vision_analyze"
                        else "input.mp4",
                        "media_type": media_type,
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "byte_count": len(data),
                    },
                )
            )
            call(
                command(
                    "file.part",
                    {
                        "artifact_id": identity,
                        "index": 0,
                        "data_base64": base64.b64encode(data).decode(),
                    },
                )
            )
            assert "result" in call(command("file.finalize", {"artifact_id": identity}))
            server.media_reference, server.media_tool = identity, name
            server.media_field = (
                "image_url" if name == "vision_analyze" else "video_url"
            )
            run = call(send(thread, "Describe the authorized media"))["result"]
            settle(call, run["run_id"])
            with sqlite3.connect(root / "state/state.db") as db:
                receipt = db.execute(
                    "SELECT receipt FROM nma_effects WHERE run_id=?", (run["run_id"],)
                ).fetchone()
            assert receipt, run
            value = json.loads(json.loads(receipt[0])["value"])
            print("MUSE_ANALYSIS", name, json.dumps(value), flush=True)
            assert value["success"] and "blue" in value["analysis"].lower(), value
    finally:
        server.goal_script = None
        call(command("media.disconnect"))
        shutil.rmtree(root / "state/media-secrets", ignore_errors=True)


def test_billed_native_image_does_not_retry_lost_ack(tmp_path, monkeypatch):
    import httpx
    from ngertiin_engine.media_provider import install, settings
    from ngertiin_engine.outcomes import evidence
    from plugins.image_gen import openai as provider

    calls = []

    def lost_ack(request):
        calls.append(request.url.path)
        raise httpx.ReadTimeout(
            "Lost acknowledgement after provider accepted the request", request=request
        )

    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("NMA_MEDIA_KEY", "disposable-key")
    (tmp_path / "config.yaml").write_text(
        "image_gen:\n  openai:\n    base_url: https://api.meta.ai/v1\n    model: muse-image-1.0\n    key_env: NMA_MEDIA_KEY\n"
    )
    from agent import process_bootstrap

    monkeypatch.setattr(
        process_bootstrap,
        "build_keepalive_http_client",
        lambda url: httpx.Client(transport=httpx.MockTransport(lost_ack)),
    )
    install()
    token = settings.set({})
    try:
        value = provider.OpenAIImageGenProvider().generate("A blue square", "square")
    finally:
        settings.reset(token)
    assert calls == ["/v1/images/generations"]
    assert value["success"] is False
    assert evidence(value) == "unknown"


def test_pending_speech_receipt_is_not_redispatched(runtime):
    import sqlite3

    from ngertiin_engine.contracts import canonical, digest

    root, _, call, *_ = runtime
    agent = capability_agent(call, "pending-speech")
    identity, request_key = str(uuid4()), str(uuid4())
    data = b"deliberately invalid audio, never read after a retained dispatch receipt"
    payload = {
        "artifact_id": identity,
        "thread_id": agent["primary_dm_thread_id"],
        "request_key": request_key,
    }
    call(
        command(
            "file.begin",
            {
                "artifact_id": identity,
                "thread_id": payload["thread_id"],
                "filename": "audio.wav",
                "media_type": "audio/wav",
                "sha256": hashlib.sha256(data).hexdigest(),
                "byte_count": len(data),
            },
        )
    )
    call(
        command(
            "file.part",
            {
                "artifact_id": identity,
                "index": 0,
                "data_base64": base64.b64encode(data).decode(),
            },
        )
    )
    call(command("file.finalize", {"artifact_id": identity}))
    pending = {
        "state": "indeterminate",
        "error": "TRANSCRIPTION_OUTCOME_UNKNOWN",
        "artifact_id": identity,
        "request_key": request_key,
    }
    with sqlite3.connect(root / "state/state.db") as db:
        owner = db.execute("SELECT owner_id FROM nma_partition").fetchone()[0]
        db.execute(
            "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
            (owner, "speech:" + request_key, digest(payload), canonical(pending)),
        )
    assert call(command("media.transcribe", payload))["result"] == pending
    assert call(command("media.transcribe", payload))["result"] == pending


def test_video_url_requires_user_scope_and_retains_one_import(tmp_path, monkeypatch):
    import sqlite3

    import httpx
    from ngertiin_engine.contracts import EngineError
    from ngertiin_engine.files import Files
    from ngertiin_engine.goals import Goals
    from ngertiin_engine.media_sources import authorized_url
    from ngertiin_engine.reliability import Reliability
    from tools import url_safety

    owner, thread = str(uuid4()), str(uuid4())
    config = {"thread_id": thread, "context_generation": "1"}
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE nma_messages(owner_id,thread_id,author_kind,context_generation,parts)"
    )

    class Store:
        def __init__(self):
            self.owner = owner

        def write(self, fn):
            return fn(conn)

    store = Store()
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setattr(Goals, "scope", lambda *a: ("run", config, None))
    with pytest.raises(EngineError, match="MEDIA_SOURCE_REFUSED"):
        authorized_url(store, config, "https://127.0.0.1/video.mp4", {})
    source = "https://example.com/video.mp4"
    with pytest.raises(EngineError, match="MEDIA_SOURCE_REFUSED"):
        authorized_url(store, config, source, {})
    conn.execute(
        "INSERT INTO nma_messages VALUES (?,?,?,?,?)",
        (owner, thread, "user", 1, json.dumps([{"text": "Analyze " + source}])),
    )
    requests, published = [], {}

    def transport(request):
        requests.append(str(request.url))
        return httpx.Response(
            200, headers={"Content-Type": "video/mp4"}, content=b"video-fixture"
        )

    monkeypatch.setattr(
        url_safety,
        "create_ssrf_safe_client",
        lambda **kwargs: httpx.Client(transport=httpx.MockTransport(transport)),
    )

    def get(self, conn, identity, **kwargs):
        if not published:
            raise EngineError("NOT_FOUND")
        return published["item"]

    def publish(self, conn, operation, config, run, name, media, data):
        item = {
            "artifact_id": str(uuid4()),
            "media_type": media,
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        published["item"] = item
        return item

    monkeypatch.setattr(Files, "get", get)
    monkeypatch.setattr(Files, "publish", publish)
    monkeypatch.setattr(Reliability, "append", lambda *a: None)
    first = authorized_url(store, config, source, {})
    assert authorized_url(store, config, source, {}) == first
    assert requests == [source]
    with pytest.raises(EngineError, match="MEDIA_SOURCE_REFUSED"):
        authorized_url(store, {**config, "context_generation": "2"}, source, {})


@pytest.fixture(autouse=True)
def clean_disposable_live_credentials(request):
    yield
    if os.environ.get("NMA_TEST_MUSE") and request.node.name.startswith("test_muse_"):
        import shutil

        root = request.getfixturevalue("runtime")[0]
        shutil.rmtree(root / "state/media-secrets", ignore_errors=True)
