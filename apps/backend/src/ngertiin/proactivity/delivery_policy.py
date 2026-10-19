"""Bounded interruption policy, explicitly Ngertiin's policy rather than Muse internals."""

import re
from datetime import timedelta
from zoneinfo import ZoneInfo

from ngertiin.memory.policy import fingerprint

VERSION = "proactive-delivery-20-v1"
# Rolling 24-hour ceilings and spacing; intensity never promises a cadence.
LIMITS = {"quiet": (1, 12), "normal": (3, 4), "active": (6, 1)}


def dedup_key(payload):
    def normalized(value):
        return " ".join(re.findall(r"\w+", (value or "").casefold()))

    return fingerprint(
        [payload["kind"], normalized(payload["what_is_new"]), normalized(payload.get("action"))]
    )


def quiet_delay(prefs, now):
    if not prefs["quiet_enabled"]:
        return None
    local = now.astimezone(ZoneInfo(prefs["timezone"]))
    minute = local.hour * 60 + local.minute
    start, end = prefs["quiet_start"], prefs["quiet_end"]
    quiet = start <= minute < end if start < end else minute >= start or minute < end
    if not quiet:
        return None
    # Recheck every minute through a DST fold/gap rather than inventing a local instant.
    return now + timedelta(minutes=1)


def semantic_allowed(candidate, intensity):
    judgment = candidate["judgment"]
    if intensity == "quiet":
        return (
            judgment["benefit"]["score"] >= 1.8
            and judgment["timing"]["score"] >= 1.5
            and judgment["novel"]["noul"] >= 0.95
        )
    return True
