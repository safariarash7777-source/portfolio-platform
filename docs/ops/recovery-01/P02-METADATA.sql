-- RECOVERY-01: counts, source/ingest clocks and scheduler metadata only.
-- No financial amounts, customer rows, job command bodies or provider calls.
begin transaction isolation level repeatable read read only;
set local statement_timeout='25s';
set local lock_timeout='2s';
set local timezone='UTC';
select jsonb_build_object('kind','header','observedAt',now(),'readOnly',current_setting('transaction_read_only'),
 'serverVersion',current_setting('server_version'),
 'budgetTablePresent',to_regclass('public.brsapi_budget_days') is not null,
 'budgetFunctions',(select coalesce(jsonb_agg(proname),'[]'::jsonb) from pg_proc where pronamespace='public'::regnamespace and proname like 'brsapi_budget_%'),
 'cronJobsPresent',to_regclass('cron.job') is not null,'cronRunsPresent',to_regclass('cron.job_run_details') is not null);
with s as (select updated_at,payload from public.ir_market_snapshots where key='latest'),
f as (select updated_at,payload->>'fetchedAt' as fetched_at,section,
 case when jsonb_typeof(payload->section)='array' then payload->section else '[]'::jsonb end as entries
 from s cross join (values ('stocks'),('funds'),('gold'),('currency'),('crypto'),('options'),('imeCertificates'),('commodities')) k(section))
select jsonb_build_object('kind','snapshot','rows',coalesce(jsonb_agg(t order by section),'[]'::jsonb))
from (select section,updated_at,fetched_at,jsonb_array_length(entries) as rows,
 (select count(*) from jsonb_array_elements(entries) r where nullif(r->>'sourceDate','') is null or nullif(r->>'sourceTime','') is null) as missing_source_clock_rows,
 (select min(r->>'sourceDate') from jsonb_array_elements(entries) r) as min_source_date,
 (select max(r->>'sourceDate') from jsonb_array_elements(entries) r) as max_source_date
 from f) t;
select jsonb_build_object('kind','symbolHistoryByDay','rows',coalesce(jsonb_agg(t order by trade_date),'[]'::jsonb))
from (select trade_date::text,count(*) as rows,count(distinct symbol) as symbols,max(captured_at) as latest_ingest
 from public.symbol_history where trade_date between date '2026-09-22' and (now() at time zone 'Asia/Tehran')::date group by trade_date) t;
select jsonb_build_object('kind','historyByFamily','rows',coalesce(jsonb_agg(t order by section),'[]'::jsonb))
from (select section,count(*) as rows,max(captured_at) as latest_ingest from public.ir_market_history group by section) t;
select jsonb_build_object('kind','codalByKind','rows',coalesce(jsonb_agg(t order by report_kind),'[]'::jsonb))
from (select report_kind,count(*) as rows,count(distinct symbol) as symbols,max(captured_at) as latest_ingest from public.codal_reports group by report_kind) t;
select jsonb_build_object('kind','snapshotAuxState','rows',coalesce(jsonb_agg(jsonb_build_object('key',key,'updatedAt',updated_at,
 'blacklistedCount',case when key='nav_blacklist' and jsonb_typeof(payload->'blacklist')='array' then jsonb_array_length(payload->'blacklist') end,
 'legacyBackfillDoneCount',case when key='candle_backfill_state' and jsonb_typeof(payload->'done')='array' then jsonb_array_length(payload->'done') end)),'[]'::jsonb))
from public.ir_market_snapshots where key in ('nav_blacklist','candle_backfill_state');
select jsonb_build_object('kind','marketTablePermissions','rows',jsonb_agg(jsonb_build_object('table',c.relname,
 'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'anonSelectGrant',has_table_privilege('anon',c.oid,'SELECT'),'serviceSelectGrant',has_table_privilege('service_role',c.oid,'SELECT'),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'roles',p.polroles)),'[]'::jsonb) from pg_policy p where p.polrelid=c.oid))))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('ir_market_snapshots','ir_market_history','symbol_history','codal_reports');
select case when to_regclass('cron.job') is null then $$select jsonb_build_object('kind','cronJobs','status','absent','rows',null)$$
else $$select jsonb_build_object('kind','cronJobs','rows',coalesce(jsonb_agg(jsonb_build_object('jobId',jobid,'schedule',schedule,'active',active,'database',database,
 'commandSha256NotAvailable',true,'commandMd5',md5(command),'taskClass',case when command ilike '%ir_market%' then 'market_history_or_snapshot' when command ilike '%symbol_history%' then 'symbol_history' when command ilike '%codal%' then 'codal' when command ilike '%brsapi%' then 'brsapi' else 'other_or_unknown' end)),'[]'::jsonb)) from cron.job$$ end
\gexec
select case when to_regclass('cron.job_run_details') is null then $$select jsonb_build_object('kind','cronLastRuns','status','absent','rows',null)$$
else $$select jsonb_build_object('kind','cronLastRuns','rows',coalesce(jsonb_agg(t),'[]'::jsonb)) from (select distinct on(jobid) jobid,runid,status,start_time,end_time,
 case when status='succeeded' then null when return_message ilike '%connect%' then 'connection_error' when return_message ilike '%permission%' then 'permission_error' when return_message ilike '%timeout%' then 'timeout' else 'unclassified_error_or_pending' end as error_class
 from cron.job_run_details order by jobid,runid desc) t$$ end
\gexec
commit;
