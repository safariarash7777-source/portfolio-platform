-- P01-GRANT-02. Narrow reuse of phase23 section 1, only these two ledgers.
-- Capture their ACLs before installation. Preserve SELECT/INSERT/UPDATE/DELETE,
-- existing policies, triggers, records and RPC EXECUTE grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.payments, public.entitlements
  FROM PUBLIC, anon, authenticated, service_role;
DO $verify$
DECLARE actor text; ledger text;
BEGIN
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH ledger IN ARRAY ARRAY['payments', 'entitlements'] LOOP
      IF has_table_privilege(actor, 'public.' || ledger, 'TRUNCATE')
         OR has_table_privilege(actor, 'public.' || ledger, 'TRIGGER')
         OR has_table_privilege(actor, 'public.' || ledger, 'REFERENCES') THEN
        RAISE EXCEPTION 'effective unsafe ledger privilege remains; review inherited ACLs';
      END IF;
    END LOOP;
  END LOOP;
END
$verify$;
COMMIT;
