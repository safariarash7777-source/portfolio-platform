-- PF2b candidate only. NOT INSTALLED on operational/production databases.
-- CLI scaffold: supabase 2.117.0 migration new personal_cash_flow_versions.
-- Two cash-only tables; no holdings/debt/target/Auth schema changes.
BEGIN;
DO $$ BEGIN
 IF to_regnamespace('cash_flow_private') IS NOT NULL
  OR to_regclass('public.member_cash_flow_versions') IS NOT NULL
  OR to_regclass('public.member_cash_flow_entries') IS NOT NULL
  OR to_regprocedure('public.record_member_cash_flow(jsonb,text,integer)') IS NOT NULL THEN
  RAISE EXCEPTION 'cash-flow candidate object collision' USING ERRCODE='55000';
 END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regclass('auth.users') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'cash-flow installation prerequisites missing' USING ERRCODE='55000';
 END IF;
END $$;
CREATE SCHEMA cash_flow_private;
REVOKE ALL ON SCHEMA cash_flow_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION cash_flow_private.keys(p jsonb,allowed text[],required text[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT k=ANY(allowed))
  OR EXISTS(SELECT 1 FROM unnest(required) k WHERE NOT p ? k) THEN
  RAISE EXCEPTION 'invalid cash-flow object keys' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION cash_flow_private.txt(p jsonb,maximum integer,nullable boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'cash-flow text required' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p)<>'string' THEN RAISE EXCEPTION 'invalid cash-flow text' USING ERRCODE='22023'; END IF;
 s:=btrim(p#>>'{}');
 IF s='' AND nullable THEN RETURN NULL; END IF;
 IF length(s) NOT BETWEEN 1 AND maximum THEN RAISE EXCEPTION 'invalid cash-flow text length' USING ERRCODE='22023'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION cash_flow_private.day(p jsonb,nullable boolean DEFAULT false) RETURNS date
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; d date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'cash-flow date required' USING ERRCODE='22023';
 END IF;
 s:=cash_flow_private.txt(p,10);
 IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid cash-flow calendar day' USING ERRCODE='22023'; END IF;
 BEGIN d:=s::date; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'invalid cash-flow calendar day' USING ERRCODE='22023';
 END;
 IF to_char(d,'YYYY-MM-DD')<>s THEN RAISE EXCEPTION 'invalid cash-flow calendar day' USING ERRCODE='22023'; END IF;
 RETURN d;
END $$;
CREATE FUNCTION cash_flow_private.amount(p jsonb,signed boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE n numeric; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p)<>'number' THEN RAISE EXCEPTION 'cash-flow amount must be canonical integer toman' USING ERRCODE='22023'; END IF;
 n:=(p::text)::numeric;
 IF n<>trunc(n) OR n>9007199254740991 OR n<(CASE WHEN signed THEN -9007199254740991 ELSE 0 END) THEN
  RAISE EXCEPTION 'invalid cash-flow amount' USING ERRCODE='22023';
 END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION cash_flow_private.source(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE label text; observed date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 PERFORM cash_flow_private.keys(p,ARRAY['label','observedOn'],ARRAY['label','observedOn']);
 label:=cash_flow_private.txt(p->'label',160); observed:=cash_flow_private.day(p->'observedOn');
 IF lower(label) IN ('unknown','نامشخص','-','—') THEN RAISE EXCEPTION 'cash-flow source unknown' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('label',label,'observedOn',observed);
END $$;

CREATE FUNCTION cash_flow_private.normalize(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE start_day date; end_day date; e jsonb; k jsonb; normalized jsonb;
 accounts jsonb:='[]'; account_keys text[]:='{}'; scope jsonb; scope_keys text[]:='{}';
 coverage jsonb:='{}'; opening jsonb; events jsonb:='[]'; event_keys text[]:='{}';
 key text; label text; basis text; kind text; state text; amount bigint; occurred date;
 source jsonb; category text; note text; account text; from_account text; to_account text;
BEGIN
 PERFORM cash_flow_private.keys(p,ARRAY['contractVersion','period','accountDefinitions','scopeAccountKeys','opening','coverage','entries'],ARRAY['contractVersion','period','accountDefinitions','scopeAccountKeys','opening','coverage','entries']);
 IF p->'contractVersion' IS DISTINCT FROM '1'::jsonb OR octet_length(p::text)>1000000 THEN RAISE EXCEPTION 'invalid cash-flow contract or size' USING ERRCODE='22023'; END IF;
 PERFORM cash_flow_private.keys(p->'period',ARRAY['startOn','endOn'],ARRAY['startOn','endOn']);
 start_day:=cash_flow_private.day(p->'period'->'startOn'); end_day:=cash_flow_private.day(p->'period'->'endOn');
 IF end_day-start_day NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'cash-flow period must contain 1 to 366 days' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'accountDefinitions') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'accountDefinitions') NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid cash-flow account definitions' USING ERRCODE='22023';
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'accountDefinitions') LOOP
  PERFORM cash_flow_private.keys(e,ARRAY['accountKey','label'],ARRAY['accountKey','label']);
  key:=cash_flow_private.txt(e->'accountKey',200); label:=cash_flow_private.txt(e->'label',160);
  IF key=ANY(account_keys) THEN RAISE EXCEPTION 'duplicate cash-flow account key' USING ERRCODE='22023'; END IF;
  account_keys:=array_append(account_keys,key); accounts:=accounts||jsonb_build_array(jsonb_build_object('accountKey',key,'label',label));
 END LOOP;
 SELECT jsonb_agg(value ORDER BY value->>'accountKey' COLLATE "C") INTO accounts FROM jsonb_array_elements(accounts);
 IF jsonb_typeof(p->'scopeAccountKeys') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'scopeAccountKeys') NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid cash-flow scope' USING ERRCODE='22023';
 END IF;
 FOR k IN SELECT value FROM jsonb_array_elements(p->'scopeAccountKeys') LOOP
  key:=cash_flow_private.txt(k,200);
  IF NOT key=ANY(account_keys) OR key=ANY(scope_keys) THEN RAISE EXCEPTION 'unowned or duplicate cash-flow scope reference' USING ERRCODE='22023'; END IF;
  scope_keys:=array_append(scope_keys,key);
 END LOOP;
 SELECT jsonb_agg(value ORDER BY value COLLATE "C") INTO scope FROM unnest(scope_keys) value;
 PERFORM cash_flow_private.keys(p->'coverage',ARRAY['planned','actual'],ARRAY['planned','actual']);
 FOREACH basis IN ARRAY ARRAY['planned','actual'] LOOP
  e:=p->'coverage'->basis;
  PERFORM cash_flow_private.keys(e,ARRAY['status','memberAffirmed','source'],ARRAY['status','memberAffirmed','source']);
  state:=cash_flow_private.txt(e->'status',8); source:=cash_flow_private.source(e->'source');
  IF state NOT IN ('unknown','partial','complete') OR jsonb_typeof(e->'memberAffirmed') IS DISTINCT FROM 'boolean'
   OR (state='complete' AND (e->'memberAffirmed'<>'true'::jsonb OR source IS NULL)) THEN
   RAISE EXCEPTION 'cash-flow complete coverage requires explicit member affirmation and source' USING ERRCODE='22023';
  END IF;
  coverage:=coverage||jsonb_build_object(basis,jsonb_build_object('status',state,'memberAffirmed',e->'memberAffirmed','source',source));
 END LOOP;
 opening:=p->'opening';
 IF opening<>'null'::jsonb THEN
  PERFORM cash_flow_private.keys(opening,ARRAY['amountToman','atStartOn','source'],ARRAY['amountToman','atStartOn','source']);
  amount:=cash_flow_private.amount(opening->'amountToman',true); occurred:=cash_flow_private.day(opening->'atStartOn',true); source:=cash_flow_private.source(opening->'source');
  IF occurred IS NOT NULL AND occurred<>start_day THEN RAISE EXCEPTION 'cash-flow opening must be at period start' USING ERRCODE='22023'; END IF;
  opening:=jsonb_build_object('amountToman',amount,'atStartOn',occurred,'source',source);
 END IF;
 IF jsonb_typeof(p->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'entries')>500 THEN RAISE EXCEPTION 'invalid cash-flow entries' USING ERRCODE='22023'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'entries') LOOP
  PERFORM cash_flow_private.keys(e,ARRAY['entryKey','basis','kind','amountToman','occurredOn','source','category','note','accountKey','fromAccountKey','toAccountKey'],ARRAY['entryKey','basis','kind','amountToman','occurredOn','source','category','note']);
  key:=cash_flow_private.txt(e->'entryKey',200); basis:=cash_flow_private.txt(e->'basis',7); kind:=cash_flow_private.txt(e->'kind',8);
  IF key=ANY(event_keys) OR basis NOT IN ('planned','actual') OR kind NOT IN ('income','expense','transfer') THEN RAISE EXCEPTION 'invalid or duplicate cash-flow event' USING ERRCODE='22023'; END IF;
  event_keys:=array_append(event_keys,key); amount:=cash_flow_private.amount(e->'amountToman'); occurred:=cash_flow_private.day(e->'occurredOn',true);
  source:=cash_flow_private.source(e->'source'); category:=cash_flow_private.txt(e->'category',160,true); note:=cash_flow_private.txt(e->'note',2000,true);
  IF occurred IS NOT NULL AND occurred NOT BETWEEN start_day AND end_day THEN RAISE EXCEPTION 'cash-flow event outside period' USING ERRCODE='22023'; END IF;
  IF coverage->basis->>'status'='complete' AND (amount IS NULL OR occurred IS NULL OR source IS NULL) THEN
   RAISE EXCEPTION 'unknown cash-flow value contradicts complete coverage' USING ERRCODE='22023';
  END IF;
  normalized:=jsonb_build_object('entryKey',key,'basis',basis,'kind',kind,'amountToman',amount,'occurredOn',occurred,'source',source,'category',category,'note',note);
  IF kind='transfer' THEN
   IF e ? 'accountKey' OR NOT (e ? 'fromAccountKey' AND e ? 'toAccountKey') THEN RAISE EXCEPTION 'invalid transfer shape' USING ERRCODE='22023'; END IF;
   from_account:=cash_flow_private.txt(e->'fromAccountKey',200); to_account:=cash_flow_private.txt(e->'toAccountKey',200);
   IF from_account=to_account OR NOT from_account=ANY(account_keys) OR NOT to_account=ANY(account_keys) THEN RAISE EXCEPTION 'unowned cash-flow transfer reference' USING ERRCODE='22023'; END IF;
   normalized:=normalized||jsonb_build_object('fromAccountKey',from_account,'toAccountKey',to_account);
  ELSE
   IF NOT e ? 'accountKey' OR e ? 'fromAccountKey' OR e ? 'toAccountKey' THEN RAISE EXCEPTION 'invalid income or expense shape' USING ERRCODE='22023'; END IF;
   account:=cash_flow_private.txt(e->'accountKey',200);
   IF NOT account=ANY(account_keys) THEN RAISE EXCEPTION 'unowned cash-flow account reference' USING ERRCODE='22023'; END IF;
   normalized:=normalized||jsonb_build_object('accountKey',account);
  END IF;
  events:=events||jsonb_build_array(normalized);
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'entryKey' COLLATE "C"),'[]'::jsonb) INTO events FROM jsonb_array_elements(events);
 RETURN jsonb_build_object('contractVersion',1,'period',jsonb_build_object('startOn',start_day,'endOn',end_day),'accountDefinitions',accounts,'scopeAccountKeys',scope,'opening',opening,'coverage',coverage,'entries',events);
END $$;

CREATE TABLE public.member_cash_flow_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 period_start date NOT NULL, period_end date NOT NULL, version integer NOT NULL CHECK(version>0),
 client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 account_definitions jsonb NOT NULL CHECK(jsonb_typeof(account_definitions)='array' AND jsonb_array_length(account_definitions) BETWEEN 1 AND 50),
 scope_account_keys jsonb NOT NULL CHECK(jsonb_typeof(scope_account_keys)='array' AND jsonb_array_length(scope_account_keys) BETWEEN 1 AND 50),
 opening jsonb, coverage jsonb NOT NULL CHECK(jsonb_typeof(coverage)='object'),
 entry_count integer NOT NULL CHECK(entry_count BETWEEN 0 AND 500), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end-period_start BETWEEN 0 AND 365), UNIQUE(user_id,period_start,period_end,version), UNIQUE(user_id,client_token)
);
CREATE TABLE public.member_cash_flow_entries (
 version_id uuid NOT NULL REFERENCES public.member_cash_flow_versions(id) ON DELETE RESTRICT,
 entry_key text NOT NULL CHECK(length(entry_key) BETWEEN 1 AND 200), basis text NOT NULL CHECK(basis IN ('planned','actual')),
 kind text NOT NULL CHECK(kind IN ('income','expense','transfer')), amount_toman bigint CHECK(amount_toman BETWEEN 0 AND 9007199254740991),
 occurred_on date, source jsonb, category text CHECK(length(category)<=160), note text CHECK(length(note)<=2000),
 account_key text, from_account_key text, to_account_key text, PRIMARY KEY(version_id,entry_key),
 CHECK((kind='transfer' AND account_key IS NULL AND from_account_key IS NOT NULL AND to_account_key IS NOT NULL AND from_account_key<>to_account_key)
  OR (kind IN ('income','expense') AND account_key IS NOT NULL AND from_account_key IS NULL AND to_account_key IS NULL))
);
COMMENT ON TABLE public.member_cash_flow_versions IS 'PF2 cash-only append-only version; not assets, investment scope, or bank ownership verification.';
COMMENT ON TABLE public.member_cash_flow_entries IS 'PF2 one dated planned/actual event; transfer is one row and never inferred from a debt.';
ALTER TABLE public.member_cash_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_cash_flow_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_cash_flow_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_cash_flow_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_cash_flow_versions,public.member_cash_flow_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.member_cash_flow_versions,public.member_cash_flow_entries TO authenticated;
CREATE POLICY cash_flow_owner_read ON public.member_cash_flow_versions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY cash_flow_entry_owner_read ON public.member_cash_flow_entries FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.member_cash_flow_versions v WHERE v.id=version_id AND v.user_id=(SELECT auth.uid())
));
CREATE FUNCTION cash_flow_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'cash-flow history is append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_cash_flow_versions FOR EACH ROW EXECUTE FUNCTION cash_flow_private.reject_mutation();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.member_cash_flow_versions FOR EACH STATEMENT EXECUTE FUNCTION cash_flow_private.reject_mutation();
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_cash_flow_entries FOR EACH ROW EXECUTE FUNCTION cash_flow_private.reject_mutation();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.member_cash_flow_entries FOR EACH STATEMENT EXECUTE FUNCTION cash_flow_private.reject_mutation();

CREATE FUNCTION cash_flow_private.record_snapshot(p_payload jsonb,p_token text,p_base integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); normalized jsonb; fingerprint text; token text:=nullif(btrim(p_token),'');
 start_day date; end_day date; prior integer; result public.member_cash_flow_versions; replay boolean:=false;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'cash-flow authentication required' USING ERRCODE='42501'; END IF;
 IF token IS NULL OR length(token)>200 OR p_base IS NULL OR p_base NOT BETWEEN 0 AND 2147483646 THEN RAISE EXCEPTION 'invalid cash-flow attempt' USING ERRCODE='22023'; END IF;
 normalized:=cash_flow_private.normalize(p_payload);
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('payload',normalized,'baseVersion',p_base)::text,'UTF8')),'hex');
 start_day:=(normalized->'period'->>'startOn')::date; end_day:=(normalized->'period'->>'endOn')::date;
 -- Owner-wide token lock first: same token on two periods cannot race its unique constraint.
 PERFORM pg_advisory_xact_lock(hashtext('cash_flow_token:'||actor::text),hashtext(token));
 SELECT * INTO result FROM public.member_cash_flow_versions v WHERE v.user_id=actor AND v.client_token=token;
 IF FOUND THEN
  IF result.content_hash<>fingerprint THEN RAISE EXCEPTION 'cash-flow token content conflict' USING ERRCODE='PT409'; END IF;
  replay:=true;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||actor::text),hashtext(start_day::text||':'||end_day::text));
  SELECT coalesce(max(v.version),0) INTO prior FROM public.member_cash_flow_versions v WHERE v.user_id=actor AND v.period_start=start_day AND v.period_end=end_day;
  IF prior<>p_base THEN RAISE EXCEPTION 'cash-flow version conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.member_cash_flow_versions(user_id,period_start,period_end,version,client_token,content_hash,account_definitions,scope_account_keys,opening,coverage,entry_count)
   VALUES(actor,start_day,end_day,p_base+1,token,fingerprint,normalized->'accountDefinitions',normalized->'scopeAccountKeys',nullif(normalized->'opening','null'::jsonb),normalized->'coverage',jsonb_array_length(normalized->'entries')) RETURNING * INTO result;
  INSERT INTO public.member_cash_flow_entries(version_id,entry_key,basis,kind,amount_toman,occurred_on,source,category,note,account_key,from_account_key,to_account_key)
   SELECT result.id,r."entryKey",r.basis,r.kind,r."amountToman",r."occurredOn",nullif(r.source,'null'::jsonb),r.category,r.note,r."accountKey",r."fromAccountKey",r."toAccountKey"
   FROM jsonb_to_recordset(normalized->'entries') AS r("entryKey" text,basis text,kind text,"amountToman" bigint,"occurredOn" date,source jsonb,category text,note text,"accountKey" text,"fromAccountKey" text,"toAccountKey" text);
 END IF;
 RETURN jsonb_build_object('contractVersion','cash-flow-write.v1','version_id',result.id,'version',result.version,'entry_count',result.entry_count,'reused',replay,'canonical_content_hash',result.content_hash);
END $$;
-- Direct table writes stay closed. This reviewed definer only calls the private
-- validated kernel, which independently derives actor from auth.uid().
CREATE FUNCTION public.record_member_cash_flow(p_payload jsonb,p_client_token text,p_base_version integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT cash_flow_private.record_snapshot(p_payload,p_client_token,p_base_version); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cash_flow_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_member_cash_flow(jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_member_cash_flow(jsonb,text,integer) TO authenticated;
COMMIT;
