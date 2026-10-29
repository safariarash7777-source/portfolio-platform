-- START-B candidate only. Apply solely to an authorized isolated rehearsal/CI.
-- Production installation requires coordinator preflight, backup/restore and
-- writer-freeze acceptance. This file never re-grants workbook/review INSERT.
BEGIN;
CREATE TABLE IF NOT EXISTS public.research_workbook_save_intents (
  intent_id uuid PRIMARY KEY,
  workbook_id uuid NOT NULL,
  base_version integer NOT NULL CHECK (base_version >= 0 AND base_version < 2147483647),
  target_version integer NOT NULL CHECK (target_version = base_version + 1),
  request_body text NOT NULL CHECK (octet_length(request_body) <= 2000000),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_workbook_save_intents_actor_recent
  ON public.research_workbook_save_intents(created_by, created_at DESC, intent_id DESC);

CREATE OR REPLACE FUNCTION public.research_workbook_guard_intent()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE request jsonb; base numeric;
BEGIN
  NEW.created_by := auth.uid(); NEW.created_at := now();
  IF NEW.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=NEW.created_by AND p.role='admin') THEN
    RAISE EXCEPTION 'workbook intent author not authorized';
  END IF;
  request := NEW.request_body::jsonb;
  IF jsonb_typeof(request) IS DISTINCT FROM 'object' OR request->>'action' IS DISTINCT FROM 'save'
     OR jsonb_typeof(request->'workbook') IS DISTINCT FROM 'object'
     OR jsonb_typeof(request->'baseVersion') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid workbook intent';
  END IF;
  base := (request->>'baseVersion')::numeric;
  IF base < 0 OR base >= 2147483647 OR base <> trunc(base) THEN RAISE EXCEPTION 'invalid workbook intent'; END IF;
  NEW.workbook_id := (request->>'workbookId')::uuid;
  NEW.base_version := base::integer; NEW.target_version := NEW.base_version + 1;
  IF NEW.base_version = 0 THEN
    IF (request->>'creationId')::uuid IS DISTINCT FROM NEW.workbook_id THEN RAISE EXCEPTION 'invalid workbook creation identity'; END IF;
  ELSIF request ? 'creationId' THEN RAISE EXCEPTION 'invalid workbook creation identity'; END IF;
  NEW.title := btrim(request->'workbook'->>'title');
  NEW.request_hash := encode(sha256(convert_to(NEW.request_body,'UTF8')),'hex');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.research_workbook_guard_intent() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS research_workbook_save_intents_guard ON public.research_workbook_save_intents;
CREATE TRIGGER research_workbook_save_intents_guard BEFORE INSERT ON public.research_workbook_save_intents
  FOR EACH ROW EXECUTE FUNCTION public.research_workbook_guard_intent();
DROP TRIGGER IF EXISTS research_workbook_save_intents_immutable ON public.research_workbook_save_intents;
CREATE TRIGGER research_workbook_save_intents_immutable BEFORE UPDATE OR DELETE ON public.research_workbook_save_intents
  FOR EACH ROW EXECUTE FUNCTION public.research_workbook_deny_mutation();
DROP TRIGGER IF EXISTS research_workbook_save_intents_no_truncate ON public.research_workbook_save_intents;
CREATE TRIGGER research_workbook_save_intents_no_truncate BEFORE TRUNCATE ON public.research_workbook_save_intents
  FOR EACH STATEMENT EXECUTE FUNCTION public.research_workbook_deny_mutation();
ALTER TABLE public.research_workbook_save_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_workbook_save_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workbook_intent_actor_read ON public.research_workbook_save_intents;
CREATE POLICY workbook_intent_actor_read ON public.research_workbook_save_intents FOR SELECT TO authenticated
  USING (created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin'));
DROP POLICY IF EXISTS workbook_intent_actor_insert ON public.research_workbook_save_intents;
CREATE POLICY workbook_intent_actor_insert ON public.research_workbook_save_intents FOR INSERT TO authenticated
  WITH CHECK (created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin'));
REVOKE ALL ON TABLE public.research_workbook_save_intents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON TABLE public.research_workbook_save_intents TO authenticated;
GRANT SELECT ON TABLE public.research_workbook_save_intents TO service_role;
COMMIT;
