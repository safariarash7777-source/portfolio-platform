import './followup06-transport.mjs';
import fs from 'node:fs';import cp from 'node:child_process';import crypto from 'node:crypto';
const out='docs/ops/seasonal-program/followup-06-evidence/schema-installation.json', db='followup06_combined_schema';
const result={startedAt:new Date().toISOString(),applicationSHA:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),container:'liara-budget-test-followup06-20261001',database:db,
 environment:'isolated synthetic PostgreSQL 17; test Auth/Storage scaffolds, not real Auth/Storage provider',productionApplied:false,steps:[]};
function sql(query,database=db){return cp.execFileSync('psql',['-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function file(path){const bytes=fs.readFileSync(path),step={path,sha256InstalledBytes:crypto.createHash('sha256').update(bytes).digest('hex'),sha256LF:crypto.createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex')};
 try{cp.execFileSync('psql',['-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-f',path],{encoding:'utf8',stdio:['pipe','pipe','pipe']});step.status='APPLIED_SYNTHETIC_ONLY';}catch(e){step.status='FAIL';step.diagnostic=String(e.stderr??e).slice(-1800);result.steps.push(step);throw e;} result.steps.push(step);}
try{
 sql('DROP DATABASE IF EXISTS '+db,'postgres');sql('CREATE DATABASE '+db,'postgres');
 file('sql/test/supabase_bootstrap.sql');file('sql/test/profile_explicit_grants.sql');
 const scaffold=JSON.parse(fs.readFileSync('lib/seasonal/seasonal.integration.test.ts','utf8').match(/sql\(db,("(?:\\.|[^"\\])*")\);/)[1]);
 sql(scaffold);result.testPrerequisites='Exact NEXT04 test Auth contact/payments/audit/Storage scaffold; deliberately permissive Storage fixture is not real Storage acceptance';
 file('sql/test/portfolio_precondition.sql');
 for(const path of ['sql/phase8_webinars.sql','sql/phase11_access_tiers.sql','sql/phase27_member_import.sql','sql/phase32_member_holdings.sql','sql/phase34_research_workbook_versions.sql','sql/phase35_consultation.sql','sql/phase36_consultation_review_fixes.sql','sql/phase37_nonretryable_version_conflicts.sql','sql/phase38_personal_balance_sheet.sql','supabase/migrations/20260930182629_seasonal_course_membership.sql','supabase/migrations/20260930182918_research_publication_queue.sql','sql/phase28_brsapi_budget.sql'])file(path);
 result.postgres=sql('SELECT version()');
 result.publicTables=JSON.parse(sql("SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'"));
 result.functions=JSON.parse(sql("SELECT jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'securityDefiner',p.prosecdef,'PT409',strpos(p.prosrc,'PT409')>0,'40001',strpos(p.prosrc,'40001')>0) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_member_holdings','record_member_debts','save_consultation_session','save_consultation_action','publish_consultation_summary','seasonal_module_access','save_research_publication','brsapi_budget_lease')"));
 result.emptyFixtureCounts=JSON.parse(sql("SELECT jsonb_build_object('authUsers',(SELECT count(*) FROM auth.users),'holdingVersions',(SELECT count(*) FROM member_holding_versions),'courses',(SELECT count(*) FROM courses),'researchVersions',(SELECT count(*) FROM research_workbook_versions))"));
 result.status='PASS_COMBINED_SCHEMA_INSTALLATION_ONLY';
}catch(e){result.status='FAIL';result.error=String(e.stderr??e).slice(-1800);process.exitCode=1;}
result.finishedAt=new Date().toISOString();fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,steps:result.steps.length,error:result.error,empty:result.emptyFixtureCounts}));
