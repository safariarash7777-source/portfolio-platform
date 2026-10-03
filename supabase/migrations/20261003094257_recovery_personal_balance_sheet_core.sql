-- RECOVERY-01: exact phase38 financial core, without advisor RPC dependency. NOT_INSTALLED; requires phase32. P00 controls release.
-- CLI scaffold: 20260930153150_personal_balance_sheet.sql.
-- NOT_APPLIED to staging/production. Requires phase32 -> phase34 -> phase35 -> phase36 -> phase37.
-- One financial snapshot uses the existing member_holding_versions, never a parallel version ledger.
BEGIN;
ALTER TABLE public.member_holding_positions ALTER COLUMN qty DROP NOT NULL;
ALTER TABLE public.member_holding_positions
 ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 300),
 ADD COLUMN IF NOT EXISTS ownership_pct numeric NOT NULL DEFAULT 100 CHECK (ownership_pct > 0 AND ownership_pct <= 100 AND ownership_pct = round(ownership_pct,2)),
 ADD COLUMN IF NOT EXISTS valuation_mode text NOT NULL DEFAULT 'market' CHECK (valuation_mode IN ('market','declared','unpriced')),
 ADD COLUMN IF NOT EXISTS declared_value bigint CHECK (declared_value BETWEEN 0 AND 9007199254740991),
 ADD COLUMN IF NOT EXISTS valuation_source text,
 ADD COLUMN IF NOT EXISTS valuation_as_of date,
 ADD COLUMN IF NOT EXISTS valuation_status text NOT NULL DEFAULT 'valid' CHECK (valuation_status IN ('valid','estimated','missing'));
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mhp_financial_valuation') THEN
  ALTER TABLE public.member_holding_positions ADD CONSTRAINT mhp_financial_valuation CHECK (
   (qty IS NULL OR (qty > 0 AND qty <= 9007199254740991)) AND
   ((valuation_mode='declared' AND declared_value IS NOT NULL AND valuation_as_of IS NOT NULL
     AND coalesce(length(btrim(valuation_source)),0)>0 AND lower(btrim(valuation_source)) NOT IN ('unknown','نامشخص','-','—') AND valuation_status IN ('valid','estimated'))
    OR (valuation_mode IN ('market','unpriced') AND qty IS NOT NULL AND declared_value IS NULL AND valuation_source IS NULL AND valuation_as_of IS NULL
     AND ((valuation_mode='market' AND valuation_status='valid') OR (valuation_mode='unpriced' AND valuation_status='missing'))))
  );
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.member_debt_positions (
 version_id uuid NOT NULL REFERENCES public.member_holding_versions(id) ON DELETE RESTRICT,
 debt_key text NOT NULL CHECK (length(btrim(debt_key)) BETWEEN 1 AND 200),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
 kind text NOT NULL CHECK (kind IN ('loan','personal','installment')),
 balance_toman bigint NOT NULL CHECK (balance_toman BETWEEN 0 AND 9007199254740991),
 currency text NOT NULL CHECK (currency IN ('IRR','IRT')),
 balance_as_of date NOT NULL,
 next_installment_toman bigint CHECK (next_installment_toman BETWEEN 0 AND 9007199254740991),
 next_due_on date,
 note text CHECK (length(note)<=2000),
 PRIMARY KEY(version_id,debt_key),
 CHECK ((next_installment_toman IS NULL) = (next_due_on IS NULL))
);
COMMENT ON TABLE public.member_debt_positions IS 'Definite recorded debts in the SAME financial version as holdings. All monetary columns are integer toman; currency preserves the entry unit.';
ALTER TABLE public.member_debt_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_debt_positions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_debt_positions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.member_debt_positions TO authenticated;
DROP POLICY IF EXISTS mdp_self_read ON public.member_debt_positions;
CREATE POLICY mdp_self_read ON public.member_debt_positions FOR SELECT TO authenticated USING (public.owns_holding_version(version_id));
DROP TRIGGER IF EXISTS no_mutation ON public.member_debt_positions;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_debt_positions FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

CREATE SCHEMA IF NOT EXISTS portfolio_private;
REVOKE ALL ON SCHEMA portfolio_private FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION portfolio_private.record_snapshot(p_kind text,p_items jsonb,p_note text,p_token text,p_base integer)
RETURNS TABLE(version_id uuid,version integer,position_count integer,reused boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid(); prior public.member_holding_versions; existing public.member_holding_versions;
 result_id uuid; next_version integer; normalized jsonb; fingerprint text; legacy_fingerprint text; item_count integer;
 token text := nullif(btrim(p_token),'');
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'financial forbidden' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('holdings','debts') OR p_kind IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'invalid financial input' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_items)>500 OR octet_length(p_items::text)>1000000 OR length(p_note)>2000 OR length(token)>200 OR p_base<0 THEN RAISE EXCEPTION 'invalid financial input' USING ERRCODE='22023'; END IF;
 -- This is the SAME per-owner lock as phase32. Asset and debt edits cannot overwrite each other.
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(owner_id::text));
 SELECT * INTO prior FROM public.member_holding_versions h WHERE h.user_id=owner_id ORDER BY h.version DESC LIMIT 1;
 next_version:=coalesce(prior.version,0)+1;
 IF p_kind='holdings' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'position_key',btrim(e->>'position_key'),'symbol',nullif(btrim(e->>'symbol'),''),'manual_label',nullif(btrim(e->>'manual_label'),''),
   'asset_class',btrim(e->>'asset_class'),'qty',trim_scale((e->>'qty')::numeric),'unit',btrim(e->>'unit'),
   'cost_basis',nullif(e->>'cost_basis','')::bigint,'as_of',(e->>'as_of')::date,'title',nullif(btrim(e->>'title'),''),
   'ownership_pct',trim_scale(coalesce((e->>'ownership_pct')::numeric,100)),
   'valuation_mode',coalesce(e->>'valuation_mode','market'),'declared_value',(e->>'declared_value')::bigint,
   'valuation_source',nullif(btrim(e->>'valuation_source'),''),'valuation_as_of',(e->>'valuation_as_of')::date,
   'valuation_status',coalesce(e->>'valuation_status',CASE WHEN e->>'valuation_mode'='unpriced' THEN 'missing' ELSE 'valid' END)
  ) ORDER BY e->>'position_key'),'[]') INTO normalized FROM jsonb_array_elements(p_items) e;
 ELSE
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'debt_key',btrim(e->>'debt_key'),'title',btrim(e->>'title'),'kind',e->>'kind',
   'balance_toman',(e->>'balance_toman')::bigint,'currency',e->>'currency','balance_as_of',(e->>'balance_as_of')::date,
   'next_installment_toman',(e->>'next_installment_toman')::bigint,'next_due_on',(e->>'next_due_on')::date,'note',nullif(btrim(e->>'note'),'')
  ) ORDER BY e->>'debt_key'),'[]') INTO normalized FROM jsonb_array_elements(p_items) e;
 END IF;
 fingerprint:=md5(jsonb_build_object('kind',p_kind,'items',normalized,'note',coalesce(nullif(btrim(p_note),''),''))::text);
 IF token IS NOT NULL THEN
  SELECT * INTO existing FROM public.member_holding_versions h WHERE h.user_id=owner_id AND h.client_token=token;
  IF FOUND THEN
   -- A network retry of a pre-phase38 request must still return its original snapshot.
   -- Only the exact legacy payload (no financial metadata or debts) qualifies.
   IF p_kind='holdings' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(normalized) e WHERE
      e->>'ownership_pct'<>'100' OR e->>'valuation_mode'<>'market' OR e->>'title' IS NOT NULL OR e->>'declared_value' IS NOT NULL
      OR e->>'valuation_status'<>'valid' OR e->>'valuation_source' IS NOT NULL OR e->>'valuation_as_of' IS NOT NULL OR e->>'qty' IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.member_debt_positions d WHERE d.version_id=existing.id) THEN
    SELECT md5(jsonb_build_object('note',coalesce(nullif(btrim(p_note),''),''),'positions',coalesce(jsonb_agg(jsonb_build_object(
     'k',e->>'position_key','s',coalesce(e->>'symbol',''),'m',coalesce(e->>'manual_label',''),'c',e->>'asset_class',
     'q',trim_scale((e->>'qty')::numeric),'u',e->>'unit','b',coalesce((e->>'cost_basis')::bigint,-1),'d',(e->>'as_of')::date
    ) ORDER BY e->>'position_key'),'[]'))::text) INTO legacy_fingerprint FROM jsonb_array_elements(normalized) e;
   END IF;
   IF existing.content_hash IS DISTINCT FROM fingerprint AND (legacy_fingerprint IS NULL OR existing.content_hash IS DISTINCT FROM legacy_fingerprint) THEN RAISE EXCEPTION 'محتوای متفاوت' USING ERRCODE='PT409'; END IF;
   RETURN QUERY SELECT existing.id,existing.version,jsonb_array_length(normalized),true; RETURN;
  END IF;
 END IF;
 IF p_base IS NOT NULL AND p_base<>next_version-1 THEN RAISE EXCEPTION 'stale holdings version' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.member_holding_versions(user_id,version,client_token,content_hash,note)
 VALUES(owner_id,next_version,token,fingerprint,nullif(btrim(p_note),'')) RETURNING id INTO result_id;
 IF p_kind='holdings' THEN
  INSERT INTO public.member_holding_positions(version_id,position_key,symbol,manual_label,asset_class,qty,unit,cost_basis,as_of,title,ownership_pct,valuation_mode,declared_value,valuation_source,valuation_as_of,valuation_status)
  SELECT result_id,r.* FROM jsonb_to_recordset(normalized) AS r(position_key text,symbol text,manual_label text,asset_class text,qty numeric,unit text,cost_basis bigint,as_of date,title text,ownership_pct numeric,valuation_mode text,declared_value bigint,valuation_source text,valuation_as_of date,valuation_status text);
  INSERT INTO public.member_debt_positions SELECT result_id,d.debt_key,d.title,d.kind,d.balance_toman,d.currency,d.balance_as_of,d.next_installment_toman,d.next_due_on,d.note FROM public.member_debt_positions d WHERE d.version_id=prior.id;
 ELSE
  INSERT INTO public.member_debt_positions SELECT result_id,r.* FROM jsonb_to_recordset(normalized) AS r(debt_key text,title text,kind text,balance_toman bigint,currency text,balance_as_of date,next_installment_toman bigint,next_due_on date,note text);
  INSERT INTO public.member_holding_positions(version_id,position_key,symbol,manual_label,asset_class,qty,unit,cost_basis,as_of,title,ownership_pct,valuation_mode,declared_value,valuation_source,valuation_as_of,valuation_status)
  SELECT result_id,p.position_key,p.symbol,p.manual_label,p.asset_class,p.qty,p.unit,p.cost_basis,p.as_of,p.title,p.ownership_pct,p.valuation_mode,p.declared_value,p.valuation_source,p.valuation_as_of,p.valuation_status FROM public.member_holding_positions p WHERE p.version_id=prior.id;
 END IF;
 item_count:=jsonb_array_length(normalized);
 RETURN QUERY SELECT result_id,next_version,item_count,false;
END $$;
REVOKE ALL ON FUNCTION portfolio_private.record_snapshot(text,jsonb,text,text,integer) FROM PUBLIC,anon,authenticated;

-- Preserve the existing public signature and owner-only writing contract.
CREATE OR REPLACE FUNCTION public.record_member_holdings(p_positions jsonb,p_note text DEFAULT NULL,p_client_token text DEFAULT NULL,p_base_version integer DEFAULT NULL)
RETURNS TABLE(version_id uuid,version integer,position_count integer,reused boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT * FROM portfolio_private.record_snapshot('holdings',p_positions,p_note,p_client_token,p_base_version);
$$;
CREATE OR REPLACE FUNCTION public.record_member_debts(p_debts jsonb,p_base_version integer,p_client_token text)
RETURNS TABLE(version_id uuid,version integer,position_count integer,reused boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_base_version IS NULL THEN RAISE EXCEPTION 'base version required' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT * FROM portfolio_private.record_snapshot('debts',p_debts,NULL,p_client_token,p_base_version);
END $$;
REVOKE ALL ON FUNCTION public.record_member_holdings(jsonb,text,text,integer),public.record_member_debts(jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_member_holdings(jsonb,text,text,integer),public.record_member_debts(jsonb,integer,text) TO authenticated;

COMMIT;
