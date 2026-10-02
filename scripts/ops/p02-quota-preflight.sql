-- Catalog metadata only. No lease RPC, provider call, financial row or DDL.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
select jsonb_build_object(
  'observedAt', current_timestamp,
  'readOnly', current_setting('transaction_read_only'),
  'serverVersion', current_setting('server_version'),
  'counterExists', to_regclass('public.brsapi_budget_days') is not null,
  'leaseExists', to_regprocedure('public.brsapi_budget_lease(text,integer,integer)') is not null,
  'releaseExists', to_regprocedure('public.brsapi_budget_release(text,integer)') is not null
) as preflight;
select jsonb_build_object('role', rolname, 'bypassRls', rolbypassrls, 'superuser', rolsuper)
from pg_catalog.pg_roles where rolname in ('postgres','anon','authenticated','service_role');
select jsonb_build_object('table', c.relname, 'owner', r.rolname,
  'ownerBypassRls', r.rolbypassrls, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
join pg_catalog.pg_roles r on r.oid=c.relowner
where n.nspname='public' and c.relname='brsapi_budget_days';
select jsonb_build_object('table', c.relname, 'grantee', coalesce(r.rolname,'PUBLIC'), 'privilege', a.privilege_type)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
left join pg_catalog.pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relname='brsapi_budget_days';
select jsonb_build_object('function', p.oid::regprocedure::text, 'owner', owner_role.rolname,
  'ownerBypassRls', owner_role.rolbypassrls, 'securityDefiner', p.prosecdef, 'settings', p.proconfig,
  'grantee', coalesce(grantee.rolname,'PUBLIC'), 'privilege', a.privilege_type)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
join pg_catalog.pg_roles owner_role on owner_role.oid=p.proowner
cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
left join pg_catalog.pg_roles grantee on grantee.oid=a.grantee
where n.nspname='public' and p.proname in ('brsapi_budget_lease','brsapi_budget_release');
commit;
