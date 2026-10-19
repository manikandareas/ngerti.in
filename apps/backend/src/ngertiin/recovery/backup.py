"""Offline development backups and restores into fresh local resources only."""

import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from botocore.exceptions import ClientError
from psycopg import sql
from sqlalchemy.engine import make_url

from ngertiin.config import get_settings
from ngertiin.storage import s3_client

ROOT = Path(__file__).resolve().parents[5]


def local_database():
    settings = get_settings()
    url = make_url(settings.database_url.get_secret_value())
    endpoint = settings.s3_endpoint_url or ""
    from urllib.parse import urlsplit

    if (
        settings.app_env != "development"
        or url.host not in ("localhost", "127.0.0.1")
        or urlsplit(endpoint).hostname not in ("localhost", "127.0.0.1")
    ):
        raise ValueError("This backup tool supports local development PostgreSQL/MinIO only.")
    return url


def pg_command(program, database, *, source=None, destination=None):
    """Passwords stay in environment; subprocess errors never print connection strings."""
    url = local_database()
    env = os.environ.copy()
    executable = shutil.which(program)
    if executable:
        env.update(
            PGHOST=url.host or "",
            PGPORT=str(url.port or 5432),
            PGUSER=url.username or "",
            PGPASSWORD=url.password or "",
        )
        command = [executable, "--dbname", database]
    else:
        if url.port != 5433:
            raise ValueError("Install PostgreSQL client tools for this port.")
        command = [
            "docker",
            "compose",
            "--env-file",
            str(ROOT / ".env"),
            "-f",
            str(ROOT / "infra/compose.yaml"),
            "exec",
            "-T",
            "postgres",
            program,
            "--username",
            url.username or "",
            "--dbname",
            database,
        ]
    command += ["--no-owner", "--no-privileges"]
    command += (
        ["--format=custom"] if program == "pg_dump" else ["--exit-on-error", "--single-transaction"]
    )
    with (
        source.open("rb") if source else open(os.devnull, "rb") as incoming,
        destination.open("wb") if destination else open(os.devnull, "wb") as outgoing,
    ):
        result = subprocess.run(
            command,
            env=env,
            stdin=incoming,
            stdout=outgoing,
            stderr=subprocess.PIPE,
            timeout=300,
        )
    if result.returncode:
        raise RuntimeError(f"{program} failed; backup/restore is incomplete.")


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def create(directory: Path, *, quiesced=False):
    url = local_database()
    if not quiesced:
        raise ValueError("Stop API and workers, then pass --quiesced.")
    # Idle pools count too: their processes could issue a write during the copy.
    with psycopg.connect(url.render_as_string(hide_password=False)) as conn:
        row = conn.execute(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
            "AND pid<>pg_backend_pid()"
        ).fetchone()
        if row and row[0]:
            raise ValueError("Source database still has connected processes. Stop them first.")
        required = conn.execute(
            "SELECT object_key,sha256 FROM file_revisions "
            "WHERE status='ready' AND purged_at IS NULL "
            "UNION ALL SELECT object_key,sha256 FROM sandbox_outputs WHERE purged_at IS NULL "
            "UNION ALL SELECT object_key,sha256 FROM computer_outputs WHERE purged_at IS NULL "
            "UNION ALL SELECT object_key,NULL FROM file_extractions "
            "WHERE status='ready' AND object_key IS NOT NULL"
        ).fetchall()
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    directory.chmod(0o700)
    objects = directory / "objects"
    objects.mkdir(mode=0o700)
    pg_command("pg_dump", url.database, destination=directory / "database.dump")
    client, bucket = s3_client(), get_settings().s3_bucket
    manifest = {
        "version": 1,
        "id": str(uuid4()),
        "created_at": datetime.now(UTC).isoformat(),
        "database_sha256": digest(directory / "database.dump"),
        "objects": [],
        "consistency": "offline; API and workers stopped",
        "complete": True,
    }
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            key = item["Key"]
            filename = hashlib.sha256(key.encode()).hexdigest()
            target = objects / filename
            response = client.get_object(Bucket=bucket, Key=key)
            with (
                response["Body"] as body,
                target.open("wb") as out,
            ):
                shutil.copyfileobj(body, out)
            manifest["objects"].append(
                {
                    "key": key,
                    "file": filename,
                    "sha256": digest(target),
                    "content_type": response.get("ContentType", "application/octet-stream"),
                }
            )
    by_key = {item["key"]: item["sha256"] for item in manifest["objects"]}
    if any(key not in by_key or (sha and by_key[key] != sha) for key, sha in required):
        raise ValueError("Durable object missing/corrupt; backup is incomplete")
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return {"backup_id": manifest["id"], "objects": len(manifest["objects"]), "complete": True}


def verify(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("version") != 1 or not manifest.get("complete"):
        raise ValueError("Unsupported or incomplete backup")
    UUID(manifest["id"])
    if digest(directory / "database.dump") != manifest["database_sha256"]:
        raise ValueError("Database backup checksum mismatch")
    seen = set()
    for item in manifest["objects"]:
        if (
            item["key"] in seen
            or not re.fullmatch(r"[a-f0-9]{64}", item["file"])
            or item["file"] != hashlib.sha256(item["key"].encode()).hexdigest()
            or digest(directory / "objects" / item["file"]) != item["sha256"]
        ):
            raise ValueError("Object backup checksum/identity mismatch")
        seen.add(item["key"])
    return manifest


def restore(directory):
    url, manifest = local_database(), verify(directory)
    ident = uuid4().hex
    database, bucket = "ngertiin_restore_" + ident, "ngertiin-restore-" + ident
    client = s3_client()
    # Both destinations are newly allocated; existing data is never overwritten.
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as error:
        if error.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
            raise
    else:
        raise ValueError("Restore bucket already exists")
    with psycopg.connect(url.render_as_string(hide_password=False), autocommit=True) as conn:
        conn.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(database))
        )
    client.create_bucket(Bucket=bucket)
    pg_command("pg_restore", database, source=directory / "database.dump")
    for item in manifest["objects"]:
        client.upload_file(
            str(directory / "objects" / item["file"]),
            bucket,
            item["key"],
            ExtraArgs={"ContentType": item["content_type"]},
        )
        with client.get_object(Bucket=bucket, Key=item["key"])["Body"] as stream:
            if hashlib.sha256(stream.read()).hexdigest() != item["sha256"]:
                raise ValueError("Restored object checksum mismatch; target remains offline")
    return {"database": database, "bucket": bucket, "backup_id": manifest["id"]}
