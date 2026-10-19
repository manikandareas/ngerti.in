"""Explicit workflow compatibility across rolling upgrades and recovery."""

from alembic import op

revision = "0016_recovery_versions"
down_revision = "0015_subscription_lifecycle"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE background_tasks ADD COLUMN workflow_version integer NOT NULL DEFAULT 1;
    ALTER TABLE user_schedules ADD COLUMN workflow_version integer NOT NULL DEFAULT 1;
    ALTER TABLE user_schedules ADD COLUMN error text;
    CREATE TABLE recovery_restores (
      id uuid PRIMARY KEY, backup_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      released_at timestamptz, report jsonb NOT NULL DEFAULT '{}'
    );
    """)


def downgrade():
    op.execute("""
    ALTER TABLE user_schedules DROP COLUMN error;
    ALTER TABLE user_schedules DROP COLUMN workflow_version;
    ALTER TABLE background_tasks DROP COLUMN workflow_version;
    DROP TABLE recovery_restores;
    """)
