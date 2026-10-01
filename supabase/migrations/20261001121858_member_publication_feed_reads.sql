BEGIN;
-- Receipts extend the existing publication versions; they grant no access and emit no events.
CREATE TABLE publication_private.research_publication_reads (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 version_id uuid NOT NULL REFERENCES public.research_publication_versions(id),
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (user_id,version_id)
);
ALTER TABLE publication_private.research_publication_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_private.research_publication_reads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON publication_private.research_publication_reads FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER publication_reads_immutable BEFORE UPDATE OR DELETE ON publication_private.research_publication_reads
 FOR EACH ROW EXECUTE FUNCTION publication_private.immutable();
CREATE TRIGGER publication_reads_no_truncate BEFORE TRUNCATE ON publication_private.research_publication_reads
 FOR EACH STATEMENT EXECUTE FUNCTION publication_private.immutable();
CREATE INDEX research_publication_publish_order ON public.research_publication_commands(created_at DESC,version_id DESC) WHERE action='publish';
CREATE INDEX research_publication_command_state ON public.research_publication_commands(version_id,created_at DESC,id DESC);
CREATE INDEX research_publication_cohort_targets ON public.research_publication_versions USING gin ((body->'cohortIds')) WHERE body->>'audience'='cohort';

CREATE FUNCTION publication_private.require_cohort(p_cohort uuid) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_cohort IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_cohorts WHERE id=p_cohort AND status='published')
 OR (public.seasonal_module_access('resources',p_cohort)->>'allowed') IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION publication_private.read_cohort(p_version uuid,p_cohort uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM publication_private.require_cohort(p_cohort);
 IF NOT EXISTS(SELECT 1 FROM public.research_publication_versions WHERE id=p_version AND body->>'audience'='cohort'
  AND (body->'cohortIds') @> jsonb_build_array(p_cohort::text)) THEN RETURN NULL; END IF;
 -- One canonical reader checks current publication, research approval and visibility.
 RETURN public.read_research_publication(p_version);
END $$;
CREATE FUNCTION publication_private.list_cohort(p_cohort uuid,p_before_at timestamptz,p_before_id uuid,p_limit integer) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; last_item jsonb; next_cursor jsonb:=NULL;
BEGIN
 PERFORM publication_private.require_cohort(p_cohort);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR ((p_before_at IS NULL)<>(p_before_id IS NULL))
  OR (p_before_at IS NOT NULL AND NOT isfinite(p_before_at)) THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE='22023'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT v.id,c.published_at,public.read_research_publication(v.id) AS detail
  FROM public.research_publication_versions v
  CROSS JOIN LATERAL (SELECT created_at AS published_at FROM public.research_publication_commands
   WHERE version_id=v.id AND action='publish' ORDER BY created_at DESC,id DESC LIMIT 1) c
  WHERE v.body->>'audience'='cohort' AND (v.body->'cohortIds') @> jsonb_build_array(p_cohort::text)
   AND (p_before_at IS NULL OR (c.published_at,v.id)<(p_before_at,p_before_id))
 ), visible AS (
  SELECT * FROM candidates WHERE detail IS NOT NULL ORDER BY published_at DESC,id DESC LIMIT p_limit+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'version',v.detail->'version',
  'title',v.detail->'title','summary',v.detail->'summary','contentKind',v.detail->'contentKind',
  'sources',v.detail->'sources','publishedAt',v.published_at,
  'detailHref','/publications/'||v.id::text||'?cohort='||p_cohort::text,
  'readAt',r.read_at,'hasBeenRead',r.version_id IS NOT NULL) ORDER BY v.published_at DESC,v.id DESC),'[]'::jsonb)
 INTO rows FROM visible v LEFT JOIN publication_private.research_publication_reads r ON r.version_id=v.id AND r.user_id=auth.uid();
 IF jsonb_array_length(rows)>p_limit THEN
  SELECT jsonb_agg(value ORDER BY ordinality) INTO rows FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=p_limit;
  last_item:=rows->(p_limit-1);
  next_cursor:=jsonb_build_object('cohortId',p_cohort,'publishedAt',last_item->'publishedAt','versionId',last_item->'versionId');
 END IF;
 RETURN jsonb_build_object('items',rows,'nextCursor',next_cursor);
END $$;
CREATE FUNCTION publication_private.mark_read(p_version uuid,p_cohort uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE first_read timestamptz;
BEGIN
 -- Recheck even on replay: an existing receipt never bypasses withdrawn/revoked access.
 IF publication_private.read_cohort(p_version,p_cohort) IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO publication_private.research_publication_reads(user_id,version_id) VALUES(auth.uid(),p_version) ON CONFLICT DO NOTHING;
 SELECT read_at INTO first_read FROM publication_private.research_publication_reads WHERE user_id=auth.uid() AND version_id=p_version;
 RETURN jsonb_build_object('versionId',p_version,'readAt',first_read,'hasBeenRead',true);
END $$;
-- Invoker entry points expose only explicit, authenticated operations. Definers stay private.
CREATE FUNCTION public.read_cohort_research_publication(p_version uuid,p_cohort uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT publication_private.read_cohort(p_version,p_cohort) $$;
CREATE FUNCTION public.list_cohort_research_publications(p_cohort uuid,p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT publication_private.list_cohort(p_cohort,p_before_at,p_before_id,p_limit) $$;
CREATE FUNCTION public.mark_research_publication_read(p_version uuid,p_cohort uuid) RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT publication_private.mark_read(p_version,p_cohort) $$;
REVOKE ALL ON FUNCTION publication_private.require_cohort(uuid),publication_private.read_cohort(uuid,uuid),publication_private.list_cohort(uuid,timestamptz,uuid,integer),publication_private.mark_read(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION publication_private.read_cohort(uuid,uuid),publication_private.list_cohort(uuid,timestamptz,uuid,integer),publication_private.mark_read(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.read_cohort_research_publication(uuid,uuid),public.list_cohort_research_publications(uuid,timestamptz,uuid,integer),public.mark_research_publication_read(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_cohort_research_publication(uuid,uuid),public.list_cohort_research_publications(uuid,timestamptz,uuid,integer),public.mark_research_publication_read(uuid,uuid) TO authenticated;
COMMIT;
