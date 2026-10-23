"""Additive continuation and liveness; existing workflow/checkpoint versions remain valid."""

from alembic import op

revision = "0019_browser_continuation"
down_revision = "0018_browser_provider_profiles"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE background_tasks ADD COLUMN runtime_state jsonb NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE browser_workspaces ADD COLUMN heartbeat_at timestamptz")


def downgrade():
    op.execute("ALTER TABLE browser_workspaces DROP COLUMN heartbeat_at")
    op.execute("ALTER TABLE background_tasks DROP COLUMN runtime_state")
