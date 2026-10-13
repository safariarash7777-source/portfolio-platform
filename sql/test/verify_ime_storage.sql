-- Read-only post-installation checks. No sample records or provider calls.
-- Run with psql -X -v ON_ERROR_STOP=1 -f sql/test/verify_ime_storage.sql.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE t text; r text; p text; s text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ime_certificate_history','ime_physical_trades'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'missing IME table: %', t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'RLS disabled: %', t;
    END IF;
    IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=('public.' || t)::regclass
        AND NOT tgisinternal AND tgenabled='O'
        AND tgfoid='public.reject_mutation_ime()'::regprocedure
        AND tgtype IN (27,34)) <> 2 THEN
      RAISE EXCEPTION 'IME mutation guards incomplete: %', t;
    END IF;
    s := pg_get_serial_sequence('public.' || t, 'id');
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF NOT has_table_privilege(r,'public.' || t,'SELECT')
        OR has_table_privilege(r,'public.' || t,'INSERT') <> (r='service_role') THEN
        RAISE EXCEPTION 'IME read/append grant mismatch: %, %', t, r;
      END IF;
      FOREACH p IN ARRAY ARRAY['UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] LOOP
        IF has_table_privilege(r,'public.' || t,p) THEN
          RAISE EXCEPTION 'unexpected IME privilege: %, %, %', t, r, p;
        END IF;
      END LOOP;
      IF has_sequence_privilege(r,s,'USAGE') <> (r='service_role')
        OR has_sequence_privilege(r,s,'UPDATE') OR has_sequence_privilege(r,s,'SELECT')
        OR has_function_privilege(r,'public.reject_mutation_ime()','EXECUTE') THEN
        RAISE EXCEPTION 'IME sequence/function privilege mismatch: %, %', t, r;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ime_physical_trades'::regclass
    AND contype='u' AND pg_get_constraintdef(oid) =
      'UNIQUE (trade_jdate, symbol_code, producer, price_close_rial, volume_contract)') THEN
    RAISE EXCEPTION 'IME existing conflict tuple changed';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.reject_mutation_ime()'::regprocedure) THEN
    RAISE EXCEPTION 'IME guard must remain SECURITY INVOKER';
  END IF;
END $$;
SELECT 'ime_storage_schema_acl_verified' AS result;
SELECT 'ime_certificate_history' AS relation, count(*) AS rows,
  max(trade_date)::text AS latest_trade_day, max(created_at) AS latest_receipt
  FROM public.ime_certificate_history
UNION ALL
SELECT 'ime_physical_trades', count(*), max(trade_jdate), max(created_at)
  FROM public.ime_physical_trades;
COMMIT;
