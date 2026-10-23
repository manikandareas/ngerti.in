"""Install the adapter in Hermes's own process and shutdown lifecycle.

The only integration seam is replacing the runner facade with a subclass before
native bootstrap instantiates it. No polling, scheduler or model executor is added.
"""

import asyncio
import json
import logging
import os
import sqlite3
from pathlib import Path

from ngertiin_engine.adapter import Adapter
from ngertiin_engine.contracts import EngineError, authenticate, canonical, uuid
from ngertiin_engine.store import CHECKSUM

logger = logging.getLogger(__name__)


def main():
    from ngertiin_engine.runtime import verify

    verify(Path(os.environ["HERMES_SOURCE"]).resolve())
    owner = uuid(os.environ["NMA_OWNER_ID"])
    home = Path(os.environ["HERMES_HOME"]).resolve()
    database = home / "state.db"
    if database.exists():
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
            if db.execute(
                "SELECT 1 FROM sqlite_master WHERE name='nma_partition'"
            ).fetchone():
                rows = db.execute("SELECT owner_id FROM nma_partition").fetchall()
                if rows != [(owner,)]:
                    raise EngineError("PARTITION_MISMATCH")
                version = db.execute(
                    "SELECT schema_version FROM nma_partition"
                ).fetchone()[0]
                checksum = db.execute(
                    "SELECT checksum FROM nma_schema_migrations WHERE owner_id=? AND version=1",
                    (owner,),
                ).fetchone()
                if version != 1 or not checksum or checksum[0] != CHECKSUM:
                    raise EngineError("UNSUPPORTED_SCHEMA")
    key = Path(os.environ["NMA_SERVICE_KEY_FILE"]).read_bytes()
    if len(key) < 32:
        raise EngineError("INVALID_SERVICE_KEY")
    configurations = json.loads(Path(os.environ["NMA_BINDINGS_FILE"]).read_text())
    from gateway import run
    from gateway.session_authorities import active_authority

    class EngineRunner(run.GatewayRunner):
        nma_server = None

        async def start(self):
            started = await super().start()
            if not started:
                return False
            try:
                self.nma_adapter = Adapter(
                    active_authority(self), owner, configurations
                )
                socket = home / "nma.sock"
                if len(os.fsencode(socket)) > 100:
                    raise EngineError("SOCKET_PATH_TOO_LONG")
                socket.unlink(missing_ok=True)
                self.nma_server = await asyncio.start_unix_server(
                    self.nma_request, path=socket, limit=262144
                )
                socket.chmod(0o600)
                return True
            except BaseException:
                await super().stop()
                raise

        async def nma_request(self, reader, writer):
            try:
                async with asyncio.timeout(30):
                    line = await reader.readline()
                    envelope = json.loads(line)
                    if not isinstance(envelope, dict):
                        raise EngineError("INVALID_REQUEST")
                    body = authenticate(envelope, owner, key)
                    # A disconnected client cannot cancel an accepted native operation.
                    result = await asyncio.shield(self.nma_adapter.dispatch(body))
                    reply = {"result": result}
            except EngineError as exc:
                reply = {"error": {"code": exc.code}}
            except (ValueError, TypeError, KeyError):
                reply = {"error": {"code": "INVALID_REQUEST"}}
            except Exception as exc:  # noqa: BLE001 - protocol boundary must not expose native secrets
                logger.error("Engine request failed (%s)", type(exc).__name__)
                reply = {"error": {"code": "ENGINE_UNAVAILABLE"}}
            try:
                writer.write((canonical(reply) + "\n").encode())
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()

        async def stop(self, *args, **kwargs):
            if self.nma_server:
                self.nma_server.close()
                await self.nma_server.wait_closed()
                self.nma_server = None
            return await super().stop(*args, **kwargs)

    run.GatewayRunner = EngineRunner
    run.main()


if __name__ == "__main__":
    main()
