-- PF-10 CANDIDATE ONLY / NOT_APPLIED. Reader-first + root install gates required.
-- One money source: immutable CF expense. No existing financial/CF row is changed.
BEGIN;
DO $$ BEGIN
 IF to_regnamespace('debt_payment_private') IS NOT NULL OR to_regclass('public.member_debt_payment_links') IS NOT NULL
  OR to_regprocedure('public.record_member_debt_payment(jsonb,text,integer)') IS NOT NULL THEN
  RAISE EXCEPTION 'PF10 object collision' USING ERRCODE='55000';
 END IF;
 IF to_regclass('public.member_cash_flow_entries') IS NULL OR to_regclass('public.member_debt_positions') IS NULL
  OR to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'PF10 prerequisites missing' USING ERRCODE='55000'; END IF;
END $$;
CREATE SCHEMA debt_payment_private;
REVOKE ALL ON SCHEMA debt_payment_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.member_debt_payment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence BETWEEN 1 AND 9007199254740991),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 payment_key uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 holding_version_id uuid NOT NULL, debt_key text NOT NULL, due_on date NOT NULL,
 cash_flow_version_id uuid NOT NULL, entry_key text NOT NULL,
 reference text CHECK(reference IS NULL OR length(reference) BETWEEN 1 AND 160),
 client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,payment_key,version), UNIQUE(user_id,client_token),
 FOREIGN KEY(holding_version_id,debt_key) REFERENCES public.member_debt_positions(version_id,debt_key) ON DELETE RESTRICT,
 FOREIGN KEY(cash_flow_version_id,entry_key) REFERENCES public.member_cash_flow_entries(version_id,entry_key) ON DELETE RESTRICT
);
COMMENT ON TABLE public.member_debt_payment_links IS 'PF10 member declaration metadata only. Amount/date/unit remain in immutable CF expense; no bank verification, loan reduction or inferred split.';
CREATE INDEX debt_payment_owner_cursor ON public.member_debt_payment_links(user_id,sequence DESC);
CREATE INDEX debt_payment_basis ON public.member_debt_payment_links(user_id,holding_version_id,sequence DESC);
CREATE INDEX debt_payment_source ON public.member_debt_payment_links(cash_flow_version_id,entry_key);
ALTER TABLE public.member_debt_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_debt_payment_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_debt_payment_links FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.member_debt_payment_links_sequence_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.member_debt_payment_links TO authenticated;
CREATE POLICY debt_payment_owner_read ON public.member_debt_payment_links FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION debt_payment_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'PF10 history is append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER debt_payment_no_mutation BEFORE UPDATE OR DELETE ON public.member_debt_payment_links FOR EACH ROW EXECUTE FUNCTION debt_payment_private.reject_mutation();
CREATE TRIGGER debt_payment_no_truncate BEFORE TRUNCATE ON public.member_debt_payment_links FOR EACH STATEMENT EXECUTE FUNCTION debt_payment_private.reject_mutation();

CREATE FUNCTION debt_payment_private.payload(p public.member_debt_payment_links) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('contractVersion',1,'paymentKey',p.payment_key,'holdingVersionId',p.holding_version_id,'debtKey',p.debt_key,'dueOn',p.due_on,'cashFlowVersionId',p.cash_flow_version_id,'entryKey',p.entry_key,'reference',p.reference);
$$;
CREATE FUNCTION debt_payment_private.receipt(p public.member_debt_payment_links,reused boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('contractVersion','debt-payment-write.v1','actorId',p.user_id,'clientToken',p.client_token,'id',p.id,'sequence',p.sequence,'version',p.version,'canonicalContentHash',p.content_hash,'payload',debt_payment_private.payload(p),'period',(SELECT jsonb_build_object('startOn',v.period_start,'endOn',v.period_end) FROM public.member_cash_flow_versions v WHERE v.id=p.cash_flow_version_id AND v.user_id=p.user_id),'reused',reused);
$$;
CREATE FUNCTION debt_payment_private.record_link(p jsonb,token text,base integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); key uuid; hv uuid; cf uuid; dk text; ek text; due date; ref text; normalized jsonb; fingerprint text;
 existing public.member_debt_payment_links; head public.member_debt_payment_links; result public.member_debt_payment_links;
 source public.member_cash_flow_versions; target public.member_debt_positions; latest_holding uuid; latest_cf uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'PF10 actor required' USING ERRCODE='42501'; END IF;
 IF token IS NULL OR length(btrim(token)) NOT BETWEEN 1 AND 200 OR base IS NULL OR base<0 OR base>=2147483647
  OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>16384
  OR (SELECT count(*) FROM jsonb_object_keys(p))<>8 OR NOT (p ?& ARRAY['contractVersion','paymentKey','holdingVersionId','debtKey','dueOn','cashFlowVersionId','entryKey','reference'])
  OR p->'contractVersion' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'PF10 invalid request' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'paymentKey')<>'string' OR jsonb_typeof(p->'holdingVersionId')<>'string' OR jsonb_typeof(p->'cashFlowVersionId')<>'string'
  OR jsonb_typeof(p->'debtKey')<>'string' OR jsonb_typeof(p->'entryKey')<>'string' OR jsonb_typeof(p->'dueOn')<>'string'
  OR (p->'reference'<>'null'::jsonb AND jsonb_typeof(p->'reference')<>'string') THEN RAISE EXCEPTION 'PF10 invalid types' USING ERRCODE='22023'; END IF;
 key:=(p->>'paymentKey')::uuid; hv:=(p->>'holdingVersionId')::uuid; cf:=(p->>'cashFlowVersionId')::uuid;
 dk:=btrim(p->>'debtKey'); ek:=btrim(p->>'entryKey'); ref:=nullif(btrim(p->>'reference'),''); token:=btrim(token);
 IF length(dk) NOT BETWEEN 1 AND 200 OR length(ek) NOT BETWEEN 1 AND 200 OR length(ref)>160
  OR p->>'dueOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'PF10 invalid fields' USING ERRCODE='22023'; END IF;
 due:=(p->>'dueOn')::date;
 IF to_char(due,'YYYY-MM-DD')<>p->>'dueOn' THEN RAISE EXCEPTION 'PF10 invalid date' USING ERRCODE='22023'; END IF;
 normalized:=jsonb_build_object('contractVersion',1,'paymentKey',key,'holdingVersionId',hv,'debtKey',dk,'dueOn',due,'cashFlowVersionId',cf,'entryKey',ek,'reference',ref);
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('payload',normalized,'baseVersion',base)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('debt_payment_owner'),hashtext(actor::text));
 SELECT * INTO existing FROM public.member_debt_payment_links WHERE user_id=actor AND client_token=token;
 IF FOUND THEN
  IF existing.content_hash<>fingerprint THEN RAISE EXCEPTION 'PF10 token conflict' USING ERRCODE='PT409'; END IF;
  RETURN debt_payment_private.receipt(existing,true);
 END IF;
 SELECT * INTO head FROM public.member_debt_payment_links WHERE user_id=actor AND payment_key=key ORDER BY version DESC LIMIT 1;
 IF coalesce(head.version,0)<>base THEN RAISE EXCEPTION 'PF10 version conflict' USING ERRCODE='PT409'; END IF;
 -- Same lock identities as existing writers; those contracts remain unchanged.
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(actor::text));
 SELECT id INTO latest_holding FROM public.member_holding_versions WHERE user_id=actor ORDER BY version DESC LIMIT 1;
 IF latest_holding IS DISTINCT FROM hv THEN RAISE EXCEPTION 'PF10 financial basis changed' USING ERRCODE='PT409'; END IF;
 SELECT d.* INTO target FROM public.member_debt_positions d JOIN public.member_holding_versions h ON h.id=d.version_id
  WHERE d.version_id=hv AND d.debt_key=dk AND h.user_id=actor;
 IF NOT FOUND OR target.next_due_on IS DISTINCT FROM due OR target.next_installment_toman IS NULL THEN RAISE EXCEPTION 'PF10 installment unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO source FROM public.member_cash_flow_versions WHERE id=cf AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'PF10 source forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||actor::text),hashtext(source.period_start::text||':'||source.period_end::text));
 SELECT id INTO latest_cf FROM public.member_cash_flow_versions WHERE user_id=actor AND period_start=source.period_start AND period_end=source.period_end ORDER BY version DESC LIMIT 1;
 IF latest_cf IS DISTINCT FROM cf THEN RAISE EXCEPTION 'PF10 cash-flow basis changed' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.member_cash_flow_entries e WHERE e.version_id=cf AND e.entry_key=ek AND e.basis='actual' AND e.kind='expense' AND e.amount_toman IS NOT NULL AND e.occurred_on IS NOT NULL) THEN
  RAISE EXCEPTION 'PF10 known actual expense required' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(payment_key) * FROM public.member_debt_payment_links WHERE user_id=actor ORDER BY payment_key,version DESC) l
   JOIN public.member_cash_flow_versions v ON v.id=l.cash_flow_version_id
   WHERE l.payment_key<>key AND l.entry_key=ek AND v.period_start=source.period_start AND v.period_end=source.period_end) THEN
  RAISE EXCEPTION 'PF10 expense already linked' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.member_debt_payment_links(user_id,payment_key,version,holding_version_id,debt_key,due_on,cash_flow_version_id,entry_key,reference,client_token,content_hash)
 VALUES(actor,key,base+1,hv,dk,due,cf,ek,ref,token,fingerprint) RETURNING * INTO result;
 RETURN debt_payment_private.receipt(result,false);
END $$;

CREATE FUNCTION debt_payment_private.lookup_receipt(token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); item public.member_debt_payment_links;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'PF10 actor required' USING ERRCODE='42501'; END IF;
 IF token IS NULL OR length(btrim(token)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PF10 invalid token' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.member_debt_payment_links WHERE user_id=actor AND client_token=btrim(token);
 IF NOT FOUND THEN RETURN jsonb_build_object('contractVersion','debt-payment-lookup.v1','actorId',actor,'status','unknown','receipt',NULL); END IF;
 RETURN jsonb_build_object('contractVersion','debt-payment-lookup.v1','actorId',actor,'status','found','receipt',debt_payment_private.receipt(item,true));
END $$;

CREATE FUNCTION debt_payment_private.row_dto(p public.member_debt_payment_links,actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.member_cash_flow_versions; event public.member_cash_flow_entries; latest_cf uuid; latest_h uuid; state text; latest_link boolean;
BEGIN
 IF actor IS NULL OR p.user_id IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM public.member_holding_versions WHERE id=p.holding_version_id AND user_id=actor) THEN
  RAISE EXCEPTION 'PF10 row ownership invalid' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM public.member_cash_flow_versions WHERE id=p.cash_flow_version_id AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'PF10 row source invalid' USING ERRCODE='42501'; END IF;
 SELECT * INTO event FROM public.member_cash_flow_entries WHERE version_id=source.id AND entry_key=p.entry_key;
 IF NOT FOUND OR event.amount_toman IS NULL OR event.occurred_on IS NULL OR event.kind<>'expense' OR event.basis<>'actual' THEN RAISE EXCEPTION 'PF10 stored source invalid' USING ERRCODE='22023'; END IF;
 SELECT id INTO latest_cf FROM public.member_cash_flow_versions WHERE user_id=actor AND period_start=source.period_start AND period_end=source.period_end ORDER BY version DESC LIMIT 1;
 state:=CASE WHEN latest_cf=source.id THEN 'current' WHEN EXISTS(SELECT 1 FROM public.member_cash_flow_entries WHERE version_id=latest_cf AND entry_key=p.entry_key AND kind='expense' AND basis='actual') THEN 'stale' ELSE 'removed' END;
 SELECT id INTO latest_h FROM public.member_holding_versions WHERE user_id=actor ORDER BY version DESC LIMIT 1;
 latest_link:=NOT EXISTS(SELECT 1 FROM public.member_debt_payment_links WHERE user_id=actor AND payment_key=p.payment_key AND version>p.version);
 RETURN jsonb_build_object('id',p.id,'sequence',p.sequence,'version',p.version,'createdAt',p.created_at,'payload',debt_payment_private.payload(p),
  'period',jsonb_build_object('startOn',source.period_start,'endOn',source.period_end),'amountToman',event.amount_toman,'occurredOn',event.occurred_on,'unit','IRT','sourceState',state,'latestForPayment',latest_link,'basisCurrent',p.holding_version_id=latest_h,'allocation',NULL);
END $$;

CREATE FUNCTION debt_payment_private.load_links(hv uuid,start_day date,end_day date,before_sequence bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); selected public.member_holding_versions; latest public.member_holding_versions; cf public.member_cash_flow_versions;
 items jsonb; installments jsonb; sources jsonb; next_cursor bigint; historical boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'PF10 actor required' USING ERRCODE='42501'; END IF;
 IF start_day IS NULL OR end_day IS NULL OR end_day-start_day NOT BETWEEN 0 AND 365 OR before_sequence IS NOT NULL AND before_sequence<1 THEN RAISE EXCEPTION 'PF10 invalid selection' USING ERRCODE='22023'; END IF;
 SELECT * INTO selected FROM public.member_holding_versions WHERE id=hv AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'PF10 basis forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO latest FROM public.member_holding_versions WHERE user_id=actor ORDER BY version DESC LIMIT 1;
 historical:=latest.id<>selected.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('debtKey',d.debt_key,'title',d.title,'dueOn',d.next_due_on,'installmentToman',d.next_installment_toman) ORDER BY d.next_due_on,d.debt_key),'[]') INTO installments
  FROM public.member_debt_positions d WHERE d.version_id=hv AND d.next_due_on IS NOT NULL AND d.next_installment_toman IS NOT NULL;
 SELECT * INTO cf FROM public.member_cash_flow_versions WHERE user_id=actor AND period_start=start_day AND period_end=end_day ORDER BY version DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('entryKey',e.entry_key,'amountToman',e.amount_toman,'occurredOn',e.occurred_on,'unit','IRT','note',e.note) ORDER BY e.occurred_on,e.entry_key),'[]') INTO sources
  FROM public.member_cash_flow_entries e WHERE e.version_id=cf.id AND e.kind='expense' AND e.basis='actual' AND e.amount_toman IS NOT NULL AND e.occurred_on IS NOT NULL;
 SELECT CASE WHEN count(*)>50 THEN min(sequence) FILTER(WHERE n<=50) ELSE NULL END INTO next_cursor FROM (
  SELECT sequence,row_number() OVER(ORDER BY sequence DESC) n FROM public.member_debt_payment_links
  WHERE user_id=actor AND (NOT historical OR holding_version_id=hv) AND (before_sequence IS NULL OR sequence<before_sequence) ORDER BY sequence DESC LIMIT 51
 ) bounded;
 SELECT coalesce(jsonb_agg(debt_payment_private.row_dto(l::public.member_debt_payment_links,actor) ORDER BY l.sequence DESC),'[]') INTO items FROM (
  SELECT * FROM public.member_debt_payment_links WHERE user_id=actor AND (NOT historical OR holding_version_id=hv) AND (before_sequence IS NULL OR sequence<before_sequence) ORDER BY sequence DESC LIMIT 50
 ) l;
 RETURN jsonb_build_object('contractVersion','debt-payment-read.v1','state','ready','actorId',actor,
  'basis',jsonb_build_object('id',selected.id,'version',selected.version,'latestId',latest.id,'latestVersion',latest.version,'historical',historical),
  'period',jsonb_build_object('startOn',start_day,'endOn',end_day),'sourceVersion',CASE WHEN cf.id IS NULL THEN NULL ELSE jsonb_build_object('id',cf.id,'version',cf.version) END,
  'installments',installments,'sources',sources,'history',jsonb_build_object('items',items,'nextBeforeSequence',next_cursor),'writeAllowed',NOT historical);
END $$;

-- Exposed wrappers are invokers; privileged, actor-checked code is private.
CREATE FUNCTION public.record_member_debt_payment(p_payload jsonb,p_client_token text,p_base_version integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT debt_payment_private.record_link(p_payload,p_client_token,p_base_version); $$;
CREATE FUNCTION public.lookup_member_debt_payment(p_client_token text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT debt_payment_private.lookup_receipt(p_client_token); $$;
CREATE FUNCTION public.load_member_debt_payments(p_holding_version_id uuid,p_start_on date,p_end_on date,p_before_sequence bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT debt_payment_private.load_links(p_holding_version_id,p_start_on,p_end_on,p_before_sequence); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA debt_payment_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA debt_payment_private TO authenticated;
GRANT EXECUTE ON FUNCTION debt_payment_private.record_link(jsonb,text,integer),debt_payment_private.lookup_receipt(text),debt_payment_private.load_links(uuid,date,date,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.record_member_debt_payment(jsonb,text,integer),public.lookup_member_debt_payment(text),public.load_member_debt_payments(uuid,date,date,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_member_debt_payment(jsonb,text,integer),public.lookup_member_debt_payment(text),public.load_member_debt_payments(uuid,date,date,bigint) TO authenticated;
COMMIT;
