/** NMA-078 extends shared RLS without changing historical migration checksums. */
export const integrationSchemaVersion = 5;
export function integrationSchemaSql() {
  const tenant =
    "organization_id=nullif(current_setting('ngertiin.organization_id',true),'')::uuid";
  const manage = "current_setting('ngertiin.manage',true)='yes'";
  const publish = "current_setting('ngertiin.publish',true)='yes'";
  const skill = "kind IN ('skill','skill_revision','skill_assignment')";
  const readable =
    "body->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.agents',true),','))";
  const managed =
    "body->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.managed',true),','))";
  const account = "kind='app_connection'";
  const allowed =
    "id::text=ANY(string_to_array(current_setting('ngertiin.app_connections',true),','))";
  return `
DROP INDEX skill_name;
CREATE UNIQUE INDEX skill_name ON entities(COALESCE(organization_id::text,''),COALESCE(actor_id::text,''),(body->>'visibility'),(CASE WHEN body->>'visibility'='shared' THEN body->>'agent_id' ELSE body->>'thread_id' END),(body->>'name')) WHERE kind='skill';
CREATE FUNCTION immutable_skill_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.kind='skill_revision' THEN RAISE EXCEPTION 'Skill revisions are immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_skill_revision BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION immutable_skill_revision();
ALTER TABLE entities DROP CONSTRAINT entity_shared_kind;
ALTER TABLE entities ADD CONSTRAINT entity_shared_kind CHECK(actor_id IS NOT NULL OR organization_id IS NULL OR kind IN ('agent','published_knowledge','connection','ai_selection','app_connection','skill','skill_revision','skill_assignment'));
ALTER TABLE entities ADD CONSTRAINT app_ownership CHECK(organization_id IS NULL OR kind<>'app_connection' OR ((body->>'ownership'='organization')=(actor_id IS NULL)));
ALTER TABLE entities ADD CONSTRAINT team_skill_scope CHECK(organization_id IS NULL OR actor_id IS NOT NULL OR kind NOT IN ('skill','skill_assignment') OR (body->>'thread_id' IS NULL AND body->>'visibility'='shared'));
ALTER TABLE entities ADD CONSTRAINT team_skill_source CHECK(organization_id IS NULL OR actor_id IS NOT NULL OR kind<>'skill_revision' OR body->>'source_run_id' IS NULL);
CREATE POLICY integration_read ON entities FOR SELECT TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND ((${account} AND (${manage} OR ${allowed})) OR (${skill} AND ${readable})));
CREATE POLICY integration_insert ON entities FOR INSERT TO ngertiin_runtime WITH CHECK(${tenant} AND actor_id IS NULL AND ${manage} AND ${publish} AND (${account} OR (${skill} AND ${managed})));
CREATE POLICY integration_update ON entities FOR UPDATE TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND ${manage} AND (${account} OR (${skill} AND ${managed}))) WITH CHECK(${tenant} AND actor_id IS NULL AND ${publish} AND ${manage});
CREATE POLICY integration_event_read ON events FOR SELECT TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND ((body->>'entity_kind'='app_connection' AND (${manage} OR body->>'entity_id'=ANY(string_to_array(current_setting('ngertiin.app_connections',true),',')))) OR (body->>'entity_kind' IN ('skill','skill_revision','skill_assignment') AND body->'data'->>'agent_id'=ANY(string_to_array(current_setting('ngertiin.agents',true),',')))));
CREATE TABLE app_account_holds(owner_id uuid NOT NULL,account_id text NOT NULL,effect_id uuid NOT NULL,organization_id uuid,actor_id uuid,PRIMARY KEY(owner_id,account_id));
GRANT SELECT,INSERT,DELETE ON app_account_holds TO ngertiin_runtime;
ALTER TABLE app_account_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_hold_scope ON app_account_holds TO ngertiin_runtime USING((${tenant}) OR (organization_id IS NULL AND current_setting('ngertiin.mode',true)='legacy'));
INSERT INTO app_account_holds SELECT owner_id,body->>'account_id',id,organization_id,actor_id FROM entities WHERE kind='app_effect' AND body->>'state' IN ('dispatched','unknown') ON CONFLICT DO NOTHING;
`;
}
