"""Download or extract the hash-verified source archive without resolving dependencies."""

import argparse
import hashlib
import io
import tarfile
from pathlib import Path
from urllib.request import urlopen

REVISION = "7489b22af47ce91b366dde81d5831ea422577498"
SHA256 = "8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--extract", type=Path)
    args = parser.parse_args()
    if args.archive.exists():
        archive = args.archive.read_bytes()
    else:
        archive = urlopen(
            f"https://codeload.github.com/NousResearch/hermes-agent/tar.gz/{REVISION}",
            timeout=120,
        ).read()
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise RuntimeError("Runtime archive checksum mismatch")
    if not args.archive.exists():
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        args.archive.write_bytes(archive)
    if args.extract:
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            for member in source.getmembers():
                parts = Path(member.name).parts
                if len(parts) > 1:
                    member.name = str(Path(*parts[1:]))
                    source.extract(member, args.extract, filter="data")


if __name__ == "__main__":
    main()
