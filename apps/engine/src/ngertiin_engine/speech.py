"""Muse STT through Hermes's native provider seam and durable upload receipts."""

import json
import os
import subprocess
import tempfile
import wave
from contextvars import ContextVar
from pathlib import Path

from ngertiin_engine.contracts import EngineError, canonical, digest, uuid
from ngertiin_engine.files import Files
from ngertiin_engine.media_provider import owner_media

active = ContextVar("nma_speech", default=None)


def install():
    from agent.transcription_provider import TranscriptionProvider
    from agent.transcription_registry import register_provider
    from tools import transcription_tools

    class MuseTranscription(TranscriptionProvider):
        name = "nma-meta"

        def is_available(self):
            return active.get() is not None

        def transcribe(self, file_path, *, model=None, language=None, **extra):
            import httpx

            key, identity = active.get()
            try:
                with (
                    httpx.Client(timeout=120) as client,
                    open(file_path, "rb") as audio,
                ):
                    response = client.post(
                        "https://api.meta.ai/v1/asr/transcribe",
                        params={"sessionId": identity},
                        headers={
                            "Authorization": "Bearer " + key,
                            "Accept": "application/json",
                        },
                        files={
                            "request": (
                                None,
                                json.dumps(
                                    {
                                        "model": "muse-voice-transcribe-1.0",
                                        "audioEncoding": "WAV",
                                        "mode": "PUSH_TO_TALK",
                                    }
                                ),
                                "application/json",
                            ),
                            "audio": ("speech.wav", audio, "audio/wav"),
                        },
                    )
                if response.status_code != 200:
                    return {
                        "success": False,
                        "transcript": "",
                        "provider": self.name,
                        "error": "MUSE_TRANSCRIPTION_HTTP_" + str(response.status_code),
                    }
                value = response.json()
                transcript = value.get("transcript")
                if not isinstance(transcript, str):
                    return {
                        "success": False,
                        "transcript": "",
                        "provider": self.name,
                        "error": "INVALID_TRANSCRIPTION_RESPONSE",
                    }
                return {
                    "success": True,
                    "transcript": transcript,
                    "provider": self.name,
                }
            except (httpx.HTTPError, ValueError, OSError):
                return {
                    "success": False,
                    "transcript": "",
                    "provider": self.name,
                    "error": "TRANSCRIPTION_OUTCOME_UNKNOWN",
                }

    register_provider(MuseTranscription())
    original = transcription_tools._load_stt_config

    def config():
        return (
            {"provider": "nma-meta", "enabled": True}
            if active.get() is not None
            else original()
        )

    transcription_tools._load_stt_config = config


def transcribe(adapter, payload):
    if set(payload) != {"artifact_id", "thread_id", "request_key"}:
        raise EngineError("INVALID_REQUEST")
    uuid(payload["request_key"])
    files = Files(adapter.store)

    def authorize(conn):
        adapter.threads.get(conn, uuid(payload["thread_id"]))
        return files.get(conn, payload["artifact_id"], thread_id=payload["thread_id"])

    item = adapter.store.write(authorize)
    if not item["media_type"].startswith("audio/"):
        raise EngineError("UNSUPPORTED_MEDIA")
    operation = "speech:" + payload["request_key"]
    fingerprint = digest(payload)

    def previous(conn):
        row = conn.execute(
            "SELECT payload_digest,result FROM nma_workspace_operations WHERE owner_id=? AND operation_id=?",
            (adapter.owner, operation),
        ).fetchone()
        if row and row[0] != fingerprint:
            raise EngineError("COMMAND_CONFLICT")
        return json.loads(row[1]) if row else None

    saved = adapter.store.write(previous)
    if saved is not None:
        return saved
    media = owner_media()
    with media.vault.locked(media.identity):
        value = media.read()
        if not value or value["metadata"]["status"] != "configured":
            raise EngineError(
                "PROVIDER_CONNECTION_REQUIRED",
                {"reason": "muse_media_connection_required"},
            )
        data = files.bytes(item)
        with tempfile.TemporaryDirectory(
            prefix="nma-speech-", dir=media.home
        ) as directory:
            normalized = Path(directory) / "speech.wav"
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-nostdin",
                        "-v",
                        "error",
                        "-protocol_whitelist",
                        "pipe",
                        "-i",
                        "pipe:0",
                        "-t",
                        "601",
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        "-c:a",
                        "pcm_s16le",
                        "-map_metadata",
                        "-1",
                        str(normalized),
                    ],
                    input=data,
                    check=True,
                    capture_output=True,
                    timeout=30,
                    env={"PATH": os.environ.get("PATH", "")},
                )
                with wave.open(str(normalized)) as audio:
                    if audio.getnframes() / audio.getframerate() > 600:
                        raise EngineError(
                            "UNSUPPORTED_MEDIA", {"reason": "audio_exceeds_ten_minutes"}
                        )
            except (OSError, subprocess.SubprocessError, wave.Error):
                raise EngineError(
                    "UNSUPPORTED_MEDIA",
                    {"reason": "audio_conversion_failed_or_ffmpeg_missing"},
                ) from None
            # Commit dispatch before the request; ACK loss never starts another billable call.
            pending = {
                "state": "indeterminate",
                "error": "TRANSCRIPTION_OUTCOME_UNKNOWN",
                "artifact_id": item["artifact_id"],
                "request_key": payload["request_key"],
            }

            def begin(conn):
                authorize(conn)
                existing = previous(conn)
                if existing is not None:
                    return existing
                conn.execute(
                    "INSERT INTO nma_workspace_operations VALUES (?,?,?,?)",
                    (adapter.owner, operation, fingerprint, canonical(pending)),
                )

            existing = adapter.store.write(begin)
            if existing is not None:
                return existing
            token = active.set((value["api_key"], payload["request_key"]))
            try:
                from tools.transcription_tools import transcribe_audio

                result = transcribe_audio(str(normalized), source="ngertiin-web")
            finally:
                active.reset(token)
            result = {
                **result,
                "artifact_id": item["artifact_id"],
                "request_key": payload["request_key"],
                "state": "completed" if result.get("success") else "failed",
            }

            def finish(conn):
                # Revocation after upload still fences return/delivery. The receipt stays retained.
                conn.execute(
                    "UPDATE nma_workspace_operations SET result=? WHERE owner_id=? AND operation_id=?",
                    (canonical(result), adapter.owner, operation),
                )

            adapter.store.write(finish)
            adapter.store.write(authorize)
            return result
