begin transaction read only;
set local statement_timeout='15s';
set local timezone='UTC';
with f as (select key, jsonb_object_keys(coalesce(payload->'fails','{}'::jsonb)) as url from public.ir_market_snapshots where key in ('codal_engine_state','codal_archive_state')),
t as (select f.key,c.symbol,count(distinct f.url) as failed_announcements from f join public.codal_feed c on c.link=f.url where c.symbol in ('فولاد','فملی','وبملت','بپاس','شستا') group by f.key,c.symbol)
select jsonb_build_object('kind','codalRepresentativeFailures','observedAt',now(),'rows',coalesce(jsonb_agg(t),'[]'::jsonb),'limitation','failure state stores counts, not reason') from t;
with wanted(symbol) as (values ('فولاد'),('فملی'),('وبملت'),('بپاس'),('شستا')),
f as (select s.key,e.key as url,e.value as failure_count from public.ir_market_snapshots s cross join lateral jsonb_each(coalesce(s.payload->'fails','{}'::jsonb)) e where s.key in ('codal_engine_state','codal_archive_state'))
select jsonb_build_object('kind','codalRepresentativeBlocked','rows',coalesce(jsonb_agg(t),'[]'::jsonb)) from (select f.key,c.symbol,count(distinct f.url) filter(where (f.failure_count#>>'{}')::numeric>=3) as blocked_announcements,max((f.failure_count#>>'{}')::numeric) as max_fail_count from f join public.codal_feed c on c.link=f.url join wanted w on w.symbol=c.symbol group by f.key,c.symbol) t;
commit;
