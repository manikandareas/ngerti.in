"""Auditable refund observations and revocable admission without rewriting accepted work."""

from alembic import op

revision = "0015_subscription_lifecycle"
down_revision = "0014_subscription_billing"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE quota_grants ADD COLUMN revoked_at timestamptz;
    ALTER TABLE billing_orders ADD COLUMN refund_review_required boolean NOT NULL DEFAULT false;
    ALTER TABLE billing_orders ADD COLUMN lifecycle_policy jsonb NOT NULL DEFAULT
      '{"version": "subscription-lifecycle-v1", "grace_credits": 0,
        "full_refund": "revoke_remaining", "partial_refund": "review_keep_existing",
        "accepted_work": "original_budget", "schedule": "check_each_run"}';
    ALTER TABLE billing_payments ADD COLUMN refund_state text NOT NULL DEFAULT 'none'
      CHECK(refund_state IN ('none','partial','full'));
    ALTER TABLE billing_payments ADD COLUMN refunded_amount bigint NOT NULL DEFAULT 0
      CHECK(refunded_amount>=0);
    ALTER TABLE billing_payments ADD COLUMN refund_seen_at timestamptz;
    """)


def downgrade():
    op.execute("""
    ALTER TABLE billing_payments DROP COLUMN refund_seen_at;
    ALTER TABLE billing_payments DROP COLUMN refunded_amount;
    ALTER TABLE billing_payments DROP COLUMN refund_state;
    ALTER TABLE billing_orders DROP COLUMN lifecycle_policy;
    ALTER TABLE billing_orders DROP COLUMN refund_review_required;
    ALTER TABLE quota_grants DROP COLUMN revoked_at;
    """)
