"""HTTP authentication binding and private transport contracts."""

import asyncio
import hashlib
import hmac
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi import FastAPI

from ngertiin.accounts.auth import current_account
from ngertiin.agent_engine.api import MAX_REQUEST_BYTES, canonical, router
from ngertiin.models import Account


class AgentEngineHTTP(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="nma-http-", dir="/tmp")
        root = Path(self.tmp.name)
        self.owner = uuid4()
        self.key = b"test-only-signing-key-at-least-32-bytes"
        (root / "key").write_bytes(self.key)
        self.reply = {"result": {"items": [], "next_cursor": None, "models": []}}
        self.envelopes = []

        async def serve(reader, writer):
            self.envelopes.append(json.loads(await reader.readline()))
            writer.write((canonical(self.reply) + "\n").encode())
            await writer.drain()
            writer.close()
            await writer.wait_closed()

        self.server = await asyncio.start_unix_server(
            serve, path=root / "socket", limit=MAX_REQUEST_BYTES
        )
        registry = root / "partitions.json"
        registry.write_text(
            json.dumps(
                {
                    str(self.owner): {
                        "key_file": str(root / "key"),
                        "socket": str(root / "socket"),
                    }
                }
            )
        )
        self.env = patch.dict(os.environ, {"NMA_PARTITIONS_FILE": str(registry)})
        self.env.start()
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[current_account] = lambda: Account(
            id=self.owner, clerk_user_id="test-owner"
        )
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url="http://test"
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        self.server.close()
        await self.server.wait_closed()
        self.env.stop()
        self.tmp.cleanup()

    async def test_read_signs_verified_owner_and_canonical_body(self):
        response = await self.client.get("/api/agent-engine/v1/agents")
        self.assertEqual(response.status_code, 200)
        envelope = self.envelopes[0]
        self.assertEqual(envelope["owner_id"], str(self.owner))
        signature = envelope.pop("signature")
        self.assertEqual(
            signature, hmac.new(self.key, canonical(envelope).encode(), "sha256").hexdigest()
        )
        self.assertEqual(
            envelope["payload_digest"],
            hashlib.sha256(canonical(envelope["body"]).encode()).hexdigest(),
        )

    async def test_public_owner_actor_and_runtime_commands_are_rejected(self):
        body = {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "agent.create",
            "expected_revision": None,
            "payload": {},
        }
        for extra in ({"owner_id": str(uuid4())}, {"actor": "owner"}, {"type": "runtime.submit"}):
            response = await self.client.post("/api/agent-engine/v1/commands", json=body | extra)
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.envelopes, [])

    async def test_error_mapping_preserves_command_identity(self):
        body = {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "agent.archive",
            "expected_revision": "2",
            "payload": {"agent_id": str(uuid4())},
        }
        for code, status in (
            ("REVISION_CONFLICT", 409),
            ("NOT_FOUND", 404),
            ("CAPABILITY_UNAVAILABLE", 422),
            ("CAPABILITY_DENIED", 403),
            ("ACCESS_REVOKED", 409),
            ("UNSUPPORTED_VERSION", 426),
        ):
            self.reply = {"error": {"code": code}}
            response = await self.client.post("/api/agent-engine/v1/commands", json=body)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json()["detail"]["command_id"], body["command_id"])
        self.assertTrue(all(e["body"] == body for e in self.envelopes))

    async def test_unprovisioned_owner_does_not_use_another_partition(self):
        self.app.dependency_overrides[current_account] = lambda: Account(
            id=uuid4(), clerk_user_id="other"
        )
        response = await self.client.get("/api/agent-engine/v1/agents")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.envelopes, [])

    async def test_unicode_request_uses_supported_frame_and_unchanged_digest(self):
        body = {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "agent.create",
            "expected_revision": None,
            "payload": {
                "display_name": "Unicode",
                "handle": "unicode",
                "config": {"soul": "🙂" * 16000, "instructions": "🙂" * 16000, "model": "test"},
            },
        }
        response = await self.client.post("/api/agent-engine/v1/commands", json=body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.envelopes[0]["body"], body)
        self.assertEqual(
            self.envelopes[0]["payload_digest"],
            hashlib.sha256(canonical(body).encode()).hexdigest(),
        )

    async def test_oversized_request_is_not_sent_or_reported_retryable(self):
        body = {
            "schema_version": "nma.v1",
            "command_id": str(uuid4()),
            "type": "agent.create",
            "expected_revision": None,
            "payload": {"soul": "🙂" * MAX_REQUEST_BYTES},
        }
        response = await self.client.post("/api/agent-engine/v1/commands", json=body)
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "REQUEST_TOO_LARGE")
        self.assertFalse(response.json()["detail"]["retryable"])
        self.assertEqual(self.envelopes, [])

    async def test_thread_consumers_sign_owner_and_keep_runtime_private(self):
        thread_id = str(uuid4())
        response = await self.client.get(f"/api/agent-engine/v1/threads/{thread_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.envelopes[-1]["body"]["type"], "thread.read")
        self.assertEqual(self.envelopes[-1]["body"]["payload"], {"thread_id": thread_id})
        self.assertEqual(self.envelopes[-1]["owner_id"], str(self.owner))
        response = await self.client.post(
            "/api/agent-engine/v1/commands",
            json={
                "schema_version": "nma.v1",
                "command_id": str(uuid4()),
                "type": "thread.create",
                "expected_revision": None,
                "payload": {"kind": "dm", "title": "Owner thread", "agent_ids": [str(uuid4())]},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.envelopes[-1]["body"]["type"], "thread.create")
        response = await self.client.get("/api/agent-engine/v1/threads?after=invalid")
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
