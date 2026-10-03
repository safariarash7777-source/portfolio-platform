-- RECOVERY-01: preserve legacy rows, close admin-without-consent holdings access.
-- Independent of canonical financial schema; P00 installs after backup/restore proof.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='holdings' AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'Expected existing holdings with RLS enabled';
 END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='holdings') <> 2
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='holdings' AND policyname='hold_self_read' AND cmd='SELECT' AND permissive='PERMISSIVE')
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='holdings' AND policyname='hold_owner_write' AND cmd='ALL' AND permissive='PERMISSIVE') THEN
  RAISE EXCEPTION 'Holdings policy inventory changed; P00 must review before installation';
 END IF;
END $$;
ALTER POLICY hold_self_read ON public.holdings TO authenticated
 USING ((SELECT auth.uid()) = user_id);
ALTER POLICY hold_owner_write ON public.holdings TO authenticated
 USING ((SELECT auth.uid()) = user_id)
 WITH CHECK ((SELECT auth.uid()) = user_id);
-- TRUNCATE does not apply row policies. Preserve owner row DML, deny table-wide erase.
REVOKE TRUNCATE ON public.holdings FROM PUBLIC, anon, authenticated;
COMMIT;
-- Rollback: retain this privacy policy/ACL; restore prior application/config only.
-- Never restore the former is_admin() access or delete/update any financial row.
