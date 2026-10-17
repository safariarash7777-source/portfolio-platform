// Catalog and aggregate counts only. No row identifiers, amounts, URLs or secrets.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? '../../../m2-installed-evidence-20261017');
const sql = `BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='1s';
SELECT jsonb_build_object('section','catalog','captured_at',now(),
 'server_version',current_setting('server_version'),'read_only',current_setting('transaction_read_only'),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull)
     ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition_hash',md5(pg_get_constraintdef(con.oid)))) FROM pg_constraint con WHERE con.conrelid=c.oid),
   'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition_hash',md5(pg_get_triggerdef(t.oid)))) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
   'effective_acl',(SELECT jsonb_agg(jsonb_build_object('role',r,'select',has_table_privilege(r,c.oid,'SELECT'),'insert',has_table_privilege(r,c.oid,'INSERT'),'update',has_table_privilege(r,c.oid,'UPDATE'),'delete',has_table_privilege(r,c.oid,'DELETE'),'truncate',has_table_privilege(r,c.oid,'TRUNCATE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r)
 ) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN ('webinars','webinar_registrations','webinar_payment_attempts','payments','profiles','entitlements','audit_log')),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),
   'using_hash',md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'check_hash',md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))) ORDER BY c.relname,p.polname),'[]'::jsonb)
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('webinars','webinar_registrations','webinar_payment_attempts','payments','profiles','entitlements')),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
  'config',p.proconfig,'definition_hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_agg(jsonb_build_object('role',r,'execute',has_function_privilege(r,p.oid,'EXECUTE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r)) ORDER BY p.proname),'[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'm2_%' OR p.proname IN ('is_admin','fn_user_access','verify_payment','fail_payment','register_for_webinar','list_public_webinars','webinar_access','prepare_webinar_payment','attach_webinar_payment','mark_webinar_payment_unknown','read_webinar_payment_context','settle_webinar_payment','reject_webinar_payment','create_payment','payments_guard','fn_entitlements_guard'))),
 'schema_usage',(SELECT jsonb_agg(jsonb_build_object('role',r,'public_usage',has_schema_privilege(r,'public','USAGE'),'public_create',has_schema_privilege(r,'public','CREATE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r),
 'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text)),'[]'::jsonb) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'inherit',rolinherit,'superuser',rolsuper,'bypass_rls',rolbypassrls)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres'))
)::text;
SELECT format('SELECT jsonb_build_object(''section'',''aggregate'',''table'',%L,''rows'',count(*))::text FROM public.%I;',c.relname,c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN ('webinars','webinar_registrations','webinar_payment_attempts','payments','entitlements')
\u005cgexec
SELECT 'SELECT jsonb_build_object(''section'',''registration_status_counts'',''pending'',count(*) FILTER(WHERE payment_status=''pending''),''paid'',count(*) FILTER(WHERE payment_status=''paid''),''free'',count(*) FILTER(WHERE payment_status=''free''),''refunded'',count(*) FILTER(WHERE payment_status=''refunded''),''other'',count(*) FILTER(WHERE payment_status IS NULL OR payment_status NOT IN (''pending'',''paid'',''free'',''refunded'')))::text FROM public.webinar_registrations;' WHERE to_regclass('public.webinar_registrations') IS NOT NULL
\u005cgexec
ROLLBACK;
`;
const result = spawnSync('ssh', ['-i','C:/Users/Asus/.ssh/codex-liara-portfolio','-o','BatchMode=yes','-o','ConnectTimeout=10','root@62.60.191.24',
 'docker exec -i portfolio-stage-db-1 psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres'],
 { input: sql, encoding:'utf8', timeout:45000, maxBuffer:4*1024*1024 });
if (result.status!==0) throw new Error('Read-only snapshot failed: '+(result.stderr || result.error?.message || result.status));
const sections=result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
if(sections[0]?.read_only!=='on') throw new Error('Snapshot read-only attestation missing');
mkdirSync(output,{recursive:true});
const receipt={capturedAt:new Date().toISOString(),mode:'READ_ONLY_CATALOG_AND_AGGREGATES',target:'attested primary portfolio-stage-db-1/postgres',
 sqlSHA256:createHash('sha256').update(sql).digest('hex'),statementTimeout:'10s',lockTimeout:'1s',transactionEnd:'ROLLBACK',sections};
writeFileSync(path.join(output,'installed-snapshot.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({receipt:path.join(output,'installed-snapshot.json'),version:sections[0].server_version,counts:sections.filter(x=>x.section!=='catalog'),
 installedM2Table:sections[0].tables.some(t=>t.name==='webinar_payment_attempts'),installedM2Functions:sections[0].functions.filter(f=>/m2_|webinar_access|settle_webinar_payment/.test(f.signature)).map(f=>f.signature)}));
