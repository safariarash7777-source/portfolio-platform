-- Additive, read-only advisor roster. No installs/seeding/financial totals in this file.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.load_consultation_roster(date,date)') IS NOT NULL THEN RAISE EXCEPTION 'roster collision' USING ERRCODE='55000'; END IF;
 IF to_regprocedure('consultation_private.access(public.consultation_relationships,boolean,boolean)') IS NULL
 OR to_regclass('public.risk_assessments') IS NULL OR to_regclass('public.risk_revalidations') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
 THEN RAISE EXCEPTION 'roster prerequisites missing' USING ERRCODE='55000'; END IF;
END $$;
CREATE FUNCTION public.load_consultation_roster(p_start_on date DEFAULT NULL,p_end_on date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); now_at timestamptz:=statement_timestamp(); start_day date; end_day date;
 r public.consultation_relationships; h uuid; c uuid; g uuid; h_state text; g_state text;
 risk_id uuid; risk_at timestamptz; category text; expiry timestamptz; forced timestamptz; risk_state text;
 ties integer; total integer; missing jsonb; rows_out jsonb:='[]'; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled)
 THEN RAISE EXCEPTION 'advisor required' USING ERRCODE='42501'; END IF;
 IF (p_start_on IS NULL)<>(p_end_on IS NULL) THEN RAISE EXCEPTION 'period pair required' USING ERRCODE='22023'; END IF;
 start_day:=coalesce(p_start_on,date_trunc('month',now_at AT TIME ZONE 'Asia/Tehran')::date);
 end_day:=coalesce(p_end_on,(start_day+interval '1 month'-interval '1 day')::date);
 PERFORM consultation_private.period(jsonb_build_object('startOn',start_day,'endOn',end_day));
 SELECT count(*) INTO total FROM public.consultation_relationships x WHERE x.advisor_id=actor AND consultation_private.access(x,true,true);
 IF total>100 THEN RAISE EXCEPTION 'roster bound exceeded' USING ERRCODE='54000'; END IF;
 FOR r IN SELECT x.* FROM public.consultation_relationships x WHERE x.advisor_id=actor AND consultation_private.access(x,true,true) ORDER BY x.created_at DESC,x.id LOOP
  IF jsonb_array_length(rows_out)>=100 THEN RAISE EXCEPTION 'roster bound exceeded' USING ERRCODE='54000';END IF;
  -- Only authorized relations reach canonical finance / risk reads; no profile/contact or answers JSON.
  SELECT id INTO h FROM public.member_holding_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  SELECT id INTO c FROM public.member_cash_flow_versions WHERE user_id=r.client_id AND period_start=start_day AND period_end=end_day ORDER BY version DESC LIMIT 1;
  SELECT id,CASE WHEN jsonb_array_length(payload->'goals')=0 THEN 'empty' ELSE 'recorded' END INTO g,g_state FROM public.member_goals_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  h_state:=CASE WHEN h IS NULL THEN 'not_recorded' WHEN EXISTS(SELECT FROM public.member_holding_positions WHERE version_id=h) THEN 'recorded' ELSE 'empty' END;
  g_state:=coalesce(g_state,'not_recorded');
  SELECT id,created_at,risk_category INTO risk_id,risk_at,category FROM public.risk_assessments WHERE user_id=r.client_id ORDER BY created_at DESC NULLS FIRST,id LIMIT 1;
  expiry:=NULL;forced:=NULL;risk_state:='missing';
  IF risk_id IS NOT NULL THEN
   SELECT count(*) INTO ties FROM (SELECT 1 FROM public.risk_assessments WHERE user_id=r.client_id AND created_at IS NOT DISTINCT FROM risk_at LIMIT 2) same_time;
   IF ties>1 THEN risk_state:='ambiguous';
   ELSIF risk_at IS NULL OR NOT isfinite(risk_at) OR risk_at>now_at OR category IS NULL OR NOT category=ANY(ARRAY['محافظه‌کار','متعادل','تهاجمی','بسیار تهاجمی']) THEN risk_state:='invalid';
   ELSE
    expiry:=risk_at+interval '4320 hours';
    SELECT max(expired_at) INTO forced FROM public.risk_revalidations WHERE user_id=r.client_id AND expired_at>risk_at AND expired_at<=now_at;
    risk_state:=CASE WHEN now_at>expiry OR forced IS NOT NULL THEN 'expired' ELSE 'current' END;
   END IF;
  END IF;
  IF risk_state NOT IN ('current','expired') THEN risk_id:=NULL;risk_at:=NULL;category:=NULL;expiry:=NULL;forced:=NULL;END IF;
  missing:='[]';
  IF risk_state<>'current' THEN missing:=missing||jsonb_build_array('risk_'||risk_state);END IF;
  IF h_state='not_recorded' THEN missing:=missing||'"holdings_not_recorded"'::jsonb;ELSIF h_state='empty' THEN missing:=missing||'"holdings_empty"'::jsonb;END IF;
  IF c IS NULL THEN missing:=missing||'"cashflow_period_not_recorded"'::jsonb;END IF;
  IF g_state='not_recorded' THEN missing:=missing||'"goals_not_recorded"'::jsonb;ELSIF g_state='empty' THEN missing:=missing||'"goals_empty"'::jsonb;END IF;
  rows_out:=rows_out||jsonb_build_array(jsonb_build_object(
   'relationshipId',r.id,'clientId',r.client_id,'clientLabel',r.client_label,'grantedAt',r.created_at,
   'risk',jsonb_build_object('state',risk_state,'category',category,'assessmentId',risk_id,'assessedAt',risk_at,'expiresAt',expiry,'forcedExpiredAt',forced,'source','risk_assessments'),
   'holdings',jsonb_build_object('versionId',h,'state',h_state),
   'cashFlow',jsonb_build_object('versionId',c,'state',CASE WHEN c IS NULL THEN 'not_recorded' ELSE 'recorded' END),
   'goals',jsonb_build_object('versionId',g,'state',g_state),
   'assetValue',jsonb_build_object('state','unavailable','totalToman',NULL,'reason','valuation_not_in_roster_v1'),'missingCodes',missing));
 END LOOP;
 -- Fail closed if a revocation/disable committed while the bounded roster was being read.
 IF NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled)
 THEN RAISE EXCEPTION 'roster access changed' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]') INTO rows_out FROM jsonb_array_elements(rows_out) WITH ORDINALITY AS item(e,ord)
 WHERE EXISTS(SELECT FROM public.consultation_relationships x WHERE x.id=(e->>'relationshipId')::uuid AND x.advisor_id=actor AND consultation_private.access(x,true,true));
 total:=jsonb_array_length(rows_out);
 result:=jsonb_build_object('contractVersion','consultation-roster.v1','actorId',actor,'generatedAt',now_at,
  'period',jsonb_build_object('startOn',start_day,'endOn',end_day),
  'capabilities',jsonb_build_object('risk',true,'financialPresence',true,'assetValueRange',false),
  'rows',rows_out,'totalAuthorized',total,'totalMatched',total,'page',1,'pageSize',100);
 IF octet_length(result::text)>262144 THEN RAISE EXCEPTION 'roster payload bound exceeded' USING ERRCODE='54000';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.load_consultation_roster(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.load_consultation_roster(date,date) TO authenticated;
COMMIT;
