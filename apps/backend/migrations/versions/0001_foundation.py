"""Accounts, owned diagnostic resources, and managed runtime schema versions."""

import sqlalchemy as sa
from alembic import op

revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("clerk_user_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("clerk_user_id"),
    )
    op.create_index("ix_accounts_clerk_user_id", "accounts", ["clerk_user_id"], unique=True)
    op.create_table(
        "diagnostic_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("request_key", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.BigInteger()),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("delay_seconds", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.Uuid()),
        sa.Column("error", sa.String(1000)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "request_key"),
    )
    op.create_index("ix_diagnostic_runs_owner_id", "diagnostic_runs", ["owner_id"])
    op.create_table(
        "stored_objects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("object_key", sa.String(1024), nullable=False, unique=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stored_objects_owner_id", "stored_objects", ["owner_id"])
    op.create_table(
        "runtime_schema_versions",
        sa.Column("component", sa.String(100), primary_key=True),
        sa.Column("version", sa.String(100), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("runtime_schema_versions")
    op.drop_table("stored_objects")
    op.drop_table("diagnostic_runs")
    op.drop_table("accounts")
