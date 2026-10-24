"""Product API readiness; engine execution is checked per authenticated partition."""

import psycopg
from alembic.config import Config
from alembic.script import ScriptDirectory

from ngertiin.config import ROOT, get_settings


def system_status() -> dict:
    settings = get_settings()
    components = {
        "database": {"status": "unavailable", "detail": "PostgreSQL is unavailable."},
        "migrations": {"status": "unavailable", "detail": "Run the database migration."},
    }
    try:
        with psycopg.connect(
            settings.database_url.get_secret_value(),
            connect_timeout=3,
            options="-c statement_timeout=3000",
        ) as connection:
            connection.execute("SELECT 1")
            components["database"] = {"status": "ready", "detail": "PostgreSQL connected."}
            row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            head = ScriptDirectory.from_config(
                Config(str(ROOT / "apps/backend/alembic.ini"))
            ).get_current_head()
            if row and row[0] == head:
                components["migrations"] = {
                    "status": "ready",
                    "detail": "Database schema is current.",
                }
    except (psycopg.Error, OSError):
        pass
    return {
        "api_ready": all(value["status"] == "ready" for value in components.values()),
        "components": components,
    }
