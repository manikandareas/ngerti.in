"""Disposable local object backup/restore; never targets a production bucket."""

import hashlib
import json
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config
from dotenv import dotenv_values


def main():
    values = dotenv_values(".env")
    client = boto3.client(
        "s3",
        endpoint_url="http://127.0.0.1:9000",
        aws_access_key_id=values["MINIO_ROOT_USER"],
        aws_secret_access_key=values["MINIO_ROOT_PASSWORD"],
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    bucket = "nma-restore-" + uuid4().hex
    key, content = "private/history.bin", bytes(range(256)) * 8
    client.create_bucket(Bucket=bucket)
    try:
        client.put_object(Bucket=bucket, Key=key, Body=content)
        backup = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        client.delete_object(Bucket=bucket, Key=key)
        client.put_object(Bucket=bucket, Key=key, Body=backup)
        restored = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        assert restored == content
        report = {
            "disposable_local_minio": True,
            "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "exact_restore": True,
        }
    finally:
        client.delete_object(Bucket=bucket, Key=key)
        client.delete_bucket(Bucket=bucket)
    report["cleanup"] = "Disposable bucket and objects deleted"
    Path("docs/research/evidence/nma-025-026/object-restore.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
