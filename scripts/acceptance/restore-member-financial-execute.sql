-- REVIEW / RESTORE-REHEARSAL ONLY; no live execution without coordinator gate.
-- Approved migration bodies already match. Restore only their missing member
-- EXECUTE grants; do not replace functions, alter owners/RLS or grant table writes.
-- Source: 20261003094257_recovery_personal_balance_sheet_core.sql and
--         20261003094327_member_investment_scope_reviews.sql at main@1b6218c.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';

DO $contract_guard$
DECLARE expected record; actual record;
BEGIN
  IF current_database()<>'postgres' THEN RAISE EXCEPTION 'database mismatch'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('public.record_member_holdings(jsonb,text,text,integer)', '06152c855716d0890632d0845760471f', true, '{postgres=X/postgres,service_role=X/postgres}'),
    ('public.record_member_debts(jsonb,integer,text)', '560a02ee66335a3dbaa2bfdea927359b', true, '{postgres=X/postgres,service_role=X/postgres}'),
    ('public.record_member_investment_scope(uuid,text,jsonb,integer,text)', '7b86465786374f3b1b1ee0fd757e497f', false, '{postgres=X/postgres,service_role=X/postgres}'),
    ('portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)', '3b5dd03da6ca1b27392aa70e33b2789f', true, '{postgres=X/postgres}'),
    ('portfolio_private.record_snapshot(text,jsonb,text,text,integer)', '0c4a99cf3b3b07ba3b9e5474d539c418', true, '{postgres=X/postgres}')
  ) AS e(signature,definition_md5,security_definer,prior_acl)
  LOOP
    SELECT p.oid,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
      md5(pg_get_functiondef(p.oid)) AS definition_md5,p.proacl::text AS acl
      INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
    IF NOT FOUND OR actual.owner<>'postgres'
       OR actual.prosecdef IS DISTINCT FROM expected.security_definer
       OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR actual.definition_md5 IS DISTINCT FROM expected.definition_md5
       OR actual.acl IS DISTINCT FROM expected.prior_acl THEN
      RAISE EXCEPTION 'financial function contract/owner/ACL drift: %',expected.signature;
    END IF;
  END LOOP;
  IF NOT has_schema_privilege('authenticated','portfolio_scope_private','USAGE')
     OR has_schema_privilege('authenticated','portfolio_private','USAGE') THEN
    RAISE EXCEPTION 'implementation schema usage drift';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('member_holding_versions','member_holding_positions','member_debt_positions','member_investment_scope_reviews')
      AND (NOT c.relrowsecurity OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE'))) THEN
    RAISE EXCEPTION 'financial table protections differ from reviewed baseline';
  END IF;
END
$contract_guard$;

GRANT EXECUTE ON FUNCTION
  public.record_member_holdings(jsonb,text,text,integer),
  public.record_member_debts(jsonb,integer,text),
  public.record_member_investment_scope(uuid,text,jsonb,integer,text),
  portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)
TO authenticated;

DO $postcondition$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.record_member_holdings(jsonb,text,text,integer)',
    'public.record_member_debts(jsonb,integer,text)',
    'public.record_member_investment_scope(uuid,text,jsonb,integer,text)',
    'portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
       OR has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') THEN
      RAISE EXCEPTION 'member/anonymous grant postcondition failed: %',signature;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated','portfolio_private.record_snapshot(text,jsonb,text,text,integer)','EXECUTE')
     OR has_schema_privilege('authenticated','portfolio_private','USAGE') THEN
    RAISE EXCEPTION 'private financial implementation must remain closed';
  END IF;
END
$postcondition$;

SELECT json_build_object('status','PASS','authenticatedExecuteRestored',4,
  'functionBodiesChanged',0,'ownersChanged',0,'schemaUsageChanged',0,'tableGrantsChanged',0);
COMMIT;
