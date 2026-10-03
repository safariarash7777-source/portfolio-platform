-- P07 rollback precondition: run as the database owner BEFORE switching to an
-- older application binary. That binary does not understand the writer flag.
-- Phase34 must already exist. A missing table aborts the whole transaction.
-- Preserve SELECT grants, RLS, all bodies and review history. Re-running is safe.
-- Keep frozen until P00 verifies a compatible upgraded writer and authorizes
-- restoring its INSERT grants; do not re-run phase34 while frozen (it grants INSERT).
BEGIN;
REVOKE INSERT ON TABLE public.research_workbook_versions,
  public.research_workbook_reviews FROM PUBLIC, anon, authenticated;
COMMIT;
