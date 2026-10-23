-- Reviewed standalone PF3 installer; operational installation requires backup/restore and release gates.
-- Independent of cashflow/portfolio allocation objects. Whole-list, owner-scoped, append-only snapshots.
BEGIN;
DO $$ BEGIN
 IF to_regnamespace('goals_private') IS NOT NULL OR to_regclass('public.member_goals_versions') IS NOT NULL
 OR to_regprocedure('public.record_member_goals(jsonb,text,integer)') IS NOT NULL THEN
 RAISE EXCEPTION 'goals object collision' USING ERRCODE='55000'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regclass('auth.users') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
 RAISE EXCEPTION 'goals prerequisites missing' USING ERRCODE='55000'; END IF;
END $$;
CREATE SCHEMA goals_private;
REVOKE ALL ON SCHEMA goals_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION goals_private.keys(p jsonb,allowed text[],required text[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT k=ANY(allowed))
  OR EXISTS(SELECT 1 FROM unnest(required) k WHERE NOT p ? k) THEN
  RAISE EXCEPTION 'invalid goals object keys' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION goals_private.txt(p jsonb,maximum integer,nullable boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'goals text required' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p)<>'string' THEN RAISE EXCEPTION 'invalid goals text' USING ERRCODE='22023'; END IF;
 -- Same ECMAScript whitespace as the browser/server String.trim().
 s:=btrim(p#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF s='' AND nullable THEN RETURN NULL; END IF;
 IF length(s) NOT BETWEEN 1 AND maximum THEN RAISE EXCEPTION 'invalid goals text length' USING ERRCODE='22023'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION goals_private.day(p jsonb,nullable boolean DEFAULT false) RETURNS date
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s text; d date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN
  IF nullable THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'goals date required' USING ERRCODE='22023';
 END IF;
 s:=goals_private.txt(p,10);
 IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid goals calendar day' USING ERRCODE='22023'; END IF;
 BEGIN d:=s::date; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'invalid goals calendar day' USING ERRCODE='22023';
 END;
 IF to_char(d,'YYYY-MM-DD')<>s THEN RAISE EXCEPTION 'invalid goals calendar day' USING ERRCODE='22023'; END IF;
 RETURN d;
END $$;
CREATE FUNCTION goals_private.amount(p jsonb,signed boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE n numeric; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p)<>'number' THEN RAISE EXCEPTION 'goals amount must be canonical integer toman' USING ERRCODE='22023'; END IF;
 n:=(p::text)::numeric;
 IF n<>trunc(n) OR n>9007199254740991 OR n<(CASE WHEN signed THEN -9007199254740991 ELSE 0 END) THEN
  RAISE EXCEPTION 'invalid goals amount' USING ERRCODE='22023';
 END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION goals_private.source(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE label text; observed date; BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 PERFORM goals_private.keys(p,ARRAY['label','observedOn'],ARRAY['label','observedOn']);
 label:=goals_private.txt(p->'label',160); observed:=goals_private.day(p->'observedOn');
 IF lower(label) IN ('unknown','نامشخص','-','—') THEN RAISE EXCEPTION 'goals source unknown' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('label',label,'observedOn',observed);
END $$;

CREATE FUNCTION goals_private.normalize(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb; key text; title text; target bigint; saved bigint; due date; provenance jsonb; note text;
 keys text[]:='{}'; items jsonb:='[]';
BEGIN
 PERFORM goals_private.keys(p,ARRAY['contractVersion','goals'],ARRAY['contractVersion','goals']);
 IF p->'contractVersion' IS DISTINCT FROM '1'::jsonb OR octet_length(p::text)>250000
 OR jsonb_typeof(p->'goals') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'goals')>50 THEN
 RAISE EXCEPTION 'invalid goals contract or size' USING ERRCODE='22023'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'goals') LOOP
  PERFORM goals_private.keys(e,ARRAY['goalKey','title','targetAmountToman','targetOn','declaredSavedToman','source','note'],ARRAY['goalKey','title','targetAmountToman','targetOn','declaredSavedToman','source','note']);
  key:=goals_private.txt(e->'goalKey',200); title:=goals_private.txt(e->'title',160);
  target:=goals_private.amount(e->'targetAmountToman'); saved:=goals_private.amount(e->'declaredSavedToman');
  due:=goals_private.day(e->'targetOn'); provenance:=goals_private.source(e->'source'); note:=goals_private.txt(e->'note',2000,true);
  IF key=ANY(keys) OR target IS NULL OR target<=0 OR (saved IS NOT NULL AND provenance IS NULL) THEN
   RAISE EXCEPTION 'duplicate goal or invalid amount/provenance' USING ERRCODE='22023'; END IF;
  keys:=array_append(keys,key);
  items:=items||jsonb_build_array(jsonb_build_object('goalKey',key,'title',title,'targetAmountToman',target,'targetOn',due,'declaredSavedToman',saved,'source',provenance,'note',note));
 END LOOP;
 -- Preserve display order; order changes are intentional content changes.
 RETURN jsonb_build_object('contractVersion',1,'goals',items);
END $$;
CREATE TABLE public.member_goals_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,version), UNIQUE(user_id,client_token)
);
COMMENT ON TABLE public.member_goals_versions IS 'PF3 nominal savings goal declarations; not portfolio allocations or asset balances. Full-list immutable history.';
ALTER TABLE public.member_goals_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_goals_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_goals_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.member_goals_versions TO authenticated;
CREATE POLICY goals_owner_read ON public.member_goals_versions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION goals_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'goals history is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_goals_versions FOR EACH ROW EXECUTE FUNCTION goals_private.reject_mutation();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.member_goals_versions FOR EACH STATEMENT EXECUTE FUNCTION goals_private.reject_mutation();
CREATE FUNCTION goals_private.record_snapshot(p_payload jsonb,p_token text,p_base integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); normalized jsonb; fingerprint text; token text:=goals_private.txt(to_jsonb(p_token),200);
 prior integer; result public.member_goals_versions; replay boolean:=false;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'goals authentication required' USING ERRCODE='42501'; END IF;
 IF token IS NULL OR length(token)>200 OR p_base IS NULL OR p_base NOT BETWEEN 0 AND 2147483646 THEN
 RAISE EXCEPTION 'invalid goals attempt' USING ERRCODE='22023'; END IF;
 normalized:=goals_private.normalize(p_payload);
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('payload',normalized,'baseVersion',p_base)::text,'UTF8')),'hex');
 -- One owner-wide lock serializes both token replay and version comparison.
 PERFORM pg_advisory_xact_lock(hashtext('member_goals'),hashtext(actor::text));
 SELECT * INTO result FROM public.member_goals_versions v WHERE v.user_id=actor AND v.client_token=token;
 IF FOUND THEN
  IF result.content_hash<>fingerprint THEN RAISE EXCEPTION 'goals token content conflict' USING ERRCODE='PT409'; END IF;
  replay:=true;
 ELSE
  SELECT coalesce(max(v.version),0) INTO prior FROM public.member_goals_versions v WHERE v.user_id=actor;
  IF prior<>p_base THEN RAISE EXCEPTION 'goals version conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.member_goals_versions(user_id,version,client_token,content_hash,payload)
  VALUES(actor,p_base+1,token,fingerprint,normalized) RETURNING * INTO result;
 END IF;
 RETURN jsonb_build_object('contractVersion','goals-write.v1','version_id',result.id,'version',result.version,'goal_count',jsonb_array_length(result.payload->'goals'),'reused',replay,'canonical_content_hash',result.content_hash);
END $$;
-- Narrow public adapter with no direct table writes. The private kernel independently checks auth.uid().
CREATE FUNCTION public.record_member_goals(p_payload jsonb,p_client_token text,p_base_version integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT goals_private.record_snapshot(p_payload,p_client_token,p_base_version); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA goals_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_member_goals(jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_member_goals(jsonb,text,integer) TO authenticated;
COMMIT;
