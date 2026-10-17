-- REVIEW / RESTORE-REHEARSAL ONLY. Restore the exact pre-change function ACLs.
-- Stop if any function, owner, mode or post-grant ACL changed in the meantime.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $rollback_guard$
DECLARE expected record; actual record;
BEGIN
  IF current_database()<>'postgres' THEN RAISE EXCEPTION 'database mismatch'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('public.record_member_holdings(jsonb,text,text,integer)', '06152c855716d0890632d0845760471f', true, '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.record_member_debts(jsonb,integer,text)', '560a02ee66335a3dbaa2bfdea927359b', true, '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.record_member_investment_scope(uuid,text,jsonb,integer,text)', '7b86465786374f3b1b1ee0fd757e497f', false, '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)', '3b5dd03da6ca1b27392aa70e33b2789f', true, '{postgres=X/postgres,authenticated=X/postgres}'),
    ('portfolio_private.record_snapshot(text,jsonb,text,text,integer)', '0c4a99cf3b3b07ba3b9e5474d539c418', true, '{postgres=X/postgres}')
  ) AS e(signature,definition_md5,security_definer,expected_acl)
  LOOP
    SELECT pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
      md5(pg_get_functiondef(p.oid)) AS definition_md5,p.proacl::text AS acl
      INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
    IF NOT FOUND OR actual.owner<>'postgres'
       OR actual.prosecdef IS DISTINCT FROM expected.security_definer
       OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
       OR actual.definition_md5 IS DISTINCT FROM expected.definition_md5
       OR actual.acl IS DISTINCT FROM expected.expected_acl THEN
      RAISE EXCEPTION 'rollback contract/owner/ACL drift: %',expected.signature;
    END IF;
  END LOOP;
END
$rollback_guard$;

REVOKE EXECUTE ON FUNCTION
  public.record_member_holdings(jsonb,text,text,integer),
  public.record_member_debts(jsonb,integer,text),
  public.record_member_investment_scope(uuid,text,jsonb,integer,text),
  portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)
FROM authenticated;

DO $rollback_postcondition$
DECLARE expected record; actual_acl text;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public.record_member_holdings(jsonb,text,text,integer)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('public.record_member_debts(jsonb,integer,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('public.record_member_investment_scope(uuid,text,jsonb,integer,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)', '{postgres=X/postgres}'),
    ('portfolio_private.record_snapshot(text,jsonb,text,text,integer)', '{postgres=X/postgres}')
  ) AS e(signature,prior_acl)
  LOOP
    SELECT proacl::text INTO actual_acl FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
    IF actual_acl IS DISTINCT FROM expected.prior_acl THEN
      RAISE EXCEPTION 'prior ACL not restored: %',expected.signature;
    END IF;
  END LOOP;
END
$rollback_postcondition$;
SELECT json_build_object('status','PASS','exactPriorFunctionAclsRestored',5,'financialHistoryChanged',0);
COMMIT;
