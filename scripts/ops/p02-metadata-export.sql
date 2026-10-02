-- Explicit metadata allowlist. No price, customer, key, endpoint body or write.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL timezone = 'UTC';
SELECT jsonb_build_object('kind','header','observedAt',now(),
 'readOnly',current_setting('transaction_read_only'),
 'rangeStart','2026-09-22','rangeEnd','2026-10-02',
 'budgetTablePresent',to_regclass('public.brsapi_budget_days') IS NOT NULL,
 'budgetFunctions',(SELECT coalesce(jsonb_agg(proname ORDER BY proname),'[]'::jsonb)
  FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%brsapi%'));
SELECT jsonb_build_object('kind','historyCells','rows',coalesce(jsonb_agg(t ORDER BY symbol,day,source),'[]'::jsonb))
FROM (SELECT symbol,trade_date::text AS day,source,count(*) AS row_count,
 min(id) AS first_id,max(id) AS last_id,min(captured_at) AS first_captured_at,
 max(captured_at) AS last_captured_at,
 bool_and(raw->>'candle'='true') AS all_candle_marker,
 array_agg(DISTINCT raw->>'seriesType') FILTER (WHERE raw->>'seriesType' IS NOT NULL) AS explicit_series_types
 FROM public.symbol_history WHERE trade_date BETWEEN DATE '2026-09-22' AND DATE '2026-10-02'
 GROUP BY symbol,trade_date,source) t;
SELECT jsonb_build_object('kind','historyUniverse','rows',jsonb_agg(t ORDER BY symbol,source))
FROM (SELECT symbol,source,count(*) AS row_count,min(trade_date)::text AS first_day,
 max(trade_date)::text AS last_day FROM public.symbol_history GROUP BY symbol,source) t;
WITH snapshot AS (SELECT payload,updated_at FROM public.ir_market_snapshots WHERE key='latest'),
families AS (SELECT updated_at,payload->>'fetchedAt' AS fetched_at,section,payload->section AS entries
 FROM snapshot CROSS JOIN (VALUES ('stocks'),('funds'),('gold'),('currency'),('crypto'),('options'),('imeCertificates'),('commodities')) q(section))
SELECT jsonb_build_object('kind','snapshotUniverse','rows',coalesce(jsonb_agg(t ORDER BY section,symbol),'[]'::jsonb))
FROM (SELECT updated_at,fetched_at,section,entry->>'id' AS symbol,
 entry->>'unit' AS unit,entry->>'type' AS instrument_type,entry->>'industryId' AS industry_id,
 coalesce(entry->>'sourceDate',entry->>'date') AS source_date,
 coalesce(entry->>'sourceTime',entry->>'time') AS source_time,
 entry->>'navDate' AS nav_date,entry->>'navTime' AS nav_time,
 (entry->>'nav') IS NOT NULL AS nav_present,
 CASE WHEN jsonb_typeof(entry->'nav')='number' THEN (entry->>'nav')::numeric>0 END AS nav_positive,
 CASE WHEN jsonb_typeof(entry->'nav')='number' AND jsonb_typeof(entry->'price')='number'
  AND (entry->>'nav')::numeric>0 THEN (entry->>'price')::numeric/(entry->>'nav')::numeric BETWEEN 0.5 AND 2 END AS nav_ratio_plausible,
 CASE WHEN jsonb_typeof(entry->'volume')='number' THEN (entry->>'volume')::numeric>0 END AS volume_positive
 FROM families CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(entries)='array' THEN entries ELSE '[]'::jsonb END) x(entry)) t;
SELECT jsonb_build_object('kind','state','rows',coalesce(jsonb_agg(jsonb_build_object('key',key,'updated_at',updated_at,
 'blacklist',CASE WHEN key='nav_blacklist' THEN payload->'blacklist' END,
 'failCounts',CASE WHEN key='nav_blacklist' THEN payload->'failCounts' END,
 'done',CASE WHEN key='candle_backfill_state' THEN payload->'done' END,
 'failed',CASE WHEN key='candle_backfill_state' THEN payload->'failed' END,
 'reqDate',CASE WHEN key='candle_backfill_state' THEN payload->>'reqDate' END)
 ORDER BY key),'[]'::jsonb)) FROM public.ir_market_snapshots WHERE key IN ('nav_blacklist','candle_backfill_state');
SELECT jsonb_build_object('kind','families','snapshots',(SELECT jsonb_agg(jsonb_build_object(
 'key',key,'updated_at',updated_at,'indices_date',payload->'indices'->>'date',
 'indices_time',payload->'indices'->>'time','payloadKeys',ARRAY(SELECT jsonb_object_keys(payload))) ORDER BY key)
 FROM public.ir_market_snapshots WHERE key='latest'),
 'codal',(SELECT jsonb_agg(t) FROM (SELECT report_kind,count(*) AS rows,count(DISTINCT symbol) AS symbols,
 max(captured_at) AS latest_ingest FROM public.codal_reports GROUP BY report_kind) t),
 'marketHistory',(SELECT jsonb_agg(t) FROM (SELECT section,count(*) AS rows,max(captured_at) AS latest_ingest
 FROM public.ir_market_history GROUP BY section) t),
 'imeTables',(SELECT jsonb_agg(table_name) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ime_%'));
SELECT CASE WHEN to_regclass('public.brsapi_budget_days') IS NULL
 THEN $$SELECT jsonb_build_object('kind','budgetState','rows',NULL,'status','table_absent')$$
 ELSE $$SELECT jsonb_build_object('kind','budgetState','status','present',
 'rows',(SELECT jsonb_agg(jsonb_build_object('day_key',r->>'day_key','leased',r->'leased',
 'hard_ceiling',r->'hard_ceiling','usage_verified',r->'usage_verified',
 'baseline_note_present',r->>'baseline_note' IS NOT NULL,'updated_at',r->'updated_at'))
 FROM (SELECT to_jsonb(b) AS r FROM public.brsapi_budget_days b) t))$$ END
\gexec
COMMIT;
