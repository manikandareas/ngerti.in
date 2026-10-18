"""Reset only the verified local ngertiin-v1 Compose resources, then provision schemas."""

import argparse
import json
import subprocess
from urllib.parse import urlparse

from ngertiin.config import ROOT, get_settings
from ngertiin.setup import setup_database, setup_storage

PROJECT = "ngertiin-v1"
COMPOSE = [
    "docker",
    "compose",
    "--env-file",
    str(ROOT / ".env"),
    "-f",
    str(ROOT / "infra/compose.yaml"),
    "-p",
    PROJECT,
]


def capture(command):
    return subprocess.check_output(command, text=True).strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify_target():
    settings = get_settings()
    require(settings.app_env == "development", "Reset requires APP_ENV=development")
    context = json.loads(capture(["docker", "context", "inspect"]))[0]
    require(
        context["Endpoints"]["docker"]["Host"].startswith("unix://"),
        "Reset requires a local Docker socket",
    )
    config = json.loads(capture([*COMPOSE, "config", "--format", "json"]))
    require(config["name"] == PROJECT, "Unexpected Compose project")
    require(set(config["services"]) == {"postgres", "minio"}, "Unexpected services")
    require(
        set(config["volumes"]) == {"postgres-data", "minio-data"}, "Unexpected volumes"
    )
    db = urlparse(settings.database_url.get_secret_value())
    s3 = urlparse(settings.s3_endpoint_url)
    postgres = config["services"]["postgres"]
    minio = config["services"]["minio"]
    from urllib.parse import unquote

    require(
        db.scheme == "postgresql"
        and db.hostname in {"localhost", "127.0.0.1"}
        and db.port == 5433
        and db.path == "/" + postgres["environment"]["POSTGRES_DB"]
        and unquote(db.username or "") == postgres["environment"]["POSTGRES_USER"]
        and unquote(db.password or "") == postgres["environment"]["POSTGRES_PASSWORD"],
        "DATABASE_URL must target this project's local PostgreSQL",
    )
    require(
        s3.scheme == "http"
        and s3.hostname in {"localhost", "127.0.0.1"}
        and s3.port == 9000
        and s3.path in {"", "/"}
        and settings.s3_access_key_id.get_secret_value()
        == minio["environment"]["MINIO_ROOT_USER"]
        and settings.s3_secret_access_key.get_secret_value()
        == minio["environment"]["MINIO_ROOT_PASSWORD"],
        "Storage must target this project's local MinIO",
    )
    for service, target, source in (
        (postgres, 5432, "postgres-data"),
        (minio, 9000, "minio-data"),
    ):
        require(
            any(
                p["target"] == target
                and p.get("host_ip") == "127.0.0.1"
                and int(p["published"]) == (5433 if target == 5432 else 9000)
                for p in service["ports"]
            ),
            "Unexpected service port binding",
        )
        require(
            len(service["volumes"]) == 1
            and service["volumes"][0]["type"] == "volume"
            and service["volumes"][0]["source"] == source,
            "Unexpected service mount",
        )
    expected = {v["name"] for v in config["volumes"].values()}
    require(
        expected == {f"{PROJECT}_postgres-data", f"{PROJECT}_minio-data"},
        "Unexpected volume names",
    )
    for name in expected:
        require(
            not config["volumes"][name.removeprefix(PROJECT + "_")].get("external"),
            "External volumes cannot be reset",
        )
        found = capture(["docker", "volume", "ls", "--filter", f"name=^{name}$", "-q"])
        if found:
            volume = json.loads(capture(["docker", "volume", "inspect", name]))[0]
            require(
                (volume.get("Labels") or {}).get("com.docker.compose.project")
                == PROJECT,
                "Volume ownership does not match ngertiin-v1",
            )
    containers = capture(
        [
            "docker",
            "ps",
            "-aq",
            "--filter",
            f"label=com.docker.compose.project={PROJECT}",
        ]
    ).split()
    for container in containers:
        data = json.loads(capture(["docker", "inspect", container]))[0]
        require(
            data["Config"]["Labels"].get("com.docker.compose.service")
            in {"postgres", "minio"},
            "Unexpected project container",
        )
        require(
            all(
                m["Type"] == "volume" and m["Name"] in expected for m in data["Mounts"]
            ),
            "Container uses an unexpected mount",
        )
    return sorted(expected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute", action="store_true", help="Delete verified project dev data"
    )
    args = parser.parse_args()
    volumes = verify_target()
    print(
        "Verified development project:",
        PROJECT,
        "volumes:",
        ", ".join(volumes),
        flush=True,
    )
    if not args.execute:
        print("Validation only. Pass --execute to reset.")
        return
    subprocess.run([*COMPOSE, "down", "--volumes"], check=True)
    subprocess.run([*COMPOSE, "up", "-d", "--wait"], check=True)
    setup_database()
    setup_storage()
    print(
        "Development reset complete. Clerk, credentials and remote resources were retained."
    )


if __name__ == "__main__":
    main()
