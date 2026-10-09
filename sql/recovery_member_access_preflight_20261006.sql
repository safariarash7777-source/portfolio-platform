-- Read-only private operator snapshot. Schema/ACL only, no user or resource rows.
BEGIN;
SET TRANSACTION READ ONLY;
SELECT json_build_object(
  'tables', (SELECT json_agg(json_build_object('table', c.relname,
      'owner', pg_get_userbyid(c.relowner), 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity, 'acl', c.relacl))
    FROM pg_class c WHERE c.oid IN ('public.profiles'::regclass,
      'public.payments'::regclass, 'public.entitlements'::regclass)),
  'column_acls', (SELECT json_agg(json_build_object('table', c.relname,
      'column', a.attname, 'acl', a.attacl))
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    WHERE a.attrelid IN ('public.profiles'::regclass,'public.payments'::regclass,
      'public.entitlements'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
  'policies', (SELECT json_agg(row_to_json(p)) FROM pg_policies p
    WHERE schemaname='public' AND tablename IN ('profiles','payments','entitlements')),
  'triggers', (SELECT json_agg(json_build_object('table', c.relname,
      'name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid)))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgrelid IN ('public.profiles'::regclass,'public.payments'::regclass,
      'public.entitlements'::regclass) AND NOT t.tgisinternal),
  'functions', (SELECT json_agg(json_build_object('signature', p.oid::regprocedure::text,
      'acl', p.proacl, 'owner', pg_get_userbyid(p.proowner),
      'definition_digest', md5(pg_get_functiondef(p.oid))))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_admin','create_payment',
      'verify_payment','fail_payment','fn_user_access','recovery_guard_profile_role'))
);
ROLLBACK;
