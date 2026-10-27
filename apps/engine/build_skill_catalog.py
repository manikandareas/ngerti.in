"""Inventory every pinned bundled/optional skill without claiming universal readiness."""

import argparse
import hashlib
import json
import re
from pathlib import Path

DOCUMENTS = {
    "docx": ["python-docx", "soffice", "pdftoppm"],
    "xlsx": ["openpyxl", "soffice"],
    "powerpoint": ["python-pptx", "soffice", "pdftoppm"],
    "pdf": ["pypdf", "reportlab", "pdfplumber", "pdftoppm"],
}
SUPPORTED = {
    *DOCUMENTS,
    "grounded-citations",
    "codebase-inspection",
    "systematic-debugging",
}


def inventory(source):
    import hermes_yaml as yaml

    entries = []
    for root in ("skills", "optional-skills"):
        for path in sorted((source / root).rglob("SKILL.md")):
            if path.is_symlink():
                raise ValueError("Catalog symlinks require explicit review")
            text = path.read_text()
            meta = (
                yaml.safe_load(text.split("---", 2)[1])
                if text.startswith("---")
                else {}
            )
            meta = meta if isinstance(meta, dict) else {}
            name = path.parent.name
            relative = str(path.parent.relative_to(source))
            excluded = any(
                part in relative
                for part in (
                    "/apple/",
                    "/messaging/",
                    "/hermes-desktop",
                    "/inspecting-hermes-desktop",
                    "/nous-",
                    "/hermes-agent-",
                    "/discord",
                    "/telegram",
                    "/slack",
                    "/wechat",
                    "/imessage",
                )
            )
            classification = (
                "excluded"
                if excluded
                else "supported"
                if name in SUPPORTED
                else "setup_required"
            )
            assets = {}
            for asset in sorted(path.parent.rglob("*")):
                if asset.is_symlink():
                    raise ValueError(
                        "Skill asset symlink requires review: " + str(asset)
                    )
                if asset.is_file() and "__pycache__" not in asset.parts:
                    assets[str(asset.relative_to(path.parent))] = hashlib.sha256(
                        asset.read_bytes()
                    ).hexdigest()
            hermes = meta.get("metadata", {}).get("hermes", {})
            # Preserve each author's own setup instructions, including commands
            # and account requirements, instead of a universal readiness claim.
            sections = re.findall(
                r"(?im)^#{1,3} ([^\n]*(?:prerequisite|requirement|setup|installation|authentication)[^\n]*)\n(.*?)(?=^#{1,3} |\Z)",
                text,
                flags=re.DOTALL,
            )
            requirements = DOCUMENTS.get(
                name, ["scoped_linux"] if name in SUPPORTED else []
            )
            if name == "systematic-debugging":
                requirements = ["scoped_linux", "git", "rg"]
            if name == "codebase-inspection":
                requirements = ["scoped_linux", "pygount"]
            entries.append(
                {
                    "id": root + ":" + str(path.parent.relative_to(source / root)),
                    "name": name,
                    "description": str(meta.get("description", "")),
                    "version": str(meta.get("version", "unversioned")),
                    "source": relative,
                    "classification": classification,
                    "reason": "Excluded client/channel or upstream-specific workflow"
                    if excluded
                    else "Native workflow selected for the scoped Linux environment"
                    if classification == "supported"
                    else "Workflow-specific binaries, services and credentials require setup and verification",
                    "requirements": requirements,
                    "declared_requirements": {
                        "prerequisites": meta.get("prerequisites", {}),
                        "requires": meta.get("requires", hermes.get("requires", {})),
                    },
                    "setup_instructions": [
                        heading + "\n" + body.strip() for heading, body in sections
                    ],
                    "credential_names": sorted(
                        set(
                            re.findall(
                                r"\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\b",
                                text,
                            )
                        )
                    ),
                    "verification": "selected_for_runtime_verification"
                    if classification == "supported"
                    else "not_verified",
                    "platforms": meta.get("platforms", []),
                    "assets": assets,
                    "license": str(
                        meta.get(
                            "license", "See pinned upstream LICENSE and skill notices"
                        )
                    ),
                }
            )
    return {"revision": "7489b22af47ce91b366dde81d5831ea422577498", "entries": entries}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.write_text(json.dumps(inventory(args.source), indent=2) + "\n")
