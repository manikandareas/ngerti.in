"""Retain legacy browser profiles while selecting a new provider for future Tasks."""

from alembic import op

revision = "0018_browser_provider_profiles"
down_revision = "0017_restore_storage_binding"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DROP INDEX browser_one_profile")
    op.execute(
        "CREATE UNIQUE INDEX browser_one_profile ON browser_workspaces(owner_id,provider) "
        "WHERE state<>'deleted'"
    )


def downgrade():
    # Deliberately fails if two retained providers would violate the old rule.
    op.execute("DROP INDEX browser_one_profile")
    op.execute(
        "CREATE UNIQUE INDEX browser_one_profile ON browser_workspaces(owner_id) "
        "WHERE state<>'deleted'"
    )
