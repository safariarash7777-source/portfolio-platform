-- Safe emergency rollback: keep the role guard, identities, data and SELECT.
-- Stop client profile writes, including legacy column grants. No insecure down.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
DO $freeze$
DECLARE columns text; actor text; attribute text;
BEGIN
  SELECT string_agg(quote_ident(attname),',') INTO columns FROM pg_attribute
    WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',columns,columns);
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOR attribute IN SELECT attname FROM pg_attribute
      WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped LOOP
      IF has_column_privilege(actor,'public.profiles',attribute,'INSERT')
         OR has_column_privilege(actor,'public.profiles',attribute,'UPDATE') THEN
        RAISE EXCEPTION 'effective profile write privilege remains; review inherited grants';
      END IF;
    END LOOP;
  END LOOP;
END
$freeze$;
COMMIT;
