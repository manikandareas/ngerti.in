"""Configuration cutover cannot reactivate the retired custom browser."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from ngertiin.agent_engine.partitions import local_configuration


class NativeConfiguration(unittest.TestCase):
    def test_e2b_credentials_never_activate_custom_dispatch(self):
        with tempfile.TemporaryDirectory(prefix="nc-", dir="/tmp") as directory:
            root = Path(directory)
            source = root / "source/gateway"
            source.mkdir(parents=True)
            (source / "run.py").touch()
            env = {
                "HERMES_SOURCE": str(source.parent),
                "NMA_RUNTIME_PYTHON": sys.executable,
                "E2B_API_KEY": "disposable-test-value",
                "NMA_COMPUTER_COMMAND": "retired-dispatcher",
            }
            for installed in (False, True):
                home = root / str(installed)
                home.mkdir()
                selected = env | (
                    {"NMA_NATIVE_TOOLS_IMAGE": "sha256:" + "a" * 64} if installed else {}
                )
                _, child = local_configuration(str(uuid4()), home, selected)
                catalog = json.loads((home / "capabilities.json").read_text())
                self.assertNotIn("NMA_COMPUTER_COMMAND", child)
                self.assertEqual(catalog["tool_grants"]["browser"]["enabled"], installed)
                self.assertNotIn("nma_computer", json.dumps(catalog))
                self.assertEqual(
                    "browser" in json.loads(child["NMA_DEFAULT_GRANTS"])["tool_grants"], installed
                )
                if installed:
                    self.assertEqual(catalog["tool_grants"]["browser"]["requires"], ["terminal"])
                    self.assertIn(
                        "terminal", json.loads(child["NMA_DEFAULT_GRANTS"])["tool_grants"]
                    )
                    self.assertEqual(
                        catalog["tool_grants"]["terminal"]["execution_surface"],
                        catalog["tool_grants"]["browser"]["execution_surface"],
                    )


if __name__ == "__main__":
    unittest.main()
