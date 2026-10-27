"""Project native inline screenshots into the existing scoped binary artifacts."""

import base64
import json

from ngertiin_engine.files import Files


def publish(store, stamp, run_id, operation, value):
    original_string = isinstance(value, str)
    try:
        decoded = json.loads(value) if original_string else value
    except (TypeError, ValueError):
        return value
    if not isinstance(decoded, dict) or not decoded.get("_multimodal"):
        return value
    images = []
    for block in decoded.get("content", []):
        if not isinstance(block, dict) or block.get("type") != "image_url":
            continue
        url = block.get("image_url", {})
        url = url.get("url") if isinstance(url, dict) else url
        if isinstance(url, str) and url.startswith(
            ("data:image/png;base64,", "data:image/jpeg;base64,")
        ):
            images.append(url)
    if not images:
        return value

    def write(conn):
        from ngertiin_engine.goals import Goals
        from ngertiin_engine.reliability import Reliability

        _, config, _ = Goals(store).scope(conn, stamp)
        items = []
        for index, url in enumerate(images[:4]):
            header, encoded = url.split(",", 1)
            png = "image/png" in header
            data = base64.b64decode(encoded, validate=True)
            item = Files(store).publish(
                conn,
                operation + ":image:" + str(index),
                config,
                run_id,
                "screen." + ("png" if png else "jpg"),
                "image/png" if png else "image/jpeg",
                data,
            )
            Reliability(store).append(conn, run_id, config, "artifact.ready", item)
            items.append(item)
        return items

    decoded["artifacts"] = store.write(write)
    return json.dumps(decoded) if original_string else decoded
