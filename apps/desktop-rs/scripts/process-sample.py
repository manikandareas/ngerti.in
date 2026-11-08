"""Read-only macOS process measurements for an explicit development workload."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("pids", help="Comma-separated process IDs, including native child renderers when applicable")
parser.add_argument("output", type=Path)
parser.add_argument("--seconds", type=int, default=120)
args = parser.parse_args()
pids = ",".join(str(int(pid)) for pid in args.pids.split(","))
start = time.monotonic()
samples = []
args.output.parent.mkdir(parents=True, exist_ok=True)
for index in range(args.seconds + 1):
    result = subprocess.run(["ps", "-p", pids, "-o", "pid=,time=,rss="], capture_output=True, text=True, check=False)
    processes = []
    for line in result.stdout.splitlines():
        pid, cpu, rss = line.split()
        elapsed = 0.0
        for part in cpu.split(":"):
            elapsed = elapsed * 60 + float(part)
        processes.append({"pid": int(pid), "cpu_seconds": elapsed, "rss_bytes": int(rss) * 1024})
    samples.append({"at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "elapsed_seconds": time.monotonic() - start, "processes": processes})
    if index % 10 == 0 or index == args.seconds or not processes:
        args.output.write_text(json.dumps({"version": 1, "pids": pids, "requested_seconds": args.seconds, "samples": samples}, indent=2) + "\n")
    if not processes:
        break
    if index < args.seconds:
        time.sleep(1)
print(args.output)
