"""Summarize visible component frames and explicit process samples without inventing absent metrics."""
import argparse
import datetime
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
evidence = root / "docs/verification/nma-067/components"
profile = Path.home() / "Library/Application Support/Ngertiin Rust Development"
native = evidence / "native"
native.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument("--since", required=True, help="UTC ISO timestamp of the native iteration")
parser.add_argument("--until", help="Exclusive UTC ISO boundary of the retained native matrix")
args = parser.parse_args()
cohort = []
for path in profile.glob("avatar-performance-*.json"):
    data = json.loads(path.read_text())
    if data.get("started_utc", "") >= args.since:
        if args.until and data["started_utc"] >= args.until:
            continue
        if len(data.get("image_deliveries_ms", [])) >= 8192:
            continue  # Saturated bounded histories cannot claim a complete update count.
        cohort.append((data["started_utc"], path, data))
for _, path, data in sorted(cohort):
    (native / f"{data['avatars']}-{data['state'].lower()}.json").write_bytes(path.read_bytes())


def percentile(values, q):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * q))] if ordered else None


def instant(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))


def visibility_timeline(kind, data):
    changes = data.get("visibility_changes", [])
    origin = changes[0][0] if kind == "native" and changes else 0
    events = [((at - origin) / 1000, visible) for at, visible in changes]
    return origin, events


def visible_at(at, events):
    visible = False
    for when, value in events:
        if when > at:
            break
        visible = value
    return visible


def active_interval(start, end, events):
    return (visible_at(start, events) and visible_at(end, events)
            and not any(start < at <= end and not value for at, value in events))


def visible_seconds(events, elapsed):
    total = 0.0
    for index, (start, visible) in enumerate(events):
        end = events[index + 1][0] if index + 1 < len(events) else elapsed
        if visible:
            total += max(0.0, end - start)
    return total


def process_metrics(kind, data, events):
    path = evidence / f"{kind}-matrix-process.json"
    if not path.exists():
        return None
    source = json.loads(path.read_text())
    start, end = instant(data["started_utc"]), instant(data["ended_utc"])
    samples = [s for s in source["samples"] if start <= instant(s["at_utc"]) <= end]
    cpu_seconds, duration, rates = 0.0, 0.0, []
    cpu = lambda sample: sum(p["cpu_seconds"] for p in sample["processes"])
    for before, after in zip(samples, samples[1:]):
        t0 = (instant(before["at_utc"]) - start).total_seconds()
        t1 = (instant(after["at_utc"]) - start).total_seconds()
        same_pids = {p["pid"] for p in before["processes"]} == {p["pid"] for p in after["processes"]}
        if same_pids and t1 > t0 and active_interval(t0, t1, events):
            delta = max(0.0, cpu(after) - cpu(before))
            cpu_seconds += delta
            duration += t1 - t0
            rates.append(100 * delta / (t1 - t0))
    active = [s for s in samples if visible_at((instant(s["at_utc"]) - start).total_seconds(), events)]
    if not active or duration == 0:
        return None
    expected = {int(pid) for pid in source["pids"].split(",")}
    return {
        "pids": source["pids"], "sample_count": len(active), "visible_sample_seconds": duration,
        "cpu_percent": 100 * cpu_seconds / duration, "cpu_p95_percent": percentile(rates, .95),
        "rss_peak_bytes": max(sum(p["rss_bytes"] for p in s["processes"]) for s in active),
        "missing_pid_samples": sum({p["pid"] for p in s["processes"]} != expected for s in active),
        "coverage_percent": duration * 100 / max(.001, visible_seconds(events, data["elapsed_seconds"])),
    }


records = []
for kind in ["native", "tauri"]:
    for path in sorted((evidence / kind).glob("*.json")):
        data = json.loads(path.read_text())
        if kind == "tauri":
            edge = 128 if data.get("avatars") == 1 else 32
            boxes = data.get("render_boxes", [])
            valid_layout = len(boxes) == data.get("avatars") and all(
                all(abs(box.get(key, 0) - edge) < .01
                    for key in ["width", "height", "svg_width", "svg_height"])
                and box.get("x", -1) >= 0 and box.get("y", -1) >= 0
                and box["x"] + box["width"] <= data["viewport"][0]
                and box["y"] + box["height"] <= data["viewport"][1]
                for box in boxes)
            if not (data.get("version") == 3 and data.get("layout_verified") is True
                    and data.get("visibility_policy") == "native-and-document"
                    and data.get("reduced_motion") is False and valid_layout
                    and data.get("frames_ms") and max(data["frames_ms"]) <= 1000
                    and data.get("image_deliveries_ms")):
                raise ValueError(f"Invalid Tauri benchmark record: {path}")
        if kind == "native" and data.get("started_utc", "") < args.since:
            continue
        if kind == "native" and args.until and data.get("started_utc", "") >= args.until:
            continue
        origin, visibility = visibility_timeline(kind, data)
        changes = [(at - origin) / 1000 for at in data.get("image_deliveries_ms", [])]
        intervals = [(b - a) * 1000 for a, b in zip(changes, changes[1:])
                     if active_interval(a, b, visibility)]
        visible = visible_seconds(visibility, data["elapsed_seconds"])
        record = {
            "host": kind, "avatars": data["avatars"], "state": data["state"].lower(),
            "source": str(path.relative_to(root)), "viewport": data["viewport"],
            "device_scale": data["device_scale"], "sample_seconds": data["elapsed_seconds"],
            "visible_sample_seconds": visible,
            "visibility_uninterrupted": bool(visibility) and all(v for _, v in visibility),
            "valid_visible_sample": visible >= 120 and not data.get("visibility_truncated", False),
            "texture_ready_count": data.get("texture_ready_count"),
            "actual_image_updates": sum(visible_at(at, visibility) for at in changes),
            "actual_image_interval_p95_ms": percentile(intervals, .95),
            "process": process_metrics(kind, data, visibility),
        }
        if kind == "native":
            groups = data["frames"]
            drawn = sum(g["drawn"] for g in groups)
            missed = sum(g["missed_refreshes"] for g in groups)
            record.update({
                "framework_draw_p95_ms": max((g["draw_p95_ms"] for g in groups), default=None),
                "framework_work_p95_ms": max((g["work_p95_ms"] for g in groups), default=None),
                "missed_refresh_percent": 100 * missed / (drawn + missed) if drawn + missed else None,
            })
        else:
            record["raf_interval_p95_ms"] = percentile(data["frames_ms"], .95)
        records.append(record)

comparisons = []
for count in [1, 10, 30]:
    for state in ["idle", "thinking", "working"]:
        pair = {r["host"]: r for r in records if r["avatars"] == count and r["state"] == state}
        same = len(pair) == 2 and all(pair["native"][k] == pair["tauri"][k]
                                    for k in ["viewport", "device_scale"])
        ratios = None
        if same and all(r["process"] for r in pair.values()):
            ratios = pair["native"]["process"]["rss_peak_bytes"] / pair["tauri"]["process"]["rss_peak_bytes"]
        comparisons.append({"avatars": count, "state": state, "both_recorded": len(pair) == 2,
                            "same_viewport_scale": same, "rss_ratio": ratios})
output = {
    "version": 2, "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "records": records, "comparisons": comparisons,
    "complete": len(records) == 18 and all(c["same_viewport_scale"] for c in comparisons)
                and all(r["valid_visible_sample"]
                        and r["texture_ready_count"] == r["avatars"]
                        and r["process"] is not None
                        and r["process"]["coverage_percent"] >= 98
                        and r["process"]["missing_pid_samples"] == 0 for r in records),
    "caveat": "GPUI draw/work, browser rAF and actual content-change intervals are distinct. CPU/RSS exclude known hidden intervals and use explicitly recorded PIDs only; source, PID coverage and visibility still require review.",
}
(evidence / "measurements.json").write_text(json.dumps(output, indent=2) + "\n")
for record in records:
    print(record["host"], record["avatars"], record["state"], "visible seconds",
          round(record["visible_sample_seconds"], 2), "updates", record["actual_image_updates"])
