"""Import a user-posted media URL through the pinned connect-time SSRF guard."""

import json
import re
from uuid import NAMESPACE_URL, uuid5

from ngertiin_engine.contracts import EngineError, digest
from ngertiin_engine.files import MAX_FILE_BYTES, Files


def authorized_url(store, config, url, stamp):
    from tools.url_safety import create_ssrf_safe_client, is_safe_url

    from ngertiin_engine.goals import Goals
    from ngertiin_engine.reliability import Reliability

    if (
        not isinstance(url, str)
        or not url.startswith("https://")
        or not is_safe_url(url)
    ):
        raise EngineError("MEDIA_SOURCE_REFUSED")

    def authorize(conn):
        Goals(store).scope(conn, stamp)
        rows = conn.execute(
            "SELECT parts FROM nma_messages WHERE owner_id=? AND thread_id=? AND author_kind='user' AND context_generation=?",
            (store.owner, config["thread_id"], int(config["context_generation"])),
        ).fetchall()
        urls = {
            match.rstrip(".,;:!?)]>")
            for row in rows
            for part in json.loads(row[0])
            for match in re.findall(r'https://[^\s<>"\']+', part.get("text", ""))
        }
        if url not in urls:
            raise EngineError(
                "MEDIA_SOURCE_REFUSED",
                {"reason": "post_the_url_in_this_conversation_first"},
            )

    store.write(authorize)
    operation = "media-url:" + digest([store.owner, config["thread_id"], url])
    identity = str(uuid5(NAMESPACE_URL, store.owner + ":file:" + operation))
    files = Files(store)

    def existing(conn):
        authorize(conn)
        try:
            return files.get(conn, identity, thread_id=config["thread_id"])
        except EngineError as exc:
            if exc.code != "NOT_FOUND":
                raise

    saved = store.write(existing)
    if saved:
        return saved
    import httpx

    try:
        with (
            create_ssrf_safe_client(
                timeout=30, follow_redirects=True, trust_env=False
            ) as client,
            client.stream("GET", url) as response,
        ):
            response.raise_for_status()
            media = (
                response.headers.get("content-type", "")
                .split(";", 1)[0]
                .strip()
                .lower()
            )
            extension = {
                "video/mp4": "mp4",
                "video/webm": "webm",
                "video/quicktime": "mov",
            }.get(media)
            if extension is None:
                raise EngineError("UNSUPPORTED_MEDIA")
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise EngineError("REQUEST_TOO_LARGE")
                chunks.append(chunk)
            data = b"".join(chunks)
    except (httpx.HTTPError, ValueError, OSError):
        raise EngineError("MEDIA_SOURCE_UNAVAILABLE") from None

    def publish(conn):
        authorize(conn)
        previous = existing(conn)
        if previous:
            return previous
        run, live, _ = Goals(store).scope(conn, stamp)
        item = files.publish(
            conn, operation, live, run, "video." + extension, media, data
        )
        Reliability(store).append(conn, run, live, "artifact.ready", item)
        return item

    return store.write(publish)
