// Additive migration: never rewrite the retained NMA-072 schema/checksum.
export const scopedSchemaVersion = 2;
export function scopedSchemaSql(schema: string) {
  const tenant =
    "organization_id=nullif(current_setting('ngertiin.organization_id',true),'')::uuid";
  const actor = "actor_id=nullif(current_setting('ngertiin.actor_id',true),'')::uuid";
  const legacy = "organization_id IS NULL AND current_setting('ngertiin.mode',true)='legacy'";
  const shared =
    "actor_id IS NULL AND ((kind='agent' AND id::text=ANY(string_to_array(current_setting('ngertiin.agents',true),','))) OR (kind='published_knowledge' AND body->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.agents',true),','))))";
  return `
SELECT pg_advisory_xact_lock(1313294389,75);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ngertiin_runtime') THEN
    CREATE ROLE ngertiin_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ngertiin_runtime' AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION 'The application role must be a restricted non-login role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA "${schema}" TO ngertiin_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ngertiin_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO ngertiin_runtime;
ALTER TABLE commands ADD COLUMN membership_generation integer;
ALTER TABLE entities ADD CONSTRAINT entity_payload_scope CHECK((body->>'organization_id')::uuid IS NOT DISTINCT FROM organization_id AND (body->>'actor_id')::uuid IS NOT DISTINCT FROM actor_id);
ALTER TABLE events ADD CONSTRAINT event_payload_scope CHECK((body->'data'->>'organization_id')::uuid IS NOT DISTINCT FROM organization_id AND (body->'data'->>'actor_id')::uuid IS NOT DISTINCT FROM actor_id);
ALTER TABLE entities ADD CONSTRAINT entity_scope_pair CHECK((organization_id IS NULL)=(actor_id IS NULL) OR organization_id IS NOT NULL);
ALTER TABLE entities ADD CONSTRAINT entity_shared_kind CHECK(actor_id IS NOT NULL OR organization_id IS NULL OR kind IN ('agent','published_knowledge'));
ALTER TABLE entities ADD CONSTRAINT entity_scoped_identity UNIQUE(organization_id,kind,id);
ALTER TABLE entities ADD CONSTRAINT entity_private_identity UNIQUE(organization_id,actor_id,kind,id);
CREATE UNIQUE INDEX scoped_primary_dm ON entities(organization_id,actor_id,(body->'member_agent_ids'->>0)) WHERE kind='thread' AND body->>'type'='dm' AND organization_id IS NOT NULL;
DROP INDEX primary_dm;
CREATE UNIQUE INDEX primary_dm ON entities((body->'member_agent_ids'->>0)) WHERE kind='thread' AND body->>'type'='dm' AND organization_id IS NULL;
DROP INDEX system_agent;
CREATE UNIQUE INDEX system_agent ON entities(COALESCE(organization_id::text,''),COALESCE(actor_id::text,''),(body->>'system_role')) WHERE kind='agent' AND body->>'system_role' IS NOT NULL;
DROP INDEX agent_handle;
CREATE UNIQUE INDEX agent_handle ON entities(COALESCE(organization_id::text,''),COALESCE(actor_id::text,''),(body->>'handle')) WHERE kind='agent';
CREATE UNIQUE INDEX agent_preference_identity ON entities(organization_id,actor_id,(body->>'agent_id')) WHERE kind='agent_preference';
ALTER TABLE conversation_parts ADD COLUMN organization_id uuid;
ALTER TABLE conversation_parts ADD COLUMN actor_id uuid;
ALTER TABLE routing_traces ADD COLUMN organization_id uuid;
ALTER TABLE routing_traces ADD COLUMN actor_id uuid;
CREATE INDEX conversation_part_scope ON conversation_parts(organization_id,actor_id,thread_id,sequence);
CREATE FUNCTION enforce_entity_scope() RETURNS trigger LANGUAGE plpgsql SET search_path="${schema}",pg_catalog AS $$
DECLARE field text; target_kind text; target_id text; target_org uuid; target_actor uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id) THEN
    RAISE EXCEPTION 'Entity ownership is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  FOR field,target_kind IN SELECT * FROM (VALUES
    ('thread_id','thread'),('agent_id','agent'),('run_id','run'),('workspace_id','workspace'),
    ('connection_id','connection'),('binding_id','binding'),('artifact_id','artifact'),
    ('routine_id','routine'),('goal_id','goal'),('input_message_id','message'),
    ('group_thread_id','thread'),('skill_id','skill'),('source_agent_id','agent'),
    ('created_by_agent_id','agent'),('coordinator_agent_id','agent'),('target_agent_id','agent'),
    ('source_run_id','run'),('source_message_id','message'),('current_run_id','run'),
    ('request_message_id','message'),('root_task_id','peer_task'),('task_id','peer_task'),
    ('source_artifact_id','artifact'),('author_agent_id','agent'),('selected_agent_id','agent'),
    ('message_id','message'),('context_message_id','message'),('router_run_id','run'),
    ('parent_task_id','peer_task'),('response_message_id','message'),('continuation_run_id','run'),
    ('report_run_id','run'),('deferred_by_run_id','run'),('retry_of_run_id','run'),
    ('retried_by_run_id','run'),('queued_run_id','run'),('assignment_route_id','group_route')) AS refs(field,kind)
  LOOP
    IF field='connection_id' AND NEW.kind IN ('app_session','app_effect') THEN target_kind='app_connection'; END IF;
    target_id=NEW.body->>field;
    IF target_id IS NULL OR (target_kind=NEW.kind AND target_id=NEW.id::text) THEN CONTINUE; END IF;
    SELECT organization_id,actor_id INTO target_org,target_actor FROM entities WHERE kind=target_kind AND id=target_id::uuid;
    IF NOT FOUND OR target_org IS DISTINCT FROM NEW.organization_id OR (target_actor IS NOT NULL AND target_actor IS DISTINCT FROM NEW.actor_id) THEN
      RAISE EXCEPTION 'Invalid scoped reference' USING ERRCODE='23503';
    END IF;
  END LOOP;
  FOR field,target_kind IN SELECT * FROM (VALUES
    ('member_agent_ids','agent'),('artifact_ids','artifact'),('evidence_artifact_ids','artifact'),
    ('goal_ids','goal'),('source_run_ids','run'),('source_message_ids','message')
  ) AS arrays(field,kind) LOOP
    FOR target_id IN SELECT jsonb_array_elements_text(NEW.body->field) LOOP
      SELECT organization_id,actor_id INTO target_org,target_actor FROM entities WHERE kind=target_kind AND id=target_id::uuid;
      IF NOT FOUND OR target_org IS DISTINCT FROM NEW.organization_id OR (target_actor IS NOT NULL AND target_actor IS DISTINCT FROM NEW.actor_id) THEN
        RAISE EXCEPTION 'Invalid scoped array reference' USING ERRCODE='23503';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER entity_scope_guard AFTER INSERT OR UPDATE ON entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_entity_scope();
CREATE FUNCTION derive_private_scope() RETURNS trigger LANGUAGE plpgsql SET search_path="${schema}",pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='conversation_parts' THEN
    SELECT organization_id,actor_id INTO NEW.organization_id,NEW.actor_id FROM entities WHERE kind='thread' AND id=NEW.thread_id;
  ELSE
    SELECT organization_id,actor_id INTO NEW.organization_id,NEW.actor_id FROM entities WHERE kind='group_route' AND id=NEW.route_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER part_scope BEFORE INSERT OR UPDATE ON conversation_parts FOR EACH ROW EXECUTE FUNCTION derive_private_scope();
CREATE TRIGGER trace_scope BEFORE INSERT OR UPDATE ON routing_traces FOR EACH ROW EXECUTE FUNCTION derive_private_scope();
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_read ON entities FOR SELECT TO ngertiin_runtime USING((${legacy}) OR (${tenant} AND (${actor} OR ${shared})));
CREATE POLICY entity_insert ON entities FOR INSERT TO ngertiin_runtime WITH CHECK((${legacy}) OR (${tenant} AND (${actor} OR (actor_id IS NULL AND current_setting('ngertiin.publish',true)='yes' AND kind IN ('agent','published_knowledge')))));
CREATE POLICY entity_update ON entities FOR UPDATE TO ngertiin_runtime USING((${legacy}) OR (${tenant} AND (${actor} OR (actor_id IS NULL AND (id::text=ANY(string_to_array(current_setting('ngertiin.managed',true),',')) OR (kind='published_knowledge' AND body->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.managed',true),',')))))))) WITH CHECK((${legacy}) OR (${tenant} AND (${actor} OR (actor_id IS NULL AND current_setting('ngertiin.publish',true)='yes'))));
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_read ON events FOR SELECT TO ngertiin_runtime USING((${legacy}) OR (${tenant} AND (${actor} OR (actor_id IS NULL AND ((body->>'entity_kind'='agent' AND body->>'entity_id'=ANY(string_to_array(current_setting('ngertiin.agents',true),','))) OR (body->>'entity_kind'='published_knowledge' AND body->'data'->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.agents',true),','))))))));
CREATE POLICY event_write ON events FOR INSERT TO ngertiin_runtime WITH CHECK((${legacy}) OR (${tenant} AND (${actor} OR (actor_id IS NULL AND current_setting('ngertiin.publish',true)='yes'))));
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY command_scope ON commands TO ngertiin_runtime USING((scope::jsonb->>1 IS NULL AND current_setting('ngertiin.mode',true)='legacy') OR (scope::jsonb->>1=current_setting('ngertiin.organization_id',true) AND scope::jsonb->>2=current_setting('ngertiin.actor_id',true) AND membership_generation=nullif(current_setting('ngertiin.membership_generation',true),'')::int));
ALTER TABLE conversation_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY part_scope ON conversation_parts TO ngertiin_runtime USING((${legacy}) OR (${tenant} AND ${actor}));
ALTER TABLE routing_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY trace_scope ON routing_traces TO ngertiin_runtime USING((${legacy}) OR (${tenant} AND ${actor}));
CREATE TABLE private_provisioning(organization_id uuid NOT NULL,actor_id uuid NOT NULL,agent_id uuid NOT NULL,thread_id uuid NOT NULL,welcome_message_id uuid NOT NULL,PRIMARY KEY(organization_id,actor_id));
GRANT SELECT,INSERT ON private_provisioning TO ngertiin_runtime;
ALTER TABLE private_provisioning ADD COLUMN agent_kind text NOT NULL DEFAULT 'agent' CHECK(agent_kind='agent');
ALTER TABLE private_provisioning ADD COLUMN thread_kind text NOT NULL DEFAULT 'thread' CHECK(thread_kind='thread');
ALTER TABLE private_provisioning ADD CONSTRAINT provisioning_agent FOREIGN KEY(organization_id,actor_id,agent_kind,agent_id) REFERENCES entities(organization_id,actor_id,kind,id);
ALTER TABLE private_provisioning ADD CONSTRAINT provisioning_thread FOREIGN KEY(organization_id,actor_id,thread_kind,thread_id) REFERENCES entities(organization_id,actor_id,kind,id);
ALTER TABLE private_provisioning ADD COLUMN message_kind text NOT NULL DEFAULT 'message' CHECK(message_kind='message');
ALTER TABLE private_provisioning ADD CONSTRAINT provisioning_welcome FOREIGN KEY(organization_id,actor_id,message_kind,welcome_message_id) REFERENCES entities(organization_id,actor_id,kind,id);
ALTER TABLE private_provisioning ENABLE ROW LEVEL SECURITY;
CREATE POLICY provisioning_scope ON private_provisioning TO ngertiin_runtime USING(${tenant} AND ${actor});
CREATE TABLE team_agent_grants(organization_id uuid NOT NULL,agent_id uuid NOT NULL,audience_id uuid NOT NULL,agent_kind text NOT NULL DEFAULT 'agent' CHECK(agent_kind='agent'),PRIMARY KEY(organization_id,agent_id),FOREIGN KEY(organization_id,agent_kind,agent_id) REFERENCES entities(organization_id,kind,id));
GRANT SELECT,INSERT,UPDATE ON team_agent_grants TO ngertiin_runtime;
ALTER TABLE team_agent_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_grant_read ON team_agent_grants FOR SELECT TO ngertiin_runtime USING(${tenant});
CREATE POLICY team_grant_insert ON team_agent_grants FOR INSERT TO ngertiin_runtime WITH CHECK(${tenant} AND current_setting('ngertiin.manage',true)='yes');
CREATE POLICY team_grant_update ON team_agent_grants FOR UPDATE TO ngertiin_runtime USING(${tenant} AND current_setting('ngertiin.manage',true)='yes');
REVOKE ALL ON schema_migrations FROM ngertiin_runtime;
CREATE TABLE legacy_scope_binding(id integer PRIMARY KEY CHECK(id=1),organization_id uuid NOT NULL,user_id uuid NOT NULL,bound_at timestamptz NOT NULL DEFAULT now());
`;
}
