"""Stage explicitly assigned, hashed skill assets without mounting host directories."""

import base64
import hashlib
from pathlib import Path, PurePosixPath

from ngertiin_engine.contracts import EngineError, digest


def manifest(entry):
    assets = entry.get("native_assets", {})
    if not isinstance(assets, dict) or len(assets) > 32:
        raise EngineError("CAPABILITY_UNAVAILABLE")
    result, total = {}, 0
    for name, item in assets.items():
        if (
            not isinstance(name, str)
            or not name
            or PurePosixPath(name).is_absolute()
            or ".." in PurePosixPath(name).parts
            or "\\" in name
            or any(ord(c) < 32 for c in name)
            or not isinstance(item, dict)
            or set(item) != {"path", "sha256", "executable"}
            or type(item["executable"]) is not bool
        ):
            raise EngineError("CAPABILITY_UNAVAILABLE")
        path = Path(item["path"])
        if (
            not path.is_absolute()
            or path.is_symlink()
            or not path.is_file()
            or path.stat().st_size > 1024 * 1024
        ):
            raise EngineError("CAPABILITY_UNAVAILABLE")
        data = path.read_bytes()
        total += len(data)
        if (
            total > 8 * 1024 * 1024
            or hashlib.sha256(data).hexdigest() != item["sha256"]
        ):
            raise EngineError("CAPABILITY_UNAVAILABLE")
        result[name] = {"sha256": item["sha256"], "executable": item["executable"]}
    return result


def directory(entry):
    return "imports/skills/" + digest(manifest(entry))[:24]


def stage(marker, broker, scope, authorize):
    from ngertiin_engine.capabilities import catalog
    from ngertiin_engine.files import PART_BYTES

    for identity in marker["grants"].get("skill_refs", []):
        entry = catalog().get("skill_refs", {}).get(identity, {})
        assets = manifest(entry)
        parent = "imports/skills/" + digest(assets)[:24]
        for name, metadata in assets.items():
            data = Path(entry["native_assets"][name]["path"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != metadata["sha256"]:
                raise EngineError("ACCESS_REVOKED")
            for offset in range(0, max(1, len(data)), PART_BYTES):
                broker.invoke(
                    scope,
                    "skill:" + digest([identity, assets, name, offset]),
                    "_nma_file",
                    {
                        "path": parent + "/" + name,
                        "sha256": metadata["sha256"],
                        "byte_count": len(data),
                        "offset": offset,
                        "data_base64": base64.b64encode(
                            data[offset : offset + PART_BYTES]
                        ).decode(),
                        "executable": metadata["executable"],
                    },
                    schema_hash="nma.workspace.v1",
                    allowed_tools={"_nma_file"},
                    authorize=authorize,
                )
