-- P00/operator only, AFTER restoring the previous application/config.
-- Preserve all old and new histories. No DROP/TRUNCATE/DELETE/UPDATE.
-- Do not execute on the main DB before backup/restore proof + release manifest.
BEGIN;
DO $$
DECLARE signature text; target regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.record_member_holdings(jsonb,text,text,integer)',
  'public.record_member_debts(jsonb,integer,text)',
  'public.record_member_investment_scope(uuid,text,jsonb,integer,text)',
  'portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)'
 ] LOOP
  target:=to_regprocedure(signature);
  IF target IS NOT NULL THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',target); END IF;
 END LOOP;
END $$;
COMMIT;
