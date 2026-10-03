begin transaction isolation level repeatable read read only;
set local statement_timeout='25s';
set local timezone='UTC';
with s as (select payload from public.ir_market_snapshots where key='latest'), f as (select r from s cross join lateral jsonb_array_elements(payload->'funds') r)
select jsonb_build_object('kind','fundNavCoverage','observedAt',now(),'readOnly',current_setting('transaction_read_only'),
 'fundRows',count(*),'navPresent',count(*) filter(where jsonb_typeof(r->'nav')='number'),
 'fullNavClock',count(*) filter(where nullif(r->>'navDate','') is not null and nullif(r->>'navTime','') is not null),
 'priceSourceClock',count(*) filter(where nullif(coalesce(r->>'sourceDate',r->>'date'),'') is not null and nullif(coalesce(r->>'sourceTime',r->>'time'),'') is not null),
 'blacklistedCurrentFunds',(select count(*) from f where r->>'id' in (select jsonb_array_elements_text(payload->'blacklist') from public.ir_market_snapshots where key='nav_blacklist')),
 'navDates',(select jsonb_agg(t) from (select r->>'navDate' as nav_date,r->>'navTime' as nav_time,r->>'navStatus' as nav_status,count(*) as rows from f where jsonb_typeof(r->'nav')='number' group by r->>'navDate',r->>'navTime',r->>'navStatus') t)) from f;
with s as (select payload from public.ir_market_snapshots where key='latest'), f as (select section,r from s cross join (values ('stocks'),('funds'),('gold'),('currency'),('crypto'),('options'),('imeCertificates')) k(section) cross join lateral jsonb_array_elements(case when jsonb_typeof(payload->section)='array' then payload->section else '[]'::jsonb end) r)
select jsonb_build_object('kind','rowClockAliases','rows',jsonb_agg(t)) from
(select section,count(*) as rows,count(*) filter(where nullif(coalesce(r->>'sourceDate',r->>'date'),'') is not null and nullif(coalesce(r->>'sourceTime',r->>'time'),'') is not null) as complete_alias_clock_rows,
 min(coalesce(r->>'sourceDate',r->>'date')) as min_date,max(coalesce(r->>'sourceDate',r->>'date')) as max_date from f group by section) t;
with s as (select payload from public.ir_market_snapshots where key='latest'), opts as (select r from s cross join lateral jsonb_array_elements(payload->'options') r)
select jsonb_build_object('kind','optionContractCoverage','rows',count(*),
 'unitPresent',count(*) filter(where nullif(r->>'unit','') is not null),
 'contractSizePresent',count(*) filter(where r ? 'contractSize' or r ? 'contract_size' or r ? 'size'),
 'expiryPresent',count(*) filter(where nullif(r->>'dateEnd','') is not null),
 'baseIdPresent',count(*) filter(where nullif(r->>'baseId','') is not null),
 'openInterestPresent',count(*) filter(where jsonb_typeof(r->'openInterest')='number'),
 'sampleMetadata',(select jsonb_agg(t) from (select r->>'id' as public_contract,r->>'baseId' as public_base,r->>'type' as option_type,r->>'dateEnd' as expiry,
 array(select jsonb_object_keys(r)) as keys from opts order by r->>'id' limit 3) t)) from opts;
select jsonb_build_object('kind','codalColumns','rows',jsonb_agg(jsonb_build_object('name',column_name,'type',data_type) order by ordinal_position)) from information_schema.columns where table_schema='public' and table_name='codal_reports';
select jsonb_build_object('kind','codalFeedColumns','rows',jsonb_agg(jsonb_build_object('name',column_name,'type',data_type) order by ordinal_position)) from information_schema.columns where table_schema='public' and table_name='codal_feed';
select jsonb_build_object('kind','codalState','rows',jsonb_agg(jsonb_build_object('key',key,'updatedAt',updated_at,'payloadKeys',array(select jsonb_object_keys(payload)),
 'failureCount',case when jsonb_typeof(payload->'fails')='object' then (select count(*) from jsonb_object_keys(payload->'fails')) end,
 'blockedCount',case when jsonb_typeof(payload->'blocked')='object' then (select count(*) from jsonb_object_keys(payload->'blocked')) end,
 'watermarkPresent',payload->'watermark' is not null))) from public.ir_market_snapshots where key in ('codal_engine_state','codal_archive_state');
commit;
