/** Provider ownership is additive; previous migration checksums remain unchanged. */
export const providerSchemaVersion = 4;
export function providerSchemaSql(schema: string) {
  const tenant =
    "organization_id=nullif(current_setting('ngertiin.organization_id',true),'')::uuid";
  const allowed = "id::text=ANY(string_to_array(current_setting('ngertiin.connections',true),','))";
  const managed = "current_setting('ngertiin.manage',true)='yes'";
  return `
ALTER TABLE entities DROP CONSTRAINT entity_shared_kind;
ALTER TABLE entities ADD CONSTRAINT entity_shared_kind CHECK(actor_id IS NOT NULL OR organization_id IS NULL OR kind IN ('agent','published_knowledge','connection','ai_selection'));
ALTER TABLE entities ADD CONSTRAINT provider_ownership CHECK(organization_id IS NULL OR kind<>'connection' OR ((body->>'ownership'='organization')=(actor_id IS NULL)));
ALTER TABLE entities ADD CONSTRAINT selection_ownership CHECK(organization_id IS NULL OR kind<>'ai_selection' OR ((body->>'scope'='organization')=(actor_id IS NULL)));
CREATE FUNCTION enforce_provider_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path="${schema}",pg_catalog AS $$
DECLARE target_org uuid; target_actor uuid; selected_id text;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.kind='run' AND TG_OP='UPDATE' AND COALESCE(NEW.body->'provider_selection','null'::jsonb) IS DISTINCT FROM COALESCE(OLD.body->'provider_selection','null'::jsonb) THEN
    RAISE EXCEPTION 'Admitted provider selection is immutable' USING ERRCODE='23514';
  END IF;
  selected_id=CASE WHEN NEW.kind='ai_selection' THEN NEW.body->'selection'->>'connection_id' ELSE NEW.body->'provider_selection'->>'connection_id' END;
  IF selected_id IS NOT NULL THEN
    SELECT organization_id,actor_id INTO target_org,target_actor FROM entities WHERE kind='connection' AND id=selected_id::uuid;
    IF NOT FOUND OR target_org IS DISTINCT FROM NEW.organization_id OR (target_actor IS NOT NULL AND target_actor IS DISTINCT FROM NEW.actor_id) THEN
      RAISE EXCEPTION 'Invalid provider snapshot scope' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER provider_snapshot_guard AFTER INSERT OR UPDATE ON entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_snapshot();
CREATE UNIQUE INDEX ai_selection_identity ON entities(organization_id,COALESCE(actor_id::text,''),(body->>'scope'),(body->>'harness'),COALESCE(body->>'thread_id',''),COALESCE(body->>'agent_id','')) WHERE kind='ai_selection';
CREATE POLICY provider_read ON entities FOR SELECT TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND ((kind='connection' AND (${allowed} OR ${managed})) OR kind='ai_selection'));
CREATE POLICY provider_insert ON entities FOR INSERT TO ngertiin_runtime WITH CHECK(${tenant} AND actor_id IS NULL AND kind IN ('connection','ai_selection') AND ${managed} AND current_setting('ngertiin.publish',true)='yes');
CREATE POLICY provider_update ON entities FOR UPDATE TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND kind IN ('connection','ai_selection') AND ${managed}) WITH CHECK(${tenant} AND actor_id IS NULL AND kind IN ('connection','ai_selection') AND ${managed} AND current_setting('ngertiin.publish',true)='yes');
CREATE POLICY provider_event_read ON events FOR SELECT TO ngertiin_runtime USING(${tenant} AND actor_id IS NULL AND ((body->>'entity_kind'='connection' AND ((body->>'entity_id')=ANY(string_to_array(current_setting('ngertiin.connections',true),',')) OR ${managed})) OR body->>'entity_kind'='ai_selection'));
`;
}
