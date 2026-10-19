"""A restored database must stay paired with its restored object bucket."""

from alembic import op

revision = "0017_restore_storage_binding"
down_revision = "0016_recovery_versions"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE recovery_restores ADD COLUMN object_bucket text NOT NULL DEFAULT ''")


def downgrade():
    op.execute("ALTER TABLE recovery_restores DROP COLUMN object_bucket")
