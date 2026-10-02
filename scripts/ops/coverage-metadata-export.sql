-- OPERATOR REVIEW ONLY; not executed by this package. No financial values.
-- Export with psql (complete result), not a capped PostgREST SELECT.
-- Parameters below are the observed interruption range, not a trading calendar.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT clock_timestamp() AS observed_at, current_database() AS database_name;

-- Actual rows and their source. Existence alone is not proof of official type=2.
SELECT symbol, trade_date, source, count(*) AS row_count,
       min(id) AS first_id, max(id) AS last_id
FROM public.symbol_history
WHERE trade_date BETWEEN DATE '2026-09-22' AND DATE '2026-09-30'
GROUP BY symbol, trade_date, source
ORDER BY symbol, trade_date, source;

-- Public identifiers only. Current membership is not historic trading evidence.
WITH snapshot AS (
  SELECT payload, updated_at FROM public.ir_market_snapshots WHERE key = 'latest'
), sections AS (
  SELECT s.updated_at, section, s.payload -> section AS entries
  FROM snapshot s CROSS JOIN (VALUES ('stocks'), ('funds')) q(section)
)
SELECT s.updated_at AS observed_at, s.section, x.entry ->> 'id' AS symbol
FROM sections s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.entries) = 'array' THEN s.entries ELSE '[]'::jsonb END
) x(entry)
ORDER BY section, symbol;

-- Preserve names/counts without exposing the old lastEmptySample.body.
SELECT key, updated_at,
       CASE WHEN key = 'nav_blacklist' THEN payload -> 'blacklist' END AS blacklist,
       CASE WHEN key = 'nav_blacklist' THEN payload -> 'failCounts' END AS fail_counts,
       CASE WHEN key = 'candle_backfill_state' THEN payload -> 'done' END AS legacy_done,
       CASE WHEN key = 'candle_backfill_state' THEN payload -> 'failed' END AS legacy_failed,
       CASE WHEN key = 'candle_backfill_state' THEN payload ->> 'reqDate' END AS legacy_req_date
FROM public.ir_market_snapshots
WHERE key IN ('nav_blacklist', 'candle_backfill_state');
COMMIT;
