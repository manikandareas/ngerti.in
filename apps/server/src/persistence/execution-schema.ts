/** Additive execution-domain constraints; retained migrations remain byte-stable. */
export const executionSchemaVersion = 3;
export function executionSchemaSql(schema: string) {
  return `
CREATE UNIQUE INDEX execution_domain_principal ON entities(organization_id,actor_id) WHERE kind='execution_domain';
ALTER TABLE entities ADD CONSTRAINT execution_domain_private CHECK(kind<>'execution_domain' OR (organization_id IS NOT NULL AND actor_id IS NOT NULL));
CREATE FUNCTION enforce_machine_domain() RETURNS trigger LANGUAGE plpgsql SET search_path="${schema}",pg_catalog AS $$
DECLARE target_org uuid; target_actor uuid;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.body->>'machine_id' IS NULL THEN RETURN NEW; END IF;
  SELECT organization_id,actor_id INTO target_org,target_actor FROM entities WHERE kind='machine' AND id=(NEW.body->>'machine_id')::uuid;
  IF NOT FOUND OR target_org IS DISTINCT FROM NEW.organization_id OR target_actor IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'Invalid execution domain reference' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER machine_domain_guard AFTER INSERT OR UPDATE ON entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_machine_domain();
`;
}
