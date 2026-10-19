"""Versioned compute allowance, provider attempts and append-only settlement audit."""

from alembic import op

revision = "0013_compute_usage"
down_revision = "0012_resource_library"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE compute_periods (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      plan text NOT NULL CHECK(plan IN ('free','plus')), policy jsonb NOT NULL,
      UNIQUE(owner_id,starts_at,plan)
    );
    CREATE TABLE compute_work (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      period_id uuid NOT NULL REFERENCES compute_periods(id), resource_key text NOT NULL,
      kind text NOT NULL, title text NOT NULL, task_id uuid REFERENCES background_tasks(id),
      thread_id uuid REFERENCES chat_threads(id), cap bigint NOT NULL CHECK(cap>=0),
      state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','settled','refunded')),
      policy jsonb NOT NULL, budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,resource_key)
    );
    CREATE INDEX compute_work_period ON compute_work(period_id);
    CREATE TABLE compute_events (
      id uuid PRIMARY KEY, work_id uuid NOT NULL REFERENCES compute_work(id),
      identity text NOT NULL UNIQUE, category text NOT NULL, provider text NOT NULL,
      model text, price jsonb NOT NULL, reserved bigint NOT NULL CHECK(reserved>=0),
      amount bigint NOT NULL CHECK(amount>=0),
      state text NOT NULL CHECK(state IN ('reserved','confirmed','estimated','unknown')),
      customer_refunded boolean NOT NULL DEFAULT false,
      quantity jsonb NOT NULL DEFAULT '{}', invoice_confirmed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX compute_events_work ON compute_events(work_id);
    CREATE TABLE compute_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      work_id uuid NOT NULL REFERENCES compute_work(id),
      event_id uuid REFERENCES compute_events(id),
      action text NOT NULL, amount bigint NOT NULL, state text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE VIEW compute_balances AS
      SELECT w.*,COALESCE(e.cost,0)::bigint AS vendor_cost,
      COALESCE(e.pending,0)::bigint AS pending_cost,
      CASE WHEN w.state='refunded' THEN 0 ELSE LEAST(w.cap,COALESCE(e.known,0)) END::bigint AS used,
      CASE WHEN w.state='refunded' THEN 0 WHEN w.state='active'
        THEN GREATEST(0,w.cap-LEAST(w.cap,COALESCE(e.known,0)))
        ELSE LEAST(GREATEST(0,w.cap-COALESCE(e.known,0)),COALESCE(e.pending,0)) END::bigint
        AS reserved
      FROM compute_work w LEFT JOIN LATERAL (
        SELECT sum(amount) AS cost,
          sum(amount) FILTER(WHERE state IN ('reserved','unknown')
            AND NOT customer_refunded) AS pending,
          sum(amount) FILTER(WHERE state IN ('estimated','confirmed')
            AND NOT customer_refunded) AS known
        FROM compute_events WHERE work_id=w.id
      ) e ON true;
    """)


def downgrade():
    op.execute("DROP VIEW compute_balances")
    for table in ("compute_audit", "compute_events", "compute_work", "compute_periods"):
        op.drop_table(table)
