"""Short database transactions, shared by API and worker processes."""

from functools import lru_cache

from sqlalchemy import Engine
from sqlalchemy.engine import make_url
from sqlmodel import Session, create_engine

from ngertiin.config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = make_url(get_settings().database_url.get_secret_value()).set(
        drivername="postgresql+psycopg"
    )
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": 3, "options": "-c statement_timeout=5000"},
    )


def get_session():
    with Session(get_engine()) as session:
        yield session


__all__ = ["get_engine", "get_session"]
