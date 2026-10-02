"""Restore canonical SELECT privileges only in the owned synthetic sandbox.

terminal_t0.sql defines public anon/authenticated symbol_history read RLS;
archive/supabase_portfolio_versioning.sql defines authenticated self-read RLS.
Neither historical file installs table grants on vanilla PostgreSQL. No new
policy, DML permission, source change or real database connection is included.
"""
import subprocess, json, pathlib, time
root=pathlib.Path('/opt/portfolio-accept195')
db='portfolio-accept195-db'
label=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "codex.task"}}',db]).decode().strip()
assert label=='portfolio-accept195'
def sql(statement):
    return subprocess.check_output(['docker','exec','-i',db,'psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=statement.encode()).decode().strip()
policies="""SELECT json_build_object('tables',(SELECT json_agg(json_build_object('table',relname,'rls',relrowsecurity) ORDER BY relname) FROM pg_class WHERE oid IN ('public.symbol_history'::regclass,'public.portfolio_versions'::regclass)), 'policies',(SELECT json_agg(row_to_json(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('symbol_history','portfolio_versions')))"""
before=json.loads(sql(policies))
sql("BEGIN; GRANT SELECT ON public.symbol_history TO anon, authenticated, service_role; GRANT SELECT ON public.portfolio_versions TO authenticated, service_role; NOTIFY pgrst,'reload schema'; COMMIT;")
after=json.loads(sql(policies))
assert before==after, 'Unexpected policy change'
privileges=json.loads(sql("SELECT json_agg(json_build_object('role',r,'table',t,'select',has_table_privilege(r,t,'SELECT'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['public.symbol_history','public.portfolio_versions']) t"))
receipt={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':'portfolio-accept195','applicationSHA':'31c44ab635b672b589b7833bcbc78b41d36f1e75','status':'APPLIED_NATIVE_SANDBOX_ONLY','cause':'Historical schema relies on Supabase platform table grants; fresh vanilla PostgreSQL lacked two read privileges','privileges':privileges,'rlsPoliciesBefore':before,'rlsPoliciesAfter':after,'rlsUnchanged':before==after,'writePrivilegesAdded':False,'productSourceChanged':False,'productionChanged':False}
(root/'native-privilege-repair.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
