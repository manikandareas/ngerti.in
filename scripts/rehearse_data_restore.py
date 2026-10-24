"""Rehearse preserved V1 data on two disposable local PostgreSQL databases."""

import hashlib
import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import psycopg
from ngertiin.agent_engine.migration import plan
from ngertiin.config import get_settings
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from sqlalchemy.engine import make_url


def main():
    settings = get_settings()
    config = conninfo_to_dict(settings.database_url.get_secret_value())
    if settings.app_env != "development" or config.get("host") not in {
        "localhost",
        "127.0.0.1",
    }:
        raise ValueError("Rehearsal requires local development PostgreSQL")
    suffix = uuid4().hex[:12]
    source, restored = f"nma_rehearsal_{suffix}", f"nma_restore_{suffix}"
    owner, other, thread, goal, file_id = [str(uuid4()) for _ in range(5)]
    evidence = Path("docs/research/evidence/nma-025-026")
    evidence.mkdir(parents=True, exist_ok=True)
    tables = (
        "accounts",
        "agent_profiles",
        "chat_threads",
        "chat_messages",
        "user_goals",
        "product_files",
        "file_revisions",
    )
    with psycopg.connect(
        settings.database_url.get_secret_value(), autocommit=True
    ) as admin:
        try:
            for name in (source, restored):
                admin.execute(
                    sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name))
                )
            env = os.environ | {
                "DATABASE_URL": make_url(settings.database_url.get_secret_value())
                .set(database=source)
                .render_as_string(hide_password=False)
            }
            subprocess.run(
                [
                    "uv",
                    "run",
                    "--project",
                    "apps/backend",
                    "python",
                    "-m",
                    "ngertiin.setup",
                ],
                env=env,
                check=True,
                capture_output=True,
            )
            with psycopg.connect(env["DATABASE_URL"]) as db:
                db.execute(
                    "INSERT INTO accounts(id,clerk_user_id,created_at) VALUES(%s,'fixture-owner',now()),(%s,'fixture-other',now())",
                    (owner, other),
                )
                db.execute(
                    "INSERT INTO agent_profiles(owner_id,name,soul) VALUES(%s,'Preserved assistant','Private user-authored persona')",
                    (owner,),
                )
                db.execute(
                    "INSERT INTO chat_threads(id,owner_id,kind,title) VALUES(%s,%s,'main','Historical private thread')",
                    (thread, owner),
                )
                db.execute(
                    "INSERT INTO chat_messages(id,thread_id,role,parts,position) VALUES(%s,%s,'user','[]',1)",
                    (str(uuid4()), thread),
                )
                db.execute(
                    "INSERT INTO user_goals(id,owner_id,thread_id,state,spec) VALUES(%s,%s,%s,'paused','{}')",
                    (goal, owner, thread),
                )
                db.execute(
                    "INSERT INTO product_files(id,owner_id) VALUES(%s,%s)",
                    (file_id, owner),
                )
                db.execute(
                    "INSERT INTO file_revisions(id,file_id,owner_id,revision,request_key,fingerprint,filename,content_type,size,sha256,object_key,page_count,source,status) VALUES(%s,%s,%s,1,%s,'fixture','history.txt','text/plain',4,%s,'fixture/history.txt',1,'upload','ready')",
                    (
                        str(uuid4()),
                        file_id,
                        owner,
                        str(uuid4()),
                        hashlib.sha256(b"data").hexdigest(),
                    ),
                )

            def rows(database):
                with psycopg.connect(
                    make_conninfo(**(config | {"dbname": database}))
                ) as db:
                    return {
                        table: db.execute(
                            sql.SQL(
                                "SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text"
                            ).format(sql.Identifier(table))
                        ).fetchall()
                        for table in tables
                    }

            before = rows(source)
            container = os.environ.get(
                "NMA_REHEARSAL_CONTAINER", "ngertiin-v1-postgres-1"
            )
            dump = subprocess.check_output(
                [
                    "docker",
                    "exec",
                    container,
                    "pg_dump",
                    "-U",
                    config["user"],
                    "-d",
                    source,
                    "-Fc",
                ]
            )
            subprocess.run(
                [
                    "docker",
                    "exec",
                    "-i",
                    container,
                    "pg_restore",
                    "-U",
                    config["user"],
                    "-d",
                    restored,
                    "--exit-on-error",
                ],
                input=dump,
                check=True,
                capture_output=True,
            )
            assert rows(restored) == before
            with psycopg.connect(
                make_conninfo(**(config | {"dbname": restored}))
            ) as db:
                assert (
                    db.execute(
                        "SELECT count(*) FROM chat_threads WHERE owner_id=%s", (other,)
                    ).fetchone()[0]
                    == 0
                )
                assert (
                    db.execute(
                        "SELECT state FROM user_goals WHERE id=%s", (goal,)
                    ).fetchone()[0]
                    == "paused"
                )
            release_env = os.environ | {
                "DATABASE_URL": make_url(settings.database_url.get_secret_value())
                .set(database=restored)
                .render_as_string(hide_password=False)
            }
            guard_command = [
                "uv",
                "run",
                "--project",
                "apps/backend",
                "python",
                "-c",
                "import asyncio; from ngertiin.agent_engine.recovery import ensure_database_released; asyncio.run(ensure_database_released())",
            ]
            subprocess.run(
                guard_command, env=release_env, check=True, capture_output=True
            )
            with psycopg.connect(release_env["DATABASE_URL"]) as db:
                db.execute(
                    "INSERT INTO recovery_restores(id,backup_id) VALUES(%s,%s)",
                    (str(uuid4()), str(uuid4())),
                )
            held = subprocess.run(
                guard_command,
                env=release_env,
                check=False,
                capture_output=True,
                text=True,
            )
            assert held.returncode != 0 and "quarantined" in held.stderr
            with psycopg.connect(release_env["DATABASE_URL"]) as db:
                db.execute("UPDATE recovery_restores SET released_at=now()")
            subprocess.run(
                guard_command, env=release_env, check=True, capture_output=True
            )
            mapping = plan(
                owner,
                {
                    "name": "Preserved assistant",
                    "soul": "Private user-authored persona",
                    "revision": 1,
                },
                "test",
            )
            assert mapping == plan(
                owner,
                {
                    "name": "Preserved assistant",
                    "soul": "Private user-authored persona",
                    "revision": 1,
                },
                "test",
            )
            report = {
                "disposable": True,
                "counts": {k: len(v) for k, v in before.items()},
                "exact_row_equality": True,
                "api_restore_quarantine_and_release": True,
                "other_owner_history_count": 0,
                "paused_goal_preserved": True,
                "dump_sha256": hashlib.sha256(dump).hexdigest(),
                "default_agent_command_id": mapping["command"]["command_id"],
                "object_bytes": "External object backup remains an operator obligation; only preserved metadata is exercised here.",
            }
            (evidence / "postgres-restore.json").write_text(
                json.dumps(report, indent=2) + "\n"
            )
            print(json.dumps(report, indent=2))
        finally:
            for name in (restored, source):
                admin.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(name)
                    )
                )


if __name__ == "__main__":
    main()
