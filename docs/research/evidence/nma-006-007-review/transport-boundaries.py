"""Read-only wire budget reproduction; creates no engine state."""
import asyncio
import json
from uuid import uuid4

from ngertiin_engine.agents import Agents
from ngertiin_engine.contracts import canonical, sign


async def exceeds(value, limit):
    wire = (canonical(value) + "\n").encode()
    reader = asyncio.StreamReader(limit=limit)
    reader.feed_data(wire)
    reader.feed_eof()
    try:
        await reader.readline()
        error = None
    except ValueError as exc:
        error = str(exc)
    return {"bytes": len(wire), "limit": limit, "error": error}


async def main():
    owner = str(uuid4())
    base = {"schema_version": "nma.v1", "command_id": str(uuid4()), "type": "runtime.submit", "expected_revision": None,
            "payload": {"agent_id": str(uuid4()), "thread_id": str(uuid4()), "config_revision": "1", "context_generation": "1", "text": "中" * 44000}}
    key = b"disposable-wire-reproduction-key-32"
    config = {"soul": "🙂" * 16000, "instructions": "🙂" * 16000, "model": "test"}
    payload = {"display_name": "Unicode probe", "handle": "unicode-probe", "config": config}
    Agents(None, {"test": {}}).validate_config(payload)
    agent = {**base, "type": "agent.create", "payload": payload}
    large_list = {"result": {"items": [{"agent_id": str(uuid4()), "config": {"soul": "中" * 16000, "instructions": "中" * 16000, "model": "test"}} for _ in range(100)], "models": [], "next_cursor": None}}
    result = {"runtime_request": await exceeds(sign(base, owner, key), 262144),
              "agent_request": await exceeds(sign(agent, owner, key), 262144),
              "agent_list_response_lower_bound": await exceeds(large_list, 16 * 1024 * 1024)}
    assert all(item["error"] for item in result.values())
    print(json.dumps(result, indent=2))


asyncio.run(main())
