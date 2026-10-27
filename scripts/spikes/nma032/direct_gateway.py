"""Direct pinned Hermes gateway with the same isolated native handler placement.

No product adapter, product tables, domain prompts or alternate model executor.
The only adaptation is signed handler placement, matching the measured backend.
"""

import contextvars
import os
import sys
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "apps/engine/src"), os.environ["HERMES_SOURCE"]]
from ngertiin_engine.contracts import digest
from ngertiin_engine.native_executor import IsolatedTools, Scope
from ngertiin_engine.runtime import verify

verify(Path(os.environ["HERMES_SOURCE"]))
OWNER = os.environ["NMA032_OWNER"]
broker = IsolatedTools(
    os.environ["NMA032_CONTROL"], OWNER, image=os.environ["NMA_TEST_DESKTOP_IMAGE"]
)
identity = contextvars.ContextVar("direct_native_call", default=None)
NATIVE = {
    "browser_exec",
    "browser_cdp",
    "browser_dialog",
    "terminal",
    "read_file",
    "write_file",
    "search_files",
    "patch",
}


def scope_for(session_id):
    return Scope(
        OWNER,
        str(
            uuid5(
                NAMESPACE_URL,
                OWNER + ":profile:" + str(Path(os.environ["HERMES_HOME"]).resolve()),
            )
        ),
        str(uuid5(NAMESPACE_URL, OWNER + ":session:" + session_id)),
    )


def install():
    import model_tools
    from tools.registry import registry

    for name in NATIVE:
        entry = registry.get_entry(name)
        schema = entry.schema

        def invoke(arguments, _name=name, _schema=schema, **kwargs):
            ids = identity.get()
            if ids is None:
                raise ValueError("Native call identity required")
            return broker.invoke(
                scope_for(ids.session_id),
                digest([ids.turn_id, ids.tool_call_id, _name]),
                _name,
                arguments,
                schema_hash=digest(_schema),
                allowed_tools=NATIVE,
                timeout=315,
            )

        registry.register(
            name=name,
            toolset="nma032_direct",
            schema=schema,
            handler=invoke,
            check_fn=lambda: True,
            dynamic_schema_overrides=entry.dynamic_schema_overrides,
            override=True,
        )
    original = model_tools._execute_tool

    def dispatch(name, arguments, original_args, ids, **kwargs):
        token = identity.set(ids)
        try:
            return original(name, arguments, original_args, ids, **kwargs)
        finally:
            identity.reset(token)

    model_tools._execute_tool = dispatch


if __name__ == "__main__":
    install()
    from gateway.run import main

    main()
