-- Additive consultation workflow. No financial writers, roles, members or registry are seeded here.
-- Standalone reviewed installer, not migration-history replay. Native auth, canonical finance and research prerequisites.
BEGIN;
DO $$ BEGIN
 IF to_regnamespace('consultation_private') IS NOT NULL OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'consultation_%')
 OR to_regprocedure('public.command_consultation(jsonb)') IS NOT NULL OR to_regprocedure('public.load_consultation(uuid,date,date)') IS NOT NULL THEN RAISE EXCEPTION 'consultation collision' USING ERRCODE='55000'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regclass('public.member_holding_versions') IS NULL OR to_regclass('public.member_debt_positions') IS NULL
 OR to_regclass('public.member_cash_flow_versions') IS NULL OR to_regclass('public.member_cash_flow_entries') IS NULL OR to_regclass('public.member_goals_versions') IS NULL
 OR to_regclass('public.research_workbook_versions') IS NULL OR to_regclass('public.research_workbook_reviews') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'consultation prerequisites missing' USING ERRCODE='55000'; END IF;
END $$;
CREATE SCHEMA consultation_private;
REVOKE ALL ON SCHEMA consultation_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION consultation_private.keys(p jsonb,allowed text[],required text[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT k=ANY(allowed))
  OR EXISTS(SELECT 1 FROM unnest(required) k WHERE NOT p ? k) THEN
  RAISE EXCEPTION 'invalid consultation object keys' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION consultation_private.txt(p jsonb,maximum integer,nullable boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'consultation text required' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p)<>'string' THEN RAISE EXCEPTION 'invalid consultation text' USING ERRCODE='22023'; END IF;
 -- Same ECMAScript whitespace as the browser/server String.trim().
 s:=btrim(p#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF s='' AND nullable THEN RETURN NULL; END IF;
 IF length(s) NOT BETWEEN 1 AND maximum THEN RAISE EXCEPTION 'invalid consultation text length' USING ERRCODE='22023'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION consultation_private.day(p jsonb,nullable boolean DEFAULT false) RETURNS date
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; d date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'consultation date required' USING ERRCODE='22023';
 END IF;
 s:=consultation_private.txt(p,10);
 IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid consultation calendar day' USING ERRCODE='22023'; END IF;
 BEGIN d:=s::date; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'invalid consultation calendar day' USING ERRCODE='22023';
 END;
 IF to_char(d,'YYYY-MM-DD')<>s THEN RAISE EXCEPTION 'invalid consultation calendar day' USING ERRCODE='22023'; END IF;
 RETURN d;
END $$;
CREATE FUNCTION consultation_private.amount(p jsonb,signed boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE n numeric; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p)<>'number' THEN RAISE EXCEPTION 'consultation amount must be canonical integer toman' USING ERRCODE='22023'; END IF;
 n:=(p::text)::numeric;
 IF n<>trunc(n) OR n>9007199254740991 OR n<(CASE WHEN signed THEN -9007199254740991 ELSE 0 END) THEN
  RAISE EXCEPTION 'invalid consultation amount' USING ERRCODE='22023';
 END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION consultation_private.source(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE label text; observed date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 PERFORM consultation_private.keys(p,ARRAY['label','observedOn'],ARRAY['label','observedOn']);
 label:=consultation_private.txt(p->'label',160); observed:=consultation_private.day(p->'observedOn');
 IF lower(label) IN ('unknown','نامشخص','-','—') THEN RAISE EXCEPTION 'consultation source unknown' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('label',label,'observedOn',observed);
END $$;

CREATE FUNCTION consultation_private.uid(p jsonb,nullable boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s text; BEGIN
 IF p='null'::jsonb AND nullable THEN RETURN NULL; END IF;
 s:=consultation_private.txt(p,36);
 IF s !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'invalid uuid' USING ERRCODE='22023'; END IF; RETURN s::uuid;
END $$;
CREATE FUNCTION consultation_private.period(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a date;b date;BEGIN
 PERFORM consultation_private.keys(p,ARRAY['startOn','endOn'],ARRAY['startOn','endOn']);
 a:=consultation_private.day(p->'startOn');b:=consultation_private.day(p->'endOn');
 IF b-a NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'invalid period' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('startOn',a,'endOn',b);
END $$;
CREATE FUNCTION consultation_private.body(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b jsonb;e jsonb;a jsonb;ids uuid[]:='{}';action_ids uuid[]:='{}';u uuid;link text;ev jsonb:='[]';acts jsonb:='[]';research jsonb:='[]';responsible text;
BEGIN
 PERFORM consultation_private.keys(p,ARRAY['topic','goal','clientSummary','rationale','limitations','reviewOn','basis','researchVersionIds','evidence','actions'],ARRAY['topic','goal','clientSummary','rationale','limitations','reviewOn','basis','researchVersionIds','evidence','actions']);
 b:=p->'basis';PERFORM consultation_private.keys(b,ARRAY['holdingsVersionId','cashFlowPeriod','cashFlowVersionId','goalsVersionId'],ARRAY['holdingsVersionId','cashFlowPeriod','cashFlowVersionId','goalsVersionId']);
 b:=jsonb_build_object('holdingsVersionId',consultation_private.uid(b->'holdingsVersionId',true),'cashFlowPeriod',consultation_private.period(b->'cashFlowPeriod'),'cashFlowVersionId',consultation_private.uid(b->'cashFlowVersionId',true),'goalsVersionId',consultation_private.uid(b->'goalsVersionId',true));
 IF jsonb_typeof(p->'researchVersionIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'researchVersionIds')>10 OR jsonb_typeof(p->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'evidence') NOT BETWEEN 1 AND 20 OR jsonb_typeof(p->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'actions')>20 THEN RAISE EXCEPTION 'invalid body lists' USING ERRCODE='22023';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'researchVersionIds') LOOP
  u:=consultation_private.uid(e);IF u=ANY(ids) THEN RAISE EXCEPTION 'duplicate research' USING ERRCODE='22023';END IF;ids:=array_append(ids,u);research:=research||jsonb_build_array(u);
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'evidence') LOOP
  PERFORM consultation_private.keys(e,ARRAY['label','url','asOf'],ARRAY['label','url','asOf']);
  link:=consultation_private.txt(e->'url',1000,true);
  -- Provenance links only; no network fetching. Reject credentials, whitespace, backslashes and non-HTTP schemes.
  IF link IS NOT NULL AND (link !~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z]([a-z0-9-]*[a-z0-9])?(/.*)?$' OR link ~ '[^!-~]' OR position(chr(92) in link)>0 OR split_part(split_part(lower(link),'://',2),'/',1) ~ '(^|\.)xn--') THEN RAISE EXCEPTION 'invalid evidence url' USING ERRCODE='22023';END IF;
  ev:=ev||jsonb_build_array(jsonb_build_object('label',consultation_private.txt(e->'label',300),'url',link,'asOf',consultation_private.day(e->'asOf')));
 END LOOP;
 FOR a IN SELECT value FROM jsonb_array_elements(p->'actions') LOOP
  PERFORM consultation_private.keys(a,ARRAY['actionKey','title','dueOn','responsible'],ARRAY['actionKey','title','dueOn','responsible']);
  u:=consultation_private.uid(a->'actionKey');responsible:=consultation_private.txt(a->'responsible',7);
  IF u=ANY(action_ids) OR responsible NOT IN ('member','advisor') THEN RAISE EXCEPTION 'invalid action' USING ERRCODE='22023';END IF;action_ids:=array_append(action_ids,u);
  acts:=acts||jsonb_build_array(jsonb_build_object('actionKey',u,'title',consultation_private.txt(a->'title',1000),'dueOn',consultation_private.day(a->'dueOn'),'responsible',responsible));
 END LOOP;
 RETURN jsonb_build_object('topic',consultation_private.txt(p->'topic',300),'goal',consultation_private.txt(p->'goal',2000),'clientSummary',consultation_private.txt(p->'clientSummary',10000),'rationale',consultation_private.txt(p->'rationale',6000),'limitations',consultation_private.txt(p->'limitations',4000),'reviewOn',consultation_private.day(p->'reviewOn'),'basis',b,'researchVersionIds',research,'evidence',ev,'actions',acts);
END $$;
CREATE FUNCTION consultation_private.command(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;b bigint;result jsonb;status text;message text;fingerprint text;
BEGIN
 k:=consultation_private.txt(p->'kind',10);
 IF k='grant' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','advisorId','clientLabel'],ARRAY['kind','advisorId','clientLabel']);
  RETURN jsonb_build_object('kind',k,'advisorId',consultation_private.uid(p->'advisorId'),'clientLabel',consultation_private.txt(p->'clientLabel',120));
 END IF;
 result:=jsonb_build_object('kind',k,'relationshipId',consultation_private.uid(p->'relationshipId'));
 IF k='revoke' THEN PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId'],ARRAY['kind','relationshipId']);RETURN result;
 ELSIF k='save' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionKey','baseVersion','body','privateNote'],ARRAY['kind','relationshipId','sessionKey','baseVersion','body','privateNote']);
  b:=consultation_private.amount(p->'baseVersion');IF b IS NULL OR b>2147483646 THEN RAISE EXCEPTION 'invalid base' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionKey',consultation_private.uid(p->'sessionKey'),'baseVersion',b,'body',consultation_private.body(p->'body'),'privateNote',consultation_private.txt(p->'privateNote',10000,true));
 ELSIF k IN ('submit','approve','publish','withdraw') THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionId','contentHash','note'],ARRAY['kind','relationshipId','sessionId','contentHash','note']);
  fingerprint:=consultation_private.txt(p->'contentHash',64);IF fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid hash' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionId',consultation_private.uid(p->'sessionId'),'contentHash',fingerprint,'note',consultation_private.txt(p->'note',2000,true));
 ELSIF k='feedback' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionId','actionKey','baseVersion','status','text'],ARRAY['kind','relationshipId','sessionId','actionKey','baseVersion','status','text']);
  b:=consultation_private.amount(p->'baseVersion');status:=consultation_private.txt(p->'status',12);message:=consultation_private.txt(p->'text',2000,true);
  IF b IS NULL OR b>2147483646 OR status NOT IN ('viewed','acknowledged','doing','done','question') OR (status='question' AND message IS NULL) THEN RAISE EXCEPTION 'invalid feedback' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionId',consultation_private.uid(p->'sessionId'),'actionKey',consultation_private.uid(p->'actionKey',true),'baseVersion',b,'status',status,'text',message);
 END IF;
 RAISE EXCEPTION 'unknown command' USING ERRCODE='22023';
END $$;
CREATE TABLE public.consultation_advisors(user_id uuid PRIMARY KEY REFERENCES auth.users(id),display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),enabled boolean NOT NULL DEFAULT true,is_owner boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX consultation_one_owner ON public.consultation_advisors(is_owner) WHERE is_owner;
CREATE TABLE public.consultation_relationships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES auth.users(id),advisor_id uuid NOT NULL REFERENCES public.consultation_advisors(user_id),client_label text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(client_id<>advisor_id));
CREATE INDEX consultation_client ON public.consultation_relationships(client_id);
CREATE INDEX consultation_advisor ON public.consultation_relationships(advisor_id);
CREATE TABLE public.consultation_revocations(relationship_id uuid PRIMARY KEY REFERENCES public.consultation_relationships(id),actor_id uuid NOT NULL REFERENCES auth.users(id),revoked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.consultation_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),session_key uuid NOT NULL,version integer NOT NULL CHECK(version>0),body jsonb NOT NULL,content_hash text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(relationship_id,session_key,version));
CREATE TABLE public.consultation_private_notes(session_id uuid PRIMARY KEY REFERENCES public.consultation_sessions(id),note text);
CREATE TABLE public.consultation_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,session_id uuid NOT NULL REFERENCES public.consultation_sessions(id),kind text NOT NULL CHECK(kind IN ('submit','approve','publish','withdraw')),actor_id uuid NOT NULL REFERENCES auth.users(id),note text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,kind));
CREATE TABLE public.consultation_publications(session_id uuid PRIMARY KEY REFERENCES public.consultation_sessions(id),approval_id uuid NOT NULL REFERENCES public.consultation_events(id),actor_id uuid NOT NULL REFERENCES auth.users(id),published_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.consultation_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.consultation_sessions(id),action_key uuid,version integer NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('viewed','acknowledged','doing','done','question')),text text,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX consultation_feedback_versions ON public.consultation_actions(session_id,action_key,version) NULLS NOT DISTINCT;
CREATE TABLE public.consultation_command_receipts(actor_id uuid NOT NULL REFERENCES auth.users(id),client_token text NOT NULL,content_hash text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,client_token));
CREATE FUNCTION consultation_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'immutable consultation history' USING ERRCODE='42501';END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['consultation_advisors','consultation_relationships','consultation_revocations','consultation_sessions','consultation_private_notes','consultation_events','consultation_publications','consultation_actions','consultation_command_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t<>'consultation_advisors' THEN
   EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation()',t);
   EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION consultation_private.reject_mutation()',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.consultation_events_event_no_seq FROM PUBLIC,anon,authenticated,service_role;
-- Table reads/writes default-deny; the only application access is the actor-scoped public RPC pair.
CREATE FUNCTION consultation_private.access(r public.consultation_relationships,active boolean DEFAULT false,advisor_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (NOT active OR NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id)) AND
 ((NOT advisor_only AND r.client_id=auth.uid()) OR (r.advisor_id=auth.uid() AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id) AND EXISTS(SELECT FROM public.consultation_advisors a WHERE a.user_id=r.advisor_id AND a.enabled)));
$$;
CREATE FUNCTION consultation_private.state(s uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT CASE kind WHEN 'submit' THEN 'submitted' WHEN 'approve' THEN 'approved' WHEN 'publish' THEN 'published' ELSE 'withdrawn' END FROM public.consultation_events WHERE session_id=s ORDER BY event_no DESC LIMIT 1),'draft');
$$;
CREATE FUNCTION consultation_private.basis_current(client uuid,b jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE h uuid;c uuid;g uuid;start_day date:=(b->'cashFlowPeriod'->>'startOn')::date;end_day date:=(b->'cashFlowPeriod'->>'endOn')::date;
BEGIN
 -- Same keys as all three canonical writers. Lock order is fixed; no financial writer calls consultation.
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(client::text));
 PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||client::text),hashtext(start_day::text||':'||end_day::text));
 PERFORM pg_advisory_xact_lock(hashtext('member_goals'),hashtext(client::text));
 SELECT id INTO h FROM public.member_holding_versions WHERE user_id=client ORDER BY version DESC LIMIT 1;
 SELECT id INTO c FROM public.member_cash_flow_versions WHERE user_id=client AND period_start=start_day AND period_end=end_day ORDER BY version DESC LIMIT 1;
 SELECT id INTO g FROM public.member_goals_versions WHERE user_id=client ORDER BY version DESC LIMIT 1;
 IF h IS DISTINCT FROM (b->>'holdingsVersionId')::uuid OR c IS DISTINCT FROM (b->>'cashFlowVersionId')::uuid OR g IS DISTINCT FROM (b->>'goalsVersionId')::uuid THEN RAISE EXCEPTION 'financial basis changed' USING ERRCODE='PT409';END IF;
END $$;
CREATE FUNCTION consultation_private.research_current(ids jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $$DECLARE item jsonb;BEGIN
 IF jsonb_array_length(ids)>0 THEN LOCK TABLE public.research_workbook_versions,public.research_workbook_reviews IN SHARE MODE;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(ids) LOOP
  IF NOT EXISTS(SELECT FROM public.research_workbook_versions w WHERE w.id=(item#>>'{}')::uuid AND NOT EXISTS(SELECT FROM public.research_workbook_versions newer WHERE newer.workbook_id=w.workbook_id AND newer.version>w.version) AND (SELECT decision FROM public.research_workbook_reviews r WHERE r.version_id=w.id ORDER BY reviewed_at DESC,id DESC LIMIT 1)='approved_internal' AND NOT EXISTS(SELECT FROM public.research_workbook_reviews rejected WHERE rejected.version_id=w.id AND rejected.decision='returned' AND rejected.reviewed_at>=(SELECT max(accepted.reviewed_at) FROM public.research_workbook_reviews accepted WHERE accepted.version_id=w.id AND accepted.decision='approved_internal'))) THEN RAISE EXCEPTION 'research unavailable or not approved' USING ERRCODE='22023';END IF;
 END LOOP;
END $$;
CREATE FUNCTION consultation_private.execute(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();c jsonb;k text;token text;fingerprint text;prior_receipt public.consultation_command_receipts;r public.consultation_relationships;s public.consultation_sessions;prior integer;result_id uuid;result_version integer:=1;result jsonb;state text;approval uuid;action jsonb;key uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 PERFORM consultation_private.keys(p,ARRAY['contractVersion','expectedActorId','clientToken','command'],ARRAY['contractVersion','expectedActorId','clientToken','command']);
 IF p->>'contractVersion' IS DISTINCT FROM 'consultation-request.v1' OR octet_length(p::text)>150000 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 IF consultation_private.uid(p->'expectedActorId')<>actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501';END IF;
 token:=consultation_private.txt(p->'clientToken',200);c:=consultation_private.command(p->'command');k:=c->>'kind';
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));
 IF k='grant' THEN
  PERFORM pg_advisory_xact_lock(hashtext('consultation_consent'),hashtext(actor::text||':'||(c->>'advisorId')));
  IF actor=(c->>'advisorId')::uuid OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=(c->>'advisorId')::uuid AND enabled AND is_owner) THEN RAISE EXCEPTION 'advisor unavailable' USING ERRCODE='42501';END IF;
 ELSE
  IF k='revoke' THEN
   SELECT * INTO r FROM public.consultation_relationships WHERE id=(c->>'relationshipId')::uuid;
   IF r.id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('consultation_consent'),hashtext(r.client_id::text||':'||r.advisor_id::text));END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(c->>'relationshipId'));
  SELECT * INTO r FROM public.consultation_relationships WHERE id=(c->>'relationshipId')::uuid;
  IF r.id IS NULL OR NOT consultation_private.access(r,k<>'revoke',k IN ('save','submit','approve','publish','withdraw')) THEN RAISE EXCEPTION 'relationship forbidden' USING ERRCODE='42501';END IF;
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',actor,'command',c)::text,'UTF8')),'hex');
 SELECT * INTO prior_receipt FROM public.consultation_command_receipts WHERE actor_id=actor AND client_token=token;
 IF FOUND THEN
  IF prior_receipt.content_hash<>fingerprint THEN RAISE EXCEPTION 'token conflict' USING ERRCODE='PT409';END IF;
  RETURN prior_receipt.receipt||jsonb_build_object('reused',true);
 END IF;
 IF k='grant' THEN
  SELECT * INTO r FROM public.consultation_relationships WHERE client_id=actor AND advisor_id=(c->>'advisorId')::uuid AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=consultation_relationships.id);
  IF r.id IS NOT NULL AND r.client_label<>c->>'clientLabel' THEN RAISE EXCEPTION 'existing consent label differs' USING ERRCODE='PT409';END IF;
  IF r.id IS NULL THEN INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES(actor,(c->>'advisorId')::uuid,c->>'clientLabel') RETURNING * INTO r;END IF;result_id:=r.id;
 ELSIF k='revoke' THEN
  INSERT INTO public.consultation_revocations(relationship_id,actor_id) VALUES(r.id,actor) ON CONFLICT DO NOTHING;result_id:=r.id;
 ELSIF k='save' THEN
  SELECT coalesce(max(version),0) INTO prior FROM public.consultation_sessions WHERE relationship_id=r.id AND session_key=(c->>'sessionKey')::uuid;
  IF prior<>(c->>'baseVersion')::integer THEN RAISE EXCEPTION 'draft version changed' USING ERRCODE='PT409';END IF;
  PERFORM consultation_private.basis_current(r.client_id,c->'body'->'basis');PERFORM consultation_private.research_current(c->'body'->'researchVersionIds');
  result_version:=prior+1;
  INSERT INTO public.consultation_sessions(relationship_id,session_key,version,body,content_hash,actor_id) VALUES(r.id,(c->>'sessionKey')::uuid,result_version,c->'body',encode(sha256(convert_to((c->'body')::text,'UTF8')),'hex'),actor) RETURNING id INTO result_id;
  INSERT INTO public.consultation_private_notes(session_id,note) VALUES(result_id,c->>'privateNote');
 ELSE
  SELECT * INTO s FROM public.consultation_sessions WHERE id=(c->>'sessionId')::uuid AND relationship_id=r.id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'version forbidden' USING ERRCODE='42501';END IF;
  state:=consultation_private.state(s.id);result_version:=s.version;
  IF k='feedback' THEN
   IF NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=s.id) OR state='withdrawn' THEN RAISE EXCEPTION 'publication unavailable' USING ERRCODE='42501';END IF;
   key:=(c->>'actionKey')::uuid;
   IF key IS NOT NULL THEN SELECT value INTO action FROM jsonb_array_elements(s.body->'actions') WHERE value->>'actionKey'=key::text;IF action IS NULL THEN RAISE EXCEPTION 'unknown action' USING ERRCODE='22023';END IF;END IF;
   IF c->>'status' IN ('doing','done') THEN
    IF action IS NULL OR (action->>'responsible'='member' AND actor<>r.client_id) OR (action->>'responsible'='advisor' AND actor<>r.advisor_id) THEN RAISE EXCEPTION 'action actor forbidden' USING ERRCODE='42501';END IF;
   ELSIF actor<>r.client_id THEN RAISE EXCEPTION 'member feedback only' USING ERRCODE='42501';END IF;
   SELECT coalesce(max(version),0) INTO prior FROM public.consultation_actions WHERE session_id=s.id AND action_key IS NOT DISTINCT FROM key;
   IF prior<>(c->>'baseVersion')::integer THEN RAISE EXCEPTION 'feedback version changed' USING ERRCODE='PT409';END IF;result_version:=prior+1;
   INSERT INTO public.consultation_actions(session_id,action_key,version,status,text,actor_id) VALUES(s.id,key,result_version,c->>'status',c->>'text',actor) RETURNING id INTO result_id;
  ELSE
   IF s.content_hash<>c->>'contentHash' OR (k<>'withdraw' AND EXISTS(SELECT FROM public.consultation_sessions WHERE relationship_id=r.id AND session_key=s.session_key AND version>s.version)) THEN RAISE EXCEPTION 'recommendation changed' USING ERRCODE='PT409';END IF;
   IF (k='submit' AND state<>'draft') OR (k='approve' AND state<>'submitted') OR (k='publish' AND state<>'approved') OR (k='withdraw' AND state NOT IN ('submitted','approved','published')) THEN RAISE EXCEPTION 'workflow state changed' USING ERRCODE='PT409';END IF;
   IF k='approve' AND NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner) THEN RAISE EXCEPTION 'owner approval required' USING ERRCODE='42501';END IF;
   IF k IN ('approve','publish') THEN
    PERFORM consultation_private.basis_current(r.client_id,s.body->'basis');PERFORM consultation_private.research_current(s.body->'researchVersionIds');
    IF (s.body->>'reviewOn')::date<(now() AT TIME ZONE 'Asia/Tehran')::date THEN RAISE EXCEPTION 'review overdue' USING ERRCODE='22023';END IF;
   END IF;
   IF k='publish' THEN
    SELECT e.id INTO approval FROM public.consultation_events e JOIN public.consultation_advisors a ON a.user_id=e.actor_id AND a.enabled AND a.is_owner WHERE e.session_id=s.id AND e.kind='approve';
    IF approval IS NULL THEN RAISE EXCEPTION 'owner approval unavailable' USING ERRCODE='42501';END IF;
    INSERT INTO public.consultation_publications(session_id,approval_id,actor_id) VALUES(s.id,approval,actor);
   END IF;
   INSERT INTO public.consultation_events(session_id,kind,actor_id,note) VALUES(s.id,k,actor,c->>'note') RETURNING id INTO result_id;
  END IF;
 END IF;
 result:=jsonb_build_object('contractVersion','consultation-write.v1','actorId',actor,'clientToken',token,'command',c,'id',result_id,'version',result_version,'reused',false,'canonicalContentHash',fingerprint);
 INSERT INTO public.consultation_command_receipts(actor_id,client_token,content_hash,receipt) VALUES(actor,token,fingerprint,result);
 RETURN result;
END $$;
CREATE FUNCTION consultation_private.relation_json(r public.consultation_relationships) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'clientId',r.client_id,'advisorId',r.advisor_id,'clientLabel',r.client_label,'createdAt',r.created_at,'revoked',EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id));
$$;
CREATE FUNCTION consultation_private.load(p_relation uuid,p_start_on date,p_end_on date) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();r public.consultation_relationships;actor_json jsonb;advisors jsonb;relations jsonb;selected jsonb:=null;dossier jsonb:=null;basis jsonb;h public.member_holding_versions;c public.member_cash_flow_versions;g public.member_goals_versions;holdings jsonb:=null;cashflow jsonb:=null;goals jsonb:=null;sessions jsonb:='[]';notes jsonb:='[]';events jsonb:='[]';actions jsonb:='[]';session_ids uuid[]:='{}';is_advisor boolean;start_day date;end_day date;counted integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 IF (p_start_on IS NULL)<>(p_end_on IS NULL) THEN RAISE EXCEPTION 'period pair required' USING ERRCODE='22023';END IF;
 start_day:=coalesce(p_start_on,date_trunc('month',now() AT TIME ZONE 'Asia/Tehran')::date);end_day:=coalesce(p_end_on,(start_day+interval '1 month'-interval '1 day')::date);
 PERFORM consultation_private.period(jsonb_build_object('startOn',start_day,'endOn',end_day));
 actor_json:=jsonb_build_object('id',actor,'isAdvisor',EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled),'isOwner',EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',user_id,'displayName',display_name,'isOwner',is_owner) ORDER BY user_id),'[]') INTO advisors FROM public.consultation_advisors WHERE enabled AND is_owner;
 SELECT count(*) INTO counted FROM public.consultation_relationships x WHERE consultation_private.access(x);
 IF counted>100 THEN RAISE EXCEPTION 'relationship read bound exceeded' USING ERRCODE='54000';END IF;
 SELECT coalesce(jsonb_agg(consultation_private.relation_json(x) ORDER BY created_at DESC,id),'[]') INTO relations FROM public.consultation_relationships x WHERE consultation_private.access(x);
 IF p_relation IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
  SELECT * INTO r FROM public.consultation_relationships WHERE id=p_relation;
  IF r.id IS NULL OR NOT consultation_private.access(r) THEN RAISE EXCEPTION 'relationship forbidden' USING ERRCODE='42501';END IF;
  selected:=consultation_private.relation_json(r);is_advisor:=r.advisor_id=actor;
  -- Serialize the chosen financial versions with the same canonical write locks.
  PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(r.client_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||r.client_id::text),hashtext(start_day::text||':'||end_day::text));
  PERFORM pg_advisory_xact_lock(hashtext('member_goals'),hashtext(r.client_id::text));
  SELECT * INTO h FROM public.member_holding_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO c FROM public.member_cash_flow_versions WHERE user_id=r.client_id AND period_start=start_day AND period_end=end_day ORDER BY version DESC LIMIT 1;
  SELECT * INTO g FROM public.member_goals_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  basis:=jsonb_build_object('holdingsVersionId',h.id,'cashFlowPeriod',jsonb_build_object('startOn',start_day,'endOn',end_day),'cashFlowVersionId',c.id,'goalsVersionId',g.id);
  IF h.id IS NOT NULL THEN
   IF (SELECT count(*) FROM public.member_holding_positions WHERE version_id=h.id)>500 OR (SELECT count(*) FROM public.member_debt_positions WHERE version_id=h.id)>500 THEN RAISE EXCEPTION 'financial read bound exceeded' USING ERRCODE='54000';END IF;
   holdings:=jsonb_build_object('id',h.id,'version',h.version,
    'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',position_key,'title',coalesce(title,manual_label,symbol,position_key),'quantity',qty::text,'unit',unit,'ownershipPercent',ownership_pct::text,'declaredValueToman',declared_value,'source',valuation_source,'asOf',coalesce(valuation_as_of,as_of)) ORDER BY position_key),'[]') FROM public.member_holding_positions WHERE version_id=h.id),
    'debts',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',debt_key,'title',title,'balanceToman',balance_toman,'balanceAsOf',balance_as_of,'nextInstallmentToman',next_installment_toman,'nextDueOn',next_due_on) ORDER BY debt_key),'[]') FROM public.member_debt_positions WHERE version_id=h.id));
  END IF;
  IF c.id IS NOT NULL THEN
   IF (SELECT count(*) FROM public.member_cash_flow_entries WHERE version_id=c.id)<>c.entry_count OR c.entry_count>500 THEN RAISE EXCEPTION 'cashflow incomplete' USING ERRCODE='54000';END IF;
   cashflow:=jsonb_build_object('id',c.id,'version',c.version,'payload',jsonb_build_object('contractVersion',1,'period',basis->'cashFlowPeriod','accountDefinitions',c.account_definitions,'scopeAccountKeys',c.scope_account_keys,'opening',c.opening,'coverage',c.coverage,'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('entryKey',e.entry_key,'basis',e.basis,'kind',e.kind,'amountToman',e.amount_toman,'occurredOn',e.occurred_on,'source',e.source,'category',e.category,'note',e.note)||CASE WHEN e.kind='transfer' THEN jsonb_build_object('fromAccountKey',e.from_account_key,'toAccountKey',e.to_account_key) ELSE jsonb_build_object('accountKey',e.account_key) END ORDER BY e.entry_key),'[]') FROM public.member_cash_flow_entries e WHERE e.version_id=c.id)));
  END IF;
  IF g.id IS NOT NULL THEN goals:=jsonb_build_object('id',g.id,'version',g.version,'payload',g.payload);END IF;
  dossier:=jsonb_build_object('basis',basis,'holdings',holdings,'cashFlow',cashflow,'goals',goals);
  SELECT count(*),array_agg(s.id) INTO counted,session_ids FROM public.consultation_sessions s WHERE relationship_id=r.id AND (is_advisor OR EXISTS(SELECT FROM public.consultation_publications p WHERE p.session_id=s.id));
  IF counted>100 THEN RAISE EXCEPTION 'session read bound exceeded' USING ERRCODE='54000';END IF;session_ids:=coalesce(session_ids,'{}');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'relationshipId',relationship_id,'sessionKey',session_key,'version',version,'createdAt',created_at,'actorId',actor_id,'contentHash',content_hash,'body',body,'state',consultation_private.state(s.id),'approval',(SELECT jsonb_build_object('actorId',e.actor_id,'createdAt',e.created_at) FROM public.consultation_events e WHERE e.session_id=s.id AND kind='approve')) ORDER BY created_at DESC,s.id),'[]') INTO sessions FROM public.consultation_sessions s WHERE s.id=ANY(session_ids);
  IF is_advisor THEN SELECT coalesce(jsonb_agg(jsonb_build_object('sessionId',session_id,'note',note) ORDER BY session_id),'[]') INTO notes FROM public.consultation_private_notes WHERE session_id=ANY(session_ids);END IF;
  SELECT count(*) INTO counted FROM public.consultation_events WHERE session_id=ANY(session_ids) AND (is_advisor OR kind IN ('publish','withdraw'));IF counted>400 THEN RAISE EXCEPTION 'event read bound exceeded' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'kind',kind,'actorId',actor_id,'createdAt',created_at,'note',CASE WHEN is_advisor THEN note ELSE null END) ORDER BY event_no),'[]') INTO events FROM public.consultation_events WHERE session_id=ANY(session_ids) AND (is_advisor OR kind IN ('publish','withdraw'));
  SELECT count(*) INTO counted FROM public.consultation_actions WHERE session_id=ANY(session_ids);IF counted>500 THEN RAISE EXCEPTION 'feedback read bound exceeded' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'actionKey',action_key,'version',version,'status',status,'text',text,'actorId',actor_id,'createdAt',created_at) ORDER BY created_at,id),'[]') INTO actions FROM public.consultation_actions WHERE session_id=ANY(session_ids);
 END IF;
 RETURN jsonb_build_object('contractVersion','consultation-read.v1','actor',actor_json,'advisors',advisors,'relationships',relations,'selected',selected,'dossier',dossier,'sessions',sessions,'notes',notes,'events',events,'actions',actions);
END $$;
CREATE FUNCTION public.command_consultation(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT consultation_private.execute(p_request); $$;
CREATE FUNCTION public.load_consultation(p_relation uuid DEFAULT NULL,p_start_on date DEFAULT NULL,p_end_on date DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT consultation_private.load(p_relation,p_start_on,p_end_on); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA consultation_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.command_consultation(jsonb),public.load_consultation(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_consultation(jsonb),public.load_consultation(uuid,date,date) TO authenticated;
COMMIT;

