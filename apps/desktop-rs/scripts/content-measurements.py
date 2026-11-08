"""Summarize retained native/current-client content measurements and explicit PID samples."""
import datetime
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
folder = root / "docs/verification/nma-067/components/content"
folder.mkdir(exist_ok=True)
cohorts_path = folder / "cohorts.json"
cohorts = json.loads(cohorts_path.read_text()) if cohorts_path.exists() else {}


def instant(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))


def percentile(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int((len(values) - 1) * q))] if values else None


def visible(at, changes):
    result = False
    for when, value in changes:
        if when > at:
            break
        result = value
    return result


def process_metrics(host, record, changes):
    cohort = cohorts.get(f"{host}:{record['workload']}", {})
    path = folder / cohort.get("process_record", f"{host}-process.json")
    if not path.exists():
        return None
    source = json.loads(path.read_text())
    start, end = instant(record["started_utc"]), instant(record["ended_utc"])
    samples = [s for s in source["samples"] if start <= instant(s["at_utc"]) <= end]
    expected = {int(pid) for pid in source["pids"].split(",")}
    active = [s for s in samples if visible((instant(s["at_utc"]) - start).total_seconds(), changes)]
    duration = cpu = 0.0
    for before, after in zip(samples, samples[1:]):
        a, b = [(instant(s["at_utc"]) - start).total_seconds() for s in [before, after]]
        pids = [{p["pid"] for p in s["processes"]} for s in [before, after]]
        if (b > a and all(p == expected for p in pids) and visible(a, changes)
                and visible(b, changes) and not any(a < t <= b and not v for t, v in changes)):
            duration += b - a
            cpu += max(0, sum(p["cpu_seconds"] for p in after["processes"])
                       - sum(p["cpu_seconds"] for p in before["processes"]))
    if not active or not duration:
        return None
    return {
        "pids": source["pids"], "sample_seconds": duration,
        "coverage_percent": 100 * duration / record["visible_seconds"],
        "cpu_percent": 100 * cpu / duration,
        "rss_peak_bytes": max(sum(p["rss_bytes"] for p in s["processes"]) for s in active),
        "missing_pid_samples": sum({p["pid"] for p in s["processes"]} != expected for s in active),
    }


records = []
for host in ["native", "tauri"]:
    for path in sorted(folder.glob(f"{host}-*.json")):
        if path.name == f"{host}-process.json":
            continue
        data = json.loads(path.read_text())
        if "workload" not in data:
            continue
        divisor = 1000 if host == "tauri" else 1
        changes = [(at / divisor, value) for at, value in data["visibility_changes"]]
        sample = {
            "host": host, "workload": data["workload"], "source": str(path.relative_to(root)),
            "viewport": data["viewport"], "device_scale": data["device_scale"],
            "visible_seconds": data["visible_seconds"], "process": process_metrics(host, data, changes),
            "valid": data.get("valid", True) and data["visible_seconds"] >= 120
                     and data["viewport"] == [1280, 901] and data["device_scale"] == 2,
        }
        if host == "native":
            groups = data["frames"]
            drawn, missed = [sum(g[key] for g in groups) for key in ["drawn", "missed_refreshes"]]
            sample.update({
                "framework_work_p95_ms": max((g["work_p95_ms"] for g in groups), default=None),
                "framework_draw_p95_ms": max((g["draw_p95_ms"] for g in groups), default=None),
                "missed_refresh_percent": 100 * missed / (drawn + missed) if drawn + missed else None,
                "frames_drawn": drawn,
            })
            sample["valid"] &= drawn > 0
        else:
            sample["raf_interval_p95_ms"] = percentile(data["frames_ms"], .95)
            sample["input_events"] = len(data["events"])
            sample["valid"] &= bool(data["frames_ms"]) and bool(data["events"])
        records.append(sample)

comparisons = []
for workload in ["source-2mib-100000-lines-bounded-preview", "table-10000-by-20", "pdf-current-fixture"]:
    pair = {r["host"]: r for r in records if r["workload"] == workload}
    same = len(pair) == 2 and all(pair["native"][k] == pair["tauri"][k] for k in ["viewport", "device_scale"])
    comparisons.append({
        "workload": workload, "same_viewport_scale": same,
        "rss_ratio": pair["native"]["process"]["rss_peak_bytes"] / pair["tauri"]["process"]["rss_peak_bytes"]
        if same and all(p["process"] for p in pair.values()) else None,
    })
result = {
    "version": 1, "records": records, "comparisons": comparisons,
    "complete": len(records) == 6 and all(c["same_viewport_scale"] for c in comparisons)
    and all(r["valid"] and r["process"] and r["process"]["coverage_percent"] >= 98
            and r["process"]["missing_pid_samples"] == 0 for r in records),
    "boundary": "GPUI framework draw/work and browser rAF are distinct. Review action records and fixture hashes before interpreting RSS ratios. These component samples do not establish integrated conversation performance.",
}
native = [r for r in records if r["host"] == "native"]
result["budgets"] = {
    "native_work_p95_below_16_67_ms": all(r["framework_work_p95_ms"] <= 16.67 for r in native)
    if len(native) == 3 else None,
    "native_missed_refresh_below_1_percent": all(r["missed_refresh_percent"] <= 1 for r in native)
    if len(native) == 3 else None,
    "resident_memory_ratio_below_1_1": all(c["rss_ratio"] <= 1.1 for c in comparisons)
    if all(c["rss_ratio"] is not None for c in comparisons) else None,
}
result["passed"] = result["complete"] and all(value is True for value in result["budgets"].values())
(folder / "measurements.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
