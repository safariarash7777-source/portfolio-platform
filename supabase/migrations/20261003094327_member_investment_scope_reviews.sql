-- RECOVERY-01 section6. Additive metadata on the SAME canonical financial UUID.
-- Requires phase38; NOT_INSTALLED. P00 controls order, backup, restore and release.
BEGIN;
CREATE TABLE public.member_investment_scope_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 holding_version_id uuid NOT NULL REFERENCES public.member_holding_versions(id) ON DELETE RESTRICT,
 scope_version integer NOT NULL CHECK (scope_version > 0),
 rules_version text NOT NULL CHECK (rules_version='member-selected.v0.1'),
 member_confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 assignments jsonb NOT NULL CHECK (jsonb_typeof(assignments)='array' AND jsonb_array_length(assignments) BETWEEN 1 AND 500),
 client_token text NOT NULL CHECK (length(client_token) BETWEEN 1 AND 200),
 content_hash text NOT NULL,
 UNIQUE(holding_version_id,scope_version), UNIQUE(user_id,client_token)
);
COMMENT ON TABLE public.member_investment_scope_reviews IS 'Immutable owner-confirmed investment scope for an existing financial snapshot; not a parallel asset/debt ledger.';
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.member_investment_scope_reviews
 FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();
ALTER TABLE public.member_investment_scope_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_investment_scope_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_owner_read ON public.member_investment_scope_reviews FOR SELECT TO authenticated
 USING ((select auth.uid())=user_id AND public.owns_holding_version(holding_version_id));
REVOKE ALL ON TABLE public.member_investment_scope_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.member_investment_scope_reviews TO authenticated;

-- Isolated implementation schema: no new USAGE on existing portfolio_private.
CREATE SCHEMA portfolio_scope_private;
REVOKE ALL ON SCHEMA portfolio_scope_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA portfolio_scope_private TO authenticated;
CREATE FUNCTION portfolio_scope_private.record_review(p_holding_version_id uuid,p_rules_version text,p_assignments jsonb,p_base_scope_version integer,p_client_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); snapshot public.member_holding_versions;
 prior public.member_investment_scope_reviews; existing public.member_investment_scope_reviews;
 result public.member_investment_scope_reviews; normalized jsonb; fingerprint text;
 token text:=nullif(btrim(p_client_token),''); latest_financial_id uuid; reused boolean:=false;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'scope forbidden' USING ERRCODE='42501'; END IF;
 IF p_rules_version IS DISTINCT FROM 'member-selected.v0.1' OR p_base_scope_version IS NULL OR p_base_scope_version<0
  OR token IS NULL OR length(token)>200 OR p_assignments IS NULL OR jsonb_typeof(p_assignments)<>'array' THEN
  RAISE EXCEPTION 'invalid scope input' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_assignments) NOT BETWEEN 1 AND 500 OR octet_length(p_assignments::text)>1000000 THEN
  RAISE EXCEPTION 'invalid scope input' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_assignments) e WHERE jsonb_typeof(e)<>'object'
  OR jsonb_typeof(e->'positionKey') IS DISTINCT FROM 'string' OR length(btrim(e->>'positionKey')) NOT BETWEEN 1 AND 1000000
  OR jsonb_typeof(e->'use') IS DISTINCT FROM 'string' OR e->>'use' NOT IN ('allocatable','excluded')
  OR (e-'positionKey'-'use')<>'{}'::jsonb) THEN RAISE EXCEPTION 'invalid scope choice' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('positionKey',btrim(e->>'positionKey'),'use',e->>'use') ORDER BY btrim(e->>'positionKey')) INTO normalized FROM jsonb_array_elements(p_assignments) e;
 IF (SELECT count(DISTINCT e->>'positionKey') FROM jsonb_array_elements(normalized) e)<>jsonb_array_length(normalized) THEN
  RAISE EXCEPTION 'duplicate scope choice' USING ERRCODE='22023'; END IF;
 -- Serialize with both financial writers, preventing confirmation of a snapshot
 -- concurrently replaced by an asset/debt edit. No writer definition is changed.
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(owner_id::text));
 SELECT * INTO snapshot FROM public.member_holding_versions h WHERE h.id=p_holding_version_id AND h.user_id=owner_id;
 IF snapshot.id IS NULL THEN RAISE EXCEPTION 'scope forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS((SELECT e->>'positionKey' FROM jsonb_array_elements(normalized) e EXCEPT SELECT position_key FROM public.member_holding_positions WHERE version_id=snapshot.id)
  UNION ALL (SELECT position_key FROM public.member_holding_positions WHERE version_id=snapshot.id EXCEPT SELECT e->>'positionKey' FROM jsonb_array_elements(normalized) e)) THEN
  RAISE EXCEPTION 'incomplete scope choice' USING ERRCODE='22023'; END IF;
 fingerprint:=md5(jsonb_build_object('holding_version_id',snapshot.id,'rules_version',p_rules_version,'assignments',normalized)::text);
 SELECT * INTO existing FROM public.member_investment_scope_reviews r WHERE r.user_id=owner_id AND r.client_token=token;
 IF FOUND THEN
  IF existing.content_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'scope token conflict' USING ERRCODE='PT409'; END IF;
  result:=existing; reused:=true;
 ELSE
  SELECT id INTO latest_financial_id FROM public.member_holding_versions h WHERE h.user_id=owner_id ORDER BY h.version DESC LIMIT 1;
  IF latest_financial_id IS DISTINCT FROM snapshot.id THEN RAISE EXCEPTION 'financial version changed' USING ERRCODE='PT409'; END IF;
  SELECT * INTO prior FROM public.member_investment_scope_reviews r WHERE r.holding_version_id=snapshot.id ORDER BY r.scope_version DESC LIMIT 1;
  IF p_base_scope_version<>coalesce(prior.scope_version,0) THEN RAISE EXCEPTION 'scope version changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.member_investment_scope_reviews(user_id,holding_version_id,scope_version,rules_version,assignments,client_token,content_hash)
   VALUES(owner_id,snapshot.id,coalesce(prior.scope_version,0)+1,p_rules_version,normalized,token,fingerprint) RETURNING * INTO result;
 END IF;
 RETURN jsonb_build_object('id',result.id,'scopeVersion',result.scope_version,'holdingVersionId',snapshot.id,'holdingVersion',snapshot.version,
  'rulesVersion',result.rules_version,'memberConfirmedAt',result.member_confirmed_at,'assignments',result.assignments,'reused',reused);
END $$;
REVOKE ALL ON FUNCTION portfolio_scope_private.record_review(uuid,text,jsonb,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION portfolio_scope_private.record_review(uuid,text,jsonb,integer,text) TO authenticated;
CREATE FUNCTION public.record_member_investment_scope(p_holding_version_id uuid,p_rules_version text,p_assignments jsonb,p_base_scope_version integer,p_client_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT portfolio_scope_private.record_review(p_holding_version_id,p_rules_version,p_assignments,p_base_scope_version,p_client_token);
$$;
REVOKE ALL ON FUNCTION public.record_member_investment_scope(uuid,text,jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_member_investment_scope(uuid,text,jsonb,integer,text) TO authenticated;
COMMIT;
