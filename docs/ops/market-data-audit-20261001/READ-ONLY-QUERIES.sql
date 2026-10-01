-- Diagnostic queries only. Run independently against source and destination.
-- No credentials in this file. Dates/cutoffs below describe the Oct 1 audit.
begin read only;
set local timezone='UTC';
set local statement_timeout='60s';

select key,updated_at,payload->>'fetchedAt' as fetched_at,
       jsonb_array_length(payload->'stocks') as stocks,
       jsonb_array_length(payload->'funds') as funds
from public.ir_market_snapshots where key='latest';

select trade_date,count(*) as rows,count(distinct symbol) as symbols
from public.symbol_history where trade_date>='2026-09-15'
group by trade_date order by trade_date;

select captured_at::date as ingest_day,section,count(*) as rows
from public.ir_market_history where captured_at>='2026-09-20'
group by captured_at::date,section order by ingest_day,section;

-- Original source ID-set checks; new destination rows above cutoffs are excluded.
select 'symbol_history' as dataset,count(*) as rows,
       md5(string_agg(id::text,',' order by id)) as id_digest
from public.symbol_history where id<=5711547
union all
select 'codal_reports',count(*),md5(string_agg(id::text,',' order by id))
from public.codal_reports where id<=9439
union all
select 'ir_market_history',count(*),md5(string_agg(id::text,',' order by id))
from public.ir_market_history where id<=11236;

select report_kind,count(*) as rows,count(distinct symbol) as symbols
from public.codal_reports group by report_kind;

select count(distinct symbol) as recent_history_symbols
from public.symbol_history where trade_date>=current_date-30;

select table_name from information_schema.tables
where table_schema='public' and table_name like 'ime_%' order by table_name;
commit;
