/** Versioned application schema. Identity binding and RLS are completed in NMA-075. */
export const schemaVersion = 1;
export const schemaSql = `
CREATE TABLE IF NOT EXISTS installation (
  id integer PRIMARY KEY CHECK (id=1), owner_id uuid NOT NULL,
  installation_id uuid NOT NULL, authority_epoch bigint NOT NULL DEFAULT 0,
  event_clock bigint NOT NULL DEFAULT 0, schema_version integer NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  seq bigserial PRIMARY KEY, kind text NOT NULL, id uuid NOT NULL,
  owner_id uuid NOT NULL, organization_id uuid, actor_id uuid,
  body jsonb NOT NULL,
  CHECK(body->>'kind'=kind AND (body->>'id')::uuid=id AND (body->>'owner_id')::uuid=owner_id),
  UNIQUE(kind,id)
);
CREATE INDEX IF NOT EXISTS entity_owner_kind ON entities(owner_id,kind,seq);
CREATE INDEX IF NOT EXISTS entity_thread ON entities(kind,(body->>'thread_id'),seq);
CREATE INDEX IF NOT EXISTS entity_agent ON entities(kind,(body->>'agent_id'),seq);
CREATE INDEX IF NOT EXISTS entity_state ON entities(kind,(body->>'state'),seq);
CREATE INDEX IF NOT EXISTS entity_status ON entities(kind,(body->>'status'),seq);
CREATE INDEX IF NOT EXISTS entity_run ON entities(kind,(body->>'run_id'),seq);
CREATE INDEX IF NOT EXISTS entity_workspace ON entities(kind,(body->>'workspace_id'),seq);
CREATE INDEX IF NOT EXISTS entity_connection ON entities(kind,(body->>'connection_id'),seq);
CREATE INDEX IF NOT EXISTS entity_binding ON entities(kind,(body->>'binding_id'),seq);
CREATE INDEX IF NOT EXISTS entity_scope ON entities(organization_id,actor_id,kind,seq);
CREATE TABLE IF NOT EXISTS events (
  cursor bigint PRIMARY KEY CHECK(cursor>0), owner_id uuid NOT NULL,
  organization_id uuid, actor_id uuid, body jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS event_entity ON events((body->>'entity_kind'),(body->>'entity_id'),cursor DESC);
CREATE INDEX IF NOT EXISTS event_thread ON events ((body->'data'->>'thread_id'),cursor);
CREATE INDEX IF NOT EXISTS event_scope ON events(organization_id,actor_id,cursor);
CREATE TABLE IF NOT EXISTS commands (
  scope text NOT NULL, id text NOT NULL, fingerprint text NOT NULL,
  receipt jsonb NOT NULL, PRIMARY KEY(scope,id)
);
CREATE INDEX IF NOT EXISTS command_receipt_scope ON commands ((scope::jsonb->>0),(scope::jsonb->>1),(scope::jsonb->>2),id);
CREATE TABLE IF NOT EXISTS routing_traces (
  seq bigserial PRIMARY KEY, route_id uuid NOT NULL, attempt_id uuid NOT NULL UNIQUE, body jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS routing_trace_route ON routing_traces(route_id,seq DESC);
CREATE TABLE IF NOT EXISTS conversation_parts (
  sequence bigserial PRIMARY KEY, id text NOT NULL UNIQUE, thread_id uuid NOT NULL, body jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS conversation_part_thread ON conversation_parts(thread_id,sequence);
CREATE TABLE IF NOT EXISTS conversation_projection (id integer PRIMARY KEY CHECK(id=1),cursor bigint NOT NULL);
INSERT INTO conversation_projection VALUES(1,0) ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS active_lane ON entities ((body->>'thread_id'),(body->>'agent_id'))
  WHERE kind='run' AND body->>'status' IN ('dispatching','running','cancel_requested','unknown');
CREATE UNIQUE INDEX IF NOT EXISTS native_session ON entities ((body->>'harness'),(body->>'connection_id'),(body->>'native_session_id')) WHERE kind='binding';
CREATE UNIQUE INDEX IF NOT EXISTS thread_binding ON entities ((body->>'thread_id'),(body->>'agent_id')) WHERE kind='binding' AND COALESCE((body->>'active')::boolean,true);
CREATE UNIQUE INDEX IF NOT EXISTS agent_handle ON entities ((body->>'handle')) WHERE kind='agent';
CREATE UNIQUE INDEX IF NOT EXISTS system_agent ON entities ((body->>'system_role')) WHERE kind='agent';
CREATE UNIQUE INDEX IF NOT EXISTS primary_dm ON entities ((body->'member_agent_ids'->>0)) WHERE kind='thread' AND body->>'type'='dm';
CREATE UNIQUE INDEX IF NOT EXISTS routine_occurrence ON entities ((body->>'routine_id'),(body->>'routine_generation'),(body->>'scheduled_for')) WHERE kind='occurrence';
CREATE UNIQUE INDEX IF NOT EXISTS run_answer ON entities ((body->>'run_id')) WHERE kind='message' AND body->>'author'='agent' AND body->>'run_id' IS NOT NULL AND COALESCE(body->>'purpose','conversation')='conversation';
CREATE UNIQUE INDEX IF NOT EXISTS lane_workspace ON entities ((body->>'thread_id'),(body->>'agent_id')) WHERE kind='workspace' AND body->>'state'='active';
CREATE UNIQUE INDEX IF NOT EXISTS artifact_publication ON entities ((body->>'run_id'),(body->>'source_path'),(body->>'sha256')) WHERE kind='artifact' AND body->>'origin'='native_output';
CREATE UNIQUE INDEX IF NOT EXISTS skill_name ON entities ((body->>'visibility'),(CASE WHEN body->>'visibility'='shared' THEN body->>'agent_id' ELSE body->>'thread_id' END),(body->>'name')) WHERE kind='skill';
CREATE UNIQUE INDEX IF NOT EXISTS skill_version ON entities ((body->>'skill_id'),(body->>'version')) WHERE kind='skill_revision';
CREATE UNIQUE INDEX IF NOT EXISTS harness_inventory_binding ON entities ((body->>'binding_id')) WHERE kind='harness_inventory';
`;
