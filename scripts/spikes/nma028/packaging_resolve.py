"""Build a reviewed local-CDP distribution without the unused Fetch service.

Only wheel metadata changes. Every upstream browser_harness module, resource,
entry point and MIT notice is retained byte-for-byte. Fetch proxy is an optional,
unselected provider variant, not an accepted or installed capability.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path
from urllib.request import urlopen

UPSTREAM_VERSION = "0.1.13"
PROFILE_VERSION = "0.1.13+ngertiin.localcdp.1"
UPSTREAM_URL = "https://files.pythonhosted.org/packages/4a/bd/f166cf9a465eff436048d25851ab28b0d798af02b56998127a4165227fc4/browser_harness-0.1.13-py3-none-any.whl"
UPSTREAM_SHA256 = "2491459e4bfc0ee8aea22dc6c4680fc0f791b7ba553446323c50d2883449d769"
NOTICE_SHA256 = "5afa3d97bf1e6f998d587fa101e3fe0d0c416840b7fe77bcd6ae97690a334631"
OLD_INFO = "browser_harness-0.1.13.dist-info"
NEW_INFO = "browser_harness-" + PROFILE_VERSION + ".dist-info"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(upstream_bytes):
    if sha(upstream_bytes) != UPSTREAM_SHA256:
        raise ValueError("Unreviewed browser-harness wheel")
    with zipfile.ZipFile(io.BytesIO(upstream_bytes)) as archive:
        original = {name: archive.read(name) for name in archive.namelist()}
    notice = original[OLD_INFO + "/licenses/LICENSE"]
    if sha(notice) != NOTICE_SHA256:
        raise ValueError("Browser Harness MIT notice changed")
    helper = original["browser_harness/helpers.py"].decode()
    if helper.count("from fetch_use import fetch_sync") != 1:
        raise ValueError("Fetch dependency use changed; re-audit required")
    expected = """    if os.environ.get("BROWSER_USE_API_KEY"):
        try:
            from fetch_use import fetch_sync
            return fetch_sync(url, headers=headers, timeout_ms=int(timeout * 1000)).text
        except ImportError:
            pass"""
    if expected not in helper:
        raise ValueError("Native optional Fetch fallback changed")
    imports = [
        name
        for name, data in original.items()
        if name.endswith(".py")
        and (b"import fetch_use" in data or b"from fetch_use" in data)
    ]
    if imports != ["browser_harness/helpers.py"]:
        raise ValueError("Unexpected use of the Fetch service dependency")
    metadata = original[OLD_INFO + "/METADATA"]
    header, body = metadata.split(b"\n\n", 1)
    if header.count(b"Requires-Dist: fetch-use==0.4.0\n") != 1:
        raise ValueError("Dependency metadata changed")
    header = header.replace(
        b"Version: 0.1.13\n", ("Version: " + PROFILE_VERSION + "\n").encode(), 1
    )
    header = header.replace(
        b"Requires-Dist: fetch-use==0.4.0\n",
        b'Requires-Dist: fetch-use==0.4.0; extra == "fetch-proxy"\n',
        1,
    )
    header += b"\nProvides-Extra: fetch-proxy"
    members = {
        name.replace(OLD_INFO + "/", NEW_INFO + "/", 1): data
        for name, data in original.items()
        if name != OLD_INFO + "/RECORD"
    }
    members[NEW_INFO + "/METADATA"] = header + b"\n\n" + body
    provenance = {
        "profile": "local-cdp-v1",
        "upstream_version": UPSTREAM_VERSION,
        "version": PROFILE_VERSION,
        "upstream_url": UPSTREAM_URL,
        "upstream_sha256": UPSTREAM_SHA256,
        "metadata_only": True,
        "module_changes": [],
        "notice_sha256": NOTICE_SHA256,
        "selected_backend": "local Chromium or explicit CDP endpoint",
        "supported_operations": [
            "native browser_exec Python",
            "navigate",
            "form",
            "CDP",
            "browser download",
            "upload",
            "screenshot",
            "local urllib http_get",
        ],
        "unselected_provider_variant": {
            "extra": "fetch-proxy",
            "dependency": "fetch-use==0.4.0",
            "operation": "Browser Use hosted Fetch proxy through http_get",
            "status": "not installed, not selected and not accepted",
            "reason": "Requires service credentials and an unresolved exact release notice. Upstream already lazy-imports it and falls back to urllib. No browser/CDP helper depends on it.",
        },
        "unmodified_source_hashes": {
            name: sha(data)
            for name, data in original.items()
            if not name.startswith(OLD_INFO + "/")
        },
    }
    members[NEW_INFO + "/NGERTIIN-PROFILE.json"] = (
        json.dumps(provenance, indent=2, sort_keys=True) + "\n"
    ).encode()
    record = io.StringIO(newline="")
    writer = csv.writer(record, lineterminator="\n")
    for name, data in sorted(members.items()):
        digest = (
            base64.urlsafe_b64encode(hashlib.sha256(data).digest())
            .rstrip(b"=")
            .decode()
        )
        writer.writerow([name, "sha256=" + digest, len(data)])
    writer.writerow([NEW_INFO + "/RECORD", "", ""])
    members[NEW_INFO + "/RECORD"] = record.getvalue().encode()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    output_bytes = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(output_bytes)) as archive:
        for name, data in original.items():
            if not name.startswith(OLD_INFO + "/") and archive.read(name) != data:
                raise ValueError("Browser module/resource changed: " + name)
        if archive.read(NEW_INFO + "/licenses/LICENSE") != notice:
            raise ValueError("MIT notice was not preserved")
    return output_bytes, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--upstream-wheel", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    data = (
        args.upstream_wheel.read_bytes()
        if args.upstream_wheel
        else urlopen(UPSTREAM_URL, timeout=60).read()
    )
    wheel, provenance = build(data)
    again, _ = build(data)
    if wheel != again:
        raise ValueError("Wheel output is not deterministic")
    name = "browser_harness-" + PROFILE_VERSION + "-py3-none-any.whl"
    (args.output / name).write_bytes(wheel)
    provenance.update(
        wheel_filename=name, wheel_sha256=sha(wheel), reproducible_build=True
    )
    (args.output / "packaging-local-cdp.json").write_text(
        json.dumps(provenance, indent=2) + "\n"
    )
    print(str(args.output / name))


if __name__ == "__main__":
    main()
