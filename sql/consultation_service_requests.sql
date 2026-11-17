-- Additive, explicit binding of a legacy purchase/grant to an actual consultation item.
-- Existing entitlements keep their original duration and revocation rules.
BEGIN;
CREATE TABLE consultation_private.service_items (
  code text PRIMARY KEY CHECK (length(trim(code)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160)
);
CREATE TABLE consultation_private.service_rights (
  entitlement_id uuid PRIMARY KEY REFERENCES public.entitlements(id),
  item_code text NOT NULL REFERENCES consultation_private.service_items(code),
  request_limit integer NOT NULL CHECK (request_limit > 0)
);
CREATE TABLE consultation_private.service_requests (
  relationship_id uuid PRIMARY KEY REFERENCES public.consultation_relationships(id),
  entitlement_id uuid NOT NULL REFERENCES consultation_private.service_rights(entitlement_id),
  holdings_version_id uuid NOT NULL REFERENCES public.member_holding_versions(id),
  client_token uuid NOT NULL,
  UNIQUE(entitlement_id,client_token)
);
CREATE INDEX consultation_service_request_counts ON consultation_private.service_requests(entitlement_id);
REVOKE ALL ON consultation_private.service_items,consultation_private.service_rights,consultation_private.service_requests
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION consultation_private.current_service(p_relation uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM consultation_private.service_requests q
 JOIN public.entitlements e ON e.id=q.entitlement_id JOIN public.consultation_relationships r ON r.id=q.relationship_id
 WHERE r.id=p_relation AND e.user_id=r.client_id AND e.kind='consulting' AND e.revoked_at IS NULL
 AND now()>=e.starts_at AND now()<e.expires_at);
$$;

-- Current paid service and active explicit consent are both required for advisor access.
-- Members retain their own published history and the ability to revoke consent after expiry.
CREATE OR REPLACE FUNCTION consultation_private.access(r public.consultation_relationships,active boolean DEFAULT false,advisor_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (
  (r.client_id=auth.uid() AND NOT advisor_only AND (NOT active OR
     (consultation_private.current_service(r.id) AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id))))
  OR (r.advisor_id=auth.uid() AND consultation_private.current_service(r.id)
    AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id)
    AND EXISTS(SELECT FROM public.consultation_advisors a WHERE a.user_id=r.advisor_id AND a.enabled)));
$$;

CREATE FUNCTION public.open_consultation_service_request(p_actor uuid,p_entitlement uuid,p_token uuid,p_subject text,p_consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE actor uuid:=auth.uid(); e public.entitlements; allowed integer; prior uuid; basis_id uuid; advisor uuid; relation uuid;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501'; END IF;
 IF p_consent IS DISTINCT FROM true OR p_token IS NULL OR p_subject IS NULL OR length(trim(p_subject)) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.entitlements WHERE id=p_entitlement AND user_id=actor AND kind='consulting' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service unavailable' USING ERRCODE='42501'; END IF;
 SELECT q.relationship_id INTO prior FROM consultation_private.service_requests q WHERE q.entitlement_id=e.id AND client_token=p_token;
 IF FOUND THEN
   IF NOT EXISTS(SELECT FROM public.consultation_relationships WHERE id=prior AND client_id=actor AND client_label=trim(p_subject))
   THEN RAISE EXCEPTION 'attempt differs' USING ERRCODE='PT409'; END IF;
   RETURN prior;
 END IF;
 SELECT request_limit INTO allowed FROM consultation_private.service_rights WHERE entitlement_id=e.id FOR SHARE;
 IF NOT FOUND OR e.revoked_at IS NOT NULL OR now()<e.starts_at OR now()>=e.expires_at
 THEN RAISE EXCEPTION 'service unavailable' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM consultation_private.service_requests WHERE entitlement_id=e.id)>=allowed
 THEN RAISE EXCEPTION 'quota used' USING ERRCODE='PT409'; END IF;
 SELECT user_id INTO advisor FROM public.consultation_advisors WHERE enabled AND is_owner FOR SHARE;
 IF NOT FOUND OR advisor=actor THEN RAISE EXCEPTION 'advisor unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(actor::text));
 SELECT id INTO basis_id FROM public.member_holding_versions WHERE user_id=actor ORDER BY version DESC LIMIT 1;
 IF basis_id IS NULL THEN RAISE EXCEPTION 'financial file required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES(actor,advisor,trim(p_subject)) RETURNING id INTO relation;
 INSERT INTO consultation_private.service_requests VALUES(relation,e.id,basis_id,p_token);
 RETURN relation;
END $$;

CREATE FUNCTION public.read_consultation_services(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); offers jsonb; files jsonb;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',i.title,'starts',e.starts_at,'ends',e.expires_at,
   'remaining',greatest(0,s.request_limit-(SELECT count(*) FROM consultation_private.service_requests WHERE entitlement_id=e.id))) ORDER BY e.expires_at,e.id),'[]')
 INTO offers FROM consultation_private.service_rights s JOIN public.entitlements e ON e.id=s.entitlement_id
 JOIN consultation_private.service_items i ON i.code=s.item_code
 WHERE e.user_id=actor AND e.kind='consulting' AND e.revoked_at IS NULL AND now()>=e.starts_at AND now()<e.expires_at;
 SELECT coalesce(jsonb_agg(jsonb_build_object('relation',r.id,'subject',r.client_label,'title',i.title,'created',r.created_at,
  'token',CASE WHEN r.client_id=actor THEN q.client_token END,'basisId',h.id,'basisVersion',h.version,'active',consultation_private.current_service(r.id)
  AND NOT EXISTS(SELECT FROM public.consultation_revocations WHERE relationship_id=r.id)) ORDER BY r.created_at DESC,r.id),'[]')
 INTO files FROM consultation_private.service_requests q JOIN public.consultation_relationships r ON r.id=q.relationship_id
 JOIN consultation_private.service_rights s ON s.entitlement_id=q.entitlement_id JOIN consultation_private.service_items i ON i.code=s.item_code
 JOIN public.member_holding_versions h ON h.id=q.holdings_version_id AND h.user_id=r.client_id WHERE consultation_private.access(r);
 RETURN jsonb_build_object('actor',actor,'offers',offers,'requests',files);
END $$;

CREATE OR REPLACE FUNCTION public.command_consultation(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_request->'command'->>'kind'='grant' THEN RAISE EXCEPTION 'select an entitled service and consent' USING ERRCODE='42501'; END IF;
 RETURN consultation_private.execute(p_request);
END $$;

REVOKE ALL ON FUNCTION consultation_private.current_service(uuid),public.read_consultation_services(uuid),
 public.open_consultation_service_request(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_consultation_services(uuid),public.open_consultation_service_request(uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;
