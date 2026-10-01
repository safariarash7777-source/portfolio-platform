-- NEXT09, additive ledger; canonical telegram_links is only a current projection.
-- Requires phase5, phase8/11/27, NEXT04 and NEXT08. Install only in authorized environment.
BEGIN;
CREATE SCHEMA next09_private;
REVOKE ALL ON SCHEMA next09_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE next09_private.challenges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
 session_id text NOT NULL,token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.proofs(
 challenge_id uuid PRIMARY KEY REFERENCES next09_private.challenges(id),telegram_id bigint NOT NULL CHECK(telegram_id>0),
 confirmation_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.link_events(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(action IN('linked','unlinked')),telegram_id bigint,challenge_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.preferences(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 course boolean NOT NULL,updates boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.ingested(event_id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.cursor(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),recorded_at timestamptz,event_id uuid);
INSERT INTO next09_private.cursor(singleton,recorded_at,event_id) VALUES(true,'-infinity','00000000-0000-0000-0000-000000000000');
CREATE TABLE next09_private.notices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),
 publication_id uuid NOT NULL,version_id uuid NOT NULL,version integer NOT NULL,kind text NOT NULL CHECK(kind IN('published','withdrawn')),
 category text NOT NULL CHECK(category IN('course','updates')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(event_id,user_id));
CREATE TABLE next09_private.acknowledgements(notice_id uuid PRIMARY KEY REFERENCES next09_private.notices(id),user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE next09_private.jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notice_id uuid NOT NULL UNIQUE REFERENCES next09_private.notices(id),
 link_seq bigint NOT NULL,preference_seq bigint NOT NULL,telegram_id bigint NOT NULL);
CREATE TABLE next09_private.attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES next09_private.jobs(id),attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(job_id,attempt));
CREATE TABLE next09_private.outcomes(
 attempt_id uuid PRIMARY KEY REFERENCES next09_private.attempts(id),
 status text NOT NULL CHECK(status IN('accepted','retry','failed','unknown','cancelled')),
 code text NOT NULL CHECK(code IN('ok','rate_limit','rejected','network_ambiguous','lease_expired','authorization_changed','transport_disabled')),
 message_id bigint,retry_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='accepted')=(message_id IS NOT NULL)),CHECK((status='retry')=(retry_at IS NOT NULL)));
CREATE TABLE next09_private.lead_receipts(external_ref text PRIMARY KEY,lead_id uuid NOT NULL REFERENCES public.leads(id),body_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX ON next09_private.challenges(user_id,created_at DESC);
CREATE INDEX ON next09_private.link_events(user_id,seq DESC);
CREATE INDEX ON next09_private.preferences(user_id,seq DESC);
CREATE INDEX ON next09_private.notices(user_id,created_at DESC);
CREATE INDEX ON next09_private.attempts(job_id,attempt DESC);
CREATE FUNCTION next09_private.no_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'append only'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['challenges','proofs','link_events','preferences','ingested','notices','acknowledgements','jobs','attempts','outcomes','lead_receipts'] LOOP
  EXECUTE format('ALTER TABLE next09_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON next09_private.%I FOR EACH ROW EXECUTE FUNCTION next09_private.no_mutation()',t);
 END LOOP;
END $$;
ALTER TABLE next09_private.cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA next09_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA next09_private FROM PUBLIC,anon,authenticated,service_role;
-- Old one-way redemption must not bypass the new ceremony after installation.
REVOKE EXECUTE ON FUNCTION public.generate_telegram_link_code() FROM authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.redeem_link_code(text,bigint) FROM authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.telegram_links FROM anon,authenticated,service_role;

CREATE FUNCTION next09_private.require_machine() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' THEN RAISE SQLSTATE '42501' USING MESSAGE='machine required'; END IF; END $$;
CREATE FUNCTION next09_private.session() RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s text:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
BEGIN
 IF auth.uid() IS NULL OR s IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id::text=s AND user_id=auth.uid() AND (not_after IS NULL OR not_after>now())) THEN RAISE SQLSTATE '42501' USING MESSAGE='session required';END IF;
 RETURN s;END $$;
CREATE FUNCTION public.next09_start_link() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE u uuid:=auth.uid();s text:=next09_private.session();t text:=encode(gen_random_bytes(32),'hex');c uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,9));
 IF (SELECT count(*) FROM next09_private.challenges WHERE user_id=u AND created_at>clock_timestamp()-interval '1 hour')>=10 THEN RAISE SQLSTATE 'P0429' USING MESSAGE='rate limited'; END IF;
 INSERT INTO next09_private.challenges(user_id,session_id,token_hash,expires_at) VALUES(u,s,encode(digest(t,'sha256'),'hex'),clock_timestamp()+interval '10 minutes') RETURNING id INTO c;
 RETURN jsonb_build_object('challengeId',c,'token',t,'expiresIn',600);
END $$;
CREATE FUNCTION public.next09_prove_link(p_token text,p_telegram bigint,p_confirmation_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE c next09_private.challenges;
BEGIN
 PERFORM next09_private.require_machine();
 IF p_token !~ '^[a-f0-9]{64}$' OR p_telegram IS NULL OR p_telegram<=0 OR p_confirmation_hash !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE '22023'; END IF;
 SELECT * INTO c FROM next09_private.challenges WHERE token_hash=encode(digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF c.id IS NULL OR c.expires_at<=clock_timestamp() OR c.id<>(SELECT id FROM next09_private.challenges WHERE user_id=c.user_id ORDER BY created_at DESC,id DESC LIMIT 1)
 OR EXISTS(SELECT 1 FROM next09_private.link_events WHERE user_id=c.user_id AND created_at>c.created_at) THEN RAISE SQLSTATE 'P0002' USING MESSAGE='invalid challenge'; END IF;
 IF EXISTS(SELECT 1 FROM next09_private.proofs WHERE challenge_id=c.id) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='proof already consumed'; END IF;
 INSERT INTO next09_private.proofs(challenge_id,telegram_id,confirmation_hash) VALUES(c.id,p_telegram,p_confirmation_hash);
 RETURN jsonb_build_object('challengeId',c.id,'status','site_confirmation_required');
END $$;
CREATE FUNCTION public.next09_confirm_link(p_challenge uuid,p_confirmation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE u uuid:=auth.uid();s text:=next09_private.session();c next09_private.challenges;p next09_private.proofs;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,9));
 SELECT * INTO c FROM next09_private.challenges WHERE id=p_challenge AND user_id=u FOR UPDATE;
 SELECT * INTO p FROM next09_private.proofs WHERE challenge_id=c.id;
 IF c.id IS NULL OR c.session_id<>s OR c.expires_at<=clock_timestamp() OR p_confirmation !~ '^[a-f0-9]{64}$'
 OR p.confirmation_hash IS DISTINCT FROM encode(digest(p_confirmation,'sha256'),'hex') OR c.id<>(SELECT id FROM next09_private.challenges WHERE user_id=u ORDER BY created_at DESC,id DESC LIMIT 1)
 OR EXISTS(SELECT 1 FROM next09_private.link_events WHERE user_id=u AND created_at>c.created_at) THEN RAISE SQLSTATE '42501' USING MESSAGE='invalid proof'; END IF;
 IF EXISTS(SELECT 1 FROM public.telegram_links WHERE user_id=u OR telegram_user_id=p.telegram_id) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='unlink existing connection first'; END IF;
 INSERT INTO public.telegram_links(user_id,telegram_user_id) VALUES(u,p.telegram_id);
 INSERT INTO next09_private.link_events(user_id,action,telegram_id,challenge_id) VALUES(u,'linked',p.telegram_id,c.id);
 -- Connection never implies consent. A new connection explicitly starts muted.
 INSERT INTO next09_private.preferences(user_id,course,updates) VALUES(u,false,false);
 RETURN jsonb_build_object('status','linked');
END $$;
CREATE FUNCTION public.next09_unlink() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); BEGIN
 PERFORM next09_private.session();PERFORM pg_advisory_xact_lock(hashtextextended(u::text,9));
 DELETE FROM public.telegram_links WHERE user_id=u;
 INSERT INTO next09_private.link_events(user_id,action) VALUES(u,'unlinked');
 INSERT INTO next09_private.preferences(user_id,course,updates) VALUES(u,false,false);
 RETURN jsonb_build_object('status','unlinked');END $$;
CREATE FUNCTION public.next09_preferences(p_course boolean,p_updates boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();BEGIN
 PERFORM next09_private.session();PERFORM pg_advisory_xact_lock(hashtextextended(u::text,9));
 IF p_course IS NULL OR p_updates IS NULL THEN RAISE SQLSTATE '22023'; END IF;
 INSERT INTO next09_private.preferences(user_id,course,updates) VALUES(u,p_course,p_updates);
 RETURN jsonb_build_object('ok',true);END $$;
CREATE FUNCTION public.next09_connection() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();p next09_private.preferences;e next09_private.link_events;BEGIN
 IF u IS NULL THEN RAISE SQLSTATE '42501';END IF;
 SELECT * INTO p FROM next09_private.preferences WHERE user_id=u ORDER BY seq DESC LIMIT 1;
 SELECT * INTO e FROM next09_private.link_events WHERE user_id=u ORDER BY seq DESC LIMIT 1;
 RETURN jsonb_build_object('linked',e.action='linked' AND EXISTS(SELECT 1 FROM public.telegram_links WHERE user_id=u AND telegram_user_id=e.telegram_id),'legacyConnection',e.seq IS NULL AND EXISTS(SELECT 1 FROM public.telegram_links WHERE user_id=u),'course',coalesce(p.course,false),'updates',coalesce(p.updates,false));END $$;

-- Adapter reads the existing ledger only. No membership/expiry projection is created.
CREATE FUNCTION next09_private.eligible(p_user uuid,p_resolved jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_resolved IS NOT NULL AND ((p_resolved->'envelope'->>'audience')='public' OR EXISTS(
  SELECT 1 FROM public.entitlements e JOIN public.course_cohorts c ON c.id=e.cohort_id
  WHERE e.user_id=p_user AND e.revoked_at IS NULL AND e.starts_at<=now() AND e.expires_at>now()
  AND c.status='published' AND 'resources'=ANY(e.module_keys)
  AND e.cohort_id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_resolved->'effectiveCohortIds'))));
$$;
CREATE FUNCTION public.next09_stage() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cur next09_private.cursor;r jsonb;env jsonb;resolved jsonb;cat text;cnt integer:=0;
BEGIN
 PERFORM next09_private.require_machine();SELECT * INTO cur FROM next09_private.cursor WHERE singleton FOR UPDATE;
 FOR r IN SELECT value FROM jsonb_array_elements(public.list_research_publication_distribution_events(cur.recorded_at,cur.event_id,10)) LOOP
  env:=r->'envelope';
  IF NOT EXISTS(SELECT 1 FROM next09_private.ingested WHERE event_id=(env->>'eventId')::uuid) THEN
   resolved:=public.resolve_research_publication_distribution((env->>'eventId')::uuid);
   IF env->>'type'='publication.published' AND resolved IS NOT NULL THEN
    cat:=CASE WHEN resolved->'data'->>'contentKind' IN('lesson','webinar_plan') THEN 'course' ELSE 'updates' END;
    INSERT INTO next09_private.notices(event_id,user_id,publication_id,version_id,version,kind,category)
     SELECT (env->>'eventId')::uuid,u.id,(env->>'aggregateRef')::uuid,(env->>'payloadRef')::uuid,(env->>'aggregateVersion')::integer,'published',cat
     FROM auth.users u WHERE next09_private.eligible(u.id,resolved) ON CONFLICT DO NOTHING;
   ELSIF env->>'type'='publication.withdrawn' THEN
    INSERT INTO next09_private.notices(event_id,user_id,publication_id,version_id,version,kind,category)
     SELECT DISTINCT ON(user_id) (env->>'eventId')::uuid,user_id,publication_id,(env->>'payloadRef')::uuid,(env->>'aggregateVersion')::integer,'withdrawn',category
     FROM next09_private.notices WHERE publication_id=(env->>'aggregateRef')::uuid AND kind='published' ORDER BY user_id,created_at DESC ON CONFLICT DO NOTHING;
   END IF;
   IF 'telegram'=ANY(ARRAY(SELECT jsonb_array_elements_text(env->'channels'))) THEN
    INSERT INTO next09_private.jobs(notice_id,link_seq,preference_seq,telegram_id)
     SELECT n.id,l.seq,p.seq,t.telegram_user_id FROM next09_private.notices n
     JOIN public.telegram_links t ON t.user_id=n.user_id
     JOIN LATERAL(SELECT * FROM next09_private.link_events WHERE user_id=n.user_id ORDER BY seq DESC LIMIT 1)l ON l.action='linked' AND l.telegram_id=t.telegram_user_id
     JOIN LATERAL(SELECT * FROM next09_private.preferences WHERE user_id=n.user_id ORDER BY seq DESC LIMIT 1)p ON CASE n.category WHEN 'course' THEN p.course ELSE p.updates END
     WHERE n.event_id=(env->>'eventId')::uuid ON CONFLICT DO NOTHING;
   END IF;
   INSERT INTO next09_private.ingested(event_id) VALUES((env->>'eventId')::uuid);cnt:=cnt+1;
  END IF;
  UPDATE next09_private.cursor SET recorded_at=(r->'cursor'->>'recordedAt')::timestamptz,event_id=(r->'cursor'->>'eventId')::uuid WHERE singleton;
 END LOOP;
 RETURN jsonb_build_object('stagedEvents',cnt);
END $$;
CREATE FUNCTION next09_private.valid_job(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j next09_private.jobs;n next09_private.notices;resolved jsonb;BEGIN
 SELECT * INTO j FROM next09_private.jobs WHERE id=p_id;SELECT * INTO n FROM next09_private.notices WHERE id=j.notice_id;
 IF j.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.telegram_links WHERE user_id=n.user_id AND telegram_user_id=j.telegram_id)
 OR j.link_seq IS DISTINCT FROM(SELECT seq FROM next09_private.link_events WHERE user_id=n.user_id ORDER BY seq DESC LIMIT 1)
 OR j.preference_seq IS DISTINCT FROM(SELECT seq FROM next09_private.preferences WHERE user_id=n.user_id ORDER BY seq DESC LIMIT 1) THEN RETURN false;END IF;
 IF n.kind='withdrawn' THEN RETURN true; END IF;
 resolved:=public.resolve_research_publication_distribution(n.event_id);
 RETURN next09_private.eligible(n.user_id,resolved);
END $$;
CREATE FUNCTION public.next09_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j next09_private.jobs;a next09_private.attempts;o next09_private.outcomes;n next09_private.notices;i uuid;BEGIN
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
  RETURN jsonb_build_object('attemptId',i,'telegramId',j.telegram_id::text,'kind',n.kind,'version',n.version,'sitePath',CASE WHEN n.kind='withdrawn' THEN '/notifications' ELSE '/publications/'||n.version_id::text END);
 END LOOP;RETURN NULL;END $$;
CREATE FUNCTION public.next09_check_attempt(p_attempt uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM next09_private.require_machine();RETURN EXISTS(SELECT 1 FROM next09_private.attempts a WHERE a.id=p_attempt AND a.created_at>clock_timestamp()-interval '25 seconds' AND NOT EXISTS(SELECT 1 FROM next09_private.outcomes WHERE attempt_id=a.id) AND next09_private.valid_job(a.job_id));END $$;
CREATE FUNCTION public.next09_finish(p_attempt uuid,p_status text,p_code text,p_message bigint DEFAULT NULL,p_retry_seconds integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM next09_private.require_machine();
 IF p_retry_seconds IS NOT NULL AND (p_retry_seconds<1 OR p_retry_seconds>3600) THEN RAISE SQLSTATE '22023';END IF;
 INSERT INTO next09_private.outcomes(attempt_id,status,code,message_id,retry_at) VALUES(p_attempt,p_status,p_code,p_message,CASE WHEN p_retry_seconds IS NOT NULL THEN clock_timestamp()+make_interval(secs=>p_retry_seconds) END) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.next09_notices() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();BEGIN IF u IS NULL THEN RAISE SQLSTATE '42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM(
 SELECT n.id,n.version,n.kind,n.category,n.created_at,EXISTS(SELECT 1 FROM next09_private.acknowledgements WHERE notice_id=n.id) AS acknowledged,
 CASE WHEN n.kind='published' AND public.read_research_publication(n.version_id) IS NOT NULL THEN '/publications/'||n.version_id::text ELSE NULL END AS site_path,
 coalesce((SELECT CASE WHEN o.status='retry' AND a.attempt=3 THEN 'exhausted' WHEN o.status IS NULL THEN 'pending' ELSE o.status END FROM next09_private.jobs j JOIN next09_private.attempts a ON a.job_id=j.id LEFT JOIN next09_private.outcomes o ON o.attempt_id=a.id WHERE j.notice_id=n.id ORDER BY a.attempt DESC LIMIT 1),'not_sent') AS telegram_status
 FROM next09_private.notices n WHERE n.user_id=u ORDER BY n.created_at DESC LIMIT 100)x),'[]');END $$;
CREATE FUNCTION public.next09_acknowledge(p_notice uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid();BEGIN IF u IS NULL OR NOT EXISTS(SELECT 1 FROM next09_private.notices WHERE id=p_notice AND user_id=u) THEN RAISE SQLSTATE '42501';END IF;
 INSERT INTO next09_private.acknowledgements(notice_id,user_id) VALUES(p_notice,u) ON CONFLICT DO NOTHING;END $$;
CREATE FUNCTION public.next09_copy_lead(p_body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ref text:=p_body->>'external_ref';receipt next09_private.lead_receipts;ident uuid;
BEGIN PERFORM next09_private.require_machine();
 IF ref IS NULL OR ref !~ '^[a-z0-9][a-z0-9-]{0,35}:[1-9][0-9]{0,15}$' OR p_body->>'source'<>'miniapp' THEN RAISE SQLSTATE '22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,909));SELECT * INTO receipt FROM next09_private.lead_receipts WHERE external_ref=ref;
 IF receipt.external_ref IS NOT NULL THEN IF receipt.body_hash<>md5(p_body::text) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='correlation conflict';END IF;RETURN jsonb_build_object('ok',true,'duplicate',true);END IF;
 INSERT INTO public.leads(source,name,phone,topic,message,preferred_date,preferred_time,telegram_username,telegram_id)
 VALUES('miniapp',p_body->>'name',p_body->>'phone',p_body->>'topic',p_body->>'message',p_body->>'preferred_date',p_body->>'preferred_time',p_body->>'telegram_username',p_body->>'telegram_id') RETURNING id INTO ident;
 INSERT INTO next09_private.lead_receipts(external_ref,lead_id,body_hash)VALUES(ref,ident,md5(p_body::text));RETURN jsonb_build_object('ok',true,'duplicate',false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA next09_private FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure AS fn FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'next09_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.fn);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.next09_start_link(),public.next09_confirm_link(uuid,text),public.next09_unlink(),public.next09_preferences(boolean,boolean),public.next09_connection(),public.next09_notices(),public.next09_acknowledge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next09_prove_link(text,bigint,text),public.next09_stage(),public.next09_claim(),public.next09_check_attempt(uuid),public.next09_finish(uuid,text,text,bigint,integer),public.next09_copy_lead(jsonb) TO service_role;
COMMIT;
