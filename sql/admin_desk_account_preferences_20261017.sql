-- Candidate only. Installation/recovery/production acceptance belong to root.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='desk settings owner must bypass forced RLS';
  END IF;
END $$;
CREATE TABLE public.admin_desk_preference_versions (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK(schema_version=1),
  layout smallint NOT NULL CHECK(layout IN(1,2,3)),
  hidden_tools text[] NOT NULL DEFAULT '{}'
    CHECK(hidden_tools <@ ARRAY['market','chart','opportunities','alerts','reports','research']::text[] AND cardinality(hidden_tools)<=6 AND array_position(hidden_tools,NULL) IS NULL),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX admin_desk_preferences_owner_revision ON public.admin_desk_preference_versions(actor_id,revision DESC);
ALTER TABLE public.admin_desk_preference_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_desk_preference_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_desk_preference_versions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.admin_desk_preference_versions_revision_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.admin_desk_preference_versions TO authenticated;
CREATE POLICY admin_desk_preferences_owner_read ON public.admin_desk_preference_versions FOR SELECT TO authenticated
  USING(actor_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='admin'));
CREATE FUNCTION public.admin_desk_preferences_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='desk preference versions are append only'; END;
$$;
REVOKE ALL ON FUNCTION public.admin_desk_preferences_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_desk_preferences_history_guard BEFORE UPDATE OR DELETE ON public.admin_desk_preference_versions FOR EACH ROW EXECUTE FUNCTION public.admin_desk_preferences_guard();
CREATE TRIGGER admin_desk_preferences_truncate_guard BEFORE TRUNCATE ON public.admin_desk_preference_versions FOR EACH STATEMENT EXECUTE FUNCTION public.admin_desk_preferences_guard();
CREATE FUNCTION public.get_admin_desk_preferences() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); latest public.admin_desk_preference_versions%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='desk administrator required';
  END IF;
  SELECT * INTO latest FROM public.admin_desk_preference_versions WHERE actor_id=actor ORDER BY revision DESC LIMIT 1;
  RETURN jsonb_build_object('preferences',jsonb_build_object('schemaVersion',1,'layout',coalesce(latest.layout,1),'hiddenTools',coalesce(to_jsonb(latest.hidden_tools),'[]'::jsonb)),
    'revision',coalesce(latest.revision,0),'updatedAt',latest.created_at,'allowedTools',jsonb_build_array('market','chart','opportunities','alerts','reports','research'));
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_desk_preferences() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_desk_preferences() TO authenticated;
CREATE FUNCTION public.save_admin_desk_preferences(p_schema_version integer,p_layout integer,p_hidden_tools text[],p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); current_revision bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='desk administrator required'; END IF;
  IF p_schema_version IS DISTINCT FROM 1 OR p_layout IS NULL OR p_layout NOT IN(1,2,3) OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_hidden_tools IS NULL OR cardinality(p_hidden_tools)>6 OR (cardinality(p_hidden_tools)>0 AND array_ndims(p_hidden_tools)<>1)
    OR array_position(p_hidden_tools,NULL) IS NOT NULL OR NOT(p_hidden_tools <@ ARRAY['market','chart','opportunities','alerts','reports','research']::text[])
    OR cardinality(p_hidden_tools)<>(SELECT count(DISTINCT value) FROM unnest(p_hidden_tools) AS value) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid desk preferences';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261017,pg_catalog.hashtext('admin_desk:'||actor::text));
  PERFORM 1 FROM public.profiles WHERE id=actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='desk administrator required'; END IF;
  SELECT coalesce(max(revision),0) INTO current_revision FROM public.admin_desk_preference_versions WHERE actor_id=actor;
  IF current_revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='desk preferences revision conflict'; END IF;
  INSERT INTO public.admin_desk_preference_versions(actor_id,schema_version,layout,hidden_tools) VALUES(actor,1,p_layout,p_hidden_tools);
  RETURN public.get_admin_desk_preferences();
END;
$$;
REVOKE ALL ON FUNCTION public.save_admin_desk_preferences(integer,integer,text[],bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_admin_desk_preferences(integer,integer,text[],bigint) TO authenticated;
COMMIT;
