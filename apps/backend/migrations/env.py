from alembic import context
from sqlmodel import SQLModel

from ngertiin.db import get_engine
from ngertiin.models import Account, DiagnosticRun, StoredObject  # noqa: F401

with get_engine().connect() as connection:
    context.configure(connection=connection, target_metadata=SQLModel.metadata)
    with context.begin_transaction():
        context.run_migrations()
