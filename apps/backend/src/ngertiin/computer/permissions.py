"""Only exact URLs in the user's request are eligible for automatic navigation."""

import re
from urllib.parse import urlsplit


def requested_urls(text):
    values = []
    for value in re.findall(r"https://[^\s<>\"']+", text):
        value = value.rstrip(".,;!?)")
        parsed = urlsplit(value)
        if parsed.hostname and not parsed.username and not parsed.password:
            values.append(value)
    return list(dict.fromkeys(values))[:10]
