-- Private deterministic monitoring receipts. Backup + isolated acceptance required.
-- Standalone repository SQL; repeat application preserves all receipts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='site_monitor_writer') THEN
    CREATE ROLE site_monitor_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='site_monitor_writer'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'existing_monitor_role_incompatible';
  END IF;
END $$;
GRANT site_monitor_writer TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public TO site_monitor_writer;
CREATE TABLE IF NOT EXISTS public.site_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL UNIQUE CHECK (length(btrim(run_key)) BETWEEN 1 AND 160),
  role text NOT NULL CHECK (role IN ('data_quality','site_monitor','coordinator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('ok','stale','failed','unknown')),
  report jsonb NOT NULL,
  CONSTRAINT site_agent_report_shape CHECK (
    octet_length(report::text) <= 65536
    AND jsonb_typeof(report) = 'object'
    AND report ?& ARRAY['summary','checks','actions']
    AND report - ARRAY['summary','checks','actions'] = '{}'::jsonb
    AND jsonb_typeof(report->'summary') = 'string'
    AND length(btrim(report->>'summary')) BETWEEN 1 AND 4000
    AND jsonb_typeof(report->'checks') = 'array'
    AND jsonb_array_length(report->'checks') <= 100
    AND jsonb_typeof(report->'actions') = 'array'
    AND jsonb_array_length(report->'actions') <= 30
  )
);
DO $$ BEGIN
  IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
      WHERE attrelid='public.site_agent_runs'::regclass AND attnum>0 AND NOT attisdropped)
      IS DISTINCT FROM ARRAY['id','run_key','role','created_at','status','report'] THEN
    RAISE EXCEPTION 'existing_monitor_table_incompatible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.site_agent_runs'::regclass
      AND conname='site_agent_report_shape' AND contype='c') THEN
    RAISE EXCEPTION 'existing_monitor_constraint_missing';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS site_agent_runs_role_created_idx ON public.site_agent_runs(role,created_at DESC,id);
ALTER TABLE public.site_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_agent_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_agent_runs FROM PUBLIC,anon,authenticated,service_role,site_monitor_writer;
GRANT SELECT ON public.site_agent_runs TO authenticated;
GRANT SELECT,INSERT ON public.site_agent_runs TO site_monitor_writer;
DROP POLICY IF EXISTS site_agent_runs_admin_read ON public.site_agent_runs;
CREATE POLICY site_agent_runs_admin_read ON public.site_agent_runs
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS site_agent_runs_worker_read ON public.site_agent_runs;
CREATE POLICY site_agent_runs_worker_read ON public.site_agent_runs
  FOR SELECT TO site_monitor_writer USING (true);
DROP POLICY IF EXISTS site_agent_runs_worker_append ON public.site_agent_runs;
CREATE POLICY site_agent_runs_worker_append ON public.site_agent_runs
  FOR INSERT TO site_monitor_writer WITH CHECK (role IN ('data_quality','site_monitor','coordinator'));
-- Neither the writer nor its credentials belong to authenticator or the model.
-- The reviewed fixed server worker uses SET ROLE to insert bounded receipts.
NOTIFY pgrst, 'reload schema';
COMMIT;
