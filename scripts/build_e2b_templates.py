"""Build the explicit E2B browser template; never called during agent execution."""

import asyncio
import json
import shlex

from e2b import AsyncTemplate
from ngertiin.computer.template import INSTALL
from ngertiin.config import get_settings


async def main():
    key = get_settings().e2b_api_key.get_secret_value()
    if not key:
        raise ValueError("E2B_API_KEY is not configured.")
    for source, name in (("desktop", "ngertiin-desktop-v2"),):
        template = AsyncTemplate().from_template(source)
        if source == "desktop":
            template = template.run_cmd(
                "bash -c " + shlex.quote(INSTALL),
                user="root",
            )
        built = await AsyncTemplate.build(
            template,
            name,
            cpu_count=2,
            memory_mb=4096,
            api_key=key,
            request_timeout=60,
            on_build_logs=lambda entry: print(entry.message, flush=True),
        )
        print(json.dumps({"name": name, "template_id": built.template_id}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
