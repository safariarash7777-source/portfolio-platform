-- CLI scaffold: 20260930090909_consultation.sql (supabase migration new consultation).
-- D-032, approved 2026-09-30. NOT_APPLIED to production.
-- Prerequisites: auth/users/profiles, phase32 and phase34. No phase20/22 dependency.
-- Register Arash's verified auth UUID in consultation_advisors separately; no admin-wide access.
BEGIN;
CREATE SCHEMA IF NOT EXISTS consultation_private;
REVOKE ALL ON SCHEMA consultation_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA consultation_private TO authenticated;
CREATE TABLE IF NOT EXISTS public.consultation_advisors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id), display_name text NOT NULL CHECK (btrim(display_name) <> ''), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.consultation_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES auth.users(id),
  advisor_id uuid NOT NULL REFERENCES public.consultation_advisors(user_id), client_label text NOT NULL CHECK (length(client_label) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (client_id <> advisor_id)
);
CREATE TABLE IF NOT EXISTS public.consultation_revocations (
  relationship_id uuid PRIMARY KEY REFERENCES public.consultation_relationships(id), actor_id uuid NOT NULL REFERENCES auth.users(id), revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consultation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
  session_key uuid NOT NULL, version integer NOT NULL CHECK (version > 0), occurs_at timestamptz NOT NULL,
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 300), goal text NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
  client_summary text NOT NULL CHECK (length(client_summary) BETWEEN 1 AND 10000),
  holding_version_id uuid REFERENCES public.member_holding_versions(id), research_version_id uuid REFERENCES public.research_workbook_versions(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (relationship_id, session_key, version)
);
CREATE TABLE IF NOT EXISTS public.consultation_private_notes (
  session_id uuid PRIMARY KEY REFERENCES public.consultation_sessions(id), note text NOT NULL CHECK (length(note) <= 10000)
);
CREATE TABLE IF NOT EXISTS public.consultation_publications (
  session_id uuid PRIMARY KEY REFERENCES public.consultation_sessions(id), actor_id uuid NOT NULL REFERENCES auth.users(id), published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consultation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
  session_id uuid NOT NULL REFERENCES public.consultation_sessions(id), action_key uuid NOT NULL, version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 2000), responsible_id uuid NOT NULL REFERENCES auth.users(id), due_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('open','doing','done')), actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, action_key, version)
);
CREATE INDEX IF NOT EXISTS consultation_relation_client ON public.consultation_relationships(client_id);
CREATE INDEX IF NOT EXISTS consultation_relation_advisor ON public.consultation_relationships(advisor_id);
CREATE INDEX IF NOT EXISTS consultation_session_relation ON public.consultation_sessions(relationship_id);
CREATE INDEX IF NOT EXISTS consultation_action_relation ON public.consultation_actions(relationship_id);

-- Privileged helpers live in a non-exposed schema and always check the current identity.
CREATE OR REPLACE FUNCTION consultation_private.can_access(p_relation uuid, p_advisor_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.consultation_relationships r
  WHERE r.id=p_relation AND ((NOT p_advisor_only AND r.client_id=auth.uid()) OR
   (r.advisor_id=auth.uid() AND EXISTS (SELECT 1 FROM public.consultation_advisors a WHERE a.user_id=r.advisor_id AND a.enabled)
    AND NOT EXISTS (SELECT 1 FROM public.consultation_revocations v WHERE v.relationship_id=r.id)))
 );
$$;
CREATE OR REPLACE FUNCTION consultation_private.published(p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.consultation_sessions s JOIN public.consultation_publications p ON p.session_id=s.id
  WHERE s.id=p_session AND consultation_private.can_access(s.relationship_id)
 );
$$;
REVOKE ALL ON FUNCTION consultation_private.can_access(uuid,boolean), consultation_private.published(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consultation_private.can_access(uuid,boolean), consultation_private.published(uuid) TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['consultation_advisors','consultation_relationships','consultation_revocations','consultation_sessions','consultation_private_notes','consultation_publications','consultation_actions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['consultation_relationships','consultation_revocations','consultation_sessions','consultation_private_notes','consultation_publications','consultation_actions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS consultation_immutable ON public.%I',t);
  EXECUTE format('CREATE TRIGGER consultation_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.deny_mutation()',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS consultation_advisors_read ON public.consultation_advisors;
CREATE POLICY consultation_advisors_read ON public.consultation_advisors FOR SELECT TO authenticated USING (enabled OR user_id=auth.uid());
DROP POLICY IF EXISTS consultation_relation_read ON public.consultation_relationships;
CREATE POLICY consultation_relation_read ON public.consultation_relationships FOR SELECT TO authenticated USING (consultation_private.can_access(id));
DROP POLICY IF EXISTS consultation_revoke_read ON public.consultation_revocations;
CREATE POLICY consultation_revoke_read ON public.consultation_revocations FOR SELECT TO authenticated USING (consultation_private.can_access(relationship_id));
DROP POLICY IF EXISTS consultation_session_read ON public.consultation_sessions;
CREATE POLICY consultation_session_read ON public.consultation_sessions FOR SELECT TO authenticated USING
 (consultation_private.can_access(relationship_id,true) OR consultation_private.published(id));
DROP POLICY IF EXISTS consultation_note_read ON public.consultation_private_notes;
CREATE POLICY consultation_note_read ON public.consultation_private_notes FOR SELECT TO authenticated USING
 (EXISTS (SELECT 1 FROM public.consultation_sessions s WHERE s.id=session_id AND consultation_private.can_access(s.relationship_id,true)));
DROP POLICY IF EXISTS consultation_publication_read ON public.consultation_publications;
CREATE POLICY consultation_publication_read ON public.consultation_publications FOR SELECT TO authenticated USING (consultation_private.published(session_id));
DROP POLICY IF EXISTS consultation_action_read ON public.consultation_actions;
CREATE POLICY consultation_action_read ON public.consultation_actions FOR SELECT TO authenticated USING
 (consultation_private.can_access(relationship_id,true) OR consultation_private.published(session_id));

-- Clients explicitly grant their own file; admin status is never consulted.
CREATE OR REPLACE FUNCTION public.grant_consultation(p_advisor uuid, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.consultation_advisors WHERE user_id=p_advisor AND enabled) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_grant'),hashtext(auth.uid()::text));
 SELECT r.id INTO result FROM public.consultation_relationships r WHERE r.client_id=auth.uid() AND r.advisor_id=p_advisor AND NOT EXISTS (SELECT 1 FROM public.consultation_revocations v WHERE v.relationship_id=r.id);
 IF result IS NOT NULL THEN RETURN result; END IF;
 INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES(auth.uid(),p_advisor,btrim(p_label)) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.revoke_consultation(p_relation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO public.consultation_revocations(relationship_id,actor_id) VALUES(p_relation,auth.uid()) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.consultation_holding_versions(p_relation uuid)
RETURNS TABLE(id uuid,version integer,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT consultation_private.can_access(p_relation) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT h.id,h.version,h.created_at FROM public.member_holding_versions h JOIN public.consultation_relationships r ON r.client_id=h.user_id WHERE r.id=p_relation ORDER BY h.version DESC;
END $$;

CREATE OR REPLACE FUNCTION public.save_consultation_session(p_relation uuid, p_session_key uuid, p_base integer, p_body jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE next_version integer; result uuid; h uuid; research uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation,true) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF p_session_key IS NULL OR p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(version),0)+1 INTO next_version FROM public.consultation_sessions WHERE relationship_id=p_relation AND session_key=p_session_key;
 IF next_version<>p_base+1 THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='40001'; END IF;
 h=nullif(p_body->>'holding_version_id','')::uuid; research=nullif(p_body->>'research_version_id','')::uuid;
 IF h IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.member_holding_versions v JOIN public.consultation_relationships r ON r.client_id=v.user_id WHERE r.id=p_relation AND v.id=h) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF research IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.research_workbook_versions w WHERE w.id=research
   AND NOT EXISTS (SELECT 1 FROM public.research_workbook_versions newer WHERE newer.workbook_id=w.workbook_id AND newer.version>w.version)
   AND (SELECT r.decision FROM public.research_workbook_reviews r WHERE r.version_id=w.id ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1)='approved_internal'
 ) THEN RAISE EXCEPTION 'research not approved' USING ERRCODE='22023'; END IF;
 INSERT INTO public.consultation_sessions(relationship_id,session_key,version,occurs_at,topic,goal,client_summary,holding_version_id,research_version_id,actor_id)
 VALUES(p_relation,p_session_key,next_version,(p_body->>'occurs_at')::timestamptz,btrim(p_body->>'topic'),btrim(p_body->>'goal'),btrim(p_body->>'client_summary'),h,research,auth.uid()) RETURNING id INTO result;
 INSERT INTO public.consultation_private_notes(session_id,note) VALUES(result,coalesce(p_body->>'private_note',''));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.publish_consultation_session(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.consultation_sessions;
BEGIN
 SELECT * INTO s FROM public.consultation_sessions WHERE id=p_session;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(s.relationship_id::text));
 IF NOT consultation_private.can_access(s.relationship_id,true) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.consultation_sessions newer WHERE newer.relationship_id=s.relationship_id AND newer.session_key=s.session_key AND newer.version>s.version) THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='40001'; END IF;
 INSERT INTO public.consultation_publications(session_id,actor_id) VALUES(s.id,auth.uid()) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.save_consultation_action(p_relation uuid,p_action_key uuid,p_base integer,p_body jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prior public.consultation_actions; result uuid; s public.consultation_sessions; responsible uuid; is_advisor boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF p_action_key IS NULL OR p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM public.consultation_actions WHERE relationship_id=p_relation AND action_key=p_action_key ORDER BY version DESC LIMIT 1;
 IF coalesce(prior.version,0)<>p_base THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='40001'; END IF;
 is_advisor=consultation_private.can_access(p_relation,true);
 IF NOT is_advisor THEN
  IF prior.id IS NULL OR prior.responsible_id<>auth.uid() OR NOT consultation_private.published(prior.session_id) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.consultation_actions(relationship_id,session_id,action_key,version,title,responsible_id,due_on,status,actor_id)
  VALUES(p_relation,prior.session_id,p_action_key,p_base+1,prior.title,prior.responsible_id,prior.due_on,p_body->>'status',auth.uid()) RETURNING id INTO result;
 ELSE
  SELECT * INTO s FROM public.consultation_sessions WHERE id=(p_body->>'session_id')::uuid AND relationship_id=p_relation;
  IF s.id IS NULL OR NOT consultation_private.published(s.id) THEN RAISE EXCEPTION 'session not published' USING ERRCODE='22023'; END IF;
  responsible=(p_body->>'responsible_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.consultation_relationships WHERE id=p_relation AND responsible IN(client_id,advisor_id)) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.consultation_actions(relationship_id,session_id,action_key,version,title,responsible_id,due_on,status,actor_id)
  VALUES(p_relation,s.id,p_action_key,p_base+1,btrim(p_body->>'title'),responsible,(p_body->>'due_on')::date,p_body->>'status',auth.uid()) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.grant_consultation(uuid,text),public.revoke_consultation(uuid),public.consultation_holding_versions(uuid),public.save_consultation_session(uuid,uuid,integer,jsonb),public.publish_consultation_session(uuid),public.save_consultation_action(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grant_consultation(uuid,text),public.revoke_consultation(uuid),public.consultation_holding_versions(uuid),public.save_consultation_session(uuid,uuid,integer,jsonb),public.publish_consultation_session(uuid),public.save_consultation_action(uuid,uuid,integer,jsonb) TO authenticated;
COMMIT;
