-- ISOLATED RESTORE ONLY. Run as postgres with psql -X -v ON_ERROR_STOP=1.
-- Uses synthetic users and rolls back every fixture. Never run on production.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN
    ('c9e8c77a-3c56-442c-a546-111111111111','c9e8c77a-3c56-442c-a546-222222222222')) THEN
    RAISE EXCEPTION 'fixture_identity_collision';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='research_agent_writer'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'writer_role_excess_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE
      -- PG17 also records the creator's admin-only grant (SET false) from
      -- supabase_admin. Neither grant may inherit; effective SET is checked below.
      (roleid='research_agent_writer'::regrole AND (member <> 'postgres'::regrole OR inherit_option))
      OR member='research_agent_writer'::regrole) THEN
    RAISE EXCEPTION 'writer_unexpected_membership';
  END IF;
  IF NOT pg_has_role('postgres','research_agent_writer','SET') THEN RAISE EXCEPTION 'bridge_cannot_set_writer'; END IF;
  IF has_table_privilege('anon','public.research_agent_drafts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('service_role','public.research_agent_drafts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated','public.research_agent_drafts','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('research_agent_writer','public.research_agent_drafts','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'unexpected_table_acl';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.research_agent_drafts'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'rls_not_forced';
  END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id) VALUES
 ('c9e8c77a-3c56-442c-a546-111111111111'),('c9e8c77a-3c56-442c-a546-222222222222');
INSERT INTO public.profiles(id,role) VALUES
 ('c9e8c77a-3c56-442c-a546-111111111111','user'),('c9e8c77a-3c56-442c-a546-222222222222','admin')
ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;

SET LOCAL ROLE research_agent_writer;
INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance) VALUES (
 repeat('a',64), 'synthetic-test',
 '{"summary":"Synthetic draft","claims":[{"kind":"FACT","text":"Synthetic","evidence":["E1"]}],"scenarios":[{"label":"base"},{"label":"upside"},{"label":"downside"}],"limitations":["Synthetic only"]}',
 '[{"evidence":"E1","symbol":"FIXTURE","reportId":"fixture-report","sourceUrl":"https://codal.ir/fixture","periodEnd":"1405-06-31","publishedAt":"2026-10-01T00:00:00Z"}]'
);
DO $$ DECLARE row_value public.research_agent_drafts%ROWTYPE; BEGIN
  SELECT * INTO STRICT row_value FROM public.research_agent_drafts WHERE input_digest=repeat('a',64);
  INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
    VALUES (repeat('c',64),row_value.model,row_value.body,jsonb_set(row_value.provenance,'{0,reportId}','123'::jsonb));
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
      VALUES (repeat('b',64),row_value.model,row_value.body,jsonb_set(row_value.provenance,'{0,reportId}','1.5'::jsonb));
    RAISE EXCEPTION 'fractional_report_id_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
      VALUES (row_value.input_digest,row_value.model,row_value.body,row_value.provenance);
    RAISE EXCEPTION 'duplicate_digest_accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.research_agent_drafts SET model='changed' WHERE id=row_value.id;
    RAISE EXCEPTION 'writer_update_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.research_agent_drafts WHERE id=row_value.id;
    RAISE EXCEPTION 'writer_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.research_agent_drafts;
    RAISE EXCEPTION 'writer_truncate_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,status,body,provenance)
      VALUES (repeat('b',64),row_value.model,'published',row_value.body,row_value.provenance);
    RAISE EXCEPTION 'published_status_accepted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
      VALUES (repeat('b',64),row_value.model,row_value.body||'{"published":true}',row_value.provenance);
    RAISE EXCEPTION 'extra_body_key_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
      VALUES (repeat('b',64),row_value.model,row_value.body,'[{"evidence":"E1"}]');
    RAISE EXCEPTION 'missing_provenance_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
      VALUES (repeat('b',64),row_value.model,jsonb_set(row_value.body,'{summary}',to_jsonb(repeat('x',65537))),row_value.provenance);
    RAISE EXCEPTION 'oversized_body_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.research_agent_drafts;
    RAISE EXCEPTION 'anon_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"c9e8c77a-3c56-442c-a546-111111111111","role":"authenticated","user_metadata":{"role":"admin"}}',true);
SELECT set_config('request.jwt.claim.sub','c9e8c77a-3c56-442c-a546-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.research_agent_drafts) THEN RAISE EXCEPTION 'member_can_read_drafts'; END IF;
  BEGIN
    INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance) VALUES (repeat('b',64),'test','{}','[]');
    RAISE EXCEPTION 'member_insert_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"c9e8c77a-3c56-442c-a546-222222222222","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','c9e8c77a-3c56-442c-a546-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.research_agent_drafts WHERE input_digest=repeat('a',64)) != 1 THEN
    RAISE EXCEPTION 'admin_cannot_read_fixture';
  END IF;
  BEGIN
    DELETE FROM public.research_agent_drafts WHERE input_digest=repeat('a',64);
    RAISE EXCEPTION 'admin_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'research_agent_drafts_acceptance_pass' AS result;
