-- DEV-07 operator preflight: catalog-only, no user data or writes.
-- Run against the explicitly designated acceptance DB; save output with final app SHA.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT required.name, to_regclass(required.name) IS NOT NULL AS present
FROM (VALUES ('auth.users'),('public.profiles'),('public.portfolio_versions'),
 ('public.member_holding_versions'),('public.member_holding_positions'),
 ('public.research_workbook_versions'),('public.research_workbook_reviews'),
 ('public.consultation_advisors'),('public.consultation_relationships'),
 ('public.consultation_revocations'),('public.consultation_sessions'),
 ('public.consultation_private_notes'),('public.consultation_publications'),
 ('public.consultation_actions')) required(name);
SELECT n.nspname AS schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
 AND (c.relname LIKE 'consultation_%' OR c.relname LIKE 'member_holding_%'
      OR c.relname LIKE 'research_workbook_%') ORDER BY c.relname;
SELECT p.oid::regprocedure AS function_signature,p.prosecdef,p.proconfig,p.proacl,
 CASE WHEN p.proname='save_consultation_action'
   THEN strpos(pg_get_functiondef(p.oid),'p_body ?|')>0 ELSE NULL END AS phase36_status_branch,
 CASE WHEN p.proname IN ('record_member_holdings','save_consultation_session',
   'publish_consultation_session','save_consultation_action') THEN
   strpos(pg_get_functiondef(p.oid),'PT409')>0 AND
   strpos(pg_get_functiondef(p.oid),'40001')=0 ELSE NULL END AS phase37_nonretryable_conflict
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('deny_mutation','record_member_holdings',
 'grant_consultation',
 'revoke_consultation','save_consultation_session','publish_consultation_session',
 'save_consultation_action','consultation_holding_versions','consultation_approved_research_versions')
ORDER BY p.proname;
ROLLBACK;
