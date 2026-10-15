"""Explicit, repeatable startup migrations. Never run migrations in each replica."""

import argparse
from importlib.metadata import version

import psycopg
from alembic import command
from alembic.config import Config
from botocore.exceptions import ClientError
from langgraph.checkpoint.postgres import PostgresSaver

from ngertiin.config import ROOT, get_settings
from ngertiin.storage import s3_client


def setup_database() -> None:
    settings = get_settings()
    command.upgrade(Config(str(ROOT / "apps/backend/alembic.ini")), "head")
    from ngertiin.worker.queue import queue_app

    with (
        psycopg.connect(settings.database_url.get_secret_value(), autocommit=True) as connection,
        connection.transaction(),
    ):
        connection.execute("SELECT pg_advisory_xact_lock(2026101502)")
        stored = connection.execute(
            "SELECT version FROM runtime_schema_versions WHERE component = 'procrastinate'"
        ).fetchone()
        installed = version("procrastinate")
        if stored and stored[0] != installed:
            raise RuntimeError(
                "Procrastinate version changed. Apply its documented SQL migrations before "
                "updating runtime_schema_versions; do not silently replace the queue schema."
            )
        if not stored:
            connection.execute(queue_app.schema_manager.get_schema())
            connection.execute(
                "INSERT INTO runtime_schema_versions VALUES ('procrastinate', %s)", [installed]
            )
    with PostgresSaver.from_conn_string(settings.database_url.get_secret_value()) as saver:
        saver.setup()
    print("Database: Alembic, pgvector, Procrastinate, and LangGraph checkpoints ready.")


def setup_storage() -> None:
    settings = get_settings()
    client = s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as error:
        if str(error.response["Error"]["Code"]) not in {"404", "NoSuchBucket"}:
            raise
        if settings.app_env != "development":
            raise RuntimeError("Provision the production bucket before startup.") from error
        client.create_bucket(Bucket=settings.s3_bucket)
    print("Storage: configured bucket is ready.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-only", action="store_true")
    args = parser.parse_args()
    setup_database()
    if not args.database_only:
        setup_storage()


if __name__ == "__main__":
    main()

__all__ = ["setup_database", "setup_storage"]
