"""Stage only exact granted revisions/ranges; model context contains bounded samples."""

import asyncio
import hashlib
import json
from pathlib import PurePath

from ngertiin.files import inputs
from ngertiin.sandbox.contracts import StagedFile
from ngertiin.storage import get_object
from ngertiin.tasks import store


async def prepare(execution):
    async with store.locked(execution["owner_id"], execution["id"]) as (conn, task):
        store.fence(task, execution)
        values = await inputs.validate_live(conn, task)
    staged, descriptors = [], []
    for index, row in enumerate(values):
        original = await asyncio.to_thread(get_object, row["input_object_key"])
        if hashlib.sha256(original).hexdigest() != row["sha256"]:
            raise ValueError("Integritas revision input tidak sesuai.")
        raw = await asyncio.to_thread(get_object, row["object_key"])
        if hashlib.sha256(raw).hexdigest() != row["usage"].get("sha256"):
            raise ValueError("Integritas ekstraksi input tidak sesuai.")
        parsed, selection = json.loads(raw), row["selection"]
        start, end = selection["start"], selection["end"]
        if selection["unit"] == "page":
            pages = [p for p in parsed["pages"] if start <= p["number"] <= (end or 20)]
            if not pages:
                raise ValueError("Halaman yang dipilih tidak memiliki data.")
            data = json.dumps(pages, ensure_ascii=False).encode()
            suffix = ".json"
        else:
            text = original.decode("utf-8-sig")
            lines = text.splitlines()
            if start > len(lines) or (end is not None and end > len(lines)):
                raise ValueError("Rentang baris melebihi isi file.")
            data = (
                original
                if start == 1 and end is None
                else ("\n".join(lines[start - 1 : end]) + "\n").encode()
            )
            suffix = PurePath(row["filename"]).suffix.lower()
        name = f"input-{index + 1}{suffix}"
        staged.append(StagedFile(name, data))
        descriptors.append(
            {
                "filename": row["filename"],
                "path": "/tmp/ngertiin-work/inputs/" + name,
                "revision_id": str(row["revision_id"]),
                "selection": selection,
                "bytes": len(data),
                "sample": data[:1500].decode("utf-8", errors="replace"),
                "sample_is_complete": len(data) <= 1500,
            }
        )
    # A requested result update grants its exact prior revision as additional data.
    previous = execution["input_snapshot"].get("previous_result")
    if previous:
        from uuid import UUID

        from ngertiin.files.store import content

        for index, ref in enumerate(previous["manifest"]["files"]):
            _, data = await content(execution["owner_id"], UUID(ref["revision_id"]))
            name = f"previous-{index + 1}" + PurePath(ref["filename"]).suffix
            staged.append(StagedFile(name, data))
            descriptors.append(
                {
                    "filename": ref["filename"],
                    "path": "/tmp/ngertiin-work/inputs/" + name,
                    "bytes": len(data),
                    "sample": data[:1000].decode("utf-8", errors="replace"),
                    "source": "exact_previous_result",
                }
            )
    return staged, {**execution["input_snapshot"], "runtime_inputs": descriptors}
