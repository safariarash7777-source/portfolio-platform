-- One global media layout. Install once through the reviewed release procedure.
-- No seed actor or synthetic audit row: an empty history reads the default 1.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='media layout RPC owner must bypass forced RLS';
  END IF;
END $$;

CREATE TABLE public.media_layout_versions (
  version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  media_layout smallint NOT NULL CHECK (media_layout IN (1,2,3)),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.media_layout_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_layout_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.media_layout_versions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.media_layout_versions_version_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.media_layout_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='media layout history is append only';
END;
$$;
CREATE TRIGGER media_layout_history_guard BEFORE UPDATE OR DELETE ON public.media_layout_versions
  FOR EACH ROW EXECUTE FUNCTION public.media_layout_history_guard();
CREATE TRIGGER media_layout_history_truncate_guard BEFORE TRUNCATE ON public.media_layout_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.media_layout_history_guard();
REVOKE ALL ON FUNCTION public.media_layout_history_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Narrow definer projection is necessary: clients receive one scalar, while
-- direct table/sequence access (including actor IDs and audit history) is denied.
-- The migration owner must retain BYPASSRLS; FORCE RLS denies ordinary owners.
CREATE FUNCTION public.get_media_layout()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((SELECT media_layout::integer FROM public.media_layout_versions ORDER BY version DESC LIMIT 1),1);
$$;
REVOKE ALL ON FUNCTION public.get_media_layout() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_media_layout() TO anon,authenticated,service_role;

-- Definer is limited to an authenticated, current DB admin. JWT metadata/role
-- claims never establish admin authority; no client receives table INSERT.
-- Keep actor UUID without a cascading FK so deleting a profile cannot erase audit.
CREATE FUNCTION public.set_media_layout(p_media_layout integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated media administrator required';
  END IF;
  IF p_media_layout IS NULL OR p_media_layout NOT IN (1,2,3) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='media layout must be 1, 2 or 3';
  END IF;
  -- Serializes save/commit order across administrators; version order remains
  -- the committed global decision even when saves overlap.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261017,1);
  PERFORM 1 FROM public.profiles WHERE id=actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated media administrator required';
  END IF;
  INSERT INTO public.media_layout_versions(media_layout,actor_id) VALUES(p_media_layout,actor);
  RETURN p_media_layout;
END;
$$;
REVOKE ALL ON FUNCTION public.set_media_layout(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_media_layout(integer) TO authenticated;
COMMIT;
