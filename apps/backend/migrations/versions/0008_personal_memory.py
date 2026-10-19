"""Evidence-backed personal memory and recoverable Mem0 projections; no data reset."""

from alembic import op

revision = "0008_personal_memory"
down_revision = "0007_persona_revisions"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE memory_settings (
      owner_id uuid PRIMARY KEY REFERENCES accounts(id),
      capture_enabled boolean NOT NULL DEFAULT true,
      generation integer NOT NULL DEFAULT 1,
      revision integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE memory_entries (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      memory_key text NOT NULL, revision integer NOT NULL DEFAULT 1,
      kind text NOT NULL CHECK(kind IN ('fact','preference','observation')),
      statement text, confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
      status text NOT NULL CHECK(status IN (
        'active','candidate','corrected','historical','forgotten')),
      valid_from timestamptz, valid_to timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,memory_key)
    );
    CREATE INDEX memory_owner_active ON memory_entries(owner_id,status,updated_at DESC);
    CREATE INDEX memory_lexical ON memory_entries
      USING gin(to_tsvector('simple',COALESCE(statement,'')));
    CREATE TABLE memory_revisions (
      id uuid PRIMARY KEY, entry_id uuid NOT NULL REFERENCES memory_entries(id),
      owner_id uuid NOT NULL REFERENCES accounts(id), revision integer NOT NULL,
      kind text NOT NULL, statement text, confidence double precision NOT NULL,
      status text NOT NULL CHECK(status IN (
        'active','candidate','corrected','historical','forgotten')),
      valid_from timestamptz, valid_to timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entry_id,revision)
    );
    CREATE TABLE memory_capture_jobs (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      source_kind text NOT NULL CHECK(source_kind IN ('message','file','result')),
      source_id uuid NOT NULL, source_revision text NOT NULL, source_hash text NOT NULL,
      generation integer NOT NULL, pipeline_version text NOT NULL,
      status text NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','extracting','admitting','complete','skipped','failed')),
      candidates jsonb, admitted jsonb,
      lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
      error text, job_id bigint, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,source_kind,source_id,source_revision,pipeline_version)
    );
    CREATE TABLE memory_evidence (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      revision_id uuid NOT NULL REFERENCES memory_revisions(id),
      source_kind text NOT NULL CHECK(source_kind IN ('message','file','result','editor')),
      source_id uuid NOT NULL, source_revision text NOT NULL, source_hash text NOT NULL,
      anchor text, capture_job_id uuid REFERENCES memory_capture_jobs(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(revision_id,source_kind,source_id,source_revision)
    );
    CREATE INDEX memory_source ON memory_evidence(owner_id,source_kind,source_id);
    CREATE TABLE memory_suppressions (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      entry_id uuid REFERENCES memory_entries(id), memory_key text NOT NULL,
      fingerprint text NOT NULL, active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX memory_suppressed ON memory_suppressions(owner_id,memory_key) WHERE active;
    CREATE TABLE memory_excluded_sources (
      owner_id uuid NOT NULL REFERENCES accounts(id), source_kind text NOT NULL,
      source_id uuid NOT NULL, source_revision text NOT NULL,
      reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_id,source_kind,source_id,source_revision)
    );
    CREATE TABLE memory_index_operations (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      revision_id uuid NOT NULL REFERENCES memory_revisions(id),
      operation text NOT NULL CHECK(operation IN ('upsert','delete')),
      status text NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','running','complete','failed')),
      lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
      error text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(revision_id,operation)
    );
    CREATE TABLE memory_commands (
      owner_id uuid NOT NULL REFERENCES accounts(id), request_key uuid NOT NULL,
      fingerprint text NOT NULL, response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,request_key)
    );
    CREATE TABLE memory_cost_events (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id),
      job_id uuid, operation text NOT NULL, model text NOT NULL,
      reserved_units integer NOT NULL, charged_units integer NOT NULL,
      state text NOT NULL CHECK(state IN ('reserved','confirmed','unknown')),
      usage jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
    );
    CREATE INDEX memory_daily_cost ON memory_cost_events(created_at,owner_id);
    ALTER TABLE chat_runs ADD COLUMN memory_generation integer;
    ALTER TABLE chat_runs ADD COLUMN memory_refs jsonb NOT NULL DEFAULT '[]';
    ALTER TABLE background_tasks ADD COLUMN memory_generation integer;
    ALTER TABLE background_tasks ADD COLUMN memory_refs jsonb NOT NULL DEFAULT '[]';
    """)


def downgrade():
    op.execute("ALTER TABLE chat_runs DROP COLUMN memory_generation, DROP COLUMN memory_refs")
    op.execute(
        "ALTER TABLE background_tasks DROP COLUMN memory_generation, DROP COLUMN memory_refs"
    )
    for table in (
        "memory_cost_events",
        "memory_commands",
        "memory_index_operations",
        "memory_excluded_sources",
        "memory_suppressions",
        "memory_evidence",
        "memory_capture_jobs",
        "memory_revisions",
        "memory_entries",
        "memory_settings",
    ):
        op.drop_table(table)
