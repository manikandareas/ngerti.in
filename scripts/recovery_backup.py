"""Offline backup/restore drills; no overwrite and no automatic provider effects."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from uuid import UUID

from ngertiin.async_db import close_pool
from ngertiin.config import get_settings
from ngertiin.recovery import backup
from ngertiin.recovery.restore import quarantine, release


async def hold(target):
    backup.local_database()
    original = get_settings().database_url.get_secret_value()
    from sqlalchemy.engine import make_url

    os.environ["DATABASE_URL"] = (
        make_url(original)
        .set(database=target["database"])
        .render_as_string(hide_password=False)
    )
    get_settings.cache_clear()
    os.environ["S3_BUCKET"] = target["bucket"]
    get_settings.cache_clear()
    try:
        await quarantine(UUID(target["backup_id"]))
    finally:
        await close_pool()
    return {**target, "quarantined": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("directory", type=Path)
    create.add_argument("--quiesced", action="store_true")
    restore = sub.add_parser("restore")
    restore.add_argument("directory", type=Path)
    sub.add_parser("release")
    args = parser.parse_args()
    if args.command == "create":
        result = backup.create(args.directory, quiesced=args.quiesced)
    elif args.command == "restore":
        result = asyncio.run(hold(backup.restore(args.directory)))
    else:
        backup.local_database()

        async def finish():
            try:
                return await release()
            finally:
                await close_pool()

        result = asyncio.run(finish())
    print(json.dumps(result))


if __name__ == "__main__":
    main()
