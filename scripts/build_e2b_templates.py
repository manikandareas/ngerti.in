"""Build the two explicit E2B templates; never called by a Task or worker."""

import asyncio
import json

from e2b import AsyncTemplate
from ngertiin.config import get_settings


async def main():
    key = get_settings().e2b_api_key.get_secret_value()
    if not key:
        raise ValueError("E2B_API_KEY belum dikonfigurasi.")
    for source, name in (
        ("base", "ngertiin-code-v1"),
        ("desktop", "ngertiin-desktop-v1"),
    ):
        built = await AsyncTemplate.build(
            AsyncTemplate().from_template(source),
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
