"""Readiness is dependency-specific; an idle HTTP process does not prove a worker is ready."""

from importlib.metadata import version

import psycopg
from langgraph.checkpoint.postgres import PostgresSaver

from ngertiin.config import get_settings
from ngertiin.storage import s3_client


def system_status() -> dict:
    settings = get_settings()
    components = {
        "api": {"status": "ready", "detail": "API menerima request."},
        "database": {"status": "unavailable", "detail": "PostgreSQL belum dapat dihubungi."},
        "migrations": {"status": "unavailable", "detail": "Jalankan make setup."},
        "pgvector": {"status": "unavailable", "detail": "Extension vector belum siap."},
        "queue": {"status": "unavailable", "detail": "Schema Procrastinate belum siap."},
        "checkpoints": {"status": "unavailable", "detail": "Checkpoint LangGraph belum siap."},
        "worker": {"status": "unavailable", "detail": "Belum ada heartbeat worker aktif."},
        "storage": {"status": "unavailable", "detail": "Bucket storage belum dapat diakses."},
        "auth": {
            "status": "configured"
            if settings.clerk_secret_key.get_secret_value()
            else "unavailable",
            "detail": "Verifikasi login melalui akun Clerk.",
        },
    }
    try:
        with psycopg.connect(
            settings.database_url.get_secret_value(),
            connect_timeout=3,
            options="-c statement_timeout=3000",
        ) as conn:
            conn.execute("SELECT 1")
            components["database"] = {"status": "ready", "detail": "PostgreSQL terhubung."}
            exists = conn.execute(
                "SELECT to_regclass('alembic_version'), to_regclass('procrastinate_jobs'), "
                "to_regclass('checkpoint_migrations'), to_regclass('runtime_schema_versions')"
            ).fetchone()
            if exists and exists[0]:
                migration = conn.execute("SELECT version_num FROM alembic_version").fetchone()
                if migration and migration[0] == "0003_chat_order":
                    components["migrations"] = {
                        "status": "ready",
                        "detail": "Migrasi aplikasi terbaru.",
                    }
            vector = conn.execute(
                "SELECT extversion FROM pg_extension WHERE extname='vector'"
            ).fetchone()
            if vector:
                conn.execute("SELECT '[1,0,0]'::vector <-> '[1,0,0]'::vector")
                components["pgvector"] = {
                    "status": "ready",
                    "detail": f"pgvector {vector[0]} siap.",
                }
            if exists and exists[1] and exists[3]:
                queue = conn.execute(
                    "SELECT version FROM runtime_schema_versions WHERE component='procrastinate'"
                ).fetchone()
                if queue and queue[0] == version("procrastinate"):
                    components["queue"] = {"status": "ready", "detail": "Antrean database siap."}
                heartbeat = conn.execute(
                    "SELECT count(*) FROM procrastinate_workers "
                    "WHERE last_heartbeat > NOW() - INTERVAL '30 seconds'"
                ).fetchone()
                if heartbeat and heartbeat[0]:
                    components["worker"] = {"status": "ready", "detail": "Heartbeat worker aktif."}
            if exists and exists[2]:
                checkpoint = conn.execute("SELECT max(v) FROM checkpoint_migrations").fetchone()
                if checkpoint and checkpoint[0] == len(PostgresSaver.MIGRATIONS) - 1:
                    components["checkpoints"] = {
                        "status": "ready",
                        "detail": "Checkpoint PostgreSQL siap.",
                    }
    except (psycopg.Error, OSError):
        pass
    try:
        s3_client().head_bucket(Bucket=settings.s3_bucket)
        components["storage"] = {"status": "ready", "detail": "Bucket storage dapat diakses."}
    except Exception:
        pass
    api_ready = all(
        components[name]["status"] == "ready"
        for name in ["database", "migrations", "pgvector", "queue", "checkpoints"]
    )
    return {"api_ready": api_ready, "components": components}


__all__ = ["system_status"]
