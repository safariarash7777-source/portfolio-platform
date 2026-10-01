-- PR #168 review fixes. Additive; NOT_APPLIED to staging/production in this task.
-- Requires phase35. Status-only updates preserve all prior action fields for both actors.
-- Research picker exposes only the latest approved version's title/id/number to a currently authorized advisor.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_consultation_action(p_relation uuid,p_action_key uuid,p_base integer,p_body jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prior public.consultation_actions; result uuid; s public.consultation_sessions; responsible uuid; is_advisor boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF p_action_key IS NULL OR p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM public.consultation_actions WHERE relationship_id=p_relation AND action_key=p_action_key ORDER BY version DESC LIMIT 1;
 IF coalesce(prior.version,0)<>p_base THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR coalesce(p_body->>'status','') NOT IN ('open','doing','done') THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 is_advisor=consultation_private.can_access(p_relation,true);
 IF NOT is_advisor OR NOT (p_body ?| ARRAY['title','session_id','responsible_id','due_on']) THEN
  IF prior.id IS NULL OR (NOT is_advisor AND prior.responsible_id<>auth.uid()) OR NOT consultation_private.published(prior.session_id) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION public.consultation_approved_research_versions(p_relation uuid)
RETURNS TABLE(id uuid,title text,version integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT consultation_private.can_access(p_relation,true) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT w.id,w.title,w.version FROM public.research_workbook_versions w
 WHERE NOT EXISTS (SELECT 1 FROM public.research_workbook_versions newer WHERE newer.workbook_id=w.workbook_id AND newer.version>w.version)
 AND (SELECT r.decision FROM public.research_workbook_reviews r WHERE r.version_id=w.id ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1)='approved_internal'
 ORDER BY w.created_at DESC,w.id;
END $$;
REVOKE ALL ON FUNCTION public.save_consultation_action(uuid,uuid,integer,jsonb),public.consultation_approved_research_versions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_consultation_action(uuid,uuid,integer,jsonb),public.consultation_approved_research_versions(uuid) TO authenticated;
COMMIT;
