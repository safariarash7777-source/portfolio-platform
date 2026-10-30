-- Catalog only: no member rows, auth identities, function bodies or DDL.
-- Environment/container ownership must be established externally first.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'contract','start-a-catalog-preflight.v1',
 'observedAt',clock_timestamp(),
 'database',current_database(),
 'serverVersion',current_setting('server_version'),
 'readOnly',current_setting('transaction_read_only'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,
   'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forcedRls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY n.nspname,c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN('consultation_advisors','consultation_relationships','consultation_sessions',
    'consultation_actions','consultation_reply_versions','consultation_reply_receipts','entitlements')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text,
   'normalizedBodyMd5',md5(replace(p.prosrc,E'\r\n',E'\n'))) ORDER BY n.nspname,p.proname,p.oid)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND
    (n.nspname='consultation_private' OR (n.nspname='public' AND p.proname IN
     ('load_consultation','command_consultation','load_consultation_roster','load_consultation_replies','command_consultation_reply','fn_user_access')))),
 'feedbackConstraint',(SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid=to_regclass('public.consultation_actions') AND conname='consultation_actions_status_check'),
 'entitlementColumns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull) ORDER BY a.attnum)
   FROM pg_attribute a WHERE a.attrelid=to_regclass('public.entitlements') AND a.attnum>0 AND NOT a.attisdropped),
 'entitlementPolicyNames',(SELECT jsonb_agg(polname ORDER BY polname) FROM pg_policy WHERE polrelid=to_regclass('public.entitlements'))
);
COMMIT;
