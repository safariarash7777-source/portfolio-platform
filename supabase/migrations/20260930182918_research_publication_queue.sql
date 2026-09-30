-- NEXT-08. Requires phase34 + NEXT-04 seasonal migration. NOT_APPLIED to any real environment.
BEGIN;
CREATE SCHEMA IF NOT EXISTS publication_private;
REVOKE ALL ON SCHEMA publication_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.research_publication_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 workbook_version_id uuid NOT NULL REFERENCES public.research_workbook_versions(id),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=100000),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL, UNIQUE(publication_id,version), UNIQUE(created_by,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.research_publication_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES public.research_publication_versions(id),
 action text NOT NULL CHECK(action IN('ready','publish','withdraw')), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 2000),
 actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL, UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.research_publication_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL UNIQUE REFERENCES public.research_publication_commands(id),
 envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS research_publication_recent ON public.research_publication_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS research_publication_events_cursor ON public.research_publication_events(created_at,id);
CREATE OR REPLACE FUNCTION publication_private.admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin');
$$;
CREATE OR REPLACE FUNCTION publication_private.approved(p_version uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.research_workbook_versions w WHERE w.id=p_version
 AND NOT EXISTS(SELECT 1 FROM public.research_workbook_versions n WHERE n.workbook_id=w.workbook_id AND n.version>w.version)
 AND (SELECT r.decision FROM public.research_workbook_reviews r WHERE r.version_id=w.id ORDER BY r.reviewed_at DESC,(r.decision='returned') DESC,r.id DESC LIMIT 1)='approved_internal');
$$;
CREATE OR REPLACE FUNCTION publication_private.state(p_version uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT action FROM public.research_publication_commands WHERE version_id=p_version ORDER BY created_at DESC,id DESC LIMIT 1),'draft');
$$;
CREATE OR REPLACE FUNCTION publication_private.current(p_version uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.research_publication_versions v WHERE v.id=p_version
 AND NOT EXISTS(SELECT 1 FROM public.research_publication_versions n WHERE n.publication_id=v.publication_id AND n.version>v.version)
 AND publication_private.approved(v.workbook_version_id));
$$;
CREATE OR REPLACE FUNCTION publication_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
 BEGIN RAISE EXCEPTION 'publication history is append-only' USING ERRCODE='42501'; END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['research_publication_versions','research_publication_commands','research_publication_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP POLICY IF EXISTS publication_admin_read ON public.%I',t);
  EXECUTE format('CREATE POLICY publication_admin_read ON public.%I FOR SELECT TO authenticated USING (publication_private.admin())',t);
  EXECUTE format('DROP TRIGGER IF EXISTS publication_no_mutation ON public.%I',t);
  EXECUTE format('CREATE TRIGGER publication_no_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION publication_private.immutable()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS publication_no_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER publication_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION publication_private.immutable()',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA publication_private TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA publication_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION publication_private.admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_research_publication(p_publication uuid,p_base integer,p_body jsonb,p_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.research_publication_versions; result uuid; aggregate_id uuid:=coalesce(p_publication,gen_random_uuid()); h text; c text; w uuid; current_version integer; source_element jsonb; source_day date;
BEGIN
 IF NOT publication_private.admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_base IS NULL OR p_base<0 OR jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid input' USING ERRCODE='22023'; END IF;
 h:=md5(jsonb_build_object('publication',p_publication,'base',p_base,'body',p_body)::text);
 PERFORM pg_advisory_xact_lock(hashtext('publication-key'),hashtext(auth.uid()::text||p_key::text));
 SELECT * INTO old FROM public.research_publication_versions WHERE created_by=auth.uid() AND idempotency_key=p_key;
 IF old.id IS NOT NULL THEN IF old.request_hash<>h THEN RAISE EXCEPTION 'key conflict' USING ERRCODE='PT409'; END IF; RETURN old.id; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('publication'),hashtext(aggregate_id::text));
 SELECT coalesce(max(version),0) INTO current_version FROM public.research_publication_versions WHERE publication_id=aggregate_id;
 IF current_version<>p_base THEN RAISE EXCEPTION 'stale version' USING ERRCODE='PT409'; END IF;
 w:=(p_body->>'workbookVersionId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.research_workbook_versions WHERE id=w) THEN RAISE EXCEPTION 'missing version' USING ERRCODE='P0002'; END IF;
 IF coalesce(p_body->>'contentKind','') NOT IN('brief','lesson','webinar_plan') OR coalesce(p_body->>'audience','') NOT IN('public','cohort')
 OR coalesce(length(btrim(p_body->>'title')),0) NOT BETWEEN 1 AND 300
 OR coalesce(length(btrim(p_body->>'summary')),0) NOT BETWEEN 1 AND 2000
 OR coalesce(length(btrim(p_body->>'content')),0) NOT BETWEEN 1 AND 20000
 OR jsonb_typeof(p_body->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(p_body->'summary') IS DISTINCT FROM 'string' OR jsonb_typeof(p_body->'content') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_body->'cohortIds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_body->'channels') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_body->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid draft' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_body->'sources') NOT BETWEEN 1 AND 20 OR jsonb_array_length(p_body->'cohortIds')>20
 OR NOT (p_body->'channels' ? 'site') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_body->'channels') x WHERE x NOT IN('site','telegram'))
 OR (p_body->>'audience'='public' AND jsonb_array_length(p_body->'cohortIds')<>0)
 OR (p_body->>'audience'='cohort' AND jsonb_array_length(p_body->'cohortIds')=0)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'sources') s WHERE coalesce(s->>'url','') !~ '^https?://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' OR s->>'url' ~ '^https?://[^/]*@' OR coalesce(s->>'asOf','') !~ '^\d{4}-\d{2}-\d{2}$')
 THEN RAISE EXCEPTION 'invalid audience/channel/source' USING ERRCODE='22023'; END IF;
 FOR source_element IN SELECT jsonb_array_elements(p_body->'sources') LOOP
  IF jsonb_typeof(source_element->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(source_element->'asOf') IS DISTINCT FROM 'string' OR length(source_element->>'url')>2000 THEN RAISE EXCEPTION 'invalid source' USING ERRCODE='22023'; END IF;
  BEGIN source_day:=(source_element->>'asOf')::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid source date' USING ERRCODE='22023'; END;
  IF to_char(source_day,'YYYY-MM-DD')<>source_element->>'asOf' THEN RAISE EXCEPTION 'invalid source date' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR c IN SELECT jsonb_array_elements_text(p_body->'cohortIds') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.course_cohorts WHERE id=c::uuid AND status='published') THEN RAISE EXCEPTION 'unavailable cohort' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Rebuild an allowlist: private notes, actor and status supplied by a client never enter a publication.
 p_body:=jsonb_build_object('workbookVersionId',w,'contentKind',p_body->'contentKind','title',p_body->'title','summary',p_body->'summary','content',p_body->'content','sources',(SELECT jsonb_agg(jsonb_build_object('url',s->'url','asOf',s->'asOf')) FROM jsonb_array_elements(p_body->'sources') s),'audience',p_body->'audience','cohortIds',p_body->'cohortIds','channels',p_body->'channels');
 INSERT INTO public.research_publication_versions(publication_id,version,workbook_version_id,body,created_by,idempotency_key,request_hash)
 VALUES(aggregate_id,p_base+1,w,p_body,auth.uid(),p_key,h) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.command_research_publication(p_version uuid,p_action text,p_reason text,p_key uuid,p_privacy_confirmed boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.research_publication_versions; cmd public.research_publication_commands; result uuid; h text; state text; eid uuid:=gen_random_uuid(); ev text;
BEGIN
 IF NOT publication_private.admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_action NOT IN('ready','publish','withdraw') OR p_action IS NULL OR coalesce(length(btrim(p_reason)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'invalid command' USING ERRCODE='22023'; END IF;
 h:=md5(jsonb_build_object('version',p_version,'action',p_action,'reason',p_reason,'privacy',p_privacy_confirmed)::text);
 PERFORM pg_advisory_xact_lock(hashtext('publication-key'),hashtext(auth.uid()::text||p_key::text));
 SELECT * INTO cmd FROM public.research_publication_commands WHERE actor_id=auth.uid() AND idempotency_key=p_key;
 IF cmd.id IS NOT NULL THEN IF cmd.request_hash<>h THEN RAISE EXCEPTION 'key conflict' USING ERRCODE='PT409'; END IF; RETURN cmd.id; END IF;
 SELECT * INTO v FROM public.research_publication_versions WHERE id=p_version;
 IF v.id IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('publication'),hashtext(v.publication_id::text));
 state:=publication_private.state(v.id);
 IF p_action<>'withdraw' AND (p_privacy_confirmed IS DISTINCT FROM true OR NOT publication_private.current(v.id)) THEN RAISE EXCEPTION 'approval/current version required' USING ERRCODE='22023'; END IF;
 IF p_action<>'withdraw' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(v.body->'cohortIds') c WHERE NOT EXISTS(SELECT 1 FROM public.course_cohorts WHERE id=c::uuid AND status='published')) THEN RAISE EXCEPTION 'unavailable cohort' USING ERRCODE='22023'; END IF;
 IF (p_action='ready' AND state<>'draft') OR (p_action='publish' AND state<>'ready') OR (p_action='withdraw' AND state NOT IN('ready','publish')) THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.research_publication_commands(version_id,action,reason,actor_id,idempotency_key,request_hash)
 VALUES(v.id,p_action,btrim(p_reason),auth.uid(),p_key,h) RETURNING id INTO result;
 ev:=CASE p_action WHEN 'publish' THEN 'publication.published' WHEN 'ready' THEN 'publication.ready_for_distribution' ELSE 'publication.withdrawn' END;
 INSERT INTO public.research_publication_events(id,command_id,envelope) VALUES(eid,result,jsonb_build_object(
  'eventId',eid,'type',ev,'contractVersion','publication.v1','aggregateRef',v.publication_id,'aggregateVersion',v.version,
  'occurredAt',clock_timestamp(),'recordedAt',clock_timestamp(),'correlationId',p_key,'causationId',result,'payloadRef',v.id,
  'audience',v.body->'audience','cohortIds',v.body->'cohortIds','channels',v.body->'channels'));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.research_publication_status(p_version uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN publication_private.admin() THEN jsonb_build_object('state',publication_private.state(p_version),'approvalCurrent',publication_private.current(p_version)) ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.list_research_publications() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT publication_private.admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('state',publication_private.state(v.id),'approvalCurrent',publication_private.current(v.id)) ORDER BY v.created_at DESC),'[]'::jsonb)
 FROM (SELECT id,publication_id,version,body,created_at FROM public.research_publication_versions p WHERE NOT EXISTS(SELECT 1 FROM public.research_publication_versions n WHERE n.publication_id=p.publication_id AND n.version>p.version) ORDER BY p.created_at DESC LIMIT 200) v);
END $$;
CREATE OR REPLACE FUNCTION public.read_research_publication(p_version uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.research_publication_versions; c text; decision jsonb; permitted boolean:=false;
BEGIN
 SELECT * INTO v FROM public.research_publication_versions WHERE id=p_version;
 IF v.id IS NULL OR publication_private.state(v.id)<>'publish' OR NOT publication_private.current(v.id) THEN RETURN NULL; END IF;
 IF v.body->>'audience'='public' THEN permitted:=true;
 ELSIF auth.uid() IS NOT NULL THEN
  FOR c IN SELECT jsonb_array_elements_text(v.body->'cohortIds') LOOP
   decision:=public.seasonal_module_access('resources',c::uuid);
   IF decision->>'allowed'='true' AND EXISTS(SELECT 1 FROM public.course_cohorts WHERE id=c::uuid AND status='published') THEN permitted:=true; EXIT; END IF;
  END LOOP;
 END IF;
 IF NOT permitted THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v.id,'publicationId',v.publication_id,'version',v.version,'title',v.body->'title','summary',v.body->'summary','content',v.body->'content','contentKind',v.body->'contentKind','sources',v.body->'sources','audience',v.body->'audience');
END $$;
-- NEXT09 machine adapter: explicit publish only, no raw draft/history read or recipient data.
CREATE OR REPLACE FUNCTION public.list_research_publication_distribution_events(p_after timestamptz DEFAULT '1970-01-01T00:00:00Z',p_after_id uuid DEFAULT '00000000-0000-0000-0000-000000000000',p_limit integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_after IS NULL OR p_after_id IS NULL THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('envelope',envelope,'cursor',jsonb_build_object('recordedAt',created_at,'eventId',id)) ORDER BY created_at,id),'[]'::jsonb) FROM (SELECT id,created_at,envelope FROM public.research_publication_events WHERE (created_at,id)>(p_after,p_after_id) AND envelope->>'type' IN('publication.published','publication.withdrawn') ORDER BY created_at,id LIMIT p_limit) e);
END $$;
CREATE OR REPLACE FUNCTION public.resolve_research_publication_distribution(p_event uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ev public.research_publication_events; v public.research_publication_versions; eligible_cohorts jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM public.research_publication_events WHERE id=p_event;
 IF ev.id IS NULL OR ev.envelope->>'type'<>'publication.published' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.research_publication_versions WHERE id=(ev.envelope->>'payloadRef')::uuid;
 IF v.id IS NULL OR publication_private.state(v.id)<>'publish' OR NOT publication_private.current(v.id) THEN RETURN NULL; END IF;
 SELECT jsonb_agg(id) INTO eligible_cohorts FROM public.course_cohorts WHERE status='published' AND id IN(SELECT c::uuid FROM jsonb_array_elements_text(v.body->'cohortIds') c);
 IF v.body->>'audience'='cohort' AND eligible_cohorts IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('envelope',ev.envelope,'effectiveCohortIds',coalesce(eligible_cohorts,'[]'::jsonb),'sitePath','/publications/'||v.id::text,'data',jsonb_build_object('id',v.id,'version',v.version,'title',v.body->'title','summary',v.body->'summary','content',v.body->'content','contentKind',v.body->'contentKind','sources',v.body->'sources'));
END $$;
REVOKE ALL ON FUNCTION public.save_research_publication(uuid,integer,jsonb,uuid),public.command_research_publication(uuid,text,text,uuid,boolean),public.research_publication_status(uuid),public.list_research_publications(),public.read_research_publication(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_research_publication(uuid,integer,jsonb,uuid),public.command_research_publication(uuid,text,text,uuid,boolean),public.research_publication_status(uuid),public.list_research_publications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_publication(uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_research_publication_distribution(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_research_publication_distribution(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.list_research_publication_distribution_events(timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_research_publication_distribution_events(timestamptz,uuid,integer) TO service_role;
COMMIT;
