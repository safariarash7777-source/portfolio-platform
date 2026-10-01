-- NEXT09-only patch after 189. NOT_APPLIED to any shared/target environment.
-- Consumes NEXT04/NEXT08 tables; compatible with optional feed185/191 receipts.
BEGIN;
CREATE FUNCTION next09_private.publication_path(p_user uuid,p_version uuid) RETURNS text
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.research_publication_versions;c uuid;
BEGIN
 IF p_user IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.research_publication_versions WHERE id=p_version;
 IF v.id IS NULL OR publication_private.state(v.id)<>'publish' OR NOT publication_private.current(v.id) THEN RETURN NULL;END IF;
 IF v.body->>'audience'='public' THEN RETURN '/publications/'||v.id::text;END IF;
 -- Recipient-scoped current ledger lookup, identical to NEXT04 resources predicates.
 SELECT cc.id INTO c FROM public.course_cohorts cc JOIN public.entitlements e ON e.cohort_id=cc.id
 WHERE cc.status='published' AND e.user_id=p_user AND e.revoked_at IS NULL
 AND e.starts_at<=now() AND e.expires_at>now() AND 'resources'=ANY(e.module_keys)
 AND (v.body->'cohortIds') @> jsonb_build_array(cc.id::text) ORDER BY cc.id LIMIT 1;
 IF c IS NULL THEN RETURN NULL;END IF;
 RETURN '/publications/'||v.id::text||'?cohort='||c::text;
END $$;
REVOKE ALL ON FUNCTION next09_private.publication_path(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.next09_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j next09_private.jobs;a next09_private.attempts;o next09_private.outcomes;n next09_private.notices;i uuid;path text;BEGIN
 PERFORM next09_private.require_machine();
 FOR j IN SELECT * FROM next09_private.jobs ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO a FROM next09_private.attempts WHERE job_id=j.id ORDER BY attempt DESC LIMIT 1;
  IF a.id IS NOT NULL THEN
   SELECT * INTO o FROM next09_private.outcomes WHERE attempt_id=a.id;
   IF o.attempt_id IS NULL THEN
    IF a.created_at<clock_timestamp()-interval '30 seconds' THEN INSERT INTO next09_private.outcomes(attempt_id,status,code) VALUES(a.id,'unknown','lease_expired') ON CONFLICT DO NOTHING;END IF;
    CONTINUE;
   END IF;
   IF o.status<>'retry' OR a.attempt>=3 OR o.retry_at>clock_timestamp() THEN CONTINUE;END IF;
  END IF;
  INSERT INTO next09_private.attempts(job_id,attempt) VALUES(j.id,coalesce(a.attempt,0)+1) RETURNING id INTO i;
  IF NOT next09_private.valid_job(j.id) THEN INSERT INTO next09_private.outcomes(attempt_id,status,code) VALUES(i,'cancelled','authorization_changed');CONTINUE;END IF;
  SELECT * INTO n FROM next09_private.notices WHERE id=j.notice_id;
  path:=CASE WHEN n.kind='withdrawn' THEN '/notifications' ELSE next09_private.publication_path(n.user_id,n.version_id) END;
  IF path IS NULL THEN INSERT INTO next09_private.outcomes(attempt_id,status,code) VALUES(i,'cancelled','authorization_changed');CONTINUE;END IF;
  RETURN jsonb_build_object('attemptId',i,'telegramId',j.telegram_id::text,'kind',n.kind,'version',n.version,'sitePath',path);
 END LOOP;RETURN NULL;END $$;
CREATE OR REPLACE FUNCTION public.next09_notices() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();BEGIN IF u IS NULL THEN RAISE SQLSTATE '42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM(
 SELECT n.id,n.version,n.kind,n.category,n.created_at,EXISTS(SELECT 1 FROM next09_private.acknowledgements WHERE notice_id=n.id) AS acknowledged,
 CASE WHEN n.kind='published' AND public.read_research_publication(n.version_id) IS NOT NULL THEN next09_private.publication_path(u,n.version_id) ELSE NULL END AS site_path,
 coalesce((SELECT CASE WHEN o.status='retry' AND a.attempt=3 THEN 'exhausted' WHEN o.status IS NULL THEN 'pending' ELSE o.status END FROM next09_private.jobs j JOIN next09_private.attempts a ON a.job_id=j.id LEFT JOIN next09_private.outcomes o ON o.attempt_id=a.id WHERE j.notice_id=n.id ORDER BY a.attempt DESC LIMIT 1),'not_sent') AS telegram_status
 FROM next09_private.notices n WHERE n.user_id=u ORDER BY n.created_at DESC LIMIT 100)x),'[]');END $$;
-- CREATE OR REPLACE preserves existing 189 entry-point grants; state them explicitly.
REVOKE ALL ON FUNCTION public.next09_claim(),public.next09_notices() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.next09_claim() TO service_role;
GRANT EXECUTE ON FUNCTION public.next09_notices() TO authenticated;
COMMIT;
