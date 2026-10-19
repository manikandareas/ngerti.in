"""Calendar recurrence uses wall time; hourly intervals use elapsed UTC time."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ngertiin.schedules.contracts import ScheduleSpec


def instant(spec: ScheduleSpec, day: date) -> datetime | None:
    wall = datetime.combine(day, time.fromisoformat(spec.local_time))
    local = wall.replace(tzinfo=ZoneInfo(spec.timezone), fold=0)
    utc = local.astimezone(UTC)
    if utc.astimezone(local.tzinfo).replace(tzinfo=None) != wall:
        return None
    return utc


def matches(spec: ScheduleSpec, day: date) -> bool:
    return day >= spec.start_date and (
        day == spec.start_date
        if spec.frequency == "once"
        else spec.frequency == "daily" or day.weekday() in spec.weekdays
    )


def next_time(spec: ScheduleSpec, after: datetime, *, inclusive=False) -> datetime | None:
    if spec.frequency == "interval":
        assert spec.interval_hours is not None  # ScheduleSpec enforces this invariant.
        anchor = instant(spec, spec.start_date)
        if anchor is None:
            return None
        if after < anchor:
            return anchor
        period = timedelta(hours=spec.interval_hours)
        tick = anchor + ((after.astimezone(UTC) - anchor) // period) * period
        if tick < after or (tick == after and not inclusive):
            tick += period
        return tick
    day = max(spec.start_date, after.astimezone(ZoneInfo(spec.timezone)).date())
    # Daily/weekly needs at most two weeks around timezone transitions. A finite
    # horizon also rejects invalid one-shot DST times without an unbounded loop.
    for offset in range(16):
        candidate_day = day + timedelta(days=offset)
        if not matches(spec, candidate_day):
            continue
        candidate = instant(spec, candidate_day)
        if candidate and (candidate >= after if inclusive else candidate > after):
            return candidate
    return None


def latest_due(spec: ScheduleSpec, first: datetime, now: datetime) -> datetime:
    if spec.frequency == "interval":
        assert spec.interval_hours is not None  # ScheduleSpec enforces this invariant.
        period = timedelta(hours=spec.interval_hours)
        first = first.astimezone(UTC)
        return first + max(0, (now.astimezone(UTC) - first) // period) * period
    day = now.astimezone(ZoneInfo(spec.timezone)).date()
    for offset in range(16):
        candidate_day = day - timedelta(days=offset)
        if not matches(spec, candidate_day):
            continue
        candidate = instant(spec, candidate_day)
        if candidate and first <= candidate <= now:
            return candidate
    return first


def preview(spec: ScheduleSpec, now: datetime) -> list[datetime]:
    values = []
    cursor = now
    for _ in range(3):
        candidate = next_time(spec, cursor)
        if not candidate:
            break
        values.append(candidate)
        cursor = candidate
    return values
