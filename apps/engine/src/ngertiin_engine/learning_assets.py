"""Stage immutable learned/catalog packages into the authorized execution capsule."""

import base64

from ngertiin_engine.contracts import digest
from ngertiin_engine.skill_packages import decode


def stage(context, broker, scope, authorize):
    from ngertiin_engine.agents import Agents
    from ngertiin_engine.app_interactions import _store_factory
    from ngertiin_engine.context import Context
    from ngertiin_engine.files import PART_BYTES
    from ngertiin_engine.skill_packages import Skills
    from ngertiin_engine.threads import Threads

    if _store_factory is None:
        return
    store = _store_factory()
    contexts = Context(store, Threads(store, Agents(store, {})))
    selection = {key: context[key] for key in ("agent_id", "thread_id")}
    items = store.write(lambda conn: Skills(store, contexts).listing(conn, selection))
    batch, size = [], 0

    def send_batch():
        if batch:
            broker.invoke(
                scope,
                "learned:" + digest(batch),
                "_nma_skill_files",
                {"files": batch},
                schema_hash="nma.workspace.v1",
                allowed_tools={"_nma_skill_files"},
                authorize=authorize,
            )
            batch.clear()

    for item in items:
        bundle = digest(item["files"])[:24]
        for name, metadata in item["files"].items():
            data = decode(metadata)
            for offset in range(0, max(1, len(data)), PART_BYTES):
                arguments = {
                    "path": "imports/skills/"
                    + bundle
                    + "/"
                    + item["name"]
                    + "/"
                    + name,
                    "sha256": metadata["sha256"],
                    "byte_count": len(data),
                    "offset": offset,
                    "data_base64": base64.b64encode(
                        data[offset : offset + PART_BYTES]
                    ).decode(),
                    "executable": metadata["executable"],
                }
                if broker.skill_batches:
                    if (
                        size + len(arguments["data_base64"]) > PART_BYTES
                        or len(batch) >= 128
                    ):
                        send_batch()
                        size = 0
                    batch.append(arguments)
                    size += len(arguments["data_base64"])
                    continue
                broker.invoke(
                    scope,
                    "learned:" + digest([bundle, name, offset]),
                    "_nma_file",
                    arguments,
                    schema_hash="nma.workspace.v1",
                    allowed_tools={"_nma_file"},
                    authorize=authorize,
                )
    send_batch()
