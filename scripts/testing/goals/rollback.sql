-- LAB ONLY. Never operational rollback.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('goals_explicit','goals_legacy') OR current_setting('portfolio.pf3_lab_marker',true) IS DISTINCT FROM 'pf3-isolated-20261023' THEN
 RAISE EXCEPTION 'PF3 rollback requires owned synthetic lab marker/database'; END IF;
 IF obj_description('public.member_goals_versions'::regclass) IS DISTINCT FROM 'PF3 nominal savings goal declarations; not portfolio allocations or asset balances. Full-list immutable history.' THEN
 RAISE EXCEPTION 'goals rollback object identity mismatch'; END IF;
END $$;
DROP FUNCTION public.record_member_goals(jsonb,text,integer);
DROP TABLE public.member_goals_versions;
DROP SCHEMA goals_private CASCADE;
COMMIT;
