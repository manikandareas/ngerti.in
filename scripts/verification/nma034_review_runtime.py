"""Reopen the completed disposable acceptance partition for authenticated UI review."""

import json
import os
import subprocess
from pathlib import Path


def main():
    metadata = json.loads(Path(os.environ["NMA_REVIEW_METADATA"]).read_text())
    root = Path(metadata["root"])
    route = json.loads(Path(os.environ["NMA_REVIEW_ROUTE"]).read_text())
    env = os.environ | {
        "HERMES_HOME": str(root / "state"),
        "NMA_OWNER_ID": metadata["owner_id"],
        "OPENAI_API_KEY": route["api_key"],
        "OPENAI_BASE_URL": route["base_url"],
        "NMA_DEFAULT_MODEL": "test",
        "NMA_MODELS_FILE": str(root / "models.json"),
        "NMA_CAPABILITIES_FILE": str(root / "capabilities.json"),
        "NMA_SERVICE_KEY_FILE": str(root / "key"),
        "NMA_BINDINGS_FILE": str(root / "bindings.json"),
        "NMA_WEBHOOK_ROUTES_FILE": str(root / "webhooks.json"),
    }
    subprocess.run(
        [os.environ["NMA_REVIEW_PYTHON"], "-m", "ngertiin_engine.service"],
        env=env,
        check=True,
    )


if __name__ == "__main__":
    main()
