-- CANDIDATE ONLY. Not installed; no destination DDL/GRANT authorization.
-- Extend the SAME append-only table/writer. No scheduler/global version change.
-- Invocation must be its own short transaction; do not wrap it with external work.
BEGIN;
CREATE SCHEMA codal_private;
REVOKE ALL ON SCHEMA codal_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA codal_private TO service_role;

-- Projection of legacy fields only; provenance enrichments cannot alter money,
-- product order, raw rates or quantities. Not a financial parser.
CREATE FUNCTION codal_private.reinterpret_legacy(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(key, codal_private.reinterpret_legacy(value)), '{}'::jsonb)
    INTO result FROM jsonb_each(p_value)
    WHERE key NOT IN ('quantity_source','quantity_witness','quantity_unit','quantity_status','quantity_reason','market_basis','qty_unit','market','unit_header','unit_inferred','period_months');
    RETURN result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT coalesce(jsonb_agg(codal_private.reinterpret_legacy(value) ORDER BY ordinal), '[]'::jsonb)
    INTO result FROM jsonb_array_elements(p_value) WITH ORDINALITY AS a(value,ordinal);
    RETURN result;
  END IF;
  RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION codal_private.reinterpret_legacy(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION codal_private.reinterpret_legacy(jsonb) TO service_role;

-- INSERT-only roles cannot request this lock mode. Encapsulate ONLY the lock,
-- rather than granting UPDATE/DELETE or making the data writer a definer.
CREATE FUNCTION codal_private.reinterpret_lock()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '1500ms' AS $$
BEGIN
  IF current_setting('role') <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  LOCK TABLE public.codal_reports IN SHARE ROW EXCLUSIVE MODE;
END $$;
REVOKE ALL ON FUNCTION codal_private.reinterpret_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION codal_private.reinterpret_lock() TO service_role;

CREATE FUNCTION public.codal_reinterpret_one(p_baseline jsonb, p_baseline_id bigint, p_candidate jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '1500ms' AS $$
DECLARE
  old public.codal_reports%ROWTYPE;
  prior public.codal_reports%ROWTYPE;
  stored public.codal_reports%ROWTYPE;
  actual jsonb;
  expected jsonb;
  lineage jsonb := p_candidate #> '{raw,reinterpretation}';
  capture jsonb := p_candidate #> '{raw,quantity_capture}';
  version integer;
  announcement text;
  operation text := lineage->>'operation';
BEGIN
  -- statement_timeout must be armed BEFORE the statement starts. SET inside a
  -- running function is not a reliable deadline for that same statement.
  IF current_setting('statement_timeout')::interval <= interval '0ms'
    OR current_setting('statement_timeout')::interval > interval '5s' THEN
    RAISE EXCEPTION 'pre-armed statement_timeout of at most 5 seconds required';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'single report requires read committed';
  END IF;
  IF jsonb_typeof(p_baseline) IS DISTINCT FROM 'array' OR jsonb_array_length(p_baseline) NOT BETWEEN 1 AND 500
    OR jsonb_typeof(p_candidate) IS DISTINCT FROM 'object'
    OR operation IS NULL OR operation NOT IN ('archive','restore')
    OR lineage->>'request_id' IS NULL OR lineage->>'request_id' !~ '^[a-f0-9-]{36}$'
    OR lineage->>'baseline_sha256' IS NULL OR lineage->>'baseline_sha256' !~ '^[a-f0-9]{64}$'
    OR p_candidate ? 'id' OR p_candidate ? 'captured_at' THEN
    RAISE EXCEPTION 'invalid single report request';
  END IF;
  -- This conflicts with ROW EXCLUSIVE acquired by ordinary INSERT too. Unlike
  -- advisory locks, every existing writer participates without caller changes.
  PERFORM codal_private.reinterpret_lock();
  SELECT * INTO old FROM public.codal_reports WHERE id = p_baseline_id;
  IF NOT FOUND OR old.report_kind <> 'ن-۳۰' OR old.data IS NULL OR old.period_end IS NULL THEN
    RAISE EXCEPTION 'baseline unavailable';
  END IF;
  announcement := old.raw->>'announcement_link';
  version := (p_candidate #>> '{raw,parser_version}')::integer;
  IF announcement IS NULL OR announcement !~ '^https://codal[.]ir/Reports/Decision[.]aspx[?]'
    OR old.source_url IS DISTINCT FROM announcement || '#pv' || (old.raw->>'parser_version')
    OR version IS NULL OR version NOT BETWEEN 3 AND 1000000 OR version <= (old.raw->>'parser_version')::integer
    OR p_candidate->>'source_url' IS DISTINCT FROM announcement || '#pv' || version
    OR (p_candidate - ARRAY['source_url','data','raw']) IS DISTINCT FROM (to_jsonb(old) - ARRAY['id','captured_at','source_url','data','raw'])
    OR (lineage->>'baseline_id')::bigint IS DISTINCT FROM old.id
    OR (lineage->>'baseline_version')::integer IS DISTINCT FROM (old.raw->>'parser_version')::integer
    OR ((p_candidate #> '{raw}') - ARRAY['parser_version','quantity_capture','reinterpretation'])
       IS DISTINCT FROM (old.raw - ARRAY['parser_version','quantity_capture','reinterpretation']) THEN
    RAISE EXCEPTION 'identity/version/publication mismatch';
  END IF;
  SELECT * INTO stored FROM public.codal_reports WHERE source_url = p_candidate->>'source_url';
  IF FOUND THEN
    IF (to_jsonb(stored) - ARRAY['id','captured_at']) IS DISTINCT FROM p_candidate THEN
      RAISE EXCEPTION 'version collision';
    END IF;
    RETURN to_jsonb(stored); -- exact idempotency, no second insertion
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id), '[]'::jsonb) INTO actual
    FROM public.codal_reports r WHERE symbol = old.symbol AND report_kind = old.report_kind AND period_end = old.period_end;
  SELECT jsonb_agg(value ORDER BY (value->>'id')::bigint) INTO expected FROM jsonb_array_elements(p_baseline);
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'baseline changed' USING ERRCODE = '40001'; END IF;
  IF EXISTS (SELECT 1 FROM public.codal_reports r WHERE r.raw->>'announcement_link' = announcement
    AND coalesce((r.raw->>'parser_version')::integer,1) >= version) THEN RAISE EXCEPTION 'version not advancing'; END IF;
  IF operation = 'archive' THEN
    IF codal_private.reinterpret_legacy(old.data) IS DISTINCT FROM codal_private.reinterpret_legacy(p_candidate->'data')
      OR old.raw->'period_months' IS DISTINCT FROM '1'::jsonb
      OR p_candidate #> '{data,period_months}' IS DISTINCT FROM '1'::jsonb
      OR capture IS NULL OR jsonb_typeof(capture) <> 'object'
      OR capture->>'symbol' IS DISTINCT FROM old.symbol
      OR capture->>'report_kind' IS DISTINCT FROM old.report_kind
      OR capture->>'announcement_link' IS DISTINCT FROM announcement
      OR capture->>'source_url' IS DISTINCT FROM p_candidate->>'source_url'
      OR (capture->>'parser_version')::integer IS DISTINCT FROM version
      OR capture->>'period_end_jalali' IS DISTINCT FROM old.raw->>'period_end_jalali'
      OR capture->>'link_excel' IS DISTINCT FROM old.raw->>'link_excel'
      OR capture->>'response_url' IS DISTINCT FROM old.raw->>'link_excel'
      OR capture->'source' IS DISTINCT FROM p_candidate #> '{data,quantity_source}'
      OR capture->>'html_sha256' IS NULL OR capture->>'html_sha256' !~ '^[a-f0-9]{64}$'
      OR capture->>'html_sha256' IS DISTINCT FROM lineage #>> '{archive,html_sha256}'
      OR lineage #>> '{archive,announcement_link}' IS DISTINCT FROM announcement
      OR lineage #>> '{archive,link_excel}' IS DISTINCT FROM old.raw->>'link_excel'
      OR lineage #>> '{archive,symbol}' IS DISTINCT FROM old.symbol
      OR lineage #>> '{archive,period_end_jalali}' IS DISTINCT FROM old.raw->>'period_end_jalali'
      OR nullif(lineage #>> '{archive,review_ref}', '') IS NULL
      OR lineage->'original_body_sha256' IS DISTINCT FROM coalesce(old.raw #> '{quantity_capture,html_sha256}', 'null'::jsonb)
    THEN RAISE EXCEPTION 'archive/legacy witness mismatch'; END IF;
  ELSE
    -- Forward restore: append the exact old interpretation at a newer version.
    -- Reusing an old quantity receipt would wrongly certify the new row: omit it.
    SELECT * INTO prior FROM public.codal_reports WHERE id = (lineage->>'restore_id')::bigint;
    IF NOT FOUND OR prior.raw->>'announcement_link' IS DISTINCT FROM announcement
      OR prior.symbol IS DISTINCT FROM old.symbol OR prior.period_end IS DISTINCT FROM old.period_end
      OR prior.report_kind IS DISTINCT FROM old.report_kind
      OR (prior.raw->>'parser_version')::integer >= (old.raw->>'parser_version')::integer
      OR p_candidate->'data' IS DISTINCT FROM prior.data
      OR p_candidate->'raw' ? 'quantity_capture'
      OR (prior.raw - ARRAY['parser_version','quantity_capture','reinterpretation'])
         IS DISTINCT FROM (old.raw - ARRAY['parser_version','quantity_capture','reinterpretation'])
    THEN RAISE EXCEPTION 'invalid forward restore'; END IF;
  END IF;
  INSERT INTO public.codal_reports(symbol,company_name,report_kind,period_end,title,source_url,published_at,data,raw)
    VALUES(old.symbol,old.company_name,old.report_kind,old.period_end,old.title,p_candidate->>'source_url',old.published_at,p_candidate->'data',p_candidate->'raw')
    RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END $$;
REVOKE ALL ON FUNCTION public.codal_reinterpret_one(jsonb,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.codal_reinterpret_one(jsonb,bigint,jsonb) TO service_role;
COMMIT;
