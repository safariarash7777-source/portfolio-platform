-- ISOLATED RESTORE ONLY, after applying the candidate twice to test repeat safety.
-- psql -X -v ON_ERROR_STOP=1; all synthetic fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN
    ('09eb4242-3c56-442c-a546-111111111111','09eb4242-3c56-442c-a546-222222222222')) THEN
    RAISE EXCEPTION 'fixture_identity_collision';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='site_monitor_writer'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'writer_excess_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE
      (roleid='site_monitor_writer'::regrole AND (member <> 'postgres'::regrole OR inherit_option))
      OR member='site_monitor_writer'::regrole) THEN
    RAISE EXCEPTION 'writer_unexpected_membership';
  END IF;
  IF NOT pg_has_role('postgres','site_monitor_writer','SET') THEN RAISE EXCEPTION 'bridge_cannot_set_writer'; END IF;
  IF has_table_privilege('anon','public.site_agent_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('service_role','public.site_agent_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated','public.site_agent_runs','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('site_monitor_writer','public.site_agent_runs','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'unexpected_table_acl';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.site_agent_runs'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'rls_not_forced';
  END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id) VALUES
 ('09eb4242-3c56-442c-a546-111111111111'),('09eb4242-3c56-442c-a546-222222222222');
INSERT INTO public.profiles(id,role) VALUES
 ('09eb4242-3c56-442c-a546-111111111111','user'),('09eb4242-3c56-442c-a546-222222222222','admin')
ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;

SET LOCAL ROLE site_monitor_writer;
INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES
 ('acceptance:site-monitor:data','data_quality','unknown','{"summary":"Synthetic only","checks":[],"actions":[]}'),
 ('acceptance:site-monitor:technical','site_monitor','ok','{"summary":"Synthetic only","checks":[],"actions":[]}'),
 ('acceptance:site-monitor:coordinator','coordinator','stale','{"summary":"Synthetic only","checks":[],"actions":[]}');
DO $$ DECLARE saved public.site_agent_runs%ROWTYPE; BEGIN
  SELECT * INTO STRICT saved FROM public.site_agent_runs WHERE run_key='acceptance:site-monitor:data';
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES (saved.run_key,saved.role,saved.status,saved.report);
    RAISE EXCEPTION 'duplicate_run_key_accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.site_agent_runs SET status='ok' WHERE id=saved.id;
    RAISE EXCEPTION 'writer_update_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.site_agent_runs WHERE id=saved.id;
    RAISE EXCEPTION 'writer_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.site_agent_runs;
    RAISE EXCEPTION 'writer_truncate_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad','customer_support','ok',saved.report);
    RAISE EXCEPTION 'invalid_role_accepted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad',saved.role,'running',saved.report);
    RAISE EXCEPTION 'invalid_status_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad',saved.role,saved.status,saved.report||'{"secret":"forbidden-extra-field"}');
    RAISE EXCEPTION 'extra_report_key_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad',saved.role,saved.status,saved.report-'checks');
    RAISE EXCEPTION 'missing_checks_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad',saved.role,saved.status,jsonb_set(saved.report,'{summary}',to_jsonb(repeat('x',65537))));
    RAISE EXCEPTION 'oversized_report_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad',saved.role,saved.status,jsonb_set(saved.report,'{summary}','null'));
    RAISE EXCEPTION 'null_summary_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.site_agent_runs;
    RAISE EXCEPTION 'anon_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"09eb4242-3c56-442c-a546-111111111111","role":"authenticated","user_metadata":{"role":"admin"}}',true);
SELECT set_config('request.jwt.claim.sub','09eb4242-3c56-442c-a546-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.site_agent_runs) THEN RAISE EXCEPTION 'member_can_read_reports'; END IF;
  BEGIN
    INSERT INTO public.site_agent_runs(run_key,role,status,report) VALUES ('acceptance:bad','data_quality','ok','{}');
    RAISE EXCEPTION 'member_insert_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"09eb4242-3c56-442c-a546-222222222222","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','09eb4242-3c56-442c-a546-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.site_agent_runs WHERE run_key LIKE 'acceptance:site-monitor:%') != 3 THEN
    RAISE EXCEPTION 'admin_cannot_read_fixtures';
  END IF;
  BEGIN
    DELETE FROM public.site_agent_runs WHERE run_key='acceptance:site-monitor:data';
    RAISE EXCEPTION 'admin_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'site_agent_runs_acceptance_pass' AS result;
