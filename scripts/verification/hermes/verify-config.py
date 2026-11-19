import json
from pathlib import Path


root = Path(__file__).resolve().parent
config = json.loads((root / "config.json").read_text())
expected = json.loads((root / "expected.json").read_text())

issue = None
if config["label"] != expected["label"]:
    issue = "Update the release label in config.json."
elif config["schema_version"] != 2:
    issue = "The release label requires schema_version 2 in config.json."
elif expected["operator_confirmation"] and not (root / "operator-confirmation.txt").is_file():
    issue = "Missing operator confirmation: operator-confirmation.txt."

with (root / "checks.jsonl").open("a") as log:
    log.write(json.dumps({"config": config, "passed": issue is None, "issue": issue}) + "\n")
print(issue or "PASS: The release configuration is verified.")
raise SystemExit(1 if issue else 0)
