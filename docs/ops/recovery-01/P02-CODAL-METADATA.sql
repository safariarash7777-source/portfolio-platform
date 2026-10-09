begin transaction isolation level repeatable read read only;
set local statement_timeout='25s';
set local timezone='UTC';
with wanted(symbol) as (values ('فولاد'),('فملی'),('وبملت'),('بپاس'),('شستا'))
select jsonb_build_object('kind','codalRepresentativeCoverage','observedAt',now(),'readOnly',current_setting('transaction_read_only'),'rows',jsonb_agg(t order by symbol,report_kind))
from (select w.symbol,r.report_kind,count(r.id) as stored_rows,count(r.id) filter(where r.data is not null) as parsed_rows,
 max(r.period_end) as newest_stored_period,max(r.captured_at) as latest_ingest,
 array_agg(distinct r.raw->>'parser_version') filter(where r.raw->>'parser_version' is not null) as parser_versions
 from wanted w left join public.codal_reports r on r.symbol=w.symbol group by w.symbol,r.report_kind) t;
with ranked as (select r.*,row_number() over(partition by symbol,report_kind order by period_end desc nulls last,id desc) as position
 from public.codal_reports r where symbol in ('فولاد','فملی','وبملت','بپاس','شستا'))
select jsonb_build_object('kind','codalRepresentativeDocuments','rows',jsonb_agg(jsonb_build_object('id',id,'symbol',symbol,'kind',report_kind,
 'periodEnd',period_end,'title',title,'sourceUrl',regexp_replace(source_url,'([?&](key|token|apikey|api_key|password)=)[^&#]*','\1[REDACTED]','gi'),
 'publishedAt',published_at,'sourcePublicationDate',raw->>'date_publish','sourcePublicationTime',raw->>'time_publish',
 'capturedAt',captured_at,'parserVersion',raw->>'parser_version','hasParsedData',data is not null,
 'audited',raw->'audited','periodMonths',raw->'period_months','dataKeys',case when jsonb_typeof(data)='object' then array(select jsonb_object_keys(data)) end,
 'hasStandalone',jsonb_typeof(data->'standalone')='object','hasConsolidated',jsonb_typeof(data->'consolidated')='object',
 'amountUnit',coalesce(data->>'amount_unit',data->>'unit',data->'standalone'->>'amount_unit')) order by symbol,report_kind,position))
from ranked where position<=3;
with ranked as (select f.*,row_number() over(partition by symbol order by sent_date desc nulls last,sent_time desc nulls last,id desc) as position
 from public.codal_feed f where symbol in ('فولاد','فملی','وبملت','بپاس','شستا'))
select jsonb_build_object('kind','codalRepresentativeFeed','rows',jsonb_agg(jsonb_build_object('id',id,'symbol',symbol,'title',title,'code',report_code,'category',category,
 'sentDate',sent_date,'sentTime',sent_time,'publishDate',publish_date,'createdAt',created_at,
 'link',regexp_replace(link,'([?&](key|token|apikey|api_key|password)=)[^&#]*','\1[REDACTED]','gi'),
 'excelPresent',nullif(link_excel,'') is not null,'pdfPresent',nullif(link_pdf,'') is not null) order by symbol,position)) from ranked where position<=3;
commit;
