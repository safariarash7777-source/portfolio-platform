-- P02.4: allocations of already recorded actual cash expenses. No cash/debt mutation.
BEGIN;
CREATE TABLE public.member_installment_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 version integer NOT NULL CHECK(version>0), client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 request jsonb NOT NULL, payment_key uuid NOT NULL, action text NOT NULL CHECK(action IN ('record','void')),
 holding_version_id uuid NOT NULL REFERENCES public.member_holding_versions(id), debt_key text NOT NULL,
 due_on date NOT NULL, installment_toman bigint NOT NULL CHECK(installment_toman>0 AND installment_toman<=9007199254740991),
 cash_version_id uuid NOT NULL REFERENCES public.member_cash_flow_versions(id), entry_key text NOT NULL,
 amount_toman bigint NOT NULL CHECK(amount_toman>0 AND amount_toman<=9007199254740991),
 principal_toman bigint CHECK(principal_toman IS NULL), interest_toman bigint CHECK(interest_toman IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,version), UNIQUE(user_id,client_token)
);
ALTER TABLE public.member_installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_installment_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_installment_payments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.member_installment_payments TO authenticated;
CREATE POLICY installment_owner_read ON public.member_installment_payments FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_installment_payments FOR EACH ROW EXECUTE FUNCTION cash_flow_private.reject_mutation();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.member_installment_payments FOR EACH STATEMENT EXECUTE FUNCTION cash_flow_private.reject_mutation();

CREATE FUNCTION cash_flow_private.record_installment(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); prior integer; result public.member_installment_payments;
 old public.member_installment_payments; debt public.member_debt_positions;
 cv public.member_cash_flow_versions; ce public.member_cash_flow_entries;
 action text; token text; key uuid; hv uuid; cash uuid; dk text; ek text; base integer; allocated numeric;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 PERFORM cash_flow_private.keys(p,ARRAY['expectedOwnerId','clientToken','baseVersion','paymentKey','action','holdingVersionId','debtKey','cashVersionId','entryKey'],ARRAY['expectedOwnerId','clientToken','baseVersion','paymentKey','action','holdingVersionId','debtKey','cashVersionId','entryKey']);
 IF (p->>'expectedOwnerId')::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION 'owner mismatch' USING ERRCODE='42501'; END IF;
 token:=cash_flow_private.txt(p->'clientToken',200); dk:=cash_flow_private.txt(p->'debtKey',200); ek:=cash_flow_private.txt(p->'entryKey',200);
 action:=p->>'action'; key:=(p->>'paymentKey')::uuid; hv:=(p->>'holdingVersionId')::uuid; cash:=(p->>'cashVersionId')::uuid;
 IF action NOT IN ('record','void') OR key IS NULL OR hv IS NULL OR cash IS NULL OR jsonb_typeof(p->'baseVersion')<>'number' OR (p->>'baseVersion')!~'^[0-9]+$' THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 base:=(p->>'baseVersion')::integer;
 PERFORM pg_advisory_xact_lock(hashtext('installment_owner'),hashtext(actor::text));
 SELECT * INTO result FROM public.member_installment_payments WHERE user_id=actor AND client_token=token;
 IF FOUND THEN
  IF result.request<>p THEN RAISE EXCEPTION 'token conflict' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',result.id,'version',result.version,'reused',true,'request',result.request);
 END IF;
 SELECT coalesce(max(version),0) INTO prior FROM public.member_installment_payments WHERE user_id=actor;
 IF base<>prior THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='PT409'; END IF;
 IF prior>=500 THEN RAISE EXCEPTION 'ledger capacity reached' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM public.member_installment_payments WHERE user_id=actor AND payment_key=key ORDER BY version DESC LIMIT 1;
 IF action='void' THEN
  IF old.id IS NULL OR old.action<>'record' OR old.holding_version_id<>hv OR old.debt_key<>dk OR old.cash_version_id<>cash OR old.entry_key<>ek THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='22023'; END IF;
  INSERT INTO public.member_installment_payments(user_id,version,client_token,request,payment_key,action,holding_version_id,debt_key,due_on,installment_toman,cash_version_id,entry_key,amount_toman)
   VALUES(actor,prior+1,token,p,key,action,hv,dk,old.due_on,old.installment_toman,cash,ek,old.amount_toman) RETURNING * INTO result;
 ELSE
  -- A correction is a visible void followed by a new allocation, never overwritten history.
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'payment key already used' USING ERRCODE='PT409'; END IF;
  SELECT d.* INTO debt FROM public.member_debt_positions d JOIN public.member_holding_versions v ON v.id=d.version_id WHERE v.id=hv AND v.user_id=actor AND d.debt_key=dk;
  IF debt.debt_key IS NULL OR debt.next_due_on IS NULL OR debt.next_installment_toman IS NULL OR debt.next_installment_toman<=0 THEN RAISE EXCEPTION 'recorded installment required' USING ERRCODE='22023'; END IF;
  SELECT * INTO cv FROM public.member_cash_flow_versions WHERE id=cash AND user_id=actor;
  IF cv.id IS NULL THEN RAISE EXCEPTION 'cash version unavailable' USING ERRCODE='22023'; END IF;
  -- Serialize against writes to this exact cash series; no new expense is inserted.
  PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||actor::text),hashtext(cv.period_start::text||':'||cv.period_end::text));
  IF EXISTS(SELECT 1 FROM public.member_cash_flow_versions WHERE user_id=actor AND period_start=cv.period_start AND period_end=cv.period_end AND version>cv.version) THEN RAISE EXCEPTION 'latest cash version required' USING ERRCODE='PT409'; END IF;
  SELECT * INTO ce FROM public.member_cash_flow_entries WHERE version_id=cash AND entry_key=ek;
  IF ce.basis IS DISTINCT FROM 'actual' OR ce.kind IS DISTINCT FROM 'expense' OR ce.amount_toman IS NULL OR ce.amount_toman<=0 OR ce.occurred_on IS NULL OR ce.source IS NULL THEN RAISE EXCEPTION 'sourced actual expense required' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(payment_key) * FROM public.member_installment_payments WHERE user_id=actor ORDER BY payment_key,version DESC) a JOIN public.member_cash_flow_versions v ON v.id=a.cash_version_id WHERE a.action='record' AND a.entry_key=ek AND v.period_start=cv.period_start AND v.period_end=cv.period_end) THEN RAISE EXCEPTION 'expense already allocated' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(payment_key) * FROM public.member_installment_payments WHERE user_id=actor ORDER BY payment_key,version DESC) a WHERE a.action='record' AND a.debt_key=dk AND a.due_on=debt.next_due_on AND a.installment_toman<>debt.next_installment_toman) THEN RAISE EXCEPTION 'installment amount changed; reconcile allocations' USING ERRCODE='PT409'; END IF;
  SELECT coalesce(sum(a.amount_toman),0) INTO allocated FROM (SELECT DISTINCT ON(payment_key) * FROM public.member_installment_payments WHERE user_id=actor ORDER BY payment_key,version DESC) a WHERE a.action='record' AND a.debt_key=dk AND a.due_on=debt.next_due_on;
  IF allocated+ce.amount_toman>debt.next_installment_toman THEN RAISE EXCEPTION 'allocation exceeds recorded installment' USING ERRCODE='22023'; END IF;
  INSERT INTO public.member_installment_payments(user_id,version,client_token,request,payment_key,action,holding_version_id,debt_key,due_on,installment_toman,cash_version_id,entry_key,amount_toman)
   VALUES(actor,prior+1,token,p,key,action,hv,dk,debt.next_due_on,debt.next_installment_toman,cash,ek,ce.amount_toman) RETURNING * INTO result;
 END IF;
 RETURN jsonb_build_object('id',result.id,'version',result.version,'reused',false,'request',result.request);
END $$;
CREATE FUNCTION public.record_member_installment(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT cash_flow_private.record_installment(p_request); $$;
REVOKE ALL ON FUNCTION cash_flow_private.record_installment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_member_installment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_member_installment(jsonb) TO authenticated;
CREATE FUNCTION public.read_member_installments() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('ownerId',auth.uid(),'version',coalesce(max(p.version),0),'payments',coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('cash_matches',coalesce(
  (to_jsonb(original)-'version_id')=(to_jsonb(current_entry)-'version_id')
  AND cv.account_definitions=latest.account_definitions AND cv.scope_account_keys=latest.scope_account_keys,false)) ORDER BY p.version),'[]'::jsonb))
 FROM public.member_installment_payments p
 JOIN public.member_cash_flow_versions cv ON cv.id=p.cash_version_id
 JOIN public.member_cash_flow_entries original ON original.version_id=cv.id AND original.entry_key=p.entry_key
 LEFT JOIN LATERAL (SELECT * FROM public.member_cash_flow_versions v WHERE v.user_id=auth.uid() AND v.period_start=cv.period_start AND v.period_end=cv.period_end ORDER BY v.version DESC LIMIT 1) latest ON true
 LEFT JOIN public.member_cash_flow_entries current_entry ON current_entry.version_id=latest.id AND current_entry.entry_key=p.entry_key
 WHERE p.user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.read_member_installments() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_member_installments() TO authenticated;
COMMIT;
