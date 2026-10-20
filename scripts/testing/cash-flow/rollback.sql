-- LAB ONLY. This is NOT a production rollback authorization or runbook.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('cash_flow_explicit','cash_flow_legacy')
  OR current_setting('portfolio.pf2b_lab_marker',true) IS DISTINCT FROM 'pf2b-isolated-20261020' THEN
  RAISE EXCEPTION 'PF2b rollback requires owned synthetic lab marker/database';
 END IF;
 IF obj_description('public.member_cash_flow_versions'::regclass) IS DISTINCT FROM
  'PF2 cash-only append-only version; not assets, investment scope, or bank ownership verification.' THEN
  RAISE EXCEPTION 'PF2b rollback object identity mismatch';
 END IF;
END $$;
DROP FUNCTION public.record_member_cash_flow(jsonb,text,integer);
DROP TABLE public.member_cash_flow_entries;
DROP TABLE public.member_cash_flow_versions;
DROP SCHEMA cash_flow_private CASCADE;
COMMIT;
