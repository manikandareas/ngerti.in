"""The shared S3 subset used by MinIO locally and R2 in production."""

from functools import lru_cache
from typing import TYPE_CHECKING
from urllib.parse import quote

import boto3
from botocore.config import Config

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

from ngertiin.config import get_settings


@lru_cache
def s3_client() -> "S3Client":
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id.get_secret_value(),
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": settings.s3_addressing_style},
            connect_timeout=3,
            read_timeout=10,
            retries={"max_attempts": 2, "mode": "standard"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def put_object(key: str, data: bytes, content_type: str) -> None:
    s3_client().put_object(
        Bucket=get_settings().s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def get_object(key: str) -> bytes:
    response = s3_client().get_object(Bucket=get_settings().s3_bucket, Key=key)
    with response["Body"] as body:
        return body.read()


def delete_object(key: str) -> None:
    s3_client().delete_object(Bucket=get_settings().s3_bucket, Key=key)


def download_url(key: str, filename: str) -> str:
    disposition = f"attachment; filename*=UTF-8''{quote(filename, safe='')}"
    return s3_client().generate_presigned_url(
        "get_object",
        ExpiresIn=300,
        Params={
            "Bucket": get_settings().s3_bucket,
            "Key": key,
            "ResponseContentDisposition": disposition,
        },
    )


__all__ = ["delete_object", "download_url", "get_object", "put_object", "s3_client"]
