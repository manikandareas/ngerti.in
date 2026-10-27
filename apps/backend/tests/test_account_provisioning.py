"""Disposable PostgreSQL, verified webhooks and a real owner gateway."""

import base64
import hashlib
import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
import psycopg
from alembic import command as alembic_command
from alembic.config import Config
from fastapi import FastAPI
from psycopg import sql
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlmodel import Session
from svix.webhooks import Webhook

from ngertiin.accounts.auth import current_account
from ngertiin.accounts.provisioning import ensure_account, status
from ngertiin.accounts.webhooks import router as webhook_router
from ngertiin.agent_engine.api import forward_partition
from ngertiin.agent_engine.conversations import router as conversation_router
from ngertiin.agent_engine.partitions import (
    Partitions,
    ProvisioningError,
    local_configuration,
    registry_path,
)
from ngertiin.agent_engine.provisioner import claim, finish, reconcile
from ngertiin.agent_engine.stream import read_command
from ngertiin.config import ROOT, get_settings
from ngertiin.db import get_engine


class AccountProvisioning(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_url = get_settings().database_url.get_secret_value()
        cls.database = "tobi_test_" + uuid4().hex[:12]
        admin = make_url(cls.original_url).set(drivername="postgresql")
        cls.admin_url = admin.render_as_string(hide_password=False)
        with psycopg.connect(cls.admin_url, autocommit=True) as conn:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(cls.database)))
        cls.tmp = tempfile.TemporaryDirectory(prefix="tb-", dir="/tmp")
        cls.secret = "whsec_" + base64.b64encode(b"disposable-registration-signing-key").decode()
        cls.env = patch.dict(
            os.environ,
            {
                "DATABASE_URL": admin.set(database=cls.database).render_as_string(
                    hide_password=False
                ),
                "CLERK_WEBHOOK_SIGNING_SECRET": cls.secret,
                "APP_ENV": "development",
                "NMA_PARTITIONS_FILE": cls.tmp.name + "/partitions.json",
                "NMA_STATE_ROOT": cls.tmp.name + "/s",
                "HERMES_SOURCE": str(ROOT / ".dev/nma-001/source"),
                "NMA_RUNTIME_PYTHON": os.environ.get(
                    "NMA_TEST_RUNTIME_PYTHON", str(ROOT / ".dev/nma-033/production/bin/python")
                ),
                "OPENAI_API_KEY": "disposable-no-provider-call",
                "OPENAI_MODEL": "test-model",
                "OPENAI_BASE_URL": "http://127.0.0.1:1/v1",
                "E2B_API_KEY": "",
            },
        )
        cls.env.start()
        get_settings.cache_clear()
        get_engine.cache_clear()
        alembic_command.upgrade(Config(str(ROOT / "apps/backend/alembic.ini")), "head")
        cls.engine = get_engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()
        cls.env.stop()
        get_settings.cache_clear()
        get_engine.cache_clear()
        with psycopg.connect(cls.admin_url, autocommit=True) as conn:
            conn.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(cls.database))
            )
        cls.tmp.cleanup()

    def account(self, subject):
        with Session(self.engine) as session:
            account = ensure_account(session, subject)
            session.commit()
            session.refresh(account)
            return account

    async def test_concurrent_login_and_verified_registration(self):
        subject = "user_" + uuid4().hex
        with ThreadPoolExecutor(max_workers=6) as pool:
            accounts = list(pool.map(self.account, [subject] * 6))
        owner = accounts[0].id
        self.assertEqual({a.id for a in accounts}, {owner})
        app = FastAPI()
        app.include_router(webhook_router)
        app.include_router(conversation_router)
        app.dependency_overrides[current_account] = lambda: accounts[0]
        raw = json.dumps({"type": "user.created", "data": {"id": subject}})
        delivery = "msg_" + uuid4().hex
        now = datetime.now(UTC)
        headers = {
            "svix-id": delivery,
            "svix-timestamp": str(int(now.timestamp())),
            "svix-signature": Webhook(self.secret).sign(delivery, now, raw),
        }
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(2):
                response = await client.post(
                    "/api/accounts/webhooks/clerk", content=raw, headers=headers
                )
                self.assertEqual(response.status_code, 200, response.text)
            denied = await client.post("/api/accounts/webhooks/clerk", content=raw)
            self.assertEqual(denied.status_code, 401)
            response = await client.post("/api/agent-engine/v1/bootstrap")
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json()["status"], "pending")
        with self.engine.connect() as conn:
            self.assertEqual(
                conn.execute(
                    text("SELECT count(*) FROM account_provisioning WHERE owner_id=:owner"),
                    {"owner": owner},
                ).scalar(),
                1,
            )
            self.assertEqual(
                conn.execute(
                    text(
                        "SELECT count(*) FROM account_registration_receipts WHERE delivery_id=:id"
                    ),
                    {"id": delivery},
                ).scalar(),
                1,
            )

    async def test_local_partition_without_openai_key_keeps_tobi(self):
        owner = str(uuid4())
        partitions = Partitions()
        try:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_MODEL": ""}):
                entry = await partitions.ensure(owner)
                setup = await forward_partition(owner, read_command("account.ensure", {}), entry)
                self.assertEqual(setup["status"], "ready")
                listing = await forward_partition(owner, read_command("connection.list", {}), entry)
                self.assertEqual(listing["items"], [])
                partitions.close()
                partitions = Partitions()
                await partitions.ensure(owner)
                same = await forward_partition(owner, read_command("account.read", {}), entry)
                self.assertEqual(same["default_agent_id"], setup["default_agent_id"])
        finally:
            partitions.close()

    def test_environment_bootstrap_requires_explicit_owner_assignment(self):
        assigned, other = str(uuid4()), str(uuid4())
        env = {
            "OPENAI_API_KEY": "disposable-owner-assigned-key",
            "OPENAI_MODEL": "test-model",
            "NMA_BOOTSTRAP_OWNER_ID": assigned,
        }
        with tempfile.TemporaryDirectory(prefix="bc-", dir="/tmp") as directory:
            for owner in (assigned, other):
                home = Path(directory) / owner
                home.mkdir()
                local_configuration(owner, home, env)
                catalog = json.loads((home / "models.json").read_text())
                self.assertEqual(bool(catalog), owner == assigned)
                if owner == assigned:
                    # A later global configuration cannot overwrite the saved owner catalog.
                    local_configuration(owner, home, {**env, "OPENAI_MODEL": "changed-model"})
                    self.assertEqual(json.loads((home / "models.json").read_text()), catalog)

    async def test_real_partition_setup_restart_and_missing_state(self):
        account = self.account("user_" + uuid4().hex)
        owner = str(account.id)
        # Keep this test's claim deterministic without touching another account's data.
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE account_provisioning SET next_attempt_at=now()+interval '1 hour' "
                    "WHERE owner_id!=:owner"
                ),
                {"owner": owner},
            )
        partitions = Partitions()
        try:
            job = claim(self.engine)
            self.assertEqual(str(job["owner_id"]), owner)
            await reconcile(self.engine, partitions, job)
            with Session(self.engine) as session:
                state = status(session, owner)
            self.assertEqual(state["status"], "ready", state)
            entry = json.loads(registry_path().read_text())[owner]
            thread = state["result"]["primary_dm_thread_id"]
            snapshot = await forward_partition(
                owner, read_command("thread.snapshot", {"thread_id": thread}), entry
            )
            self.assertEqual(len(snapshot["messages"]), 1)
            self.assertEqual(snapshot["thread"]["agents"][0]["display_name"], "Tobi")
            self.assertEqual(snapshot["runs"], [])
            key_hash = hashlib.sha256(Path(entry["key_file"]).read_bytes()).hexdigest()
            partitions.close()
            partitions = Partitions()
            await partitions.ensure(owner)
            same = await forward_partition(owner, read_command("account.read", {}), entry)
            self.assertEqual(same["default_agent_id"], state["result"]["default_agent_id"])
            self.assertEqual(
                hashlib.sha256(Path(entry["key_file"]).read_bytes()).hexdigest(), key_hash
            )
            partitions.close()
            partitions = Partitions()
            home = Path(entry["socket"]).parent
            (home / "nma-restore-quarantine.json").write_text("{}")
            with self.assertRaises(ProvisioningError) as held:
                await partitions.ensure(owner)
            self.assertEqual(held.exception.code, "RESTORE_QUARANTINED")
            (home / "nma-restore-quarantine.json").unlink()
            (home / "state.db").rename(home / "preserved-state.db")
            with self.assertRaises(ProvisioningError) as missing:
                await partitions.ensure(owner)
            self.assertEqual(missing.exception.code, "PARTITION_STATE_MISSING")
            self.assertFalse((home / "state.db").exists())
        finally:
            partitions.close()

    async def test_lease_fencing_rejects_old_completion(self):
        account = self.account("user_" + uuid4().hex)
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE account_provisioning SET next_attempt_at=now()+interval '1 hour' "
                    "WHERE owner_id!=:owner"
                ),
                {"owner": account.id},
            )
        old = claim(self.engine)
        self.assertIsNone(claim(self.engine))
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE account_provisioning SET lease_until=now()-interval '1 second' "
                    "WHERE owner_id=:owner"
                ),
                {"owner": account.id},
            )
        new = claim(self.engine)
        self.assertGreater(new["generation"], old["generation"])
        self.assertFalse(finish(self.engine, old, "ready", {}))
        self.assertTrue(finish(self.engine, new, "retryable_failure", error="TEST_RETRY"))

    async def test_ready_recheck_failure_preserves_setup_result(self):
        account = self.account("user_" + uuid4().hex)
        owner = str(account.id)
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE account_provisioning SET next_attempt_at=now()+interval '1 hour' "
                    "WHERE owner_id!=:owner"
                ),
                {"owner": owner},
            )
        job = claim(self.engine)
        self.assertTrue(finish(self.engine, job, "ready", {"primary_dm_thread_id": "thr_1"}))
        with self.engine.begin() as conn:
            conn.execute(
                text("UPDATE account_provisioning SET next_attempt_at=now() WHERE owner_id=:owner"),
                {"owner": owner},
            )
        recheck = claim(self.engine)
        self.assertIsNotNone(recheck)
        self.assertTrue(
            finish(self.engine, recheck, "retryable_failure", error="ENGINE_UNAVAILABLE")
        )
        with Session(self.engine) as session:
            state = status(session, owner)
        self.assertEqual(state["status"], "retryable_failure")
        self.assertEqual(state["result"], {"primary_dm_thread_id": "thr_1"})
