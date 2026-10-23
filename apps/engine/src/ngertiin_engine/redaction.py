"""Redact resolved connector credentials before native logs and tool results escape."""

import logging
import traceback

_values: set[str] = set()


def remember(server):
    for header in server.get("headers", []):
        value = header["value"]
        if value:
            _values.add(value)
            if value.startswith("Bearer "):
                _values.add(value[7:])


def text(value):
    for secret in sorted(_values.copy(), key=len, reverse=True):
        value = value.replace(secret, "[REDACTED]")
    return value


def result(value):
    if isinstance(value, str):
        return text(value)
    if isinstance(value, list):
        return [result(item) for item in value]
    if isinstance(value, dict):
        return {text(key): result(item) for key, item in value.items()}
    return value


def install():
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        record.msg, record.args = text(record.getMessage()), ()
        if record.exc_info:
            record.exc_text = text(
                "".join(traceback.format_exception(*record.exc_info))
            )
            record.exc_info = None
        return record

    logging.setLogRecordFactory(factory)
