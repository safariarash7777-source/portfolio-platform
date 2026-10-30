BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT id, symbol, report_kind, period_end, captured_at, source_url, title,
       raw->>'parser_version' AS parser_version,
       raw->>'date_publish' AS date_publish,
       raw->>'time_publish' AS time_publish,
       data->>'period_end' AS financial_period_end,
       data->>'unit' AS amount_unit,
       data->>'unit_basis' AS amount_unit_basis
FROM public.codal_reports
WHERE symbol = 'فولاد'
  AND report_kind IN ('ن-۱۰', 'ن-۳۰')
  AND data IS NOT NULL
ORDER BY captured_at DESC, id DESC
LIMIT 6;
ROLLBACK;
