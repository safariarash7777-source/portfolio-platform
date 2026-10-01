-- NEXT-04 additive extension of phase8/11/27; apply ONLY to an authorized sandbox.
-- No defaults enroll anyone; commercial registration stays disabled (D-034 OPEN).
BEGIN;
CREATE TABLE public.courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, summary text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published'))
);
CREATE TABLE public.course_cohorts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES public.courses(id),
 title text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 timezone text NOT NULL DEFAULT 'Asia/Tehran' CHECK(timezone='Asia/Tehran'),
 policy_version text NOT NULL, policy jsonb NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','cancelled')),
 registration_open boolean NOT NULL DEFAULT false,
 module_keys text[] NOT NULL DEFAULT ARRAY['webinar','resources'],
 CHECK(ends_at>starts_at), CHECK(policy ? 'commercialEnabled' AND jsonb_typeof(policy->'commercialEnabled')='boolean' AND policy->>'commercialEnabled'='false'),
 CHECK(module_keys <@ ARRAY['market-overview','funds','gold-fx','symbol','webinar','resources']::text[])
);
ALTER TABLE public.webinars ADD COLUMN cohort_id uuid REFERENCES public.course_cohorts(id);
ALTER TABLE public.entitlements ADD COLUMN cohort_id uuid REFERENCES public.course_cohorts(id),
 ADD COLUMN module_keys text[], ADD COLUMN command_key text, ADD COLUMN renewed_from uuid REFERENCES public.entitlements(id);
CREATE UNIQUE INDEX seasonal_entitlement_command ON public.entitlements(command_key) WHERE command_key IS NOT NULL;
ALTER TABLE public.entitlements ADD CONSTRAINT seasonal_entitlement_scope CHECK
 (cohort_id IS NULL OR (kind IN ('webinar','manual') AND module_keys IS NOT NULL AND cardinality(module_keys)>0 AND expires_at IS NOT NULL AND expires_at>starts_at));
-- Scoped grants must use audited definer RPCs, including for authenticated admins.
-- Preserve legacy noncohort admin operations; broader permissive policies cannot bypass these.
CREATE POLICY seasonal_entitlement_insert_via_rpc ON public.entitlements AS RESTRICTIVE
 FOR INSERT TO authenticated WITH CHECK(cohort_id IS NULL);
CREATE POLICY seasonal_entitlement_update_via_rpc ON public.entitlements AS RESTRICTIVE
 FOR UPDATE TO authenticated USING(cohort_id IS NULL) WITH CHECK(cohort_id IS NULL);
ALTER TABLE public.member_import_batches ADD COLUMN cohort_id uuid REFERENCES public.course_cohorts(id),
 ADD COLUMN preview_hash text, ADD COLUMN policy_version text, ADD COLUMN expires_at timestamptz;
ALTER TABLE public.member_import_rows ADD COLUMN external_source text, ADD COLUMN external_id text,
 ADD COLUMN source_revision integer, ADD COLUMN source_occurred_at timestamptz,
 ADD COLUMN external_status text CHECK(external_status IN ('accepted','cancelled')),
 ADD COLUMN cohort_id uuid REFERENCES public.course_cohorts(id),
 ADD COLUMN identity_proved_at timestamptz, ADD COLUMN identity_evidence text;
CREATE INDEX seasonal_external_ref ON public.member_import_rows(external_source,external_id,source_revision);
-- Contact is not the deduplication identity of a seasonal registration.
DROP INDEX public.uq_member_row_in_batch;
CREATE UNIQUE INDEX uq_member_row_in_batch ON public.member_import_rows(batch_id,contact_kind,contact_value) WHERE external_id IS NULL;
CREATE UNIQUE INDEX seasonal_row_in_batch ON public.member_import_rows(batch_id,external_source,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE public.needs_assessment_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 cohort_id uuid NOT NULL REFERENCES public.course_cohorts(id), version integer NOT NULL CHECK(version>0),
 body jsonb NOT NULL, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,cohort_id,version)
);
CREATE TABLE public.course_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL REFERENCES public.course_cohorts(id),
 title text NOT NULL, module_key text NOT NULL DEFAULT 'resources',
 storage_bucket text, storage_path text, webinar_id uuid REFERENCES public.webinars(id),
 published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((storage_bucket='course-private' AND storage_path IS NOT NULL AND webinar_id IS NULL) OR
        (webinar_id IS NOT NULL AND storage_bucket IS NULL AND storage_path IS NULL))
);
CREATE TABLE public.seasonal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision bigint GENERATED ALWAYS AS IDENTITY UNIQUE, event_type text NOT NULL, actor_id uuid REFERENCES public.profiles(id),
 user_id uuid REFERENCES public.profiles(id), cohort_id uuid REFERENCES public.course_cohorts(id),
 command_key text UNIQUE, payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE SCHEMA IF NOT EXISTS seasonal_private;
REVOKE ALL ON SCHEMA seasonal_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA seasonal_private TO authenticated;
CREATE FUNCTION seasonal_private.guard_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only history'; END $$;
CREATE TRIGGER seasonal_needs_history BEFORE UPDATE OR DELETE ON public.needs_assessment_versions
 FOR EACH ROW EXECUTE FUNCTION seasonal_private.guard_history();
CREATE TRIGGER seasonal_event_history BEFORE UPDATE OR DELETE ON public.seasonal_events
 FOR EACH ROW EXECUTE FUNCTION seasonal_private.guard_history();
CREATE FUNCTION seasonal_private.guard_cohort_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.entitlements WHERE cohort_id=OLD.id) AND
 (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR
 NEW.policy_version IS DISTINCT FROM OLD.policy_version OR NEW.policy IS DISTINCT FROM OLD.policy OR NEW.module_keys IS DISTINCT FROM OLD.module_keys)
 THEN RAISE EXCEPTION 'enrolled cohort policy immutable; issue an explicit grant or new cohort'; END IF;
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' AND NOT EXISTS(SELECT 1 FROM public.seasonal_events WHERE cohort_id=OLD.id AND event_type='cohort.cancelled' AND actor_id=auth.uid()) THEN RAISE EXCEPTION 'cancellation requires an audited reason'; END IF;
 IF OLD.status='cancelled' AND NEW.status<>'cancelled' THEN RAISE EXCEPTION 'cancelled cohort cannot silently reopen; create an explicit replacement'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seasonal_cohort_policy BEFORE UPDATE ON public.course_cohorts FOR EACH ROW EXECUTE FUNCTION seasonal_private.guard_cohort_policy();
CREATE FUNCTION seasonal_private.guard_entitlement_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id OR NEW.module_keys IS DISTINCT FROM OLD.module_keys
 OR NEW.command_key IS DISTINCT FROM OLD.command_key OR NEW.renewed_from IS DISTINCT FROM OLD.renewed_from
 OR NEW.source IS DISTINCT FROM OLD.source OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
 OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
 THEN RAISE EXCEPTION 'immutable entitlement provenance'; END IF;
 IF OLD.cohort_id IS NOT NULL AND NEW.revoked_at IS NOT NULL AND length(btrim(coalesce(NEW.note,'')))<10
 THEN RAISE EXCEPTION 'revoke reason required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seasonal_entitlement_scope BEFORE UPDATE ON public.entitlements
 FOR EACH ROW EXECUTE FUNCTION seasonal_private.guard_entitlement_scope();

CREATE FUNCTION public.seasonal_module_access(p_module text,p_cohort uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE ids jsonb; finish timestamptz; pv text; u uuid:=auth.uid();
BEGIN
 IF u IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','sign_in_required','authorizedByCohortIds','[]'::jsonb,'until',NULL,'policyVersion',NULL); END IF;
 IF p_module NOT IN ('market-overview','funds','gold-fx','symbol','webinar','resources') THEN RAISE SQLSTATE '22023' USING MESSAGE='unknown module'; END IF;
 SELECT jsonb_agg(DISTINCT e.cohort_id),max(e.expires_at),max(c.policy_version) INTO ids,finish,pv
 FROM public.entitlements e JOIN public.course_cohorts c ON c.id=e.cohort_id
 WHERE e.user_id=u AND e.revoked_at IS NULL AND e.starts_at<=now() AND e.expires_at>now()
 AND c.status<>'cancelled' AND p_module=ANY(e.module_keys) AND (p_cohort IS NULL OR e.cohort_id=p_cohort);
 RETURN jsonb_build_object('allowed',ids IS NOT NULL,'reason',CASE WHEN ids IS NOT NULL THEN 'active'
 WHEN EXISTS(SELECT 1 FROM public.entitlements e JOIN public.course_cohorts c ON c.id=e.cohort_id WHERE e.user_id=u AND (p_cohort IS NULL OR e.cohort_id=p_cohort) AND p_module=ANY(e.module_keys) AND c.status='cancelled') THEN 'cohort_cancelled'
 WHEN EXISTS(SELECT 1 FROM public.entitlements e WHERE e.user_id=u AND (p_cohort IS NULL OR e.cohort_id=p_cohort) AND p_module=ANY(e.module_keys) AND e.revoked_at IS NULL AND e.starts_at>now() AND e.expires_at>now()) THEN 'scheduled'
 WHEN EXISTS(SELECT 1 FROM public.entitlements e WHERE e.user_id=u AND (p_cohort IS NULL OR e.cohort_id=p_cohort) AND p_module=ANY(e.module_keys) AND e.revoked_at IS NULL AND e.expires_at<=now()) THEN 'expired'
 WHEN EXISTS(SELECT 1 FROM public.entitlements e WHERE e.user_id=u AND (p_cohort IS NULL OR e.cohort_id=p_cohort) AND p_module=ANY(e.module_keys) AND e.revoked_at IS NOT NULL) THEN 'revoked'
 ELSE 'module_not_granted' END,
 'authorizedByCohortIds',coalesce(ids,'[]'::jsonb),'until',finish,'policyVersion',pv);
END $$;

CREATE FUNCTION seasonal_private.require_admin() RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE SQLSTATE '42501' USING MESSAGE='forbidden'; END IF; END $$;
-- Privileged internals reside in an unexposed schema, auth.uid() is checked in every path.
CREATE FUNCTION seasonal_private.preview_import(p_cohort uuid,p_hash text,p_source text,p_evidence text,p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.course_cohorts; b bigint; r jsonb; st text; n integer:=0;
BEGIN
 PERFORM seasonal_private.require_admin();
 SELECT * INTO STRICT c FROM public.course_cohorts WHERE id=p_cohort FOR SHARE;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE '22023' USING MESSAGE='invalid preview'; END IF;
 INSERT INTO public.member_import_batches(source_label,evidence,imported_by,cohort_id,preview_hash,policy_version,expires_at)
 VALUES(p_source,p_evidence,auth.uid(),p_cohort,p_hash,c.policy_version,now()+interval '30 minutes') RETURNING id INTO b;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF r->>'status' NOT IN ('accepted','cancelled') OR r->>'contactType' NOT IN ('email','phone') OR length(r->>'externalId') NOT BETWEEN 1 AND 160 OR length(r->>'source') NOT BETWEEN 1 AND 80 OR (r->>'revision')::int<1 OR r->>'occurredAt' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  THEN RAISE SQLSTATE '22023' USING MESSAGE='invalid source row'; END IF;
  st:='pending';
  IF EXISTS(SELECT 1 FROM public.member_import_rows x JOIN public.member_import_batches xb ON xb.id=x.batch_id
    WHERE x.external_source=r->>'source' AND x.external_id=r->>'externalId' AND xb.approved_at IS NOT NULL AND xb.revoked_at IS NULL) THEN st:='duplicate'; END IF;
  INSERT INTO public.member_import_rows(batch_id,contact_kind,contact_value,access_from,access_until,status,
    external_source,external_id,source_revision,source_occurred_at,external_status,cohort_id,note)
  VALUES(b,r->>'contactType',lower(r->>'contactValue'),(c.starts_at AT TIME ZONE c.timezone)::date,
    greatest((c.ends_at AT TIME ZONE c.timezone)::date,(c.starts_at AT TIME ZONE c.timezone)::date+1),st,
    r->>'source',r->>'externalId',(r->>'revision')::int,(r->>'occurredAt')::timestamptz,r->>'status',c.id,
    CASE WHEN st='duplicate' THEN 'existing external ID; no mutation, review corrections separately' END);
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('importId',b,'hash',p_hash,'policyVersion',c.policy_version,'total',n,'expiresAt',now()+interval '30 minutes');
END $$;
CREATE FUNCTION public.seasonal_import_preview(p_cohort uuid,p_hash text,p_source text,p_evidence text,p_rows jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.preview_import(p_cohort,p_hash,p_source,p_evidence,p_rows) $$;
CREATE FUNCTION seasonal_private.commit_import(p_id bigint,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.member_import_batches; c public.course_cohorts;
BEGIN
 PERFORM seasonal_private.require_admin(); SELECT * INTO STRICT b FROM public.member_import_batches WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT c FROM public.course_cohorts WHERE id=b.cohort_id;
 IF b.preview_hash IS DISTINCT FROM p_hash OR b.policy_version IS DISTINCT FROM c.policy_version OR b.revoked_at IS NOT NULL THEN RAISE SQLSTATE 'PT409' USING MESSAGE='preview changed'; END IF;
 IF b.approved_at IS NOT NULL THEN RETURN jsonb_build_object('importId',b.id,'status','committed'); END IF;
 IF b.expires_at<=now() THEN RAISE SQLSTATE 'PT409' USING MESSAGE='preview expired'; END IF;
 -- Serialize commits of the same source identities, including overlapping batches.
 PERFORM pg_advisory_xact_lock(hashtextextended('seasonal-import',0));
 UPDATE public.member_import_rows r SET status='duplicate',note='external ID already committed; review correction'
 WHERE r.batch_id=b.id AND EXISTS(SELECT 1 FROM public.member_import_rows x JOIN public.member_import_batches xb ON xb.id=x.batch_id
 WHERE x.batch_id<>b.id AND x.external_source=r.external_source AND x.external_id=r.external_id AND xb.approved_at IS NOT NULL AND xb.revoked_at IS NULL);
 UPDATE public.member_import_batches SET approved_at=now(),approved_by=auth.uid() WHERE id=b.id;
 INSERT INTO public.seasonal_events(event_type,actor_id,cohort_id,payload) VALUES('registration.import_committed',auth.uid(),b.cohort_id,jsonb_build_object('importId',b.id));
 RETURN jsonb_build_object('importId',b.id,'status','committed');
END $$;
CREATE FUNCTION public.seasonal_import_commit(p_id bigint,p_hash text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.commit_import(p_id,p_hash) $$;

CREATE FUNCTION seasonal_private.claim_registration(p_row bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.member_import_rows; b public.member_import_batches; c public.course_cohorts;
 u uuid:=auth.uid(); proof boolean; matches integer; e uuid; reg uuid; w uuid;
BEGIN
 IF u IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE='sign in required'; END IF;
 SELECT * INTO r FROM public.member_import_rows WHERE id=p_row FOR UPDATE;
 IF r.id IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE='registration not verified'; END IF;
 SELECT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u AND
 ((r.contact_kind='email' AND a.email_confirmed_at IS NOT NULL AND lower(a.email)=r.contact_value)
 OR (r.contact_kind='phone' AND a.phone_confirmed_at IS NOT NULL AND a.phone=r.contact_value))) INTO proof;
 IF NOT proof THEN RAISE SQLSTATE '42501' USING MESSAGE='registration not verified'; END IF;
 IF r.matched_user_id IS NOT NULL AND r.matched_user_id<>u THEN
  RETURN jsonb_build_object('status','pending_review','reason','identity_conflict'); END IF;
 SELECT * INTO STRICT b FROM public.member_import_batches WHERE id=r.batch_id;
 SELECT * INTO STRICT c FROM public.course_cohorts WHERE id=r.cohort_id;
 IF b.approved_at IS NULL OR b.revoked_at IS NOT NULL OR r.status IN ('duplicate','rejected') THEN RAISE SQLSTATE 'PT409' USING MESSAGE='registration requires review'; END IF;
 SELECT count(*) INTO matches FROM auth.users a WHERE
 (r.contact_kind='email' AND a.email_confirmed_at IS NOT NULL AND lower(a.email)=r.contact_value) OR
 (r.contact_kind='phone' AND a.phone_confirmed_at IS NOT NULL AND a.phone=r.contact_value);
 IF (matches<>1 AND NOT coalesce(r.matched_user_id=u AND r.identity_evidence LIKE 'admin-review:%',false)) OR r.external_status<>'accepted' OR c.status='cancelled' THEN
  UPDATE public.member_import_rows SET status='unmatched',note='Ambiguous identity, cancellation or source status requires review' WHERE id=r.id;
  RETURN jsonb_build_object('status','pending_review','reason','registration_review_required'); END IF;
 UPDATE public.member_import_rows SET status='matched',matched_user_id=u,identity_proved_at=coalesce(identity_proved_at,now()),identity_evidence=coalesce(identity_evidence,'auth.users confirmed contact') WHERE id=r.id;
 SELECT entitlement_id INTO e FROM public.member_grants WHERE row_id=r.id ORDER BY id LIMIT 1;
 IF e IS NOT NULL THEN RETURN jsonb_build_object('status','claimed','grantRef',e,'cohortId',c.id); END IF;
 IF c.ends_at<=now() THEN RETURN jsonb_build_object('status','expired','cohortId',c.id); END IF;
 INSERT INTO public.entitlements(user_id,kind,source,starts_at,expires_at,granted_by,note,cohort_id,module_keys,command_key)
 VALUES(u,'webinar','seasonal_import',greatest(c.starts_at,r.source_occurred_at),c.ends_at,b.approved_by,'Confirmed external registration',c.id,c.module_keys,'registration:'||r.external_source||':'||r.external_id) RETURNING id INTO e;
 INSERT INTO public.member_grants(row_id,user_id,entitlement_id) VALUES(r.id,u,e);
 SELECT id INTO w FROM public.webinars WHERE cohort_id=c.id ORDER BY starts_at LIMIT 1;
 IF w IS NOT NULL THEN INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status) VALUES(w,u,'free')
 ON CONFLICT(webinar_id,user_id) DO NOTHING RETURNING id INTO reg; END IF;
 INSERT INTO public.seasonal_events(event_type,actor_id,user_id,cohort_id,command_key,payload)
 VALUES('membership.granted',u,u,c.id,'event:'||e,jsonb_build_object('grantRef',e,'registrationRef',r.id));
 RETURN jsonb_build_object('status','claimed','grantRef',e,'cohortId',c.id);
END $$;
CREATE FUNCTION public.seasonal_claim_registration(p_row bigint) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.claim_registration(p_row) $$;

CREATE FUNCTION seasonal_private.save_needs(p_cohort uuid,p_base integer,p_body jsonb,p_submit boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); v integer; result uuid;
BEGIN
 IF u IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE='sign in required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.member_import_rows WHERE cohort_id=p_cohort AND matched_user_id=u AND identity_proved_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.entitlements WHERE cohort_id=p_cohort AND user_id=u) THEN RAISE SQLSTATE '42501' USING MESSAGE='not enrolled'; END IF;
 IF p_body IS NULL OR NOT p_body ?& ARRAY['experience','interests','goal','question'] OR jsonb_typeof(p_body)<>'object' OR jsonb_typeof(p_body->'experience')<>'string' OR p_body->>'experience' NOT IN ('new','some','experienced') OR jsonb_typeof(p_body->'interests')<>'array'
 OR jsonb_array_length(p_body->'interests')>5 OR jsonb_typeof(p_body->'goal')<>'string' OR length(p_body->>'goal')>500
 OR jsonb_typeof(p_body->'question')<>'string' OR length(p_body->>'question')>1000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k NOT IN ('experience','interests','goal','question'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'interests') a WHERE jsonb_typeof(a)<>'string' OR length(a#>>'{}')>80)
 THEN RAISE SQLSTATE '22023' USING MESSAGE='invalid needs assessment'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_cohort::text,0));
 SELECT coalesce(max(version),0) INTO v FROM public.needs_assessment_versions WHERE user_id=u AND cohort_id=p_cohort;
 IF p_base<>v THEN RAISE SQLSTATE 'PT409' USING MESSAGE='stale needs version'; END IF;
 INSERT INTO public.needs_assessment_versions(user_id,cohort_id,version,body,submitted_at)
 VALUES(u,p_cohort,v+1,p_body,CASE WHEN p_submit THEN now() END) RETURNING id INTO result;
 RETURN jsonb_build_object('id',result,'version',v+1,'body',p_body,'submitted',p_submit);
END $$;
CREATE FUNCTION public.seasonal_save_needs(p_cohort uuid,p_base integer,p_body jsonb,p_submit boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.save_needs(p_cohort,p_base,p_body,p_submit) $$;

CREATE FUNCTION seasonal_private.access_command(p_body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.course_cohorts; prior public.entitlements; eid uuid; fingerprint text:=md5(p_body::text); previous jsonb;
 op text:=p_body->>'action'; key text:=p_body->>'idempotencyKey'; reason text:=p_body->>'reason'; target uuid:=(p_body->>'userId')::uuid;
 mods text[]; start_at timestamptz; end_at timestamptz;
BEGIN
 PERFORM seasonal_private.require_admin();
 IF op IS NULL OR op NOT IN ('grant','revoke','renew') OR length(coalesce(key,'')) NOT BETWEEN 8 AND 160 OR length(btrim(coalesce(reason,'')))<10 THEN RAISE SQLSTATE '22023' USING MESSAGE='action/key/reason required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('command:'||key,0));
 SELECT payload INTO previous FROM public.seasonal_events WHERE command_key=key;
 IF previous IS NOT NULL THEN
  IF previous->>'fingerprint'<>fingerprint THEN RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency conflict'; END IF;
  RETURN previous->'receipt'; END IF;
 SELECT * INTO STRICT c FROM public.course_cohorts WHERE id=(p_body->>'cohortId')::uuid;
 IF op IN ('revoke','renew') THEN
  SELECT * INTO STRICT prior FROM public.entitlements WHERE id=(p_body->>'grantRef')::uuid AND user_id=target AND cohort_id=c.id FOR UPDATE;
 END IF;
 IF op='revoke' THEN
  UPDATE public.entitlements SET revoked_at=coalesce(revoked_at,now()),note=reason WHERE id=prior.id;
  UPDATE public.member_grants SET revoked_at=coalesce(revoked_at,now()),revoke_reason=reason WHERE entitlement_id=prior.id;
  eid:=prior.id;
 ELSE
  SELECT array_agg(value) INTO mods FROM jsonb_array_elements_text(p_body->'moduleKeys');
  start_at:=(p_body->>'startsAt')::timestamptz; end_at:=(p_body->>'endsAtExclusive')::timestamptz;
  IF mods IS NULL OR cardinality(mods)=0 OR NOT mods<@ARRAY['market-overview','funds','gold-fx','symbol','webinar','resources']::text[] OR start_at IS NULL OR end_at IS NULL OR end_at<=start_at THEN RAISE SQLSTATE '22023' USING MESSAGE='invalid grant scope/window'; END IF;
  IF c.status='cancelled' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='cohort cancelled'; END IF;
  INSERT INTO public.entitlements(user_id,kind,source,starts_at,expires_at,granted_by,note,cohort_id,module_keys,command_key,renewed_from)
  VALUES(target,'manual','seasonal_manual',start_at,end_at,auth.uid(),reason,c.id,mods,key,CASE WHEN op='renew' THEN prior.id END) RETURNING id INTO eid;
 END IF;
 previous:=jsonb_build_object('grantRef',eid,'cohortId',c.id,'action',op);
 INSERT INTO public.seasonal_events(event_type,actor_id,user_id,cohort_id,command_key,payload)
 VALUES(CASE op WHEN 'grant' THEN 'membership.granted' WHEN 'revoke' THEN 'membership.revoked' ELSE 'membership.renewed' END,auth.uid(),target,c.id,key,jsonb_build_object('fingerprint',fingerprint,'reason',reason,'receipt',previous));
 RETURN previous;
END $$;
CREATE FUNCTION public.seasonal_access_command(p_body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.access_command(p_body) $$;

CREATE FUNCTION seasonal_private.join_webinar(p_cohort uuid,p_webinar uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w public.webinars;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.seasonal_module_access('webinar',p_cohort)->>'allowed')::boolean THEN RAISE SQLSTATE '42501' USING MESSAGE='webinar not granted'; END IF;
 SELECT * INTO w FROM public.webinars WHERE id=p_webinar AND cohort_id=p_cohort AND status IN ('published','live','ended');
 IF w.id IS NULL OR w.platform_url IS NULL THEN RAISE SQLSTATE 'PT503' USING MESSAGE='provider unavailable'; END IF;
 IF w.status='ended' OR now()<w.starts_at-interval '30 minutes' OR (w.ends_at IS NOT NULL AND now()>=w.ends_at) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='outside webinar window'; END IF;
 RETURN jsonb_build_object('url',w.platform_url,'authorizationCheckedAt',now(),'method','provider_link','providerExpiry','unknown');
END $$;
CREATE FUNCTION public.seasonal_join_webinar(p_cohort uuid,p_webinar uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.join_webinar(p_cohort,p_webinar) $$;
CREATE FUNCTION seasonal_private.assessment_summary(p_cohort uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM seasonal_private.require_admin();
 WITH latest AS (SELECT DISTINCT ON(user_id) user_id,body,submitted_at FROM public.needs_assessment_versions WHERE cohort_id=p_cohort AND submitted_at IS NOT NULL ORDER BY user_id,version DESC),
 interests AS (SELECT i,count(DISTINCT user_id) n FROM latest,jsonb_array_elements_text(body->'interests') i GROUP BY i)
 SELECT jsonb_build_object('submittedCount',(SELECT count(*) FROM latest WHERE submitted_at IS NOT NULL),
 'interests',coalesce((SELECT jsonb_agg(jsonb_build_object('topic',i,'count',n)) FROM interests),'[]'::jsonb),
 'questions',coalesce((SELECT jsonb_agg(body->>'question') FROM latest WHERE submitted_at IS NOT NULL AND btrim(body->>'question')<>''),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.seasonal_assessment_summary(p_cohort uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.assessment_summary(p_cohort) $$;
CREATE FUNCTION seasonal_private.claim_candidates() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE='sign in required'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('registrationRef',r.id,'cohortId',r.cohort_id,'status',r.status)),'[]'::jsonb) INTO result
 FROM public.member_import_rows r JOIN public.member_import_batches b ON b.id=r.batch_id JOIN auth.users a ON a.id=auth.uid()
 WHERE b.approved_at IS NOT NULL AND b.revoked_at IS NULL AND r.status NOT IN ('duplicate','rejected') AND
 ((r.contact_kind='email' AND a.email_confirmed_at IS NOT NULL AND lower(a.email)=r.contact_value) OR
 (r.contact_kind='phone' AND a.phone_confirmed_at IS NOT NULL AND a.phone=r.contact_value));
 RETURN result;
END $$;
CREATE FUNCTION public.seasonal_claim_candidates() RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.claim_candidates() $$;
CREATE FUNCTION seasonal_private.operations(p_body jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; cid uuid; course uuid; st timestamptz; en timestamptz; amount integer; mode text; row_data public.member_import_rows; prior_command jsonb;
BEGIN
 PERFORM seasonal_private.require_admin();
 IF p_body IS NOT NULL AND p_body->>'action'='cancel-cohort' THEN
  IF length(btrim(coalesce(p_body->>'reason','')))<10 OR length(coalesce(p_body->>'idempotencyKey','')) NOT BETWEEN 8 AND 160 THEN RAISE SQLSTATE '22023' USING MESSAGE='cancellation reason and key required'; END IF;
  cid:=(p_body->>'cohortId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended('cancel:'||(p_body->>'idempotencyKey'),0));
  SELECT payload INTO prior_command FROM public.seasonal_events WHERE command_key=p_body->>'idempotencyKey';
  IF prior_command IS NOT NULL AND prior_command->>'fingerprint'<>md5(p_body::text) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency conflict'; END IF;
  IF prior_command IS NULL THEN
   INSERT INTO public.seasonal_events(event_type,actor_id,cohort_id,command_key,payload) VALUES('cohort.cancelled',auth.uid(),cid,p_body->>'idempotencyKey',jsonb_build_object('reason',p_body->>'reason','fingerprint',md5(p_body::text)));
   UPDATE public.course_cohorts SET status='cancelled',registration_open=false WHERE id=cid;
  END IF;
 ELSIF p_body IS NOT NULL AND p_body->>'action'='review' THEN
  IF length(btrim(coalesce(p_body->>'reason','')))<20 THEN RAISE SQLSTATE '22023' USING MESSAGE='independent proof/review reason required'; END IF;
  SELECT * INTO STRICT row_data FROM public.member_import_rows WHERE id=(p_body->>'registrationRef')::bigint FOR UPDATE;
  IF row_data.status='duplicate' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='correction requires a separate revocation or new external ID'; END IF;
  IF row_data.identity_proved_at IS NOT NULL THEN RAISE SQLSTATE 'PT409' USING MESSAGE='claimed registration identity immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=(p_body->>'userId')::uuid AND
   ((row_data.contact_kind='email' AND a.email_confirmed_at IS NOT NULL AND lower(a.email)=row_data.contact_value) OR
   (row_data.contact_kind='phone' AND a.phone_confirmed_at IS NOT NULL AND a.phone=row_data.contact_value))) THEN RAISE SQLSTATE '42501' USING MESSAGE='confirmed contact still required'; END IF;
  UPDATE public.member_import_rows SET status='matched',matched_user_id=(p_body->>'userId')::uuid,identity_evidence='admin-review:'||(p_body->>'reason'),note=p_body->>'reason' WHERE id=row_data.id;
  INSERT INTO public.seasonal_events(event_type,actor_id,user_id,cohort_id,payload) VALUES('registration.identity_reviewed',auth.uid(),(p_body->>'userId')::uuid,row_data.cohort_id,jsonb_build_object('registrationRef',row_data.id,'reason',p_body->>'reason'));
 ELSIF p_body IS NOT NULL AND p_body->>'action'='create-cohort' THEN
  IF length(coalesce(p_body->>'idempotencyKey','')) NOT BETWEEN 8 AND 160 THEN RAISE SQLSTATE '22023' USING MESSAGE='idempotency key required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cohort:'||(p_body->>'idempotencyKey'),0));
  SELECT payload INTO prior_command FROM public.seasonal_events WHERE command_key=p_body->>'idempotencyKey';
  IF prior_command IS NOT NULL THEN
   IF prior_command->>'fingerprint'<>md5(p_body::text) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='idempotency conflict'; END IF;
   RETURN seasonal_private.operations(NULL);
  END IF;
  mode:=p_body->>'calendar'; amount:=(p_body->>'amount')::int; st:=(p_body->>'startsAt')::timestamptz;
  IF mode NOT IN ('gregorian-calendar-months','fixed-days') OR amount NOT BETWEEN 1 AND 366 OR st IS NULL OR length(btrim(p_body->>'title'))<3 OR length(btrim(p_body->>'policyVersion'))<3 THEN RAISE SQLSTATE '22023' USING MESSAGE='explicit policy required'; END IF;
  en:=CASE WHEN mode='fixed-days' THEN st+amount*interval '24 hours' ELSE ((st AT TIME ZONE 'Asia/Tehran')+make_interval(months=>amount)) AT TIME ZONE 'Asia/Tehran' END;
  INSERT INTO public.courses(title,summary) VALUES('مسیر راه سرمایه‌گذاری','وبینار فصلی و همراهی آموزشی دوره') RETURNING id INTO course;
  INSERT INTO public.course_cohorts(course_id,title,starts_at,ends_at,policy_version,policy,module_keys) VALUES(course,p_body->>'title',st,en,p_body->>'policyVersion',jsonb_build_object('commercialEnabled',false,'decision','D-034 OPEN','calendar',mode,'amount',amount),ARRAY['webinar','resources','market-overview','funds']) RETURNING id INTO cid;
  INSERT INTO public.seasonal_events(event_type,actor_id,cohort_id,command_key,payload) VALUES('cohort.draft_created',auth.uid(),cid,p_body->>'idempotencyKey',jsonb_build_object('policyVersion',p_body->>'policyVersion','fingerprint',md5(p_body::text)));
 END IF;
 SELECT jsonb_build_object('cohorts',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.course_cohorts c),'[]'::jsonb),
 'registrations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'cohortId',r.cohort_id,'externalId',r.external_id,'source',r.external_source,'status',r.status,'note',r.note,'contact','***'||right(r.contact_value,3),'matchedUserId',r.matched_user_id)) FROM public.member_import_rows r WHERE cohort_id IS NOT NULL),'[]'::jsonb),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',p.id,'label',coalesce(p.full_name,'حساب')||' · '||left(p.id::text,8))) FROM public.profiles p),'[]'::jsonb),
 'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('grantRef',e.id,'userId',e.user_id,'cohortId',e.cohort_id,'moduleKeys',e.module_keys,'startsAt',e.starts_at,'endsAtExclusive',e.expires_at,'revokedAt',e.revoked_at)) FROM public.entitlements e WHERE cohort_id IS NOT NULL),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT id,event_type,actor_id,cohort_id,occurred_at,payload FROM public.seasonal_events ORDER BY occurred_at DESC LIMIT 100) e),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.seasonal_operations(p_body jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.operations(p_body) $$;
CREATE FUNCTION seasonal_private.admin_webinars() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 PERFORM seasonal_private.require_admin();
 SELECT coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('webinar_registrations',jsonb_build_array(jsonb_build_object('count',(SELECT count(*) FROM public.webinar_registrations r WHERE r.webinar_id=w.id)))) ORDER BY w.starts_at DESC),'[]'::jsonb) INTO result FROM public.webinars w;
 RETURN result;
END $$;
CREATE FUNCTION public.seasonal_admin_webinars() RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.admin_webinars() $$;

-- RLS + explicit minimum grants, including databases with permissive defaults.
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.needs_assessment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_public_read ON public.courses FOR SELECT TO anon USING(status='published');
CREATE POLICY courses_read ON public.courses FOR SELECT TO authenticated USING(status='published' OR public.is_admin());
CREATE POLICY courses_admin ON public.courses FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY cohorts_public_read ON public.course_cohorts FOR SELECT TO anon USING(status='published');
CREATE POLICY cohorts_read ON public.course_cohorts FOR SELECT TO authenticated USING(status='published' OR public.is_admin() OR EXISTS(SELECT 1 FROM public.entitlements e WHERE e.cohort_id=course_cohorts.id AND e.user_id=auth.uid()));
CREATE POLICY cohorts_admin ON public.course_cohorts FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY needs_own ON public.needs_assessment_versions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY resources_member ON public.course_resources FOR SELECT TO authenticated USING(published AND (public.seasonal_module_access(module_key,cohort_id)->>'allowed')::boolean);
CREATE POLICY resources_admin ON public.course_resources FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY seasonal_event_admin ON public.seasonal_events FOR SELECT TO authenticated USING(public.is_admin());
REVOKE ALL ON public.courses,public.course_cohorts,public.needs_assessment_versions,public.course_resources,public.seasonal_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.courses,public.course_cohorts TO anon,authenticated;
GRANT INSERT,UPDATE ON public.courses,public.course_cohorts,public.course_resources TO authenticated;
GRANT SELECT ON public.needs_assessment_versions,public.course_resources,public.seasonal_events TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.courses,public.course_cohorts,public.course_resources TO service_role;
GRANT SELECT,INSERT ON public.needs_assessment_versions,public.seasonal_events TO service_role;
REVOKE ALL ON public.entitlements FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.entitlements TO authenticated,service_role;
-- Raw platform/invite URLs are never exposed by table grants, including direct REST reads.
REVOKE SELECT ON public.webinars FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,title,description,starts_at,ends_at,registration_open,max_capacity,price_toman,platform,status,invites_sent,created_at,updated_at,cohort_id) ON public.webinars TO anon,authenticated;
REVOKE TRUNCATE ON public.webinars,public.webinar_registrations FROM PUBLIC,anon,authenticated,service_role;
REVOKE SELECT ON public.webinar_registrations FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,webinar_id,user_id,payment_status,payment_id,attended,invite_sent,registered_at) ON public.webinar_registrations TO authenticated;
REVOKE INSERT ON public.webinar_registrations FROM anon,authenticated;
-- No direct scoped ledger mutation: only audited commands/claim (legacy admin path remains unscoped).
CREATE POLICY seasonal_entitlement_no_direct_scope ON public.entitlements AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(cohort_id IS NULL);
CREATE POLICY seasonal_entitlement_no_direct_update ON public.entitlements AS RESTRICTIVE FOR UPDATE TO authenticated USING(cohort_id IS NULL) WITH CHECK(cohort_id IS NULL);
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='seasonal_private' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION seasonal_private.require_admin(),seasonal_private.preview_import(uuid,text,text,text,jsonb),seasonal_private.commit_import(bigint,text),seasonal_private.claim_registration(bigint),seasonal_private.save_needs(uuid,integer,jsonb,boolean),seasonal_private.access_command(jsonb),seasonal_private.join_webinar(uuid,uuid),seasonal_private.assessment_summary(uuid),seasonal_private.claim_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION seasonal_private.operations(jsonb),seasonal_private.admin_webinars() TO authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'seasonal_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
-- Existing global full access ignores seasonal scopes; consulting consent is never inferred here.
CREATE OR REPLACE FUNCTION public.fn_user_access(p_user uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND role='admin') OR
 EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user AND cohort_id IS NULL AND revoked_at IS NULL AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now())) THEN 'full' ELSE 'registered' END $$;
-- Prevent the old phase27 service RPC from converting scoped import rows into global grants.
ALTER FUNCTION public.grant_member_access(bigint,text) RENAME TO grant_legacy_member_access;
CREATE FUNCTION seasonal_private.legacy_grant(p_row_id bigint,p_kind text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM seasonal_private.require_admin();
 IF EXISTS(SELECT 1 FROM public.member_import_rows WHERE id=p_row_id AND cohort_id IS NOT NULL) THEN RAISE SQLSTATE '42501' USING MESSAGE='use seasonal verified claim'; END IF;
 RETURN public.grant_legacy_member_access(p_row_id,p_kind);
END $$;
CREATE FUNCTION public.grant_member_access(p_row_id bigint,p_kind text DEFAULT 'consulting') RETURNS bigint LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.legacy_grant(p_row_id,p_kind) $$;
REVOKE ALL ON FUNCTION seasonal_private.legacy_grant(bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA seasonal_private TO service_role;
GRANT EXECUTE ON FUNCTION seasonal_private.legacy_grant(bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.grant_member_access(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_member_access(bigint,text) TO service_role;
-- The renamed legacy implementation is not a second exposed mutation route.
REVOKE ALL ON FUNCTION public.grant_legacy_member_access(bigint,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.member_has_active_access(p_user_id uuid,p_kind text DEFAULT 'consulting') RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND kind=p_kind AND cohort_id IS NULL AND revoked_at IS NULL AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now())) $$;
CREATE OR REPLACE FUNCTION public.member_has_outstanding_access(p_user_id uuid,p_kind text DEFAULT 'consulting') RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=p_user_id AND kind=p_kind AND cohort_id IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) $$;
-- The legacy webinar registration/payment flow cannot activate a seasonal policy implicitly.
ALTER FUNCTION public.register_for_webinar(uuid) RENAME TO register_legacy_for_webinar;
CREATE FUNCTION seasonal_private.legacy_webinar_registration(p_webinar uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE='sign in required'; END IF;
 IF EXISTS(SELECT 1 FROM public.webinars WHERE id=p_webinar AND cohort_id IS NOT NULL) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='seasonal commercial registration not enabled; use verified external registration'; END IF;
 RETURN public.register_legacy_for_webinar(p_webinar);
END $$;
CREATE FUNCTION public.register_for_webinar(p_webinar_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT seasonal_private.legacy_webinar_registration(p_webinar_id) $$;
REVOKE ALL ON FUNCTION public.register_legacy_for_webinar(uuid),seasonal_private.legacy_webinar_registration(uuid),public.register_for_webinar(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION seasonal_private.legacy_webinar_registration(uuid),public.register_for_webinar(uuid) TO authenticated;
CREATE FUNCTION seasonal_private.guard_seasonal_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.cohort_id IS NULL AND to_jsonb(NEW)->>'payment_id' IS NOT NULL AND EXISTS
 (SELECT 1 FROM public.webinar_registrations r JOIN public.webinars w ON w.id=r.webinar_id WHERE w.cohort_id IS NOT NULL AND r.payment_id::text=to_jsonb(NEW)->>'payment_id')
 THEN RAISE SQLSTATE '42501' USING MESSAGE='seasonal payment policy not activated'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION seasonal_private.guard_seasonal_payment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER seasonal_payment_containment BEFORE INSERT ON public.entitlements FOR EACH ROW EXECUTE FUNCTION seasonal_private.guard_seasonal_payment();
CREATE FUNCTION seasonal_private.storage_allowed(p_bucket text,p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_bucket<>'course-private' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.course_resources r WHERE r.storage_bucket=p_bucket AND r.storage_path=p_name AND r.published AND (public.seasonal_module_access(r.module_key,r.cohort_id)->>'allowed')::boolean);
END $$;
REVOKE ALL ON FUNCTION seasonal_private.storage_allowed(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA seasonal_private TO anon;
GRANT EXECUTE ON FUNCTION seasonal_private.storage_allowed(text,text) TO anon,authenticated;
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public) VALUES('course-private','course-private',false) ON CONFLICT(id) DO UPDATE SET public=false;
  EXECUTE $p$ CREATE POLICY seasonal_storage_scope ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING
   (bucket_id<>'course-private' OR seasonal_private.storage_allowed(bucket_id,name)) $p$;
  EXECUTE $p$ CREATE POLICY seasonal_storage_read ON storage.objects FOR SELECT TO authenticated USING
   (bucket_id='course-private' AND seasonal_private.storage_allowed(bucket_id,name)) $p$;
 END IF;
END $$;
COMMIT;
