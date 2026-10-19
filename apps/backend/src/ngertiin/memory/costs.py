"""Reserve every HTTP attempt, including SDK fallbacks, before calling a provider."""

import json
from uuid import UUID, uuid4

import httpx
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ngertiin.config import get_settings


class MemoryUnavailable(ValueError):
    """A finite budget, revoked generation or expired lease forbids more inference."""


class ProviderBudget:
    def __init__(self, owner: UUID, generation: int, operation: str, job=None, token=None):
        self.owner, self.generation, self.operation = owner, generation, operation
        self.job, self.token = job, token
        self.calls = 0

    def before(self, request: httpx.Request):
        settings = get_settings()
        body = json.loads(request.content)
        self.calls += 1
        ceiling = len(request.content) + int(
            body.get("max_completion_tokens", body.get("max_tokens", 0))
        )
        if self.calls > 10 or ceiling > 64000:
            raise MemoryUnavailable("Batas panggilan memory tercapai.")
        with psycopg.connect(
            settings.database_url.get_secret_value(), row_factory=dict_row
        ) as conn:
            conn.execute("SELECT id FROM accounts WHERE id=%s FOR UPDATE", (self.owner,))
            current = conn.execute(
                "SELECT generation FROM memory_settings WHERE owner_id=%s", (self.owner,)
            ).fetchone()
            if not current or current["generation"] != self.generation:
                raise MemoryUnavailable("Konteks memory telah berubah.")
            if self.token:
                job = conn.execute(
                    "SELECT id FROM memory_capture_jobs WHERE id=%s AND "
                    "lease_token=%s AND lease_until>now() AND status IN "
                    "('extracting','admitting')",
                    (self.job, self.token),
                ).fetchone()
                if not job:
                    raise MemoryUnavailable("Capture memory sudah dihentikan.")
            conn.execute("SELECT pg_advisory_xact_lock(170017)")
            used = conn.execute(
                "SELECT COALESCE(sum(charged_units),0) AS total, "
                "COALESCE(sum(charged_units) FILTER(WHERE owner_id=%s),0) AS "
                "account, COALESCE(sum(charged_units) FILTER(WHERE job_id=%s),0) AS "
                "job FROM memory_cost_events WHERE created_at >= date_trunc('day',"
                "now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
                (self.owner, self.job),
            ).fetchone()
            assert used is not None
            if (
                used["account"] + ceiling > settings.memory_account_daily_units
                or used["total"] + ceiling > settings.memory_global_daily_units
                or (self.job and used["job"] + ceiling > settings.memory_job_units)
            ):
                raise MemoryUnavailable("Batas komputasi memory hari ini tercapai.")
            call = uuid4()
            conn.execute(
                "INSERT INTO memory_cost_events(id,owner_id,job_id,operation,model,"
                "reserved_units,charged_units,state) VALUES (%s,%s,%s,%s,%s,%s,%s,"
                "'reserved')",
                (
                    call,
                    self.owner,
                    self.job,
                    self.operation,
                    body.get("model", "unknown"),
                    ceiling,
                    ceiling,
                ),
            )
        request.extensions["memory_call_id"] = call

    def after(self, response: httpx.Response):
        response.read()
        call = response.request.extensions.get("memory_call_id")
        if not call:
            return
        try:
            usage = response.json().get("usage", {})
        except (ValueError, AttributeError):
            usage = {}
        # Retain counters only, never prompts or generated memory in cost records.
        counts = {key: value for key, value in usage.items() if type(value) is int and value >= 0}
        total = counts.get("total_tokens")
        with psycopg.connect(
            get_settings().database_url.get_secret_value(), row_factory=dict_row
        ) as conn:
            event = conn.execute(
                "SELECT * FROM memory_cost_events WHERE id=%s FOR UPDATE", (call,)
            ).fetchone()
            if event is None:
                return
            confirmed = type(total) is int and 0 < total <= event["reserved_units"]
            conn.execute(
                "UPDATE memory_cost_events SET state=%s,charged_units=%s,usage=%s,"
                "settled_at=now() WHERE id=%s",
                (
                    "confirmed" if confirmed else "unknown",
                    total if confirmed else event["reserved_units"],
                    Jsonb(counts),
                    call,
                ),
            )
